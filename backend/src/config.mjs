// config.mjs — environment loading + typed config. Zero dependencies.
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Minimal .env loader (no dotenv dependency). Only sets keys not already in env.
function loadDotenv() {
  const path = join(ROOT, '.env')
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadDotenv()

const bool = (v, d) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(v))
const num = (v, d) => (v === undefined || v === '' ? d : Number(v))
const list = (v, d) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d)

const warnings = []

// JWT secret — ephemeral in dev if unset (tokens won't survive restart).
const JWT_SECRET_PROVIDED = Boolean(process.env.JWT_SECRET)
let JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  JWT_SECRET = randomBytes(32).toString('hex')
  warnings.push('JWT_SECRET not set — using an EPHEMERAL secret (dev only; sessions reset on restart).')
}

// Vault key — 32 bytes base64. Ephemeral in dev if unset (stored tokens become
// unreadable after restart — acceptable for dev, fatal for prod).
let VAULT_KEY_B64 = process.env.VAULT_KEY
const VAULT_KEY_PROVIDED = Boolean(VAULT_KEY_B64)
let VAULT_KEY
if (VAULT_KEY_B64) {
  VAULT_KEY = Buffer.from(VAULT_KEY_B64, 'base64')
  if (VAULT_KEY.length !== 32) {
    throw new Error(`VAULT_KEY must decode to 32 bytes (got ${VAULT_KEY.length}). Generate: openssl rand -base64 32`)
  }
} else {
  VAULT_KEY = randomBytes(32)
  warnings.push('VAULT_KEY not set — using an EPHEMERAL key (dev only; stored broker tokens reset on restart).')
}

export const config = {
  root: ROOT,
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 8787),
  corsOrigins: list(process.env.CORS_ORIGINS, ['http://localhost:5190', 'http://localhost:5180']),

  jwtSecret: JWT_SECRET,
  jwtSecretProvided: JWT_SECRET_PROVIDED,
  jwtTtlSec: num(process.env.JWT_TTL_SEC, 60 * 60 * 24 * 7), // 7 days
  vaultKey: VAULT_KEY,
  vaultKeyProvided: VAULT_KEY_PROVIDED,

  // Reverse-proxy trust: when true, derive the client IP from the first
  // X-Forwarded-For hop (so the rate limiter keys on the real client, not the
  // proxy). Leave false unless the deployment actually sits behind a trusted proxy.
  trustProxy: bool(process.env.TRUST_PROXY, false),

  // Rate limiting. A generous global limiter plus a stricter one guarding the
  // login endpoint against password brute-force.
  rateLimitWindowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMax: num(process.env.RATE_LIMIT_MAX, 240),
  loginRateLimitWindowMs: num(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60_000), // 15 min
  loginRateLimitMax: num(process.env.LOGIN_RATE_LIMIT_MAX, 10),

  storeDriver: process.env.STORE_DRIVER || 'json',
  dataFile: resolve(ROOT, process.env.DATA_FILE || '.data/db.json'),

  brokerMode: process.env.BROKER_MODE || 'mock', // 'mock' | 'mcp'
  brokerMcpUrl: process.env.BROKER_MCP_URL || 'https://agent.robinhood.com/mcp/trading',

  schedulerEnabled: bool(process.env.SCHEDULER_ENABLED, true),
  scanIntervalSec: num(process.env.SCAN_INTERVAL_SEC, 900),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',

  isProd() {
    return this.env === 'production'
  },
}

export function printBootWarnings(log = console) {
  if (config.isProd()) {
    // In production, missing secrets are fatal, not warnings.
    if (!config.jwtSecretProvided) throw new Error('JWT_SECRET is required in production.')
    if (!config.vaultKeyProvided) throw new Error('VAULT_KEY is required in production.')
  }
  for (const w of warnings) log.warn ? log.warn('⚠  ' + w) : log.log('⚠  ' + w)
}
