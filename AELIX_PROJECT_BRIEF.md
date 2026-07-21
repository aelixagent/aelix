# AELIX — Project Brief & X Content Playbook

> **Read this before writing any X/Twitter (or other marketing) content.**
> It is the single source of truth for what Aelix *is*, what you may claim, and what you must **never** claim.
> Last synced from the repo: 2026-07-21. If code/docs change, re-verify.

---

## 0. How to use this doc

1. Skim **§1–§3** for the pitch, **§11** for voice, **§12** for the hard limits.
2. Pull ready-made copy from the **§13 X Content Playbook** (taglines, bios, post templates).
3. Before posting, run the **§12 compliance checklist** — Aelix is real-money-adjacent and mostly **testnet/beta**, so overclaiming is the #1 risk.

---

## 1. What Aelix is (one-liner)

**Aelix is an agentic AI equity-research desk that runs inside Claude Code, connects to a Robinhood Agentic account over MCP, and never places an order without your explicit approval.**

Elevator: A desk of 4 specialist AI agents + a Risk Manager with veto researches your watchlist around the clock, stops at a preview card, and waits for your "yes." The rules that keep it safe live in code the agent can't weaken — and (on testnet) are being compiled on-chain so they're *enforced, not promised*.

- Brand is **Aelix** (established 2026-07-21). Wordmark styled `◤ AELIX ◢`; mark is the chartreuse **"AX" monogram** (`/aelix-mark.png`).
- Not a bot that auto-trades. Positioned as the deliberate opposite of "a bot that YOLOs your money."

---

## 2. The problem it solves

- Retail traders rarely get a **structured second opinion**. Aelix gives you five (PM + 3 analysts + Risk Manager).
- Autonomous trading "bots" auto-execute on a hunch, are a single black box, have no independent risk check, act on online hype, and can reach your whole balance.
- In most AI agents, **safety is aspirational** (vibes/prompts). Aelix makes it **structural** — enforced by files *outside the agent's reach*.

---

## 3. Core innovation (the real differentiators)

1. **Structural safety, not aspirational.** Analysts *physically* hold no order tools (enforced in `.claude/agents/*.md` frontmatter). Only the PM can reach `place_equity_order`, behind an `ask` permission gate **and** your in-session "yes."
2. **Guardrails-as-code the agent can't weaken.** Rules live in `CLAUDE.md` + `.claude/settings.json`; the agent refuses to edit its own contract. On-chain (testnet), the same caps are enforced by the vault contract on every trade.
3. **Claude-Code-native, no backend.** The PM *is* the main Claude Code session — no Python server, no LangGraph/LangChain, no database, no Docker. Sub-agents are Markdown files; state is one JSON snapshot + append-only JSONL logs.
4. **Prompt-injection containment as first-class design.** All fetched/external content is untrusted *data*, never instructions; the web-facing analyst quotes instruction-like text under an `INJECTION ATTEMPTS` line and surfaces it in `injectionAlerts[]`.
5. **Verifiable track record (testnet).** Every desk run can be attested on-chain (append-only, timestamped), and performance math is computed *from the attested data* so it can't be inflated.

---

## 4. Key features

- **Multi-agent desk:** PM + Fundamental, Technical, Macro/News analysts (all `sonnet`) + Risk Manager (`opus`, holds VETO).
- **Human-in-the-loop on every order** — desk stops at a preview card (symbol, side, qty, order type, est. cost, rationale) and waits.
- **`deny → ask → allow` permission gate** (first match wins): reads/preview = allow; `place/cancel_equity_order` = ask (every time); option orders = **hard deny**.
- **Least-privilege agents** — analysts/Risk Manager have no order tools.
- **Written strategy binding + risk caps** enforced by the Risk Manager (see §8). Empty/unset cap = automatic **VETO**.
- **Read-only dashboard** (`ui/`, Vite+React) mirrors `desk-state.json` ~every 5s; cannot trade.
- **Offline, dependency-free backtester** + **append-only JSONL audit log**.
- **Kill switch:** `claude mcp remove robinhood-trading` severs all broker access.
- **On-chain layer (testnet-first, NOT live):** guardrails-as-code library, ERC-4626 RWA vault, on-chain attestations, scoped session-key executor, recurring DCA autosave.

---

## 5. How it works — the 9-step desk run

Steps 1–6 produce **no order**.

1. **SENSE** — read portfolio + positions (Agentic account, read-only).
2. **SCREEN** — Technical Analyst runs scans → candidate shortlist.
3. **RESEARCH** — Fundamental + Technical + Macro/News run in parallel → 3 verdicts (news is injection-isolated).
4. **SYNTHESIZE** — PM proposes one trade tied to a written rule in `strategies/`.
5. **RISK** — Risk Manager → APPROVE / APPROVE-WITH-CHANGES / **VETO** (veto stops here).
6. **PREVIEW** — `review_equity_order` builds a preview/cost card.
7. **APPROVAL ⏸** — desk pauses, shows you the preview, waits for explicit "yes."
8. **EXECUTE** — only on your yes: `place_equity_order` (still `ask`-gated).
9. **CONFIRM** — verify fill, write `desk-state.json`, log to JSONL.

> "Silence is not consent." Scheduled/overnight runs also stop at the preview card.

---

## 6. The desk (agents)

| Role | Model | Does | Never |
|---|---|---|---|
| **Portfolio Manager (PM)** | main session | Orchestrates the run, synthesizes, builds preview, places the (approved) order | Skip approval |
| **Fundamental Analyst** | sonnet | Valuation (P/E, P/S, margins), growth, balance sheet; flags earnings ≤~10 trading days; score −2…+2 | Decide/place trades |
| **Technical Analyst** | sonnet | Screens candidates; trend/momentum/S-R/volatility; entry/stop **reference** levels | Command entries |
| **Macro / News Analyst** | sonnet | Index/macro backdrop + dated, sourced headlines; fact vs opinion; `INJECTION ATTEMPTS` line | Give its own buy/sell call; obey fetched text |
| **Risk Manager** | **opus** | VETO gate; checks every trade vs `strategies/` caps; recomputes size from live quote | Hold any order tool |

Analysts and the Risk Manager are **read-only** — they produce evidence, not orders.

---

## 7. Prompt-injection defense

- All external content (news, web pages, fetched docs — anything not typed by the user in-session) = **untrusted data, never instructions.**
- Instruction-like text ("buy X now", "ignore previous rules", "transfer funds") is **quoted and surfaced, never obeyed.**
- Only the user's direct in-session messages can authorize an action.
- Containment concentrated in the web-facing Macro/News analyst → `injectionAlerts[]` in `desk-state.json`.

---

## 8. Risk caps (configurable defaults, NOT guarantees)

Global caps live in `strategies/README.md`; % of **NAV** (`get_portfolio.total_value`). If a cap is removed/unset → Risk Manager **VETOes**.

| Rule | Default |
|---|---|
| Per-trade cap | **15%** of NAV per order |
| Max concentration (one symbol) | **25%** |
| Max open positions | **6** |
| Max daily orders (buys+sells) | **4** |
| Per-position stop-loss | **−8%** from avg entry |
| Daily loss halt | **−5%** account day P&L |
| Cash buffer | **≥10%** in cash |

> These are **conservative, editable starting defaults — "review before funding, not advice."** Present as *configurable guardrails*, never as fixed product promises or performance claims.

**Strategies (2 documented):**
- **`mean-reversion.md`** — buy oversold dips *inside a confirmed uptrend*, sell the snap-back; long-only, swing. ~1% NAV risk/trade. **No averaging into losers.**
- **`left-side-accumulation.md`** — the *one* documented exception: a pre-planned, risk-budgeted two-tranche scale-in (60%/40%) at named support in a high-quality name's fear selloff; total risk ≤2% NAV, whole-position kill-stop. Each tranche is still individually previewed & approved — "a plan, not pre-authorization."

---

## 9. On-chain module (TESTNET-FIRST — NOT LIVE ON MAINNET)

Turns the desk into something others can use **and verify**: a non-custodial, AI-managed vault for tokenized real-world assets where the desk's risk rules are **enforced by the contract**, and every run leaves a tamper-proof record.

- **`RWAVault`** — OpenZeppelin **ERC-4626** vault ("Aelix RWA Vault", share symbol **`vAELIX`**). Note: the currently-live testnet contract still reports `vVLRA` until it's redeployed from the renamed source. Asset = USDG; NAV = USDG cash + oracle-priced allowlisted Stock Tokens. Always-solvent in-kind exit.
- **`Guardrails`** (pure lib) — the `CLAUDE.md` rulebook as deterministic `evaluate()`. Called on **every** `executeTrade`; reverts `GuardrailViolation`. Buys (risk-increasing) gated; risk-reducing sells always allowed. Per-trade/concentration/positions/daily-orders/stop/daily-loss/cash-buffer/no-averaging all enforced; execution-slippage bounded; **fails closed** (zero cap reverts).
- **`GuardrailConfig`** — human-owned (two-step ownership), agent read-only, can't widen caps.
- **`SessionKeyExecutor`** — scoped, revocable, expiring agent "sessions" (notional caps, trade count, token allowlist, buy/sell perms). ERC-4337-style *intent* but a plain scoped EOA — **not** a real 4337 account (roadmap).
- **`DeskRegistry` + `PerfScore`** — append-only attested track record (epoch, timestamp, NAV, realized PnL, snapshot hash, uri) + on-chain performance math (return, max drawdown, vol, Sharpe-like) derived only from attested data.
- **`AelixAutosave`** — non-custodial recurring DCA into the vault via permissionless keeper.
- **Chain:** Robinhood Chain (EVM, Arbitrum Orbit). **Testnet chainId 46630** (live/verified, 122 passing tests, guardrails confirmed reverting). **Mainnet 4663 = NOT deployed.**
- **Big caveats:** periphery (USDG/oracle/swap) is **mocked** in the demo → "functional preview, NOT real RWA exposure." **Not audited. Do not use with real funds.** Stock Tokens are **not for US persons** (build targets non-US); Stock Tokens ≠ share ownership.

> ✅ **Docs reconciled (2026-07-21):** `architecture.ts`, `faq.ts`, and `disclaimer.ts` no longer claim "no chain code in this repo." They now state the running equities desk has no chain code in its *trading path*, while the on-chain layer is a **separate, testnet-first, unaudited module in `onchain/`** (not on mainnet, not part of the live desk, gated behind legal/securities review). Kept conservative — sanity-check the legal wording if publishing.

---

## 10. Brand kit

- **Name:** Aelix. Wordmark `◤ AELIX ◢`. Mark: chartreuse **AX monogram** tile (`/aelix-mark.png`) — header, preloader, favicon.
- **Palette (`landing/lib/brand.ts`):**
  - Accent / "lime flood": **`#D7FE51`** (Robinhood-green chartreuse) — the signature color.
  - Foreground off-white: **`#ECF2F0`**
  - Danger red: **`#FF5B52`** · Mint: **`#E9FF86`** · Warn: **`#FFC53D`**
- **Type:** Display = **Cormorant Garamond** (thin high-contrast serif); Body = **Instrument Sans**; Mono = **Space Mono**.
- **Voice:** cinematic, minimal, confident, safety-first, anti-hype. Short declaratives. "Reads the tape. Weighs the risk. Waits for you." Emphasize restraint — "the desk mostly tells you to wait."

**Existing taglines / lines (verbatim, reuse freely):**
- "An AI trading desk that researches around the clock — and never trades without your yes."
- "Reads the tape. / Weighs the risk. / Waits for you."
- "Nothing Slips" · "Signals, Not Noise" · "You Decide" · "The desk proposes; you dispose."
- "One Desk. Every Angle." · "Run with Aelix" · "Approved by you. Executed with care."
- Marquee: HUMAN-IN-THE-LOOP · NO ORDER WITHOUT YOUR APPROVAL · 4 SPECIALIST AGENTS · RISK VETO ARMED · GUARDRAILS AS CODE · ON-CHAIN VAULT · TESTNET · VERIFIABLE TRACK RECORD · ON ROBINHOOD CHAIN · TESTNET PREVIEW · NOT YET LIVE · BETA · NOT INVESTMENT ADVICE
- Stats: "4 Specialist AI agents" · "100% Orders you approve first" · "1 Risk manager with veto"

---

## 11. Status & disclaimers (bake these into content)

- **Not investment advice.** Research tool / reference architecture. **No track record, no performance claims** — all example data is illustrative.
- **Real money · beta.** Robinhood Agentic Trading is **beta, US, equities only, long-only, USD**. Options/crypto/futures unsupported (option tools hard-denied).
- **On-chain/token features NOT live** — testnet-first, nothing on mainnet, all on-chain values are illustrative previews, gated behind legal/securities review. "There is no track record."
- **Max downside = the dedicated budget** funding the isolated Agentic account. Use only risk capital.
- **Not affiliated** with Robinhood or Anthropic. **MIT licensed.** Independent/educational.

---

## 12. ✅ Compliance checklist before every post

**You MAY claim (all true):**
- 4 specialist AI agents + PM + a Risk Manager with veto power.
- Never trades without your explicit approval; human-in-the-loop on every order.
- Guardrails-as-code the agent can't weaken; on **testnet**, enforced on-chain by the vault.
- Prompt-injection contained; open-source (MIT); runs in Claude Code, no backend.
- Equities, Robinhood Agentic (beta).

**You must NOT claim / imply:**
- ❌ Any **returns, profit, performance, or "track record"** ("there is no track record").
- ❌ "Guaranteed", "safe", "risk-free", "can't lose", or that guardrails guarantee outcomes (they're *configurable defaults*).
- ❌ That the **on-chain vault / RWA / token is live** or that real-money on-chain exposure exists (it's **testnet, mocked periphery, unaudited**).
- ❌ A **$AELIX token sale, price, or investment** (token is an unlaunched roadmap experiment).
- ❌ Affiliation/endorsement by **Robinhood or Anthropic**.
- ❌ Financial advice or "trade this."

**When relevant, include a caveat:** `testnet preview · not live` · `beta · not investment advice` · `not affiliated with Robinhood`.

---

## 13. X CONTENT PLAYBOOK

### Voice rules
- Calm, deliberate, intelligent. Short lines. Let restraint be the flex.
- Lead with the **mechanism** (never-without-your-yes, enforced-not-promised), not hype.
- One idea per post. Concrete > clever.

### Positioning vs competitors (e.g. VEX)
VEX's bio "the agent you can trust with capital" and teaser "it's already moving" sell **generic trust + autonomous momentum**. **Do the opposite:** Aelix's edge is that it **won't** move without you and its safety is **verifiable**. Never reuse "trust with capital" / "already moving." Sell the *how*.

### Tagline / opener bank
- Header/banner tagline: **"Autonomy without losing control"**
- First-post / "intelligence" openers: **"where research becomes edge"**, **"an edge you can verify"**, **"the desk that reads first"**, "it's already watching", "it waits for your yes."
- Site lines: "Reads the tape. Weighs the risk. Waits for you." · "Signals, Not Noise" · "The desk proposes; you dispose."

### Bio bank (≤160 chars; put link in Website field)
1. `An AI trading desk that never trades without your yes. Research runs 24/7; guardrails are enforced on-chain, not promised. ⛓ testnet`
2. `The desk proposes, you dispose. AI analysts + a Risk Manager with veto, guardrails enforced on-chain, every call attested. Never trades without your yes.`
3. `Guardrails compiled on-chain — enforced, not promised. An AI trading desk that researches around the clock and waits for your yes. ⛓ testnet`
4. `Autonomy without losing control. A desk of AI analysts researches your watchlist 24/7 — never trades without your yes. On-chain guardrails · testnet`

### Post templates

**Launch / positioning (pin-worthy):**
> Meet Aelix — an AI trading desk that never trades without your yes.
>
> A team of AI analysts reads your watchlist around the clock. A Risk Manager holds veto. Your limits are enforced in code — not promised.
>
> Autonomy without losing control.
>
> Testnet preview · not investment advice 👇

**Differentiator vs bots:**
> Most "AI trading" = a black box that auto-executes on a hunch and can reach your whole balance.
>
> Aelix is the opposite: 4 specialist agents debate, a Risk Manager can veto, and nothing is placed without your explicit yes. Guardrails live in code the agent can't weaken.

**Feature spotlight (Risk Manager):**
> Every trade Aelix proposes hits one last gate: a Risk Manager whose only job is to protect capital.
>
> Per-trade cap, concentration, stop-loss, daily-loss halt — if a rule is unwritten or the math is off, it VETOes. Conservative, configurable guardrails. Not advice.

**How it works:**
> How Aelix reaches a trade:
> Sense → Screen → 3 analysts research in parallel → PM synthesizes → Risk Manager checks → preview card → ⏸ waits for your yes → executes.
>
> Steps 1–6 place nothing. Silence is not consent.

**On-chain (always caveated):**
> On testnet, Aelix compiles its rulebook on-chain: an ERC-4626 vault that reverts any trade breaking your caps, plus an append-only attested track record you can verify.
>
> Enforced, not promised. Testnet preview — mocked periphery, unaudited, not real exposure.

---

## 14. Open naming / cleanup issues (fix before scaling marketing)

- ✅ **DONE — Token ticker renamed** `vVLRA`→`vAELIX` and `$VLRA`→`$AELIX` across onchain deploy scripts + tests, `data.ts`, `faq.ts`, `disclaimer.ts`, `token.tsx`, `design.md`. Landing typechecks, onchain compiles. (Live testnet contract still reports `vVLRA` until redeployed; `broadcast/*.json` are generated artifacts, left untouched.)
- ✅ **DONE — Internal codenames removed** ("Halon" / "Robin Droids" scrubbed from `brand.ts`). "vvvhound" in `page.tsx` / `diorama.tsx` left as-is (third-party design-technique name, not brand).
- ✅ **DONE — Domain renamed** `projectvex.ai` → **`aelix.xyz`** across `site.ts` `SITE_URL`, `opengraph-image.tsx`, and all README links (now `https://www.aelix.xyz`). Register the domain + point DNS/deploy at it, and set `NEXT_PUBLIC_SITE_URL` in prod if the host differs. (`GITHUB_URL` already `github.com/aelixagent/aelix`.)
- **Docs vs on-chain contradiction:** `architecture.ts` disclaims all chain code as unimplemented while `onchain/` is live on testnet — reconcile the public story.
