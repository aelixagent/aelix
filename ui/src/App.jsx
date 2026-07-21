import { useEffect, useState, useCallback } from 'react'
import {
  AccountHeader, RiskPanel, Positions, Candidates,
  ProposedTrade, ActivityLog, InjectionAlerts, RunControls,
  Backtests, DecisionTimeline, Eyebrow, PreviewBadge,
  NetworkBadge, VaultPanel, GuardrailsOnChain, TrackRecord, ExecutorPanel, AutosavePanel,
  DeskRunGate,
} from './components.jsx'
import { readOnchain } from './onchain.js'

const POLL_MS = 5000
const CHAIN_POLL_MS = 15000

export default function App() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [lastLoad, setLastLoad] = useState(null)
  const [live, setLive] = useState(null) // live on-chain reads

  const load = useCallback(async () => {
    const fetchJson = async (path) => {
      const res = await fetch(`${path}?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }
    try {
      // live snapshot written by the PM (gitignored); fall back to the shipped sample
      let data
      try {
        data = await fetchJson('/desk-state.json')
      } catch {
        data = await fetchJson('/desk-state.example.json')
      }
      setState(data)
      setError(null)
      setLastLoad(new Date())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // Read the REAL contracts whenever we have a deployed on-chain config. This is what
  // makes the on-chain band + positions + activity live rather than sample data.
  const oc = state?.onchain
  const cfg = oc?.network?.chainId && oc?.contracts?.vault
    ? { chainId: oc.network.chainId, contracts: oc.contracts }
    : null

  useEffect(() => {
    if (!cfg) return
    let alive = true
    const run = () => readOnchain(cfg).then((r) => { if (alive) setLive(r) }).catch(() => {})
    run()
    const id = setInterval(run, CHAIN_POLL_MS)
    return () => { alive = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.chainId, cfg?.contracts?.vault])

  if (!state && !error) {
    return <div className="loading">Loading desk state…</div>
  }
  if (!state && error) {
    return (
      <div className="loading err">
        Could not load <code>desk-state.json</code> — {error}
        <div className="hint">The PM session writes it; a sample ships in <code>public/</code>.</div>
      </div>
    )
  }

  // "demo" = the sample file that ships in the repo, i.e. no real desk run in this env.
  const isDemo = state.session === 'demo' || state._note != null
  const onchain = oc

  // Prefer LIVE on-chain reads; fall back to whatever the snapshot carried.
  const vaultData = live?.vault || onchain?.vault
  const guardrailsData = live?.guardrails || onchain?.guardrails
  const livePositions = live?.positions
  const liveTrades = live?.trades

  // On-chain vault holdings are real; brokerage positions/orders are demo-only. When this
  // is the sample file, NEVER show the demo book — show the live on-chain holdings (empty
  // until the desk buys) so nothing is faked.
  const positions = isDemo ? (livePositions || []) : state.positions
  const orders = isDemo ? (liveTrades || []) : state.recentOrders
  const positionsLabel = isDemo ? 'Vault holdings · on-chain' : 'Positions'

  // When gated (demo), feed the Risk panel REAL on-chain usage instead of sample equity.
  const riskAccount = isDemo && vaultData
    ? {
        equity: vaultData.nav, cash: vaultData.cash,
        openPositions: vaultData.openPositions ?? positions.length,
        ordersToday: vaultData.ordersToday ?? 0, dayPnlPct: 0,
      }
    : state.account

  return (
    <div className="app">
      <AccountHeader account={state.account} generatedAt={state.generatedAt} live={vaultData} isDemo={isDemo} />

      {error && <div className="stale">⚠ Live refresh failed ({error}); showing last good state.</div>}
      {isDemo && (
        <div className="live-note">
          <b>On-chain data is live</b> from Robinhood Chain. The AI-desk sections need the
          {' '}<code>robinhood-trading</code> broker (MCP) — they stay empty until a real run, not faked.
        </div>
      )}

      <div className="section-lead">
        <Eyebrow index="01">{isDemo ? 'On-chain · live mirror' : 'The desk · read-only mirror'}</Eyebrow>
        <span className="section-lead-rule" aria-hidden="true" />
      </div>

      <main className="layout">
        <div className="col-main">
          {onchain && (
            <div className="oc-band">
              <div className="oc-band-head">
                <Eyebrow index="02">On-chain · Robinhood Chain{live ? ' · live' : ''}</Eyebrow>
                <div className="oc-band-tail">
                  <PreviewBadge />
                  <NetworkBadge network={onchain.network} />
                </div>
              </div>
              <VaultPanel vault={vaultData} network={onchain.network} />
              <GuardrailsOnChain guardrails={guardrailsData} />
              <TrackRecord trackRecord={onchain.trackRecord} />
            </div>
          )}

          <div className="pos-head">
            <Eyebrow index="03">{positionsLabel}</Eyebrow>
          </div>
          <Positions positions={positions} />

          {isDemo ? (
            <DeskRunGate />
          ) : (
            <>
              <RunControls />
              <ProposedTrade trade={state.proposedTrade} />
              {state.backtests && <Backtests backtests={state.backtests} />}
              <Candidates candidates={state.candidates} />
              <InjectionAlerts alerts={state.injectionAlerts} />
            </>
          )}
        </div>

        <aside className="col-side">
          <RiskPanel caps={state.riskCaps} account={riskAccount} positions={positions} />
          {onchain && <ExecutorPanel executor={onchain.executor} />}
          {onchain && <AutosavePanel autosave={onchain.autosave} />}
          <ActivityLog orders={orders} />
          {!isDemo && state.decisionLog && <DecisionTimeline log={state.decisionLog} />}
        </aside>
      </main>

      <footer className="foot">
        {live ? 'Live on-chain mirror' : 'Read-only mirror of the desk'} · refreshes every {POLL_MS / 1000}s ·
        last {lastLoad?.toLocaleTimeString() || '—'}
        {' · '}orders are approved & placed only in the Claude Code session
      </footer>
    </div>
  )
}
