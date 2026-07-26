import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Architecture",
  description:
    "How Aelix is put together: a Claude-Code-native desk with no backend and no Python orchestrator, one main session, a folder of sub-agents, one MCP broker connection, a JSON snapshot instead of a database, and a separate on-chain module now deployed to Robinhood Chain mainnet, unaudited and deposit-capped.",
  eyebrow: "04, Architecture",
  blocks: [
    {
      type: "prose",
      md: "Aelix's architecture is **Claude-Code-native**. There is **no backend server** and **no Python orchestrator**. The **Portfolio Manager (PM)** is not a separate process, it *is* the main Claude Code session you talk to. It orchestrates a small team of sub-agents, reaches the broker through a single [MCP](/docs/mcp) server, and writes its results to a plain JSON file. That's the whole system.",
    },
    {
      type: "prose",
      md: "The sub-agents are just **Markdown files** in `.claude/agents/`, loaded when Claude Code starts. The broker lives behind one connector, the `robinhood-trading` MCP server declared in `.mcp.json`. State is a snapshot file plus append-only logs, not a database. Everything you'd normally stand up as services, queues, an ORM, a job scheduler, a container, is deliberately absent. This page maps each piece to where it actually lives in the repo.",
    },
    {
      type: "heading",
      text: "Claude-Code-native by design",
    },
    {
      type: "prose",
      md: "The design goal is that nothing about the desk is aspirational plumbing. Every component is a file you can open and read: an agent is Markdown, a guardrail is a contract, a strategy is a note, state is JSON. Four architectural choices follow from that.",
    },
    {
      type: "cards",
      columns: 2,
      cards: [
        {
          title: "No backend server",
          badge: "NATIVE",
          md: "There is no FastAPI/Uvicorn process and no service to deploy. The PM is the live Claude Code session; orchestration happens inside it.",
        },
        {
          title: "No external orchestrator",
          badge: "NATIVE",
          md: "No LangGraph or LangChain. The PM fans out to sub-agents and routes their findings through the Risk Manager using Claude Code's own dispatch.",
        },
        {
          title: "One broker connection",
          badge: "MCP",
          md: "A single `robinhood-trading` MCP server (`.mcp.json`, HTTP transport) is the **only** path to the Agentic account. Auth is OAuth 2.0, in-session.",
        },
        {
          title: "One state snapshot",
          badge: "NO DB",
          md: "State is `ui/public/desk-state.json` plus append-only JSONL logs. No PostgreSQL, no Redis, the dashboard mirrors the snapshot.",
        },
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "The PM is the session, not a service",
      md: "When these docs say *\"the PM does X,\"* they mean the main Claude Code session does it. The PM is the **only** role that can place an order, and only after your explicit in-session approval. The specialist roles it dispatches are covered in [The Desk Team](/docs/team); the step-by-step run is in [The Desk Run](/docs/workflow).",
    },
    {
      type: "heading",
      text: "How a run flows through the system",
    },
    {
      type: "prose",
      md: "A single request travels from you, through the PM, out to the sub-agents and the broker (read-only), and back to a **preview card**. Steps 1–6 are research and produce **no order**, the desk stops at the preview and waits. The full lifecycle, with every tool call and gate, is documented in [The Desk Run](/docs/workflow).",
    },
    {
      type: "diagram",
      title: "One request, end to end (steps 1–6 place no order)",
      ascii: `YOU ──▶ PORTFOLIO MANAGER  (main Claude Code session · only role that can order)
   1. SENSE     ─▶ read portfolio + positions        (Agentic account, read-only)
   2. SCREEN    ─▶ Technical Analyst runs scans       ─▶ candidate shortlist
   3. RESEARCH  ─▶ Fundamental · Technical · Macro/News
                    (dispatched in parallel · read-only · news is injection-isolated)
   4. SYNTHESIZE─▶ propose one trade tied to a rule in strategies/
   5. RISK      ─▶ Risk Manager (opus) ─▶ APPROVE / CHANGES / VETO   (veto stops here)
   6. PREVIEW   ─▶ review_equity_order ─▶ build a preview card   ◀── steps 1-6: NO order
   7. APPROVAL  ─▶ present preview to YOU and wait                ◀── the desk stops here
   8. EXECUTE   ─▶ only on your "yes": place_equity_order  (still gated by the 'ask' rule)`,
    },
    {
      type: "note",
      md: "The desk's standard output is the preview card at step 7. It never proceeds to `place_equity_order` on its own, see [Guardrails](/docs/guardrails) for the permission gate.",
    },
    {
      type: "heading",
      text: "How the pieces are wired",
    },
    {
      type: "prose",
      md: "Everything hangs off the one session. The PM loads the sub-agents from a folder, reads its contract and permissions from two files, enforces written strategy rules, and emits a snapshot the dashboard polls. The broker sits behind a single MCP hop.",
    },
    {
      type: "arch3d",
      title: "The desk, mapped",
      caption: "Drag to rotate. The Portfolio Manager is the only role with order tools; everything else is read-only or advisory. The wiring in full is below.",
    },
    {
      type: "diagram",
      title: "Component wiring",
      ascii: `CLAUDE CODE  (host runtime)
  │
  └─ PORTFOLIO MANAGER  = main session · only role with order tools
        │
        ├─ .claude/agents/*.md ──▶ 3 analysts (sonnet) + Risk Manager (opus)
        │                          least-privilege · loaded at startup · no order tools
        │
        ├─ robinhood-trading MCP ──HTTP──▶ https://agent.robinhood.com/mcp/trading
        │                          OAuth 2.0, in-session · Agentic account only
        │
        ├─ CLAUDE.md + .claude/settings.json ──▶ operating contract + deny→ask→allow gate
        │
        ├─ strategies/*.md ──▶ written caps + entry/exit rules (Risk Manager enforces)
        │
        ├─ writes ──▶ ui/public/desk-state.json ──▶ ui/ dashboard (Vite+React, read-only)
        │                                            polls the snapshot every ~5s
        │
        └─ appends ──▶ logs/*.jsonl  (via tools/desk-log.mjs · append-only audit trail)`,
    },
    {
      type: "heading",
      text: "Main components",
    },
    {
      type: "prose",
      md: "Every component below is a real path in the repo. Nothing here is a running service you have to manage, they are files the session reads, writes, or dispatches.",
    },
    {
      type: "table",
      caption: "Faithful to design.md §3.2, each row is a real location in the repo.",
      headers: ["Component", "Technology / location", "Function"],
      rows: [
        [
          "Portfolio Manager (orchestrator)",
          "main Claude Code session",
          "Reads the account, dispatches sub-agents in parallel, synthesizes a proposal, presents a preview, and, after your approval, places the order. The **only** role that can order.",
        ],
        [
          "Sub-agents (analysts + risk)",
          "`.claude/agents/*.md`",
          "Four least-privilege specialist roles, loaded when Claude Code **starts**. None of them hold order tools. See [The Desk Team](/docs/team).",
        ],
        [
          "Broker connector",
          "`robinhood-trading` MCP · `.mcp.json` (HTTP)",
          "The single path to the Robinhood Agentic account; authenticates via OAuth in-session. See [MCP & the broker](/docs/mcp).",
        ],
        [
          "Guardrails & permissions",
          "`CLAUDE.md` + `.claude/settings.json`",
          "The PM's operating contract plus a `deny → ask → allow` permission gate (orders gated, options denied, reads allowed). See [Guardrails](/docs/guardrails).",
        ],
        [
          "Strategies & risk rules",
          "`strategies/*.md`",
          "Written caps and entry/exit rules the Risk Manager reads and enforces. See [Strategies](/docs/strategies).",
        ],
        [
          "Dashboard (read-only)",
          "`ui/`, Vite + React, `type: module`",
          "Mirrors `desk-state.json`; it **cannot** place orders. See [Dashboard](/docs/dashboard).",
        ],
        [
          "Backtester (offline)",
          "`backtest/`, Node ESM, no dependency",
          "Sanity-checks strategy logic against historical bars with plain `node`, no `npm install`. See [Backtesting](/docs/backtesting).",
        ],
        [
          "Audit log (JSONL)",
          "`logs/` + `tools/desk-log.mjs`",
          "Append-only structured trail of desk runs, verdicts, previews, approvals, fills, and injection alerts. See [Logging](/docs/logging).",
        ],
        [
          "Documentation",
          "`docs/` (TEAM, SETUP, TRIGGER, LOGGING)",
          "Team roles, OAuth setup, the optional \"Run desk\" trigger, and the logging schema.",
        ],
      ],
    },
    {
      type: "heading",
      text: "The broker connection",
    },
    {
      type: "prose",
      md: "There is exactly one way for the desk to touch the market: the `robinhood-trading` MCP server. It is declared project-scoped in `.mcp.json` with an HTTP transport pointed at Robinhood's Agentic endpoint. Nothing else in the repo talks to the broker.",
    },
    {
      type: "code",
      lang: "json",
      filename: ".mcp.json",
      code: `{
  "mcpServers": {
    "robinhood-trading": {
      "type": "http",
      "url": "https://agent.robinhood.com/mcp/trading"
    }
  }
}`,
    },
    {
      type: "list",
      items: [
        "**Transport:** HTTP, the connector is a remote MCP endpoint, not a local process.",
        "**Auth:** OAuth 2.0, completed **in-session** (desktop + mobile verify). No token lives in the repo.",
        "**Reach:** the Agentic account only. Other Robinhood accounts are read-only context; nothing outside Agentic is ever traded.",
        "**Order tools live only on the PM.** `review_equity_order` and `place_equity_order` are held by the main session, never by a sub-agent. Full tool map in [MCP & the broker](/docs/mcp).",
      ],
    },
    {
      type: "callout",
      tone: "warn",
      title: "Least-privilege is structural",
      md: "The three analysts and the Risk Manager **physically have no order tools** in their `tools:` frontmatter. Even a fully compromised analyst cannot place a trade, only the PM can, and only behind the `ask` permission rule. This is enforced by the sub-agent definitions in `.claude/agents/`, not by convention. See [Guardrails](/docs/guardrails) and [Prompt-injection defense](/docs/prompt-injection).",
    },
    {
      type: "heading",
      text: "State without a database",
    },
    {
      type: "prose",
      md: "Aelix keeps no database. Its entire state is two kinds of file: a single **snapshot** the PM overwrites after each run, and an **append-only log** of what happened. That's enough to drive a live dashboard and a full audit trail without a server.",
    },
    {
      type: "deflist",
      items: [
        {
          term: "Current state, the snapshot",
          md: "`ui/public/desk-state.json` holds the latest account view, positions, candidate verdicts, the proposed trade/preview, recent orders, and any injection alerts. The PM overwrites it after every run; the real file is gitignored and only `*.example.*` is committed. Schema lives in [`ui/README.md`](/docs/dashboard).",
        },
        {
          term: "History, the logs",
          md: "Append-only JSONL under `logs/`, written via `tools/desk-log.mjs`. One JSON object per line captures desk runs, analyst and risk verdicts, previews, approvals, fills, and injection alerts. See [Logging](/docs/logging).",
        },
        {
          term: "Scheduling",
          md: "There is no Celery/Redis job queue. Recurring runs use `/loop` or a Claude-session cron, the session is the scheduler.",
        },
      ],
    },
    {
      type: "diagram",
      title: "Data flow: snapshot → dashboard",
      ascii: `PORTFOLIO MANAGER ──runs the desk, writes──▶ ui/public/desk-state.json
   (Claude Code session)                        (gitignored: real account state)
                                                       │
                                                       │  polled every ~5s (cache-busted)
                                                       ▼
                                              ui/ dashboard (Vite + React, read-only)
                                              falls back to desk-state.example.json
                                              when no live snapshot exists`,
    },
    {
      type: "note",
      md: "The dashboard is a **mirror, not a controller**, approval and execution happen only in the Claude Code session. See [Dashboard](/docs/dashboard).",
    },
    {
      type: "heading",
      text: "Technology stack (the real one)",
    },
    {
      type: "prose",
      md: "The running stack is small and unglamorous on purpose. Here is exactly what is in play, layer by layer.",
    },
    {
      type: "deflist",
      items: [
        {
          term: "Host runtime",
          md: "Claude Code, the main session acts as the Portfolio Manager.",
        },
        {
          term: "Sub-agents",
          md: "Markdown files in `.claude/agents/` with `tools:` / `model:` frontmatter that defines each role's least-privilege tool set and model.",
        },
        {
          term: "Broker",
          md: "The `robinhood-trading` MCP server over HTTP (`.mcp.json`), authenticated with OAuth 2.0 in-session.",
        },
        {
          term: "Models",
          md: "Claude, the three analysts run on **sonnet**; the Risk Manager runs on **opus**.",
        },
        {
          term: "Dashboard",
          md: "Vite + React in `ui/`, ES modules (`\"type\": \"module\"`), strictly read-only.",
        },
        {
          term: "Offline tooling",
          md: "The backtester (`backtest/`) and the logger (`tools/desk-log.mjs`) are **pure Node, ESM, with no dependencies**, they run with plain `node`, no `npm install`.",
        },
        {
          term: "UI format helpers",
          md: "`ui/src/format.js` provides `usd`, `pct`, `num`, `signClass`, and `timeAgo` for rendering.",
        },
      ],
    },
    {
      type: "pills",
      items: [
        "Claude Code",
        "MCP over HTTP",
        "OAuth 2.0",
        "Markdown sub-agents",
        "sonnet analysts",
        "opus risk",
        "Vite + React",
        "Node ESM · no deps",
        "JSON snapshot · no DB",
        "Read-only dashboard",
      ],
    },
    {
      type: "heading",
      text: "What Aelix deliberately does not use",
    },
    {
      type: "prose",
      md: "An earlier v1.0 design draft imagined a much heavier system. None of it ships. This matters for reading the code: if you expect a server, a queue, or a wallet, you will look for files that do not exist. The table below maps each assumed component to its real status.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Don't assume the aspirational v1.0 components exist",
      md: "The running system on this page is the equities desk, its **trading path** has no chain, RPC, wallet, or token code; every order goes through the Robinhood MCP. The on-chain layer is a **separate module** in `onchain/` (an ERC-4626 vault + guardrails-as-code + on-chain attestations). It is **deployed to Robinhood Chain mainnet** as of 2026-07-26, and it is still **unaudited, deposit-capped, holds zero assets, and is not part of the live desk.** It is mapped in full further down this page; see the [Safety & Disclaimer](/docs/disclaimer) for scope.",
    },
    {
      type: "table",
      caption: "Faithful to design.md §5.3, components removed from the aspirational v1.0 draft.",
      headers: ["Assumed component", "Reality in the running system"],
      rows: [
        ["Python backend (FastAPI / Uvicorn)", "**None.** The PM is the Claude Code session; there is no server process to deploy."],
        ["LangGraph / LangChain orchestrator", "**None.** Orchestration is native to Claude Code."],
        ["Celery / Redis job queue", "**None.** Scheduling uses `/loop` or a Claude-session cron."],
        ["PostgreSQL / any database", "**None.** State is `desk-state.json` plus append-only JSONL logs."],
        ["Docker / Docker Compose", "**None.** It runs as local files and plain `node`."],
        ["Blockchain / RPC / wallet / token", "**Not in the running desk.** A separate module lives in `onchain/` (ERC-4626 vault + guardrails-as-code + attestations). It is now deployed to Robinhood Chain mainnet (chainId 4663), still unaudited and deposit-capped, and it is **not** in the equities trading path. The `$AELIX` token is **not built**."],
      ],
    },
    {
      type: "compare",
      left: {
        title: "What a heavier draft assumed",
        tone: "bad",
        rows: [
          "A backend service to deploy and monitor",
          "An orchestration framework to wire agents",
          "A queue and a database to hold state",
          "Containers to reproduce the environment",
        ],
      },
      right: {
        title: "What Aelix actually is",
        tone: "good",
        rows: [
          "One Claude Code session as the PM",
          "Sub-agents as Markdown files",
          "A JSON snapshot + append-only JSONL",
          "Plain `node` and a Vite dashboard",
        ],
      },
    },
    {
      type: "divider",
    },
    {
      type: "heading",
      text: "The separate on-chain module",
    },
    {
      type: "prose",
      md: "Everything above is the equities desk. The `onchain/` module is a **different system** with a different trust model: a Foundry project where the risk caps written in `strategies/` are enforced by a contract instead of read by an agent. **Enforced, not promised.** As of **2026-07-26 it is deployed to Robinhood Chain mainnet, chainId 4663**, against real periphery, there are no mocks in the mainnet path.",
    },
    {
      type: "prose",
      md: "It is wired to the desk in **neither** direction: the desk's orders go through the Robinhood MCP and never touch a chain, and the vault holds no customer money. Deploying it changed what exists on chain, not what the desk is allowed to do, every order still needs your explicit in-session approval.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Mainnet, unaudited, deposits capped",
      md: "There is **no third-party audit.** Two internal audit passes and a 42-agent preflight review are **not** an audit. The contracts are **not yet verified on the block explorer.** Deposits are capped at **10,000 USDG**, TVL is **0**, and there are **no depositors, no trades, no returns, and no track record.** Read this section as a map of unaudited mainnet code, not as a product. See [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "heading",
      level: 3,
      text: "Deployed addresses",
    },
    {
      type: "prose",
      md: "Each address below was confirmed on 2026-07-26 by calling an identifying function on the deployed contract, not copied from a docs table. They mirror `onchain/deployments/latest.json`.",
    },
    {
      type: "table",
      caption: "Robinhood Chain mainnet, chainId 4663. Verified by direct on-chain call.",
      headers: ["Contract", "Address (chainId 4663)", "Role"],
      rows: [
        [
          "Safe (2-of-3 multisig)",
          "`0x47b5e2923216f203b7960d8D232215534AF02FF2`",
          "The owner of the whole stack, two of three signers required for any owner action. The handover **completed on 2026-07-26**, see below.",
        ],
        [
          "RWAVault (`vAELIX`)",
          "`0x0e500E390cC599055f1e54194e1e611Cf64c5047`",
          "ERC-4626 vault over USDG for tokenized real-world assets. 12 decimals (6 from USDG plus a 1e6 offset that defeats the ERC-4626 inflation attack). Deposit cap **10,000 USDG**. Current state: `totalAssets` 0, `totalSupply` 0, not paused, 5 tokens allowlisted.",
        ],
        [
          "GuardrailConfig",
          "`0x68cf24994d0363Be7688e96B69dDacC290c766C0`",
          "The caps as state, not prose: the on-chain store of the risk limits from `CLAUDE.md` and [`strategies/`](/docs/strategies). Some ceilings (e.g. the sell-tolerance cap) cannot be widened even by the owner.",
        ],
        [
          "ChainlinkOracleAdapter",
          "`0xF6cFcA2024AFDeC14BCb0A9eb7bA402e73b2699A`",
          "Prices the vault reads for NAV and for the trade path, with two-tier staleness bounds, a circuit breaker for splits and corporate actions, and the chain-liveness quorum below.",
        ],
        [
          "DeskRegistry",
          "`0x68cc84d722E2d613cAc36c62167B177656e2C983`",
          "Append-only, chain-stamped attestation log for a desk. The on-chain counterpart of `logs/*.jsonl`. Currently empty.",
        ],
        [
          "PerfScore",
          "`0x1CB3df5AAFEb0d2c31277e3e889613bc6F4C9e14`",
          "Computes a performance summary **from** attestations in the registry. With nothing attested, there is nothing to score.",
        ],
        [
          "UniswapSwapAdapter",
          "`0x9a8bb5E65f340C4Bf6c7Aa71991EC5D31083b5cf`",
          "The vault's only execution surface: a narrow, typed swap over Uniswap V2 Router02, so a manager can never redirect a swap into an arbitrary contract call.",
        ],
        [
          "SessionKeyExecutor",
          "`0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7`",
          "The authorization layer between the AI desk and the vault, expiring, permission-scoped keys instead of a standing hot wallet.",
        ],
        [
          "AelixAutosave",
          "`0x5b0778E8561EA31490588D21bd44419803DC709b`",
          "Recurring DCA into the vault. It never holds funds beyond the atomic hop.",
        ],
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "Real periphery, verified by call",
    },
    {
      type: "deflist",
      items: [
        {
          term: "USDG, the 6-decimal original",
          md: "`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, `decimals()` **6**, `symbol()` `USDG`, `name()` `Global Dollar`. An **18-decimal look-alike exists on the same chain**, so the deploy gate pins USDG decimals to 6 and rejects the impostor without ever trusting a symbol.",
        },
        {
          term: "Uniswap V2 Router02",
          md: "`0x89e5db8b5aa49aa85ac63f691524311aeb649eba`. Identity cross-confirmed because its `WETH()` returns the documented WETH for the chain.",
        },
        {
          term: "Five allowlisted Stock Tokens",
          md: "NVDA, AAPL, TSLA, GOOGL, SPY, all 18 decimals, all exposing `oraclePaused()` and ERC-8056 `uiMultiplier()`. Matching is by **contract address, never by symbol**, the chain also hosts unrelated tokens with confusable tickers.",
        },
        {
          term: "One Chainlink feed proxy per token",
          md: "Every equity feed is **8 decimals, 86400s (24h) heartbeat, 0.5% deviation threshold**. The oracle returns live prices, NVDA read **$206.37** at deploy time. Wire the **proxy**, not the aggregator.",
        },
        {
          term: "Test suite",
          md: "**214 tests passing** in `onchain/test/`. Tests are evidence about the code's own invariants, not a substitute for a third-party audit.",
        },
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "No sequencer uptime feed: the chain-liveness quorum",
    },
    {
      type: "prose",
      md: "The standard L2 pattern is to read a Chainlink **sequencer uptime feed** and refuse to price while the sequencer is down. That feed **does not exist here**: Chainlink's reference directory for Robinhood Chain carries 56 feeds and **zero** uptime entries, and the chain is absent from Chainlink's L2 sequencer-feeds page.",
    },
    {
      type: "prose",
      md: "So the adapter substitutes a **chain-liveness quorum** (`ChainlinkOracleAdapter.livenessRefs`): at least two **24/7 crypto** feeds act as witnesses. Crypto feeds publish around the clock while equity feeds are 24/5, which is exactly the discriminator a plain staleness check lacks, one fresh witness proves the chain is producing blocks and the oracle network is delivering, so a stale equity feed just means a closed session. If **every** witness is stale, the vault fails closed with `ChainLivenessStale`. The gate refuses a deploy that has neither a real uptime feed nor a quorum, and `SEQUENCER_FEED` stays wired for the day one appears.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "The quorum is coarse by design, not equivalent",
      md: "It catches **multi-hour outages, not minute-scale ones.** Do not read it as a replacement for a sequencer uptime feed. Post-recovery protection comes from the **per-feed staleness bound** instead: a trade cannot execute until the equity feed itself publishes a fresh round.",
    },
    {
      type: "heading",
      level: 3,
      text: "Ownership: the two-step handover, complete",
    },
    {
      type: "prose",
      md: "The contracts use `Ownable2Step`, so a transfer only completes when the new owner calls `acceptOwnership()`. **That handover is now finished.** On **2026-07-26** the 2-of-3 Safe accepted ownership of the vault, the oracle adapter and the session-key executor in a single batch (tx `0x1ee7a73e7c3df216579554cd3d5993dfeee6be2bd081a68f59700efbd5968cea`). Read back by direct `eth_call` after execution, all three return the Safe from `owner()` and the zero address from `pendingOwner()`, so the transfer is settled, not half-done. Per contract:",
    },
    {
      type: "table",
      caption: "Ownership as read on chain after the handover, 2026-07-26. Safe = 0x47b5e2923216f203b7960d8D232215534AF02FF2.",
      headers: ["Contract", "`owner()` today", "How it got there"],
      rows: [
        ["GuardrailConfig", "the Safe", "Safe-owned **from construction**, it never passed through the deploy key at all."],
        ["UniswapSwapAdapter", "the Safe", "Safe-owned **from construction**, same as above."],
        ["RWAVault", "the Safe", "`Ownable2Step` transfer, **accepted** by the Safe; `pendingOwner()` is now `0x0`."],
        ["ChainlinkOracleAdapter", "the Safe", "`Ownable2Step` transfer, **accepted** by the Safe; `pendingOwner()` is now `0x0`."],
        ["SessionKeyExecutor", "the Safe", "`Ownable2Step` transfer, **accepted** by the Safe; `pendingOwner()` is now `0x0`."],
      ],
    },
    {
      type: "prose",
      md: "The negative control was checked too, not just the positive one. The deployer EOA `0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51` now reverts with `OwnableUnauthorizedAccount` (`0x118cdaa7`) on `allowToken`, `setDepositCap` and `setFeedFrozen`, while the same calls from the Safe address succeed. The deploy key retains no authority over any contract in the stack.",
    },
    {
      type: "callout",
      tone: "info",
      title: "What multisig ownership does, and does not, buy",
      md: "Every owner-controlled contract in the stack is owned by the 2-of-3 Safe, so changing a risk cap, a price feed, the deposit cap or a session grant requires **two of three signatures**, and no single hot key can weaken the guardrails. That is a statement about **custody, not about code**: it does not make the contracts audited, verified on the explorer, or safe. The audit is still the caveat that matters most.",
    },
    {
      type: "note",
      md: "The on-chain module remains a **direction**, gated behind a third-party audit, explorer verification, and legal/securities review. The US-person question is unresolved and the `$AELIX` token is **not built**. Scope in full: [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "divider",
    },
    {
      type: "callout",
      tone: "info",
      title: "Where to go next",
      md: "Meet the roles the PM dispatches in [The Desk Team](/docs/team), follow a run end to end in [The Desk Run](/docs/workflow), see the broker tool map in [MCP & the broker](/docs/mcp), or open the read-only mirror in [Dashboard](/docs/dashboard).",
    },
  ],
};
