# Aelix — On-Chain Module (Robinhood Chain)

The smart-contract layer that turns the Aelix AI trading desk (this repo) into a
product other people can use **and verify**: a non-custodial, AI-managed vault for
tokenized real-world assets (Robinhood Chain **Stock Tokens**) where the risk rules
in [`../CLAUDE.md`](../CLAUDE.md) and [`../strategies/README.md`](../strategies/README.md)
are **enforced by the contract, not merely promised by a prompt** — and where each desk
run is attested on-chain, so the record is verifiable instead of self-reported. (Nothing
has been attested yet on mainnet; there is no track record.)

> **Status: mainnet — unaudited — deposits capped.** Deployed on Robinhood Chain
> **mainnet (chain 4663)** against real periphery: 214 passing tests (unit + fuzz +
> invariant), no mocks anywhere in the mainnet path. **No third-party audit yet** — two
> internal audit passes and a 42-agent preflight review are *not* an audit. Deposits are
> capped at **10,000 USDG**, TVL is **0**, and **every owner-controlled contract is now
> owned by the 2-of-3 Safe multisig** — the handover completed 2026-07-26 and was verified
> by direct call (details below). Contracts are not yet verified on the block explorer.
> Treat this as an early mainnet deployment, not a finished product.

## Live on Robinhood Chain mainnet (chain 4663)

Deployed **2026-07-26**. Every address below was confirmed by calling an identifying
function on the deployed contract, and the periphery is real — Paxos **USDG** (`decimals()`
reads **6**, so this is the original and not the 18-decimal look-alike), **Uniswap V2
Router02**, and five **Robinhood Stock Tokens** (NVDA, AAPL, TSLA, GOOGL, SPY) each behind
its own Chainlink feed proxy. The oracle returns live prices (NVDA read **$206.37** at
deploy time). `vAELIX` has 12 decimals (6 from USDG + a 6-decimal offset).

Hardened before deploy across two internal audit passes — the exploit-focused second pass
closed all 5 HIGH value-extraction vectors: ERC-4626 inflation attack (1e6 decimals offset),
oracle-lag deposit/redeem arbitrage (0.2% exit fee), sell (self-)sandwich (sell band
tightened 15%→5%), token-decimals spoof (pinned at trade), plus the earlier per-day sell
cap, resilient `redeemInKind`, and honest (real-NAV) track record. That is internal review,
**not** a third-party audit.

| Contract | Address | Owner **today** |
|---|---|---|
| Safe (2-of-3 multisig) | `0x47b5e2923216f203b7960d8D232215534AF02FF2` | 3 signers, threshold 2 |
| RWAVault (vAELIX) | `0x0e500E390cC599055f1e54194e1e611Cf64c5047` | ✅ Safe — `acceptOwnership()` executed 2026-07-26 |
| GuardrailConfig | `0x68cf24994d0363Be7688e96B69dDacC290c766C0` | ✅ Safe — from construction |
| ChainlinkOracleAdapter | `0xF6cFcA2024AFDeC14BCb0A9eb7bA402e73b2699A` | ✅ Safe — `acceptOwnership()` executed 2026-07-26 |
| UniswapSwapAdapter | `0x9a8bb5E65f340C4Bf6c7Aa71991EC5D31083b5cf` | ✅ Safe — from construction |
| SessionKeyExecutor | `0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7` | ✅ Safe — `acceptOwnership()` executed 2026-07-26 |
| DeskRegistry | `0x68cc84d722E2d613cAc36c62167B177656e2C983` | append-only, no owner |
| PerfScore | `0x1CB3df5AAFEb0d2c31277e3e889613bc6F4C9e14` | pure math, no owner |
| AelixAutosave | `0x5b0778E8561EA31490588D21bd44419803DC709b` | non-custodial, per-user schedules |

### Ownership handover — complete (2026-07-26)

`RWAVault`, `ChainlinkOracleAdapter` and `SessionKeyExecutor` are `Ownable2Step`. The
deploy called `transferOwnership(Safe)`; the Safe then executed `acceptOwnership()` on all
three in one 2-of-3 batch
(tx `0x1ee7a73e7c3df216579554cd3d5993dfeee6be2bd081a68f59700efbd5968cea`).

Verified by direct `eth_call` **after** execution, not from tx receipts (`$R` is the
mainnet RPC, as in [DEPLOY.md](DEPLOY.md)):

```bash
for c in 0x0e500E390cC599055f1e54194e1e611Cf64c5047 \
         0xF6cFcA2024AFDeC14BCb0A9eb7bA402e73b2699A \
         0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7; do
  cast call "$c" "owner()(address)"        --rpc-url "$R"   # -> 0x47b5…2FF2 (the Safe)
  cast call "$c" "pendingOwner()(address)" --rpc-url "$R"   # -> 0x0  (settled, not half-done)
done
```

`GuardrailConfig` and `UniswapSwapAdapter` were Safe-owned **from construction** and never
passed through the deployer at all.

**Negative control.** The deployer EOA `0xeC68f3c2f23c11Eb7Ca77322b4E66d23492B5c51` now
reverts with `OwnableUnauthorizedAccount` (`0x118cdaa7`) on `allowToken`, `setDepositCap`
and `setFeedFrozen`, while the same calls from the Safe address succeed. The deploy key
holds no residual authority over any contract in the stack.

The consequence: **every owner-controlled contract in the stack is owned by the 2-of-3
Safe.** Changing any risk cap, price feed, deposit cap or session grant takes 2 of 3
signatures, so no single hot key can weaken the guardrails. It does not mean the code has
been reviewed — the stack is still **unaudited**. A multisig governs who may change the
rules; it does not audit the implementation.

### Live state

`totalAssets` **0**, `totalSupply` **0**, not paused, 5 tokens allowlisted, deposit cap
10,000 USDG. **No depositors, no trades, no track record, no returns** — nothing to show
yet, and no number here is projected or illustrative.

<details>
<summary>Historical: the earlier testnet preview (chain 46630)</summary>

Before mainnet, the stack ran on Robinhood Chain testnet with **mocked** periphery (demo
USDG/oracle/swap). That is where guardrail enforcement was first confirmed live — an
over-cap buy reverts `PerTradeCap`, a stop-less buy reverts `MissingStop`, a compliant buy
is allowed. Those addresses are superseded by the mainnet table above:
RWAVault `0x4B2b8e97eD07089A6763eb164011066d9E5a6240`,
GuardrailConfig `0xf300640C2AF17c19549348894E81B5C027a5c6AF`,
DeskRegistry `0x023ea578134f1f5fD064731089f3c318EE8Cab9E`,
PerfScore `0x92F971E470DF5095E17F3e2c3095122142d8d632`,
SessionKeyExecutor `0xDcbdb4ef70Df6CF466E93B5C2670F1D4FE33BB9b`,
AelixAutosave `0xdd28Aee6a1E67a04349A5751789312d3f8fd5574`.

</details>

Verified mainnet periphery: USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (**6-dec**),
WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`, Uniswap V2 Router02
`0x89e5db8b5aa49aa85ac63f691524311aeb649eba` (its `WETH()` cross-confirms the row above).
Full read-by-read provenance in [MAINNET_ADDRESSES.md](MAINNET_ADDRESSES.md).

---

## Why this exists

The desk already has the hard part — analysts + a Risk Manager + written strategies.
What retail can't do today is *trust* an AI with money: robo-advisors are custodial
black boxes, and "AI trading bots" all claim profits nobody can check. This module
closes both gaps on-chain:

1. **Guardrails as code** — the CLAUDE.md caps become a smart contract an agent
   *cannot* bypass, only the human owner can change.
2. **Proof-of-track-record** — each desk run is attested on-chain and performance is
   computed from attested data, so it can't be inflated. The mechanism is deployed; no
   runs have been attested on mainnet yet, so there is nothing to show.

## Architecture (8 deployed contracts + 1 pure library)

```
GuardrailConfig ──caps──►  Guardrails (pure lib)
 (Safe-owned,                     ▲  evaluate(order)
  fail-closed)                    │
   deposit / withdraw ──┐         │                             agent key
   previewTrade      ───┤         │                                 │ trade()
   redeemInKind      ───┴──►  RWAVault (ERC-4626)  ◄──manager──  SessionKeyExecutor
   AelixAutosave     ───┘     enforces caps at the               (expiring, revocable,
   (recurring DCA)             custody layer                      scoped agent keys)
                                │              │
                                │ price()      │ swap()
                                ▼              ▼
                 ChainlinkOracleAdapter    UniswapSwapAdapter
                 real Chainlink feeds;     V2 Router02, slippage
                 staleness + freeze        band, real Stock
                 breaker + liveness        Tokens

DeskRegistry ──series──► PerfScore
 (append-only,           (return / drawdown /
  chain-stamped)          volatility / Sharpe)
```

| Contract | Role | File |
|---|---|---|
| `Guardrails` | Pure library: the CLAUDE.md rulebook as a deterministic `evaluate()` | [src/libraries/Guardrails.sol](src/libraries/Guardrails.sol) |
| `GuardrailConfig` | Human-owned, fail-closed store of the caps (agent can't change) | [src/GuardrailConfig.sol](src/GuardrailConfig.sol) |
| `RWAVault` | ERC-4626 vault; enforces guardrails on every trade at the custody layer | [src/RWAVault.sol](src/RWAVault.sol) |
| `ChainlinkOracleAdapter` | Real Chainlink feeds → NAV; per-feed staleness, freeze breaker, liveness quorum | [src/ChainlinkOracleAdapter.sol](src/ChainlinkOracleAdapter.sol) |
| `UniswapSwapAdapter` | Executes the swap leg through Uniswap V2 Router02 with a slippage band | [src/UniswapSwapAdapter.sol](src/UniswapSwapAdapter.sol) |
| `SessionKeyExecutor` | ERC-4337-style scoped/expiring/revocable delegation to agent keys | [src/SessionKeyExecutor.sol](src/SessionKeyExecutor.sol) |
| `AelixAutosave` | Consumer recurring DCA into the vault (keeper-triggered) | [src/AelixAutosave.sol](src/AelixAutosave.sol) |
| `DeskRegistry` + `PerfScore` | Attested track record + on-chain performance math | [src/DeskRegistry.sol](src/DeskRegistry.sol) · [src/PerfScore.sol](src/PerfScore.sol) |

## CLAUDE.md → on-chain mapping

Every cap in [`../strategies/README.md`](../strategies/README.md) is basis-pointed and enforced:

| Rule | Value | On-chain |
|---|---|---|
| Per-trade cap | 15% NAV | `perTradeBps 1500` — blocks the buy |
| Max concentration | 25% NAV | `maxConcentrationBps 2500` |
| Max open positions | 6 | `maxOpenPositions` |
| Max daily orders | 4 | `maxDailyOrders` (buys throttled; sells never trapped) |
| Stop-loss required | −8% | `stopLossBps 800` (buy reverts without a real stop) |
| Daily-loss halt | −5% | `dailyLossHaltBps 500` (live + latchable) |
| Cash buffer | ≥10% | `cashBufferBps 1000` |
| No averaging into losers | except left-side ladder | `leftSideException` flag |

The vault re-checks these on **every** `executeTrade`, so a compromised agent key
(or a buggy strategy) can't push an order the rules forbid. `previewTrade(order)`
returns the exact `Violation` before anything is signed — the on-chain analogue of
CLAUDE.md's "present a preview, then get approval".

## Security model — defense in depth

- **Layer 1 — SessionKeyExecutor:** per-agent scope (expiry, per-trade + cumulative
  notional caps, max trades, token allowlist, side). Revocable instantly. A trade the
  vault rejects consumes *none* of the session budget.
- **Layer 2 — RWAVault + GuardrailConfig:** the hard, non-bypassable risk caps at the
  custody layer.
- **Human-only caps:** only `GuardrailConfig.owner` can change limits; the agent has
  read access and nothing more. On mainnet that owner is the 2-of-3 Safe.
- **Always-solvent exit:** `redeemInKind` returns a pro-rata slice of USDG + every
  Stock Token; it can never fail for lack of cash.
- **Staged blast radius:** the mainnet deposit cap is 10,000 USDG. The stack is
  unaudited, so what a surviving bug could reach is bounded by what the vault may hold.
- **Multisig-governed, not hot-key-governed:** every owner-controlled contract is owned by
  the 2-of-3 Safe (handover completed and verified above, including the negative control
  that the deployer key now reverts). Two of three signatures are required to move a cap,
  swap a feed, raise the deposit cap or grant a session. The weakest link in the model is
  now the one thing a multisig cannot fix: the code is **unaudited**.

---

## Build & test

```bash
cd onchain
forge test            # 214 tests across 14 suites
forge test --gas-report
```

Dependencies (`forge-std`, OpenZeppelin v5.1.0) are vendored plainly under `lib/`
(no submodules) so a fresh clone builds offline.

## Deploy

Mainnet is deployed via `script/DeployProduction.s.sol`, driven by `go-mainnet.sh`. The
full runbook — RPC proxy, Safe creation, env vars, and the three `acceptOwnership()` steps
that completed the handover (still part of the procedure for any future redeploy) — is in
**[DEPLOY.md](DEPLOY.md)**.

```bash
# Local simulation with mock periphery (prints all addresses, seeds a demo):
forge script script/Deploy.s.sol

# Robinhood Chain mainnet (4663) — see DEPLOY.md before running this:
python3 rpc-proxy.py &          # only needed where DNS hijacks *.robinhood.com
DEPLOYER_PK=0x... ./go-mainnet.sh
```

`Deploy.s.sol` is the **mock-periphery** script: it deploys + wires the stack, seeds a
demo (deposit, one guardrail-checked trade, two attestations), and is for local/testnet
use only. `DeployProduction.s.sol` is the mainnet path — it takes real periphery from the
environment, refuses to deploy if any safety gate fails (EOA owner, wrong USDG decimals,
zero deposit cap, an equity feed used as a liveness witness), and writes addresses to
`deployments/latest.json`.

Today the agent key is a **scoped EOA session** enforced by `SessionKeyExecutor` (the
vault manager); migrating it to a **native ERC-4337 session key** on the desk's smart
account is on the roadmap below — the current executor is *not* an ERC-4337 account.

## Bridge — light up the dashboard

The existing UI already renders an `onchain` panel set. The bridge fills it with live
contract state (and can attest a desk run):

```bash
cd bridge && npm install
export RPC_URL=http://127.0.0.1:8545      # or https://rpc.mainnet.chain.robinhood.com
node index.mjs                            # refresh onchain block
PRIVATE_KEY=0x.. node index.mjs --attest  # + attest a run
```

It reads `deployments/latest.json`, pulls NAV / shares / caps / attestations /
PerfScore, and writes the `onchain` block into `../ui/public/desk-state.json` (the
gitignored live file). Run `cd ../ui && npm run dev` to see the panels. Everything it
writes is a real read — with TVL at 0 the panels are honestly empty, not seeded.

---

## ⚠️ Open risks and unresolved constraints

Deploying to mainnet resolved the wiring; the Safe handover resolved who may change the
rules. Neither resolved any of the following.

- **No third-party audit.** Two internal passes and a 42-agent preflight review are not
  an audit. This is the single largest open risk, and it is why the deposit cap exists.
  Completing the ownership handover did nothing to strengthen the code.
- **No track record.** TVL 0, no depositors, no trades, no returns. Nothing to evaluate.
- **Contracts not yet verified** on the block explorer, so the bytecode cannot be read
  back against this source by a third party.
- **No Chainlink sequencer uptime feed exists on Robinhood Chain** (56 feeds in
  Chainlink's directory, zero uptime entries). Aelix substitutes a chain-liveness quorum
  built from 24/7 crypto feeds. It is **coarse by design**: it catches multi-hour
  outages, not minute-scale ones, and it is not equivalent to an uptime feed.
- **Stock Tokens are not for US persons** — restricted in the US, UK, Canada,
  Switzerland, UAE, and sanctioned jurisdictions; available in 120+ countries. A US
  person likely **cannot hold Stock Tokens**. The securities/regulatory question is
  unresolved and **no legal review has been completed**; a deployed contract does not
  change that.
- **Stock Tokens ≠ share ownership** — they are price-tracking instruments issued by a
  Robinhood entity; no voting rights, and holders are creditors if the issuer fails.
- **Centralized today** — single sequencer run by Robinhood, which also issues the
  asset. Possible transfer restrictions/allowlists on Stock Tokens mean the vault may
  need to be an allowlisted contract — confirm at <https://docs.robinhood.com/chain>.
- Chain is EVM-compatible (Arbitrum Orbit, ETH gas); DeFi live day-one: Uniswap +
  Pleiades (AMM), Morpho (lending), Lighter (perps), Chainlink (oracles), USDG (Paxos).
- The equities desk itself (Claude Code + MCP + Robinhood Agentic) is unchanged and
  still requires **explicit human approval for every order**. This deploy does not make
  the desk autonomous and does not connect customer money to the vault.
- The `$AELIX` token is **unlaunched** — no sale, no price, no investment.
- Not affiliated with, or endorsed by, Robinhood or Anthropic.

## Roadmap

- ~~Complete the ownership handover: Safe `acceptOwnership()` on all three contracts.~~
  **Done 2026-07-26** — verified above.
- Third-party audit before any meaningful funds; raise the deposit cap only after.
- Verify contracts on the mainnet explorer.
- ERC-4337 account + on-chain session-key validation (native, not just this executor).
- Split-aware oracle adapter applying the ERC-8056 `uiMultiplier` (today: freeze breaker).
- EAS-schema attestations + a soulbound reputation token wrapping `PerfScore`.
- Morpho integration for the RWA-collateralized lending product.
