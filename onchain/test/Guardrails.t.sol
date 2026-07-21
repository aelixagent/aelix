// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";

contract GuardrailsTest is Test {
    using Guardrails for Guardrails.RiskCaps;

    uint256 constant NAV = 100e18; // 100 accounting units (18 decimals) — easy percentages

    function _defaultCaps() internal pure returns (Guardrails.RiskCaps memory) {
        // Mirrors strategies/README.md exactly.
        return Guardrails.RiskCaps({
            perTradeBps: 1500, // 15%
            maxConcentrationBps: 2500, // 25%
            maxOpenPositions: 6,
            maxDailyOrders: 4,
            stopLossBps: 800, // 8%
            dailyLossHaltBps: 500, // 5%
            cashBufferBps: 1000 // 10%
        });
    }

    /// A clean, compliant BUY. Individual tests mutate one field to trip one rule.
    function _cleanBuy() internal pure returns (Guardrails.TradeContext memory) {
        return Guardrails.TradeContext({
            isBuy: true,
            nav: NAV,
            tradeNotional: 10e18, // 10% < 15%
            cashAfter: 20e18, // 20% > 10% buffer
            dayPnl: 0,
            ordersToday: 1, // < 4
            openPositionsAfter: 3, // <= 6
            positionValueAfter: 10e18, // 10% < 25%
            positionIsUnderwater: false,
            leftSideException: false,
            hasStop: true,
            dailyHalted: false
        });
    }

    function _eval(Guardrails.TradeContext memory c) internal pure returns (uint256) {
        return uint256(Guardrails.evaluate(_defaultCaps(), c));
    }

    function _v(Guardrails.Violation x) internal pure returns (uint256) {
        return uint256(x);
    }

    // ------------------------------------------------------------------ happy path

    function test_cleanBuy_passes() public pure {
        assertEq(_eval(_cleanBuy()), _v(Guardrails.Violation.None));
        assertTrue(Guardrails.isAllowed(_defaultCaps(), _cleanBuy()));
    }

    // ------------------------------------------------------------------ funded

    function test_unfunded_isRejected() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.nav = 0;
        assertEq(_eval(c), _v(Guardrails.Violation.Unfunded));
    }

    // ------------------------------------------------------------------ per-trade cap

    function test_perTradeCap_overLimit() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.tradeNotional = 16e18; // 16% > 15%
        assertEq(_eval(c), _v(Guardrails.Violation.PerTradeCap));
    }

    function test_perTradeCap_exactlyAtLimit_passes() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.tradeNotional = 15e18; // exactly 15% — allowed (strict >)
        c.positionValueAfter = 15e18;
        assertEq(_eval(c), _v(Guardrails.Violation.None));
    }

    // ------------------------------------------------------------------ concentration

    function test_concentration_overLimit() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.tradeNotional = 15e18;
        c.positionValueAfter = 26e18; // 26% > 25%
        assertEq(_eval(c), _v(Guardrails.Violation.Concentration));
    }

    function test_concentration_exactlyAtLimit_passes() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.positionValueAfter = 25e18; // exactly 25%
        assertEq(_eval(c), _v(Guardrails.Violation.None));
    }

    // ------------------------------------------------------------------ max positions

    function test_maxPositions_overLimit() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.openPositionsAfter = 7; // > 6
        assertEq(_eval(c), _v(Guardrails.Violation.MaxPositions));
    }

    function test_maxPositions_atLimit_passes() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.openPositionsAfter = 6;
        assertEq(_eval(c), _v(Guardrails.Violation.None));
    }

    // ------------------------------------------------------------------ daily order throttle

    function test_maxDailyOrders_reached() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.ordersToday = 4; // already at cap
        assertEq(_eval(c), _v(Guardrails.Violation.MaxDailyOrders));
    }

    // ------------------------------------------------------------------ cash buffer

    function test_cashBuffer_belowMinimum() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.cashAfter = 9e18; // 9% < 10%
        assertEq(_eval(c), _v(Guardrails.Violation.CashBuffer));
    }

    function test_cashBuffer_exactlyAtMinimum_passes() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.cashAfter = 10e18; // exactly 10%
        assertEq(_eval(c), _v(Guardrails.Violation.None));
    }

    // ------------------------------------------------------------------ no averaging into losers

    function test_noAveragingIntoLoser_blocked() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.positionIsUnderwater = true;
        c.leftSideException = false;
        assertEq(_eval(c), _v(Guardrails.Violation.NoAveragingIntoLoser));
    }

    function test_leftSideException_allowsAveraging() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.positionIsUnderwater = true;
        c.leftSideException = true; // approved ladder
        assertEq(_eval(c), _v(Guardrails.Violation.None));
    }

    // ------------------------------------------------------------------ stop-loss required

    function test_missingStop_blocked() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.hasStop = false;
        assertEq(_eval(c), _v(Guardrails.Violation.MissingStop));
    }

    // ------------------------------------------------------------------ daily loss halt

    function test_dailyHaltFlag_blocksBuys() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.dailyHalted = true;
        assertEq(_eval(c), _v(Guardrails.Violation.DailyLossHalt));
    }

    function test_dailyLoss_atThreshold_halts() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.dayPnl = -5e18; // exactly -5% of NAV
        assertEq(_eval(c), _v(Guardrails.Violation.DailyLossHalt));
    }

    function test_dailyLoss_justUnderThreshold_passes() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.dayPnl = -4e18; // -4% < 5% halt
        assertEq(_eval(c), _v(Guardrails.Violation.None));
    }

    // ------------------------------------------------------------------ sells are never trapped

    function test_sell_alwaysAllowed_evenWhenEverythingBad() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.isBuy = false;
        // Deliberately violate every buy-side rule; a de-risking sell must still pass.
        c.positionIsUnderwater = true;
        c.hasStop = false;
        c.positionValueAfter = 90e18; // way over concentration
        c.cashAfter = 0; // no buffer
        c.ordersToday = 3;
        c.dailyHalted = true;
        c.dayPnl = -50e18;
        assertEq(_eval(c), _v(Guardrails.Violation.None));
    }

    function test_sell_stillBlockedWhenUnfunded() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.isBuy = false;
        c.nav = 0;
        assertEq(_eval(c), _v(Guardrails.Violation.Unfunded));
    }

    // ------------------------------------------------------------------ precedence

    function test_precedence_perTradeBeforeConcentration() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.tradeNotional = 16e18; // trips per-trade
        c.positionValueAfter = 30e18; // also trips concentration
        // Per-trade is checked first.
        assertEq(_eval(c), _v(Guardrails.Violation.PerTradeCap));
    }

    function test_precedence_haltBeforePerTrade() public pure {
        Guardrails.TradeContext memory c = _cleanBuy();
        c.dailyHalted = true;
        c.tradeNotional = 99e18;
        assertEq(_eval(c), _v(Guardrails.Violation.DailyLossHalt));
    }

    // ------------------------------------------------------------------ fuzz: per-trade cap

    function testFuzz_perTradeCap(uint256 nav, uint256 notional) public pure {
        nav = bound(nav, 1e18, 1e30);
        notional = bound(notional, 0, 1e30);
        Guardrails.RiskCaps memory caps = _defaultCaps();
        Guardrails.TradeContext memory c = _cleanBuy();
        c.nav = nav;
        c.tradeNotional = notional;
        // Keep every other buy-side check satisfied so per-trade is the only variable.
        c.cashAfter = nav; // 100% cash after (buffer ok)
        c.positionValueAfter = 0; // concentration ok
        c.openPositionsAfter = 1;
        c.ordersToday = 0;

        bool overCap = notional * Guardrails.BPS > uint256(caps.perTradeBps) * nav;
        Guardrails.Violation v = Guardrails.evaluate(caps, c);
        if (overCap) {
            assertEq(uint256(v), _v(Guardrails.Violation.PerTradeCap));
        } else {
            assertEq(uint256(v), _v(Guardrails.Violation.None));
        }
    }

    // ================================================================== GuardrailConfig

    address constant HUMAN = address(0xBEEF);
    address constant AGENT = address(0xA6E7);

    function _deployConfig() internal returns (GuardrailConfig) {
        return new GuardrailConfig(HUMAN, _defaultCaps());
    }

    function test_config_storesAndReturnsCaps() public {
        GuardrailConfig cfg = _deployConfig();
        assertEq(cfg.owner(), HUMAN);
        Guardrails.RiskCaps memory c = cfg.caps();
        assertEq(c.perTradeBps, 1500);
        assertEq(c.maxConcentrationBps, 2500);
        assertEq(c.maxOpenPositions, 6);
        assertEq(c.cashBufferBps, 1000);
    }

    function test_config_setCaps_onlyOwner() public {
        GuardrailConfig cfg = _deployConfig();
        Guardrails.RiskCaps memory tighter = _defaultCaps();
        tighter.perTradeBps = 1000;

        // Agent (not owner) cannot weaken/change caps.
        vm.prank(AGENT);
        vm.expectRevert(GuardrailConfig.NotOwner.selector);
        cfg.setCaps(tighter);

        // Owner can.
        vm.prank(HUMAN);
        cfg.setCaps(tighter);
        assertEq(cfg.caps().perTradeBps, 1000);
    }

    function test_config_rejectsZeroCap() public {
        GuardrailConfig cfg = _deployConfig();
        Guardrails.RiskCaps memory bad = _defaultCaps();
        bad.maxDailyOrders = 0; // "missing" cap
        vm.prank(HUMAN);
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setCaps(bad);
    }

    function test_config_rejectsPerTradeAboveConcentration() public {
        Guardrails.RiskCaps memory bad = _defaultCaps();
        bad.perTradeBps = 3000; // > 2500 concentration
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        new GuardrailConfig(HUMAN, bad);
    }

    function test_config_rejectsZeroOwner() public {
        vm.expectRevert(GuardrailConfig.ZeroAddress.selector);
        new GuardrailConfig(address(0), _defaultCaps());
    }

    function test_config_transferOwnership() public {
        GuardrailConfig cfg = _deployConfig();
        // Two-step: transfer only stages a pending owner...
        vm.prank(HUMAN);
        cfg.transferOwnership(AGENT);
        assertEq(cfg.owner(), HUMAN); // unchanged until accepted
        assertEq(cfg.pendingOwner(), AGENT);
        // ...and takes effect only when the target accepts.
        vm.prank(AGENT);
        cfg.acceptOwnership();
        assertEq(cfg.owner(), AGENT);
        assertEq(cfg.pendingOwner(), address(0));
    }
}
