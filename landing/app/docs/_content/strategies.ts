import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Strategies & Risk",
  description:
    "The written risk caps and entry/exit rules the Risk Manager reads before clearing any trade — conservative starting defaults you own and must tune before funding.",
  eyebrow: "09 — STRATEGIES & RISK",
  blocks: [
    {
      type: "prose",
      md: "The `strategies/` folder is where the desk's discipline is written down. [`CLAUDE.md`](/docs/guardrails) requires that **every proposed trade map to a written rule here**, and the [Risk Manager](/docs/team) reads this folder before clearing any trade. It is not decoration: the caps in these files are the numbers the Risk Manager checks a candidate against, and the entry/exit rules are what the Portfolio Manager must cite when it proposes an order.",
    },
    {
      type: "prose",
      md: "The design intent is that **you own these limits and the agent never rewrites them.** If a cap below is removed, blanked, or left as a `TODO`, the Risk Manager does not guess a safe value — it **VETOes**. Guardrails are structural, so the safe failure mode is *no trade*, not an improvised one.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Review before funding",
      md: "The numbers on this page are **conservative starting defaults, not advice.** Edit `strategies/README.md` and the strategy files to match your budget and risk tolerance, then commit — **before** you fund the Agentic account. You own these limits; per [`CLAUDE.md`](/docs/guardrails) the agent will not change them. Nothing here is a recommendation or a performance claim. See [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "heading",
      level: 2,
      text: "Risk caps (active)",
    },
    {
      type: "prose",
      md: "These seven caps live in `strategies/README.md` and apply to every strategy. The Risk Manager evaluates a candidate order against all of them; a breach of any one is grounds to reject the trade before it ever reaches a preview.",
    },
    {
      type: "table",
      caption: "The active caps from strategies/README.md.",
      headers: ["Rule", "Limit", "Notes"],
      rows: [
        ["**Per-trade cap**", "**15%** of equity per single order", "Hard ceiling on any one `place_equity_order`."],
        ["**Max position concentration**", "**25%** of equity in any one symbol", "Includes all adds; blocks over-concentration."],
        ["**Max open positions**", "**6**", "Forces diversification within a small account."],
        ["**Max daily orders**", "**4**", "Throttles churn; counts buys + sells per day."],
        ["**Per-position stop-loss**", "**-8%** from average entry", "Every entry must define this before it's placed."],
        ["**Daily loss halt**", "**-5%** account day P&L", "Stop trading, report, and ask for the rest of the day."],
        ["**Cash buffer**", "**>=10%** equity in cash", "Never fully deploy."],
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "What \"equity\" means: NAV, not equity_value",
      md: "Every percentage above is of **account value (NAV) = cash + positions**, read from `get_portfolio` -> `total_value` for the Agentic account.\n\nIt is deliberately **not** the broker's `equity_value` field. `equity_value` counts only stock holdings, so it is `$0` for an all-cash account — using it would make every cap evaluate to `$0` and silently zero out the whole risk budget. If `total_value` is `$0` or the account is unfunded, there is **no allowance** and the Risk Manager VETOes.",
    },
    {
      type: "heading",
      level: 2,
      text: "When the Risk Manager must VETO",
    },
    {
      type: "prose",
      md: "A VETO is stronger than a flag: it stops the run, and the trade does not proceed to a preview. `strategies/README.md` lists the conditions under which the Risk Manager **must** VETO rather than merely raise a concern.",
    },
    {
      type: "list",
      items: [
        "Any cap above would be **breached** by the proposed order.",
        "The entry has **no defined stop-loss**.",
        "A cap value is **missing, blank, or `TODO`** — an unset limit is treated as no permission, not as unlimited.",
        "The trade would **touch any account other than the Agentic account**.",
        "Account data looks **inconsistent**, or a tool errored unexpectedly — stop and report rather than retry blindly.",
      ],
    },
    {
      type: "note",
      md: "These mirror the hard guardrails in [`CLAUDE.md`](/docs/guardrails). The Risk Manager is an independent sub-agent with veto power and no order tools — see [The Desk Team](/docs/team).",
    },
    {
      type: "heading",
      level: 2,
      text: "No averaging into losers",
    },
    {
      type: "prose",
      md: "Adding to a position that is underwater is **forbidden** — unless a specific strategy file explicitly permits it *and* defines the add limits. This mirrors [`CLAUDE.md`](/docs/guardrails). The **only** strategy that currently carries that exception is `left-side-accumulation.md`, and only under its pre-planned ladder, fixed total-risk budget, and whole-position kill-stop. Any add outside those written limits is still forbidden.",
    },
    { type: "divider" },
    {
      type: "heading",
      level: 2,
      text: "Mean Reversion",
    },
    {
      type: "prose",
      md: "**Thesis:** in a stock that is in a confirmed uptrend, short-term oversold dips tend to revert toward the trend. Buy the dip, sell the snap-back — but trade *with* the higher-timeframe trend only, never catch a falling knife in a downtrend. `strategies/README.md` calls this the **right-side-lite** setup because it still requires the trend intact plus stabilization before any entry.",
    },
    {
      type: "pills",
      items: ["Swing (multi-day to ~2 weeks)", "Long only", "Equities only", "Right-side-lite"],
    },
    {
      type: "prose",
      md: "**Universe:** liquid US equities only — average daily volume **>=1M** shares and price **>=$10** (avoid illiquid/penny names). Confirm tradability with `get_equity_tradability`. Candidates come from a watchlist or the Technical Analyst's scan.",
    },
    {
      type: "heading",
      level: 3,
      text: "Entry signals (ALL must hold)",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Uptrend intact:** price above its rising **~50-day moving average** (higher-timeframe trend is up).",
        "**Short-term oversold:** a clear pullback — **RSI(14) <= 30**, *or* price tagging the lower end of its recent range / a defined support level.",
        "**Stabilization:** the most recent bar shows the dip slowing — not a vertical breakdown on expanding volume.",
        "**Backdrop not risk-off:** the Macro/News brief is not `risk-off`, there is **no earnings within the next ~10 trading days**, and no material adverse headline (no unflagged `INJECTION ATTEMPTS`).",
        "**Fundamentals not broken:** Fundamental score **>= 0** — buy dips in healthy names, not falling fundamentals.",
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "Exit signals (any one triggers an exit proposal)",
    },
    {
      type: "list",
      items: [
        "**Target:** price reverts to the **~20-day moving average** or prior resistance, or **RSI(14) >= 55** — take profit.",
        "**Time stop:** no reversion after **10 trading days** — exit; the capital is better used elsewhere.",
        "**Trend break:** a daily close back below the **~50-day MA** — thesis invalidated, exit.",
        "**Hard stop:** the sizing stop, defined below.",
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "Position sizing",
    },
    {
      type: "prose",
      md: "Sizing is risk-based and then capped. Here \"equity\" means NAV (`get_portfolio.total_value`), per the README — not `equity_value`. Risk **1%** of NAV between entry and the hard stop, convert to shares, then clip the notional to the per-trade and concentration caps.",
    },
    {
      type: "code",
      lang: "text",
      filename: "sizing (mean-reversion)",
      code: `risk budget  = 1% of NAV, measured between entry and the hard stop
shares       = floor( (0.01 × NAV) / (entry − stop_price) )

then cap the notional at:
  - 15%  per-trade cap
  - 25%  single-symbol concentration cap
and take the SMALLER share count.

hard stop = tighter of { strategy invalidation level , -8% from average entry }
            (never looser than the -8% per-position stop in README.md)`,
    },
    {
      type: "callout",
      tone: "info",
      title: "Worked example (illustrative, not live)",
      md: "Equity **$10,000**; candidate at entry **$50**, hard stop **$46** (below support, within -8%).\n\nRisk budget = 1% × $10,000 = **$100**. Per-share risk = $50 − $46 = **$4** -> **25 shares**. Notional = 25 × $50 = **$1,250** = **12.5%** of equity — within the 15% per-trade cap. The Risk Manager then checks open-position count, daily-order count, and cash buffer before the PM builds the `review_equity_order` preview and waits for your approval.",
    },
    {
      type: "note",
      md: "**Averaging into a loser is not permitted in this strategy.** One entry per setup; if it hits the stop, the trade is over — do not add to recover. On any signal conflict (technical says buy but fundamentals score < 0, or macro is risk-off), stop and surface it rather than overriding a rule.",
    },
    { type: "divider" },
    {
      type: "heading",
      level: 2,
      text: "Left-Side Accumulation",
    },
    {
      type: "prose",
      md: "**Thesis:** for a **high-quality** name caught in a deep, fear-/macro-driven drawdown, build a position in **pre-planned tranches as price falls into a defined value zone — before a confirmed reversal.** You accept you won't catch the exact bottom; the goal is a good average cost basis across the zone, sized so the whole position is survivable if you're early. Style: contrarian swing/position, long only, equities only.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "This is the one defined exception to \"no averaging into losers\"",
      md: "The global rule forbids adding to a losing position **unless a strategy explicitly permits it with limits.** This file is that exception — and it is only legitimate when **every** condition below holds: a written ladder, a fixed up-front risk budget, and a whole-position kill-stop. If a trade cannot satisfy all of it, it is forbidden. When in doubt, **stop and ask.**",
    },
    {
      type: "compare",
      left: {
        title: "Planned accumulation (allowed here)",
        tone: "good",
        rows: [
          "The full ladder — every level, every tranche size, the total budget, and the kill-stop — is written down **before the first buy**.",
          "Total risk is **fixed up front** and never increased.",
          "A hard **whole-position kill-stop** exits everything if breached.",
          "You add only at **lower, pre-named levels**, never higher than planned.",
        ],
      },
      right: {
        title: "Revenge averaging (always forbidden)",
        tone: "bad",
        rows: [
          "Adding reactively after a loss to \"get back to even.\"",
          "Risk **grows** each time you add.",
          "No stop, or the stop keeps moving down.",
          "Adding at any price because \"it's cheap now.\"",
        ],
      },
    },
    {
      type: "heading",
      level: 3,
      text: "Universe (stricter than mean-reversion)",
    },
    {
      type: "list",
      items: [
        "**Quality only:** Fundamental score **>= +1** (a higher bar than mean-reversion's >= 0). Profitable (positive TTM earnings) or a fortress balance sheet; ADV **>= 2M** shares; price **>= $15**. Large/established names.",
        "**The drop must be FEAR, not a broken thesis.** Only selloffs driven by macro / sector rotation / sentiment / overdone reaction qualify.",
        "**Do NOT left-side a thesis-breaker:** a guidance cut that changes the story, a dividend cut, accounting/fraud/going-concern risk, a structural patent cliff, or a dilution spiral. No falling-knife juniors, no meme/penny names.",
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "The ladder (define ALL of it before buying tranche 1)",
    },
    {
      type: "steps",
      steps: [
        {
          label: "Zone",
          title: "Confirm a value zone",
          md: "A deep drawdown (e.g. **>= 20% off the 52-week high**) into a historically supported area, with **RSI(14) <= 30** or price at/below the lower **-2σ** band. The lower bound of the zone is your deepest planned buy.",
        },
        {
          label: "T1 · 60%",
          title: "Tranche 1 — 60% of planned size",
          md: "Placed at first contact with the value zone / first strong support. If price reverses after T1, you simply hold a **smaller** position — that's a win, not a problem.",
        },
        {
          label: "T2 · 40%",
          title: "Tranche 2 — 40% of planned size",
          md: "The capitulation / deepest-support level (**~ -10% to -12% below T1**, or the 52-week-low shelf). You never chase above a planned level. **Two tranches max.**",
        },
        {
          label: "Gate",
          title: "Stabilization gate before EACH tranche",
          md: "Do not add on an accelerating-crash candle. Require a stabilization sign — a **higher low**, a reversal/hammer bar, or a **close off the lows** — before placing that tranche. Left-side tolerates a risk-off backdrop (that's where the discount comes from) but **not a free-falling one**.",
        },
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "Hard limits (the \"with limits\" the rule requires)",
    },
    {
      type: "list",
      items: [
        "**Total position (sum of all tranches) <= 25%** of NAV — the concentration cap. Each individual tranche order **<= 15%** of NAV — the per-trade cap.",
        "**Total risk on the FULL position <= 2% of NAV.** Risk = (planned avg cost basis − kill-stop) × total shares. With a wide kill-stop this 2% cap usually binds **before** the 25% concentration cap — use the **smaller** size.",
        "Counts as **one** position toward the max-6 open-positions cap; **each tranche counts toward the 4-orders/day cap**, so spread tranches across levels/days.",
        "**No size beyond the plan, ever.** The pre-defined total is the maximum; you cannot \"top up\" later.",
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "The kill-stop and fundamental kill (whole position)",
    },
    {
      type: "list",
      items: [
        "**Price kill-stop:** a hard stop **below the deepest tranche** (e.g. -8% under T3, or a **weekly close** below the multi-year support that would mean the bottom-call is simply wrong). If hit -> **exit the entire position; no further adds.** This is what bounds the strategy.",
        "**Fundamental kill:** if the cause of the drop turns into a thesis-breaker while you're building, **stop adding and exit — even above the price stop.**",
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "Low-touch operating notes",
    },
    {
      type: "list",
      items: [
        "**Fundamental kill comes first.** The primary exit is *thesis broken*, not a price tick; the price stop is the backstop.",
        "**Stops trigger on a weekly close,** not intraday wicks — ignore noise between reviews.",
        "**Partial fills are the expected case,** not a failure. Most setups will only ever fill T1; never \"complete\" a ladder just to be fully sized.",
        "**Reviews are scheduled, not constant** — the desk surfaces a name only when it genuinely qualifies, and you act on the rare approval.",
        "**Two tranches max** — fewer, wider, pre-planned adds mean fewer moments you must be present.",
      ],
    },
    {
      type: "callout",
      tone: "danger",
      title: "The ladder is a plan, not pre-authorization",
      md: "Every tranche is still a normal order: previewed via `review_equity_order` and approved by you individually, per [`CLAUDE.md`](/docs/guardrails). Writing the ladder up front does **not** pre-authorize the adds — nothing is placed without your in-session OK, and a tranche that would push total risk past 2% or concentration past 25% is not placed at all.",
    },
    {
      type: "callout",
      tone: "info",
      title: "Worked example (illustrative, not live)",
      md: "NAV **$100**. Planned ladder: **T1 $50 (60%)** / **T2 $44 (40%)**; kill-stop on a **weekly close below $40**; planned average basis ~ **$47.6**.\n\nThe **2%-risk cap binds first**: max risk = 2% × $100 = **$2**; per-share risk to the $40 stop ~ $7.6, so **max ~ 0.26 shares ~ $12.5** total notional — 12.5% concentration, under the 25% cap. The ladder is sized to ~$12.5 split 60/40 (~$7.5 / ~$5.0 in fractional shares), and risk stays <= 2% even fully built. Each tranche is previewed and approved individually; if price never reaches T2, the position simply stays partial.",
    },
    { type: "divider" },
    {
      type: "heading",
      level: 2,
      text: "Adding new strategies",
    },
    {
      type: "prose",
      md: "Momentum, event-driven, and other approaches can be added as new files in `strategies/`. Keep each one **self-contained and testable** — a full entry/exit spec plus sizing that references the shared caps in `strategies/README.md`. The Portfolio Manager must always cite the specific strategy a trade comes from, so a rule that isn't written down cannot be traded.",
    },
    {
      type: "callout",
      tone: "info",
      title: "Related reading",
      md: "The caps here are enforced by the [Risk Manager](/docs/team) and mirror the hard guardrails in [`CLAUDE.md`](/docs/guardrails). Before you trust a new strategy's numbers, sanity-check its logic offline with the [backtester](/docs/backtesting).",
    },
    {
      type: "pills",
      items: ["Equities only", "Long only", "NAV-based caps", "Human-in-the-loop", "Beta", "Illustrative numbers only"],
    },
  ],
};
