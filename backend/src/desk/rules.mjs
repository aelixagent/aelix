// rules.mjs — the user's written risk caps. Defaults mirror strategies/README.md
// in the desk repo. Users own these; the service never changes them silently.
export const DEFAULT_CAPS = {
  perTradePct: 15, // max % of NAV in a single order
  maxConcentrationPct: 25, // max % of NAV in one symbol (incl. adds)
  maxOpenPositions: 6,
  maxDailyOrders: 4,
  stopLossPct: 8, // required stop distance from entry, %
  dailyLossHaltPct: 5, // halt trading for the day past this loss
  cashBufferPct: 10, // keep at least this % of NAV in cash
  noAveragingIntoLosers: true,
}

const NUMERIC = {
  perTradePct: [0.1, 100],
  maxConcentrationPct: [0.1, 100],
  maxOpenPositions: [1, 100],
  maxDailyOrders: [1, 100],
  stopLossPct: [0.1, 90],
  dailyLossHaltPct: [0.1, 90],
  cashBufferPct: [0, 90],
}

/** Validate + coerce a caps patch; throws on out-of-range values. */
export function sanitizeCaps(input = {}) {
  const caps = { ...DEFAULT_CAPS }
  for (const [key, [min, max]] of Object.entries(NUMERIC)) {
    if (input[key] === undefined) continue
    const n = Number(input[key])
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`cap "${key}" must be a number in [${min}, ${max}]`)
    }
    caps[key] = n
  }
  if (input.noAveragingIntoLosers !== undefined) {
    caps.noAveragingIntoLosers = Boolean(input.noAveragingIntoLosers)
  }
  return caps
}
