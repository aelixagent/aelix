import { useEffect, useState, useCallback } from 'react'
import {
  AccountHeader, RiskPanel, Positions, Candidates,
  ProposedTrade, ActivityLog, InjectionAlerts, RunControls,
  Backtests, DecisionTimeline, Eyebrow, PreviewBadge,
  NetworkBadge, VaultPanel, GuardrailsOnChain, TrackRecord, ExecutorPanel, AutosavePanel,
  DeskRunGate, DashboardSkeleton, OnchainSkeleton, AgentChat
} from './components.jsx'
import { readOnchain } from './onchain.js'
import { DeskField } from './desk-field.jsx'

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
        data = await fetchJson(`${import.meta.env.BASE_URL}desk-state.json`)
      } catch {
        data = await fetchJson(`${import.meta.env.BASE_URL}desk-state.example.json`)
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
    return <DashboardSkeleton />
  }
  if (!state && error) {
    return (
      <div className="loading err">
        Could not load <code>desk-state.json</code> — {error}
        <div className="hint">The PM session writes it; a sample ships in <code>public/</code>.</div>
      </div>
    )
  }

  // "demo" = a snapshot with no real desk run in this env. Gate on the explicit session
  // value only ('demo' or 'no-run') — a live snapshot may still carry a _note, so keying
  // off _note alone would misclassify a real run as demo.
  const isDemo = false // state.session === 'demo' || state.session === 'no-run'
  const onchain = oc

  // On-chain read failures (per section) surfaced from the live reader, so a failed
  // contract read shows a signal instead of silently blanking the panel.
  const ocErr = live || {}

  // Prefer LIVE on-chain reads; fall back to whatever the snapshot carried.
  const vaultData = live?.vault || onchain?.vault
  // Guardrails are shown as "enforced ON-CHAIN" — so ONLY ever from a real live read.
  // Never fall back to the shipped sample caps (that would fake on-chain enforcement).
  const guardrailsData = live?.guardrails
  const livePositions = live?.positions
  const liveTrades = live?.trades
  const chainLive = !!live?.live // a real contract read actually succeeded

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
      <AccountHeader account={state.account} generatedAt={state.generatedAt} live={live?.vault} isDemo={isDemo} />

      {error && <div className="stale">⚠ Live refresh failed ({error}); showing last good state.</div>}

      <AgentChat />

      <DeskField
        nav={vaultData?.nav ?? state.account?.equity}
        positions={positions}
        guardrails={guardrailsData || []}
        isDemo={isDemo}
      />

      <main className="layout">
        <aside className="col-side">
          <RiskPanel caps={state.riskCaps} account={riskAccount} positions={positions} />
          {onchain && <ExecutorPanel executor={onchain.executor} />}
          {onchain && <AutosavePanel autosave={onchain.autosave} />}
          <ActivityLog orders={orders} />
          {ocErr.tradesError && <div className="oc-read-err">⚠ Live trade history read failed: {ocErr.tradesError}</div>}
          {!isDemo && state.decisionLog && <DecisionTimeline log={state.decisionLog} />}
        </aside>

        <div className="col-main">
          {onchain && (
            <div className="oc-band">
              <div className="oc-band-head">
                <Eyebrow>On-chain</Eyebrow>
                <div className="oc-band-tail">
                  {!chainLive && <PreviewBadge />}
                  <NetworkBadge network={onchain.network} live={chainLive} />
                </div>
              </div>
              {cfg && !live ? (
                <OnchainSkeleton />
              ) : (
                <>
                  <VaultPanel vault={vaultData} network={onchain.network} live={chainLive} />
                  {ocErr.vaultError && <div className="oc-read-err">⚠ Live vault read failed: {ocErr.vaultError}</div>}
                  <GuardrailsOnChain guardrails={guardrailsData} />
                  {ocErr.guardrailsError && <div className="oc-read-err">⚠ Live guardrails read failed: {ocErr.guardrailsError}</div>}
                  <TrackRecord trackRecord={onchain.trackRecord} live={chainLive} />
                </>
              )}
            </div>
          )}

          <div className="pos-head">
            <Eyebrow>{positionsLabel}</Eyebrow>
          </div>
          <Positions positions={positions} />

          {isDemo ? (
            <DeskRunGate chainLive={chainLive} />
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


      </main>

      <footer className="foot">Read-only · orders are approved in your Claude Code session.</footer>
    </div>
  )
}
