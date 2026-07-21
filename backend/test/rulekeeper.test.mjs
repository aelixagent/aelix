// node --test  — deterministic coverage of the Rule-Keeper engine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateTrade } from '../src/desk/rulekeeper.mjs'
import { DEFAULT_CAPS, sanitizeCaps } from '../src/desk/rules.mjs'
import { hashPassword, verifyPassword, signJwt, verifyJwt, vaultEncrypt, vaultDecrypt } from '../src/lib/crypto.mjs'
import { randomBytes } from 'node:crypto'

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
