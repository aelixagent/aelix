// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { DeskRegistry } from "./DeskRegistry.sol";

/// @title PerfScore
/// @author Aelix
/// @notice Computes a verifiable performance summary from a desk's on-chain NAV
///         series in {DeskRegistry}. Everything is derived from attested data, so
///         the numbers cannot be inflated: total return, max drawdown, per-period
///         volatility (stddev of returns) and a Sharpe-like ratio, all in integer
///         basis points. Intended to be called off-chain via `eth_call` (loops
///         over the series), but on-chain callers can use it too.
contract PerfScore {
    uint256 internal constant BPS = 10_000;

    DeskRegistry public immutable registry;

    struct PerfSummary {
        uint256 samples; //             number of attestations
        uint256 startNav;
        uint256 endNav;
        int256 totalReturnBps; //       (endNav/startNav - 1) in bps
        uint256 maxDrawdownBps; //      worst peak-to-trough decline in bps
        int256 meanPeriodReturnBps; //  mean of per-attestation returns
        uint256 volatilityBps; //       stddev of per-attestation returns
        int256 sharpeMilli; //          mean/stddev * 1000 (0 if <2 samples or 0 vol)
        uint64 firstTs;
        uint64 lastTs;
    }

    constructor(DeskRegistry registry_) {
        registry = registry_;
    }

    /// @notice Full performance summary for `subject`.
    function summary(bytes32 subject) public view returns (PerfSummary memory s) {
        (uint256[] memory navs, uint64[] memory ts) = registry.series(subject);
        uint256 n = navs.length;
        s.samples = n;
        if (n == 0) return s;

        s.startNav = navs[0];
        s.endNav = navs[n - 1];
        s.firstTs = ts[0];
        s.lastTs = ts[n - 1];
        // forge-lint: disable-next-line(unsafe-typecast) — ratio*BPS of 18-dec NAVs is << int256 max
        s.totalReturnBps = int256((navs[n - 1] * BPS) / navs[0]) - int256(BPS);

        // Max drawdown over the running peak.
        uint256 peak = navs[0];
        uint256 maxDD;
        for (uint256 i = 1; i < n; ++i) {
            if (navs[i] > peak) {
                peak = navs[i];
            } else {
                uint256 dd = ((peak - navs[i]) * BPS) / peak;
                if (dd > maxDD) maxDD = dd;
            }
        }
        s.maxDrawdownBps = maxDD;

        if (n < 2) return s; // returns/vol need at least two samples

        uint256 m = n - 1;
        int256[] memory r = new int256[](m);
        int256 sum;
        for (uint256 i = 0; i < m; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast) — 18-dec NAV values are << int256 max
            int256 ri = ((int256(navs[i + 1]) - int256(navs[i])) * int256(BPS)) / int256(navs[i]);
            r[i] = ri;
            sum += ri;
        }
        // forge-lint: disable-next-line(unsafe-typecast) — m is an array length, tiny
        int256 mean = sum / int256(m);
        s.meanPeriodReturnBps = mean;

        uint256 varSum;
        for (uint256 i = 0; i < m; ++i) {
            int256 d = r[i] - mean;
            // forge-lint: disable-next-line(unsafe-typecast) — d*d is a non-negative square
            varSum += uint256(d * d);
        }
        uint256 variance = varSum / m;
        uint256 stddev = Math.sqrt(variance);
        s.volatilityBps = stddev;
        // forge-lint: disable-next-line(unsafe-typecast) — stddev is a bps-scale sqrt, tiny
        s.sharpeMilli = stddev == 0 ? int256(0) : (mean * 1000) / int256(stddev);
    }

    /// @notice Gas-cheap headline: total return and max drawdown only.
    function headline(bytes32 subject)
        external
        view
        returns (int256 totalReturnBps, uint256 maxDrawdownBps, uint256 samples)
    {
        PerfSummary memory s = summary(subject);
        return (s.totalReturnBps, s.maxDrawdownBps, s.samples);
    }
}
