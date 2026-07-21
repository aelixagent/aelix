# Strategies

Trading rules for the Robinhood Agentic desk. `CLAUDE.md` requires **every proposed
trade to map to a written rule here**, and the Risk Manager reads this folder before
clearing any trade. If a cap below is removed or left unset, the Risk Manager VETOes.

> ⚠️ **REVIEW BEFORE FUNDING.** The numbers below are conservative starting defaults,
> not advice. Edit them to match your budget and risk tolerance, then commit. You own
> these limits — the agent will not change them (per `CLAUDE.md`).

## Risk caps (active)

All percentages are of **account value (NAV) = cash + positions**, read from
`get_portfolio` → `total_value` for the Agentic account — **not** the broker's
`equity_value` field (that counts only stock holdings, so it is `$0` for an all-cash
account and would make every cap evaluate to `$0`). If `total_value` is `$0`/unfunded,
there is no allowance and the Risk Manager VETOes.

| Rule | Limit | Notes |
|------|-------|-------|
| **Per-trade cap** | **15%** of equity per single order | Hard ceiling on any one `place_equity_order`. |
| **Max position concentration** | **25%** of equity in any one symbol | Includes all adds; blocks over-concentration. |
| **Max open positions** | **6** | Forces diversification within a small account. |
| **Max daily orders** | **4** | Throttles churn; counts buys + sells per day. |
| **Per-position stop-loss** | **−8%** from average entry | Every entry must define this before it's placed. |
| **Daily loss halt** | **−5%** account day P&L | Stop trading, report, and ask for the rest of the day. |
| **Cash buffer** | **≥10%** equity in cash | Never fully deploy. |

### No averaging into losers
Adding to a position that is underwater is **forbidden** unless a specific strategy file
below explicitly permits it *and* defines the add limits. This mirrors `CLAUDE.md`. The
**only** strategy that currently carries that exception is
[`left-side-accumulation.md`](left-side-accumulation.md) — and only under its pre-planned
ladder, fixed total-risk budget, and whole-position kill-stop. Any add outside those
written limits is still forbidden.

### When the Risk Manager must VETO (not just flag)
- Any cap above would be breached by the proposed order.
- The entry has no defined stop-loss.
- A cap value here is missing, blank, or `TODO`.
- The trade would touch any account other than the **Agentic** account.
- Account data looks inconsistent or a tool errored unexpectedly.

## Active strategies

Each strategy is one file describing entry signals, exit signals, position sizing, and
stop conditions. The PM must cite the specific strategy a trade comes from.

- [`mean-reversion.md`](mean-reversion.md) — buy oversold pullbacks inside an uptrend
  (right-side-lite: requires the trend intact + stabilization).
- [`left-side-accumulation.md`](left-side-accumulation.md) — contrarian: planned,
  risk-budgeted scale-in at support in a quality name's fear-driven selloff (the defined
  exception to "no averaging into losers").

Add momentum/event-driven/etc. as new files; keep each self-contained and testable.
