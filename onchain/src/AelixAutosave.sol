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
        uint256 amountPerPeriod; //    USDG per contribution
        uint64 period; //              seconds between contributions
        uint64 nextExec; //            earliest timestamp of the next contribution
        uint32 totalPeriods; //        0 = open-ended
        uint32 periodsDone;
        bool active;
        uint16 maxDriftBps; //         max share-price rise vs the last contribution's
        //                             recorded price before {executeDue} reverts; 0 disables
        uint256 refSharePriceE18; //   share price (assets per 1e18 shares) recorded at plan
        //                             creation and refreshed after each contribution
    }

    mapping(address => Plan) public plans;

    event PlanCreated(
        address indexed user,
        uint256 amountPerPeriod,
        uint64 period,
        uint32 totalPeriods,
        uint16 maxDriftBps
    );
    event PlanCancelled(address indexed user);
    event Contributed(address indexed user, uint256 amount, uint256 shares, uint32 periodsDone);

    error BadParams();
    error NoPlan();
    error NotDue();
    error Completed();
    /// @notice The vault is paused and cannot accept a deposit right now.
    error VaultPaused();
    /// @notice Share price moved beyond the plan's `maxDriftBps` tolerance since the last
    ///         contribution — refuse to deposit at a (possibly manipulated) NAV.
    error NavDrift(uint256 sharePriceE18, uint256 maxSharePriceE18);

    constructor(RWAVault vault_) {
        vault = vault_;
        usdg = IERC20(vault_.asset());
    }

    /// @notice Create/replace the caller's plan. First contribution is due now.
    /// @param maxDriftBps Max upward share-price move (in bps) tolerated between one
    ///        contribution and the next before {executeDue} reverts. Protects the plan
    ///        owner from a keeper triggering a deposit at an inflated/manipulated NAV.
    ///        Set 0 to disable the guard (not recommended). The reference price is seeded
    ///        from the vault's current share price at creation time.
    function createPlan(
        uint256 amountPerPeriod,
        uint64 period,
        uint32 totalPeriods,
        uint16 maxDriftBps
    ) external {
        if (amountPerPeriod == 0 || period == 0) revert BadParams();
        plans[msg.sender] = Plan({
            amountPerPeriod: amountPerPeriod,
            period: period,
            nextExec: uint64(block.timestamp),
            totalPeriods: totalPeriods,
            periodsDone: 0,
            active: true,
            maxDriftBps: maxDriftBps,
            refSharePriceE18: _sharePriceE18()
        });
        emit PlanCreated(msg.sender, amountPerPeriod, period, totalPeriods, maxDriftBps);
    }

    /// @dev Share price = USDG assets backing 1e18 vault shares. For an empty vault the
    ///      ERC4626 virtual-share accounting returns ~1e18. Reverts (fails closed) if the
    ///      vault cannot value its holdings (e.g. a material oracle feed is down), which is
    ///      itself a reason not to deposit.
    function _sharePriceE18() internal view returns (uint256) {
        return vault.convertToAssets(1e18);
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

        // A paused vault rejects deposits (whenNotPaused); surface that as a clear error
        // to the keeper instead of a generic Pausable revert deep in the call.
        if (vault.paused()) revert VaultPaused();

        // Share-slippage / NAV-drift guard. A permissionless keeper (or an adversary who
        // front-runs it) could inflate the vault's share price right before this deposit
        // so the user's USDG mints far fewer shares. Bound how far the share price may
        // rise versus the price recorded at the last contribution (or plan creation).
        uint256 sp = _sharePriceE18();
        uint256 ref = p.refSharePriceE18;
        if (p.maxDriftBps != 0 && ref != 0) {
            uint256 maxSp = ref + (ref * p.maxDriftBps) / 10_000;
            if (sp > maxSp) revert NavDrift(sp, maxSp);
        }

        uint256 amt = p.amountPerPeriod;
        // Effects before interactions. A finished plan keeps `active == true` but
        // is guarded by the periods check above, so further calls report the clear
        // {Completed} error rather than the ambiguous {NoPlan}. `due()` returns
        // false for it, and the user can start a fresh plan via createPlan().
        p.periodsDone += 1;
        p.nextExec = uint64(block.timestamp) + p.period;
        p.refSharePriceE18 = sp; // anchor the next period's drift check to this price

        usdg.safeTransferFrom(user, address(this), amt);
        usdg.forceApprove(address(vault), amt);
        shares = vault.deposit(amt, user);
        emit Contributed(user, amt, shares, p.periodsDone);
    }
}
