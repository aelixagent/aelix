# AELIX — Project Brief & X Content Playbook

> **Read this before writing any X/Twitter (or other marketing) content.**
> It is the single source of truth for what Aelix *is*, what you may claim, and what you must **never** claim.
> Last synced from the repo: **2026-07-26** (on-chain module deployed to Robinhood Chain mainnet; ownership handover to the 2-of-3 Safe completed and verified the same day; addresses and state verified by direct on-chain reads). Same day: narrative rebuilt around **least-privilege + the refusal rate** after a five-lens adversarial stress test — this version supersedes both the old "runs inside Claude Code" lead and the rejected "mandate / delegated authority" framing. If code/docs change, re-verify.

---

## 0. How to use this doc

1. Skim **§1–§3** for the pitch, **§11** for voice, **§12** for the hard limits.
2. Pull ready-made copy from the **§13 X Content Playbook** (taglines, bios, post templates).
3. Before posting, run the **§12 compliance checklist** — Aelix is real-money-adjacent, desk access is gated, and the on-chain module is **live on mainnet but unaudited**, so overclaiming is the #1 risk.

---

## 1. What Aelix is (the category line + core pitch)

**The category line (approved, ≤20 words — use verbatim):**

> **Least-privilege AI trading: on Robinhood you approve every order; on-chain the agent holds a scoped, revocable, expiring key.**

This is the *one* approved line in which "Robinhood" may lead (§12 otherwise bans it from headlines/taglines). When the line appears publicly, keep the no-affiliation caveat in the same block.

**The core pitch (89 words — adapt tone per surface, keep every fact):**

> Aelix is an AI research desk in Claude Code. On your Robinhood account it never places an order without your yes; that isn't changing. On Robinhood Chain the caps are compiled into a vault that reverts any order breaching them, and the agent's key is separately scoped by expiry, size, budget, trade count and ticker — a rejected order spends none of that budget. Mainnet, unaudited, no timelock on owner caps, deposits capped at 10,000 USDG, no depositors, trades, or track record; request access; not advice; unaffiliated with Robinhood.

- Brand is **Aelix** (established 2026-07-21). Wordmark styled `◤ AELIX ◢`; mark is the chartreuse **"AX" monogram** (`/aelix-mark.png`).
- Not a bot that auto-trades. Positioned as the deliberate opposite of "trust the agent with capital": least privilege on both surfaces, and the flagship metric is how often the vault says **no** (§3).
- This narrative **replaces** the old "runs inside Claude Code" lead and the rejected "mandate / delegated authority" framing — those words are now banned (§12).

---

## 2. The problem it solves

- Retail traders rarely get a **structured second opinion**. Aelix gives you five (PM + 3 analysts + Risk Manager).
- The industry's pitch is **"trust the agent with capital"**: bots that auto-execute on a hunch, are a single black box, have no independent risk check, act on online hype, and can reach the whole balance.
- In most AI agents, **safety is aspirational** (vibes/prompts). Aelix inverts the pitch with **least privilege, enforced structurally**: on the brokerage side the agent physically lacks the tools to trade without you; on-chain its key is scoped, revocable and expiring, and the vault reverts any order that breaches the published caps.

### Two surfaces, one rule (how the halves relate — never blur them)

- **Headline surface: the brokerage desk.** Human approves every order. **Unchanged, not changing.** A stranger can verify it on their own laptop: `.claude/agents/*.md` frontmatter shows the analysts hold no order tools; the `deny → ask → allow` permission gate; kill switch = `claude mcp remove robinhood-trading`.
- **Surface two: the on-chain vault** — explicitly labeled, **operator-funded**. Framing sentence (use it): **"the desk is how we develop the rulebook; the vault is how that rulebook becomes code."**
- State the geographic split as a **chosen constraint**: desk = US equities through gated access; Stock Tokens = not for US persons, price-tracking, not shares. **Two doors, one brand — not a funnel.**
- **Discipline:** the words "autonomous" and "your money" never appear in the same sentence. Per-order approval is stated as **unchanged** — the safety story must never look like it moved.

---

## 3. Core innovation (the real differentiators)

1. **The flagship — "The first number we publish will be how often the vault said no."** Lead with the refusal rate; it is the niche, and it is uncopyable:
   - `previewTrade()` on `RWAVault` returns the **exact rule** an order would break **before anyone signs**.
   - A refused order consumes **none** of the session budget — `SessionKeyExecutor` rolls back its budget reservations when the vault reverts.
   - `DeskRegistry` is **append-only**, so refusals and vetoes go on the record and cannot be pruned.
   - A competitor selling "trust the agent with capital / it's already moving" cannot lead with a refusal rate without arguing against itself.
   - Refusals are the **only metric honestly accumulable at TVL 0** — sell the mechanism, never a result.
2. **Least-privilege, enforced structurally — not aspirationally.** Analysts *physically* hold no order tools (enforced in `.claude/agents/*.md` frontmatter). Only the PM can reach `place_equity_order`, behind an `ask` permission gate **and** your in-session "yes." On-chain, the agent's key is a **scoped session**: expiry, per-trade and cumulative spend budget, trade count, ticker allowlist, buy/sell perms — revocable at any time.
3. **Guardrails-as-code the agent can't weaken.** Rules live in `CLAUDE.md` + `.claude/settings.json`; the agent refuses to edit its own contract. On **Robinhood Chain mainnet (chainId 4663)** the same caps are compiled into the vault, which reverts any order breaching them. The agent's limits are **published on-chain before it trades — read them, and watch every order against them.** (Caveat that must ride along wherever owner powers come up: **no timelock yet** — the Safe can change caps/oracle/manager in one tx; §12.)
4. **Claude-Code-native, no backend.** The PM *is* the main Claude Code session — no Python server, no LangGraph/LangChain, no database, no Docker. Sub-agents are Markdown files; state is one JSON snapshot + append-only JSONL logs.
5. **Prompt-injection containment as first-class design.** All fetched/external content is untrusted *data*, never instructions; the web-facing analyst quotes instruction-like text under an `INJECTION ATTEMPTS` line and surfaces it in `injectionAlerts[]`.
6. **Track record that can't be inflated — mechanism live, record still empty.** The attestation contracts (`DeskRegistry` + `PerfScore`) are deployed on mainnet: desk runs can be attested append-only and timestamped, and performance math is computed *from the attested data*, so it can't be cherry-picked after the fact. Nothing has been attested yet — **there is no track record**. Sell the mechanism, never a result.
7. **No fees anywhere in the contracts.** No management fee, no performance fee, no carry. The exit fee accrues to **remaining holders, not the operator** — a real differentiator; use it.

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
- **On-chain layer (live on Robinhood Chain mainnet · unaudited · deposits capped · no depositors yet):** guardrails-as-code library, ERC-4626 RWA vault (`vAELIX`), Chainlink oracle adapter, Uniswap V2 swap adapter, on-chain attestations, scoped session-key executor, **recurring buy** (scheduled contribution) via the `AelixAutosave` contract — copy never calls the action "saving" (§12). Real periphery, no mocks in the mainnet path. Separate from the equities desk's trading path — the deploy does **not** make the desk autonomous.

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

## 9. On-chain module (LIVE ON MAINNET — UNAUDITED · SAFE-OWNED · NO DEPOSITORS)

**"The desk is how we develop the rulebook; the vault is how that rulebook becomes code."** Surface two of the two-surfaces story (§2): an explicitly labeled, **operator-funded**, non-custodial vault for tokenized real-world assets where the desk's risk rules are **enforced by the contract** on every order, the agent's key is a scoped session (expiry, spend budget, trade count, allowlist, revocation), and every run — including refusals and vetoes — can leave a tamper-proof record. (Never describe the vault as "AI-managed" — "managed" is banned vocabulary, §12.)

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

- **Ownership — settled 2026-07-26, verified on-chain.** Every owner-controlled contract in the stack is owned by the **2-of-3 Safe** (`0x47b5…2FF2`). `GuardrailConfig` and `UniswapSwapAdapter` were Safe-owned from construction and never passed through the deploy key. `RWAVault`, `ChainlinkOracleAdapter` and `SessionKeyExecutor` were born deployer-owned so `_wire` could configure them, then handed over with `Ownable2Step`; the Safe accepted all three in one batch (tx `0x1ee7a73e7c3df216579554cd3d5993dfeee6be2bd081a68f59700efbd5968cea`). Confirmed by direct `eth_call`: `owner()` == the Safe and `pendingOwner()` == `0x0` on all three, so the handover is fully settled, not half-done. Negative control also checked: the deployer EOA (`0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51`) now reverts `OwnableUnauthorizedAccount` on `allowToken`, `setDepositCap` and `setFeedFrozen` while the same calls from the Safe succeed — the deploy key has **no residual authority**. Changing any risk cap, feed, deposit cap or session grant takes 2 of 3 signatures; **no single hot key can weaken the guardrails.** But there is **no timelock yet**: the Safe can change caps, oracle or manager in a single transaction, with no delay — saying "no timelock yet" out loud is **required** wherever owner powers are described (§12). This is a key-custody property, not a code-quality one — it does nothing about the audit gap below.
- **`RWAVault`** — OpenZeppelin **ERC-4626** vault ("Aelix RWA Vault", share symbol **`vAELIX`**, **12 decimals** = 6 USDG + 6 offset). Asset = USDG; NAV = USDG cash + oracle-priced allowlisted Stock Tokens. **Always redeemable in kind — a pro-rata slice of cash and tokens, minus the exit fee; cash-only redemption is limited to the vault's USDG on hand** (this is the only permitted phrasing; "always-solvent exit" unqualified is banned, §12). `previewTrade()` returns the **exact rule** an order would break before anyone signs. **Deposit cap live at 10,000 USDG** (an owner-changeable setting, not structural — say so). Current state: `totalAssets` 0, `totalSupply` 0, not paused, 5 tokens allowlisted.
- **`Guardrails`** (pure lib) — the `CLAUDE.md` rulebook as deterministic `evaluate()`. Called on **every** `executeTrade`; reverts `GuardrailViolation`. Buys (risk-increasing) gated; risk-reducing sells always allowed. Per-trade/concentration/positions/daily-orders/stop/daily-loss/cash-buffer/no-averaging all enforced; execution-slippage bounded; **fails closed** (zero cap reverts).
- **Stop-loss depth — repo vs live vault (precision required).** `stopLossBps` is now genuinely enforced in the **repo** code: a buy's stop must sit within `stopLossBps` of price, so a $0.01 "stop" no longer passes (regression test added). **The live mainnet vault predates this fix.** The only accurate live-vault claim: *the live vault requires a stop below entry on every buy; the stop-depth cap is enforced in the current code and ships with the next deploy.* Never publish "−8% stop enforced" as a live-vault claim (§12).
- **`GuardrailConfig`** — agent read-only, can't widen caps. Two-step ownership, **owned by the Safe from construction** — it never passed through the deploy key at all.
- **`SessionKeyExecutor`** — scoped, revocable, expiring agent sessions (notional caps, cumulative spend budget, trade count, token allowlist, buy/sell perms). Budget is reserved before the vault call and **rolls back when the vault reverts — a rejected order spends none of the session budget.** ERC-4337-style *intent* but a plain scoped EOA — **not** a real 4337 account (roadmap). Vocabulary: "scoped session", "spend budget", "expiry", "allowlist", "revocation" — never "mandate" / "delegated authority" (§12).
- **`DeskRegistry` + `PerfScore`** — append-only attestation rails (epoch, timestamp, NAV, realized PnL, snapshot hash, uri) + on-chain performance math (return, max drawdown, vol, Sharpe-like) derived only from attested data. Append-only means **refusals and vetoes go on the record and cannot be pruned** — the substrate for the refusal-rate flagship (§3). **Nothing attested yet — no track record.**
- **`AelixAutosave`** — non-custodial **recurring buy** (scheduled contribution) into the vault via permissionless keeper. The contract name stays (it is deployed), but copy never calls the action "saving" (§12).
- **Real periphery (verified on-chain, not copied from docs):**
  - **USDG** `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` — `decimals()` == **6**, symbol `USDG`, name "Global Dollar". The 6-dec original, **not** the 18-dec look-alike.
  - **Uniswap V2 Router02** `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` — its `WETH()` returns the documented WETH, cross-confirming identity.
  - **Five real Robinhood Stock Tokens**, each with its own Chainlink feed proxy: **NVDA, AAPL, TSLA, GOOGL, SPY**. All 18-dec, all expose `oraclePaused()` and ERC-8056 `uiMultiplier()`. All equity feeds are 8-dec, 86400s heartbeat, 0.5% deviation. Oracle returns live prices (NVDA read $206.37 at deploy time).
- **215 tests passing** (includes the new stop-depth regression test).
- **Fees:** none anywhere in the contracts — no management fee, no performance fee, no carry. The exit fee accrues to **remaining holders, not the operator**.
- **Vault UI:** no longer requests unlimited token approvals — **exact-amount allowances** only. Deposit CTA copy no longer claims "you approve every move" on-chain (that second-person claim is banned, §12).

### Caveats that survive the mainnet deploy — never drop these

1. **No third-party audit.** Two internal audit passes plus a 42-agent preflight audit are **not an audit**. This is the single most important caveat. Unaudited contracts carry total-loss risk; the 10,000 USDG cap **bounds** exposure by design, it does not remove it.
2. **No track record, no returns, no performance.** TVL is 0, no depositors, no trades.
3. **Contracts are not yet verified on the block explorer.**
4. **No Chainlink sequencer uptime feed exists on Robinhood Chain** (56 feeds in the directory, zero uptime entries). Aelix substitutes a chain-liveness quorum built from 24/7 crypto feeds. It is **coarse by design**: it catches multi-hour outages, not minute-scale ones. Describe it as a substitute with that limitation — never as equivalent.
5. **US-person / securities review still stands.** Deploying a contract does not resolve regulatory exposure, and no legal review has been completed. Stock Tokens are **not for US persons** (build targets non-US); Stock Tokens ≠ share ownership.
6. **The desk is unchanged.** The mainnet deploy does not make the equities desk autonomous and does not connect real customer money or the Robinhood Agentic account to the vault. Every order still requires explicit human approval.
7. **No timelock on owner powers.** The 2-of-3 Safe can change caps, oracle or manager in one transaction, with no delay. "No timelock yet" must be said out loud wherever owner powers are described.
8. **The live vault predates the stop-depth fix.** It requires a stop below entry on every buy; the stop-*depth* cap (`stopLossBps`) is enforced in the current repo code and ships with the next deploy. Any live-vault cap table listing stop-loss carries this footnote.

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
- Marquee: HUMAN-IN-THE-LOOP · NO ORDER WITHOUT YOUR APPROVAL · 4 SPECIALIST AGENTS · RISK VETO ARMED · GUARDRAILS AS CODE · ON-CHAIN VAULT · LIVE ON ROBINHOOD CHAIN MAINNET · UNAUDITED · DEPOSITS CAPPED · NO TRACK RECORD · REQUEST ACCESS · NOT INVESTMENT ADVICE
  - Note: drop "VERIFIABLE TRACK RECORD" from the marquee — the rails exist, the record doesn't. Use "VERIFIABLE BY DESIGN" or "ATTESTED ON-CHAIN" if a slot needs filling.
- Stats: "4 Specialist AI agents" · "100% Orders you approve first" · "1 Risk manager with veto"

---

## 11. Status & disclaimers (bake these into content)

- **Not investment advice.** Research tool / reference architecture. **No track record, no performance claims** — any example figure must be explicitly labelled **SAMPLE**, never passed off as live.
- **Real money · request access.** The desk is **US, equities only, long-only, USD**. Options/crypto/futures unsupported (option tools hard-denied).
- **On-chain module: live on mainnet, unaudited, empty.** Deployed to Robinhood Chain mainnet (4663) with real periphery; the whole stack is owned by the 2-of-3 Safe (handover completed and verified 2026-07-26), but there is still **no third-party audit**, **no timelock on owner powers** (the Safe can change caps/oracle/manager in one tx), contracts are unverified on the explorer, deposits are capped at 10,000 USDG (owner-changeable setting, not structural), and **TVL 0 / no depositors / no trades**. Multisig ownership is key custody, not code assurance — it does not close the audit gap. Still gated behind legal/securities review. "There is no track record."
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
- The vault is a real **ERC-4626** (`vAELIX`), **deposit cap live at 10,000 USDG** (owner-changeable setting, not structural — say so), 5 tokens allowlisted, not paused. **215 tests passing.**
- **The refusal mechanics (the flagship — §3):** `previewTrade()` returns the exact rule an order would break before anyone signs; a rejected order spends **none** of the session budget (`SessionKeyExecutor` rolls back its reservations on revert); `DeskRegistry` is append-only, so refusals and vetoes cannot be pruned. You may say: **"the first number we publish will be how often the vault said no."** Mechanism only — no refusal *rate* exists yet, because nothing has traded.
- The agent's on-chain key is a **scoped session**: expiry, per-trade and cumulative spend budget, trade count, ticker allowlist, buy/sell perms, revocable. Say it in exactly that vocabulary (see the banned-words list below).
- **The agent's limits are published on-chain before it trades — read them, and watch every order against them.** (This is the permitted replacement for any second-person "you write / you bound it / your limits" claim.)
- **No fees anywhere in the contracts** — no management fee, no performance fee, no carry; the exit fee accrues to remaining holders, not the operator.
- **Always redeemable in kind — a pro-rata slice of cash and tokens, minus the exit fee; cash-only redemption is limited to the vault's USDG on hand.** (Only in this qualified form.)
- The vault UI requests **exact-amount token allowances** — no unlimited approvals.
- **Stop-loss, precisely:** the live vault requires a stop below entry on every buy; the stop-*depth* cap is enforced in the current repo code and ships with the next deploy. (Never "−8% stop enforced" about the live vault — see below.)
- Attestation rails (`DeskRegistry` + `PerfScore`) are deployed: performance math is computed only from attested data, so it **can't be inflated after the fact**. Claim the *mechanism*, never a result.
- **Every owner-controlled contract in the stack is owned by a 2-of-3 Safe multisig** — the blanket claim is now permitted, verified on-chain 2026-07-26. You may say: changing any risk cap, feed, deposit cap or session grant requires 2 of 3 signatures, and **no single hot key can weaken the guardrails**. `owner()` == the Safe and `pendingOwner()` == `0x0` on `RWAVault`, `ChainlinkOracleAdapter` and `SessionKeyExecutor`; `GuardrailConfig` and `UniswapSwapAdapter` were Safe-owned from construction; the deployer EOA now reverts `OwnableUnauthorizedAccount` on owner-only calls. Say it as a **key-custody** property — it says nothing about code quality, it does **not** soften the audit prohibition below, and wherever you describe these owner powers you **must** also say "**no timelock yet**."
- Prompt-injection contained; open-source (MIT); runs in Claude Code, no backend.
- Equities, Robinhood Agentic access. Any integration statement stays factual and carries the no-affiliation line in the same block.

**You must NOT claim / imply:**
- ❌ **That the module is audited, security-reviewed, or "reviewed by auditors."** There has been **no third-party audit**. Two internal audit passes plus a 42-agent preflight audit are **not an audit** — never let "hardened", "audit-passed", "battle-tested" or similar imply one. *This is the single most important prohibition in this doc and must survive every rewrite.*
- ❌ **That multisig ownership implies the code is safe, reviewed, or audited.** The handover is complete and may be stated plainly (see the MAY list), but it is a **key-custody** fact only: it stops a single key from widening the caps, it does not make an unaudited contract sound. Never let "Safe-owned", "multisig-controlled" or "no single key" stand in for a security review.
- ❌ **That depositors, TVL, AUM, users, inflows, or any capital in the vault exist.** `totalAssets` and `totalSupply` are both **0**. No trades have been made.
- ❌ Any **returns, profit, performance, or "track record"** ("there is no track record"). Nothing has been attested — do not present the attestation rails as a record that exists.
- ❌ **Any number that is not a real on-chain read.** A displayed figure must be a real read, honestly empty, or explicitly labelled **SAMPLE**. Gate every "live" indicator on a successful read. Never rebrand sample data as mainnet data.
- ❌ That the contracts are **verified on the block explorer** (they are not yet).
- ❌ That Aelix has a **Chainlink sequencer uptime feed** or an equivalent to one. Robinhood Chain has none; Aelix substitutes a chain-liveness quorum built from 24/7 crypto feeds, **coarse by design** — it catches multi-hour outages, not minute-scale ones. Describe it as a substitute with that limitation.
- ❌ That the mainnet deploy makes the desk **autonomous**, or that it connects **real customer money / the Robinhood Agentic account** to the vault. It does neither.
- ❌ That deploying resolved **regulatory or securities questions** — no legal review has been completed. Stock Tokens are **not for US persons**; Stock Tokens ≠ share ownership.
- ❌ **"guaranteed", "safe", "secure", "risk-free", "hardened", "battle-tested", "audit-passed", "can't lose"**, or that guardrails guarantee outcomes (they're *configurable defaults*). Enforcement is real; a good outcome is not promised.
- ❌ **"mandate", "delegated authority", "managed."** This is the statutory vocabulary of licensed portfolio management (MiFID II Annex I A(4)) and no legal review exists. Use instead: **"scoped session", "spend budget", "expiry", "allowlist", "revocation".**
- ❌ **Second person about on-chain limits** — "you write", "you bound it", "your limits", "you approve every move" (on-chain). `grantSession`/`revokeSession`/`setCaps` are `onlyOwner` (the 2-of-3 Safe); it is one pooled book with no per-depositor scope. TRUE version: **"the agent's limits are published on-chain before it trades — read them, and watch every order against them."**
- ❌ **"cryptographic limits", "cannot step outside", "impossible."** No timelock exists; the Safe can change caps/oracle/manager in one tx. TRUE version: **"enforced at the custody layer on every order, changeable only by a 2-of-3 Safe — with no delay yet."** Saying **"no timelock yet"** out loud is REQUIRED wherever owner powers are described.
- ❌ **"Autosave" / "save" / "savings" as product language** — savings words over a 100%-at-risk, unaudited vehicle. Call the feature **"recurring buy" / "scheduled contribution"** in ALL copy. (The contract name `AelixAutosave` stays — it is deployed — but copy never calls the ACTION saving.)
- ❌ **"always-solvent exit" unqualified.** TRUE version: **"always redeemable in kind — a pro-rata slice of cash and tokens, minus the exit fee; cash-only redemption is limited to the vault's USDG on hand."**
- ❌ **Robinhood in a headline or tagline, or adjacent to any safety or performance claim.** Integration statements stay factual and carry the no-affiliation line in the same block. (Sole exception: the approved category line in §1, used verbatim, still with the no-affiliation caveat in the block.)
- ❌ **"autonomous" and "your money" in the same sentence — ever.** Per-order approval is always stated as **unchanged**; the safety story must never look like it moved.
- ❌ **"−8% stop enforced" (or any stop-depth figure) as a live-vault claim.** The live mainnet vault predates the stop-depth fix. If a cap table lists stop-loss for the live vault, footnote it honestly: *stop below entry required on every buy; the depth cap is enforced in the current code and ships with the next deploy.*
- ❌ A **$AELIX token sale, price, or investment** (token remains unlaunched and speculative). Never link the token to the vault.
- ❌ Affiliation/endorsement by **Robinhood or Anthropic**.
- ❌ Financial advice or "trade this."

**When relevant, include a caveat:** `mainnet · unaudited · deposits capped` · `no track record` · `request access · not investment advice` · `not affiliated with Robinhood` · and, wherever owner powers appear, `no timelock yet`.

> Retired: `testnet preview · not live` and `mocked periphery`. Both are now **false** — replace them with the strings above. Replacing a stale caveat is required; **deleting** one is not.

---

## 13. X CONTENT PLAYBOOK

### Voice rules
- Calm, mechanism-first, short lines. Restraint is the flex.
- Lead with the **mechanism** (least privilege, refusal-first, enforced-not-promised), not hype.
- One idea per post. Concrete > clever.
- "autonomous" and "your money" never share a sentence. Per-order approval is always **unchanged**.
- Never blur the two surfaces (§2): the desk is the headline; the vault is explicitly labeled, operator-funded. Two doors, one brand — not a funnel.

### Positioning vs competitors (e.g. VEX)
VEX's bio "the agent you can trust with capital" and teaser "it's already moving" sell **generic trust + autonomous momentum**. **Do the opposite** — and lead with the refusal rate: a competitor selling "trust the agent with capital / it's already moving" **cannot lead with how often its system said no without arguing against itself**. Aelix's edge is that it won't move without you (desk) and its refusals are on the record before its returns exist (vault). Never reuse "trust with capital" / "already moving." Sell the *how*.

### Tagline / opener bank
- **The category line (primary — verbatim, §1):** "Least-privilege AI trading: on Robinhood you approve every order; on-chain the agent holds a scoped, revocable, expiring key." *(Sole approved appearance of "Robinhood" in a lead line; keep the no-affiliation line in the block.)*
- **The flagship line (use it prominently):** "The first number we publish will be how often the vault said no."
- Header/banner tagline: **"Least-privilege AI trading"**. *(Retired: "Autonomy without losing control" — off-narrative; autonomy is not the sell.)*
- Openers: "a rejected order spends nothing", "refusals go on the record", "the agent's key expires", "it waits for your yes", "an edge you can verify."
- Site lines: "Reads the tape. Weighs the risk. Waits for you." · "Signals, Not Noise" · "The desk proposes; you dispose."
- Two-surfaces line (verbatim, §2): "the desk is how we develop the rulebook; the vault is how that rulebook becomes code."

### Bio bank (≤160 chars; put link in Website field)

Use `⛓ mainnet · unaudited` or a bare `Unaudited.` — never drop the `unaudited` half to buy characters; cut words elsewhere. Do not put "attested track record" in a bio — nothing is attested yet. No "Robinhood" in bios (§12); the category line's brokerage half becomes "you approve every order."

1. `Least-privilege AI trading. You approve every order; the agent's on-chain key is scoped, revocable, expiring. A refused order spends nothing. Unaudited.` *(152)*
2. `The first number we publish will be how often the vault said no. An AI research desk that waits for your yes. ⛓ mainnet · unaudited` *(131)*
3. `The desk proposes, you dispose. On-chain, the vault reverts any order breaching its caps — a refusal spends none of the agent's budget. ⛓ mainnet · unaudited` *(157)*
4. `An AI research desk that never trades without your yes. On-chain the agent's key expires, its budget is capped, its refusals go on record. Unaudited.` *(149)*

### Post templates

**Launch / positioning (pin-worthy):**
> Least-privilege AI trading.
>
> On Robinhood, Aelix is a research desk that never places an order without your yes — that isn't changing. On Robinhood Chain, the caps are compiled into a vault that reverts any order breaching them, and the agent's key is scoped by expiry, size, budget, trade count and ticker. A rejected order spends none of that budget.
>
> Mainnet · unaudited · no timelock on owner caps · deposits capped · no track record · request access · not advice · not affiliated with Robinhood 👇

**The flagship (refusal rate — use prominently):**
> The first number we publish will be how often the vault said no.
>
> previewTrade() returns the exact rule an order would break — before anyone signs. A refused order spends none of the agent's session budget. And the registry is append-only, so refusals and vetoes go on the record and can't be pruned later.
>
> The count starts at zero, like everything else here. Mainnet · unaudited · no depositors · no track record.

**Differentiator vs bots (least privilege):**
> Most "AI trading" asks you to trust the agent with capital: one black box that can reach the whole balance.
>
> Aelix is least privilege, twice. On the desk, the analysts physically hold no order tools and nothing is placed without your explicit yes. On-chain, the agent's key is scoped — expiry, spend budget, trade count, ticker allowlist — and revocable.
>
> Unaudited · not advice.

**Two surfaces (never blur them):**
> Two doors, one brand.
>
> The desk: US equities through gated access. You approve every order — unchanged.
> The vault: on-chain, operator-funded, Stock Tokens not for US persons.
>
> The desk is how we develop the rulebook; the vault is how that rulebook becomes code.
>
> Mainnet · unaudited · no track record · not investment advice.

**Feature spotlight (Risk Manager):**
> Every trade Aelix proposes hits one last gate: a Risk Manager whose only job is to protect capital.
>
> Per-trade cap, concentration, stop-loss, daily-loss halt — if a rule is unwritten or the math is off, it VETOes. Conservative, configurable guardrails. Not advice.

**Feature spotlight (session key):**
> The agent's on-chain key is not a blank check.
>
> It expires. It has a per-trade cap, a total spend budget, a trade count, a ticker allowlist. The 2-of-3 Safe can revoke it at any time — though there's no timelock yet, so owner caps can change in one tx.
>
> When the vault refuses an order, the budget rolls back. A rejected trade spends nothing.
>
> Mainnet · unaudited.

**Feature spotlight (no fees):**
> There are no fees in the Aelix contracts. No management fee, no performance fee, no carry.
>
> The one fee that exists — the exit fee — accrues to the depositors who stay, not to us.
>
> Mainnet · unaudited · deposits capped · no depositors yet.

**How it works:**
> How Aelix reaches a trade:
> Sense → Screen → 3 analysts research in parallel → PM synthesizes → Risk Manager checks → preview card → ⏸ waits for your yes → executes.
>
> Steps 1–6 place nothing. Silence is not consent.

**On-chain (always caveated):**
> Aelix's rulebook is compiled on-chain: a vault on Robinhood Chain mainnet that reverts any order breaching its caps — and names the exact rule, before anyone signs.
>
> Enforced at the custody layer on every order, changeable only by a 2-of-3 Safe — with no delay yet.
>
> Unaudited · deposits capped at 10,000 USDG · no depositors · no track record · not affiliated with Robinhood.

**Deploy announcement (use once, keep it flat):**
> The Aelix on-chain module is deployed to Robinhood Chain mainnet, chainId 4663.
>
> Real USDG. Real Uniswap router. Five real stock tokens on live Chainlink feeds. No mocks in the path.
>
> What it is not: audited. Deposits are capped at 10,000 USDG, the vault is empty, and there is no track record. Not affiliated with Robinhood.

**Handover / ownership (accurate as of 2026-07-26):**
> The Aelix contracts are now owned by a 2-of-3 Safe. All of them.
>
> The Safe accepted ownership of the vault, oracle adapter and session-key executor in one batch; guardrail config and the swap adapter were Safe-owned from construction. owner() is the Safe, pendingOwner() is zero, and the deploy key reverts on every owner-only call.
>
> Changing a risk cap, a feed or a session grant now takes 2 of 3 signatures. No single hot key can weaken the guardrails. No timelock yet — the Safe can still change caps in one transaction.
>
> Still unaudited. That hasn't changed.

---

## 14. Open naming / cleanup issues (fix before scaling marketing)

- ✅ **DONE — Token ticker renamed** `vVLRA`→`vAELIX` and `$VLRA`→`$AELIX` across onchain deploy scripts + tests, `data.ts`, `faq.ts`, `disclaimer.ts`, `token.tsx`, `design.md`. Landing typechecks, onchain compiles. The mainnet vault reports **`vAELIX`** — the old `vVLRA` note is resolved. (`broadcast/*.json` are generated artifacts, left untouched.)
- ✅ **DONE — Internal codenames removed** ("Halon" / "Robin Droids" scrubbed from `brand.ts`). "vvvhound" in `page.tsx` / `diorama.tsx` left as-is (third-party design-technique name, not brand).
- ✅ **DONE — Domain renamed** `projectvex.ai` → **`aelix.xyz`** across `site.ts` `SITE_URL`, `opengraph-image.tsx`, and all README links (now `https://www.aelix.xyz`). Register the domain + point DNS/deploy at it, and set `NEXT_PUBLIC_SITE_URL` in prod if the host differs. (`GITHUB_URL` already `github.com/aelixagent/aelix`.)
- ✅ **DONE — Ownership handover.** The Safe called `acceptOwnership()` on `RWAVault`, `ChainlinkOracleAdapter` and `SessionKeyExecutor` in one batch (tx `0x1ee7a73e…5968cea`, 2026-07-26). Verified by direct `eth_call`: `owner()` == the Safe and `pendingOwner()` == `0x0` on all three; the deployer EOA reverts `OwnableUnauthorizedAccount` on `allowToken` / `setDepositCap` / `setFeedFrozen`. Content **may** now claim full multisig control of the stack (§9, §12 updated) — as key custody, never as code assurance. Sweep any doc still saying "handover pending" and replace it, same rule as the stale-caveat item below.
- **Stale "testnet / not live" wording across the site and docs:** now factually wrong post-deploy. Sweep `architecture.ts`, `faq.ts`, `disclaimer.ts`, `data.ts`, README(s) and any UI marquee/badge for "testnet", "not live", "mocked periphery", "functional preview" and replace with `mainnet · unaudited · deposits capped`. Replace, don't delete.
- ✅ **DONE — Vault UI token approvals:** the UI no longer requests unlimited token approvals; allowances are exact-amount.
- ✅ **DONE — Deposit CTA copy:** no longer claims "you approve every move" on-chain (second-person on-chain claims are banned, §12).
- **Live vault predates the stop-depth fix:** the stop-*depth* cap (`stopLossBps`) is enforced in the current repo code (regression test added; 215 tests) but ships with the **next deploy**. Until then, every live-vault cap table listing stop-loss carries the §12 footnote, and "−8% stop enforced" is never published as a live-vault claim.
- **No timelock:** owner caps/oracle/manager changeable by the Safe in one tx. Adding a timelock is roadmap; until then "no timelock yet" is a required caveat wherever owner powers are described.
- **Explorer verification:** contracts not yet verified on the Robinhood Chain explorer. Until they are, "verifiable" must mean *the mechanism is verifiable by design*, not "go read the verified source."
- **Third-party audit:** not commissioned. This gates the largest single class of claims — keep it at the top of every on-chain post's caveat line.
