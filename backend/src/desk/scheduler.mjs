// scheduler.mjs — the 24/7 engine. Periodically runs the read-only desk for every
// user who has auto-scan on and a connected broker, persisting state + emitting
// alerts. Runs even when the user is offline. In-process here (fine for a single
// node / reference deployment); swap for a Redis/BullMQ worker to scale out.
export function startScheduler({ services, config, log = console }) {
  if (!config.schedulerEnabled) {
    log.log('[scheduler] disabled (SCHEDULER_ENABLED=false)')
    return { stop() {} }
  }

  // The loop ticks on a fine granularity; each user is only refreshed once their
  // OWN cadence has elapsed. Granularity is capped so we can honor per-user
  // intervals down to the settings minimum (60s), without missing them.
  const baseMs = Math.max(15, Math.min(config.scanIntervalSec, 60)) * 1000
  let running = false
  let stopped = false
  const lastRun = new Map() // userId -> epoch ms of last refresh

  // A user's effective cadence: their own scanIntervalSec, else the global one.
  const userIntervalMs = (u) => {
    const s = Number(u.settings?.scanIntervalSec)
    return (Number.isFinite(s) && s > 0 ? s : config.scanIntervalSec) * 1000
  }

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
        // Honor each user's own cadence (fall back to global when unset).
        const last = lastRun.get(user.id) || 0
        if (started - last < userIntervalMs(user)) continue
        lastRun.set(user.id, started)
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
