// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { DeskRegistry } from "../src/DeskRegistry.sol";
import { PerfScore } from "../src/PerfScore.sol";

/// @title PerfScoreTest — direct unit tests for the pure math in {PerfScore}.
/// @notice Exercises the drawdown running-peak loop, the variance/stddev computation,
///         and the early-return guards (empty series / single sample) using known NAV
///         fixtures with hand-computed expected values. NAV values are always > 0 because
///         {DeskRegistry} rejects a zero NAV at the source; these tests assert the
///         startNav-based totalReturn and the n==0 / n<2 guards behave accordingly.
contract PerfScoreTest is Test {
    DeskRegistry reg;
    PerfScore perf;

    address constant DESK = address(0xD35C);

    function setUp() public {
        reg = new DeskRegistry();
        perf = new PerfScore(reg);
    }

    /// @dev Attest a full NAV series under `label`, epochs 1..n, and return its subject id.
    function _seed(bytes32 label, uint256[] memory navs) internal returns (bytes32 subject) {
        subject = reg.subjectFor(DESK, label);
        for (uint256 i = 0; i < navs.length; ++i) {
            vm.prank(DESK);
            reg.attestSelf(
                label, uint64(i + 1), navs[i], int256(0), keccak256(abi.encode(i, navs[i])), ""
            );
        }
    }

    function _arr2(uint256 a, uint256 b) internal pure returns (uint256[] memory x) {
        x = new uint256[](2);
        x[0] = a;
        x[1] = b;
    }

    // ------------------------------------------------------------------ guards

    function test_emptySeries_returnsZeroed() public view {
        // n == 0 guard: never touched startNav, so no division by zero, fully zeroed.
        PerfScore.PerfSummary memory s = perf.summary(keccak256("never-seeded"));
        assertEq(s.samples, 0);
        assertEq(s.startNav, 0);
        assertEq(s.endNav, 0);
        assertEq(s.totalReturnBps, 0);
        assertEq(s.maxDrawdownBps, 0);
        assertEq(s.volatilityBps, 0);
        assertEq(s.sharpeMilli, 0);
    }

    function test_singleSample_noReturnsOrVol() public {
        uint256[] memory navs = new uint256[](1);
        navs[0] = 100e18;
        bytes32 subject = _seed(keccak256("single"), navs);

        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.samples, 1);
        assertEq(s.startNav, 100e18);
        assertEq(s.endNav, 100e18);
        assertEq(s.totalReturnBps, 0); // start == end
        assertEq(s.maxDrawdownBps, 0); // n<2: drawdown loop never runs
        assertEq(s.volatilityBps, 0); // n<2 early return before variance
        assertEq(s.meanPeriodReturnBps, 0);
        assertEq(s.sharpeMilli, 0);
    }

    // ------------------------------------------------------------------ startNav / totalReturn

    function test_totalReturn_usesStartNav() public {
        // Non-100 start proves the divisor is navs[0], not a hardcoded base.
        bytes32 subject = _seed(keccak256("startnav"), _arr2(200e18, 300e18));
        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.startNav, 200e18);
        assertEq(s.endNav, 300e18);
        assertEq(s.totalReturnBps, int256(5000)); // (300/200 - 1) = +50%
        assertEq(s.maxDrawdownBps, 0); // monotonic up
        assertEq(s.meanPeriodReturnBps, int256(5000));
        assertEq(s.volatilityBps, 0); // single return => 0 variance
    }

    function test_loss_negativeReturn() public {
        bytes32 subject = _seed(keccak256("loss"), _arr2(100e18, 80e18));
        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.totalReturnBps, int256(-2000)); // -20%
        assertEq(s.maxDrawdownBps, 2000);
        assertEq(s.meanPeriodReturnBps, int256(-2000));
    }

    // ------------------------------------------------------------------ drawdown loop

    function test_drawdown_troughNotLast_runningPeak() public {
        // [100, 80, 90]: peak stays 100. At 80 => dd 2000bps (worst). At 90 => dd 1000bps.
        // Exercises the running-peak branch where a later point recovers but never sets a
        // new peak, so maxDD must stick at the earlier trough (2000), not the last (1000).
        uint256[] memory navs = new uint256[](3);
        navs[0] = 100e18;
        navs[1] = 80e18;
        navs[2] = 90e18;
        bytes32 subject = _seed(keccak256("dd-trough"), navs);

        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.maxDrawdownBps, 2000); // worst peak(100)->trough(80)
        assertEq(s.totalReturnBps, int256(-1000)); // 90/100 - 1 = -10%
    }

    function test_drawdown_newPeakResetsReference() public {
        // [100, 120, 108]: new peak 120, then dd to 108 => (120-108)/120 = 1000bps.
        // Confirms the peak advances to 120 (a dd off the old 100 peak would be negative).
        uint256[] memory navs = new uint256[](3);
        navs[0] = 100e18;
        navs[1] = 120e18;
        navs[2] = 108e18;
        bytes32 subject = _seed(keccak256("dd-newpeak"), navs);

        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.maxDrawdownBps, 1000); // 120 -> 108
        assertEq(s.totalReturnBps, int256(800)); // 108/100 - 1 = +8%
    }

    // ------------------------------------------------------------------ variance / stddev

    function test_variance_stddev_sharpe_handComputed() public {
        // Series [100, 120, 90, 108] — fully hand-verified:
        //   returns: +2000, -2500, +2000 bps ; mean = +500 bps
        //   variance = ((1500^2)+(3000^2)+(1500^2))/3 = 4,500,000 ; sqrt = 2121
        //   sharpe = 500 * 1000 / 2121 = 235 (milli)
        uint256[] memory navs = new uint256[](4);
        navs[0] = 100e18;
        navs[1] = 120e18;
        navs[2] = 90e18;
        navs[3] = 108e18;
        bytes32 subject = _seed(keccak256("var"), navs);

        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.meanPeriodReturnBps, int256(500));
        assertEq(s.volatilityBps, 2121);
        assertEq(s.sharpeMilli, int256(235));
        assertEq(s.maxDrawdownBps, 2500); // 120 -> 90
        assertEq(s.totalReturnBps, int256(800)); // 108/100 - 1
    }

    function test_constantReturns_zeroVolAndSharpe() public {
        // +10% each step => zero variance => stddev 0 => sharpe defined as 0 (no div-by-zero).
        uint256[] memory navs = new uint256[](3);
        navs[0] = 100e18;
        navs[1] = 110e18;
        navs[2] = 121e18;
        bytes32 subject = _seed(keccak256("const"), navs);

        PerfScore.PerfSummary memory s = perf.summary(subject);
        assertEq(s.meanPeriodReturnBps, int256(1000));
        assertEq(s.volatilityBps, 0);
        assertEq(s.sharpeMilli, int256(0));
        assertEq(s.totalReturnBps, int256(2100)); // +21%
    }

    // ------------------------------------------------------------------ headline

    function test_headline_matchesSummary() public {
        bytes32 subject = _seed(keccak256("head"), _arr2(100e18, 150e18));
        (int256 tr, uint256 dd, uint256 samples) = perf.headline(subject);
        assertEq(tr, int256(5000)); // +50%
        assertEq(dd, 0);
        assertEq(samples, 2);
    }
}
