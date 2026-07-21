// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { SessionKeyExecutor } from "../src/SessionKeyExecutor.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";

contract SessionKeyExecutorTest is Test {
    MockERC20 usdg;
    MockERC20 stk;
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    RWAVault vault;
    SessionKeyExecutor exec;

    address HUMAN = address(0xB00D);
    address AGENT = address(0xA6E7);
    address ALICE = address(0xA11CE);

    uint256 constant PRICE = 50e18;
    uint64 EXPIRY;

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
        vm.warp(2_000_000_000);
        EXPIRY = uint64(block.timestamp + 7 days);

        usdg = new MockERC20("USD Global", "USDG");
        stk = new MockERC20("Demo Stock Token", "dSTK");
        oracle = new MockOracle();
        oracle.setPrice(address(stk), PRICE);
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
            address(0) // manager set to the executor below
        );

        exec = new SessionKeyExecutor(vault, HUMAN);

        vm.startPrank(HUMAN);
        vault.allowToken(address(stk));
        vault.setManager(address(exec)); // executor is the vault manager
        vm.stopPrank();

        usdg.mint(address(adapter), 1_000_000e18);
        stk.mint(address(adapter), 1_000_000e18);

        usdg.mint(ALICE, 100e18);
        vm.startPrank(ALICE);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(100e18, ALICE);
        vm.stopPrank();
    }

    function _grant(uint256 maxPerTrade, uint32 maxTrades, uint256 maxCum, bool buys, bool sells)
        internal
    {
        address[] memory toks = new address[](1);
        toks[0] = address(stk);
        vm.prank(HUMAN);
        exec.grantSession(AGENT, EXPIRY, maxPerTrade, maxTrades, maxCum, buys, sells, toks);
    }

    function _buy(uint256 amountIn) internal returns (uint256) {
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: amountIn,
            minAmountOut: 0,
            stopPriceE18: 45e18,
            leftSideException: false
        });
        vm.prank(AGENT);
        return exec.trade(o);
    }

    // ------------------------------------------------------------------ happy path

    function test_agentTradesWithinSession() public {
        _grant(10e18, 5, 50e18, true, true);
        uint256 out = _buy(10e18);
        assertEq(out, 0.2e18);
        assertEq(stk.balanceOf(address(vault)), 0.2e18);
        assertEq(exec.remainingTrades(AGENT), 4);
        assertEq(exec.remainingNotional(AGENT), 40e18);
        assertTrue(exec.isLive(AGENT));
    }

    // ------------------------------------------------------------------ session scoping

    function test_perTradeCap_tighterThanVault() public {
        _grant(5e18, 5, 50e18, true, true); // session cap 5 < vault's 15
        vm.expectRevert(SessionKeyExecutor.PerTradeExceeded.selector);
        _buy(10e18); // allowed by vault, blocked by session
    }

    function test_cumulativeNotionalCap() public {
        _grant(10e18, 5, 12e18, true, true); // cumulative budget 12
        _buy(6e18); // used 6
        vm.expectRevert(SessionKeyExecutor.CumNotionalExceeded.selector);
        _buy(7e18); // 6 + 7 = 13 > 12
    }

    function test_maxTradesCap() public {
        _grant(10e18, 2, 100e18, true, true);
        _buy(2e18);
        _buy(2e18);
        vm.expectRevert(SessionKeyExecutor.MaxTradesReached.selector);
        _buy(2e18); // third trade
    }

    function test_expiry() public {
        _grant(10e18, 5, 50e18, true, true);
        vm.warp(uint256(EXPIRY) + 1);
        vm.expectRevert(SessionKeyExecutor.SessionExpired.selector);
        _buy(2e18);
    }

    function test_revoke() public {
        _grant(10e18, 5, 50e18, true, true);
        vm.prank(HUMAN);
        exec.revokeSession(AGENT);
        vm.expectRevert(SessionKeyExecutor.NoActiveSession.selector);
        _buy(2e18);
        assertFalse(exec.isLive(AGENT));
    }

    function test_tokenNotInSession() public {
        MockERC20 other = new MockERC20("Other", "OTH");
        oracle.setPrice(address(other), 10e18);
        vm.prank(HUMAN);
        vault.allowToken(address(other)); // vault allows it...
        _grant(10e18, 5, 50e18, true, true); // ...but the session does not scope it

        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(other),
            isBuy: true,
            amountIn: 5e18,
            minAmountOut: 0,
            stopPriceE18: 9e18,
            leftSideException: false
        });
        vm.prank(AGENT);
        vm.expectRevert(SessionKeyExecutor.TokenNotInSession.selector);
        exec.trade(o);
    }

    function test_sideNotAllowed_sellsDisabled() public {
        _grant(10e18, 5, 50e18, true, false); // sells disabled
        _buy(10e18); // build a position first (buy allowed)
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: false,
            amountIn: 0.05e18,
            minAmountOut: 0,
            stopPriceE18: 0,
            leftSideException: false
        });
        vm.prank(AGENT);
        vm.expectRevert(SessionKeyExecutor.SideNotAllowed.selector);
        exec.trade(o);
    }

    function test_noSession_reverts() public {
        // AGENT never granted
        vm.expectRevert(SessionKeyExecutor.NoActiveSession.selector);
        _buy(2e18);
    }

    // ------------------------------------------------------------------ defense in depth

    function test_rejectedByVault_doesNotConsumeBudget() public {
        _grant(30e18, 5, 100e18, true, true); // session looser than vault here
        // 20e18 buy is under the session cap but over the vault's 15% per-trade cap.
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 20e18,
            minAmountOut: 0,
            stopPriceE18: 45e18,
            leftSideException: false
        });
        vm.prank(AGENT);
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.PerTradeCap
            )
        );
        exec.trade(o);

        // Budget untouched — the whole call rolled back.
        assertEq(exec.remainingTrades(AGENT), 5);
        assertEq(exec.remainingNotional(AGENT), 100e18);
    }

    // ------------------------------------------------------------------ access control

    function test_onlyOwner_canGrant() public {
        address[] memory toks = new address[](1);
        toks[0] = address(stk);
        vm.prank(AGENT);
        vm.expectRevert(); // Ownable
        exec.grantSession(AGENT, EXPIRY, 10e18, 5, 50e18, true, true, toks);
    }
}
