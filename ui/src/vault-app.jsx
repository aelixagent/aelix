import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
} from 'viem'
import './styles.css'
import './vault.css'

// ── Cross-surface links. Marketing site (landing/) runs on :5190 in dev; the
// desk dashboard is this same app's index.html (same origin). ──
const LANDING = 'http://localhost:5190'
const DOCS_URL = `${LANDING}/docs`

// ---- Robinhood Chain definitions (see onchain/DEPLOY.md) ----
const CHAINS = {
  46630: {
    id: 46630,
    name: 'Robinhood Chain Testnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] } },
    blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' } },
  },
  4663: {
    id: 4663,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
    blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.mainnet.chain.robinhood.com' } },
  },
  31337: {
    id: 31337,
    name: 'Anvil (local)',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  },
}

const VAULT_ABI = parseAbi([
  'function asset() view returns (address)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
  'function maxWithdraw(address) view returns (uint256)',
  'function navUsdg() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function redeemInKind(uint256 shares, address receiver)',
])
const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function mint(address,uint256)', // testnet mock only — no-op path on mainnet USDG
])
const AUTOSAVE_ABI = parseAbi([
  'function createPlan(uint256 amountPerPeriod, uint64 period, uint32 totalPeriods)',
  'function cancelPlan()',
  'function due(address) view returns (bool)',
  'function plans(address) view returns (uint256 amountPerPeriod, uint64 period, uint64 nextExec, uint32 totalPeriods, uint32 periodsDone, bool active)',
])

const MAX_UINT = (2n ** 256n) - 1n

const CONTRACT_META = [
  ['vault', 'Vault'],
  ['guardrails', 'Guardrails'],
  ['attestor', 'Registry'],
  ['executor', 'Executor'],
  ['autosave', 'Autosave'],
]

const TABS = [
  ['deposit', 'Deposit'],
  ['withdraw', 'Withdraw'],
  ['redeem', 'Redeem'],
  ['auto', 'Auto'],
]

export default function VaultApp() {
  const [cfg, setCfg] = useState(null)
  const [account, setAccount] = useState(null)
  const [walletChainId, setWalletChainId] = useState(null)
  const [pos, setPos] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastTx, setLastTx] = useState(null) // { label, status, hash }
  const [err, setErr] = useState('')
  const [toast, setToast] = useState(null)
  const [tab, setTab] = useState('deposit')
  const [showContracts, setShowContracts] = useState(false)
  const toastTimer = useRef(null)

  const [depAmt, setDepAmt] = useState('')
  const [wdAmt, setWdAmt] = useState('')
  const [inkindShares, setInkindShares] = useState('')
  const [saveAmt, setSaveAmt] = useState('')
  const [savePeriodDays, setSavePeriodDays] = useState('7')
  const [savePeriods, setSavePeriods] = useState('0')

  useEffect(() => {
    async function boot() {
      try {
        let s
        try {
          s = await (await fetch('/desk-state.json', { cache: 'no-store' })).json()
        } catch {
          s = await (await fetch('/desk-state.example.json', { cache: 'no-store' })).json()
        }
        const oc = s.onchain
        if (!oc || !oc.contracts || !oc.contracts.vault) {
          setErr('No deployed vault found in desk-state.json — run the bridge after deploy.')
          return
        }
        setCfg({ chainId: oc.network?.chainId ?? 31337, contracts: oc.contracts, network: oc.network })
      } catch (e) {
        setErr('Could not read desk-state.json: ' + e.message)
      }
    }
    boot()
  }, [])

  const chain = cfg ? CHAINS[cfg.chainId] || CHAINS[31337] : null
  const explorerBase = (cfg?.network?.explorer || chain?.blockExplorers?.default?.url || '').replace(/\/$/, '')
  const txUrl = (h) => (explorerBase && h ? `${explorerBase}/tx/${h}` : null)
  const addrUrl = (a) => (explorerBase && a ? `${explorerBase}/address/${a}` : null)
  const netShort = cfg
    ? (String(chain?.name || '').includes('Testnet') ? 'Testnet'
      : String(chain?.name || '').includes('Anvil') ? 'Local' : 'Mainnet')
    : ''

  const publicClient = useCallback(() => createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) }), [chain])
  const walletClient = useCallback(() => {
    if (!window.ethereum) throw new Error('No injected wallet (install MetaMask).')
    return createWalletClient({ chain, transport: custom(window.ethereum) })
  }, [chain])

  const showToast = useCallback((msg, href) => {
    setToast({ msg, href })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  const refresh = useCallback(async (acct) => {
    if (!cfg || !acct) return
    const pc = publicClient()
    const vault = cfg.contracts.vault
    const [symbol, vdec, asset, shares, nav, supply, maxWd] = await Promise.all([
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'symbol' }),
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'decimals' }),
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'asset' }),
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'balanceOf', args: [acct] }),
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'navUsdg' }),
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalSupply' }),
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'maxWithdraw', args: [acct] }),
    ])
    const [uDec, uSym, uBal, value] = await Promise.all([
      pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'decimals' }),
      pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'symbol' }),
      pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'balanceOf', args: [acct] }),
      pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [shares] }).catch(() => 0n),
    ])
    let plan = null
    if (cfg.contracts.autosave) {
      try {
        const p = await pc.readContract({ address: cfg.contracts.autosave, abi: AUTOSAVE_ABI, functionName: 'plans', args: [acct] })
        plan = { amountPerPeriod: p[0], period: p[1], nextExec: p[2], totalPeriods: p[3], periodsDone: p[4], active: p[5] }
      } catch { /* no plan */ }
    }
    setPos({ symbol, vdec, asset, shares, value, nav, supply, maxWd, uDec, uSym, uBal, plan })
  }, [cfg, publicClient])

  // Read the wallet's current chain once on load so we can warn on a mismatch
  // before the user even tries a transaction.
  useEffect(() => {
    window.ethereum?.request?.({ method: 'eth_chainId' })
      .then((h) => setWalletChainId(parseInt(h, 16)))
      .catch(() => {})
  }, [])

  // Keep the dApp in sync with the wallet: if the user switches account or network
  // in MetaMask, reflect it here instead of showing a stale connection.
  useEffect(() => {
    const eth = window.ethereum
    if (!eth?.on) return
    const onAccounts = (accts) => {
      const a = accts && accts[0] ? accts[0] : null
      setAccount(a)
      if (!a) setPos(null)
    }
    const onChain = (hexId) => setWalletChainId(parseInt(hexId, 16))
    eth.on('accountsChanged', onAccounts)
    eth.on('chainChanged', onChain)
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts)
      eth.removeListener?.('chainChanged', onChain)
    }
  }, [])

  // Refresh the position whenever the connected account (or config) changes.
  useEffect(() => {
    if (account && cfg) refresh(account)
  }, [account, cfg, refresh])

  // Point the wallet at the vault's chain. Adds it first if unknown (4902).
  const ensureChain = useCallback(async () => {
    if (!cfg || !window.ethereum) return
    const hexId = '0x' + cfg.chainId.toString(16)
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
    } catch (switchErr) {
      // 4902 = chain unknown to wallet → add it, which also selects it.
      if (switchErr?.code === 4902 && chain?.rpcUrls?.default?.http?.[0]) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexId,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorers: chain.blockExplorers ? [chain.blockExplorers.default] : undefined,
          }],
        })
      } else {
        throw switchErr
      }
    }
  }, [cfg, chain])

  async function connect() {
    setErr('')
    try {
      const [acct] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      try { await ensureChain() } catch { /* user can switch later via the banner */ }
      setAccount(acct)
      await refresh(acct)
    } catch (e) {
      setErr(e.message)
    }
  }

  async function tx(run, label) {
    setBusy(true)
    setErr('')
    setLastTx({ label, status: 'pending', hash: null })
    try {
      const hash = await run()
      setLastTx({ label, status: 'pending', hash })
      await publicClient().waitForTransactionReceipt({ hash })
      setLastTx({ label, status: 'done', hash })
      showToast(`${label} confirmed`, txUrl(hash))
      await refresh(account)
    } catch (e) {
      setErr((e.shortMessage || e.message || 'failed').slice(0, 200))
      setLastTx(null)
    } finally {
      setBusy(false)
    }
  }

  async function ensureAllowance(spender, amount) {
    const pc = publicClient()
    const allowance = await pc.readContract({ address: pos.asset, abi: ERC20_ABI, functionName: 'allowance', args: [account, spender] })
    if (allowance >= amount) return
    const wc = walletClient()
    const hash = await wc.writeContract({ account, chain, address: pos.asset, abi: ERC20_ABI, functionName: 'approve', args: [spender, MAX_UINT] })
    await pc.waitForTransactionReceipt({ hash })
  }

  function doDeposit() {
    const amount = parseUnits(depAmt || '0', pos.uDec)
    if (amount <= 0n) return
    tx(async () => {
      await ensureAllowance(cfg.contracts.vault, amount)
      return walletClient().writeContract({ account, chain, address: cfg.contracts.vault, abi: VAULT_ABI, functionName: 'deposit', args: [amount, account] })
    }, `Deposit ${depAmt} ${pos.uSym}`)
  }
  function doWithdraw() {
    const amount = parseUnits(wdAmt || '0', pos.uDec)
    if (amount <= 0n) return
    tx(() => walletClient().writeContract({ account, chain, address: cfg.contracts.vault, abi: VAULT_ABI, functionName: 'withdraw', args: [amount, account, account] }), `Withdraw ${wdAmt} ${pos.uSym}`)
  }
  function doRedeemInKind() {
    const shares = parseUnits(inkindShares || '0', pos.vdec)
    if (shares <= 0n) return
    tx(() => walletClient().writeContract({ account, chain, address: cfg.contracts.vault, abi: VAULT_ABI, functionName: 'redeemInKind', args: [shares, account] }), `Redeem ${inkindShares} ${pos.symbol}`)
  }
  function doCreatePlan() {
    const amount = parseUnits(saveAmt || '0', pos.uDec)
    const period = BigInt(Math.max(1, Math.round(Number(savePeriodDays) * 86400)))
    const total = Number(savePeriods) || 0
    if (amount <= 0n) return
    tx(async () => {
      await ensureAllowance(cfg.contracts.autosave, MAX_UINT)
      return walletClient().writeContract({ account, chain, address: cfg.contracts.autosave, abi: AUTOSAVE_ABI, functionName: 'createPlan', args: [amount, period, total] })
    }, `Start autosave`)
  }
  function doCancelPlan() {
    tx(() => walletClient().writeContract({ account, chain, address: cfg.contracts.autosave, abi: AUTOSAVE_ABI, functionName: 'cancelPlan', args: [] }), `Cancel autosave`)
  }
  // Testnet-only faucet: the deployed USDG is a mock with a permissionless mint,
  // so a tester can top up their own balance to try Deposit without a terminal.
  function doFaucet() {
    if (!pos) return
    const amount = parseUnits('1000', pos.uDec)
    tx(() => walletClient().writeContract({ account, chain, address: pos.asset, abi: ERC20_ABI, functionName: 'mint', args: [account, amount] }), `Mint 1,000 ${pos.uSym}`)
  }

  // ---- helpers ----
  const fmt = (v, d, p = 2) => (v == null ? '—' : Number(formatUnits(v, d)).toLocaleString(undefined, { maximumFractionDigits: p }))
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
  const contractRows = cfg ? CONTRACT_META.filter(([k]) => cfg.contracts[k]).map(([k, label]) => ({ key: k, label, addr: cfg.contracts[k] })) : []

  const uSym = pos?.uSym || 'USDG'
  const vSym = pos?.symbol || 'vVLRA'

  // per-tab field wiring (Deposit / Withdraw / Redeem share one field UI)
  let field = null
  if (tab === 'deposit') field = { token: uSym, dec: pos?.uDec, bal: pos?.uBal, balLabel: 'Balance', value: depAmt, set: setDepAmt, action: doDeposit, cta: 'Deposit', hint: null }
  else if (tab === 'withdraw') field = { token: uSym, dec: pos?.uDec, bal: pos?.maxWd, balLabel: 'Withdrawable', value: wdAmt, set: setWdAmt, action: doWithdraw, cta: 'Withdraw', hint: null }
  else if (tab === 'redeem') field = { token: vSym, dec: pos?.vdec, bal: pos?.shares, balLabel: 'Your shares', value: inkindShares, set: setInkindShares, action: doRedeemInKind, cta: 'Redeem', hint: 'You get a pro-rata slice of cash + every Stock Token.' }

  const amtValid = field && Number(field.value) > 0
  const wrongNet = !!account && walletChainId != null && !!cfg && walletChainId !== cfg.chainId
  // Faucet only makes sense on the mock-token networks (testnet / local anvil).
  const canFaucet = !!account && !!pos && !wrongNet && (cfg?.chainId === 46630 || cfg?.chainId === 31337)
  const actionDisabled = !account ? !cfg : wrongNet ? busy : (busy || !amtValid)
  const onAction = !account ? connect : wrongNet ? ensureChain : (field ? field.action : undefined)
  const actionLabel = !account ? 'Connect wallet' : wrongNet ? `Switch to ${chain?.name || 'the vault network'}` : busy ? 'Confirming…' : (field ? field.cta : '')

  return (
    <div className="vault-app">
      {/* ── floating header ── */}
      <header className="vfloat">
        <a className="vfloat-brand" href="/" title="Back to the Desk">
          <span className="logo" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 6 L16 27 L28 6 L22.6 6 L16 17.4 L9.4 6 Z" fill="#22242A"/><rect x="13.4" y="2.2" width="5.2" height="5.2" rx="0.4" transform="rotate(45 16 4.8)" fill="#22242A"/></svg></span>
          Aelix <span className="vfloat-chip">Vault</span>
        </a>
        <nav className="vfloat-nav">
          <a href="/">Desk</a>
          <a href={DOCS_URL}>Docs</a>
          {explorerBase && <a href={explorerBase} target="_blank" rel="noreferrer">Explorer ↗</a>}
        </nav>
        <span className="vfloat-spacer" />
        {cfg && <span className="vfloat-net"><span className="d" />{netShort}</span>}
        {account
          ? <span className="vfloat-acct"><span className="d" />{short(account)}</span>
          : <button className="vconnect" disabled={!cfg} onClick={connect}>Connect wallet</button>}
      </header>

      {/* ── centered action stage ── */}
      <main className="vstage">
        <div className="vhero">
          <div className="vhero-kicker"><span className="tick" aria-hidden="true" />ERC-4626 · ROBINHOOD CHAIN · TESTNET</div>
          <h1 className="vhero-title">The Vault</h1>
          <p className="vhero-sub">Deposit USDG. The desk trades inside on-chain guardrails — and you approve every move.</p>
        </div>
        {wrongNet && <div className="verr warn">Wrong network — your wallet is on chain {walletChainId}. Switch to <b>{chain?.name}</b> to deposit or trade.</div>}
        {err && !wrongNet && <div className="verr">{err}</div>}

        <div className="vcard">
          <div className="vtabs">
            {TABS.map(([k, label]) => (
              (k !== 'auto' || cfg?.contracts?.autosave) && (
                <button key={k} className={`vtab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
              )
            ))}
          </div>

          {tab !== 'auto' && field && (
            <>
              <div className="vfield">
                <div className="vfield-label">{tab === 'redeem' ? 'Redeem' : tab === 'withdraw' ? 'Withdraw' : 'Deposit'}</div>
                <div className="vfield-main">
                  <input
                    className="vfield-input" inputMode="decimal" placeholder="0"
                    value={field.value} disabled={!account}
                    onChange={(e) => field.set(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  <span className="vfield-token"><span className="tk">{field.token.replace(/^v/, '')[0]}</span>{field.token}</span>
                </div>
                <div className="vfield-bottom">
                  <span className="vfield-bal">{field.balLabel}: <b>{account ? fmt(field.bal, field.dec) : '—'}</b></span>
                  {account && pos && <button className="vfield-max" onClick={() => field.set(formatUnits(field.bal, field.dec))}>Max</button>}
                </div>
              </div>
              {field.hint && <div className="vhint">{field.hint}</div>}
              {tab === 'deposit' && canFaucet && (
                <button className="vfaucet" disabled={busy} onClick={doFaucet}>
                  {busy ? 'Confirming…' : `Get 1,000 test ${uSym} ↓`}
                </button>
              )}
              <button className="vaction" disabled={actionDisabled} onClick={onAction}>{actionLabel}</button>
            </>
          )}

          {tab === 'auto' && (
            <>
              {account && pos?.plan?.active ? (
                <>
                  <div className="vauto-active">
                    <b>{fmt(pos.plan.amountPerPeriod, pos.uDec)} {uSym}</b> every {(Number(pos.plan.period) / 86400).toFixed(0)}d
                    {' · '}done {String(pos.plan.periodsDone)}{Number(pos.plan.totalPeriods) ? `/${String(pos.plan.totalPeriods)}` : ' (∞)'}
                  </div>
                  <button className="vaction ghost" disabled={busy} onClick={doCancelPlan}>Cancel autosave</button>
                </>
              ) : (
                <>
                  <div className="vfield">
                    <div className="vfield-label">Auto-deposit each period</div>
                    <div className="vfield-main">
                      <input className="vfield-input" inputMode="decimal" placeholder="0" value={saveAmt} disabled={!account}
                        onChange={(e) => setSaveAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
                      <span className="vfield-token"><span className="tk">U</span>{uSym}</span>
                    </div>
                  </div>
                  <div className="vauto-row">
                    <div className="vauto-mini"><div className="k">Every N days</div><input inputMode="numeric" value={savePeriodDays} disabled={!account} onChange={(e) => setSavePeriodDays(e.target.value.replace(/[^0-9]/g, ''))} /></div>
                    <div className="vauto-mini"><div className="k"># periods (0=∞)</div><input inputMode="numeric" value={savePeriods} disabled={!account} onChange={(e) => setSavePeriods(e.target.value.replace(/[^0-9]/g, ''))} /></div>
                  </div>
                  <button className="vaction" disabled={!account ? !cfg : (busy || !(Number(saveAmt) > 0))} onClick={!account ? connect : doCreatePlan}>
                    {!account ? 'Connect wallet' : busy ? 'Confirming…' : 'Start saving'}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* under-card: position + last tx */}
        <div className="vunder">
          {account && pos && (
            <div className="vpos">
              <span><b>{fmt(pos.shares, pos.vdec)}</b> {vSym}</span>
              <span className="sep">·</span>
              <span className="dim">≈ {fmt(pos.value, pos.uDec)} {uSym}</span>
              <span className="sep">·</span>
              <span className="dim">NAV {fmt(pos.nav, pos.uDec)}</span>
            </div>
          )}
          {lastTx && (
            <div className="vtx">
              {lastTx.status === 'pending' ? <><span className="live" />Confirming {lastTx.label.toLowerCase()}…</> : <>✓ {lastTx.label} confirmed</>}
              {lastTx.hash && txUrl(lastTx.hash) && <a href={txUrl(lastTx.hash)} target="_blank" rel="noreferrer">view ↗</a>}
            </div>
          )}

          {cfg && contractRows.length > 0 && (
            <button className="vcontracts-toggle" onClick={() => setShowContracts((v) => !v)}>
              {contractRows.length} contracts on {netShort} {showContracts ? '▲' : '▾'}
            </button>
          )}
          {showContracts && (
            <div className="vclist">
              {contractRows.map((c) => (
                <div className="vcrow" key={c.key}>
                  <span className="n">{c.label}</span>
                  {addrUrl(c.addr)
                    ? <a href={addrUrl(c.addr)} target="_blank" rel="noreferrer">{short(c.addr)} ↗</a>
                    : <span className="mono">{short(c.addr)}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="vdisc">Testnet preview · not audited · not for US persons · not investment advice.</div>
        </div>
      </main>

      {toast && (
        <div className="vault-toast show">
          <span>✓ {toast.msg}</span>
          {toast.href && <a href={toast.href} target="_blank" rel="noreferrer">view ↗</a>}
        </div>
      )}
    </div>
  )
}
