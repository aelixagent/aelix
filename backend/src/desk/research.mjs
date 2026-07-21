// research.mjs — builds a per-user desk snapshot from read-only broker data.
// This is the server-side equivalent of the repo's "desk run", but scoped to the
// public product: it reports state + X-ray + rule-based flags. It NEVER places
// or auto-executes an order.
import { portfolioXray } from './xray.mjs'

export async function runDesk({ broker, caps }) {
  const account = await broker.getAccount()
  const positions = await broker.getPositions()
  const symbols = positions.map((p) => p.symbol)
  let earnings = []
  try {
    earnings = await broker.getEarningsCalendar(symbols)
  } catch {
    earnings = []
  }

  const xray = portfolioXray({ caps, account, positions, earnings })

  return {
    generatedAt: new Date().toISOString(),
    account,
    positions,
    xray,
    // alerts derived from x-ray flags (the scheduler persists/deduplicates these)
    signals: xray.flags,
  }
}
