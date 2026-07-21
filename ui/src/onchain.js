// Live on-chain reader for the desk dashboard. Reads the REAL deployed contracts over
// a public RPC (no wallet needed — the desk is read-only) and shapes the result to feed
// the existing on-chain panels. This is what turns the "on-chain band" from empty/demo
// into a live mirror of Robinhood Chain state: real Guardrail caps, real vault NAV, the
// vault's actual Stock Token holdings, and real TradeExecuted history.
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'

const CHAINS = {
  46630: { id: 46630, name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] } } },
  4663: { id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } } },
  31337: { id: 31337, name: 'Anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } },
}

const GUARD_ABI = parseAbi([
  'function caps() view returns ((uint16 perTradeBps,uint16 maxConcentrationBps,uint8 maxOpenPositions,uint8 maxDailyOrders,uint16 stopLossBps,uint16 dailyLossHaltBps,uint16 cashBufferBps) c)',
  'function maxExecSlippageBps() view returns (uint16)',
  'function maxSellSlippageBps() view returns (uint16)',
])
const VAULT_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function asset() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function navUsdg() view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
  'function allowedTokens() view returns (address[])',
  'function positionValue(address) view returns (uint256)',
  'function costBasisUsdg(address) view returns (uint256)',
  'function tokenDecimals(address) view returns (uint8)',
  'function stopPriceE18(address) view returns (uint256)',
  'function ordersToday() view returns (uint8)',
  'function haltedDay() view returns (uint256)',
  'event TradeExecuted(address indexed token, bool isBuy, uint256 amountIn, uint256 amountOut, uint8 ordersToday)',
])
const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
])

const n = (bi, dec) => Number(formatUnits(bi, dec))
const bps = (x) => `${(Number(x) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`

// Read everything the on-chain band needs, live. Best-effort: each section is guarded so
// one failed call can't blank the whole band.
export async function readOnchain(cfg) {
  const chain = CHAINS[cfg.chainId] || CHAINS[46630]
  const pc = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })
  const c = cfg.contracts || {}
  const out = { live: true }

  // ---- Guardrails (real caps from GuardrailConfig) ----
  if (c.guardrails) {
    try {
      const [caps, buyBps, sellBps] = await Promise.all([
        pc.readContract({ address: c.guardrails, abi: GUARD_ABI, functionName: 'caps' }),
        pc.readContract({ address: c.guardrails, abi: GUARD_ABI, functionName: 'maxExecSlippageBps' }).catch(() => null),
        pc.readContract({ address: c.guardrails, abi: GUARD_ABI, functionName: 'maxSellSlippageBps' }).catch(() => null),
      ])
      out.guardrails = [
        { key: 'perTrade', label: 'Max per-trade', value: `${bps(caps.perTradeBps)} of NAV`, enforced: true },
        { key: 'conc', label: 'Max concentration', value: `${bps(caps.maxConcentrationBps)} / symbol`, enforced: true },
        { key: 'openPos', label: 'Max open positions', value: `${caps.maxOpenPositions}`, enforced: true },
        { key: 'dailyOrders', label: 'Max daily orders', value: `${caps.maxDailyOrders} / day`, enforced: true },
        { key: 'stop', label: 'Required stop-loss', value: bps(caps.stopLossBps), enforced: true },
        { key: 'halt', label: 'Daily-loss halt', value: `${bps(caps.dailyLossHaltBps)} / day`, enforced: true },
        { key: 'cash', label: 'Min cash buffer', value: bps(caps.cashBufferBps), enforced: true },
        ...(buyBps != null ? [{ key: 'execBuy', label: 'Buy exec-slippage', value: bps(buyBps), enforced: true }] : []),
        ...(sellBps != null ? [{ key: 'execSell', label: 'Sell exec-slippage', value: bps(sellBps), enforced: true }] : []),
      ]
    } catch (e) { out.guardrailsError = e.shortMessage || e.message }
  }

  // ---- Vault NAV / shares / share price + on-chain positions ----
  if (c.vault) {
    try {
      const [symbol, vDec, asset, supply, nav, ordersToday] = await Promise.all([
        pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'symbol' }),
        pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'decimals' }),
        pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'asset' }),
        pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'totalSupply' }),
        pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'navUsdg' }),
        pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'ordersToday' }).catch(() => 0),
      ])
      const [uDec, uSym, cash, allowed, sharePriceRaw] = await Promise.all([
        pc.readContract({ address: asset, abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals' }),
        pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => 'USDG'),
        pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'balanceOf', args: [c.vault] }),
        pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'allowedTokens' }).catch(() => []),
        supply > 0n
          ? pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [10n ** BigInt(vDec)] }).catch(() => 0n)
          : Promise.resolve(0n),
      ])

      const navNum = n(nav, uDec)
      const positions = []
      let deployed = 0
      for (const tok of allowed) {
        try {
          const [bal, pv, sym, tDec, cb] = await Promise.all([
            pc.readContract({ address: tok, abi: ERC20_ABI, functionName: 'balanceOf', args: [c.vault] }),
            pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'positionValue', args: [tok] }),
            pc.readContract({ address: tok, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => tok.slice(0, 6)),
            pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'tokenDecimals', args: [tok] }).catch(() => 18),
            pc.readContract({ address: c.vault, abi: VAULT_ABI, functionName: 'costBasisUsdg', args: [tok] }).catch(() => 0n),
          ])
          if (bal === 0n) continue
          const qty = n(bal, Number(tDec))
          const value = n(pv, uDec)
          const costBasis = n(cb, uDec)
          const pnl = value - costBasis
          deployed += value
          positions.push({
            symbol: sym,
            qty,
            avgCost: qty > 0 ? costBasis / qty : 0,
            last: qty > 0 ? value / qty : 0,
            value,
            pnl,
            pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
            weightPct: navNum > 0 ? (value / navNum) * 100 : 0,
            stop: 0,
          })
        } catch { /* skip a token whose feed is down (H2 fail-open) */ }
      }

      out.vault = {
        symbol,
        nav: navNum,
        totalAssets: navNum,
        totalShares: n(supply, Number(vDec)),
        yourShares: null,
        yourValue: null,
        sharePrice: sharePriceRaw > 0n ? n(sharePriceRaw, uDec) : (supply > 0n ? navNum / n(supply, Number(vDec)) : 1),
        utilizationPct: navNum > 0 ? Math.round((deployed / navNum) * 100) : 0,
        apyPct: null,
        cash: n(cash, uDec),
        assetSymbol: uSym,
        ordersToday: Number(ordersToday),
        openPositions: positions.length,
        live: true,
      }
      out.positions = positions
    } catch (e) { out.vaultError = e.shortMessage || e.message }

    // ---- Recent on-chain trades (TradeExecuted) ----
    try {
      const latest = await pc.getBlockNumber()
      const span = 500_000n
      const fromBlock = latest > span ? latest - span : 0n
      const logs = await pc.getLogs({
        address: c.vault,
        event: VAULT_ABI.find((x) => x.type === 'event' && x.name === 'TradeExecuted'),
        fromBlock,
        toBlock: latest,
      })
      const recent = logs.slice(-8).reverse()
      const uDecGuess = out.vault ? undefined : 18
      const orders = []
      for (const l of recent) {
        const { token, isBuy, amountIn, amountOut } = l.args
        let sym = token.slice(0, 6)
        try { sym = await pc.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }) } catch { /* keep short addr */ }
        let time = null
        try { const b = await pc.getBlock({ blockNumber: l.blockNumber }); time = Number(b.timestamp) * 1000 } catch { /* no ts */ }
        // buy: amountIn USDG -> amountOut tokens; sell: amountIn tokens -> amountOut USDG
        orders.push({
          side: isBuy ? 'buy' : 'sell',
          symbol: sym,
          qty: isBuy ? n(amountOut, 18) : n(amountIn, 18),
          price: null,
          status: 'filled',
          time,
          txHash: l.transactionHash,
        })
      }
      out.trades = orders
      void uDecGuess
    } catch (e) { out.tradesError = e.shortMessage || e.message }
  }

  return out
}
