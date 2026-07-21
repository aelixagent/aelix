// routes.mjs — every REST endpoint, registered on the router.
import { HttpError } from './lib/http.mjs'
import { hashPassword, verifyPassword, signJwt, vaultEncrypt } from './lib/crypto.mjs'
import { sanitizeCaps, DEFAULT_CAPS } from './desk/rules.mjs'
import { evaluateTrade } from './desk/rulekeeper.mjs'
import { portfolioXray } from './desk/xray.mjs'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const safeUser = (u) => ({ id: u.id, email: u.email, createdAt: u.createdAt, settings: u.settings })

export function registerRoutes(router, services) {
  const { config, store } = services

  const issueToken = (u) => signJwt({ sub: u.id, email: u.email }, config.jwtSecret, config.jwtTtlSec)

  // ── health / meta ──
  router.get('/health', () => ({ status: 'ok', brokerMode: config.brokerMode, time: new Date().toISOString() }))
  router.get('/v1/meta', () => ({
    brokerMode: config.brokerMode,
    coach: services.coach.enabled,
    scheduler: config.schedulerEnabled,
    defaultCaps: DEFAULT_CAPS,
  }))

  // ── auth ──
  router.post('/v1/auth/signup', ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'a valid email is required')
    if (password.length < 8) throw new HttpError(400, 'password must be at least 8 characters')
    if (store.getUserByEmail(email)) throw new HttpError(409, 'an account with that email already exists')
    const user = store.createUser({ email, passwordHash: hashPassword(password) })
    return { status: 201, body: { token: issueToken(user), user: safeUser(user) } }
  })

  router.post('/v1/auth/login', ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const user = store.getUserByEmail(email)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'invalid email or password')
    }
    return { token: issueToken(user), user: safeUser(user) }
  })

  router.get('/v1/me', ({ user }) => ({ user: safeUser(user) }), { auth: true })

  router.put('/v1/me/settings', ({ user, body }) => {
    const patch = {}
    if (body.autoScan !== undefined) patch.autoScan = Boolean(body.autoScan)
    if (body.scanIntervalSec !== undefined) {
      const n = Number(body.scanIntervalSec)
      if (!Number.isFinite(n) || n < 60 || n > 86400) throw new HttpError(400, 'scanIntervalSec must be 60–86400')
      patch.scanIntervalSec = n
    }
    const updated = store.updateUserSettings(user.id, patch)
    return { user: safeUser(updated) }
  }, { auth: true })

  // ── broker connection (per-user OAuth token) ──
  router.post('/v1/broker/connect', async ({ user, body }) => {
    if (config.brokerMode === 'mock') {
      return { connected: true, mode: 'mock', note: 'Server is in mock mode — a demo account is used; no real token stored.' }
    }
    const accessToken = String(body.accessToken || '')
    if (accessToken.length < 10) throw new HttpError(400, 'accessToken is required (the user\'s Robinhood OAuth token)')
    store.saveToken(user.id, { vaultBlob: vaultEncrypt(accessToken, config.vaultKey) })
    // best-effort validation + first snapshot
    let account = null
    try {
      const r = await services.refreshUser(user)
      account = r.ok ? r.state.account : null
    } catch (e) {
      store.deleteToken(user.id)
      throw new HttpError(400, `could not reach the account with that token: ${e.message}`)
    }
    return { connected: true, mode: 'mcp', account }
  }, { auth: true })

  router.get('/v1/broker/status', async ({ user }) => {
    const connected = services.isConnected(user)
    if (!connected) return { connected: false }
    const broker = services.brokerFor(user)
    let account = null
    try {
      account = await broker.getAccount()
    } catch {
      account = null
    }
    return { connected: true, mode: config.brokerMode, account }
  }, { auth: true })

  router.del('/v1/broker', ({ user }) => {
    store.deleteToken(user.id)
    return { connected: false }
  }, { auth: true })

  // ── rules (the user's caps) ──
  router.get('/v1/rules', ({ user }) => ({ caps: services.capsFor(user.id), defaults: DEFAULT_CAPS }), { auth: true })

  router.put('/v1/rules', ({ user, body }) => {
    let caps
    try {
      caps = sanitizeCaps(body.caps || body)
    } catch (e) {
      throw new HttpError(400, e.message)
    }
    return { caps: store.saveRules(user.id, caps).caps }
  }, { auth: true })

  // ── Rule-Keeper: check a trade the user WANTS to make against their rules ──
  router.post('/v1/rulekeeper/check', async ({ user, body, query }) => {
    const broker = services.brokerFor(user)
    if (!broker) throw new HttpError(409, 'connect your account first')
    const trade = body.trade || body
    const account = await broker.getAccount()
    const positions = await broker.getPositions()
    // fill live price if omitted
    if (!trade.price && trade.symbol) {
      const q = await broker.getQuote(trade.symbol)
      trade.price = q.last
    }
    const verdict = evaluateTrade({ caps: services.capsFor(user.id), account, positions, trade })
    let explanation = null
    if (query.get('explain') === '1' && services.coach.enabled) {
      explanation = await services.coach.explainVerdict(verdict, trade, account)
    }
    return { trade, verdict, explanation }
  }, { auth: true })

  // ── desk state + fresh run ──
  router.get('/v1/desk', ({ user }) => {
    const state = store.getDeskState(user.id)
    if (!state) throw new HttpError(404, 'no desk snapshot yet — run POST /v1/desk/run or wait for the scheduler')
    return { desk: state }
  }, { auth: true })

  router.post('/v1/desk/run', async ({ user }) => {
    const r = await services.refreshUser(user)
    if (!r.ok) throw new HttpError(409, 'connect your account first')
    return { desk: r.state, newAlerts: r.newAlerts }
  }, { auth: true })

  // ── portfolio x-ray (fresh) ──
  router.get('/v1/xray', async ({ user, query }) => {
    const broker = services.brokerFor(user)
    if (!broker) throw new HttpError(409, 'connect your account first')
    const account = await broker.getAccount()
    const positions = await broker.getPositions()
    let earnings = []
    try {
      earnings = await broker.getEarningsCalendar(positions.map((p) => p.symbol))
    } catch {
      earnings = []
    }
    const xray = portfolioXray({ caps: services.capsFor(user.id), account, positions, earnings })
    let explanation = null
    if (query.get('explain') === '1' && services.coach.enabled) {
      explanation = await services.coach.explainXray(xray)
    }
    return { xray, explanation }
  }, { auth: true })

  // ── alerts ──
  router.get('/v1/alerts', ({ user, query }) => {
    const limit = Math.min(200, Number(query.get('limit')) || 50)
    return { alerts: store.listAlerts(user.id, { limit }) }
  }, { auth: true })

  router.post('/v1/alerts/read', ({ user }) => {
    store.markAlertsRead(user.id)
    return { ok: true }
  }, { auth: true })
}
