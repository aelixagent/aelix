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
        // Default helper leaves the drift guard disabled (0) so the existing behavioural
        // tests are unaffected; dedicated tests below exercise the guard explicitly.
        vm.prank(ALICE);
        save.createPlan(amt, period, total, 0);
    }

    function _createPlanDrift(uint256 amt, uint64 period, uint32 total, uint16 driftBps)
        internal
    {
        vm.prank(ALICE);
        save.createPlan(amt, period, total, driftBps);
    }

    // ------------------------------------------------------------------ basics

    function test_createPlan_dueImmediately() public {
        _createPlan(10e18, 1 weeks, 3);
        assertTrue(save.due(ALICE));
    }

    function test_badParams_revert() public {
        vm.prank(ALICE);
        vm.expectRevert(AelixAutosave.BadParams.selector);
        save.createPlan(0, 1 weeks, 3, 0);

        vm.prank(ALICE);
        vm.expectRevert(AelixAutosave.BadParams.selector);
        save.createPlan(10e18, 0, 3, 0);
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

        (,,, uint32 total, uint32 done,,,) = save.plans(ALICE);
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

    // ------------------------------------------------------------------ paused vault

    function test_pausedVault_blocksExecute() public {
        _createPlan(10e18, 1 weeks, 3);
        // Owner pauses the vault's deposit side.
        vm.prank(HUMAN);
        vault.pause();

        // A due contribution now fails closed with a clear, specific error rather than a
        // generic Pausable revert buried in the vault deposit.
        assertTrue(save.due(ALICE));
        vm.prank(KEEPER);
        vm.expectRevert(AelixAutosave.VaultPaused.selector);
        save.executeDue(ALICE);

        // Once unpaused the contribution proceeds normally.
        vm.prank(HUMAN);
        vault.unpause();
        vm.prank(KEEPER);
        uint256 shares = save.executeDue(ALICE);
        assertEq(shares, 10e18);
        assertEq(vault.balanceOf(ALICE), 10e18);
    }

    // ------------------------------------------------------------------ NAV-drift guard

    function test_adversarialKeeper_navMoved_blocked() public {
        // 10% per-contribution drift tolerance.
        _createPlanDrift(10e18, 1 weeks, 3, 1000);

        // First contribution executes at share price 1e18 (empty vault) and anchors the
        // drift reference.
        vm.prank(KEEPER);
        save.executeDue(ALICE);
        assertEq(vault.balanceOf(ALICE), 10e18);

        vm.warp(block.timestamp + 1 weeks);
        assertTrue(save.due(ALICE));

        // An adversary inflates the vault's NAV right before the keeper's next trigger by
        // donating USDG straight into the vault. Share price jumps ~11x, so Alice's 10 USDG
        // would mint far fewer shares. The per-plan drift guard blocks the deposit.
        usdg.mint(address(vault), 100e18);
        assertGt(vault.convertToAssets(1e18), 10e18); // share price moved way past tolerance

        vm.prank(KEEPER);
        vm.expectRevert(
            abi.encodeWithSelector(
                AelixAutosave.NavDrift.selector,
                vault.convertToAssets(1e18),
                1e18 + (1e18 * 1000) / 10_000 // ref 1e18 + 10%
            )
        );
        save.executeDue(ALICE);

        // Nothing was pulled from Alice; the plan did not advance.
        assertEq(vault.balanceOf(ALICE), 10e18);
        (,,,, uint32 done,,,) = save.plans(ALICE);
        assertEq(done, 1);
    }

    function test_driftGuard_allowsModestLegitMove() public {
        // Alice seeds the vault directly so there is real supply to move the price against.
        _createPlanDrift(100e18, 1 weeks, 3, 1000); // 10% tolerance
        vm.prank(KEEPER);
        save.executeDue(ALICE); // price 1e18, ref anchored, 100 shares

        vm.warp(block.timestamp + 1 weeks);
        // A small +5% NAV move (within tolerance) from legitimate vault performance.
        usdg.mint(address(vault), 5e18); // 105 assets / 100 supply -> 1.05e18 share price
        vm.prank(KEEPER);
        save.executeDue(ALICE); // within 10% -> allowed

        assertGt(vault.balanceOf(ALICE), 100e18); // second contribution minted shares
    }
}
