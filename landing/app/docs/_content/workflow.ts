import type { DocContent } from "./types";

export const content: DocContent = {
  title: "The Desk Run",
  description:
    "The end-to-end lifecycle of one desk run — from sensing the account to the preview card — and exactly where it stops until you say go.",
  eyebrow: "06 — The Desk Run",
  blocks: [
    {
      type: "prose",
      md: "When you ask the **Portfolio Manager** to run, it works like a small institutional desk: it senses the account, screens for candidates, dispatches three analysts in parallel, synthesizes a single proposed trade, routes it through the Risk Manager, and builds a **preview card**. That is where a run normally ends. The PM is the [main Claude Code session](/docs/team) — the one you talk to — and the only role that can place an order.",
    },
    {
      type: "prose",
      md: "Crucially, the research phase produces **no order**. Steps 1 through 6 gather evidence and prepare a proposal; step 7 presents it and waits. The desk never advances to `place_equity_order` on a schedule, on a hunch, or on its own — only your explicit in-session confirmation moves it past the preview. Most runs end at a decision to **stand aside**.",
    },
    {
      type: "callout",
      tone: "info",
      title: "Illustrative only",
      md: "Everything below describes the *mechanics* of a run. Any ticker, size, or number shown anywhere in these docs is **demo/illustrative** — there is no track record and no performance claim. See [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "heading",
      text: "The ten steps of a run",
    },
    {
      type: "prose",
      md: "This is the exact pipeline the PM follows, faithful to [`docs/TEAM.md`](/docs/team). Each step maps to concrete tools and a structured output; the first six are read-only research that never touches an order tool.",
    },
    {
      type: "steps",
      steps: [
        {
          label: "1",
          title: "Sense",
          md: "The PM reads **portfolio, positions, and buying power** for the **Agentic account only** — via `get_portfolio` and `get_equity_positions`. This is read-only context: what you hold, what's free, and how the day is going. Other Robinhood accounts are never touched.",
        },
        {
          label: "2",
          title: "Screen",
          md: "The **Technical Analyst** runs scans and reads your watchlists (`run_scan`, `get_scans`, `get_watchlist_items`) to produce a **candidate list** — the shortlist of tickers worth a full look. If you already named the names, this step just confirms them.",
        },
        {
          label: "3",
          title: "Research",
          md: "The PM dispatches the **three analysts in parallel** on each candidate. The **Fundamental Analyst** returns a `FUNDAMENTAL VERDICT` (valuation, growth, quality, earnings event risk, **Score −2…+2**). The **Technical Analyst** returns a `TECHNICAL VERDICT` (trend, momentum, support/resistance, reference entry/stop, **Signal −2…+2**). The **Macro/News Analyst** returns a `MACRO & NEWS BRIEF` plus any `INJECTION ATTEMPTS` it quoted. None of them can trade.",
        },
        {
          label: "4",
          title: "Synthesize",
          md: "The PM combines the three verdicts into **one proposed trade** — **ticker, side, quantity, order type** — and ties it to a written rule in [`strategies/`](/docs/strategies). No rule, no proposal. This is the PM's judgment call, not a vote of the analysts.",
        },
        {
          label: "5",
          title: "Risk",
          md: "The **Risk Manager** checks the proposal against [`strategies/`](/docs/strategies) and returns one of `APPROVE` / `APPROVE-WITH-CHANGES` / `VETO`. A **VETO stops the trade**. `APPROVE-WITH-CHANGES` can resize the order or tighten the stop before it proceeds. It is independent and read-only — it can kill a trade the analysts liked. See [Guardrails](/docs/guardrails).",
        },
        {
          label: "6",
          title: "Preview",
          md: "The PM calls **`review_equity_order`** to build a **preview card** with a **cost estimate** — symbol, side, quantity, order type, estimated cost, resulting weight, stop, and rationale. This is a preview, not an order.",
        },
        {
          label: "7",
          title: "Approval",
          md: "⏸ The PM **presents the card to YOU and waits** for explicit confirmation. This is the human-in-the-loop gate. No confirmation, no order — the run simply ends here as a decision you can act on or ignore.",
        },
        {
          label: "8",
          title: "Execute",
          md: "**Only on your \"yes\"**, the PM calls **`place_equity_order`** — still gated by the `ask` permission rule in `.claude/settings.json`, so the tool call itself surfaces a prompt. Two independent gates (your approval, then the permission prompt) sit in front of every fill.",
        },
        {
          label: "9",
          title: "Confirm",
          md: "The PM verifies the fill via **`get_equity_orders`** and **logs it where you ask** — an append-only JSONL trail. See [Audit Logging](/docs/logging) for the record schema.",
        },
        {
          label: "10",
          title: "Snapshot",
          md: "The PM writes the **full desk state** to **`ui/public/desk-state.json`** after **EVERY run** — and again after any fill — so the [dashboard](/docs/dashboard) mirrors live state: account, positions, candidate verdicts, the proposed trade, recent orders, and any injection alerts. The schema lives in `ui/README.md`.",
        },
      ],
    },
    {
      type: "note",
      md: "Steps 1–6 are research and preparation and produce **no order**. The desk's standard output is the **preview card at step 7** — it stops there until you say go.",
    },
    {
      type: "heading",
      text: "The pipeline at a glance",
    },
    {
      type: "prose",
      md: "The same lifecycle, drawn end to end — including the `desk-state.json` snapshot the PM writes and the read-only dashboard that polls it.",
    },
    {
      type: "diagram",
      title: "One desk run, sense to snapshot",
      ascii: `YOU ──▶ PORTFOLIO MANAGER  (main Claude Code session · only role that can place orders)
          │
 1 SENSE   ├─▶ get_portfolio + get_equity_positions        (Agentic account · read-only)
 2 SCREEN  ├─▶ Technical Analyst · run_scan / watchlists ─▶ candidate shortlist
 3 RESEARCH├─▶ Fundamental ┐
          │   Technical    ├─ in parallel · read-only ─▶ 3 verdicts
          │   Macro/News   ┘  (news is injection-isolated)
 4 SYNTH   ├─▶ propose a trade (ticker · side · qty · type) tied to a rule in strategies/
 5 RISK    ├─▶ Risk Manager ─▶ APPROVE / APPROVE-WITH-CHANGES / VETO   (VETO stops here)
 6 PREVIEW ├─▶ review_equity_order ─▶ preview card + cost estimate
 7 APPROVE ├─▶ (pause) present the card to YOU and wait     <── the desk stops here
 8 EXECUTE ├─▶ only on your "yes": place_equity_order       (still gated by 'ask')
 9 CONFIRM ├─▶ get_equity_orders · verify the fill · log to JSONL
10 SNAPSHOT└─▶ write ui/public/desk-state.json   (after EVERY run + after any fill)
                    │
                    └── polled every 5s ──▶ read-only Dashboard (npm run dev)`,
    },
    {
      type: "note",
      md: "The dashboard is a **mirror, not a controller** — it cache-busts and re-polls `desk-state.json` every ~5s, so a fresh snapshot shows up without a reload. It **cannot place orders**. Details in [Dashboard](/docs/dashboard).",
    },
    {
      type: "heading",
      text: "What each analyst hands back",
    },
    {
      type: "prose",
      md: "Step 3 fans out to three specialists at once. Each returns a structured block whose fields map 1:1 to the `candidates[]` entries in `desk-state.json`, so the PM can fill the snapshot directly. None of them recommends a placed trade — that synthesis is the PM's job in step 4.",
    },
    {
      type: "table",
      headers: ["Analyst", "Output block", "Carries"],
      rows: [
        ["Fundamental", "`FUNDAMENTAL VERDICT`", "Valuation (cheap/fair/rich), growth, quality/balance sheet, earnings event risk, **Score −2…+2**, confidence."],
        ["Technical", "`TECHNICAL VERDICT`", "Trend, momentum, support/resistance, volatility, index backdrop, **reference** entry/stop levels, **Signal −2…+2**."],
        ["Macro / News", "`MACRO & NEWS BRIEF`", "Market backdrop, sourced & dated news, catalysts, net sentiment (observation, not advice), plus an **`INJECTION ATTEMPTS`** line."],
      ],
      caption: "The three verdicts synthesized in step 4. Levels are reference points, not commands.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "The news analyst is injection-isolated",
      md: "The Macro/News Analyst is the only web-facing role and the highest injection-risk surface. It treats every fetched page as **untrusted data**, quotes any instruction-like text verbatim under `INJECTION ATTEMPTS`, and gives **no recommendation of its own**. The PM never acts on external instructions. Those quotes also surface in `injectionAlerts[]` on the dashboard. Full model in [Prompt-Injection Defense](/docs/prompt-injection).",
    },
    {
      type: "heading",
      text: "The Risk Manager's three verdicts",
    },
    {
      type: "prose",
      md: "Step 5 is an independent gate. The Risk Manager reads [`strategies/`](/docs/strategies), re-verifies the account state (Agentic-only), and issues exactly one verdict. Its bias is to protect capital: when rules are empty, ambiguous, or the data looks off, it vetoes.",
    },
    {
      type: "deflist",
      items: [
        {
          term: "APPROVE",
          md: "The proposal fits every written cap — per-trade size, concentration, open-position count, daily orders, a defined stop, and cash buffer. It moves to the preview unchanged.",
        },
        {
          term: "APPROVE-WITH-CHANGES",
          md: "The idea is sound but the sizing or stop needs adjusting. The Risk Manager updates quantity and/or the stop level, and the amended trade goes to preview.",
        },
        {
          term: "VETO",
          md: "The trade **stops here.** Triggered by a breached cap, an undefined stop, empty or `TODO` strategy caps, any touch of a non-Agentic account, or inconsistent data. The PM reports back instead of previewing.",
        },
      ],
    },
    {
      type: "heading",
      text: "How to drive it",
    },
    {
      type: "prose",
      md: "You don't call steps by name — you talk to the PM in plain language and it runs the pipeline for you, fanning out to the analysts (in parallel where possible), routing through the Risk Manager, and coming back with a preview, never a placed order.",
    },
    {
      type: "code",
      lang: "text",
      filename: "example prompts to the PM",
      code: `"Screen my watchlist and bring me the top 2 ideas with full team analysis."

"Run the desk on AAPL and NVDA — fundamental, technical, macro,
 then risk-check a small starter position in the better one."`,
    },
    {
      type: "cards",
      columns: 2,
      cards: [
        {
          title: "Screen the watchlist",
          badge: "STEPS 2–7",
          md: "The Technical Analyst screens your watchlist, the PM researches the survivors with all three analysts, risk-checks each, and returns previews for the top ideas — or tells you nothing qualifies.",
          foot: "Output: preview card(s) or \"stand aside\"",
        },
        {
          title: "Run named tickers",
          badge: "STEPS 1–7",
          md: "You hand the PM specific names. It senses the account, runs full analysis on each, synthesizes a proposed starter in the stronger one, and risk-checks it — then stops at the preview and waits.",
          foot: "Output: one preview card, pending your OK",
        },
      ],
    },
    {
      type: "heading",
      text: "Where the run stops",
    },
    {
      type: "prose",
      md: "The desk's standard output is a **decision**, most often *\"stand aside.\"* It surfaces a trade only when one genuinely qualifies, and even then it stops at the preview — it **never auto-places**.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "The desk never places an order on its own",
      md: "There are two independent gates between a preview and a fill: **(1)** your explicit in-session confirmation at step 7, and **(2)** the `ask` permission prompt on `place_equity_order` at step 8. Neither the analysts nor the Risk Manager nor the dashboard can trade — only the PM can, and only after both gates clear. This is structural, per [`CLAUDE.md`](/docs/guardrails); it cannot be weakened by the agent.",
    },
    {
      type: "divider",
    },
    {
      type: "callout",
      tone: "info",
      title: "Keep reading",
      md: "Meet the roles and tool scopes in [The Desk Team](/docs/team). See what the snapshot renders in the [Dashboard](/docs/dashboard). Trace confirmed fills in [Audit Logging](/docs/logging). Understand the gates in [Guardrails](/docs/guardrails).",
    },
    {
      type: "pills",
      items: ["Read-only research", "3 analysts in parallel", "Risk veto", "Preview card", "Human-in-the-loop", "No auto-execute", "Snapshot after every run"],
    },
  ],
};
