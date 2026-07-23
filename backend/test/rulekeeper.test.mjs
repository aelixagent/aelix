// node --test  — deterministic coverage of the Rule-Keeper engine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateTrade } from '../src/desk/rulekeeper.mjs'
import { DEFAULT_CAPS, sanitizeCaps } from '../src/desk/rules.mjs'
import { hashPassword, verifyPassword, signJwt, verifyJwt, vaultEncrypt, vaultDecrypt } from '../src/lib/crypto.mjs'
import { createBroker } from '../src/lib/broker.mjs'
import { createRouter, clientIp } from '../src/lib/http.mjs'
import { createStore } from '../src/lib/store.mjs'
import { randomBytes, createHmac } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync, existsSync } from 'node:fs'

const account = { equity: 10000, cash: 5000, ordersToday: 0, dayPnlPct: 0 }

test('approves a well-sized, well-stopped new buy', () => {
  const v = evaluateTrade({
    caps: DEFAULT_CAPS,
    account,
    positions: [],
    trade: { symbol: 'AAPL', side: 'buy', qty: 5, price: 200, stop: 188 }, // $1000 = 10% ≤ 15%; stop -6% ≤ 8%
  })
  assert.equal(v.decision, 'APPROVE')
})

test('downsizes an oversized order to APPROVE-WITH-CHANGES', () => {
  const v = evaluateTrade({
    caps: DEFAULT_CAPS,
    account,
    positions: [],
    trade: { symbol: 'AAPL', side: 'buy', qty: 20, price: 200, stop: 188 }, // $4000 = 40% > 15%
  })
  assert.equal(v.decision, 'APPROVE-WITH-CHANGES')
  // per-trade cap 15% of 10k = $1500 → floor(1500/200) = 7 shares
  assert.equal(v.suggestedQty, 7)
})

test('VETOs a missing stop-loss', () => {
  const v = evaluateTrade({
    caps: DEFAULT_CAPS,
    account,
    positions: [],
    trade: { symbol: 'AAPL', side: 'buy', qty: 5, price: 200 }, // no stop
  })
  assert.equal(v.decision, 'VETO')
  assert.match(v.reasons.join(' '), /stop/i)
})

test('VETOs averaging into a loser when the rule is on', () => {
  const v = evaluateTrade({
    caps: DEFAULT_CAPS,
    account,
    positions: [{ symbol: 'NVDA', qty: 4, avgCost: 168, last: 150, value: 600 }],
    trade: { symbol: 'NVDA', side: 'buy', qty: 2, price: 150, stop: 140 },
  })
  assert.equal(v.decision, 'VETO')
  assert.match(v.reasons.join(' '), /underwater|averaging/i)
})

test('VETOs an unfunded account', () => {
  const v = evaluateTrade({
    caps: DEFAULT_CAPS,
    account: { equity: 0, cash: 0 },
    positions: [],
    trade: { symbol: 'AAPL', side: 'buy', qty: 1, price: 200, stop: 188 },
  })
  assert.equal(v.decision, 'VETO')
})

test('VETOs when the daily-loss halt is breached', () => {
  const v = evaluateTrade({
    caps: DEFAULT_CAPS,
    account: { ...account, dayPnlPct: -6 }, // past -5% halt
    positions: [],
    trade: { symbol: 'AAPL', side: 'buy', qty: 1, price: 200, stop: 188 },
  })
  assert.equal(v.decision, 'VETO')
})

test('sanitizeCaps rejects out-of-range values', () => {
  assert.throws(() => sanitizeCaps({ perTradePct: 500 }))
  assert.deepEqual(sanitizeCaps({}).perTradePct, DEFAULT_CAPS.perTradePct)
})

test('crypto: password hash + verify round-trips', () => {
  const h = hashPassword('correct horse battery staple')
  assert.ok(verifyPassword('correct horse battery staple', h))
  assert.ok(!verifyPassword('wrong', h))
})

test('crypto: JWT sign + verify round-trips and rejects tampering', () => {
  const secret = 'test-secret'
  const tok = signJwt({ sub: 'u_1' }, secret, 60)
  assert.equal(verifyJwt(tok, secret).sub, 'u_1')
  assert.throws(() => verifyJwt(tok + 'x', secret))
  assert.throws(() => verifyJwt(tok, 'other-secret'))
})

test('crypto: vault encrypt + decrypt round-trips', () => {
  const key = randomBytes(32)
  const blob = vaultEncrypt('rh-oauth-token-123', key)
  assert.equal(vaultDecrypt(blob, key), 'rh-oauth-token-123')
  assert.throws(() => vaultDecrypt(blob, randomBytes(32))) // wrong key fails auth tag
})

// ── security fixes ───────────────────────────────────────────────────────────

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function forgeJwt(header, body, secret) {
  const data = `${b64(header)}.${b64(body)}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

test('crypto: verifyJwt rejects non-HS256 alg (alg-confusion defense)', () => {
  const secret = 'test-secret'
  const now = Math.floor(Date.now() / 1000)
  // "alg: none" and other algs must be rejected even with a matching HMAC sig.
  assert.throws(() => verifyJwt(forgeJwt({ alg: 'none', typ: 'JWT' }, { sub: 'u', exp: now + 60 }, secret), secret), /alg/)
  assert.throws(() => verifyJwt(forgeJwt({ alg: 'HS512', typ: 'JWT' }, { sub: 'u', exp: now + 60 }, secret), secret), /alg/)
})

test('crypto: verifyJwt enforces nbf / future-iat', () => {
  const secret = 'test-secret'
  const now = Math.floor(Date.now() / 1000)
  assert.throws(() => verifyJwt(forgeJwt({ alg: 'HS256', typ: 'JWT' }, { sub: 'u', nbf: now + 3600, exp: now + 7200 }, secret), secret), /not yet valid/)
  assert.throws(() => verifyJwt(forgeJwt({ alg: 'HS256', typ: 'JWT' }, { sub: 'u', iat: now + 3600, exp: now + 7200 }, secret), secret), /future/)
  // a normal token still verifies
  assert.equal(verifyJwt(signJwt({ sub: 'u' }, secret, 60), secret).sub, 'u')
})

test('broker: mock getQuote rejects unknown symbols (no fake price)', async () => {
  const broker = createBroker({ mode: 'mock' })
  assert.equal((await broker.getQuote('AAPL')).last, 208)
  await assert.rejects(() => broker.getQuote('ZZZZ'), /no quote/)
})

// Minimal fake res that records headers, for CORS tests.
function fakeExchange(origin, corsOrigins) {
  const headers = {}
  const res = {
    writableEnded: false,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v },
    writeHead: () => { res.writableEnded = true },
    end: () => { res.writableEnded = true },
  }
  const req = { method: 'OPTIONS', headers: origin ? { origin } : {}, socket: { remoteAddress: '1.2.3.4' }, url: '/health', on: () => {} }
  const config = { corsOrigins, trustProxy: false }
  const router = createRouter({ config, store: {} })
  return { req, res, headers, router }
}

test('http: CORS never pairs a wildcard with credentials', async () => {
  const { req, res, headers, router } = fakeExchange('https://evil.example', ['*'])
  await router.handle(req, res)
  assert.equal(headers['access-control-allow-origin'], '*')
  assert.equal(headers['access-control-allow-credentials'], undefined)
})

test('http: CORS reflects an exact allowlist match with credentials', async () => {
  const { req, res, headers, router } = fakeExchange('https://app.example', ['https://app.example'])
  await router.handle(req, res)
  assert.equal(headers['access-control-allow-origin'], 'https://app.example')
  assert.equal(headers['access-control-allow-credentials'], 'true')
})

test('http: CORS sends no origin header when the origin is not allowlisted', async () => {
  const { req, res, headers, router } = fakeExchange('https://evil.example', ['https://app.example'])
  await router.handle(req, res)
  assert.equal(headers['access-control-allow-origin'], undefined)
  assert.equal(headers['access-control-allow-credentials'], undefined)
})

test('http: clientIp only trusts X-Forwarded-For when configured', () => {
  const req = { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: { remoteAddress: '1.2.3.4' } }
  assert.equal(clientIp(req, { trustProxy: false }), '1.2.3.4')
  assert.equal(clientIp(req, { trustProxy: true }), '9.9.9.9')
})

test('store: writes are durable + survive reload (atomic rename)', () => {
  const file = join(tmpdir(), `aelix-store-test-${randomBytes(6).toString('hex')}.json`)
  try {
    const store = createStore({ storeDriver: 'json', dataFile: file })
    const u = store.createUser({ email: 'a@b.co', passwordHash: 'x' })
    store.flush() // force the debounced write to land synchronously
    assert.ok(existsSync(file))
    const reloaded = createStore({ storeDriver: 'json', dataFile: file })
    assert.equal(reloaded.getUser(u.id)?.email, 'a@b.co')
  } finally {
    rmSync(file, { force: true })
    rmSync(`${file}.tmp`, { force: true })
  }
})

test('store: saveDeskState caps signals array growth', () => {
  const file = join(tmpdir(), `aelix-desk-test-${randomBytes(6).toString('hex')}.json`)
  try {
    const store = createStore({ storeDriver: 'json', dataFile: file })
    const signals = Array.from({ length: 500 }, (_, i) => ({ code: 'X', message: `m${i}` }))
    const rec = store.saveDeskState('u_1', { signals })
    store.flush()
    assert.equal(rec.signals.length, 200)
    assert.equal(rec.signals[199].message, 'm499') // kept the most recent tail
  } finally {
    rmSync(file, { force: true })
    rmSync(`${file}.tmp`, { force: true })
  }
})
