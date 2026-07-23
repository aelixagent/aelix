# Trading Desk UI

A read-only, professional dashboard for the Robinhood Agentic desk. It is a **mirror**,
not a controller: it visualizes a `desk-state.json` snapshot the PM session writes after
each desk run. **It cannot place orders** — approval and execution happen only in the
Claude Code session (per `CLAUDE.md`).

## Run

```bash
cd ui
npm install
npm run dev          # opens http://localhost:5180
```

A demo `public/desk-state.example.json` ships so the UI looks alive immediately.

## How data flows

```
Claude Code (PM) ── runs the desk, writes ──▶ ui/public/desk-state.json ──▶ UI polls every 5s
                                              (gitignored: real account state)
```

The app fetches `desk-state.json` first and **falls back to `desk-state.example.json`**
when it is absent — so a fresh clone renders the demo, while your real run renders live.
`desk-state.json` is **gitignored** (it holds real balances/positions) and is never
committed; only the sanitized example is. The UI cache-busts each poll, so writes show
up within ~5s without a reload.

Tell the PM to write the snapshot, e.g.:
> "After the desk run, write the state to ui/public/desk-state.json."

## `desk-state.json` schema

```jsonc
{
  "generatedAt": "ISO-8601",            // timestamp shown in the header
  "session": "live",                    // "demo" | "no-run" gates the AI-desk sections to
                                        //   their honest empty state (DeskRunGate) and shows
                                        //   the live on-chain figures instead; any other value
                                        //   (e.g. "live") renders the full brokerage desk.
  "_note": "string|omit",               // OPTIONAL human note about the snapshot; purely
                                        //   informational — does NOT affect the demo/live gate.
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
      "fundamental": { "score": -2..2, "confidence": "low|med|high", "valuation": "", "growth": "", "note": "" },
      "technical":   { "signal": -2..2, "confidence": "", "trend": "", "support": 0, "resistance": 0, "entry": 0, "stop": 0, "note": "" },
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

  "backtests": [                         // OPTIONAL — omit and the panel hides itself
    { "strategy": "mean-reversion", "symbol": "DEMO-UPTREND",
      "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "bars": 252 },
      "metrics": { "totalReturnPct": 0, "buyHoldReturnPct": 0, "trades": 0, "winRatePct": 0,
                   "avgWinPct": 0, "avgLossPct": 0, "profitFactor": 0, "maxDrawdownPct": 0,
                   "avgHoldDays": 0, "exposurePct": 0, "sharpe": 0 },
      "equitySpark": [0, 0, 0],          // ~40 downsampled equity values for the sparkline
      "buyHoldSpark": [0, 0, 0] }        // optional faint baseline series
  ],

  "decisionLog": [                       // OPTIONAL — omit and the panel hides itself
    { "ts": "ISO-8601", "event": "desk_run|approval|order_placed|order_filled|halt|injection",
      "summary": "one-line", "symbol": "MSFT|null", "tone": "pos|neg|flat|warn" }
  ],

  "onchain": {                           // OPTIONAL — drives the whole on-chain band + the
                                         //   demo gate's live figures. Omit and that band hides.
    "network": {                         // Robinhood Chain target
      "name": "Robinhood Chain Testnet", "chainId": 46630, "deployed": true,
      "explorer": "https://explorer.testnet.chain.robinhood.com" },
    "contracts": {                       // deployed addresses; `vault` is required for live reads
      "guardrails": "0x…", "vault": "0x…", "attestor": "0x…",
      "executor": "0x…", "autosave": "0x…" },
    "vault": {                           // snapshot fallback; live reads override these when the RPC is up
      "symbol": "vAELIX", "nav": 0, "totalAssets": 0, "totalShares": 0, "sharePrice": 0,
      "yourShares": 0, "yourValue": 0, "utilizationPct": 0, "apyPct": null },
    "guardrails": [                      // guardrails-as-code rows (live caps override when read)
      { "key": "perTradePct", "label": "Per-trade cap", "value": "15%", "enforced": true } ],
    "trackRecord": {                     // proof-of-track-record panel
      "perfScore": 0, "attestations": 0, "verifiedPnlPct": null,
      "lastAttestation": { "summary": "", "ts": "ISO-8601", "txHash": "0x…" } },
    "executor": {                        // agent-executor panel
      "type": "Scoped session key (EOA)", "status": "live|active|preview",
      "scope": "", "sessionKey": "0x…|null", "dailyCapPct": 15, "lastAction": "" },
    "autosave": {                        // autosave / DCA panel
      "enabled": false, "cadence": "weekly", "amount": null, "asset": "USDG", "nextRun": null }
  }
}
```

The field names map 1:1 to the sub-agents' output blocks in `.claude/agents/` and the
caps in `strategies/README.md`, so the PM can fill it directly from a desk run.

`backtests[]` and `decisionLog[]` are **optional** — every field is additive, so older
snapshots that omit them still render, and each panel returns nothing when its array is
absent or empty.

- **`backtests[]`** is the compact, dashboard-facing summary of per-strategy backtest
  reports (the fuller report shape lives under `backtest/reports/<strategy>.json`). Each
  entry carries the headline `metrics` plus a downsampled `equitySpark` (and optional
  `buyHoldSpark` baseline) that feed the inline SVG sparkline. All figures are
  **illustrative — not a live track record.**
- **`decisionLog[]`** is a tail of the append-only desk-run log (`logs/desk-runs.jsonl`,
  one JSON object per line) flattened to the `{ ts, event, summary, symbol, tone }` shape
  the timeline renders. `tone` drives the badge/accent color
  (`pos`/`neg`/`flat`/`warn`).
- **`onchain`** feeds the entire on-chain band (RWA vault, guardrails-as-code, track
  record, executor, autosave) and the vault dApp at `/vault`. When `onchain.contracts.vault`
  and `onchain.network.chainId` are present, the UI reads the **live** deployed contracts
  over a public RPC (see `src/onchain.js`) and those live values take precedence over the
  static `onchain.vault` / `onchain.guardrails` snapshot; the snapshot is only the fallback.
  In the shipped `desk-state.example.json` (`session: "no-run"`) the brokerage sections stay
  empty while this on-chain band renders live — so nothing on screen is faked.
- **`session`** gates the view: `"demo"` or `"no-run"` shows the honest AI-desk empty state
  (`DeskRunGate`) plus live on-chain figures; any other value renders the full brokerage desk.
  **`_note`** is informational only and does not affect that gate.
