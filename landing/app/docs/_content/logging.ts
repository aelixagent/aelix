import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Audit Logging",
  description:
    "An append-only JSONL trail of every desk decision — runs, approvals, order events, halts, and injection attempts — written through a dependency-free helper.",
  eyebrow: "14 — Audit Logging",
  blocks: [
    {
      type: "prose",
      md: "The desk keeps an **append-only** record of what it did: every desk run, every approval, every order event, every trading halt, and every prompt-injection attempt the [Macro/News Analyst](/docs/prompt-injection) flags. This realizes the project's Transparency & Audit principle and satisfies [`CLAUDE.md`](/docs/guardrails) step 6 — *log it where the user asks*.",
    },
    {
      type: "callout",
      tone: "info",
      title: "Logging records decisions; it does not make them",
      md: "This is **documentation + tooling only**. It records what happened; it does not authorize anything and weakens no guardrail. The PM still previews every order and never auto-places one — writing a log line is **not** approval, and nothing in the log can be used as one.",
    },
    {
      type: "heading",
      text: "Where the log lives",
    },
    {
      type: "code",
      lang: "text",
      code: `logs/
├── desk-runs.example.jsonl   # committed demo arc (illustrative only, not a track record)
├── desk-runs.jsonl           # real, gitignored — holds live account decisions
├── .gitignore                # ignores *.jsonl EXCEPT the example
└── .gitkeep                  # keeps the dir in git even when only real logs exist`,
    },
    {
      type: "prose",
      md: "Real logs are **gitignored**, exactly like [`ui/public/desk-state.json`](/docs/dashboard). Only the sanitized `*.example.jsonl` is committed, so a fresh clone has something to read. Everything is illustrative unless fed real data.",
    },
    {
      type: "heading",
      text: "Format: one JSON object per line",
    },
    {
      type: "list",
      items: [
        "**One record = one line.** No pretty-printing, no array wrapping the file.",
        "**Append-only.** New records are appended; existing lines are never edited, reordered, or deleted. An audit trail you can rewrite is not an audit trail.",
        "**UTF-8**, newline-terminated. Blank lines are ignored by the tooling.",
      ],
    },
    {
      type: "prose",
      md: "Every line carries three **required** keys — `ts` (ISO-8601 with timezone offset), `event`, and `session` — plus a few descriptive fields per event. A one-line `summary` is recommended on every record; the dashboard uses it verbatim.",
    },
    {
      type: "prose",
      md: "`event` is one of six values: `desk_run`, `approval`, `order_placed`, `order_filled`, `halt`, `injection`.",
    },
    {
      type: "heading",
      text: "Per-event fields",
    },
    {
      type: "deflist",
      items: [
        { term: "desk_run", md: "One entry per pass. `tickers` (screened symbols), `proposed` (the proposed trade or `null`, shaped `{ symbol, side, qty, strategy, riskDecision }`), `vetoes` (symbols the Risk Manager vetoed), `injectionAlerts` (count flagged), `summary`." },
        { term: "approval", md: "The human decision on a preview card. `symbol`, `decision` (`approved` / `rejected`), `by` (e.g. `user`), `summary`." },
        { term: "order_placed", md: "An order was submitted — only ever after an `approval`. `symbol`, `side`, `qty`, `type` (`limit` / `market`), optional `limitPrice`, `status` (e.g. `submitted`), `summary`." },
        { term: "order_filled", md: "A fill confirmation. `symbol`, `qty` (filled), `price`, `status` (e.g. `filled`), `summary`." },
        { term: "halt", md: "The desk stopped trading (e.g. the daily-loss halt). `reason` (e.g. `daily-loss-halt`), optional `dayPnlPct` and `limitPct`, `symbol` usually `null` (account-level), `summary`." },
        { term: "injection", md: "A prompt-injection attempt the Macro/News Analyst flagged, recorded **as a quote** and never acted on. `source`, `quote` (verbatim), `handledBy` (usually `macro-news-analyst`), `action` (quoted and ignored), `symbol` usually `null`, `summary`." },
      ],
    },
    {
      type: "heading",
      text: "Example arc",
    },
    {
      type: "code",
      filename: "logs/desk-runs.example.jsonl",
      lang: "json",
      code: `{"ts":"2026-07-11T10:05:00-04:00","session":"demo","event":"desk_run","tickers":["MSFT","NVDA"],"summary":"Screened 2; proposed BUY 3 MSFT (mean-reversion); NVDA vetoed.","proposed":{"symbol":"MSFT","side":"buy","qty":3,"strategy":"mean-reversion","riskDecision":"APPROVE"},"vetoes":["NVDA"],"injectionAlerts":1}
{"ts":"2026-07-11T10:07:30-04:00","session":"demo","event":"approval","symbol":"MSFT","decision":"approved","by":"user"}
{"ts":"2026-07-11T10:07:31-04:00","session":"demo","event":"order_placed","symbol":"MSFT","side":"buy","qty":3,"type":"limit","limitPrice":415.5,"status":"submitted"}
{"ts":"2026-07-11T10:07:45-04:00","session":"demo","event":"order_filled","symbol":"MSFT","qty":3,"price":415.5,"status":"filled"}`,
    },
    {
      type: "heading",
      text: "The helper: tools/desk-log.mjs",
    },
    {
      type: "prose",
      md: "`tools/desk-log.mjs` is a **pure Node ESM** helper (no dependencies) that validates and appends records. `appendRecord` throws — writing nothing — if `ts`, `event`, or `session` is missing or if `event` is outside the enum, so a malformed record can never enter the trail.",
    },
    {
      type: "code",
      lang: "text",
      code: `Library:
  appendRecord(file, record)  → validate required keys + event enum, then append exactly one line
  readTail(file, n)           → last n parsed records (oldest → newest)
  toDeskState(records)        → map records to the dashboard decisionLog tail
  validateFile(file)          → { ok, count, errors: [{ line, message }] }

CLI:
  node tools/desk-log.mjs validate  <file.jsonl>       parse + assert every line
  node tools/desk-log.mjs tail      <file.jsonl> [n]   pretty-print last n
  node tools/desk-log.mjs deskstate <file.jsonl> [n]   print decisionLog[] JSON`,
    },
    {
      type: "callout",
      tone: "warn",
      title: "Order of operations still holds",
      md: "An `order_placed` line should only ever appear **after** an `approval` line for the same symbol. The log documents that sequence — it does not authorize skipping it.",
    },
    {
      type: "heading",
      text: "Mapping to the dashboard",
    },
    {
      type: "prose",
      md: "The log surfaces on the [dashboard](/docs/dashboard) as a `decisionLog` array — a compact tail flattened to `{ ts, event, summary, symbol, tone }`. `tone` drives the badge/accent color and is derived deterministically:",
    },
    {
      type: "table",
      headers: ["Event", "tone"],
      rows: [
        ["`order_filled`", "`pos`"],
        ["`approval`", "`pos` if approved, `neg` if rejected, else `flat`"],
        ["`order_placed`", "`flat`"],
        ["`desk_run`", "`warn` if `injectionAlerts > 0`, else `flat`"],
        ["`halt`", "`neg`"],
        ["`injection`", "`warn`"],
      ],
    },
    {
      type: "prose",
      md: "Generate the array and paste it into `desk-state.json` after a run:",
    },
    {
      type: "code",
      lang: "bash",
      code: `node tools/desk-log.mjs deskstate logs/desk-runs.jsonl 20`,
    },
    {
      type: "note",
      md: "Related: [Prompt-Injection Defense](/docs/prompt-injection) is the source of `injection` events; [Strategies & Risk](/docs/strategies) defines the daily-loss halt a `halt` event records.",
    },
  ],
};
