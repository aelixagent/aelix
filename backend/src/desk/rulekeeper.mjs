// rulekeeper.mjs — the core product. A DETERMINISTIC risk sentinel that checks a
// trade the USER wants to make against the USER'S OWN written caps, and returns
// APPROVE / APPROVE-WITH-CHANGES / VETO with explicit, checkable math.
//
// It never recommends a trade of its own — it only guards the user's intent
// against the user's rules. That "anti-advice" posture is deliberate (see
// backend/README "Why this is not a robo-adviser").

const round2 = (n) => Math.round(n * 100) / 100

/**
 * @param {object} p
 * @param {object} p.caps      the user's rule caps (see rules.mjs)
 * @param {object} p.account   { equity (NAV), cash, ordersToday }
 * @param {array}  p.positions current positions [{ symbol, qty, avgCost, last, value }]
 * @param {object} p.trade     { symbol, side:'buy'|'sell', qty, price, stop? }
 * @returns {{ decision, reasons[], checks[], suggestedQty, sizing }}
 */
export function evaluateTrade({ caps, account, positions = [], trade }) {
  const reasons = []
  const checks = []
  let veto = false
  let changes = false

  const nav = Number(account?.equity || 0)
  const price = Number(trade?.price || 0)
  const qty = Number(trade?.qty || 0)
  const side = trade?.side
  const symbol = trade?.symbol

  const record = (name, ok, detail, { blocking = true } = {}) => {
    checks.push({ name, ok, detail })
    if (!ok) {
      reasons.push(detail)
      if (blocking) veto = true
      else changes = true
    }
  }

  // 0. Sanity / funded account
  if (!symbol || !side || !(qty > 0) || !(price > 0)) {
    return {
      decision: 'VETO',
      reasons: ['Incomplete trade: need symbol, side, qty > 0, and a live price.'],
      checks: [],
      suggestedQty: 0,
      sizing: null,
    }
  }
  if (!(nav > 0)) {
    return {
      decision: 'VETO',
      reasons: ['Account NAV is $0 / unfunded — no allowance to trade against.'],
      checks: [],
      suggestedQty: 0,
      sizing: null,
    }
  }

  const notional = qty * price
  const existing = positions.find((p) => p.symbol === symbol) || null
  const existingValue = existing ? Number(existing.value || existing.qty * existing.last || 0) : 0

  if (side === 'buy') {
    // 1. Per-trade cap
    const perTradeCap = (caps.perTradePct / 100) * nav
    record(
      'per-trade cap',
      notional <= perTradeCap,
      `Order $${round2(notional)} vs per-trade cap $${round2(perTradeCap)} (${caps.perTradePct}% of NAV).`,
      { blocking: false }, // oversize is fixable by cutting qty
    )

    // 2. Concentration cap (post-trade weight of this symbol)
    const concCap = (caps.maxConcentrationPct / 100) * nav
    const postValue = existingValue + notional
    record(
      'concentration cap',
      postValue <= concCap,
      `Post-trade ${symbol} weight $${round2(postValue)} vs concentration cap $${round2(concCap)} (${caps.maxConcentrationPct}%).`,
      { blocking: false },
    )

    // 3. Max open positions (only if this opens a NEW symbol)
    if (!existing) {
      const openCount = positions.length
      record(
        'max open positions',
        openCount + 1 <= caps.maxOpenPositions,
        `Opening ${symbol} → ${openCount + 1} positions vs max ${caps.maxOpenPositions}.`,
      )
    }

    // 4. Cash buffer (must keep >= buffer after buying)
    const cash = Number(account.cash || 0)
    const minCash = (caps.cashBufferPct / 100) * nav
    record(
      'cash buffer',
      cash - notional >= minCash,
      `Cash after buy $${round2(cash - notional)} vs required buffer $${round2(minCash)} (${caps.cashBufferPct}%).`,
      { blocking: false },
    )

    // 5. Stop-loss defined + not looser than the cap
    if (trade.stop == null) {
      record('stop-loss defined', false, 'No stop-loss provided — every entry must define one.')
    } else {
      const maxStop = price * (1 - caps.stopLossPct / 100)
      record(
        'stop-loss distance',
        Number(trade.stop) >= maxStop - 1e-9,
        `Stop $${round2(trade.stop)} is looser than the ${caps.stopLossPct}% cap (min $${round2(maxStop)}).`,
        { blocking: false },
      )
    }

    // 6. No averaging into a loser
    if (caps.noAveragingIntoLosers && existing) {
      const underwater = Number(existing.last) < Number(existing.avgCost)
      record(
        'no averaging into losers',
        !underwater,
        `${symbol} is underwater (last $${existing.last} < avg $${existing.avgCost}); adding is blocked by your rule.`,
      )
    }
  } else if (side === 'sell') {
    // Selling reduces risk — only sanity-check you hold enough.
    const held = existing ? Number(existing.qty) : 0
    record('sufficient shares', qty <= held, `Selling ${qty} but only ${held} ${symbol} held.`)
  }

  // 7. Daily order throttle (applies to both sides)
  const ordersToday = Number(account.ordersToday || 0)
  record(
    'daily order limit',
    ordersToday + 1 <= caps.maxDailyOrders,
    `This would be order ${ordersToday + 1} today vs max ${caps.maxDailyOrders}.`,
  )

  // 8. Daily-loss halt
  const dayPnlPct = Number(account.dayPnlPct ?? 0)
  record(
    'daily-loss halt',
    dayPnlPct > -caps.dailyLossHaltPct,
    `Day P&L ${dayPnlPct}% breached the −${caps.dailyLossHaltPct}% halt — stand down for the day.`,
  )

  // Suggested (compliant) size when only sizing checks fail.
  const sizing = side === 'buy' ? computeCompliantSize({ caps, nav, price, existingValue, cash: Number(account.cash || 0) }) : null
  const suggestedQty = sizing ? sizing.qty : qty

  // A buy with no compliant size at all is a VETO, not "reduce to 0".
  if (!veto && side === 'buy' && sizing && sizing.qty <= 0) {
    veto = true
    reasons.push(`No compliant size available — your ${sizing.boundBy} leaves no room to add ${symbol}.`)
  }

  let decision = 'APPROVE'
  if (veto) decision = 'VETO'
  else if (changes || (side === 'buy' && sizing && sizing.qty < qty)) decision = 'APPROVE-WITH-CHANGES'

  return { decision, reasons, checks, suggestedQty, sizing }
}

// Largest buy that satisfies per-trade, concentration, and cash-buffer caps.
function computeCompliantSize({ caps, nav, price, existingValue, cash }) {
  const perTradeCap = (caps.perTradePct / 100) * nav
  const concRoom = (caps.maxConcentrationPct / 100) * nav - existingValue
  const cashRoom = cash - (caps.cashBufferPct / 100) * nav
  const dollarRoom = Math.max(0, Math.min(perTradeCap, concRoom, cashRoom))
  const qty = Math.floor(dollarRoom / price)
  return { qty, maxNotional: round2(dollarRoom), boundBy: boundLabel(perTradeCap, concRoom, cashRoom) }
}
function boundLabel(perTrade, conc, cash) {
  const min = Math.min(perTrade, conc, cash)
  if (min === conc) return 'concentration cap'
  if (min === cash) return 'cash buffer'
  return 'per-trade cap'
}
