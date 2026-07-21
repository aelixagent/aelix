// xray.mjs — Portfolio X-Ray. Pure analytics on what the user ALREADY owns:
// concentration, sector exposure, cash level, and rule-vs-reality flags. No advice.

const round2 = (n) => Math.round(n * 100) / 100

export function portfolioXray({ caps, account, positions = [], earnings = [] }) {
  const nav = Number(account?.equity || 0)
  const cash = Number(account?.cash || 0)
  const cashPct = nav > 0 ? round2((cash / nav) * 100) : 0

  // Sector exposure
  const sectorMap = {}
  for (const p of positions) {
    const s = p.sector || 'Unknown'
    sectorMap[s] = (sectorMap[s] || 0) + Number(p.value || 0)
  }
  const sectors = Object.entries(sectorMap)
    .map(([sector, value]) => ({ sector, value: round2(value), weightPct: nav > 0 ? round2((value / nav) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)

  // Concentration
  const byWeight = positions
    .map((p) => ({ symbol: p.symbol, weightPct: nav > 0 ? round2((Number(p.value) / nav) * 100) : 0 }))
    .sort((a, b) => b.weightPct - a.weightPct)
  const topPosition = byWeight[0] || null
  const topSector = sectors[0] || null

  const earnMap = new Map(earnings.map((e) => [e.symbol, e.inDays]))

  // Flags — objective observations tied to the user's own caps.
  const flags = []
  if (cashPct < caps.cashBufferPct) {
    flags.push(flag('warn', 'cash-buffer', `Cash is ${cashPct}% of NAV, below your ${caps.cashBufferPct}% buffer.`))
  }
  if (topPosition && topPosition.weightPct > caps.maxConcentrationPct) {
    flags.push(flag('danger', 'concentration', `${topPosition.symbol} is ${topPosition.weightPct}% of NAV, above your ${caps.maxConcentrationPct}% cap.`, topPosition.symbol))
  }
  if (topSector && topSector.weightPct >= 50) {
    flags.push(flag('warn', 'sector-concentration', `${topSector.sector} is ${topSector.weightPct}% of the book — heavy single-sector exposure.`))
  }
  if (positions.length > caps.maxOpenPositions) {
    flags.push(flag('warn', 'position-count', `${positions.length} open positions vs your max of ${caps.maxOpenPositions}.`))
  }
  for (const p of positions) {
    // Stop-breach: last at/below the stored stop.
    if (p.stop && Number(p.last) <= Number(p.stop)) {
      flags.push(flag('danger', 'stop-breach', `${p.symbol} $${p.last} is at/below its stop $${p.stop}.`, p.symbol))
    }
    const inDays = earnMap.get(p.symbol)
    if (inDays != null && inDays <= 10) {
      flags.push(flag('warn', 'earnings-soon', `${p.symbol} reports earnings in ~${inDays} days (event risk).`, p.symbol))
    }
    if (caps.noAveragingIntoLosers && Number(p.last) < Number(p.avgCost)) {
      flags.push(flag('info', 'underwater', `${p.symbol} is underwater (last $${p.last} < avg $${p.avgCost}); your rule blocks adding.`, p.symbol))
    }
  }

  const score = healthScore({ cashPct, caps, topPosition, topSector, flags })

  return {
    generatedAt: new Date().toISOString(),
    nav: round2(nav),
    cashPct,
    positionCount: positions.length,
    topPosition,
    topSector,
    sectors,
    concentration: byWeight,
    flags,
    healthScore: score,
  }
}

function flag(severity, code, message, symbol = null) {
  return { severity, code, message, symbol }
}

// 0-100 discipline score: start at 100, dock for each objective breach.
function healthScore({ flags }) {
  let s = 100
  for (const f of flags) s -= f.severity === 'danger' ? 22 : f.severity === 'warn' ? 10 : 3
  return Math.max(0, Math.min(100, s))
}
