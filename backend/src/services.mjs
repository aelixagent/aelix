// services.mjs — wires config + store + broker + coach, and provides the two
// higher-level operations both the routes and the scheduler share:
//   brokerFor(user)  → a ready BrokerClient for that user (decrypts their token)
//   refreshUser(user) → run the read-only desk, persist state, emit new alerts
import { createStore } from './lib/store.mjs'
import { createBroker } from './lib/broker.mjs'
import { createCoach } from './lib/llm.mjs'
import { vaultDecrypt } from './lib/crypto.mjs'
import { runDesk } from './desk/research.mjs'
import { DEFAULT_CAPS } from './desk/rules.mjs'

export function createServices(config) {
  const store = createStore(config)
  const coach = createCoach(config)

  function capsFor(userId) {
    return store.getRules(userId)?.caps || DEFAULT_CAPS
  }

  function brokerFor(user) {
    if (config.brokerMode === 'mock') return createBroker({ mode: 'mock' })
    const tok = store.getToken(user.id)
    if (!tok) return null // not connected
    const accessToken = vaultDecrypt(tok.vaultBlob, config.vaultKey)
    return createBroker({ mode: 'mcp', url: config.brokerMcpUrl, accessToken })
  }

  function isConnected(user) {
    return config.brokerMode === 'mock' || Boolean(store.getToken(user.id))
  }

  // Run the desk for one user, persist the snapshot, and emit an alert for each
  // NEW signal (deduped against the last snapshot so we don't spam every tick).
  async function refreshUser(user) {
    const broker = brokerFor(user)
    if (!broker) return { ok: false, reason: 'broker-not-connected' }

    const caps = capsFor(user.id)
    const prev = store.getDeskState(user.id)
    const prevKeys = new Set((prev?.signals || []).map(signalKey))

    const state = await runDesk({ broker, caps })
    store.saveDeskState(user.id, state)

    const fresh = state.signals.filter((s) => !prevKeys.has(signalKey(s)))
    for (const s of fresh) {
      store.addAlert(user.id, {
        type: s.code,
        severity: s.severity,
        symbol: s.symbol || null,
        message: s.message,
      })
    }
    return { ok: true, state, newAlerts: fresh.length }
  }

  return { config, store, coach, capsFor, brokerFor, isConnected, refreshUser }
}

// A signal is "the same" if its code+symbol+message match — stable across ticks.
function signalKey(s) {
  return `${s.code}|${s.symbol || ''}|${s.message}`
}
