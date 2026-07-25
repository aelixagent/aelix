# Verified Robinhood Chain mainnet addresses

Read live from chain **4663** and from Chainlink's reference-data-directory on
**2026-07-25**. Every value below was confirmed by an on-chain call, not copied from a
docs table. Re-verify before deploying: Robinhood's docs state the feed registry is the
source of truth and must not be hardcoded blindly.

RPC `https://rpc.mainnet.chain.robinhood.com` — `eth_chainId` returned `0x1237` (4663).
DNS resolves via `customer-origin.offchainlabs.com`, i.e. an Arbitrum Orbit chain.

## Core periphery (verified by direct call)

| Contract | Address | Verified |
|---|---|---|
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `decimals()` = **6**, `symbol()` = `USDG`, `name()` = `Global Dollar` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | `symbol()` = `WETH`, `decimals()` = 18 |
| Uniswap V2 Router02 | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` | 43.8KB code, `factory()` = `0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f`, `WETH()` matches the row above |

The `decimals() == 6` read is the check that matters: an 18-decimal "Global Dollar"
look-alike exists, and `DeployProduction` now pins USDG decimals to 6 so the impostor is
rejected without ever trusting the symbol.

## Stock Tokens (verified by direct call)

All Robinhood Stock Tokens are **18 decimals** and expose both `oraclePaused()` (false at
time of check) and ERC-8056 `uiMultiplier()` (**1e18 == neutral for every token checked**).

Authentic tokens carry the name suffix `• Robinhood Token`. The chain also hosts
unrelated tokens with confusable tickers and names — e.g. `STONKBROKER`, and an
unaffiliated `FOX` named "Robin Hood". **Match on contract address, never on symbol.**

| Ticker | Token address |
|---|---|
| AAPL | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` |
| AMD | `0x86923f96303D656E4aa86D9d42D1e57ad2023fdC` |
| AMZN | `0x12f190a9F9d7D37a250758b26824B97CE941bF54` |
| GME | `0x1b0E319c6A659F002271B69dB8A7df2F911c153E` |
| GOOGL | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3` |
| NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` |
| SGOV | `0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5` |
| SNDK | `0xB90A19fF0Af67f7779afF50A882A9CfF42446400` |
| SPCX | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` |
| SPY | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` |
| TSLA | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` |

## Chainlink equity feeds (33 total)

Uniform parameters across every equity feed: **8 decimals, heartbeat 86400s (24h),
deviation threshold 0.5%**. Use the **proxy** address — for several feeds
`contractAddress` differs from `proxyAddress`, and wiring the aggregator instead of the
proxy breaks on the next feed upgrade.

| Feed | Proxy address |
|---|---|
| Robinhood AAPL / USD | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` |
| Robinhood AMD / USD | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` |
| Robinhood AMZN / USD | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` |
| Robinhood ASML / USD | `0xB4106147E8cce40b7d46124090d373A71b70f87D` |
| Robinhood BABA / USD | `0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984` |
| Robinhood CLSK / USD | `0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF` |
| Robinhood COIN / USD | `0xA3a468A452940B7D6b69991207B508c609a98Ef2` |
| Robinhood CRCL / USD | `0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a` |
| Robinhood CRWV / USD | `0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C` |
| Robinhood DELL-USD | `0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b` |
| Robinhood EWY / USD | `0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1` |
| Robinhood GME / USD | `0x27C71df6A64fB476468EdF256CF72c038baB5B67` |
| Robinhood GOOGL / USD | `0xF6f373a037c30F0e5010d854385cA89185AE638b` |
| Robinhood INTC / USD | `0x3f390C5C24628Ac7C489515402235FeAD71D1913` |
| Robinhood IONQ / USD | `0x22EfeC4919baf55F360E0EDee4AbEB26DE4971eb` |
| Robinhood META / USD | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` |
| Robinhood MSFT / USD | `0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E` |
| Robinhood MSTR / USD | `0x396118bdFB181e6240E74D243F266B061c0edc3D` |
| Robinhood MU / USD | `0x425EEFdCf05ed6526C3cE61Af99429A228a6d596` |
| Robinhood NBIS / USD | `0xE1D87B116Ba0fe898998f1D140339D1fA1E09705` |
| Robinhood NVDA / USD | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` |
| Robinhood ORCL / USD | `0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844` |
| Robinhood PLTR / USD | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` |
| Robinhood QQQ / USD | `0x80901d846d5D7B030F26B480776EE3b29374C2ae` |
| Robinhood RGTI / USD | `0x2A045cF1C49c61c166C036d2f06FA2D2d984f765` |
| Robinhood RKLB / USD | `0x045477BF65Aef6f4F2386ad0164579e48381CC74` |
| Robinhood SLV / USD | `0x209b73908e92Ae021826eD79609845451Ecba2ce` |
| Robinhood SNDK / USD | `0xfb133Fa4B7b385802B693a293606682Df47109A3` |
| Robinhood SPCX / USD | `0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb` |
| Robinhood SPY / USD | `0x319724394D3A0e3669269846abE664Cd621f9f6A` |
| Robinhood TSLA / USD | `0x4A1166a659A55625345e9515b32adECea5547C38` |
| Robinhood TSM / USD | `0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F` |
| Robinhood USO / USD | `0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c` |

## Live freshness measurement

Sampled Saturday 2026-07-25 20:36 UTC, with US equity markets closed since Friday:

| Feed | Price | Round age |
|---|---|---|
| NVDA | $206.37 | 24.6h |
| AAPL | $333.22 | 28.9h |
| TSLA | $312.35 | 24.7h |
| SPY | $739.74 | 26.2h |

Every feed was already **past its own 24h heartbeat**. This is the direct evidence behind
the two-tier staleness design: a flat one-hour bound would have reverted NAV — and every
deposit and redemption — at the moment of measurement. The valuation bound must be
multi-day; the deploy gate now enforces >= 3 days.

## Sequencer uptime feed — NOT FOUND (resolved a different way)

Chainlink's `feeds-robinhood-mainnet.json` contains **56 feeds and zero sequencer-uptime
or L2-uptime entries**. Robinhood's own docs describe the consume pattern
(`latestRoundData()`, require status 0, wait out a grace period) but publish no address,
and Robinhood Chain is absent from Chainlink's general L2-sequencer-feeds page.

This is **no longer a blocker.** `SEQUENCER_FEED` is now optional; the gate requires
`SEQUENCER_FEED` **or** a chain-liveness quorum of at least two 24/7 crypto feeds, and
refuses a deploy with neither. See `ChainlinkOracleAdapter.livenessRefs`.

The substitute works because crypto feeds publish 24/7 while equity feeds are 24/5, which
is precisely the discriminator a staleness check lacks — measured in the table above, on a
Saturday night the equity feeds were 24.6-28.9h stale while ETH/USD was 0.8h. One fresh
24/7 witness proves the chain is producing blocks and the oracle network is delivering, so
a stale equity feed just means a closed session. All witnesses stale together is a
systemic outage and the vault fails closed (`ChainLivenessStale`).

It is deliberately a COARSE signal: it catches multi-hour outages, not minute-scale ones.
Post-recovery protection comes from the per-feed staleness bound instead — a trade cannot
execute until the equity feed itself publishes a fresh round, which is the same guarantee
Chainlink's grace period provides. Still worth asking Chainlink
(`chainlink_data_feeds@smartcontract.com`) for a real uptime feed; wiring
`SEQUENCER_FEED` later is additive and needs no redeploy of the vault.

### 24/7 liveness references (verified live)

| Feed | Proxy | Age when sampled |
|---|---|---|
| ETH / USD | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | 0.80h |
| USDT / USD | `0xbf3550B6fAe1671da7C238Af12e03Ac586BEf3B1` | 0.99h |
| ENA / USD | `0x2A291496b3aa19d8948e442Ef28Ee952f3Ee97E8` | 0.94h |

Never use an equity feed here — the gate rejects it, because it would halt the vault every
weekend.

