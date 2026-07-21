// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { AelixAutosave } from "../src/AelixAutosave.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";

contract AelixAutosaveTest is Test {
    MockERC20 usdg;
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    RWAVault vault;
    AelixAutosave save;

    address HUMAN = address(0xB00D);
    address ALICE = address(0xA11CE);
    address KEEPER = address(0x33333);

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
        usdg = new MockERC20("USD Global", "USDG");
        oracle = new MockOracle();
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
            address(0)
        );
        save = new AelixAutosave(vault);

        usdg.mint(ALICE, 1000e18);
        vm.prank(ALICE);
        usdg.approve(address(save), type(uint256).max);
    }

    function _createPlan(uint256 amt, uint64 period, uint32 total) internal {
        vm.prank(ALICE);
        save.createPlan(amt, period, total);
    }

    // ------------------------------------------------------------------ basics

    function test_createPlan_dueImmediately() public {
        _createPlan(10e18, 1 weeks, 3);
        assertTrue(save.due(ALICE));
    }

    function test_badParams_revert() public {
        vm.prank(ALICE);
        vm.expectRevert(AelixAutosave.BadParams.selector);
        save.createPlan(0, 1 weeks, 3);

        vm.prank(ALICE);
        vm.expectRevert(AelixAutosave.BadParams.selector);
        save.createPlan(10e18, 0, 3);
    }

    // ------------------------------------------------------------------ contributions

    function test_keeperExecutesDueContribution() public {
        _createPlan(10e18, 1 weeks, 3);
        // A keeper (not Alice) triggers it — permissionless.
        vm.prank(KEEPER);
        uint256 shares = save.executeDue(ALICE);

        assertEq(shares, 10e18); // first deposit into empty vault -> 1:1
        assertEq(vault.balanceOf(ALICE), 10e18); // shares minted to Alice, not keeper
        assertEq(usdg.balanceOf(address(vault)), 10e18);
        assertEq(usdg.balanceOf(address(save)), 0); // never retains funds
    }

    function test_notDue_untilPeriodElapses() public {
        _createPlan(10e18, 1 weeks, 3);
        save.executeDue(ALICE); // period 1
        assertFalse(save.due(ALICE));
        vm.expectRevert(AelixAutosave.NotDue.selector);
        save.executeDue(ALICE);

        vm.warp(block.timestamp + 1 weeks);
        assertTrue(save.due(ALICE));
        save.executeDue(ALICE); // period 2
        assertEq(vault.balanceOf(ALICE), 20e18);
    }

    function test_completesAfterTotalPeriods() public {
        _createPlan(10e18, 1 weeks, 2);
        save.executeDue(ALICE);
        vm.warp(block.timestamp + 1 weeks);
        save.executeDue(ALICE); // 2nd and final

        (,,, uint32 total, uint32 done,) = save.plans(ALICE);
        assertEq(done, 2);
        assertEq(total, 2);

        vm.warp(block.timestamp + 1 weeks);
        assertFalse(save.due(ALICE)); // no longer due once all periods are done
        vm.expectRevert(AelixAutosave.Completed.selector);
        save.executeDue(ALICE);
    }

    function test_openEndedPlan_runsIndefinitely() public {
        _createPlan(5e18, 1 days, 0); // 0 = open-ended
        for (uint256 i = 0; i < 5; ++i) {
            save.executeDue(ALICE);
            vm.warp(block.timestamp + 1 days);
        }
        assertEq(vault.balanceOf(ALICE), 25e18);
        assertTrue(save.due(ALICE)); // still going
    }

    // ------------------------------------------------------------------ cancel

    function test_cancelPlan_stopsContributions() public {
        _createPlan(10e18, 1 weeks, 3);
        vm.prank(ALICE);
        save.cancelPlan();
        assertFalse(save.due(ALICE));
        vm.expectRevert(AelixAutosave.NoPlan.selector);
        save.executeDue(ALICE);
    }

    function test_cancel_withoutPlan_reverts() public {
        vm.prank(ALICE);
        vm.expectRevert(AelixAutosave.NoPlan.selector);
        save.cancelPlan();
    }

    // ------------------------------------------------------------------ funding failure

    function test_insufficientAllowance_reverts() public {
        _createPlan(10e18, 1 weeks, 3);
        vm.prank(ALICE);
        usdg.approve(address(save), 0); // revoke approval
        vm.expectRevert(); // SafeERC20 transferFrom fails
        save.executeDue(ALICE);
    }
}
