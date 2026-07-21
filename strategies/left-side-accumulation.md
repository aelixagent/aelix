# Strategy: Left-Side Accumulation (planned scale-in at support)

**Thesis:** For a **high-quality** name caught in a deep, fear-/macro-driven drawdown,
build a position in **pre-planned tranches as price falls into a defined value zone —
before a confirmed reversal.** You accept you won't catch the exact bottom; the goal is a
good average cost basis across the zone, sized so the whole position is survivable if
you're early.

**Style:** contrarian swing/position; **long only**; equities only.

## ⚠️ This is the *defined exception* to "no averaging into losers"

The global rule (`CLAUDE.md`, `strategies/README.md`) forbids adding to a losing position
**unless a strategy explicitly permits it with limits.** This file is that exception, and
it is only legitimate when **every** condition below holds. The line between *planned
accumulation* and *forbidden revenge-averaging* is:

| Planned accumulation (allowed here) | Revenge averaging (always forbidden) |
|---|---|
| The full ladder — every level, every tranche size, the total $ budget, and the kill-stop — is written down **before the first buy**. | Adding reactively after a loss to "get back to even." |
| Total risk is **fixed up front** and never increased. | Risk grows each time you add. |
| A hard **whole-position kill-stop** exits everything if breached. | No stop, or the stop keeps moving down. |
| You add only at **lower, pre-named levels**, never at a higher price than planned. | Adding at any price because "it's cheap now." |

If a trade can't satisfy the left column, it is forbidden. When in doubt → stop and ask.

## Universe (stricter than mean-reversion — you're buying weakness)
- **Quality only:** Fundamental score must be **≥ +1** (higher bar than mean-reversion's
  ≥0). Profitable (positive TTM earnings) **or** a fortress balance sheet; ADV ≥ 2M
  shares; price ≥ $15. Large/established names.
- **The drop must be FEAR, not a broken thesis.** Left-side only into selloffs driven by
  macro / sector rotation / sentiment / overdone reaction. **Do NOT** left-side a name
  dropping on a *thesis-breaker*: guidance cut that changes the story, dividend cut,
  accounting/fraud/going-concern risk, structural patent cliff, or dilution spiral.
- No falling-knife juniors, no meme/penny names.

## Entry — the ladder (define ALL of this BEFORE buying tranche 1)
1. **Confirm a value zone:** deep drawdown (e.g. ≥ 20% off the 52-week high) into a
   historically supported area, RSI(14) ≤ 30 (deep oversold) or price at/below the lower
   −2σ band. The lower bound of the zone is your deepest planned buy.
2. **Two tranches at named levels** (low-touch default — fewer decisions, wider spacing),
   written down up front:
   - **Tranche 1 — 60%** of planned size: first contact with the value zone / first strong
     support.
   - **Tranche 2 — 40%:** the capitulation / deepest-support level (≈ −10% to −12% below T1,
     or the 52w-low shelf).
   If price reverses after T1, you simply hold a **smaller** position — that's a win, not a
   problem. You never chase above a planned level.
3. **Stabilization gate before EACH tranche:** do not add on an accelerating-crash candle.
   Require an intraday/daily stabilization sign (a higher low, a reversal/hammer bar, or a
   close off the lows) before placing that tranche. Left-side tolerates a risk-off backdrop
   (that's where the discount comes from) **but not a free-falling one** — if the broad
   market is in disorderly decline with no stabilization, wait.

## Position sizing & the hard limits (this is the "with limits" the rule requires)
"Equity"/NAV = `get_portfolio.total_value` (per `strategies/README.md`).
- **Total position (sum of all tranches) ≤ 25%** of NAV (the concentration cap). Each
  individual tranche order **≤ 15%** of NAV (the per-trade cap).
- **Total risk on the FULL position ≤ 2% of NAV.** Risk = (planned avg cost basis −
  kill-stop) × total shares. Size the ladder so this holds. With a wide kill-stop, this
  2% cap usually binds **before** the 25% concentration cap — use the **smaller** size.
- Counts as **one** position toward the max-6 open-positions cap; each tranche counts
  toward the **4-orders/day** cap, so spread tranches across levels/days.
- **No size beyond the plan, ever.** The pre-defined total is the maximum; you cannot
  "top up" later.

## The kill-stop (thesis invalidation) — applies to the WHOLE position
- A hard stop **below tranche 3** (e.g. −8% under T3, or a **weekly close** below the
  multi-year support that would mean the bottom-call is simply wrong). If hit → **exit the
  entire position; no further adds.** This is what bounds the strategy.
- **Fundamental kill:** if the cause of the drop turns into a thesis-breaker while you're
  building, stop adding and exit — even above the price stop.

## Exit / profit
- **Scale out** into strength: trim on a 50DMA reclaim, at the prior breakdown level, and
  at RSI ≥ 55–60. Optionally hold a runner for full reversion to value while thesis intact.
- **Time stop:** if fully built and dead-money for **8–12 weeks** with no reversal,
  reassess; exit if the thesis is weakening.

## Low-touch operating notes (this account)
Tuned for an operator who is **not** watching intraday:
- **Fundamental kill comes first.** The primary exit is *thesis broken*, not a price tick —
  if the story breaks, exit regardless of price. The price stop is the backstop.
- **Stops trigger on a *weekly close*,** not intraday wicks — ignore noise between reviews.
- **Partial fills are the expected case,** not a failure. Most setups will only ever fill
  T1. Never "complete" a ladder just to be fully sized.
- **Reviews are scheduled, not constant.** The desk scans on a fixed cadence and only
  surfaces a name when it genuinely qualifies; you act on the rare approval, not daily.
- **Two tranches max.** Fewer, wider, pre-planned adds = fewer moments you must be present.

## Stop conditions / when to STOP and ask
- Any `README.md` cap would be breached, or completing a tranche would push total risk
  > 2% or concentration > 25% → do not place; ask.
- The drop looks thesis-driven rather than fear-driven → do not start/continue; ask.
- **Every tranche is still a normal order:** preview via `review_equity_order` and get
  explicit human approval per `CLAUDE.md`. The written ladder is a *plan*, **not**
  pre-authorization — nothing is placed without your in-session OK.

## Worked example (illustrative, NAV $100)
Quality name, deep oversold at $50; planned ladder T1 $50 (60%) / T2 $44 (40%); kill-stop on
a weekly close below $40. Planned avg basis ≈ $47.6.
- **Risk cap binds first:** max risk $2 (2% of $100); per-share risk to $40 stop ≈ $7.6 →
  **max ~0.26 shares total ≈ $12.5** notional (12.5% concentration — under the 25% cap). So
  the ladder is sized to ~$12.5 total, split 60/40 across the two levels (~$7.5 / $5.0,
  fractional shares). Risk stays ≤ 2% even fully built.
- Each tranche is previewed and approved individually; if price never reaches T2/T3, the
  position simply stays partial.

> Note: parameters above (drawdown threshold, tranche split, 2% position-risk, 8-week time
> stop) are conservative defaults — tune them in this file. The Risk Manager enforces
> whatever is written here.
