import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Backtester",
  description:
    "An offline, dependency-free strategy backtester that sanity-checks the entry/exit/sizing logic in strategies/ against historical bars — it tests consistency, not performance.",
  eyebrow: "13 — Backtester",
  blocks: [
    {
      type: "prose",
      md: "The [`backtest/`](/docs/configuration) directory holds an offline strategy backtester used to sanity-check the rule logic in [`strategies/`](/docs/strategies) — the entry, exit, and sizing rules of mean-reversion and left-side accumulation — against historical bars. It runs on plain `node` with **no `npm install`**, no Python, and no Docker.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Illustrative only — not a track record",
      md: "The backtester is **illustrative/demo**. It checks whether the rule logic is internally consistent, **not** whether a strategy makes money. Feeding it real bars does **not** constitute a track record or financial advice, and no performance is implied anywhere.",
    },
    {
      type: "prose",
      md: "Its real job is confidence, not returns: it validates that the caps and stops (per-trade cap, the −8% per-position stop, concentration limits) behave the way they are written before those rules ever touch a live account.",
    },
    {
      type: "heading",
      text: "The execution model",
    },
    {
      type: "prose",
      md: "The engine is event-driven, long-only, and single-symbol, kept deliberately conservative to avoid look-ahead:",
    },
    {
      type: "list",
      items: [
        "**Daily bars only**, no intraday. One decision per bar, evaluated on the **close**.",
        "**Next-bar-open fills:** a signal generated on bar *i*'s close is filled at bar *i+1*'s open. This removes look-ahead — the desk never trades on information from the same bar it acts on.",
        "**Slippage:** buys fill at `open × (1 + slippageBps/1e4)`, sells at `open × (1 − slippageBps/1e4)`.",
        "**Commission:** a flat `commissionUsd` per fill (entry tranche, add, and exit).",
        "**Risk-based sizing:** `shares = floor((riskPct% of NAV) / per-share-risk)`, then clamped by the per-trade cap, the concentration cap, and available cash.",
        "**Hard stop:** each position carries a `stopPrice`. If a bar closes at/below it, the position is flattened at the next open. For mean-reversion the stop is `entry × (1 − stopLossPct%)` — the −8% per-position guardrail.",
        "**Left-side accumulation** substitutes its own wider, risk-budgeted whole-position kill-stop, as that strategy prescribes (its 2% total-risk cap is what bounds the trade).",
        "**Single concurrent position.** Mean-reversion is one entry per setup; left-side may add **one** planned tranche to the same position — the defined exception documented in [Strategies & Risk](/docs/strategies).",
      ],
    },
    {
      type: "heading",
      text: "Default parameters",
    },
    {
      type: "prose",
      md: "The engine's `DEFAULT_PARAMS` mirror the caps in [`strategies/README.md`](/docs/strategies):",
    },
    {
      type: "table",
      headers: ["Parameter", "Default", "Meaning"],
      rows: [
        ["`startingEquityUsd`", "10000", "Starting NAV for the run."],
        ["`riskPerTradePct`", "1", "Risk budget per trade (mean-reversion default; raised to 2 for left-side)."],
        ["`perTradeCapPct`", "15", "Per-trade notional cap — the `strategies/README.md` per-trade cap."],
        ["`concentrationCapPct`", "25", "Max position weight — the concentration cap."],
        ["`stopLossPct`", "8", "The −8% per-position hard stop (mean-reversion)."],
        ["`commissionUsd`", "0", "Flat commission charged per fill."],
        ["`slippageBps`", "5", "Slippage applied to each fill, in basis points."],
      ],
    },
    {
      type: "heading",
      text: "Layout",
    },
    {
      type: "prose",
      md: "Everything is pure ES modules with no dependencies:",
    },
    {
      type: "code",
      lang: "text",
      code: `backtest/
├── engine.js                       # event-driven, long-only, single-symbol engine
├── indicators.js                   # indicator helpers (moving averages, RSI, etc.)
├── metrics.js                      # performance/consistency metrics
├── strategies/
│   ├── mean-reversion.js           # rule logic mirroring strategies/mean-reversion.md
│   └── left-side-accumulation.js   # planned scale-in (the defined averaging exception)
├── fixtures/
│   ├── uptrend.json                # synthetic bars for a rising regime
│   └── drawdown.json               # synthetic bars for a selloff regime
└── reports/                        # generated per-strategy report JSON`,
    },
    {
      type: "callout",
      tone: "info",
      title: "How the results reach the dashboard",
      md: "The full per-strategy report shape lives under `backtest/reports/<strategy>.json`. The compact, dashboard-facing summary of those reports is the optional `backtests[]` array in [`desk-state.json`](/docs/dashboard) — headline `metrics` plus a downsampled `equitySpark` for the inline sparkline. All of it is illustrative.",
    },
    {
      type: "note",
      md: "Add new strategies as self-contained, testable files in `backtest/strategies/` alongside their written rule in [`strategies/`](/docs/strategies).",
    },
    {
      type: "pills",
      items: ["Pure Node ESM", "No npm install", "Long only", "Daily bars", "Next-bar-open fills", "Illustrative"],
    },
  ],
};
