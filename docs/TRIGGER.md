# Run the desk from the dashboard button

The dashboard has a **Run desk** button. Because a browser cannot call your Claude Code
session directly, the button uses a thin, file-based bridge — and it **only ever triggers
a read-only desk run that stops at the preview card. It never places an order.**

## How it works

```
[Run desk] ──POST /api/run──▶ Vite dev-server plugin writes desk-request.json (status: pending)
                                                   │
   dashboard polls /api/run-status ◀──────────────┤
   (button shows "Running…")                       ▼
                                   Your Claude session's /loop sees status=pending →
                                   runs the read-only desk (docs/TEAM.md steps 1–7) →
                                   writes ui/public/desk-state.json →
                                   sets desk-request.json status=done
                                                   │
   dashboard sees status=done + new snapshot ──────┘  → button shows "✓ complete"
```

- `desk-request.json` (repo root) is the control file — **gitignored**, created on first click.
- The Vite plugin ([ui/vite.config.js](../ui/vite.config.js)) only reads/writes that file.
  It does **not** run the LLM and is **dev-server only** (`npm run dev`).
- The actual work runs inside **your authenticated Claude session**, so it inherits the
  MCP auth, the `strategies/` rules, the Risk Manager veto, and the approval gate.

## Setup (two terminals)

**Terminal 1 — dashboard:**
```bash
cd ui && npm run dev          # http://localhost:5180
```

**Terminal 2 — your Claude Code session:** start the watcher loop (polls every 30s):
```
/loop 30s Check ./desk-request.json. If it is missing or status != "pending", do nothing this tick. If status == "pending": run the READ-ONLY desk per docs/TEAM.md steps 1-7 for params.tickers (if the list is empty, screen the default watchlist). Dispatch the analyst sub-agents and the Risk Manager. DO NOT place, cancel, or even preview-then-submit any order — produce the preview card only. Write the full snapshot (account, positions, candidate verdicts, proposedTrade, recentOrders, injectionAlerts, plus "requestId": the request id) to ui/public/desk-state.json per ui/README.md. Then rewrite ./desk-request.json with the same id, status "done", and processedAt set to now. Output a one-line summary.
```

Now press **Run desk** on the dashboard. Within one loop tick the desk runs and the
dashboard refreshes.

## Notes & guardrails

- **Read-only by design.** The loop prompt forbids order placement; order tools are also
  still behind the `ask`/`deny` rules in `.claude/settings.json`. To actually trade, you
  approve in the session — the button never does.
- **Latency** = the loop interval (30s here). Lower it (e.g. `/loop 15s …`) for snappier
  response, or raise it to save tokens.
- **Sub-agents load at startup** — restart Claude Code after adding `.claude/agents/` so
  the loop can dispatch `fundamental-analyst` etc.
- **Stop the loop** anytime with `/loop` controls (or Esc/stop in the session). The button
  is inert without a running loop (it will sit on "waiting for the desk…").
- **Production builds** have no dev server, so the button is a dev/local tool. For a hosted
  setup you'd replace the Vite plugin with a small persistent backend exposing the same
  two endpoints.
