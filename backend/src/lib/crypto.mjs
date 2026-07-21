// crypto.mjs — auth + secret primitives on node:crypto only. Zero dependencies.
//
//  - hashPassword / verifyPassword : scrypt with per-user random salt
//  - signJwt / verifyJwt           : compact HS256 JWT (no library)
//  - vaultEncrypt / vaultDecrypt   : AES-256-GCM for OAuth tokens at rest
//
// These are the security-critical bits. In production, back the vault key with
// a KMS and consider rotating the JWT secret. See docs/SETUP + backend/README.
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// ── Passwords ──────────────────────────────────────────────────────────────
export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(password), salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(String(password), salt, expected.length)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// ── JWT (HS256) ──────────────────────────────────────────────────────────────
export function signJwt(payload, secret, ttlSec = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + ttlSec }
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyJwt(token, secret) {
  const parts = String(token).split('.')
  if (parts.length !== 3) throw new Error('malformed token')
  const [p1, p2, sig] = parts
  const expected = createHmac('sha256', secret).update(`${p1}.${p2}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad signature')
  const body = JSON.parse(Buffer.from(p2, 'base64url').toString('utf8'))
  if (body.exp && Math.floor(Date.now() / 1000) > body.exp) throw new Error('token expired')
  return body
}

// ── Token vault (AES-256-GCM) ────────────────────────────────────────────────
// Encrypts a user's Robinhood OAuth token before it ever touches the store.
export function vaultEncrypt(plaintext, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ct].map((b) => b.toString('base64')).join('.')
}

export function vaultDecrypt(blob, key) {
  const [ivB64, tagB64, ctB64] = String(blob).split('.')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ct = Buffer.from(ctB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// Short random id for records (url-safe, ~22 chars).
export function newId(prefix = '') {
  return `${prefix}${randomBytes(16).toString('base64url')}`
}
