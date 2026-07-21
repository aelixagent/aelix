// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Guardrails
/// @author Aelix
/// @notice Pure, on-chain encoding of the Aelix desk risk rules defined in
///         `strategies/README.md` and `CLAUDE.md`. These are the SAME caps the
///         off-chain Risk Manager enforces — the difference is that here an agent
///         *cannot* bypass them: a violating order is rejected at the protocol
///         level, not merely discouraged by a prompt.
///
/// @dev    Design decisions (documented so the deviation from a naive reading is
///         deliberate, not a bug):
///         - All values that represent a fraction of NAV are basis points (bps):
///           100 bps = 1%, 10_000 bps = 100%. No floating point.
///         - Sizing / halt / throttle caps are scoped to **buys** (risk-INCREASING
///           orders). A guardrail must never trap capital, so risk-REDUCING sells
///           are always permitted here (subject only to the account being funded).
///           The vault layer adds one execution-quality bound to sells — a WIDE
///           oracle-relative fill guard ({RWAVault._enforceExecBound}) that blocks
///           only catastrophic/attacker fills, not ordinary de-risking. The off-chain
///           Risk Manager still previews sells per CLAUDE.md.
///         - `ordersToday` is the total buys+sells count (README: "counts buys +
///           sells"); once it hits the cap, further *buys* are blocked but exits
///           remain open.
library Guardrails {
    uint256 internal constant BPS = 10_000;

    /// @dev Risk caps. Mirrors `desk-state.json.riskCaps` and `strategies/README.md`.
    struct RiskCaps {
        uint16 perTradeBps; //         max single order as % of NAV   (default 1500 = 15%)
        uint16 maxConcentrationBps; // max value in one symbol        (default 2500 = 25%)
        uint8 maxOpenPositions; //     max distinct open positions    (default 6)
        uint8 maxDailyOrders; //       max buys+sells per day         (default 4)
        uint16 stopLossBps; //         required per-position stop     (default 800  = 8%)
        uint16 dailyLossHaltBps; //    halt buys past this day loss   (default 500  = 5%)
        uint16 cashBufferBps; //       min cash kept as % of NAV      (default 1000 = 10%)
    }

    /// @dev Everything one order needs to be judged. The caller (vault / executor)
    ///      computes these from its own book; the library holds no state.
    struct TradeContext {
        bool isBuy;
        uint256 nav; //                 cash + positions value; 0 => unfunded
        uint256 tradeNotional; //       order size in NAV units
        uint256 cashAfter; //           cash remaining after the order settles
        int256 dayPnl; //               signed day P&L in NAV units (negative = loss)
        uint8 ordersToday; //           orders already placed today (before this one)
        uint8 openPositionsAfter; //    distinct positions after this order
        uint256 positionValueAfter; //  value of THIS symbol after the order
        bool positionIsUnderwater; //   is the existing position underwater?
        bool leftSideException; //      covered by an approved left-side ladder?
        bool hasStop; //                does the entry define a stop-loss?
        bool dailyHalted; //            desk already halted for the day?
    }

    /// @dev Ordered by check precedence. `None` means the order is allowed.
    enum Violation {
        None,
        Unfunded,
        DailyLossHalt,
        PerTradeCap,
        MaxDailyOrders,
        Concentration,
        MaxPositions,
        CashBuffer,
        NoAveragingIntoLoser,
        MissingStop,
        NotAllowed, //           token is not on the vault allowlist   (preview-only sentinel)
        ZeroAmount, //           order amountIn is zero                (preview-only sentinel)
        InsufficientPosition, // sell exceeds the held balance         (preview-only sentinel)
        Paused //                vault is paused (deposits/trading)    (preview-only sentinel)
    }

    /// @notice Judge a single order against the caps. Pure — no state, no side effects.
    /// @return v `Violation.None` if allowed, else the first rule the order breaks.
    function evaluate(RiskCaps memory caps, TradeContext memory c)
        internal
        pure
        returns (Violation v)
    {
        // 0. Must be funded (README: unfunded => VETO).
        if (c.nav == 0) return Violation.Unfunded;

        // Risk-reducing sells are always allowed once funded; a guardrail must
        // never prevent de-risking. All caps below govern risk-INCREASING buys.
        if (!c.isBuy) return Violation.None;

        // 1. Daily loss halt — stop opening new risk for the rest of the day.
        if (c.dailyHalted) return Violation.DailyLossHalt;
        if (c.dayPnl < 0) {
            uint256 loss = uint256(-c.dayPnl);
            if (loss * BPS >= uint256(caps.dailyLossHaltBps) * c.nav) {
                return Violation.DailyLossHalt;
            }
        }

        // 2. Per-trade cap — hard ceiling on any one buy.
        if (c.tradeNotional * BPS > uint256(caps.perTradeBps) * c.nav) {
            return Violation.PerTradeCap;
        }

        // 3. Daily order throttle (count includes prior buys + sells).
        if (c.ordersToday >= caps.maxDailyOrders) {
            return Violation.MaxDailyOrders;
        }

        // 4. Concentration cap on the traded symbol (includes this add).
        if (c.positionValueAfter * BPS > uint256(caps.maxConcentrationBps) * c.nav) {
            return Violation.Concentration;
        }

        // 5. Max distinct open positions.
        if (c.openPositionsAfter > caps.maxOpenPositions) {
            return Violation.MaxPositions;
        }

        // 6. Cash buffer — never fully deploy.
        if (c.cashAfter * BPS < uint256(caps.cashBufferBps) * c.nav) {
            return Violation.CashBuffer;
        }

        // 7. No averaging into losers (unless an approved left-side ladder).
        if (c.positionIsUnderwater && !c.leftSideException) {
            return Violation.NoAveragingIntoLoser;
        }

        // 8. Every entry must define a stop-loss.
        if (!c.hasStop) {
            return Violation.MissingStop;
        }

        return Violation.None;
    }

    /// @notice Convenience boolean wrapper around {evaluate}.
    function isAllowed(RiskCaps memory caps, TradeContext memory c) internal pure returns (bool) {
        return evaluate(caps, c) == Violation.None;
    }
}
