# Decision Logging — JSONL Audit Trail

An **append-only** record of what the desk did: every desk run, every approval,
every order event, every trading halt, and every prompt-injection attempt the
Macro/News Analyst flags. This realizes **Core Principle #3 (Transparency &
Audit)** and satisfies `CLAUDE.md` **step 6** — *"after execution … log it where
the user asks."*

> This is **documentation + tooling only.** It records decisions; it does not
> make them. Logging **weakens no guardrail**: the PM still previews every order
> and **never auto-places** one (per `CLAUDE.md`, only an explicit in-session
> approval authorizes a trade). Writing a log line is not approval, and nothing
> in this file can be used as one.

---

## Where the log lives

```
logs/
  desk-runs.example.jsonl   # committed demo arc (illustrative only, not a track record)
  desk-runs.jsonl           # real, gitignored — holds live account decisions
  .gitignore                # ignores *.jsonl EXCEPT the example
  .gitkeep                  # keeps the dir in git even when only real logs exist
```

Real logs are **gitignored**, exactly like `ui/public/desk-state.json`. Only the
sanitized `*.example.jsonl` is committed so a fresh clone has something to read.
Everything here is illustrative unless fed real data — it is **not** a track
record.

---

## Format: one JSON object per line (JSONL)

- **One record = one line.** No pretty-printing, no arrays wrapping the file.
- **Append-only.** New records are appended; existing lines are **never** edited,
  reordered, or deleted. An audit trail you can rewrite is not an audit trail.
- **UTF-8**, newline-terminated. Blank lines are ignored by the tooling.

### Required keys on every line

| Key       | Type            | Meaning                                             |
|-----------|-----------------|-----------------------------------------------------|
| `ts`      | ISO-8601 string | When it happened (keep the timezone offset).        |
| `event`   | enum            | One of the six event types below.                   |
| `session` | string          | Which desk session produced it (e.g. `"demo"`).     |

`event` ∈ `{ "desk_run", "approval", "order_placed", "order_filled", "halt", "injection" }`

### Per-event fields

Beyond the three required keys, each event carries a few descriptive fields. A
`summary` (one line) is recommended on every record — the dashboard uses it
verbatim, and it makes `tail` readable. Fields marked *optional* may be omitted.

**`desk_run`** — one entry per desk pass.
| Field             | Type     | Notes                                                        |
|-------------------|----------|--------------------------------------------------------------|
| `tickers`         | string[] | Symbols screened this run.                                   |
| `proposed`        | object   | The proposed trade, or omit/`null` if none. Shape below.     |
| `vetoes`          | string[] | Symbols the Risk Manager vetoed.                             |
| `injectionAlerts` | number   | Count of injection attempts flagged during the run.          |
| `summary`         | string   | One-line recap.                                              |

`proposed` shape: `{ "symbol", "side":"buy|sell", "qty", "strategy", "riskDecision":"APPROVE|APPROVE-WITH-CHANGES|VETO" }`

**`approval`** — the human decision on a preview card.
| Field      | Type   | Notes                                             |
|------------|--------|---------------------------------------------------|
| `symbol`   | string | Symbol the decision is about.                     |
| `decision` | string | `"approved"` or `"rejected"`.                     |
| `by`       | string | Who approved (e.g. `"user"`).                     |
| `summary`  | string | One-line recap.                                   |

**`order_placed`** — an order was submitted (only ever after an `approval`).
| Field        | Type   | Notes                                        |
|--------------|--------|----------------------------------------------|
| `symbol`     | string |                                              |
| `side`       | string | `"buy"` / `"sell"`.                          |
| `qty`        | number |                                              |
| `type`       | string | `"limit"` / `"market"`.                      |
| `limitPrice` | number | *optional* — present for limit orders.       |
| `status`     | string | e.g. `"submitted"`.                          |
| `summary`    | string | One-line recap.                              |

**`order_filled`** — a fill confirmation.
| Field    | Type   | Notes                          |
|----------|--------|--------------------------------|
| `symbol` | string |                                |
| `qty`    | number | Filled quantity.               |
| `price`  | number | Fill price.                    |
| `status` | string | e.g. `"filled"`.               |
| `summary`| string | One-line recap.                |

**`halt`** — the desk stopped trading (e.g. daily-loss halt from `strategies/`).
| Field       | Type   | Notes                                                  |
|-------------|--------|--------------------------------------------------------|
| `reason`    | string | e.g. `"daily-loss-halt"`.                              |
| `dayPnlPct` | number | *optional* — the day P&L that tripped the halt.        |
| `limitPct`  | number | *optional* — the cap that was breached.                |
| `symbol`    | null   | Usually account-level, so `null`.                      |
| `summary`   | string | One-line recap.                                        |

**`injection`** — a prompt-injection attempt the Macro/News Analyst flagged.
Records the untrusted content **as a quote**; per `CLAUDE.md`, it is surfaced,
never acted on.
| Field       | Type   | Notes                                                          |
|-------------|--------|----------------------------------------------------------------|
| `source`    | string | Where the content came from (URL/doc).                         |
| `quote`     | string | Verbatim suspicious text.                                      |
| `handledBy` | string | Usually `"macro-news-analyst"`.                                |
| `action`    | string | What was done — always "quoted and ignored," never obeyed.     |
| `symbol`    | null   | Usually `null`.                                                |
| `summary`   | string | One-line recap.                                                |

### Example arc

See [`../logs/desk-runs.example.jsonl`](../logs/desk-runs.example.jsonl) for a
committed 9-line arc: a morning `desk_run` (proposal + veto + an injection
flagged), the flagged `injection`, an `approval`, `order_placed`,
`order_filled`, an afternoon `desk_run` whose add is `rejected`, a `halt` on the
daily-loss cap, and a second `injection` flagged during the halt review.

```json
{"ts":"2026-07-11T10:05:00-04:00","session":"demo","event":"desk_run","tickers":["MSFT","NVDA"],"summary":"Screened 2; proposed BUY 3 MSFT (mean-reversion); NVDA vetoed.","proposed":{"symbol":"MSFT","side":"buy","qty":3,"strategy":"mean-reversion","riskDecision":"APPROVE"},"vetoes":["NVDA"],"injectionAlerts":1}
{"ts":"2026-07-11T10:07:30-04:00","session":"demo","event":"approval","symbol":"MSFT","decision":"approved","by":"user"}
{"ts":"2026-07-11T10:07:31-04:00","session":"demo","event":"order_placed","symbol":"MSFT","side":"buy","qty":3,"type":"limit","limitPrice":415.5,"status":"submitted"}
{"ts":"2026-07-11T10:07:45-04:00","session":"demo","event":"order_filled","symbol":"MSFT","qty":3,"price":415.5,"status":"filled"}
```

---

## How the PM writes to it

Per `CLAUDE.md`'s process, the PM appends after each desk run and after each
order event. Use the utility so validation runs on every write — it appends
exactly one line and never rewrites the file:

```js
import { appendRecord } from '../tools/desk-log.mjs'

// After a desk run:
appendRecord('logs/desk-runs.jsonl', {
  ts: new Date().toISOString(),
  session: 'live-2026-07-11',
  event: 'desk_run',
  tickers: ['MSFT', 'NVDA'],
  summary: 'Screened 2; proposed BUY 3 MSFT (mean-reversion); NVDA vetoed.',
  proposed: { symbol: 'MSFT', side: 'buy', qty: 3, strategy: 'mean-reversion', riskDecision: 'APPROVE' },
  vetoes: ['NVDA'],
  injectionAlerts: 1,
})

// After the user approves and the order fills:
appendRecord('logs/desk-runs.jsonl', { ts: new Date().toISOString(), session: 'live-2026-07-11', event: 'approval', symbol: 'MSFT', decision: 'approved', by: 'user' })
appendRecord('logs/desk-runs.jsonl', { ts: new Date().toISOString(), session: 'live-2026-07-11', event: 'order_placed', symbol: 'MSFT', side: 'buy', qty: 3, type: 'limit', limitPrice: 415.5, status: 'submitted' })
appendRecord('logs/desk-runs.jsonl', { ts: new Date().toISOString(), session: 'live-2026-07-11', event: 'order_filled', symbol: 'MSFT', qty: 3, price: 415.5, status: 'filled' })
```

`appendRecord` throws (writing nothing) if `ts`, `event`, or `session` is
missing or if `event` is outside the enum — so a malformed record can never
enter the trail.

**Order of operations still holds:** an `order_placed` line should only ever
appear *after* an `approval` line for the same symbol. The log documents that
sequence; it does not authorize skipping it.

---

## How it maps to the dashboard

The dashboard reads `ui/public/desk-state.json` (schema: `ui/README.md`). The
decision log surfaces there as a `decisionLog` array — a compact tail derived
from the JSONL:

```jsonc
"decisionLog": [
  { "ts": "ISO", "event": "desk_run|approval|order_placed|order_filled|halt|injection",
    "summary": "one-line", "symbol": "MSFT|null", "tone": "pos|neg|flat|warn" }
]
```

`tone` drives color (reuse the theme vars in `ui/src/styles.css`): `pos` green,
`neg` red, `warn` amber, `flat` dim. The tooling derives it deterministically:

| Event          | tone                                                        |
|----------------|-------------------------------------------------------------|
| `order_filled` | `pos`                                                       |
| `approval`     | `pos` if approved, `neg` if rejected, else `flat`           |
| `order_placed` | `flat`                                                      |
| `desk_run`     | `warn` if `injectionAlerts > 0`, else `flat`                |
| `halt`         | `neg`                                                       |
| `injection`    | `warn`                                                      |

Generate the array and paste it into `desk-state.json` after a desk run:

```bash
node tools/desk-log.mjs deskstate logs/desk-runs.jsonl 20
```

---

## How to validate

Before committing (or any time), assert every line parses and carries the
required keys + a valid event. Non-zero exit on any bad line:

```bash
node tools/desk-log.mjs validate logs/desk-runs.example.jsonl
# PASS — 9 valid records in logs/desk-runs.example.jsonl
```

Inspect the tail, or preview the dashboard array:

```bash
node tools/desk-log.mjs tail      logs/desk-runs.example.jsonl 3
node tools/desk-log.mjs deskstate logs/desk-runs.example.jsonl 5
```

Programmatically:

```js
import { validateFile, readTail, toDeskState } from './tools/desk-log.mjs'
const { ok, count, errors } = validateFile('logs/desk-runs.jsonl')
const decisionLog = toDeskState(readTail('logs/desk-runs.jsonl', 20))
```

---

## See also

- `CLAUDE.md` — the operating contract (process steps; human approval is
  required for every order; injection defense).
- `ui/README.md` — `desk-state.json` schema and how the dashboard mirrors state.
- `strategies/README.md` — the risk caps, including the daily-loss halt that a
  `halt` event records.
- `docs/TEAM.md` — the roles; the Macro/News Analyst is the source of
  `injection` flags.
