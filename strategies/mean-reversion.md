# Strategy: Mean Reversion (oversold pullback in an uptrend)

**Thesis:** In a stock that is in a confirmed uptrend, short-term oversold dips tend to
revert toward the trend. Buy the dip, sell the snap-back. Trade *with* the higher-timeframe
trend only — never catch a falling knife in a downtrend.

**Style:** swing (multi-day to ~2 weeks). Equities only. Long only.

## Universe
- Liquid US equities only: average daily volume ≥ 1M shares and price ≥ $10
  (avoid illiquid/penny names). Confirm tradability with `get_equity_tradability`.
- Source candidates from a watchlist or the Technical Analyst's scan.

## Entry signals (ALL must hold)
Built from the **Technical Analyst**'s `TECHNICAL VERDICT` plus the
**Fundamental/Macro** sanity checks:
1. **Uptrend intact:** price above its rising ~50-day moving average (higher-timeframe
   trend = up).
2. **Short-term oversold:** a clear pullback — e.g. RSI(14) ≤ 30 **or** price tagging
   the lower end of its recent range / a defined support level.
3. **Stabilization:** the most recent bar shows the dip slowing (not a vertical
   breakdown on expanding volume).
4. **Backdrop not risk-off:** Macro/News brief is not `risk-off`, and there is **no
   earnings within the next ~10 trading days** (avoid event gaps) and no material
   adverse headline (no unflagged `INJECTION ATTEMPTS`).
5. **Fundamentals not broken:** Fundamental score ≥ 0 (we buy dips in healthy names,
   not falling fundamentals).

## Exit signals (any one triggers an exit proposal)
- **Target:** price reverts to the ~20-day moving average **or** prior resistance, or
  RSI(14) ≥ 55 — take profit.
- **Time stop:** no reversion after **10 trading days** → exit, capital is better used
  elsewhere.
- **Trend break:** daily close back below the ~50-day MA → thesis invalidated, exit.
- **Hard stop:** see below.

## Position sizing
- Risk-based, capped by `strategies/README.md`. "Equity" below means **account value
  (NAV = `get_portfolio.total_value`)**, per the README — not the broker `equity_value`.
  - Risk per trade = **1%** of NAV between entry and the hard stop.
    `shares = floor( (0.01 × NAV) / (entry − stop_price) )`.
  - Then **cap** the notional at the **15% per-trade** and **25% concentration** limits.
    Use the smaller share count.
- Hard stop = the strategy stop (trend/support invalidation) but **never looser than the
  −8% per-position stop** in `README.md`. Use whichever is tighter.

## Stop conditions / when to STOP and ask
- Any `README.md` cap would be breached → do not propose; ask.
- Signal conflict (e.g. technical says buy but fundamentals score < 0, or macro is
  risk-off) → stop and surface to the user instead of overriding rules.
- **Averaging into a loser is NOT permitted in this strategy.** One entry per setup; if
  it hits the stop, the trade is over — do not add to recover.

## Worked example (illustrative, not live)
Equity $10,000; candidate at entry $50, hard stop $46 (below support, within −8%).
- Risk budget = 1% × $10,000 = $100. Per-share risk = $50 − $46 = $4 → 25 shares.
- Notional = 25 × $50 = $1,250 = 12.5% of equity → within the 15% cap. ✅
- Risk Manager checks open-position count, daily-order count, cash buffer, then the PM
  builds the `review_equity_order` preview and waits for human approval.
