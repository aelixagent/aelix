import type { DocContent } from "./types";

export const content: DocContent = {
  title: "What is Aelix?",
  description:
    "Least-privilege AI trading: on Robinhood you approve every order; on-chain the agent holds a scoped, revocable, expiring key. An AI research desk in Claude Code — two surfaces, one rulebook.",
  eyebrow: "01, Overview",
  blocks: [
    {
      type: "prose",
      md: "**Least-privilege AI trading: on Robinhood you approve every order; on-chain the agent holds a scoped, revocable, expiring key.** Aelix is an AI research desk in Claude Code with two surfaces and one rulebook. The headline surface is the brokerage desk: it connects to a **Robinhood Agentic** account over [MCP](/docs/mcp) and behaves like a small institutional desk — a team of specialist AI analysts screens your watchlist, debates each candidate, and hands you a one-click **preview card**. You approve; it places. It never places an order without your yes, and that isn't changing.",
    },
    {
      type: "prose",
      md: "Every safeguard on the desk is structural, not aspirational, and a stranger can verify each one on their own laptop: the analysts hold **no order tools** in their `.claude/agents/*.md` frontmatter, an independent Risk Manager can veto any trade, orders sit behind a `deny → ask → allow` permission gate, the written guardrails in [`CLAUDE.md`](/docs/guardrails) cannot be weakened by the agent, and the kill switch is one command: `claude mcp remove robinhood-trading`.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Real money · beta · not investment advice",
      md: "Robinhood Agentic Trading is in **beta** (US, equities only). The desk trades only inside an isolated Agentic account funded with a dedicated budget, **that budget is the most it can ever lose**. There is no track record and no performance claim anywhere in this project. It is a reference architecture for learning. Run it at your own risk and monitor it yourself. See [Safety & Disclaimer](/docs/disclaimer).\n\nThe separate on-chain vault is **mainnet, unaudited**, with **no timelock on owner caps**, deposits capped at **10,000 USDG**, and **no depositors, no trades, no track record**. Aelix is not affiliated with Robinhood.",
    },
    {
      type: "heading",
      text: "Two surfaces, one rulebook",
    },
    {
      type: "prose",
      md: "The second surface is the **on-chain vault** on Robinhood Chain — explicitly labeled, operator-funded, and separate from the desk. There, the risk caps are compiled into a vault that **reverts any order breaching them**, and the agent's key is separately scoped by **expiry, size, budget, trade count and ticker** — a rejected order spends none of that budget. The desk is how we develop the rulebook; the vault is how that rulebook becomes code. Mechanics in [Architecture](/docs/architecture#the-separate-on-chain-module).",
    },
    {
      type: "prose",
      md: "The geographic split is a chosen constraint, not an accident: the desk is US, beta, equities; the Stock Tokens the vault trades are **not for US persons** and are price-tracking instruments, **not shares**. Two doors, one brand — not a funnel from one into the other.",
    },
    {
      type: "callout",
      tone: "info",
      title: "The first number we publish will be how often the vault said no",
      md: "Not returns — there are none, and TVL is 0. A refusal rate is the only metric this project can accumulate honestly today, and the plumbing for it is real: `previewTrade()` returns the exact rule an order would break **before** anyone signs, a refused order consumes **none** of the session budget, and the append-only `DeskRegistry` keeps every refusal and veto on the record, where it cannot be pruned.",
    },
    {
      type: "heading",
      text: "The core idea",
    },
    {
      type: "prose",
      md: "Retail traders rarely get a second opinion. Aelix gives you five: a **Portfolio Manager** who orchestrates the run, three **analysts** who gather evidence in parallel, and a **Risk Manager** who can kill a trade the analysts liked. The output of a run is almost never an order, it's a decision, most often *\"stand aside.\"*",
    },
    {
      type: "cards",
      columns: 2,
      cards: [
        {
          title: "A team, not one prompt",
          badge: "MULTI-AGENT",
          md: "Fundamental, Technical, and Macro/News analysts gather evidence at the same time. An independent Risk Manager reviews the synthesis and can veto it.",
        },
        {
          title: "Human-in-the-loop",
          badge: "STRUCTURAL",
          md: "Only the PM can place orders, and only after your explicit in-session approval. No order is ever placed on a schedule or on its own.",
        },
        {
          title: "Prompt-injection-aware",
          badge: "CONTAINED",
          md: "The news analyst treats every fetched page as untrusted data. Instruction-like text is quoted and flagged, never obeyed.",
        },
        {
          title: "A real dashboard",
          badge: "READ-ONLY",
          md: "A Robinhood-style UI mirrors the desk's state live from a snapshot the PM writes after every run. It cannot place orders.",
        },
      ],
    },
    {
      type: "heading",
      text: "What a desk run looks like",
    },
    {
      type: "prose",
      md: "You talk to the desk in plain language. It senses the account, screens your watchlist, researches the survivors with three analysts, synthesizes a candidate trade tied to a written rule, risk-checks it, and stops at a preview card. The full pipeline is documented in [The Desk Run](/docs/workflow).",
    },
    {
      type: "diagram",
      title: "One desk run, end to end",
      ascii: `YOU ──▶ PORTFOLIO MANAGER (main Claude Code session · only role that can order)
              │
   1. SENSE   ├─▶ read portfolio + positions (Agentic account only, read-only)
   2. SCREEN  ├─▶ Technical Analyst runs scans ─▶ candidate shortlist
   3. RESEARCH├─▶ Fundamental ┐
              │   Technical    ├─ in parallel, read-only ─▶ 3 verdicts
              │   Macro/News   ┘  (news is injection-isolated)
   4. SYNTH   ├─▶ propose a trade tied to a rule in strategies/
   5. RISK    ├─▶ Risk Manager ─▶ APPROVE / CHANGES / VETO   (veto stops here)
   6. PREVIEW ├─▶ review_equity_order ─▶ build a preview card
   7. APPROVE ├─▶ ⏸ present to YOU and wait                  ← the desk stops here
   8. EXECUTE ├─▶ only on your "yes": place_equity_order (still gated by 'ask')
   9. CONFIRM └─▶ verify the fill · write desk-state.json · log to JSONL`,
    },
    {
      type: "note",
      md: "Steps 1–6 are research and produce **no order**. The desk's standard output is the preview card at step 7, it stops there until you say go.",
    },
    {
      type: "heading",
      text: "Bot that YOLOs vs. the Aelix desk",
    },
    {
      type: "compare",
      left: {
        title: "A bot that YOLOs",
        tone: "bad",
        rows: [
          "Auto-executes on a hunch",
          "One black-box prompt",
          "No independent risk check",
          "Acts on hype it reads online",
          "Can reach your whole balance",
        ],
      },
      right: {
        title: "The Aelix desk",
        tone: "good",
        rows: [
          "Stops at a preview, you place the order",
          "A team of four specialist analysts",
          "Independent risk manager with veto",
          "Quotes suspicious “instructions”, ignores them",
          "Isolated Agentic budget only",
        ],
      },
    },
    {
      type: "heading",
      text: "What's in the box",
    },
    {
      type: "table",
      headers: ["Component", "Where", "What it does"],
      rows: [
        ["Portfolio Manager", "main Claude Code session", "Orchestrates the run; the **only** role that can place orders, after your approval."],
        ["The desk team", "`.claude/agents/*.md`", "Four least-privilege sub-agents: three analysts + a Risk Manager with veto."],
        ["Guardrails", "`CLAUDE.md` + `.claude/settings.json`", "The operating contract plus a `deny → ask → allow` permission gate."],
        ["Strategies", "`strategies/*.md`", "Written risk caps and entry/exit rules the Risk Manager enforces."],
        ["Dashboard", "`ui/` (Vite + React)", "Read-only mirror of `desk-state.json`. Cannot trade."],
        ["Backtester", "`backtest/` (Node ESM)", "Offline, dependency-free sanity check of strategy logic."],
        ["Audit log", "`logs/` + `tools/desk-log.mjs`", "Append-only JSONL trail of every desk decision."],
      ],
    },
    {
      type: "heading",
      text: "Who it's for",
    },
    {
      type: "list",
      items: [
        "**Builders** studying multi-agent orchestration, MCP, and human-in-the-loop design on a real, high-stakes surface.",
        "**Retail traders** who want a structured second opinion, and a desk that mostly tells them to wait.",
        "**Anyone** who wants agent guardrails they can read, audit, and edit, not trust blindly.",
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "New here?",
      md: "Start with the [Quickstart](/docs/quickstart) for the fastest path from clone to first desk run, then read [Installation & Setup](/docs/setup) to connect the broker. To understand *how* it works, read [Architecture](/docs/architecture) and [The Desk Team](/docs/team).",
    },
    {
      type: "pills",
      items: ["Equities only", "Long only", "USD", "Human-in-the-loop", "MCP", "Claude Code native", "Beta"],
    },
  ],
};
