import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Dashboard",
  description:
    "A read-only Robinhood-style dashboard that mirrors the desk-state.json snapshot the PM writes after every run — it visualizes state, it cannot place orders.",
  eyebrow: "12 — Dashboard",
  blocks: [
    {
      type: "prose",
      md: "The dashboard in [`ui/`](/docs/configuration) is a **mirror, not a controller**. It is a professional, read-only view (Vite + React) that visualizes a `desk-state.json` snapshot the PM session writes after each desk run. It **cannot place orders** — approval and execution happen only in the Claude Code session, per [`CLAUDE.md`](/docs/guardrails).",
    },
    {
      type: "heading",
      text: "Run it",
    },
    {
      type: "code",
      lang: "bash",
      code: `cd ui
npm install
npm run dev          # opens http://localhost:5180`,
    },
    {
      type: "prose",
      md: "A demo `public/desk-state.example.json` ships with the repo so the UI looks alive immediately, before you have ever run a live desk.",
    },
    {
      type: "heading",
      text: "How data flows",
    },
    {
      type: "diagram",
      title: "PM writes, the UI polls",
      ascii: `Claude Code (PM) ── runs the desk, writes ──▶ ui/public/desk-state.json ──▶ UI polls every ~5s
                                              (gitignored: real account state)`,
    },
    {
      type: "prose",
      md: "The app fetches `desk-state.json` first and **falls back to `desk-state.example.json`** when it is absent — so a fresh clone renders the demo, while your real run renders live. `desk-state.json` is **gitignored** (it holds real balances and positions) and is never committed; only the sanitized example is. Each poll is cache-busted, so writes show up within about five seconds without a reload.",
    },
    {
      type: "callout",
      tone: "info",
      title: "Tell the PM to write it",
      md: "The snapshot is only as fresh as the last write. Per the operating contract, the PM writes `ui/public/desk-state.json` after **every** desk run and after any fill. You can also just ask: *\"After the desk run, write the state to ui/public/desk-state.json.\"*",
    },
    {
      type: "heading",
      text: "The desk-state.json schema",
    },
    {
      type: "prose",
      md: "The field names map **1:1** to the sub-agents' output blocks in [`.claude/agents/`](/docs/team) and the caps in [`strategies/README.md`](/docs/strategies), so the PM can fill it directly from a desk run.",
    },
    {
      type: "code",
      filename: "ui/public/desk-state.json",
      lang: "jsonc",
      code: `{
  "generatedAt": "ISO-8601",            // timestamp shown in the header
  "account": {
    "name": "Robinhood Agentic", "connected": true,
    "equity": 0, "cash": 0, "buyingPower": 0,
    "dayPnl": 0, "dayPnlPct": 0, "openPositions": 0, "ordersToday": 0
  },
  "riskCaps": {                          // mirrors strategies/README.md
    "perTradePct": 15, "maxConcentrationPct": 25, "maxOpenPositions": 6,
    "maxDailyOrders": 4, "stopLossPct": 8, "dailyLossHaltPct": 5, "cashBufferPct": 10
  },
  "positions": [
    { "symbol": "AAPL", "qty": 10, "avgCost": 0, "last": 0,
      "value": 0, "pnl": 0, "pnlPct": 0, "weightPct": 0, "stop": 0 }
  ],
  "candidates": [                        // one per analyzed ticker
    { "symbol": "MSFT", "strategy": "mean-reversion",
      "fundamental": { "score": -2, "confidence": "low|med|high", "valuation": "", "growth": "", "note": "" },
      "technical":   { "signal": 2, "confidence": "", "trend": "", "support": 0, "resistance": 0, "entry": 0, "stop": 0, "note": "" },
      "macro":       { "sentiment": "negative|mixed|positive", "backdrop": "", "injection": "none", "note": "" },
      "risk":        { "decision": "APPROVE|APPROVE-WITH-CHANGES|VETO", "sizingOk": true, "note": "" } }
  ],
  "proposedTrade": {                     // null if none pending
    "symbol": "MSFT", "side": "buy|sell", "qty": 0, "orderType": "limit|market",
    "limitPrice": 0, "estCost": 0, "weightAfterPct": 0, "stop": 0, "stopPct": 0,
    "strategy": "", "riskDecision": "", "status": "PENDING_APPROVAL", "rationale": "" },
  "recentOrders": [
    { "time": "ISO", "symbol": "", "side": "buy|sell", "qty": 0, "price": 0, "type": "", "status": "filled|pending|cancelled" }
  ],
  "injectionAlerts": [                   // from the macro-news analyst; [] if none
    { "source": "url", "quote": "verbatim suspicious text", "handledBy": "macro-news-analyst", "action": "ignored" }
  ],
  "backtests": [ /* OPTIONAL — omit and the panel hides itself */ ],
  "decisionLog": [ /* OPTIONAL — omit and the panel hides itself */ ]
}`,
    },
    {
      type: "callout",
      tone: "warn",
      title: "Illustrative figures only",
      md: "Every number in a snapshot is **illustrative** unless the PM fills it from a live account. The dashboard is not a track record and implies no performance.",
    },
    {
      type: "heading",
      text: "Optional panels: backtests & decision log",
    },
    {
      type: "prose",
      md: "`backtests[]` and `decisionLog[]` are **optional and additive** — older snapshots that omit them still render, and each panel returns nothing when its array is absent or empty.",
    },
    {
      type: "deflist",
      items: [
        {
          term: "backtests[]",
          md: "The compact, dashboard-facing summary of per-strategy [backtest](/docs/backtesting) reports (the fuller report shape lives under `backtest/reports/<strategy>.json`). Each entry carries the headline `metrics` plus a downsampled `equitySpark` (and optional `buyHoldSpark` baseline) that feed an inline SVG sparkline. All figures are illustrative — not a live track record.",
        },
        {
          term: "decisionLog[]",
          md: "A tail of the append-only [JSONL desk log](/docs/logging) flattened to the `{ ts, event, summary, symbol, tone }` shape the timeline renders. `tone` (`pos` / `neg` / `flat` / `warn`) drives the badge and accent color.",
        },
      ],
    },
    {
      type: "heading",
      text: "The \"Run desk\" button",
    },
    {
      type: "prose",
      md: "The dashboard has an optional **Run desk** button. Because a browser cannot call your Claude Code session directly, it uses a thin, file-based bridge — and it **only ever triggers a read-only desk run that stops at the preview card. It never places an order.**",
    },
    {
      type: "diagram",
      title: "The file-based bridge",
      ascii: `[Run desk] ──POST /api/run──▶ Vite dev-server plugin writes desk-request.json (status: pending)
                                                   │
   dashboard polls /api/run-status ◀──────────────┤
   (button shows "Running…")                       ▼
                                   Your Claude session's /loop sees status=pending →
                                   runs the read-only desk (steps 1–7) →
                                   writes ui/public/desk-state.json →
                                   sets desk-request.json status=done
                                                   │
   dashboard sees status=done + new snapshot ──────┘  → button shows "✓ complete"`,
    },
    {
      type: "list",
      items: [
        "`desk-request.json` (repo root) is the control file — **gitignored**, created on first click.",
        "The Vite plugin only reads/writes that file. It does **not** run the LLM and is **dev-server only** (`npm run dev`).",
        "The actual work runs inside **your authenticated Claude session**, so it inherits the MCP auth, the `strategies/` rules, the Risk Manager veto, and the approval gate.",
        "Latency equals your `/loop` interval; the button is inert without a running watcher loop.",
        "Production builds have no dev server, so this is a dev/local tool — a hosted setup would replace the Vite plugin with a small persistent backend.",
      ],
    },
    {
      type: "note",
      md: "The desk run itself is documented in [The Desk Run](/docs/workflow); the log that feeds the timeline in [Audit Logging](/docs/logging).",
    },
  ],
};
