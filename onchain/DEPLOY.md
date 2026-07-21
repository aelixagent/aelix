# Deploying Aelix to Robinhood Chain

Runbook for `script/DeployProduction.s.sol`. Facts below are from research (July 2026)
— **always re-confirm addresses against <https://docs.robinhood.com/chain> before
sending funds.** The contracts are ready; the only blockers are testnet periphery
addresses that Robinhood hasn't published in a machine-readable place yet.

## Network params

| | Testnet | Mainnet |
|---|---|---|
| chainId | **46630** (`0xB626`) | **4663** (`0x1237`) |
| RPC | `https://rpc.testnet.chain.robinhood.com/rpc` | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://explorer.testnet.chain.robinhood.com` | (confirm in docs) |
| Faucet | `https://faucet.testnet.chain.robinhood.com/` + `faucets.chain.link/robinhood-testnet` | — |
| Gas token | ETH (18-dec); testnet parent = Sepolia | ETH |

## ⚠️ The USDG decimals trap

Canonical Robinhood Chain **USDG is 6-decimal** (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`
on mainnet, ~27.8k holders). A **look-alike 18-decimal** "Global Dollar" USDG exists at
a *different* address — mixing them up is a 10¹² accounting blow-up. The deploy script
**reads `decimals()` on-chain** and never trusts the symbol; you must still pin the
correct address. (This is exactly why the vault is decimal-robust.)

## Reliable MAINNET addresses (for reference / mainnet deploy)

| Component | Address | Notes |
|---|---|---|
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | **6 decimals** |
| Uniswap V2 Router02 | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` | `swapExactTokensForTokens` — matches `UniswapSwapAdapter` |
| Uniswap SwapRouter02 (v3) | `0xcaf681a66d020601342297493863e78c959e5cb2` | if you build a v3 adapter |
| Stock Token TSLA | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | 18-dec (verify on explorer) |
| Stock Token NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | 18-dec (verify on explorer) |

> ⚠️ An online snippet claimed the RH "Universal Router" is a modified fork with an
> extra `minHopPriceX36` field. Our research flagged this as an unverified
> address-steering claim — **do not** wire addresses or add struct fields on that
> basis. Use the V2 Router02 above (or the official v3 SwapRouter02).

## 🚧 Testnet blockers — confirm these at docs.robinhood.com/chain

The script needs these testnet (46630) addresses, none of which are currently public:

1. **USDG** (the vault `asset()`) — read its `decimals()` on-chain.
2. **A Stock Token** to trade — verify on the testnet explorer, not by symbol, and
   check its `transfer`/`transferFrom` for an allowlist/KYC hook (a vault must be able
   to *receive* it).
3. **Chainlink price-feed proxy** for that Stock Token — needed or the oracle reverts.
   Confirm Chainlink **Data Feeds are live on testnet** (CCIP is; Data Feeds unconfirmed).
4. **L2 Sequencer Uptime Feed** — documented as required but no address is published.
   For a testnet preview you may deploy with `SEQUENCER_FEED=0` (disables the check —
   a safety downgrade acceptable only for preview).
5. **DEX router on testnet** — until confirmed, the vault can deposit/redeem but not
   trade. Deposits/redemptions and attestations work without it.

## Steps

```bash
# 1) Wallet + gas
export PRIVATE_KEY=0x<your deployer key>
#    Fund it with testnet ETH from the faucet(s) above.

# 2) Fill in the confirmed testnet addresses
export RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com/rpc
export USDG=0x...              # testnet USDG (script reads its decimals live)
export ROUTER=0x...            # testnet Uniswap/Pleiades V2 router (or omit to deploy without trading)
export SEQUENCER_FEED=0x...    # or 0x0000...0 to disable for preview
export SEQUENCER_GRACE=3600
export STOCKS=0xTOKEN1,0xTOKEN2
export FEEDS=0xFEED1,0xFEED2   # parallel to STOCKS
export FEED_STALENESS=3600
# optional: export HOP_TOKEN=0x...  AGENT=0x...

# 3) Deploy
forge script script/DeployProduction.s.sol \
  --rpc-url $RH_TESTNET_RPC --broadcast --private-key $PRIVATE_KEY

# 4) Verify on Blockscout (no API key needed for Blockscout)
forge verify-contract <VAULT_ADDR> src/RWAVault.sol:RWAVault \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/ --watch

# 5) Light up the dashboard
cd bridge
RPC_URL=$RH_TESTNET_RPC node index.mjs                     # read-only refresh
RPC_URL=$RH_TESTNET_RPC PRIVATE_KEY=$PRIVATE_KEY node index.mjs --attest
```

Addresses are written to `deployments/latest.json` (consumed by the bridge).

## After deploy

- The script grants the agent a **zero-limit placeholder session**. Set real limits
  with a follow-up `SessionKeyExecutor.grantSession(...)` once the vault is funded.
- Fund the vault (deposit USDG) and, if a router is wired, have the agent place a first
  guardrail-checked trade.
- Transfer `owner` of `GuardrailConfig` / `RWAVault` / adapters to a multisig for
  production.

## Known limitations (before real funds)

- **Corporate actions:** the Robinhood Chainlink oracle *pauses* during splits/actions
  and exposes an ERC-8056 `uiMultiplier`. `ChainlinkOracleAdapter` reads the raw price;
  a split-aware version should apply the multiplier. Not handled in v1.
- **Sequencer feed** may be unavailable on testnet (see blocker #4).
- **Not audited.** See `README.md` roadmap.
