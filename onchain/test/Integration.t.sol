// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Guardrails } from "../src/libraries/Guardrails.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { DeskRegistry } from "../src/DeskRegistry.sol";
import { PerfScore } from "../src/PerfScore.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { SessionKeyExecutor } from "../src/SessionKeyExecutor.sol";
import { AelixAutosave } from "../src/AelixAutosave.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";

/// @notice End-to-end: all six contracts working together the way a live desk run
///         would drive them — deposit, DCA, guardrail-checked agent trading, and a
///         verifiable track record. This is the "e2e dry-run" for the integration.
contract IntegrationTest is Test {
    MockERC20 usdg;
    MockERC20 stk;
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    DeskRegistry registry;
    PerfScore perf;
    RWAVault vault;
    SessionKeyExecutor exec;
    AelixAutosave save;

    address HUMAN = address(0xB00D);
    address AGENT = address(0xA6E7);
    address ALICE = address(0xA11CE);
    bytes32 subject;

    function setUp() public {
        vm.warp(2_000_000_000);
        usdg = new MockERC20("USD Global", "USDG");
        stk = new MockERC20("Aelix Demo Stock", "vNVDA");
        oracle = new MockOracle();
        oracle.setPrice(address(stk), 50e18);
        adapter = new MockSwapAdapter(oracle);

        cfg = new GuardrailConfig(
            HUMAN,
            Guardrails.RiskCaps({
                perTradeBps: 1500,
                maxConcentrationBps: 2500,
                maxOpenPositions: 6,
                maxDailyOrders: 4,
                stopLossBps: 800,
                dailyLossHaltBps: 500,
                cashBufferBps: 1000
            })
        );
        registry = new DeskRegistry();
        perf = new PerfScore(registry);

        vault = new RWAVault(
            IERC20(address(usdg)),
            "Aelix RWA Vault",
            "vAELIX",
            HUMAN,
            cfg,
            IPriceOracle(address(oracle)),
            ISwapAdapter(address(adapter)),
            address(0)
        );
        exec = new SessionKeyExecutor(vault, HUMAN);
        save = new AelixAutosave(vault);

        vm.startPrank(HUMAN);
        vault.allowToken(address(stk));
        vault.setManager(address(exec));
        address[] memory toks = new address[](1);
        toks[0] = address(stk);
        exec.grantSession(
            AGENT, uint64(block.timestamp + 30 days), 2000e18, 100, 50_000e18, true, true, toks
        );
        vm.stopPrank();

        usdg.mint(address(adapter), 1_000_000e18);
        stk.mint(address(adapter), 1_000_000e18);

        // Canonical, squat-proof subject: derived from the attester (this test) + label.
        subject = registry.subjectFor(
            address(this), keccak256(abi.encodePacked("aelix-vault:", address(vault)))
        );
    }

    function test_fullDeskLifecycle() public {
        // --- 1. Alice enters via autosave DCA: 2 weekly contributions of 5,000 ---
        usdg.mint(ALICE, 10_000e18);
        vm.startPrank(ALICE);
        usdg.approve(address(save), type(uint256).max);
        save.createPlan(5_000e18, 1 weeks, 2);
        vm.stopPrank();

        save.executeDue(ALICE); // week 1
        vm.warp(block.timestamp + 1 weeks);
        save.executeDue(ALICE); // week 2

        assertEq(vault.balanceOf(ALICE), 10_000e18); // 1:1 while all cash
        assertEq(vault.navUsdg(), 10_000e18);

        // --- 2. The desk (agent session key) builds a position within guardrails ---
        uint256 out = _agentBuy(1_000e18, 46e18); // ~10% of NAV, stop below price
        assertEq(out, 20e18); // 1000 / 50
        assertEq(vault.openPositions(), 1);
        assertApproxEqAbs(vault.navUsdg(), 10_000e18, 2); // preserved through the swap

        // --- 3. Guardrails still bite through the whole stack ---
        // A 2,000 buy (20% of NAV) exceeds the vault's 15% per-trade cap even though
        // the session would allow it.
        vm.prank(AGENT);
        vm.expectRevert(
            abi.encodeWithSelector(
                RWAVault.GuardrailViolation.selector, Guardrails.Violation.PerTradeCap
            )
        );
        exec.trade(_order(true, 2_000e18, 46e18));

        // --- 4. The position appreciates; NAV rises ---
        oracle.setPrice(address(stk), 60e18); // +20% on the holding
        // holding 20 * 60 = 1200 (was 1000) => +200 on a 10,000 book
        assertApproxEqAbs(vault.navUsdg(), 10_200e18, 2);

        // --- 5. Desk attests the run series -> verifiable track record ---
        // Use the squat-proof self-namespace (the surface PerfScore reads); label matches
        // the derivation of `subject` above.
        bytes32 label = keccak256(abi.encodePacked("aelix-vault:", address(vault)));
        registry.attestSelf(label, 1, 10_000e18, 0, keccak256("d1"), "");
        registry.attestSelf(label, 2, 10_100e18, 50e18, keccak256("d2"), "");
        registry.attestSelf(label, 3, vault.navUsdg(), 100e18, keccak256("d3"), "");

        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.samples, 3);
        assertGt(s.totalReturnBps, 0); // net positive track record
        assertEq(s.startNav, 10_000e18);

        // --- 6. Alice exits part in-kind, always solvent ---
        uint256 half = vault.balanceOf(ALICE) / 2;
        vm.prank(ALICE);
        vault.redeemInKind(half, ALICE);
        assertGt(usdg.balanceOf(ALICE), 0);
        assertGt(stk.balanceOf(ALICE), 0); // received a real slice of the Stock Token
    }

    function _order(bool isBuy, uint256 amountIn, uint256 stop)
        internal
        view
        returns (RWAVault.TradeOrder memory)
    {
        return RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: isBuy,
            amountIn: amountIn,
            minAmountOut: 0,
            stopPriceE18: stop,
            leftSideException: false
        });
    }

    function _agentBuy(uint256 amountIn, uint256 stop) internal returns (uint256) {
        vm.prank(AGENT);
        return exec.trade(_order(true, amountIn, stop));
    }
}
