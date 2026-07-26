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
- `FEED_STALENESS < 3600s` (below the live feeds' own 24h heartbeat), inverted staleness
  bounds, `FEED_STALENESS_OFFHOURS < 3d` (breaks NAV every weekend) or `> 7d` (an
  open-ended licence to transact on a dead feed).

- [~] **`OWNER`** — Safe multisig (2-of-3) **live on chain 4663 and owning the whole stack**:
      `0x47b5e2923216f203b7960d8D232215534AF02FF2`. It is the only party that may change caps.
      Never an EOA. Handover settled 2026-07-26 — see C6 for the verification.
      Still outstanding: the **timelock (24–48h)** in front of the Safe. Today a 2-of-3 quorum
      can change a cap effective immediately — no delay, no window to observe and react before
      it lands. Harmless while the vault is empty; required before it is not.
- [x] **Network access to Robinhood Chain.** Was blocked at ISP level (every
      `*.robinhood.com` host resolved to `trustpositif.moratelindo.io`). Resolved via VPN;
      `eth_chainId` on the mainnet RPC now returns `0x1237` (4663). Note the deploy machine
      needs the same access, or `--broadcast` will fail to connect.
- [x] **`SEQUENCER_FEED`** — **no longer a blocker.** Replaced by a 24/7 crypto-feed
      liveness quorum (see `ChainlinkOracleAdapter.livenessRefs` and MAINNET_ADDRESSES.md).
      The gate now requires `SEQUENCER_FEED` **or** >= 2 liveness refs, and refuses neither.
      Original finding, still accurate and worth chasing with Chainlink: Confirmed absent:
      Chainlink's `feeds-robinhood-mainnet.json` holds 56 feeds and **zero**
      sequencer/uptime entries, and RH Chain is absent from Chainlink's L2-sequencer-feeds
      page. RH docs describe the consume pattern but publish no address. Needs an answer
      from Chainlink (`chainlink_data_feeds@smartcontract.com`) — it cannot be resolved by
      reading the chain. Adapter and gate are both ready (`_checkSequencer`; the gate also
      refuses to deploy while the sequencer reads DOWN).
      ⚠️ Do not substitute an unrelated feed and do not weaken the gate to route around
      it — this check is what stops the vault trading against a frozen price in an outage.
- [x] **`USDG`** — `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. **Verified on-chain:**
      `decimals()` = 6, `symbol()` = `USDG`, `name()` = `Global Dollar`. The gate now pins
      decimals to 6, so the 18-dec look-alike is rejected by construction.
- [~] **`ROUTER`** — `0x89e5db8b5aa49aa85ac63f691524311aeb649eba`. **Verified on-chain:**
      43.8KB code, `factory()` = `0x8bcEaA40…7937f`, and `WETH()` returns exactly the
      documented WETH — a strong cross-check that this is the right router.
      Still outstanding: confirm each intended pair actually has depth. Thin pools defeat
      the slippage band regardless of how correct the router is.
- [x] **`STOCKS` + `FEEDS`** — resolved. 33 Chainlink equity feed proxies and the
      matching Stock Token addresses are recorded in
      [MAINNET_ADDRESSES.md](MAINNET_ADDRESSES.md), read live from chain 4663.
      Tokens verified 18-dec and exposing both `oraclePaused()` and `uiMultiplier()`.
      Two traps found in the process: use the feed **`proxyAddress`** (it differs from
      `contractAddress` on several feeds), and match tokens by **address, not symbol** —
      the chain hosts unaffiliated tokens with confusable tickers/names.
      Still a judgement call: start narrow with the deepest names.
- [x] **`FEED_STALENESS`** — recalibrated against live feeds. All 33 equity feeds are
      8-dec, heartbeat **86400s**, deviation 0.5%. The old 3600s default sat *below* the
      feed's own heartbeat guarantee. Now 14400s (execution) and 302400s (valuation), with
      the gate enforcing `>= 3600s` and `3d <= offhours <= 7d`.

## B. Keys and gas

- [~] **Deployer** — hardware wallet or `cast wallet` keystore. Never a plaintext
      `PRIVATE_KEY` in `.env` for mainnet. Single-use; hands ownership to the multisig
      immediately after deploy.
      The **handover half is done**: `0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51` holds no
      owner role anywhere in the stack and reverts `OwnableUnauthorizedAccount` on every
      owner-only call (verified 2026-07-26, see C6). The **custody posture** is the part still
      open — move the key to hardware/keystore before it signs anything on mainnet again.
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
- [x] **C3 — Total-Return multiplier.** Docs say the feed already reports Total Return
      Value (equity price combined with the token's ERC-8056 `uiMultiplier()`), so a
      whole-token price times a raw balance is correct and applying the multiplier again
      would double-count. **But that is unverifiable today**: every live token reads
      `uiMultiplier() == 1e18` (neutral, checked on mainnet), so the first real split is the
      first time the assumption is exercised — on real funds, untestable beforehand.
      Rather than guess, the multiplier is now **pinned at `setFeed` and re-checked on every
      read**: the moment it moves, both price paths fail closed until the owner verifies how
      the feed actually responded and re-pins via `ackMultiplier(token, expected)`. The ack
      takes the expected value explicitly so a second action landing mid-inspection cannot
      be waved through. `redeemInKind` (oracle-free, pro-rata) keeps exits open throughout.

  > Tests: **190 passing** (was 159). New coverage — held-close-session prices value but
  > cannot trade, dead feed fails both paths, issuer pause fails closed and recovers, token
  > without `oraclePaused()`/`uiMultiplier()` still prices, multiplier move halts until
  > acked, ack rejects an unexpected value and is owner-only, staleness validation, a
  > vault-level test that deposits/withdrawals survive a closed session while buys revert,
  > and 30 gate tests.
  > **Still unaudited.** Two new trust surfaces to put in front of auditors:
  > `offHoursStaleness` is the window in which the vault mints and redeems against a held
  > price, and the multiplier pin converts an unresolved pricing ambiguity into a halt
  > rather than resolving it.
- [x] **C6 — Deploy-ownership ordering (found by preflight audit).** `_deploy` constructed
      every contract owned by the multisig, then `_wire` called `onlyOwner` functions as the
      DEPLOYER — so all wiring reverted *after* eight contract deployments had been paid for.
      A real mainnet run would have burned the gas and left an unusable, half-configured
      stack. Fixed: vault/oracle/executor are born deployer-owned, wired, then handed over via
      `Ownable2Step`; GuardrailConfig and the swap adapter are born multisig-owned and never
      pass through the hot key. Pinned by `test/DeployHandover.t.sol` (6 tests).
      **Handover completed on mainnet 2026-07-26.** The Safe accepted all three in one batch
      (tx `0x1ee7a73e7c3df216579554cd3d5993dfeee6be2bd081a68f59700efbd5968cea`). Verified by
      direct `eth_call` after execution — `RWAVault` `0x0e500E39…c5047`,
      `ChainlinkOracleAdapter` `0xF6cFcA20…2699A`, `SessionKeyExecutor` `0xC1C00ED3…06AF7`:
      `owner()` == the Safe and `pendingOwner()` == `0x0` on all three, so the handover is
      fully settled rather than half-done. Negative control: the deployer EOA reverts
      `OwnableUnauthorizedAccount` (`0x118cdaa7`) on `allowToken`, `setDepositCap` and
      `setFeedFrozen`, while the same calls from the Safe succeed.
      Note this is a **key-custody** result, not a code-assurance one — D's audit item is
      untouched by it.
- [ ] **C4 — Purge mocks.** Assert nothing under `src/mocks/` is reachable from the
      mainnet deploy path.
- [x] **C5 — Initial deposit cap.** *This checklist item previously described a control that
      did not exist* — `RWAVault` had no cap mechanism at all, so "set a small TVL cap" was
      not actionable. Now implemented: `RWAVault.depositCap` + `setDepositCap` (owner-only),
      enforced through `maxDeposit`/`maxMint`, which ERC-4626's own `deposit`/`mint` check,
      so there is no bypass. Applied during `_wire` (default 10,000 USDG) rather than left as
      a manual follow-up, and mainnet **refuses `DEPOSIT_CAP=0`**. Lowering the cap below
      current NAV stops new money without trapping existing depositors.

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

1. **B** — the multisig is stood up and owns the stack (done); what remains is the timelock in
   front of it and the deployer/agent/keeper custody posture.
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
