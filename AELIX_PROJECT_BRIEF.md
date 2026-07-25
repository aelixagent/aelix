# AELIX — Project Brief & X Content Playbook

> **Read this before writing any X/Twitter (or other marketing) content.**
> It is the single source of truth for what Aelix *is*, what you may claim, and what you must **never** claim.
> Last synced from the repo: **2026-07-26** (on-chain module deployed to Robinhood Chain mainnet; addresses and state verified by direct on-chain reads). If code/docs change, re-verify.

---

## 0. How to use this doc

1. Skim **§1–§3** for the pitch, **§11** for voice, **§12** for the hard limits.
2. Pull ready-made copy from the **§13 X Content Playbook** (taglines, bios, post templates).
3. Before posting, run the **§12 compliance checklist** — Aelix is real-money-adjacent, the equities desk is **beta**, and the on-chain module is **live on mainnet but unaudited with handover still pending**, so overclaiming is the #1 risk.

---

## 1. What Aelix is (one-liner)

**Aelix is an agentic AI equity-research desk that runs inside Claude Code, connects to a Robinhood Agentic account over MCP, and never places an order without your explicit approval.**

Elevator: A desk of 4 specialist AI agents + a Risk Manager with veto researches your watchlist around the clock, stops at a preview card, and waits for your "yes." The rules that keep it safe live in code the agent can't weaken — and are now compiled on-chain on Robinhood Chain mainnet, so they're *enforced, not promised*. Mainnet, unaudited, deposits capped, no track record.

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
2. **Guardrails-as-code the agent can't weaken.** Rules live in `CLAUDE.md` + `.claude/settings.json`; the agent refuses to edit its own contract. On-chain — now on **Robinhood Chain mainnet (chainId 4663)** — the same caps are enforced by the vault contract on every trade, which reverts when they're breached.
3. **Claude-Code-native, no backend.** The PM *is* the main Claude Code session — no Python server, no LangGraph/LangChain, no database, no Docker. Sub-agents are Markdown files; state is one JSON snapshot + append-only JSONL logs.
4. **Prompt-injection containment as first-class design.** All fetched/external content is untrusted *data*, never instructions; the web-facing analyst quotes instruction-like text under an `INJECTION ATTEMPTS` line and surfaces it in `injectionAlerts[]`.
5. **Track record that can't be inflated — mechanism live, record still empty.** The attestation contracts (`DeskRegistry` + `PerfScore`) are deployed on mainnet: desk runs can be attested append-only and timestamped, and performance math is computed *from the attested data*, so it can't be cherry-picked after the fact. Nothing has been attested yet — **there is no track record**. Sell the mechanism, never a result.

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
- **On-chain layer (live on Robinhood Chain mainnet · unaudited · deposits capped · no depositors yet):** guardrails-as-code library, ERC-4626 RWA vault (`vAELIX`), Chainlink oracle adapter, Uniswap V2 swap adapter, on-chain attestations, scoped session-key executor, recurring DCA autosave. Real periphery, no mocks in the mainnet path. Separate from the equities desk's trading path — the deploy does **not** make the desk autonomous.

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

## 9. On-chain module (LIVE ON MAINNET — UNAUDITED · HANDOVER PENDING · NO DEPOSITORS)

Turns the desk into something others can use **and verify**: a non-custodial, AI-managed vault for tokenized real-world assets where the desk's risk rules are **enforced by the contract**, and every run can leave a tamper-proof record.

**Deployed 2026-07-26 to Robinhood Chain mainnet, chainId 4663.** Every address below was verified by calling an identifying function on it. This is not testnet and not a mock.

| Contract | Address (chain 4663) |
|---|---|
| Safe (2-of-3 multisig) | `0x47b5e2923216f203b7960d8D232215534AF02FF2` |
| `RWAVault` (`vAELIX`) | `0x0e500E390cC599055f1e54194e1e611Cf64c5047` |
| `GuardrailConfig` | `0x68cf24994d0363Be7688e96B69dDacC290c766C0` |
| `ChainlinkOracleAdapter` | `0xF6cFcA2024AFDeC14BCb0A9eb7bA402e73b2699A` |
| `DeskRegistry` | `0x68cc84d722E2d613cAc36c62167B177656e2C983` |
| `PerfScore` | `0x1CB3df5AAFEb0d2c31277e3e889613bc6F4C9e14` |
| `UniswapSwapAdapter` | `0x9a8bb5E65f340C4Bf6c7Aa71991EC5D31083b5cf` |
| `SessionKeyExecutor` | `0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7` |
| `AelixAutosave` | `0x5b0778E8561EA31490588D21bd44419803DC709b` |

- **`RWAVault`** — OpenZeppelin **ERC-4626** vault ("Aelix RWA Vault", share symbol **`vAELIX`**, **12 decimals** = 6 USDG + 6 offset). Asset = USDG; NAV = USDG cash + oracle-priced allowlisted Stock Tokens. Always-solvent in-kind exit. **Deposit cap live at 10,000 USDG.** Current state: `totalAssets` 0, `totalSupply` 0, not paused, 5 tokens allowlisted.
- **`Guardrails`** (pure lib) — the `CLAUDE.md` rulebook as deterministic `evaluate()`. Called on **every** `executeTrade`; reverts `GuardrailViolation`. Buys (risk-increasing) gated; risk-reducing sells always allowed. Per-trade/concentration/positions/daily-orders/stop/daily-loss/cash-buffer/no-averaging all enforced; execution-slippage bounded; **fails closed** (zero cap reverts).
- **`GuardrailConfig`** — agent read-only, can't widen caps. Two-step ownership, **already owned by the Safe**.
- **`SessionKeyExecutor`** — scoped, revocable, expiring agent "sessions" (notional caps, trade count, token allowlist, buy/sell perms). ERC-4337-style *intent* but a plain scoped EOA — **not** a real 4337 account (roadmap).
- **`DeskRegistry` + `PerfScore`** — append-only attestation rails (epoch, timestamp, NAV, realized PnL, snapshot hash, uri) + on-chain performance math (return, max drawdown, vol, Sharpe-like) derived only from attested data. **Nothing attested yet — no track record.**
- **`AelixAutosave`** — non-custodial recurring DCA into the vault via permissionless keeper.
- **Real periphery (verified on-chain, not copied from docs):**
  - **USDG** `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` — `decimals()` == **6**, symbol `USDG`, name "Global Dollar". The 6-dec original, **not** the 18-dec look-alike.
  - **Uniswap V2 Router02** `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` — its `WETH()` returns the documented WETH, cross-confirming identity.
  - **Five real Robinhood Stock Tokens**, each with its own Chainlink feed proxy: **NVDA, AAPL, TSLA, GOOGL, SPY**. All 18-dec, all expose `oraclePaused()` and ERC-8056 `uiMultiplier()`. All equity feeds are 8-dec, 86400s heartbeat, 0.5% deviation. Oracle returns live prices (NVDA read $206.37 at deploy time).
- **214 tests passing.**

### Caveats that survive the mainnet deploy — never drop these

1. **No third-party audit.** Two internal audit passes plus a 42-agent preflight audit are **not an audit**. This is the single most important caveat. Unaudited contracts carry total-loss risk; the 10,000 USDG cap **bounds** exposure by design, it does not remove it.
2. **Ownership handover is pending.** `GuardrailConfig` and `UniswapSwapAdapter` are owned by the Safe. `RWAVault`, `ChainlinkOracleAdapter` and `SessionKeyExecutor` still have `owner()` == the deployer EOA (`0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51`) with `pendingOwner()` == the Safe; they're `Ownable2Step`, so the Safe must call `acceptOwnership()` on each. Until that lands, **a single hot key controls those three.** Never write "owned by a 2-of-3 multisig" as a blanket statement — state it per contract.
3. **No track record, no returns, no performance.** TVL is 0, no depositors, no trades.
4. **Contracts are not yet verified on the block explorer.**
5. **No Chainlink sequencer uptime feed exists on Robinhood Chain** (56 feeds in the directory, zero uptime entries). Aelix substitutes a chain-liveness quorum built from 24/7 crypto feeds. It is **coarse by design**: it catches multi-hour outages, not minute-scale ones. Describe it as a substitute with that limitation — never as equivalent.
6. **US-person / securities review still stands.** Deploying a contract does not resolve regulatory exposure, and no legal review has been completed. Stock Tokens are **not for US persons** (build targets non-US); Stock Tokens ≠ share ownership.
7. **The desk is unchanged.** The mainnet deploy does not make the equities desk autonomous and does not connect real customer money or the Robinhood Agentic account to the vault. Every order still requires explicit human approval.

> **Docs status:** `architecture.ts`, `faq.ts`, and `disclaimer.ts` state that the running equities desk has no chain code in its *trading path*, while the on-chain layer is a **separate module in `onchain/`**. That framing still holds — but any "testnet / not on mainnet" wording in those files is now **wrong** and must be replaced with `mainnet · unaudited · deposits capped`, not deleted. Sanity-check the legal wording before publishing.

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
- Marquee: HUMAN-IN-THE-LOOP · NO ORDER WITHOUT YOUR APPROVAL · 4 SPECIALIST AGENTS · RISK VETO ARMED · GUARDRAILS AS CODE · ON-CHAIN VAULT · LIVE ON ROBINHOOD CHAIN MAINNET · UNAUDITED · DEPOSITS CAPPED · NO TRACK RECORD · BETA · NOT INVESTMENT ADVICE
  - Note: drop "VERIFIABLE TRACK RECORD" from the marquee — the rails exist, the record doesn't. Use "VERIFIABLE BY DESIGN" or "ATTESTED ON-CHAIN" if a slot needs filling.
- Stats: "4 Specialist AI agents" · "100% Orders you approve first" · "1 Risk manager with veto"

---

## 11. Status & disclaimers (bake these into content)

- **Not investment advice.** Research tool / reference architecture. **No track record, no performance claims** — any example figure must be explicitly labelled **SAMPLE**, never passed off as live.
- **Real money · beta.** Robinhood Agentic Trading is **beta, US, equities only, long-only, USD**. Options/crypto/futures unsupported (option tools hard-denied).
- **On-chain module: live on mainnet, unaudited, empty.** Deployed to Robinhood Chain mainnet (4663) with real periphery; **no third-party audit**, ownership handover to the Safe still pending on three contracts, contracts unverified on the explorer, deposits capped at 10,000 USDG, **TVL 0 / no depositors / no trades**. Still gated behind legal/securities review. "There is no track record."
- **$AELIX token is NOT live** — unlaunched, no sale, no price, no investment.
- **Any displayed figure must be a real on-chain read, honestly empty, or explicitly labelled SAMPLE.** Gate every "live" indicator on a successful read. Never fabricate a number, and never rebrand sample data as mainnet data.
- **Max downside = the dedicated budget** funding the isolated Agentic account. Use only risk capital.
- **Not affiliated** with Robinhood or Anthropic. **MIT licensed.** Independent/educational.

---

## 12. ✅ Compliance checklist before every post

**You MAY claim (all true, verified 2026-07-26):**
- 4 specialist AI agents + PM + a Risk Manager with veto power.
- Never trades without your explicit approval; human-in-the-loop on every order. **Unchanged by the mainnet deploy.**
- Guardrails-as-code the agent can't weaken — and now **compiled on-chain on Robinhood Chain mainnet (chainId 4663)**, where the vault reverts trades that breach the caps.
- The on-chain module is **deployed and live on mainnet** — not testnet, not mocked. **Real periphery throughout: no mocks in the mainnet path.** Real USDG (the 6-decimal original), real Uniswap V2 Router02, five real Robinhood Stock Tokens (NVDA, AAPL, TSLA, GOOGL, SPY) each with its own Chainlink feed, returning live prices.
- The vault is a real **ERC-4626** (`vAELIX`), **deposit cap live at 10,000 USDG**, 5 tokens allowlisted, not paused. **214 tests passing.**
- Attestation rails (`DeskRegistry` + `PerfScore`) are deployed: performance math is computed only from attested data, so it **can't be inflated after the fact**. Claim the *mechanism*, never a result.
- `GuardrailConfig` and `UniswapSwapAdapter` are owned by a **2-of-3 Safe multisig** — say it about those two by name, not about the stack.
- Prompt-injection contained; open-source (MIT); runs in Claude Code, no backend.
- Equities, Robinhood Agentic (beta).

**You must NOT claim / imply:**
- ❌ **That the module is audited, security-reviewed, or "reviewed by auditors."** There has been **no third-party audit**. Two internal audit passes plus a 42-agent preflight audit are **not an audit** — never let "hardened", "audit-passed", "battle-tested" or similar imply one. *This is the single most important prohibition in this doc and must survive every rewrite.*
- ❌ **That the contracts are under multisig control as a blanket statement.** `RWAVault`, `ChainlinkOracleAdapter` and `SessionKeyExecutor` still have `owner()` == the deployer EOA with the Safe only as `pendingOwner()`; they're `Ownable2Step` and the Safe must still call `acceptOwnership()`. Until then **a single hot key controls those three.** State ownership per contract or not at all.
- ❌ **That depositors, TVL, AUM, users, inflows, or any capital in the vault exist.** `totalAssets` and `totalSupply` are both **0**. No trades have been made.
- ❌ Any **returns, profit, performance, or "track record"** ("there is no track record"). Nothing has been attested — do not present the attestation rails as a record that exists.
- ❌ **Any number that is not a real on-chain read.** A displayed figure must be a real read, honestly empty, or explicitly labelled **SAMPLE**. Gate every "live" indicator on a successful read. Never rebrand sample data as mainnet data.
- ❌ That the contracts are **verified on the block explorer** (they are not yet).
- ❌ That Aelix has a **Chainlink sequencer uptime feed** or an equivalent to one. Robinhood Chain has none; Aelix substitutes a chain-liveness quorum built from 24/7 crypto feeds, **coarse by design** — it catches multi-hour outages, not minute-scale ones. Describe it as a substitute with that limitation.
- ❌ That the mainnet deploy makes the desk **autonomous**, or that it connects **real customer money / the Robinhood Agentic account** to the vault. It does neither.
- ❌ That deploying resolved **regulatory or securities questions** — no legal review has been completed. Stock Tokens are **not for US persons**; Stock Tokens ≠ share ownership.
- ❌ "Guaranteed", "safe", "risk-free", "can't lose", or that guardrails guarantee outcomes (they're *configurable defaults*). Enforcement is real; a good outcome is not promised.
- ❌ A **$AELIX token sale, price, or investment** (token remains unlaunched and speculative).
- ❌ Affiliation/endorsement by **Robinhood or Anthropic**.
- ❌ Financial advice or "trade this."

**When relevant, include a caveat:** `mainnet · unaudited · deposits capped` · `no track record` · `beta · not investment advice` · `not affiliated with Robinhood`.

> Retired: `testnet preview · not live` and `mocked periphery`. Both are now **false** — replace them with the strings above. Replacing a stale caveat is required; **deleting** one is not.

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

The `⛓ testnet` marker is retired — it is now false. Use `⛓ mainnet · unaudited`. Never drop the `unaudited` half to buy characters; cut words elsewhere. Do not put "attested track record" in a bio — nothing is attested yet.

1. `An AI trading desk that never trades without your yes. Research runs 24/7; guardrails are enforced on-chain, not promised. ⛓ mainnet · unaudited` *(144)*
2. `The desk proposes, you dispose. AI analysts + a Risk Manager with veto; guardrails enforced on-chain, not promised. Never trades without your yes. Unaudited.` *(157)*
3. `Guardrails compiled on-chain — enforced, not promised. An AI trading desk that researches around the clock and waits for your yes. ⛓ mainnet · unaudited` *(152)*
4. `Autonomy without losing control. A desk of AI analysts researches your watchlist 24/7 — never trades without your yes. On-chain guardrails · mainnet · unaudited` *(160)*

### Post templates

**Launch / positioning (pin-worthy):**
> Meet Aelix — an AI trading desk that never trades without your yes.
>
> A team of AI analysts reads your watchlist around the clock. A Risk Manager holds veto. Your limits are enforced in code — not promised.
>
> Autonomy without losing control.
>
> Mainnet · unaudited · deposits capped · not investment advice 👇

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
> Aelix's rulebook is now compiled on-chain, on Robinhood Chain mainnet: an ERC-4626 vault that reverts any trade breaking your caps, plus append-only attestation so performance can't be inflated later.
>
> Enforced, not promised. Unaudited · deposits capped at 10,000 USDG · no depositors yet · no track record.

**Deploy announcement (use once, keep it flat):**
> The Aelix on-chain module is deployed to Robinhood Chain mainnet, chainId 4663.
>
> Real USDG. Real Uniswap router. Five real stock tokens on live Chainlink feeds. No mocks in the path.
>
> What it is not: audited. Deposits are capped at 10,000 USDG, the vault is empty, and there is no track record.

**Handover / ownership (only phrasing that is accurate today):**
> Guardrail config and the swap adapter are owned by a 2-of-3 Safe.
>
> The vault, oracle adapter and session-key executor are mid-handover — Ownable2Step, Safe already set as pendingOwner, acceptOwnership still to be called. Until it lands, one hot key holds those three. Saying it out loud is the point.

---

## 14. Open naming / cleanup issues (fix before scaling marketing)

- ✅ **DONE — Token ticker renamed** `vVLRA`→`vAELIX` and `$VLRA`→`$AELIX` across onchain deploy scripts + tests, `data.ts`, `faq.ts`, `disclaimer.ts`, `token.tsx`, `design.md`. Landing typechecks, onchain compiles. The mainnet vault reports **`vAELIX`** — the old `vVLRA` note is resolved. (`broadcast/*.json` are generated artifacts, left untouched.)
- ✅ **DONE — Internal codenames removed** ("Halon" / "Robin Droids" scrubbed from `brand.ts`). "vvvhound" in `page.tsx` / `diorama.tsx` left as-is (third-party design-technique name, not brand).
- ✅ **DONE — Domain renamed** `projectvex.ai` → **`aelix.xyz`** across `site.ts` `SITE_URL`, `opengraph-image.tsx`, and all README links (now `https://www.aelix.xyz`). Register the domain + point DNS/deploy at it, and set `NEXT_PUBLIC_SITE_URL` in prod if the host differs. (`GITHUB_URL` already `github.com/aelixagent/aelix`.)
- **Stale "testnet / not live" wording across the site and docs:** now factually wrong post-deploy. Sweep `architecture.ts`, `faq.ts`, `disclaimer.ts`, `data.ts`, README(s) and any UI marquee/badge for "testnet", "not live", "mocked periphery", "functional preview" and replace with `mainnet · unaudited · deposits capped`. Replace, don't delete.
- **Ownership handover:** Safe must call `acceptOwnership()` on `RWAVault`, `ChainlinkOracleAdapter`, `SessionKeyExecutor`. Until then no content may imply full multisig control. Update §9 and §12 the moment it lands.
- **Explorer verification:** contracts not yet verified on the Robinhood Chain explorer. Until they are, "verifiable" must mean *the mechanism is verifiable by design*, not "go read the verified source."
- **Third-party audit:** not commissioned. This gates the largest single class of claims — keep it at the top of every on-chain post's caveat line.
