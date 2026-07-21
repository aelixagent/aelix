import { useState } from 'react'
import { usd, pct, num, signClass, timeAgo } from './format.js'

/* ---------- run trigger (button → desk-request.json, dev server only) ---------- */

export function RunControls() {
  const [tickers, setTickers] = useState('')
  const [copied, setCopied] = useState(false)

  const promptText = () => {
    const list = tickers.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    return list.length
      ? `Run the desk on ${list.join(', ')} — read-only, stop at the preview card.`
      : 'Run the desk: screen my watchlist for left-side value candidates — read-only, stop at the preview card.'
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText())
      setCopied(true)
      setTimeout(() => setCopied(false), 4000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="panel runbar">
      <div className="runbar-row">
        <input
          className="run-input"
          placeholder="tickers e.g. AAPL, NVDA  (blank = screen the watchlist)"
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
        />
        <button className="run-btn" onClick={copyPrompt}>⧉ Copy run prompt</button>
      </div>
      <div className="run-status">
        {copied
          ? <span className="pos">✓ Copied — paste it into your Claude Code session to run the desk.</span>
          : <span className="dim">The desk runs inside your Claude Code session (read-only — it stops at the preview card, never places orders). Copy this and paste it there:</span>}
        <div className="run-prompt-preview">{promptText()}</div>
      </div>
    </section>
  )
}

/* ---------- shared bits ---------- */

export function DecisionBadge({ decision }) {
  const map = {
    APPROVE: 'badge approve',
    'APPROVE-WITH-CHANGES': 'badge changes',
    VETO: 'badge veto',
    PENDING_APPROVAL: 'badge pending',
  }
  const label = (decision || '').replace(/_/g, ' ')
  return <span className={map[decision] || 'badge'}>{label || '—'}</span>
}

function ScoreChip({ value, label }) {
  // value -2..+2
  const cls = value > 0 ? 'chip pos' : value < 0 ? 'chip neg' : 'chip flat'
  const sign = value > 0 ? `+${value}` : `${value}`
  return (
    <span className={cls} title={`${label}: ${sign}`}>
      <em>{label}</em> {sign}
    </span>
  )
}

/* ---------- account header (command bar) ---------- */

export function AccountHeader({ account, generatedAt, live, isDemo }) {
  const a = account || {}
  // When there is no real desk run (demo file) but the chain IS live, show the REAL
  // on-chain vault figures in the header instead of sample brokerage numbers.
  const useLive = !!(isDemo && live)
  const connected = useLive ? true : !!a.connected
  const acctName = useLive ? 'Robinhood Chain · vault' : (a.name || 'Agentic account')
  const connLabel = useLive ? 'live on-chain' : (connected ? 'connected' : 'disconnected')
  return (
    <header className="topbar">
      <span className="topbar-glow" aria-hidden="true" />

      <div className="brand">
        <span className="logo" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 6 L16 27 L28 6 L22.6 6 L16 17.4 L9.4 6 Z" fill="#22242A"/><rect x="13.4" y="2.2" width="5.2" height="5.2" rx="0.4" transform="rotate(45 16 4.8)" fill="#22242A"/></svg></span>
        <div className="brand-meta">
          <div className="brand-title">Aelix</div>
          <div className="brand-sub" title={useLive ? 'Live read from Robinhood Chain' : (connected ? 'Live connection to the Agentic account' : 'Not connected')}>
            <span className={`dot ${connected ? 'on' : 'off'}`} />
            <span className="brand-acct">{acctName}</span>
            <span className="brand-conn">{connLabel}</span>
          </div>
        </div>
      </div>

      {useLive ? (
        <div className="topstats">
          <div className="stat stat-hero" title="On-chain vault net asset value">
            <div className="stat-label">Vault NAV</div>
            <div className="stat-value hero mono">{usd(live.nav)}</div>
          </div>
          <span className="stat-div" aria-hidden="true" />
          <Stat label="Share price" value={usd(live.sharePrice, 4)} mono />
          <Stat label="Cash" value={usd(live.cash)} mono />
          <Stat label="Total shares" value={num(live.totalShares)} mono />
          <Stat label="Utilization" value={`${live.utilizationPct ?? 0}%`} mono />
        </div>
      ) : (
        <div className="topstats">
          <div className="stat stat-hero" title="Total account equity">
            <div className="stat-label">Equity</div>
            <div className="stat-value hero mono">{usd(a.equity)}</div>
          </div>
          <span className="stat-div" aria-hidden="true" />
          <Stat label="Day P&L" value={`${usd(a.dayPnl)} (${pct(a.dayPnlPct)})`} cls={signClass(a.dayPnl)} mono />
          <Stat label="Buying power" value={usd(a.buyingPower)} mono />
          <Stat label="Cash" value={usd(a.cash)} mono />
          <Stat label="Positions" value={num(a.openPositions)} mono />
          <Stat label="Orders today" value={num(a.ordersToday)} mono />
        </div>
      )}

      <a className="vault-link" href="/vault.html" title="Open the investor vault dApp">Open Vault ↗</a>

      <div className="asof" title={generatedAt || ''}>
        <span className="asof-k">{useLive ? 'live' : 'as of'}</span>
        <span className="asof-v">{useLive ? 'now' : timeAgo(generatedAt)}</span>
      </div>
    </header>
  )
}

/// Honest empty-state for the brokerage/AI-desk sections when no real desk run exists in
/// this environment. Shown INSTEAD of sample data so the dashboard never fakes a run.
export function DeskRunGate() {
  return (
    <section className="panel gate">
      <h2>AI desk · not run here yet</h2>
      <p className="gate-lead">
        Candidates, risk verdicts, the proposed trade and account P&L come from a live desk
        cycle against the Robinhood Agentic (brokerage) account. That needs the{' '}
        <code>robinhood-trading</code> MCP server connected — the on-chain vault below is already live.
      </p>
      <ol className="gate-steps">
        <li>Connect <code>robinhood-trading</code> MCP + set <code>RH_AGENTIC_ACCOUNT_NUMBER</code>.</li>
        <li>Run a desk cycle in the session (analysts → risk manager → preview).</li>
        <li>It writes <code>ui/public/desk-state.json</code>; these panels populate for real.</li>
      </ol>
      <div className="oc-cap">No sample data shown — this stays empty until a real run.</div>
    </section>
  )
}

function Stat({ label, value, cls = '', mono = false }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${mono ? 'mono' : ''} ${cls}`}>{value}</div>
    </div>
  )
}

/* ---------- mono micro-index eyebrow (explanatory spine) ---------- */

export function Eyebrow({ index, children }) {
  return (
    <span className="eyebrow">
      {index != null && <span className="eyebrow-idx">{index}</span>}
      {index != null && <span className="eyebrow-dash">—</span>}
      <span className="eyebrow-label">{children}</span>
    </span>
  )
}

/* ---------- inline-SVG ring gauge (0–100, green arc) ---------- */

export function RingGauge({ value, max = 100, size = 92, stroke = 8, label }) {
  const v = value == null || Number.isNaN(value) ? null : Math.max(0, Math.min(max, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = v == null ? 0 : v / max
  const cx = size / 2
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label ? `${label}: ${v ?? '—'} of ${max}` : undefined}>
        <circle className="ring-track" cx={cx} cy={cx} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-num">{v ?? '—'}</span>
        {label && <span className="ring-label">{label}</span>}
      </div>
    </div>
  )
}

/* ---------- risk caps panel ---------- */

export function RiskPanel({ caps, account, positions }) {
  if (!caps) return null
  const equity = account?.equity || 0
  const maxWeight = Math.max(0, ...(positions || []).map((p) => p.weightPct || 0))
  const cashPct = equity ? ((account?.cash || 0) / equity) * 100 : 0

  const rows = [
    { label: 'Per-trade cap', limit: `${caps.perTradePct}%`, bar: null },
    { label: 'Top position concentration', used: maxWeight, limit: caps.maxConcentrationPct, unit: '%' },
    { label: 'Open positions', used: account?.openPositions || 0, limit: caps.maxOpenPositions, unit: '' },
    { label: 'Orders today', used: account?.ordersToday || 0, limit: caps.maxDailyOrders, unit: '' },
    { label: 'Cash buffer (min)', used: cashPct, limit: caps.cashBufferPct, unit: '%', invert: true },
    { label: 'Day loss halt', used: Math.max(0, -(account?.dayPnlPct || 0)), limit: caps.dailyLossHaltPct, unit: '%' },
  ]

  return (
    <section className="panel">
      <h2>Risk Limits</h2>
      <div className="risk-rows">
        {rows.map((r) => {
          if (r.bar === null) {
            return (
              <div className="risk-row" key={r.label}>
                <span className="risk-name">{r.label}</span>
                <span className="risk-num">{r.limit}</span>
              </div>
            )
          }
          const ratio = r.limit ? Math.min(1, r.used / r.limit) : 0
          // for cash buffer (invert), being BELOW the limit is the breach
          const breach = r.invert ? r.used < r.limit : r.used >= r.limit
          const warn = !breach && ratio >= 0.8
          return (
            <div className="risk-row" key={r.label}>
              <span className="risk-name">{r.label}</span>
              <div className="meter">
                <div
                  className={`meter-fill ${breach ? 'breach' : warn ? 'warn' : 'ok'}`}
                  style={{ width: `${Math.max(4, ratio * 100)}%` }}
                />
              </div>
              <span className={`risk-num ${breach ? 'neg' : ''}`}>
                {r.unit === '%' ? `${r.used.toFixed(1)}/${r.limit}%` : `${r.used}/${r.limit}`}
              </span>
            </div>
          )
        })}
      </div>
      <div className="risk-foot">No averaging into losers · stop-loss required on every entry</div>
    </section>
  )
}

/* ---------- positions ---------- */

export function Positions({ positions }) {
  return (
    <section className="panel">
      <h2>Positions <span className="count">{positions?.length || 0}</span></h2>
      <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th><th className="r">Qty</th><th className="r">Avg</th>
            <th className="r">Last</th><th className="r">Value</th>
            <th className="r">P&L</th><th className="r">Weight</th><th className="r">Stop</th>
          </tr>
        </thead>
        <tbody>
          {(positions || []).map((p) => (
            <tr key={p.symbol}>
              <td className="sym">{p.symbol}</td>
              <td className="r">{num(p.qty)}</td>
              <td className="r mono">{usd(p.avgCost)}</td>
              <td className="r mono">{usd(p.last)}</td>
              <td className="r mono">{usd(p.value)}</td>
              <td className={`r mono ${signClass(p.pnl)}`}>{usd(p.pnl)} <small>({pct(p.pnlPct)})</small></td>
              <td className="r mono">{p.weightPct?.toFixed(1)}%</td>
              <td className="r mono dim">{usd(p.stop)}</td>
            </tr>
          ))}
          {(!positions || positions.length === 0) && (
            <tr><td colSpan="8" className="empty">No open positions</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </section>
  )
}

/* ---------- candidates / desk analysis ---------- */

export function Candidates({ candidates }) {
  return (
    <section className="panel">
      <h2>Desk Analysis <span className="count">{candidates?.length || 0}</span></h2>
      <div className="cards">
        {(candidates || []).map((c) => (
          <article className="cand" key={c.symbol}>
            <div className="cand-head">
              <span className="sym lg">{c.symbol}</span>
              <span className="tag">{c.strategy}</span>
              <DecisionBadge decision={c.risk?.decision} />
            </div>

            <div className="verdicts">
              <Verdict role="Fundamental" score={c.fundamental?.score} conf={c.fundamental?.confidence} note={c.fundamental?.note} />
              <Verdict role="Technical" score={c.technical?.signal} conf={c.technical?.confidence} note={c.technical?.note} />
              <Verdict role="Macro/News" sentiment={c.macro?.sentiment} conf={null} note={c.macro?.note} injection={c.macro?.injection} />
            </div>

            {c.technical?.entry != null && (
              <div className="levels">
                <span>entry <b>{usd(c.technical.entry)}</b></span>
                <span>stop <b>{usd(c.technical.stop)}</b></span>
                <span>sup {usd(c.technical.support)}</span>
                <span>res {usd(c.technical.resistance)}</span>
              </div>
            )}

            <div className="risk-note">
              <b>Risk:</b> {c.risk?.note}
            </div>
          </article>
        ))}
        {(!candidates || candidates.length === 0) && <div className="empty">No candidates analyzed yet</div>}
      </div>
    </section>
  )
}

function Verdict({ role, score, sentiment, conf, note, injection }) {
  let chip
  if (sentiment != null) {
    const cls = sentiment === 'positive' ? 'pos' : sentiment === 'negative' ? 'neg' : 'flat'
    chip = <span className={`chip ${cls}`}><em>{role}</em> {sentiment}</span>
  } else {
    const cls = score > 0 ? 'pos' : score < 0 ? 'neg' : 'flat'
    const s = score > 0 ? `+${score}` : `${score}`
    chip = <span className={`chip ${cls}`}><em>{role}</em> {s}</span>
  }
  return (
    <div className="verdict" title={note}>
      {chip}
      {conf && <span className="conf">{conf}</span>}
      {injection && injection !== 'none' && <span className="chip neg" title="prompt-injection flag">⚠ inj</span>}
      <p className="vnote">{note}</p>
    </div>
  )
}

/* ---------- proposed trade / preview card ---------- */

export function ProposedTrade({ trade }) {
  if (!trade) {
    return (
      <section className="panel preview empty-preview">
        <h2>Order Preview</h2>
        <div className="empty">No trade proposed. Ask the PM to run the desk.</div>
      </section>
    )
  }
  const t = trade
  return (
    <section className="panel preview">
      <h2>Order Preview <DecisionBadge decision={t.status} /></h2>
      <div className="preview-line">
        <span className={`side ${t.side}`}>{t.side?.toUpperCase()}</span>
        <span className="sym lg">{t.symbol}</span>
        <span className="qty">{num(t.qty)} sh</span>
        <span className="otype">{t.orderType}{t.limitPrice ? ` @ ${usd(t.limitPrice)}` : ''}</span>
      </div>

      <div className="preview-grid">
        <Cell k="Est. cost" v={usd(t.estCost)} />
        <Cell k="Weight after" v={`${t.weightAfterPct?.toFixed(1)}%`} />
        <Cell k="Stop" v={`${usd(t.stop)} (${pct(t.stopPct)})`} />
        <Cell k="Strategy" v={t.strategy} />
        <Cell k="Risk" v={<DecisionBadge decision={t.riskDecision} />} />
      </div>

      <p className="rationale">{t.rationale}</p>

      <div className="approve-bar">
        <div className="approve-note">
          ⏸ Approval happens in the Claude Code session — the desk never auto-places orders.
        </div>
        <div className="approve-btns">
          <button className="btn ghost" disabled>Reject</button>
          <button className="btn primary" disabled>Approve in session →</button>
        </div>
      </div>
    </section>
  )
}

function Cell({ k, v }) {
  return (
    <div className="cell">
      <div className="cell-k">{k}</div>
      <div className="cell-v">{v}</div>
    </div>
  )
}

function MiniStat({ k, v }) {
  return (
    <div className="mini-stat">
      <span className="mini-stat-k">{k}</span>
      <span className="mini-stat-v mono">{v}</span>
    </div>
  )
}

/* ---------- activity + injection ---------- */

export function ActivityLog({ orders }) {
  return (
    <section className="panel">
      <h2>Recent Orders</h2>
      <ul className="log">
        {(orders || []).map((o, i) => (
          <li key={i}>
            <span className={`side ${o.side}`}>{o.side}</span>
            <span className="sym">{o.symbol}</span>
            <span className="mono">{num(o.qty)} @ {usd(o.price)}</span>
            <span className={`ostatus ${o.status}`}>{o.status}</span>
            <span className="dim">{timeAgo(o.time)}</span>
          </li>
        ))}
        {(!orders || orders.length === 0) && <li className="empty">No orders yet</li>}
      </ul>
    </section>
  )
}

export function InjectionAlerts({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <section className="panel alert">
      <h2>⚠ Prompt-Injection Alerts <span className="count">{alerts.length}</span></h2>
      {alerts.map((a, i) => (
        <div className="inj" key={i}>
          <div className="inj-quote">“{a.quote}”</div>
          <div className="inj-meta">
            <span className="dim">{a.source}</span> · handled by {a.handledBy} · <b>{a.action}</b>
          </div>
        </div>
      ))}
    </section>
  )
}

/* ---------- sparkline (dependency-free inline SVG) ---------- */

export function Sparkline({ values, baseline, width = 120, height = 32 }) {
  const vals = (values || []).filter((n) => n != null && !Number.isNaN(n))
  if (vals.length < 2) return null
  const base = (baseline || []).filter((n) => n != null && !Number.isNaN(n))
  const pad = 2
  const all = base.length ? vals.concat(base) : vals
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const xAt = (i, len) => pad + (i / (len - 1)) * (width - pad * 2)
  const yAt = (v) => height - pad - ((v - min) / span) * (height - pad * 2)
  const toPath = (arr) =>
    arr.map((v, i) => `${i ? 'L' : 'M'}${xAt(i, arr.length).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ')
  // green when the series ends at or above where it started, else red
  const up = vals[vals.length - 1] >= vals[0]
  return (
    <svg
      className={`sparkline ${up ? 'pos' : 'neg'}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      {base.length > 1 && <path className="spark-baseline" d={toPath(base)} fill="none" />}
      <path className="spark-line" d={toPath(vals)} fill="none" />
    </svg>
  )
}

/* ---------- strategy backtests ---------- */

function BtMetric({ k, v, cls = '', sub }) {
  return (
    <div className="bt-metric">
      <div className="bt-metric-k">{k}</div>
      <div className={`bt-metric-v ${cls}`}>{v}</div>
      {sub != null && <div className="bt-metric-sub">{sub}</div>}
    </div>
  )
}

export function Backtests({ backtests }) {
  if (!backtests || backtests.length === 0) return null
  return (
    <section className="panel">
      <h2>Strategy Backtests <span className="count">{backtests.length}</span></h2>
      <div className="bt-cards">
        {(backtests || []).map((b, i) => {
          const m = b.metrics || {}
          const beat = (m.totalReturnPct ?? 0) - (m.buyHoldReturnPct ?? 0)
          const pf = m.profitFactor
          return (
            <article className="bt-card" key={`${b.strategy}-${b.symbol}-${i}`}>
              <div className="bt-head">
                <span className="tag">{b.strategy}</span>
                <span className="sym">{b.symbol}</span>
                <span className="bt-period dim">
                  {b.period?.from} → {b.period?.to}
                  {b.period?.bars != null && <> · {num(b.period.bars)} bars</>}
                </span>
                <Sparkline values={b.equitySpark} baseline={b.buyHoldSpark} />
              </div>
              <div className="bt-metrics">
                <BtMetric
                  k="Total return"
                  v={pct(m.totalReturnPct)}
                  cls={signClass(m.totalReturnPct)}
                  sub={`vs B&H ${pct(m.buyHoldReturnPct)} (${beat >= 0 ? '+' : ''}${beat.toFixed(1)})`}
                />
                <BtMetric k="Win rate" v={m.winRatePct != null ? `${num(m.winRatePct)}%` : '—'} sub={`${num(m.trades)} trades`} />
                <BtMetric k="Profit factor" v={num(pf)} cls={pf != null ? (pf >= 1 ? 'pos' : 'neg') : ''} />
                <BtMetric k="Max drawdown" v={pct(m.maxDrawdownPct)} cls={signClass(m.maxDrawdownPct)} />
                <BtMetric k="Sharpe" v={num(m.sharpe)} cls={signClass(m.sharpe)} />
                <BtMetric k="Exposure" v={m.exposurePct != null ? `${num(m.exposurePct)}%` : '—'} sub={m.avgHoldDays != null ? `${num(m.avgHoldDays)}d avg hold` : null} />
              </div>
              <div className="bt-cap">Illustrative backtest — not a track record.</div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

/* ---------- decision timeline ---------- */

export function DecisionTimeline({ log }) {
  if (!log || log.length === 0) return null
  const tones = { pos: 'pos', neg: 'neg', flat: 'flat', warn: 'warn' }
  return (
    <section className="panel">
      <h2>Decision Log <span className="count">{log.length}</span></h2>
      <ul className="timeline">
        {(log || []).map((d, i) => {
          const tone = tones[d.tone] || 'flat'
          return (
            <li className={`tl-item tone-${tone}`} key={i}>
              <div className="tl-top">
                <span className={`badge tone-${tone}`}>{(d.event || '—').replace(/_/g, ' ')}</span>
                <span className="tl-time dim">{timeAgo(d.ts)}</span>
              </div>
              <div className="tl-body">
                {d.symbol && <span className="chip flat tl-sym">{d.symbol}</span>}
                <span className="tl-summary">{d.summary}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ---------- on-chain layer (Robinhood Chain · testnet preview) ---------- */

// Muted, dashed "preview / not-yet-deployed" marker reused across on-chain panels.
export function PreviewBadge({ label = 'TESTNET · PREVIEW' }) {
  return <span className="preview-badge" title="Not yet deployed — illustrative preview">{label}</span>
}

export function NetworkBadge({ network }) {
  if (!network) return null
  const n = network
  return (
    <span className="net-badge" title={`chain-id ${n.chainId ?? '—'}`}>
      <span className={`net-dot ${n.deployed ? 'on' : 'off'}`} />
      <span className="net-name">{n.name || 'Robinhood Chain'}</span>
      <span className="net-state">{n.deployed ? 'TESTNET' : 'TESTNET · PREVIEW'}</span>
      {!n.deployed && <span className="net-sub dim">not yet deployed</span>}
    </span>
  )
}

export function VaultPanel({ vault, network }) {
  if (!vault) return null
  const v = vault
  const util = Math.max(0, Math.min(100, v.utilizationPct ?? 0))
  return (
    <section className="panel">
      <h2>
        RWA Vault <span className="tag">{v.symbol || 'vVLRA'}</span>
        <PreviewBadge />
      </h2>

      <div className="vault-hero">
        <div className="vault-nav">
          <div className="vault-nav-k">Net asset value</div>
          <div className="vault-nav-v mono">{usd(v.nav)}</div>
          <div className="vault-nav-sub mono dim">
            {usd(v.sharePrice, 4)}<span className="dim"> / share</span>
          </div>
        </div>
        <div className="vault-mini">
          <MiniStat k="Total assets" v={usd(v.totalAssets)} />
          <MiniStat k="Total shares" v={num(v.totalShares)} />
          <MiniStat k="Your shares" v={num(v.yourShares)} />
          <MiniStat k="Your value" v={usd(v.yourValue)} />
        </div>
      </div>

      <div className="oc-meter-row">
        <span className="oc-meter-label dim">Utilization</span>
        <div className="meter" title={`Vault utilization ${util}%`}>
          <div className={`meter-fill ${util >= 80 ? 'warn' : 'ok'}`} style={{ width: `${Math.max(4, util)}%` }} />
        </div>
        <span className="risk-num">{util}%</span>
      </div>
      <div className="oc-cap">
        ERC-4626 vault wired to the on-chain Guardrails · APY {v.apyPct == null ? '— pending' : pct(v.apyPct)}
        {v.live ? ' · live read from Robinhood Chain' : ' · preview / illustrative — not a live balance.'}
      </div>
      {network && !network.deployed && (
        <div className="oc-cap dim">Contract address: — pending deploy</div>
      )}
    </section>
  )
}

export function GuardrailsOnChain({ guardrails }) {
  if (!guardrails || guardrails.length === 0) return null
  return (
    <section className="panel">
      <h2>Guardrails-as-Code <span className="count">{guardrails.length}</span><PreviewBadge /></h2>
      <div className="oc-rails">
        {guardrails.map((g) => (
          <div className="oc-rail" key={g.key}>
            <span className="oc-rail-name">
              <span className={`rail-tick ${g.enforced ? 'on' : 'off'}`} aria-hidden="true">
                {g.enforced ? '✓' : '·'}
              </span>
              {g.label}
            </span>
            <span className="oc-rail-val mono">{g.value}</span>
            <span className={`oc-enforced ${g.enforced ? 'on' : 'off'}`}>
              {g.enforced ? 'enforced on-chain' : 'off-chain'}
            </span>
          </div>
        ))}
      </div>
      <div className="oc-cap">Compiled from strategies/ into the on-chain Guardrails library (testnet).</div>
    </section>
  )
}

export function TrackRecord({ trackRecord }) {
  if (!trackRecord) return null
  const t = trackRecord
  const la = t.lastAttestation || {}
  return (
    <section className="panel">
      <h2>Proof-of-Track-Record <PreviewBadge /></h2>
      <div className="oc-perf">
        <RingGauge value={t.perfScore} max={100} label="PerfScore" />
        <div className="oc-perf-stats">
          <Cell k="Attestations" v={num(t.attestations)} />
          <Cell k="Verified P&L" v={t.verifiedPnlPct == null ? '— pending' : pct(t.verifiedPnlPct)} />
        </div>
      </div>
      <div className="oc-attest">
        <span className="dim">Last attestation</span>
        <span className="oc-attest-sum">{la.summary || '—'}</span>
        <span className="oc-attest-meta dim">
          {timeAgo(la.ts)} · tx {la.txHash ? <span className="mono">{la.txHash}</span> : '— pending'}
        </span>
      </div>
      <div className="oc-cap">Verifiable attestations — illustrative until deployed. Not a track record.</div>
    </section>
  )
}

export function ExecutorPanel({ executor }) {
  if (!executor) return null
  const e = executor
  return (
    <section className="panel">
      <h2>Agent Executor <PreviewBadge /></h2>
      <div className="oc-exec-head">
        <span className="chip flat">{e.type || 'Scoped session key (EOA)'}</span>
        <span className={`badge ${e.status === 'active' ? 'approve' : 'pending'}`}>{e.status || 'preview'}</span>
      </div>
      <div className="oc-rows">
        <div className="oc-row">
          <span className="dim">Scope</span>
          <span className="oc-row-v">{e.scope || 'guardrail-bounded swaps · approval-gated'}</span>
        </div>
        <div className="oc-row">
          <span className="dim">Daily cap</span>
          <span className="oc-row-v mono">{e.dailyCapPct != null ? `${e.dailyCapPct}%` : '—'}</span>
        </div>
        <div className="oc-row">
          <span className="dim">Session key</span>
          <span className="oc-row-v mono">{e.sessionKey || 'no active session key'}</span>
        </div>
        <div className="oc-row">
          <span className="dim">Last action</span>
          <span className="oc-row-v">{e.lastAction || '—'}</span>
        </div>
      </div>
      <div className="oc-cap warn-cap">
        ⏸ Guardrail-bounded + approval-gated — the desk proposes, the session key cannot exceed the
        Guardrails, and every order is still approved by you in-session. Never autonomous.
      </div>
    </section>
  )
}

export function AutosavePanel({ autosave }) {
  if (!autosave) return null
  const a = autosave
  return (
    <section className="panel">
      <h2>Autosave / DCA <PreviewBadge /></h2>
      <div className="oc-exec-head">
        <span className={`badge ${a.enabled ? 'approve' : 'pending'}`}>{a.enabled ? 'enabled' : 'off'}</span>
      </div>
      <div className="oc-rows">
        <div className="oc-row">
          <span className="dim">Cadence</span>
          <span className="oc-row-v">{a.cadence || '—'}</span>
        </div>
        <div className="oc-row">
          <span className="dim">Amount</span>
          <span className="oc-row-v mono">{a.amount != null ? `${usd(a.amount)} ${a.asset || ''}`.trim() : '—'}</span>
        </div>
        <div className="oc-row">
          <span className="dim">Next run</span>
          <span className="oc-row-v">{a.enabled && a.nextRun ? timeAgo(a.nextRun) : '—'}</span>
        </div>
      </div>
      <div className="oc-cap">Optional recurring deposits / dollar-cost-averaging on the vault — preview.</div>
    </section>
  )
}
