<div align="center">

# ◤ AELIX ◢

### Agentic AI Equity Research Desk

**A team of specialist AI analysts that research your watchlist inside Claude Code,
connect to a Robinhood Agentic account over MCP, and never place an order without your approval.**

[**📖 Documentation**](https://www.aelix.xyz/docs) · [**🌐 Website**](https://www.aelix.xyz) · [**⚡ Quickstart**](https://www.aelix.xyz/docs/quickstart) · [**🛡 Guardrails**](https://www.aelix.xyz/docs/guardrails)

![License: MIT](https://img.shields.io/badge/License-MIT-c5e94a.svg)
![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-16180d)
![Status: beta](https://img.shields.io/badge/status-beta%20·%20educational-e23b3b)
![Scope: equities only](https://img.shields.io/badge/scope-equities%20·%20long--only-16180d)

</div>

---

Aelix isn't a bot that YOLOs your money. It's a small **desk of specialized sub-agents**
— fundamental, technical, macro/news, and a **risk manager with veto power** — that screen
your watchlist, debate each candidate, and hand you a one-click **preview card**. You
approve; it places. Everything is wrapped in written guardrails (human-in-the-loop,
position caps, prompt-injection defense) and mirrored to a Robinhood-style dashboard.

![Aelix — the desk dashboard](docs/demo.jpeg)

> [!WARNING]
> **Real money, beta, not investment advice.** Robinhood Agentic Trading is in beta
> (US, equities only). The desk trades only inside an isolated Agentic account funded with
> a dedicated budget — **that budget is the most it can ever lose**. There is **no track
> record and no performance claim here**; this is a reference architecture for learning.
> Run it at your own risk and monitor it yourself.

## Why it's different

- **A team, not one prompt** — analysts gather evidence in parallel; an independent risk
  manager can veto a trade the analysts liked.
- **Guardrails are structural, not vibes** — the sub-agents physically have no order tools;
  only the Portfolio Manager can place, and only after your explicit in-session approval.
- **Prompt-injection-aware** — the news agent treats fetched content as untrusted data and
  quotes suspicious "instructions" instead of acting on them.
- **Low-touch by design** — it runs read-only research on a schedule and only surfaces a
  trade when one genuinely qualifies; most days it tells you to stand aside.
- **A real dashboard** — a Robinhood-style UI mirrors the desk's state live.

## How the desk works

You talk to the **Portfolio Manager (PM = the main Claude Code session)** in plain
language. Analysts gather evidence in parallel; the Risk Manager has veto power; only the
PM can place orders — and only after **your** approval. After every run the PM writes
`ui/public/desk-state.json`, which the dashboard mirrors live.

```mermaid
flowchart TD
    U([You: ask the PM in plain language]) --> PM{{Portfolio Manager<br/>main session · only role that can order}}

    subgraph SENSE [1. Sense]
      PM --> A1[get_portfolio / get_equity_positions<br/>Agentic account only]
    end

    subgraph RESEARCH [2-3. Screen + Research · parallel · read-only]
      A1 --> F[Fundamental Analyst<br/>valuation · earnings]
      A1 --> T[Technical Analyst<br/>trend · levels · scans]
      A1 --> M[Macro / News Analyst<br/>backdrop · news · INJECTION-ISOLATED]
    end

    F --> SYN[4. PM synthesizes a proposed trade<br/>tied to a rule in strategies/]
    T --> SYN
    M --> SYN

    SYN --> RISK{5. Risk Manager<br/>checks vs strategies/}
    RISK -- VETO --> STOP([Trade stops · PM reports back])
    RISK -- APPROVE / CHANGES --> PREV[6. review_equity_order<br/>build preview card]

    PREV --> SNAP[(7. Write desk-state.json)]
    SNAP --> GATE[8. Present preview · ⏸ wait for your approval]
    GATE -- you say yes --> EXEC[9. place_equity_order<br/>still gated by ask rule]
    GATE -- you say no --> STOP
    EXEC --> CONF[10. Confirm fill · refresh desk-state.json · log]

    SNAP -. polled every 5s .-> DASH[/Dashboard: npm run dev/]
    CONF -. updates .-> DASH
```

Steps 1–7 are research and produce **no order**. The desk's standard output is the
**preview card at step 8** — it stops there until you confirm. The full lifecycle is in
[the docs](https://www.aelix.xyz/docs/workflow).

## The desk team

| Role | File | Can place orders? | Focus |
|------|------|:-----------------:|-------|
| **Portfolio Manager** | *main session* | ✅ *only after your approval* | Orchestrates the run; the only role with order tools |
| **Fundamental Analyst** | `.claude/agents/fundamental-analyst.md` | ❌ | Valuation, earnings, growth, balance-sheet health |
| **Technical Analyst** | `.claude/agents/technical-analyst.md` | ❌ | Trend, momentum, support/resistance, scans |
| **Macro / News Analyst** | `.claude/agents/macro-news-analyst.md` | ❌ | Market backdrop + news — **injection-isolated** |
| **Risk Manager** | `.claude/agents/risk-manager.md` | ❌ *(veto power)* | Checks every trade against written caps |

**Least privilege:** only the PM has order tools. The analysts and Risk Manager physically
cannot place a trade. Details → [The Desk Team](https://www.aelix.xyz/docs/team).

## Quickstart

```bash
# 1. Make this repo PRIVATE before pushing anything.

# 2. One-time: connect + authenticate the Robinhood MCP, then fund a small Agentic budget
claude                                  # open the project (trust the .mcp.json server)
#   in-session:  /mcp                   # pick robinhood-trading → OAuth (desktop + mobile verify)

# 3. Define your risk caps in strategies/ before trading (the Risk Manager VETOes if unset)

# 4. Run the dashboard (separate terminal) — mirrors each desk run
cd ui && npm install && npm run dev     # http://localhost:5180 (shows demo until a live run)

# 5. Drive the desk — just talk to the PM, e.g.:
#   "Screen my watchlist and bring me the top 2 ideas with full team analysis."
#   "Run the desk on AAPL and NVDA, risk-check a small starter in the better one."

# Kill switch: disconnect the MCP from the Robinhood app, or remove it locally
claude mcp remove robinhood-trading
```

Full walkthrough → [Installation & Setup](https://www.aelix.xyz/docs/setup).

> [!NOTE]
> The sub-agents in `.claude/agents/` load when Claude Code **starts** — after adding or
> editing them, restart the session so roles like `fundamental-analyst` are recognized with
> their restricted tool sets.

## Safety posture (read before funding)

- The agent can only trade in the **Agentic account**, never your main balance.
- Every order sits behind a manual approval prompt (`ask` rule in `.claude/settings.json`);
  options tools are `deny`; read-only tools are `allow`. Evaluation is `deny → ask → allow`.
- `CLAUDE.md` includes a prompt-injection rule: the agent must ignore trading instructions
  found in fetched/external content (news, analyst notes, web) and surface them as quotes.
- Every proposed trade must map to a written rule in `strategies/`; the Risk Manager VETOes
  if a cap is unset, a stop is missing, or account data looks inconsistent.
- You can disconnect the MCP anytime from the Robinhood app — that's your kill switch.

Deep dive → [Guardrails](https://www.aelix.xyz/docs/guardrails) ·
[Prompt-Injection Defense](https://www.aelix.xyz/docs/prompt-injection) ·
[Strategies & Risk](https://www.aelix.xyz/docs/strategies).

## What's in the repo

```
.
├── CLAUDE.md                  # The PM's operating contract (rules it must follow)
├── .mcp.json                  # Project-scoped Robinhood Trading MCP connection (HTTP + OAuth)
├── .claude/
│   ├── settings.json          # Permissions: reads allowed, orders gated (ask), options denied
│   └── agents/                # The desk team — one least-privilege sub-agent per role
├── strategies/                # Written risk caps + entry/exit rules the Risk Manager enforces
│   ├── README.md              # Caps + when the Risk Manager must VETO
│   ├── mean-reversion.md      # Buy oversold pullbacks inside an uptrend
│   └── left-side-accumulation.md   # The defined exception to "no averaging into losers"
├── docs/                      # Source docs (TEAM, SETUP, TRIGGER, LOGGING) + media
├── backtest/                  # Offline, dependency-free strategy backtester (pure Node ESM)
├── tools/desk-log.mjs         # Append-only JSONL audit-log helper
├── logs/                      # JSONL decision trail (real logs gitignored)
├── ui/                        # Read-only Robinhood-style dashboard (Vite + React)
│   └── public/desk-state.example.json   # demo data (live desk-state.json is gitignored)
└── landing/                   # Marketing site + full documentation (Next.js) → aelix.xyz
```

Real account state, OAuth tokens, and live logs are **never** committed — only sanitized
`*.example.*` files are. See [Configuration](https://www.aelix.xyz/docs/configuration).

## Documentation

The complete, browsable docs live at **[aelix.xyz/docs](https://www.aelix.xyz/docs)**:

| | |
|---|---|
| [Overview](https://www.aelix.xyz/docs) | What Aelix is and the core idea |
| [Quickstart](https://www.aelix.xyz/docs/quickstart) · [Setup](https://www.aelix.xyz/docs/setup) | From clone to first desk run |
| [Architecture](https://www.aelix.xyz/docs/architecture) · [The Desk Team](https://www.aelix.xyz/docs/team) · [The Desk Run](https://www.aelix.xyz/docs/workflow) | How it works |
| [Guardrails](https://www.aelix.xyz/docs/guardrails) · [Prompt-Injection Defense](https://www.aelix.xyz/docs/prompt-injection) · [Strategies & Risk](https://www.aelix.xyz/docs/strategies) | Safety |
| [Configuration](https://www.aelix.xyz/docs/configuration) · [MCP & Tools](https://www.aelix.xyz/docs/mcp) · [Dashboard](https://www.aelix.xyz/docs/dashboard) · [Backtester](https://www.aelix.xyz/docs/backtesting) · [Audit Logging](https://www.aelix.xyz/docs/logging) | Reference |
| [FAQ](https://www.aelix.xyz/docs/faq) · [Glossary](https://www.aelix.xyz/docs/glossary) · [Safety & Disclaimer](https://www.aelix.xyz/docs/disclaimer) | More |

To run the site + docs locally:

```bash
cd landing && npm install && npm run dev   # http://localhost:5190  (docs at /docs)
```

## Disclaimer

Aelix is a **research & recommendation tool, not financial advice**. Robinhood Agentic
Trading is in beta (US, equities only). The desk trades only inside an isolated Agentic
account funded with a dedicated budget — that budget is the most it can ever lose. **There
is no track record and no performance claim here**; all example data is illustrative. All
investment decisions are your own responsibility. Use only risk capital. Any crypto/token
material referenced in exploratory notes is **out of scope, unverified, and not
implemented** — see [Safety & Disclaimer](https://www.aelix.xyz/docs/disclaimer).

<div align="center">

**[github.com/aelixagent/aelix](https://github.com/aelixagent/aelix)** · Built on Claude Code + Robinhood Agentic · MIT License

</div>
