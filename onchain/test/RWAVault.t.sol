// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";

contract RWAVaultTest is Test {
    MockERC20 usdg;
    MockERC20 stk; // a Stock Token, price 50 USDG
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    RWAVault vault;

    address HUMAN = address(0xB00D);
    address MANAGER = address(0x1234);
    address ALICE = address(0xA11CE);

    uint256 constant PRICE = 50e18; // 50 USDG per STK

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
            MANAGER
        );

        vm.prank(HUMAN);
        vault.allowToken(address(stk));

        // Fund the adapter with deep liquidity in both legs.
        usdg.mint(address(adapter), 1_000_000e18);
        stk.mint(address(adapter), 1_000_000e18);

        // Alice deposits 100 USDG.
        usdg.mint(ALICE, 100e18);
        vm.startPrank(ALICE);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(100e18, ALICE);
        vm.stopPrank();

        // Move off day 0 so _refreshDay has a clean baseline.
        vm.warp(2_000_000_000);
    }

    function _buy(uint256 amountIn, uint256 stopPrice, bool leftSide) internal returns (uint256) {
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: amountIn,
            minAmountOut: 0,
            stopPriceE18: stopPrice,
            leftSideException: leftSide
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

    // ------------------------------------------------------------------ deposit / nav

    function test_deposit_mintsSharesOneToOne() public view {
        assertEq(vault.balanceOf(ALICE), 100e18);
        assertEq(vault.totalAssets(), 100e18);
        assertEq(vault.navUsdg(), 100e18);
    }

    function test_buy_movesCashIntoStock_navPreserved() public {
        uint256 out = _buy(10e18, 45e18, false); // buy 10 USDG of STK, stop @45 (<50)
        // 10 USDG / 50 = 0.2 STK
        assertEq(out, 0.2e18);
        assertEq(stk.balanceOf(address(vault)), 0.2e18);
        assertEq(usdg.balanceOf(address(vault)), 90e18);
        assertEq(vault.costBasisUsdg(address(stk)), 10e18);
        assertEq(vault.positionValue(address(stk)), 10e18); // 0.2 * 50
        assertApproxEqAbs(vault.navUsdg(), 100e18, 1); // preserved (no slippage)
        assertEq(vault.ordersToday(), 1);
        assertEq(vault.openPositions(), 1);
    }

    // ------------------------------------------------------------------ guardrails at custody

    function test_buy_overPerTradeCap_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.PerTradeCap
            )
        );
        _buy(20e18, 45e18, false); // 20% > 15%
    }

    function test_buy_missingStop_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.MissingStop
            )
        );
        _buy(10e18, 0, false); // no stop
    }

    function test_buy_concentration_reverts() public {
        // Build toward the 25% cap, then a buy that would exceed it.
        _buy(15e18, 45e18, false); // pos 15
        _buy(10e18, 45e18, false); // pos 25 (exactly at cap, allowed)
        assertApproxEqAbs(vault.positionValue(address(stk)), 25e18, 2);
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.Concentration
            )
        );
        _buy(5e18, 45e18, false); // would push to 30 > 25
    }

    function test_buy_noAveragingIntoLoser_reverts_thenLeftSideAllows() public {
        _buy(10e18, 45e18, false); // 0.2 STK @ cost 10
        oracle.setPrice(address(stk), 40e18); // position now worth 8 < 10 => underwater

        // A normal add into the loser is blocked.
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.NoAveragingIntoLoser
            )
        );
        _buy(5e18, 36e18, false);

        // The same add under an approved left-side ladder is allowed.
        uint256 out = _buy(5e18, 36e18, true);
        assertGt(out, 0);
    }

    function test_maxDailyOrders_blocksFifthBuy() public {
        _buy(2e18, 45e18, false);
        _buy(2e18, 45e18, false);
        _buy(2e18, 45e18, false);
        _buy(2e18, 45e18, false); // 4 orders
        assertEq(vault.ordersToday(), 4);
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.MaxDailyOrders
            )
        );
        _buy(2e18, 45e18, false);
    }

    function test_previewTrade_matchesEnforcement() public view {
        RWAVault.TradeOrder memory bad = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 20e18, // over per-trade
            minAmountOut: 0,
            stopPriceE18: 45e18,
            leftSideException: false
        });
        assertEq(uint256(vault.previewTrade(bad)), uint256(Guardrails.Violation.PerTradeCap));

        RWAVault.TradeOrder memory good = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: 45e18,
            leftSideException: false
        });
        assertEq(uint256(vault.previewTrade(good)), uint256(Guardrails.Violation.None));
    }

    // ------------------------------------------------------------------ sells never trapped

    function test_sell_alwaysAllowed_evenAfterHalt() public {
        _buy(15e18, 45e18, false); // establishes dayStartNav ~100, pos 15
        // Crash the price so intraday P&L < -5% of dayStartNav.
        oracle.setPrice(address(stk), 25e18); // 0.3 STK now worth 7.5, nav ~92.5 (-7.5%)

        // A buy is halted.
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.DailyLossHalt
            )
        );
        _buy(1e18, 20e18, false);

        // But a de-risking sell still goes through.
        uint256 out = _sell(0.1e18); // sell 0.1 STK @25 = 2.5 USDG
        assertEq(out, 2.5e18);
    }

    function test_halt_isLatchedForTheDay() public {
        _buy(15e18, 45e18, false);
        oracle.setPrice(address(stk), 25e18); // -7.5% intraday
        // Persist the halt for the rest of the day (permissionless keeper call).
        vault.latchHalt();
        assertEq(vault.haltedDay(), block.timestamp / 1 days);

        // Even if price recovers, the day stays halted.
        oracle.setPrice(address(stk), 60e18);
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 1e18,
            minAmountOut: 0,
            stopPriceE18: 50e18,
            leftSideException: false
        });
        assertEq(uint256(vault.previewTrade(o)), uint256(Guardrails.Violation.DailyLossHalt));
    }

    // ------------------------------------------------------------------ redemptions

    function test_maxWithdraw_cappedByCashLiquidity() public {
        _buy(15e18, 45e18, false); // deploy 15 into STK, 85 cash left
        // Full share value ~100, but only 85 USDG is liquid.
        assertEq(vault.maxWithdraw(ALICE), 85e18);
    }

    function test_redeemInKind_proRataAcrossCashAndTokens() public {
        _buy(15e18, 45e18, false); // 0.3 STK (within 25% cap), 85 USDG cash
        // Alice redeems half her shares in kind.
        uint256 half = vault.balanceOf(ALICE) / 2; // 50e18 of 100e18
        vm.prank(ALICE);
        vault.redeemInKind(half, ALICE);

        // Half the USDG cash and half the STK.
        assertApproxEqAbs(usdg.balanceOf(ALICE), 42.5e18, 1); // 85/2
        assertApproxEqAbs(stk.balanceOf(ALICE), 0.15e18, 1); // 0.3/2
        assertApproxEqAbs(usdg.balanceOf(address(vault)), 42.5e18, 1);
        assertApproxEqAbs(stk.balanceOf(address(vault)), 0.15e18, 1);
    }

    // ------------------------------------------------------------------ access control

    function test_executeTrade_onlyManager() public {
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: 45e18,
            leftSideException: false
        });
        vm.prank(ALICE);
        vm.expectRevert(RWAVault.NotManager.selector);
        vault.executeTrade(o);
    }

    function test_allowlist_onlyOwner() public {
        MockERC20 other = new MockERC20("Other", "OTH");
        vm.prank(ALICE);
        vm.expectRevert(); // Ownable: not owner
        vault.allowToken(address(other));
    }

    function test_tradeUnallowedToken_reverts() public {
        MockERC20 other = new MockERC20("Other", "OTH");
        oracle.setPrice(address(other), 10e18);
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(other),
            isBuy: true,
            amountIn: 5e18,
            minAmountOut: 0,
            stopPriceE18: 9e18,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.TokenNotAllowed.selector);
        vault.executeTrade(o);
    }
}
