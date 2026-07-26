# Trading Desk UI

A read-only dashboard for the Aelix desk — the brokerage surface, where a human approves
every order. It is a **mirror**, not a controller: it visualizes a `desk-state.json`
snapshot the PM session writes after each desk run. **It cannot place orders** — approval
and execution happen only in the Claude Code session (per `CLAUDE.md`).

## Run

```bash
cd ui
npm install
npm run dev          # opens http://localhost:5180
```

A `public/desk-state.example.json` ships so a fresh clone renders. It is a **SAMPLE**:
every brokerage section is empty and every on-chain figure is `null`. The only real data
in it is the deployed contract addresses on **Robinhood Chain mainnet (chainId 4663)** —
the on-chain band fills in from a live read of those contracts, or stays empty if the read
fails. It never ships a number of its own.

## How data flows

```
Claude Code (PM) ── runs the desk, writes ──▶ ui/public/desk-state.json ──▶ UI polls every 5s
                                              (gitignored: real account state)
```

The app fetches `desk-state.json` first and **falls back to `desk-state.example.json`**
when it is absent — so a fresh clone renders the sample, while your real run renders live.
`desk-state.json` is **gitignored** (it holds real balances/positions) and is never
committed; only the sanitized example is. The UI cache-busts each poll, so writes show
up within ~5s without a reload.

> **No invented figures.** Every number the dashboard shows must be a real read, an honest
> empty (`null` → renders `—`), or explicitly labelled sample. Never seed a plausible-looking
> NAV, PerfScore, attestation count or P&L into either JSON to make a panel look populated —
> an empty panel is the correct output when there is nothing to read. The vault currently
> holds nothing (`totalAssets` 0, `totalSupply` 0) and there are no attestations, so the
> committed files carry `null` throughout.

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
                                        //   Any key starting with "_" is a comment the UI
                                        //   ignores (`_contractsNote`, `_vaultNote`,
                                        //   `_guardrailsNote`, `_trackRecordNote`,
                                        //   `_executorNote` are used to record WHY a block is
                                        //   deliberately empty, so nobody backfills it).
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
    "network": {                         // Robinhood Chain target — mainnet is chainId 4663
      "name": "Robinhood Chain", "chainId": 4663, "deployed": true,
      "explorer": "https://explorer.mainnet.chain.robinhood.com" },
    "contracts": {                       // deployed addresses; `vault` is required for live reads
      "guardrails": "0x…",               //   GuardrailConfig  — caps read live for the rails panel
      "vault": "0x…",                    //   RWAVault (vAELIX) — NAV/supply/positions + the dApp
      "attestor": "0x…",                 //   DeskRegistry     — desk-run attestations
      "executor": "0x…",                 //   SessionKeyExecutor
      "autosave": "0x…" },               //   AelixAutosave    — omit and the recurring-buy tab hides
    "vault": {                           // snapshot fallback; live reads override these when the RPC is up.
                                         //   Use null — NOT 0 — for anything unread: null renders '—',
                                         //   while 0 reads as a real measurement of zero.
      "symbol": null, "nav": null, "totalAssets": null, "totalShares": null, "sharePrice": null,
      "yourShares": null, "yourValue": null, "utilizationPct": null, "apyPct": null },
    "guardrails": [                      // guardrails-as-code rows. Ship this EMPTY: the panel
                                         //   labels rows "enforced on-chain", so they may only come
                                         //   from a live GuardrailConfig read, never from the file.
      { "key": "perTradePct", "label": "Per-trade cap", "value": "15%", "enforced": true } ],
    "trackRecord": {                     // proof-of-track-record panel — all null today
      "perfScore": null, "attestations": null, "verifiedPnlPct": null,
      "lastAttestation": { "summary": "", "ts": "ISO-8601", "txHash": "0x…" } },
    "executor": {                        // agent-executor panel
      "type": "Scoped session key (EOA)", "status": "live|active|preview",
      "scope": "", "sessionKey": "0x…|null", "dailyCapPct": 15, "lastAction": "" },
    "autosave": {                        // recurring-buy panel (key matches the deployed
                                         //   AelixAutosave contract; copy calls it "recurring buy")
      "enabled": false, "cadence": null, "amount": null, "asset": "USDG", "nextRun": null }
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
  record, executor, recurring buy) and the vault dApp at `/vault`. When `onchain.contracts.vault`
  and `onchain.network.chainId` are present, the UI reads the **live** deployed contracts
  over a public RPC (see `src/onchain.js`) and those live values take precedence over the
  static `onchain.vault` / `onchain.guardrails` snapshot; the snapshot is only the fallback.
  `readOnchain()` starts at `live: false` and only flips to `true` after a contract read
  actually returns, so a resolved-but-failed read can never be badged live. In the shipped
  `desk-state.example.json` (`session: "no-run"`) the brokerage sections stay empty and the
  on-chain snapshot is all-`null`, so anything the band shows came from a live read.
- **`session`** gates the view: `"demo"` or `"no-run"` shows the honest AI-desk empty state
  (`DeskRunGate`) plus live on-chain figures; any other value renders the full brokerage desk.
  **`_note`** is informational only and does not affect that gate.

## On-chain target: Robinhood Chain mainnet (4663)

The addresses in the committed JSONs point at the mainnet deployment; `src/onchain.js` and
`src/vault-app.jsx` carry the chain table (4663 mainnet, 46630 testnet, 31337 anvil) and pick
the RPC from `onchain.network.chainId`. `onchain/deployments/latest.json` is the source of
truth for the address set — copy from there, don't hand-edit addresses.

| | |
|---|---|
| Chain | Robinhood Chain **mainnet**, chainId **4663** (`https://rpc.mainnet.chain.robinhood.com`) |
| RWAVault (vAELIX) | `0x0e500E390cC599055f1e54194e1e611Cf64c5047` — 12 decimals (6 USDG + 6 offset) |
| GuardrailConfig | `0x68cf24994d0363Be7688e96B69dDacC290c766C0` |
| DeskRegistry (`attestor`) | `0x68cc84d722E2d613cAc36c62167B177656e2C983` |
| SessionKeyExecutor | `0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7` |
| AelixAutosave | `0x5b0778E8561EA31490588D21bd44419803DC709b` |
| Asset | real USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` — `decimals() == 6` |

**Ownership: handover complete.** Every owner-controlled contract in the stack is owned by the
2-of-3 Safe `0x47b5e2923216f203b7960d8D232215534AF02FF2`. The Safe called `acceptOwnership()`
on RWAVault, ChainlinkOracleAdapter and SessionKeyExecutor in a single batch (tx
`0x1ee7a73e7c3df216579554cd3d5993dfeee6be2bd081a68f59700efbd5968cea`); a direct `eth_call`
after execution returns the Safe from `owner()` and the zero address from `pendingOwner()` on
all three, so nothing is left half-transferred. GuardrailConfig and UniswapSwapAdapter were
Safe-owned from construction and never passed through the deployer at all. As a negative
control, the deployer EOA `0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51` now reverts with
`OwnableUnauthorizedAccount` on `allowToken`, `setDepositCap` and `setFeedFrozen`, while the
same calls from the Safe succeed — the deploy key has no residual authority.

So the dashboard copy **may** now state plainly that every owner-controlled contract is owned
by a 2-of-3 Safe multisig, that changing any risk cap, feed, deposit cap or session grant
requires 2 of 3 signatures, and that no single hot key can weaken the guardrails — **provided
the same block also says there is no timelock yet** (an approved Safe transaction takes
effect immediately). Wherever copy describes what the Safe can change, the no-timelock line
is required, not optional. That is a custody fact and nothing more — it says nothing about
the code having been reviewed, so it does **not** soften any caveat below.

Standing caveats the dashboard copy must keep — mainnet and the completed handover do **not**
retire them:

- **No third-party audit.** Internal review passes are not an audit, and neither is a
  completed ownership handover. This remains the single most important caveat.
- **No timelock on owner powers.** The Safe changes caps, feeds, session grants or the
  deposit cap in one transaction with immediate effect; copy describing Safe powers must say
  so in the same block.
- **Deposits are capped** (10,000 USDG — an owner-changeable setting, not a structural limit)
  and there is **no track record** — no depositors, no trades, `totalAssets` and
  `totalSupply` are 0. Panels stay empty; that is the honest output.
- **Contracts are not yet verified** on the block explorer, and the mainnet explorer base URL
  above is taken from the app's chain table — it has not been confirmed against a live host
  (the bridge writes a different one, `explorer.chain.robinhood.com`). Verify before trusting
  explorer deep links.
- **No Chainlink sequencer-uptime feed exists on Robinhood Chain.** The stack substitutes a
  chain-liveness quorum of 24/7 crypto feeds; it is coarse by design (catches multi-hour
  outages, not minute-scale ones) and is not equivalent to an uptime feed.
- The desk itself is unchanged: **every order still needs explicit human approval** in the
  Claude Code session. The mainnet deploy does not make it autonomous and does not connect
  customer money to the vault. The `$AELIX` token is unlaunched. Not affiliated with or
  endorsed by Robinhood or Anthropic.

**Known copy gap (source fix + rebuild needed):** the data files now target 4663, but several
UI strings still say testnet — `NetworkBadge` renders a hardcoded `TESTNET · LIVE` /
`TESTNET · PREVIEW`, `PreviewBadge` defaults to `TESTNET · PREVIEW` (`src/components.jsx`), the
`DeskRunGate` line says the vault is "deployed to testnet", and the vault dApp shows
`Robinhood Chain · Testnet` plus the disclaimer `Testnet preview · not audited · not for US
persons` (`src/vault-app.jsx`). Those mislabel the mainnet deployment; replace them with an
accurate caveat (e.g. `mainnet · unaudited · deposits capped`) — do not simply delete the
caveat — and re-run the sync script.

The built copy served from the landing site lives in `landing/public/app/` and is regenerated
by `node scripts/sync-app-into-landing.mjs` (build `ui/` with `base=/app/`, copy `ui/dist`).
That directory is **committed**, so `landing/public/app/desk-state.json` is public: keep it
empty/`null` unless every figure in it is a real read.
