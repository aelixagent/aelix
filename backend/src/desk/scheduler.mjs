// scheduler.mjs — the 24/7 engine. Periodically runs the read-only desk for every
// user who has auto-scan on and a connected broker, persisting state + emitting
// alerts. Runs even when the user is offline. In-process here (fine for a single
// node / reference deployment); swap for a Redis/BullMQ worker to scale out.
export function startScheduler({ services, config, log = console }) {
  if (!config.schedulerEnabled) {
    log.log('[scheduler] disabled (SCHEDULER_ENABLED=false)')
    return { stop() {} }
  }

  const baseMs = Math.max(15, config.scanIntervalSec) * 1000
  let running = false
  let stopped = false

  async function tick() {
    if (running || stopped) return
    running = true
    const started = Date.now()
    let scanned = 0
    let alerts = 0
    try {
      for (const user of services.store.listUsers()) {
        if (user.settings?.autoScan === false) continue
        if (!services.isConnected(user)) continue
        try {
          const r = await services.refreshUser(user)
          if (r.ok) {
            scanned++
            alerts += r.newAlerts
          }
        } catch (e) {
          log.warn?.(`[scheduler] user ${user.id} failed: ${e.message}`)
        }
      }
    } finally {
      running = false
      if (scanned) log.log(`[scheduler] scanned ${scanned} user(s), ${alerts} new alert(s) in ${Date.now() - started}ms`)
    }
  }

  // Kick once shortly after boot, then on the interval.
  const kickoff = setTimeout(tick, 2000)
  const timer = setInterval(tick, baseMs)
  timer.unref?.()
  kickoff.unref?.()
  log.log(`[scheduler] armed — every ${config.scanIntervalSec}s`)

  return {
    tick, // exposed for tests / manual trigger
    stop() {
      stopped = true
      clearInterval(timer)
      clearTimeout(kickoff)
    },
  }
}
