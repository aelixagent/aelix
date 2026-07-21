// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { DeskRegistry } from "../src/DeskRegistry.sol";
import { PerfScore } from "../src/PerfScore.sol";

contract DeskRegistryTest is Test {
    DeskRegistry reg;
    PerfScore perf;

    address constant DESK = address(0xD35C);
    address constant IMPOSTER = address(0xBAD);
    bytes32 constant SUBJECT = keccak256("aelix-vault-1");
    bytes32 constant SUBJECT_B = keccak256("aelix-vault-2");
    // Labels for the squat-proof self-namespace (the canonical, PerfScore-facing path).
    bytes32 constant LABEL = keccak256("aelix-label-1");
    bytes32 constant LABEL_B = keccak256("aelix-label-2");

    function setUp() public {
        reg = new DeskRegistry();
        perf = new PerfScore(reg);
    }

    // Raw attestation (front-runnable namespace; read only via reg.raw*).
    function _attest(bytes32 subject, uint64 epoch, uint256 nav) internal {
        vm.prank(DESK);
        reg.attest(subject, epoch, nav, int256(0), keccak256(abi.encode(epoch, nav)), "");
    }

    // Canonical self-attestation (squat-proof; the surface PerfScore consumes).
    function _attestSelf(bytes32 label, uint64 epoch, uint256 nav) internal {
        vm.prank(DESK);
        reg.attestSelf(label, epoch, nav, int256(0), keccak256(abi.encode(epoch, nav)), "");
    }

    function _subj(bytes32 label) internal view returns (bytes32) {
        return reg.subjectFor(DESK, label);
    }

    // ------------------------------------------------------------------ registry basics

    function test_firstAttest_claimsSubject() public {
        _attest(SUBJECT, 1, 100e18);
        assertEq(reg.attesterOf(SUBJECT), DESK);
        assertEq(reg.rawCount(SUBJECT), 1);
        assertEq(reg.rawLatest(SUBJECT).nav, 100e18);
    }

    function test_onlySubjectAttester_canAppend() public {
        _attest(SUBJECT, 1, 100e18);
        vm.prank(IMPOSTER);
        vm.expectRevert(DeskRegistry.NotSubjectAttester.selector);
        reg.attest(SUBJECT, 2, 110e18, 0, bytes32(0), "");
    }

    function test_epochMustStrictlyIncrease() public {
        _attest(SUBJECT, 5, 100e18);
        vm.prank(DESK);
        vm.expectRevert(DeskRegistry.EpochNotIncreasing.selector);
        reg.attest(SUBJECT, 5, 110e18, 0, bytes32(0), ""); // equal epoch rejected
    }

    function test_zeroNav_rejected() public {
        vm.prank(DESK);
        vm.expectRevert(DeskRegistry.ZeroNav.selector);
        reg.attest(SUBJECT, 1, 0, 0, bytes32(0), "");
    }

    function test_emptySubject_rejected() public {
        vm.prank(DESK);
        vm.expectRevert(DeskRegistry.EmptySubject.selector);
        reg.attest(bytes32(0), 1, 100e18, 0, bytes32(0), "");
    }

    function test_timestampIsChainStamped() public {
        vm.warp(1_800_000_000);
        _attest(SUBJECT, 1, 100e18);
        assertEq(reg.rawAt(SUBJECT, 0).timestamp, 1_800_000_000);
    }

    function test_latest_revertsWhenEmpty() public {
        vm.expectRevert(DeskRegistry.NoData.selector);
        reg.latest(SUBJECT);
    }

    // ------------------------------------------------------------------ PerfScore: monotonic up

    function test_perf_monotonicUp_noDrawdown() public {
        _attestSelf(LABEL, 1, 100e18);
        _attestSelf(LABEL, 2, 110e18);
        _attestSelf(LABEL, 3, 121e18); // +10% each step

        PerfScore.PerfSummary memory s = perf.summary(_subj(LABEL));
        assertEq(s.samples, 3);
        assertEq(s.startNav, 100e18);
        assertEq(s.endNav, 121e18);
        assertEq(s.totalReturnBps, int256(2100)); // +21%
        assertEq(s.maxDrawdownBps, 0);
        assertEq(s.meanPeriodReturnBps, int256(1000)); // +10% mean
        assertEq(s.volatilityBps, 0); // constant returns => 0 vol
        assertEq(s.sharpeMilli, int256(0)); // 0 vol => defined as 0
    }

    // ------------------------------------------------------------------ PerfScore: with drawdown

    function test_perf_withDrawdown_handComputed() public {
        // Series [100, 120, 90, 108] — every number hand-verified in the test comments.
        _attestSelf(LABEL_B, 1, 100e18);
        _attestSelf(LABEL_B, 2, 120e18);
        _attestSelf(LABEL_B, 3, 90e18);
        _attestSelf(LABEL_B, 4, 108e18);

        PerfScore.PerfSummary memory s = perf.summary(_subj(LABEL_B));
        assertEq(s.samples, 4);
        assertEq(s.totalReturnBps, int256(800)); // (108-100)/100 = +8%
        assertEq(s.maxDrawdownBps, 2500); // peak 120 -> trough 90 = -25%
        // returns: +2000, -2500, +2000  => mean = +500 bps
        assertEq(s.meanPeriodReturnBps, int256(500));
        // variance = ((1500^2)+(3000^2)+(1500^2))/3 = 4,500,000 ; sqrt = 2121
        assertEq(s.volatilityBps, 2121);
        // sharpe = 500 * 1000 / 2121 = 235 (milli)
        assertEq(s.sharpeMilli, int256(235));
    }

    function test_perf_empty_returnsZeroed() public view {
        PerfScore.PerfSummary memory s = perf.summary(keccak256("never-attested"));
        assertEq(s.samples, 0);
        assertEq(s.totalReturnBps, 0);
        assertEq(s.maxDrawdownBps, 0);
    }

    function test_perf_headline() public {
        _attestSelf(LABEL, 1, 100e18);
        _attestSelf(LABEL, 2, 150e18);
        (int256 tr, uint256 dd, uint256 samples) = perf.headline(_subj(LABEL));
        assertEq(tr, int256(5000)); // +50%
        assertEq(dd, 0);
        assertEq(samples, 2);
    }

    // ------------------------------------------------------------------ negative performance

    function test_perf_lossShowsNegativeReturn() public {
        _attestSelf(LABEL, 1, 100e18);
        _attestSelf(LABEL, 2, 80e18); // -20%
        PerfScore.PerfSummary memory s = perf.summary(_subj(LABEL));
        assertEq(s.totalReturnBps, int256(-2000));
        assertEq(s.maxDrawdownBps, 2000);
        assertEq(s.meanPeriodReturnBps, int256(-2000));
    }
}
