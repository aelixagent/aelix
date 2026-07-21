import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Glossary",
  description:
    "The terms, roles, tools, and risk caps that appear throughout the Aelix docs, in one place.",
  eyebrow: "16 — Glossary",
  blocks: [
    {
      type: "prose",
      md: "A quick reference for the vocabulary used across these docs. Where a term has its own page, the definition links to it.",
    },
    {
      type: "heading",
      text: "Roles & architecture",
    },
    {
      type: "deflist",
      items: [
        { term: "Portfolio Manager (PM)", md: "The **main Claude Code session** you talk to. It orchestrates the sub-agents and is the only role that can place orders — and only after your approval. See [The Desk Team](/docs/team)." },
        { term: "Sub-agent", md: "A specialist role defined as a Markdown file in `.claude/agents/` with its own restricted `tools:` list and `model:`. Loaded when Claude Code starts." },
        { term: "Human-in-the-loop (HITL)", md: "The structural rule that no order is placed without your explicit in-session approval. See [Guardrails](/docs/guardrails)." },
        { term: "Least privilege", md: "Each role holds only the tools its job needs. The analysts and Risk Manager have **no order tools**; only the PM does." },
        { term: "Claude Code", md: "The agent host Aelix runs inside. There is no separate backend server or Python orchestrator — the PM *is* the session. See [Architecture](/docs/architecture)." },
        { term: "MCP (Model Context Protocol)", md: "The protocol that connects Claude Code to the broker. Aelix uses one MCP server, `robinhood-trading`. See [MCP & Tools](/docs/mcp)." },
        { term: "robinhood-trading", md: "The single MCP server (HTTP transport, OAuth) that is the desk's only path to the account. Defined in `.mcp.json`." },
        { term: "Robinhood Agentic account", md: "The isolated, beta, equities-only account the desk may trade. Every other account is read-only for context." },
        { term: "OAuth", md: "The in-session authentication flow for the MCP server. The agent never sees your password; there is a Robinhood mobile verification step." },
      ],
    },
    {
      type: "heading",
      text: "The desk run",
    },
    {
      type: "deflist",
      items: [
        { term: "Preview card", md: "The desk's standard output: a summary of the proposed order (symbol, side, qty, order type, estimated cost, rationale) that the PM presents and waits on. Built by `review_equity_order`. See [The Desk Run](/docs/workflow)." },
        { term: "review_equity_order", md: "A read-only tool that builds an order preview without submitting anything. `allow`-ed, because it never transacts." },
        { term: "place_equity_order", md: "The tool that actually submits an order. Held only by the PM and gated behind an `ask` prompt." },
        { term: "Veto", md: "The Risk Manager's power to block a proposed trade outright. A VETO stops the trade; the PM reports back." },
        { term: "APPROVE-WITH-CHANGES", md: "A Risk Manager verdict that clears a trade only after specific changes (e.g. cut size to N, add a stop at $X)." },
        { term: "Scan", md: "A saved technical screen the Technical Analyst runs (`run_scan` / `get_scans`) to surface candidate tickers." },
        { term: "Watchlist", md: "A list of symbols the desk screens (`get_watchlist_items`); mutating watchlists is gated behind `ask`." },
        { term: "INJECTION ATTEMPTS", md: "The line in the Macro/News Analyst's brief where instruction-like text from the web is quoted verbatim and flagged, never obeyed. See [Prompt-Injection Defense](/docs/prompt-injection)." },
        { term: "Prompt injection", md: "External content that tries to act like an instruction (\"buy X now\", \"ignore your rules\"). Aelix treats all external content as untrusted data." },
      ],
    },
    {
      type: "heading",
      text: "Risk & strategy",
    },
    {
      type: "deflist",
      items: [
        { term: "NAV (total_value)", md: "Account value = cash + positions, read from `get_portfolio.total_value` for the Agentic account. **All** risk percentages are of NAV — not the broker `equity_value` field. See [Strategies & Risk](/docs/strategies)." },
        { term: "Per-trade cap", md: "**15%** of NAV — the hard ceiling on any single `place_equity_order`." },
        { term: "Concentration cap", md: "**25%** of NAV in any one symbol, including all adds." },
        { term: "Max open positions", md: "**6** — forces diversification within a small account." },
        { term: "Max daily orders", md: "**4** — throttles churn; counts buys + sells per day." },
        { term: "Stop-loss", md: "**−8%** from average entry — every entry must define this before it is placed." },
        { term: "Daily loss halt", md: "**−5%** account day P&L — stop trading, report, and ask for the rest of the day." },
        { term: "Cash buffer", md: "**≥10%** of NAV kept in cash — never fully deploy." },
        { term: "Mean reversion", md: "A strategy: buy oversold pullbacks inside a confirmed uptrend; long only, swing. One entry per setup, no averaging." },
        { term: "Left-side accumulation", md: "A strategy: planned, risk-budgeted scale-in at support in a quality name's fear-driven selloff. The **only** defined exception to \"no averaging into losers,\" bounded by a fixed total-risk budget and a whole-position kill-stop." },
        { term: "No averaging into losers", md: "Adding to an underwater position is forbidden unless a strategy file explicitly permits it with limits." },
      ],
    },
    {
      type: "heading",
      text: "State, tooling & operations",
    },
    {
      type: "deflist",
      items: [
        { term: "desk-state.json", md: "The snapshot the PM writes after each run; the [dashboard](/docs/dashboard) mirrors it. Real state is gitignored; only the sanitized example is committed." },
        { term: "injectionAlerts", md: "The array in `desk-state.json` where flagged injection attempts surface (source, quote, handledBy, action)." },
        { term: "decisionLog", md: "A tail of the JSONL audit log flattened for the dashboard timeline as `{ ts, event, summary, symbol, tone }`. See [Audit Logging](/docs/logging)." },
        { term: "JSONL audit log", md: "The append-only `logs/*.jsonl` trail — one JSON object per line — of every desk decision, written via `tools/desk-log.mjs`." },
        { term: "Backtester", md: "The offline, dependency-free engine in `backtest/` that sanity-checks strategy logic against historical bars — illustrative, not a track record. See [Backtester](/docs/backtesting)." },
        { term: "/loop", md: "The Claude Code mechanism used to run the read-only desk on a cadence (e.g. behind the dashboard's Run desk button)." },
        { term: "Kill switch", md: "Disconnecting the MCP from the Robinhood app or `claude mcp remove robinhood-trading` — the desk's hard stop." },
      ],
    },
    {
      type: "note",
      md: "Missing a term? The [FAQ](/docs/faq) covers scope and safety questions, and each reference page defines its own vocabulary in context.",
    },
  ],
};
