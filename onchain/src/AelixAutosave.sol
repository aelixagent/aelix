// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { RWAVault } from "./RWAVault.sol";

/// @title AelixAutosave
/// @author Aelix
/// @notice Consumer-facing recurring DCA into an {RWAVault}. A user sets a plan
///         ("save 10 USDG every week"), approves USDG once, and a permissionless
///         keeper triggers each contribution when due. Fully non-custodial: the
///         contract never holds the user's funds beyond the atomic hop, and vault
///         shares are minted straight to the user.
///
/// @dev    The vault's manager handles the actual Stock Token allocation; this
///         layer only smooths the user's *entry* by spreading deposits over time.
contract AelixAutosave is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdg;
    RWAVault public immutable vault;

    struct Plan {
        uint256 amountPerPeriod; // USDG per contribution
        uint64 period; //          seconds between contributions
        uint64 nextExec; //        earliest timestamp of the next contribution
        uint32 totalPeriods; //    0 = open-ended
        uint32 periodsDone;
        bool active;
    }

    mapping(address => Plan) public plans;

    event PlanCreated(
        address indexed user, uint256 amountPerPeriod, uint64 period, uint32 totalPeriods
    );
    event PlanCancelled(address indexed user);
    event Contributed(address indexed user, uint256 amount, uint256 shares, uint32 periodsDone);

    error BadParams();
    error NoPlan();
    error NotDue();
    error Completed();

    constructor(RWAVault vault_) {
        vault = vault_;
        usdg = IERC20(vault_.asset());
    }

    /// @notice Create/replace the caller's plan. First contribution is due now.
    function createPlan(uint256 amountPerPeriod, uint64 period, uint32 totalPeriods) external {
        if (amountPerPeriod == 0 || period == 0) revert BadParams();
        plans[msg.sender] = Plan({
            amountPerPeriod: amountPerPeriod,
            period: period,
            nextExec: uint64(block.timestamp),
            totalPeriods: totalPeriods,
            periodsDone: 0,
            active: true
        });
        emit PlanCreated(msg.sender, amountPerPeriod, period, totalPeriods);
    }

    function cancelPlan() external {
        if (!plans[msg.sender].active) revert NoPlan();
        plans[msg.sender].active = false;
        emit PlanCancelled(msg.sender);
    }

    function due(address user) public view returns (bool) {
        Plan storage p = plans[user];
        if (!p.active) return false;
        if (p.totalPeriods != 0 && p.periodsDone >= p.totalPeriods) return false;
        // forge-lint: disable-next-line(block-timestamp) — DCA cadence is day/week scale
        return block.timestamp >= p.nextExec;
    }

    /// @notice Permissionless: anyone (a keeper/cron) can trigger a due contribution
    ///         for `user`. Pulls USDG from the user and deposits into the vault,
    ///         minting shares directly to the user.
    function executeDue(address user) external nonReentrant returns (uint256 shares) {
        Plan storage p = plans[user];
        if (!p.active) revert NoPlan();
        if (p.totalPeriods != 0 && p.periodsDone >= p.totalPeriods) revert Completed();
        // forge-lint: disable-next-line(block-timestamp) — DCA cadence is day/week scale
        if (block.timestamp < p.nextExec) revert NotDue();

        uint256 amt = p.amountPerPeriod;
        // Effects before interactions. A finished plan keeps `active == true` but
        // is guarded by the periods check above, so further calls report the clear
        // {Completed} error rather than the ambiguous {NoPlan}. `due()` returns
        // false for it, and the user can start a fresh plan via createPlan().
        p.periodsDone += 1;
        p.nextExec = uint64(block.timestamp) + p.period;

        usdg.safeTransferFrom(user, address(this), amt);
        usdg.forceApprove(address(vault), amt);
        shares = vault.deposit(amt, user);
        emit Contributed(user, amt, shares, p.periodsDone);
    }
}
