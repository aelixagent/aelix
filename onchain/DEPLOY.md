# Deploying Aelix to Robinhood Chain

This is the runbook that was **actually used** to deploy the stack to Robinhood Chain
**mainnet (chainId 4663)** on 2026-07-26, plus the steps that are still outstanding.
Live addresses: [`deployments/latest.json`](deployments/latest.json) and the table in
[README.md](README.md). Address provenance: [MAINNET_ADDRESSES.md](MAINNET_ADDRESSES.md).
Go/no-go gates: [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md).

> **The stack is unaudited.** It is deployed with a 10,000 USDG deposit cap for exactly
> that reason, and **the ownership handover is not finished** — see [step 6](#6-finish-the-handover-three-acceptownership-txs).
> Re-confirm every periphery address against <https://docs.robinhood.com/chain> and
> against the chain itself before sending funds. Never trust a symbol.

## Network params

| | Mainnet (used) | Testnet (historical) |
|---|---|---|
| chainId | **4663** (`0x1237`) | 46630 (`0xB626`) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com/rpc` |
| Explorer | confirm in docs — contracts **not yet verified** | `https://explorer.testnet.chain.robinhood.com` |
| Gas token | ETH (18-dec) | ETH; parent = Sepolia |
| Faucet | — (bridge real ETH) | `faucet.testnet.chain.robinhood.com` + `faucets.chain.link/robinhood-testnet` |

Measured cost of the stack: **~12M gas** for the 8 contracts + wiring. `go-mainnet.sh`
reserves 0.008 ETH for the deploy (~2x headroom) and funds five auxiliary wallets —
3 Safe signers, agent, keeper — with ~0.0069 ETH total.

## ⚠️ The USDG decimals trap

Canonical Robinhood Chain **USDG is 6-decimal**
(`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; verified on 4663 —
`decimals()` = 6, `symbol()` = `USDG`, `name()` = `Global Dollar`). A **look-alike
18-decimal** "Global Dollar" exists at a *different* address; mixing them up is a 10¹²
accounting blow-up. `DeployProduction` **reads `decimals()` on-chain and pins it to 6**,
so the impostor is rejected without ever trusting the symbol — but you still must pin
the correct address.

## Verified mainnet addresses used by this deploy

| Component | Address | Verified by |
|---|---|---|
| USDG (`asset()`) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `decimals()` = **6**, `symbol()` = `USDG`, `name()` = `Global Dollar` |
| Uniswap V2 Router02 | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` | `WETH()` cross-confirms the documented WETH; `factory()` present |

`STOCKS` / `FEEDS` — index-aligned, five entries each. Every token is 18-dec and exposes
both `oraclePaused()` and ERC-8056 `uiMultiplier()`; every feed is 8-dec with an 86400s
heartbeat and 0.5% deviation threshold. The oracle returned a live NVDA price of
**$206.37** at deploy time.

| Ticker | Stock Token | Chainlink feed proxy |
|---|---|---|
| NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` |
| AAPL | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` |
| TSLA | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | `0x4A1166a659A55625345e9515b32adECea5547C38` |
| GOOGL | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3` | `0xF6f373a037c30F0e5010d854385cA89185AE638b` |
| SPY | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | `0x319724394D3A0e3669269846abE664Cd621f9f6A` |

Not used by this deploy: Uniswap **SwapRouter02 (v3)**
`0xcaf681a66d020601342297493863e78c959e5cb2` — only relevant if you build a v3 adapter.
The chain also hosts unaffiliated tokens with confusable tickers, so `DeployProduction`
matches by **address** and never by symbol.

> ⚠️ An online snippet claimed the RH "Universal Router" is a modified fork with an
> extra `minHopPriceX36` field. Research flagged this as an unverified address-steering
> claim — **do not** wire addresses or add struct fields on that basis. Use the V2
> Router02 above.

## No sequencer uptime feed exists — what we do instead

Chainlink publishes **no L2 Sequencer Uptime Feed** for Robinhood Chain (56 feeds in the
reference directory, **zero** uptime entries, confirmed 2026-07-25). `SEQUENCER_FEED` is
therefore left **blank**, and the oracle instead requires a **chain-liveness quorum** of
24/7 **crypto** feeds (`LIVENESS_FEEDS`: ETH/USD, USDT/USD, ENA/USD). If the freshest of
them is older than `LIVENESS_BOUND`, the chain is presumed stalled and the vault fails
closed.

This substitute is **coarse by design**: 12h bound means it catches multi-hour outages,
not minute-scale ones. It is **not equivalent** to an uptime feed — do not describe it as
one. Equity feeds are rejected as liveness witnesses by the deploy gate, because they go
24-29h stale every weekend and would halt the vault every Saturday.

---

## Steps (as executed)

### 1. Work around the DNS hijack (only if your resolver is filtered)

On some networks the resolver hijacks `*.robinhood.com` — e.g. Indonesia's TrustPositif
filter points `rpc.mainnet.chain.robinhood.com` at `103.123.248.32`, which refuses the
connection. **Only DNS is tampered with**; the real Cloudflare origins serve the RPC
fine. [`rpc-proxy.py`](rpc-proxy.py) resolves the hostname itself over DNS-over-HTTPS,
pins the result, and still presents the true hostname for SNI, `Host` and certificate
validation — TLS stays fully verified. It also probes `eth_chainId` on startup and exits
unless it reads `0x1237`, so a misroute fails loudly instead of mid-deploy.

```bash
python3 rpc-proxy.py &     # listens on 127.0.0.1:8545, prints the pinned IPs + chainId
export R=http://127.0.0.1:8545          # used by the snippets below
```

On an unfiltered network, skip the proxy and point straight at the RPC:

```bash
export RH_MAINNET_RPC=https://rpc.mainnet.chain.robinhood.com
export R=$RH_MAINNET_RPC
```

`go-mainnet.sh` defaults to `http://127.0.0.1:8545` and honours `RH_MAINNET_RPC` as an
override; it aborts unless `cast chain-id` returns `4663`.

### 2. Fund the deployer

The deployer EOA needs roughly **0.016 ETH** on chain 4663 (~$30) to cover funding the
auxiliary wallets plus the deploy reserve. Bridge first — `go-mainnet.sh` refuses to
start otherwise, and it computes the requirement from what is *still outstanding* (not a
flat total) so a re-run after a partial failure isn't blocked by its own gate.

### 3. Create the 2-of-3 Safe

`go-mainnet.sh` step 2 does this with the canonical **Safe 1.4.1** factory
(`0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`) and singleton
(`0x41675C099F32341bf84BFc5382aF534df5C7461a`), both verified present on 4663. Two
details matter:

- The Safe address is derived **arithmetically** from the CREATE2 inputs
  (`salt = keccak(keccak(initializer) ++ saltNonce)`), *not* by simulating
  `createProxyWithNonce`. Simulation works exactly once: the factory ends in
  `require(proxy != 0)`, so once the proxy exists the simulation reverts and a second run
  of the script would die instead of reusing the Safe it already made.
- After creation the script **reads the config back** — `getOwners()` and
  `getThreshold()` — and aborts unless the threshold is 2 and all three signers are
  owners. Never hand the stack to an address whose configuration hasn't been verified.

Result: Safe `0x47b5e2923216f203b7960d8D232215534AF02FF2`.

### 4. Configure the deploy (env vars)

Full annotated template: [`.env.mainnet.example`](.env.mainnet.example).
`go-mainnet.sh` exports these itself; every one is re-checked by `_assertMainnetSafe` in
`script/DeployProduction.s.sol`, which **reverts rather than shipping an unsafe stack**.

| Var | Value used | Why |
|---|---|---|
| `OWNER` | the Safe | Must be a **contract** and must differ from the deployer. An EOA here is rejected. |
| `AGENT` | desk hot key | Delegated via `SessionKeyExecutor`; must differ from deployer and `OWNER`. |
| `USDG` / `ROUTER` | verified addresses above | `decimals()` pinned to 6; router must hold code. |
| `STOCKS` / `FEEDS` | 5 tokens / 5 feed proxies | Comma-separated, **index-aligned**; duplicates rejected. Matched by address, never symbol. |
| `SEQUENCER_FEED` | *(blank)* | None exists on this chain — see above. |
| `LIVENESS_FEEDS` | ETH/USD, USDT/USD, ENA/USD | 24/7 crypto quorum substituting for the uptime feed. Equity feeds are rejected. |
| `LIVENESS_BOUND` | `43200` (12h) | Observed idle gap on the quietest 24/7 feed ~7h; 12h leaves margin without false halts. Gate enforces 1h–1d. |
| `FEED_STALENESS` | `14400` (4h) | Gates **execution**. Cannot be set under 3600 — that's below the feed's own heartbeat guarantee. |
| `FEED_STALENESS_OFFHOURS` | `302400` (3.5d) | Gates **valuation**. Live weekend feed ages measured 24.6–28.9h, so anything under 3d breaks NAV every weekend. Gate enforces 3d–7d. |
| `DEPOSIT_CAP` | `10000000000` (10,000 USDG, 6-dec) | **Staged rollout.** The stack is unaudited, so the blast radius of a surviving bug is bounded by what the vault may hold. Mainnet **refuses 0**. Raise later, deliberately, via the Safe (`setDepositCap`). |

### 5. Deploy

```bash
export DEPLOYER_PK=0x<deployer key>      # not stored in the script
./go-mainnet.sh                          # funds wallets -> creates Safe -> deploys
```

The script **simulates the entire deploy without broadcasting first** (`forge script`
with no `--broadcast`), so every safety gate runs and a misconfiguration costs nothing
instead of stranding gas mid-sequence. It then prompts for an explicit `yes` before
broadcasting. Addresses land in `deployments/latest.json`.

Run it manually instead, if you prefer — export everything from step 4 first:

```bash
export PRIVATE_KEY=0x<deployer key>   # the 0x is REQUIRED: forge's vm.envUint parses a
                                      # bare hex string as decimal and dies on the letters
forge script script/DeployProduction.s.sol --rpc-url $R -vvv                    # simulate
forge script script/DeployProduction.s.sol --rpc-url $R --broadcast \
  --private-key $PRIVATE_KEY -vvv                                              # broadcast
```

Prefer a keystore over a plaintext key where you can:
`cast wallet import aelix-deployer --interactive`, then `--account aelix-deployer`.

### 6. Finish the handover: three acceptOwnership txs

**This is still outstanding and it is the most important remaining step.**

The deploy calls `transferOwnership(Safe)` on `RWAVault`, `ChainlinkOracleAdapter` and
`SessionKeyExecutor`. All three are **`Ownable2Step`**, so ownership does *not* move until
the Safe accepts — deliberately, because a typo'd `OWNER` then cannot brick the stack.
Right now:

- ✅ `GuardrailConfig` and `UniswapSwapAdapter` — owned by the Safe already.
- ⚠️ `RWAVault`, `ChainlinkOracleAdapter`, `SessionKeyExecutor` — `owner()` is still the
  deployer EOA `0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51`, with `pendingOwner()` = Safe.

**Until these three land, a single hot key controls the vault, the oracle and the agent
executor.**

These must be executed **as Safe transactions** (2-of-3), not as direct EOA sends —
`acceptOwnership()` requires `msg.sender == pendingOwner()`, which is the Safe itself.
Three separate txs, each to one target with empty-args calldata `acceptOwnership()`
(selector `0x79ba5097`), value 0:

| # | Target | Contract |
|---|---|---|
| 1 | `0x0e500E390cC599055f1e54194e1e611Cf64c5047` | RWAVault |
| 2 | `0xF6cFcA2024AFDeC14BCb0A9eb7bA402e73b2699A` | ChainlinkOracleAdapter |
| 3 | `0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7` | SessionKeyExecutor |

(The deploy log prints the same three addresses.) Then confirm each `owner()` reads as
the Safe — do not treat the handover as done on the strength of the tx receipts:

```bash
for c in 0x0e500E390cC599055f1e54194e1e611Cf64c5047 \
         0xF6cFcA2024AFDeC14BCb0A9eb7bA402e73b2699A \
         0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7; do
  cast call "$c" "owner()(address)" --rpc-url "$R"     # expect the Safe on all three
done
```

### 7. Verify on the explorer (outstanding)

Contracts are **not yet verified**. Blockscout needs no API key:

```bash
forge verify-contract <ADDR> src/RWAVault.sol:RWAVault \
  --verifier blockscout --verifier-url <mainnet explorer>/api/ --watch
```

Confirm the mainnet explorer host in the Robinhood docs before using it.

### 8. Light up the dashboard

```bash
cd bridge
RPC_URL=http://127.0.0.1:8545 node index.mjs                            # read-only refresh
RPC_URL=http://127.0.0.1:8545 PRIVATE_KEY=$PRIVATE_KEY node index.mjs --attest
```

It reads `deployments/latest.json`. With TVL at 0 the panels are honestly empty — do not
seed them.

---

## After deploy

- The script grants the agent a **zero-limit placeholder session**. Set real limits with
  `SessionKeyExecutor.grantSession(...)` — from the Safe, after step 6 — once the vault is
  funded.
- Deposits are capped at 10,000 USDG. Raise it only after an audit, via the Safe.
- Current live state: `totalAssets` 0, `totalSupply` 0, not paused, 5 tokens allowlisted.
  No depositors, no trades, no track record.

## Known limitations (before real funds)

- **No third-party audit.** Two internal audit passes and a 42-agent preflight review are
  not an audit. Everything below is secondary to this.
- **Ownership handover incomplete** — step 6 above.
- **No sequencer uptime feed on this chain.** The liveness quorum is a coarse substitute
  that catches multi-hour outages, not minute-scale ones.
- **Corporate actions / splits:** the Robinhood Chainlink oracle *pauses* during
  splits/actions and exposes an ERC-8056 `uiMultiplier`. `ChainlinkOracleAdapter` reads the
  raw price and does not yet apply the multiplier (its interface isn't published). Interim
  mitigation shipped: the owner freezes the affected token with
  `ChainlinkOracleAdapter.setFeedFrozen(token, true)` for the event window — `price()` then
  fails closed, so NAV and every mint/redeem revert rather than transacting at a mispriced
  raw feed (`redeemInKind` still exits pro-rata). Unfreeze once the feed reflects the
  post-action price. A fully split-aware adapter follows once the ERC-8056 feed is confirmed.
- **Oracle-latency entry/exit:** deposits value the stock leg via a heartbeat-lagged feed
  while `redeemInKind` returns real pro-rata assets, so a stale window is arbitrageable.
  Mitigated by a tight per-feed `maxStaleness` (`FEED_STALENESS` is set to 4h, well under
  the 86400s heartbeat) plus a 0.2% exit fee and the freeze breaker above; a full fix
  (TWAP) is a deliberate economics change, out of scope for v1.
- **Contracts not verified on the explorer**, so third parties cannot yet match bytecode
  to this source.
- **Regulatory exposure is unresolved.** Stock Tokens are restricted for US persons, and
  no legal review has been completed. Deploying a contract does not change either fact.
