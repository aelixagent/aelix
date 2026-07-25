# Mainnet Checklist — Aelix on Robinhood Chain (4663)

Robinhood Chain mainnet went live **2026-07-01** with Chainlink Data Feeds, Data
Streams, and CCIP. Tokenized-equity feeds exist per Stock Token, so the periphery
Aelix needs is no longer hypothetical — the remaining work is ours.

Status legend: `[ ]` todo · `[~]` partially done · `[x]` done

---

## A. Hard blockers — `DeployProduction.s.sol` reverts without these

Enforced in `_assertMainnetSafe`, which now also probes live chain state (does the address
hold code, does the feed answer, is the sequencer up). A mainnet deploy cannot proceed
while any of these is unset or wrong. 28 regression tests cover the gate.

Postures the gate additionally refuses, beyond the five below:

- `OWNER` that is an **EOA** — previously any non-zero address passed a require whose
  message promised a multisig. A Safe/timelock has code; an EOA is now rejected.
- `OWNER` or `AGENT` equal to the **deployer key** (`AGENT` defaults to the deployer,
  which on mainnet would give the desk's hot key deploy authority).
- `AGENT` equal to the owner multisig.
- **USDG whose live `decimals() != 6`** — rejects the documented 18-dec look-alike by
  construction, without ever trusting the symbol.
- Any of USDG / router / hop / Stock Token / feed / sequencer feed pointing at an
  address with **no code** (address typos).
- A **sequencer reporting DOWN**, or an uninitialized sequencer round, or
  `SEQUENCER_GRACE < 1800s`.
- A feed answering `<= 0` or with an uninitialized round.
- **Duplicate Stock Token or duplicate feed** — a repeated feed means one token is priced
  by another's feed, silently mispricing a whole position.
- USDG listed as a Stock Token.
- `FEED_STALENESS < 60s`, inverted staleness bounds, or
  `FEED_STALENESS_OFFHOURS > 7d` (an open-ended licence to transact on a dead feed).

- [ ] **`OWNER`** — Safe multisig (2-of-3 min) + timelock (24–48h) on chain 4663.
      Owns `GuardrailConfig`; the only party that may change caps. Never an EOA.
- [ ] **Network access to Robinhood Chain.** On the current connection every
      `*.robinhood.com` host resolves to `103.123.248.32`
      (`trustpositif.moratelindo.io`) and refuses the connection — an ISP-level DNS
      block, not a project problem. Mainnet RPC and the docs are both unreachable, so
      no on-chain verification can be done from here. Needs a VPN or a resolver such as
      1.1.1.1 / 8.8.8.8 before any address can be confirmed or any deploy broadcast.
- [ ] **`SEQUENCER_FEED`** — Chainlink L2 Sequencer Uptime Feed on RH Chain.
      RH docs reference the pattern (`latestRoundData()`, require status `0` + grace),
      but the **proxy address is not published in the public docs**; it is not on
      Chainlink's general L2-sequencer-feeds page either. Source it from the Chainlink
      feed registry or via `chainlink_data_feeds@smartcontract.com` before deploying.
      Adapter side is already implemented (`_checkSequencer`).
      ⚠️ Do not invent this address. No feed → no mainnet deploy.
- [ ] **`USDG`** — `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6-dec).
      Confirm `decimals()` on-chain; an 18-dec look-alike "Global Dollar" exists.
      Script already reads it live rather than trusting the symbol.
- [ ] **`ROUTER`** — Uniswap V2 Router02 `0x89e5db8b5aa49aa85ac63f691524311aeb649eba`.
      Additionally verify each pair actually has depth; thin pools defeat the slippage band.
- [ ] **`STOCKS` + `FEEDS`** — real Stock Token addresses and their Chainlink feed
      proxies, equal length ([:101](script/DeployProduction.s.sol#L101)).
      Start narrow: 3–5 of the deepest names only.
- [ ] **`FEED_STALENESS`** — must NOT stay at the 3600s default. See item C1.

## B. Keys and gas

- [ ] **Deployer** — hardware wallet or `cast wallet` keystore. Never a plaintext
      `PRIVATE_KEY` in `.env` for mainnet. Single-use; hands ownership to the multisig
      immediately after deploy.
- [ ] **`AGENT`** — desk hot key, granted only via `SessionKeyExecutor`
      (expiring + revocable + scoped). Never a direct vault role.
- [ ] **Keeper** — separate key for `AelixAutosave` DCA triggers.
- [ ] Mainnet ETH for ~7 contract deploys + ongoing keeper gas.
- [ ] Key-rotation + revocation procedure written down and rehearsed once on testnet.

## C. Code gaps that only exist on mainnet

- [x] **C1 — 24/5 feed staleness.** RH tokenized-equity feeds are 24/5 and may hold the
      last published price through a closed session with no heartbeat, so a single flat
      `maxStaleness` reverted every night and weekend. Split into a two-tier bound:
      `sessionStaleness` (strict) gates the trade path via a new
      `IPriceOracle.priceForTrade`, `offHoursStaleness` (default 3.5d) gates the
      valuation path via `price`. NAV, deposits and redemptions stay live over a close;
      the agent cannot execute against a held price. Beyond the wider bound both fail
      closed. `RWAVault._price` — already used only on the trade path — now routes to
      `priceForTrade`, so the split needed no other vault change.
- [x] **C2 — `oraclePaused()` on the Stock Token.** Read live in `_read` via low-level
      staticcall (not `try/catch`, which does not catch an undecodable return), so a
      token without the flag still prices while a clean `true` fails both paths closed.
      The owner `feedFrozen` breaker is retained as a manual backstop.
- [x] **C3 — Total-Return multiplier.** Resolved as a no-op after checking the docs: the
      feed already reports Total Return Value (equity price combined with the multiplier
      read from the token contract), so a split moves price and multiplier together and
      leaves the series continuous. There is no separate multiplier to apply, and NAV,
      stop-loss levels and `PerfScore` all inherit one basis by reading through this
      adapter. Documented in `_read` so nobody "fixes" it by multiplying twice.

  > Tests: 164 passing (was 159). New coverage — held-close-session prices value but
  > cannot trade, dead feed fails both paths, issuer pause fails closed and recovers,
  > token without `oraclePaused()` still prices, staleness-order validation, and a
  > vault-level test that deposits/withdrawals survive a closed session while buys revert.
  > **Still unaudited**, and C1's two-tier bound is a new trust surface: `offHoursStaleness`
  > is the window in which the vault will mint and redeem against a held price.
- [ ] **C4 — Purge mocks.** Assert nothing under `src/mocks/` is reachable from the
      mainnet deploy path.
- [ ] **C5 — Initial deposit cap.** Ship with a small TVL ceiling (e.g. $10k) and
      raise it in steps. Cheapest available mitigation for a bug that survives audit.

## D. Assurance

- [ ] **Third-party audit.** Two internal passes are not an audit. Budget 2–6 weeks.
      Scope must include C1–C3, which are new and unaudited even internally.
- [ ] Contracts verified on the mainnet explorer; addresses committed to `deployments/`.
- [ ] Pause / unpause exercised on mainnet **before** any real deposits.
- [ ] Monitoring + alerting: oracle stale, `oraclePaused` set, sequencer down,
      abnormal guardrail reverts, TVL step changes.
- [ ] Incident runbook: who can pause, by what mechanism, within what time.

## E. Non-technical — do not ship without these

- [ ] **Legal opinion.** A vault that manages tokenized equity and accepts third-party
      funds is in regulated territory. Get this before going public, not after.
      Note the existing US-person caveat.
- [ ] UI disclosure: non-custodial, AI-managed, risk, audit status, deposit cap.
- [ ] Copy updated from "testnet preview" to accurate mainnet claims, consistent with
      `AELIX_PROJECT_BRIEF.md` (README, DEPLOY.md, docs site, landing).

---

## Suggested order

1. **B** — stand up the multisig and keys (no external dependency).
2. **A** — source `SEQUENCER_FEED` + the Stock Token feed proxies from Chainlink.
   This is the only item gated on someone outside the project; start it first.
3. **C** — C1 and C2 are real correctness bugs on mainnet, not polish. Fix with tests.
4. **D** — audit the result, including C1–C3.
5. **E** — in parallel with the audit, since legal has its own lead time.
6. Deploy with C5's cap in place.

Sources: [Robinhood Chain oracles](https://docs.robinhood.com/chain/oracles-and-price-feeds/) ·
[Chainlink Robinhood tokenized equity feeds](https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood) ·
[Chainlink L2 sequencer feeds](https://docs.chain.link/data-feeds/l2-sequencer-feeds) ·
[Stock Tokens](https://docs.robinhood.com/chain/stock-tokens/)
