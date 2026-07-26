// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { SessionKeyExecutor } from "../src/SessionKeyExecutor.sol";
import { DeskRegistry } from "../src/DeskRegistry.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev A Stock Token whose transfer() always reverts — simulates a paused / blacklisting /
///      transfer-restricted RWA token that must never be able to brick redeemInKind.
contract RevertingOnTransfer is ERC20 {
    constructor() ERC20("Blacklist Token", "BLK") { }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert("blacklisted");
    }
}

/// @notice Regression tests for the audit HIGH findings:
///   H1 — a trade's realized fill is bounded to the ORACLE price, independent of the
///        caller's `minAmountOut`, so a compromised manager can't bleed the vault via a
///        bad/attacker-controlled fill. Applies to buys AND sells.
///   H2 — a single stale/missing feed on a zero-balance (or dust) token can't brick
///        `navUsdg()` and therefore the whole ERC-4626 deposit/withdraw surface.
contract HardeningTest is Test {
    MockERC20 usdg;
    MockERC20 stk;
    MockERC20 other; // a second allowlisted token we never actually buy
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    RWAVault vault;

    address HUMAN = address(0xB00D);
    address MANAGER = address(0x1234);
    address ALICE = address(0xA11CE);
    address BOB = address(0xB0B);

    uint256 constant PRICE = 50e18;

    function _caps() internal pure returns (Guardrails.RiskCaps memory) {
        return Guardrails.RiskCaps({
            perTradeBps: 1500,
            maxConcentrationBps: 2500,
            maxOpenPositions: 6,
            maxDailyOrders: 4,
            stopLossBps: 800,
            dailyLossHaltBps: 500,
            cashBufferBps: 1000
        });
    }

    function setUp() public {
        usdg = new MockERC20("USD Global", "USDG");
        stk = new MockERC20("Demo Stock Token", "dSTK");
        other = new MockERC20("Other Stock Token", "oSTK");
        oracle = new MockOracle();
        oracle.setPrice(address(stk), PRICE);
        oracle.setPrice(address(other), PRICE);
        adapter = new MockSwapAdapter(oracle);
        cfg = new GuardrailConfig(HUMAN, _caps());

        vault = new RWAVault(
            IERC20(address(usdg)),
            "Aelix RWA Vault",
            "vRWA",
            HUMAN,
            cfg,
            IPriceOracle(address(oracle)),
            ISwapAdapter(address(adapter)),
            MANAGER
        );

        vm.startPrank(HUMAN);
        vault.allowToken(address(stk));
        vault.allowToken(address(other));
        vm.stopPrank();

        usdg.mint(address(adapter), 1_000_000e18);
        stk.mint(address(adapter), 1_000_000e18);

        usdg.mint(ALICE, 100e18);
        vm.startPrank(ALICE);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(100e18, ALICE);
        vm.stopPrank();

        vm.warp(2_000_000_000);
    }

    function _buy(uint256 amountIn) internal returns (uint256) {
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: amountIn,
            minAmountOut: 0,
            stopPriceE18: PRICE * 94 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        return vault.executeTrade(o);
    }

    function _sell(uint256 amountIn) internal returns (uint256) {
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: false,
            amountIn: amountIn,
            minAmountOut: 0,
            stopPriceE18: 0,
            leftSideException: false
        });
        vm.prank(MANAGER);
        return vault.executeTrade(o);
    }

    // ───────────────────────── H1 — execution price is oracle-bounded ─────────────────────────

    function test_default_execSlippage_is_2pct() public view {
        assertEq(cfg.maxExecSlippageBps(), 200);
    }

    /// A fill within tolerance (1% haircut < 2% cap) is fine even with minAmountOut = 0.
    function test_buy_withinTolerance_ok() public {
        adapter.setSlippage(100); // 1%
        uint256 out = _buy(10e18);
        assertGt(out, 0);
    }

    /// The KEY fix: a bad fill (3% > 2% cap) reverts, even though minAmountOut = 0
    /// would have let it through the old code. The agent can't self-authorize the loss.
    function test_buy_badFill_reverts_despiteZeroMinOut() public {
        adapter.setSlippage(300); // 3%
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 94 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.ExecSlippage.selector);
        vault.executeTrade(o);
    }

    /// H1 fix: a MODERATE de-risking sell (10% under oracle — an ordinary gap-down)
    /// must NOT be trapped. Under the old single 2% bound applied to sells this reverted;
    /// now sells use the wider tolerance so exiting is never blocked in normal conditions.
    function test_sell_moderateFill_passes_afterH1() public {
        adapter.setSlippage(0);
        _buy(10e18); // acquire a position to sell (buy at oracle price)
        uint256 held = stk.balanceOf(address(vault));
        assertGt(held, 0);

        adapter.setSlippage(400); // 4% out — inside the tightened 5% sell tolerance
        vm.prank(MANAGER);
        uint256 out =
            vault.executeTrade(RWAVault.TradeOrder(address(stk), false, held, 0, 0, false));
        assertGt(out, 0); // sell cleared, capital not trapped
    }

    /// ...but a CATASTROPHIC sell fill (30% under oracle) still reverts — the anti-drain
    /// guarantee survives for egregious/attacker fills.
    function test_sell_catastrophicFill_reverts() public {
        adapter.setSlippage(0);
        _buy(10e18);
        uint256 held = stk.balanceOf(address(vault));

        adapter.setSlippage(3000); // 30% out — beyond the 15% sell tolerance
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.ExecSlippage.selector);
        vault.executeTrade(RWAVault.TradeOrder(address(stk), false, held, 0, 0, false));
    }

    /// Sell tolerance is owner-set and wider than the buy tolerance by default.
    function test_sellSlippage_default_and_ownerOnly() public {
        assertEq(cfg.maxSellSlippageBps(), 500); // tightened default (audit HIGH #2/#3)
        assertGt(cfg.maxSellSlippageBps(), cfg.maxExecSlippageBps());
        vm.prank(MANAGER);
        vm.expectRevert(GuardrailConfig.NotOwner.selector);
        cfg.setSellSlippageBps(700);
        vm.prank(HUMAN);
        cfg.setSellSlippageBps(700);
        assertEq(cfg.maxSellSlippageBps(), 700);
        // ...and even the owner cannot re-open the old wide drain surface (7% ceiling).
        vm.prank(HUMAN);
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setSellSlippageBps(701);
    }

    /// Owner can tighten the bound; agent (manager) cannot touch it.
    function test_execSlippage_ownerOnly() public {
        vm.prank(MANAGER);
        vm.expectRevert(GuardrailConfig.NotOwner.selector);
        cfg.setExecSlippageBps(50);

        vm.prank(HUMAN);
        cfg.setExecSlippageBps(50); // tighten to 0.5%
        assertEq(cfg.maxExecSlippageBps(), 50);

        adapter.setSlippage(100); // 1% now exceeds the 0.5% cap
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 94 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.ExecSlippage.selector);
        vault.executeTrade(o);
    }

    function test_execSlippage_cannotBeNeutered() public {
        vm.startPrank(HUMAN);
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setExecSlippageBps(0); // no bound => rejected
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setExecSlippageBps(6000); // > 50% => rejected
        vm.stopPrank();
    }

    // ────────── H1b (audit HIGH): aggregate per-day sell cap bounds a compromised key ──────────

    /// The per-fill exec bound is a fill-QUALITY guard, not a sizing cap. This test proves
    /// the added AGGREGATE cap: a compromised manager cannot dump more than 50% of NAV in
    /// sell notional per day — even with every fill inside the per-fill bound. De-risking
    /// within the cap still clears, and the aggregate resets the next day.
    function test_dailySellCap_blocksBookDump_butResetsNextDay() public {
        _buy(15e18); // 0.3 stk @ 50 = 15 USDG; NAV stays 100
        oracle.setPrice(address(stk), 500e18); // position now 0.3*500 = 150 USDG; NAV 235
        // Daily sell cap = 50% * 235 = 117.5 USDG; dumping the whole 0.3 stk (150) exceeds it.
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.DailySellCap.selector);
        vault.executeTrade(RWAVault.TradeOrder(address(stk), false, 0.3e18, 0, 0, false));

        // A sell within the cap clears (100 USDG < 117.5)...
        _sell(0.2e18);
        // ...but one that pushes the day's cumulative over the cap reverts (100 + 25 > 117.5).
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.DailySellCap.selector);
        vault.executeTrade(RWAVault.TradeOrder(address(stk), false, 0.05e18, 0, 0, false));

        // Next day the aggregate resets, so the same de-risking sell clears.
        vm.warp(block.timestamp + 1 days);
        uint256 out = _sell(0.05e18);
        assertGt(out, 0);
        assertEq(vault.soldTodayUsdg(), 25e18); // fresh day: only this sell counted
    }

    /// The cap bounds the AGENT, never the depositor: even with the day's cap fully spent,
    /// redeemInKind still exits in-kind — capital is never trapped.
    function test_dailySellCap_doesNotTrap_redeemInKind() public {
        _buy(15e18);
        oracle.setPrice(address(stk), 500e18);
        vm.prank(MANAGER); // the agent's book-dump is blocked
        vm.expectRevert(RWAVault.DailySellCap.selector);
        vault.executeTrade(RWAVault.TradeOrder(address(stk), false, 0.3e18, 0, 0, false));

        uint256 shares = vault.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.redeemInKind(shares, ALICE); // the holder still exits fully
        assertEq(vault.balanceOf(ALICE), 0);
        assertGt(stk.balanceOf(ALICE), 0); // received the stock leg pro-rata
    }

    /// The daily sell cap is owner-only and bounded to [25%, 100%]; the agent can't touch it.
    function test_dailySellCap_ownerOnly_andBounded() public {
        assertEq(cfg.maxDailySellBps(), 5000);
        vm.prank(MANAGER);
        vm.expectRevert(GuardrailConfig.NotOwner.selector);
        cfg.setDailySellBps(3000);
        vm.startPrank(HUMAN);
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setDailySellBps(2000); // below the 25% floor => rejected (would trap capital)
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setDailySellBps(11000); // above 100% => rejected
        cfg.setDailySellBps(3000); // 30% ok
        assertEq(cfg.maxDailySellBps(), 3000);
        vm.stopPrank();
    }

    /// M-1 (audit MEDIUM): a single transfer-restricted Stock Token must not brick the
    /// always-solvent exit — the reverting leg is skipped, the holder still gets cash and
    /// every transferable token, and the restricted token stays in the vault.
    function test_redeemInKind_skipsRestrictedToken_neverBricks() public {
        RevertingOnTransfer bad = new RevertingOnTransfer();
        oracle.setPrice(address(bad), PRICE);
        vm.prank(HUMAN);
        vault.allowToken(address(bad));
        bad.mint(address(vault), 1e18); // vault now holds a restricted token

        uint256 usdgBefore = usdg.balanceOf(ALICE);
        uint256 shares = vault.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.redeemInKind(shares, ALICE); // MUST NOT revert despite the bad leg
        assertEq(vault.balanceOf(ALICE), 0);
        assertGt(usdg.balanceOf(ALICE), usdgBefore); // cash leg delivered
        assertEq(bad.balanceOf(ALICE), 0); // restricted leg skipped...
        assertEq(bad.balanceOf(address(vault)), 1e18); // ...and stays in the vault
    }

    // ──────────── H1c (audit HIGH #4): ERC-4626 inflation attack is defeated ────────────

    /// The classic first-depositor / donation inflation attack: an attacker front-runs into
    /// an EMPTY vault with 1 wei, donates a large amount to spike the share price, then the
    /// victim's deposit rounds to ~0 shares and the attacker redeems the lot. The 1e6 decimals
    /// offset defeats it: the victim still gets fair shares and recovers ~their whole deposit,
    /// and the attacker cannot profit (they forfeit their donation).
    function test_inflationAttack_firstDepositor_defeated() public {
        GuardrailConfig cfg2 = new GuardrailConfig(HUMAN, _caps());
        RWAVault v = new RWAVault(
            IERC20(address(usdg)), "V", "V", HUMAN, cfg2,
            IPriceOracle(address(oracle)), ISwapAdapter(address(adapter)), MANAGER
        );
        address ATTACKER = address(0xA77ACC);
        address VICTIM = address(0x7C71);
        usdg.mint(ATTACKER, 2_000e18);
        usdg.mint(VICTIM, 1_000e18);

        // 1) Attacker front-runs the empty vault with the smallest possible deposit...
        vm.startPrank(ATTACKER);
        usdg.approve(address(v), type(uint256).max);
        v.deposit(1, ATTACKER);
        // 2) ...then donates straight into the vault to spike the share price.
        usdg.transfer(address(v), 1_000e18);
        vm.stopPrank();

        // 3) Victim deposits 1,000 USDG.
        vm.startPrank(VICTIM);
        usdg.approve(address(v), type(uint256).max);
        uint256 vShares = v.deposit(1_000e18, VICTIM);
        vm.stopPrank();

        // Victim's shares do NOT round to zero, and their claim is ~the full deposit.
        assertGt(vShares, 0);
        assertGe(v.convertToAssets(vShares), 999e18); // recovers >99.9% of the 1,000 deposited

        // Attacker cannot walk away with the victim's deposit: their redeemable value is far
        // below what they put in (1 wei + 1,000 donation) — the attack is a LOSS, not theft.
        assertLt(v.convertToAssets(v.balanceOf(ATTACKER)), 1_000e18);
    }

    // ──────────── H1d (audit HIGH #1): exit fee defeats the oracle-lag round-trip arb ────────────

    /// The exit fee makes a deposit -> redeemInKind round-trip a guaranteed LOSS (the fee), so
    /// the oracle-lag arbitrage — mint shares at a stale-low NAV, then extract real pro-rata
    /// assets — cannot profit on a small mispricing. The retained fee stays for the LPs.
    function test_exitFee_defeats_depositRedeemRoundTripArb() public {
        // setUp funded ALICE with a 100e18 deposit (all cash). BOB round-trips deposit->redeem.
        usdg.mint(BOB, 100e18);
        vm.startPrank(BOB);
        usdg.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(100e18, BOB);
        uint256 before = usdg.balanceOf(BOB);
        vault.redeemInKind(shares, BOB);
        vm.stopPrank();
        uint256 back = usdg.balanceOf(BOB) - before;
        assertLt(back, 100e18); // round-trip is a loss (the 0.2% exit fee) -> arb defeated
        assertGe(back, 99e18); // but the fee is small, not punitive to honest redeemers
    }

    // ───────────────────────── H2 — one bad feed can't brick the vault ─────────────────────────

    /// A zero-balance allowlisted token whose feed has died is skipped in NAV, so
    /// deposits/withdrawals keep working. (Old code priced every allowlisted token.)
    function test_nav_resilient_to_deadFeed_on_zeroBalance_token() public {
        oracle.setRevert(address(other), true); // `other` feed dies; vault holds 0 of it

        // NAV still readable, deposits/withdrawals still work.
        uint256 nav = vault.navUsdg();
        assertEq(nav, 100e18);

        usdg.mint(ALICE, 10e18);
        vm.startPrank(ALICE);
        vault.deposit(10e18, ALICE);
        vault.withdraw(5e18, ALICE, ALICE);
        vm.stopPrank();
    }

    /// H2 fix: a 1-wei DUST donation of an allowlisted token whose feed is dead must not
    /// brick NAV. positionValue now fails OPEN (excludes the leg) for ANY balance, not just
    /// an exactly-zero one, so the whole vault surface keeps working. (Old code priced the
    /// 1-wei leg and reverted, re-bricking deposits/withdrawals.)
    function test_nav_resilient_to_deadFeed_dustDonation() public {
        other.mint(address(vault), 1); // permissionless dust donation
        oracle.setRevert(address(other), true); // its feed dies

        assertEq(vault.navUsdg(), 100e18); // NAV readable; dust leg excluded

        usdg.mint(ALICE, 10e18);
        vm.startPrank(ALICE);
        vault.deposit(10e18, ALICE); // still works
        vault.withdraw(5e18, ALICE, ALICE);
        vm.stopPrank();
    }

    /// H2 (BROKEN→fixed): when a token the vault ACTUALLY holds (cost basis > 0) loses its
    /// feed, the share-priced paths fail CLOSED — a depositor can't mint cheap shares
    /// against an understated NAV and extract the gap via redeemInKind (the mint-side theft
    /// the naive fail-open opened). The oracle-free in-kind exit stays open for everyone.
    function test_materialDeadFeed_failsClosed_butRedeemInKindOpen() public {
        _buy(15e18); // real stk position (cost basis > 0), within the 15% per-trade cap
        oracle.setRevert(address(stk), true); // its feed dies

        // Attacker deposit reverts — cannot mint against an understated NAV.
        usdg.mint(BOB, 40e18);
        vm.startPrank(BOB);
        usdg.approve(address(vault), type(uint256).max);
        vm.expectRevert(RWAVault.FeedDown.selector);
        vault.deposit(40e18, BOB);
        vm.stopPrank();

        // Standard withdraw also fails closed (can't value the book).
        vm.prank(ALICE);
        vm.expectRevert(RWAVault.FeedDown.selector);
        vault.withdraw(1e18, ALICE, ALICE);

        // ...but the always-solvent in-kind exit still works (raw balances, no oracle).
        uint256 shares = vault.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.redeemInKind(shares, ALICE);
        assertEq(vault.balanceOf(ALICE), 0);
        assertGt(stk.balanceOf(ALICE), 0); // got the real Stock Token slice
    }

    /// A token can't be allowlisted before it has a working price feed.
    function test_allowToken_requiresFeed() public {
        MockERC20 noFeed = new MockERC20("No Feed", "nFEED");
        oracle.setRevert(address(noFeed), true);
        vm.prank(HUMAN);
        vm.expectRevert(MockOracle.FeedDown.selector);
        vault.allowToken(address(noFeed));
    }

    /// redeemInKind is the always-solvent exit and uses raw balances only — it must
    /// keep working even when an oracle feed is down.
    function test_redeemInKind_worksWhenFeedDown() public {
        vm.prank(HUMAN);
        cfg.setExitFeeBps(0); // isolate the feed-down exit path from the exit fee
        oracle.setRevert(address(other), true);
        uint256 shares = vault.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.redeemInKind(shares, ALICE);
        assertEq(vault.balanceOf(ALICE), 0);
        assertEq(usdg.balanceOf(ALICE), 100e18); // got all cash back (no stock held yet)
    }

    // ───────────────────────── MEDIUM — Pausable circuit breaker ─────────────────────────

    function test_pause_blocksDeposit_butNotWithdraw() public {
        vm.prank(HUMAN);
        vault.pause();
        assertEq(vault.maxDeposit(ALICE), 0);

        usdg.mint(ALICE, 10e18);
        vm.startPrank(ALICE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(10e18, ALICE);
        vault.withdraw(5e18, ALICE, ALICE); // exit stays open while paused
        vm.stopPrank();

        vm.prank(HUMAN);
        vault.unpause();
        vm.prank(ALICE);
        vault.deposit(10e18, ALICE); // works again once unpaused
    }

    function test_pause_blocksTrading_ownerOnly() public {
        vm.prank(MANAGER);
        vm.expectRevert(); // Ownable: not owner
        vault.pause();

        vm.prank(HUMAN);
        vault.pause();
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 94 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.executeTrade(o);

        // QW fix: preview agrees with execute on the paused state (no false "None").
        assertEq(uint256(vault.previewTrade(o)), uint256(Guardrails.Violation.Paused));
    }

    // ─────────────────────── MEDIUM — daily halt counts overnight gaps (M1) ───────────────────────

    function test_halt_countsOvernightGap() public {
        _buy(10e18); // day 1: position on; lastNav ~100 recorded
        vm.warp(block.timestamp + 1 days); // next day
        oracle.setPrice(address(stk), PRICE * 40 / 100); // book gaps down overnight (~-6%)

        // Baseline carries yesterday's NAV (not the post-gap value), so the halt latches...
        vault.latchHalt();
        assertEq(vault.haltedDay(), block.timestamp / 1 days);

        // ...and a fresh buy today is blocked. (Old code re-based to the gapped NAV → no halt.)
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 1e18,
            minAmountOut: 0,
            stopPriceE18: 18e18,
            leftSideException: false
        });
        assertEq(uint256(vault.previewTrade(o)), uint256(Guardrails.Violation.DailyLossHalt));
    }

    /// M1 (BROKEN→fixed): a deposit AFTER the baseline is set must NOT defeat the halt.
    /// Setup: day-1 buy (position 15), roll day, BOB deposits 10, then the book crashes.
    /// Absolute NAV (101) stays ABOVE day-1's stored NAV (100) — so the OLD code saw a
    /// "gain" and never halted. The per-share baseline sees the true −12.5%/share loss.
    function test_halt_survivesDepositInflation() public {
        vm.prank(MANAGER);
        vault.executeTrade(
            RWAVault.TradeOrder(address(stk), true, 15e18, 0, PRICE * 94 / 100, false)
        );
        vm.warp(block.timestamp + 1 days); // roll day → dayStartPps = day-1 pps (1e18)

        usdg.mint(BOB, 10e18); // a fresh deposit inflates absolute NAV
        vm.startPrank(BOB);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(10e18, BOB);
        vm.stopPrank();

        oracle.setPrice(address(stk), PRICE * 40 / 100); // position 15 → 6, a real −9 loss

        // navUsdg ≈ 101 > 100 (old stored NAV) yet the per-share halt fires.
        vault.latchHalt();
        assertEq(vault.haltedDay(), block.timestamp / 1 days);
        RWAVault.TradeOrder memory buy =
            RWAVault.TradeOrder(address(stk), true, 1e18, 0, 18e18, false);
        assertEq(uint256(vault.previewTrade(buy)), uint256(Guardrails.Violation.DailyLossHalt));
    }

    /// M1 (other direction): a large ordinary redemption must NOT spuriously trip the halt.
    /// A fair-value exit leaves per-share value unchanged, so no loss is recorded. (The OLD
    /// absolute baseline saw the shrunken NAV as a huge "loss" and wrongly halted.)
    function test_halt_notTrippedByRedemption() public {
        _buy(10e18);
        vm.warp(block.timestamp + 1 days);

        uint256 half = vault.balanceOf(ALICE) / 2;
        vm.prank(ALICE);
        vault.redeem(half, ALICE, ALICE); // fair-value exit; pps unchanged

        RWAVault.TradeOrder memory buy =
            RWAVault.TradeOrder(address(stk), true, 1e18, 0, PRICE * 94 / 100, false);
        assertEq(uint256(vault.previewTrade(buy)), uint256(Guardrails.Violation.None));
    }

    function test_vault_ownership_isTwoStep() public {
        address NEW = address(0xBEEF);
        vm.prank(HUMAN);
        vault.transferOwnership(NEW);
        assertEq(vault.owner(), HUMAN); // not transferred yet
        assertEq(vault.pendingOwner(), NEW);
        vm.prank(NEW);
        vault.acceptOwnership();
        assertEq(vault.owner(), NEW);
    }

    // ─────────────────────── MEDIUM — session re-grant clears stale scope (M3) ───────────────────────

    function test_session_regrant_clearsStaleTokenScope() public {
        SessionKeyExecutor exec = new SessionKeyExecutor(vault, HUMAN);
        address AGENT = address(0xA9E7);
        address[] memory two = new address[](2);
        two[0] = address(stk);
        two[1] = address(other);
        address[] memory one = new address[](1);
        one[0] = address(stk);

        vm.startPrank(HUMAN);
        vault.setManager(address(exec));
        exec.grantSession(
            AGENT, uint64(block.timestamp + 7 days), 1000e18, 10, 100_000e18, true, true, two
        );
        vm.stopPrank();
        assertTrue(exec.tokenAllowed(AGENT, address(other)));

        // Re-grant a NARROWER scope; `other` must no longer be in scope.
        vm.prank(HUMAN);
        exec.grantSession(
            AGENT, uint64(block.timestamp + 7 days), 1000e18, 10, 100_000e18, true, true, one
        );
        assertFalse(exec.tokenAllowed(AGENT, address(other)));
        assertTrue(exec.tokenAllowed(AGENT, address(stk)));

        // A real trade on the stale token is rejected by the executor.
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(other),
            isBuy: true,
            amountIn: 1e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 94 / 100,
            leftSideException: false
        });
        vm.prank(AGENT);
        vm.expectRevert(SessionKeyExecutor.TokenNotInSession.selector);
        exec.trade(o);
    }

    // ─────────────────────── MEDIUM — attestSelf can't be squatted (M6) ───────────────────────

    function test_attestSelf_cannotBeSquatted() public {
        DeskRegistry reg = new DeskRegistry();
        bytes32 label = keccak256("aelix-vault:0xVAULT");
        address VICTIM = address(0x1111);
        address ATTACKER = address(0x2222);
        bytes32 subj = reg.subjectFor(VICTIM, label);

        // Attacker front-runs, claiming the victim's derived subject via RAW attest.
        vm.prank(ATTACKER);
        reg.attest(subj, 1, 999e18, 0, bytes32(0), ""); // lands in the raw namespace only

        // Victim still owns its squat-proof self-subject, and its record wins on read.
        vm.prank(VICTIM);
        reg.attestSelf(label, 1, 100e18, 0, bytes32(0), "");
        assertEq(reg.selfAttesterOf(subj), VICTIM);
        assertEq(reg.count(subj), 1);
        assertEq(reg.latest(subj).nav, 100e18); // victim's, not the attacker's 999e18
    }

    /// M6 (WEAK→fixed): the cross-namespace read-fallback is gone. A desk can no longer
    /// hide raw history by self-attesting once to flip which namespace answers — canonical
    /// reads resolve strictly to the self-log, and raw stays in its own visible namespace.
    function test_selfLog_doesNotFallBackToRaw() public {
        DeskRegistry reg = new DeskRegistry();
        bytes32 label = keccak256("desk-A");
        address DESK = address(0xDEE5);
        bytes32 subj = reg.subjectFor(DESK, label);

        vm.startPrank(DESK);
        reg.attest(subj, 1, 100e18, 0, bytes32(0), ""); // real -80% disaster, raw namespace
        reg.attest(subj, 2, 20e18, 0, bytes32(0), "");
        reg.attestSelf(label, 1, 100e18, 0, bytes32(0), ""); // clean number, self namespace
        vm.stopPrank();

        assertEq(reg.count(subj), 1); // canonical = self-log ONLY (was 1 disaster hidden)
        assertEq(reg.rawCount(subj), 2); // the -80% history is still on-chain, separately
        assertEq(reg.rawLatest(subj).nav, 20e18); // not erased — just not canonical
    }
}
