// store.mjs — persistence. Default driver is a single JSON file (zero deps, runs
// anywhere). The Store interface below is what a Postgres/Prisma driver must
// implement for production; see backend/README "Going to production".
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { newId } from './crypto.mjs'

const EMPTY = { users: [], tokens: [], rules: [], deskStates: [], alerts: [] }

class JsonStore {
  constructor(file) {
    this.file = file
    this.db = this._load()
    this._saveQueued = false
  }

  _load() {
    try {
      if (existsSync(this.file)) return { ...EMPTY, ...JSON.parse(readFileSync(this.file, 'utf8')) }
    } catch (e) {
      throw new Error(`Corrupt store at ${this.file}: ${e.message}`)
    }
    return structuredClone(EMPTY)
  }

  // Atomic-ish write: temp file + rename. Debounced to coalesce bursts.
  _save() {
    if (this._saveQueued) return
    this._saveQueued = true
    queueMicrotask(() => {
      this._saveQueued = false
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.db, null, 2))
      renameSync(tmp, this.file)
    })
  }

  // ── users ──
  createUser({ email, passwordHash }) {
    const user = {
      id: newId('u_'),
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString(),
      settings: { autoScan: true, scanIntervalSec: null },
    }
    this.db.users.push(user)
    this._save()
    return user
  }
  getUser(id) {
    return this.db.users.find((u) => u.id === id) || null
  }
  getUserByEmail(email) {
    return this.db.users.find((u) => u.email === String(email).toLowerCase()) || null
  }
  listUsers() {
    return this.db.users.slice()
  }
  updateUserSettings(id, patch) {
    const u = this.getUser(id)
    if (!u) return null
    u.settings = { ...u.settings, ...patch }
    this._save()
    return u
  }

  // ── broker tokens (encrypted blobs live here) ──
  saveToken(userId, { vaultBlob, account }) {
    const existing = this.db.tokens.find((t) => t.userId === userId)
    const rec = existing || { userId }
    rec.vaultBlob = vaultBlob
    rec.account = account || rec.account || null
    rec.connectedAt = new Date().toISOString()
    if (!existing) this.db.tokens.push(rec)
    this._save()
    return rec
  }
  getToken(userId) {
    return this.db.tokens.find((t) => t.userId === userId) || null
  }
  deleteToken(userId) {
    this.db.tokens = this.db.tokens.filter((t) => t.userId !== userId)
    this._save()
  }

  // ── rules (the user's caps) ──
  getRules(userId) {
    return this.db.rules.find((r) => r.userId === userId) || null
  }
  saveRules(userId, caps) {
    const existing = this.db.rules.find((r) => r.userId === userId)
    if (existing) {
      existing.caps = caps
      existing.updatedAt = new Date().toISOString()
    } else {
      this.db.rules.push({ userId, caps, updatedAt: new Date().toISOString() })
    }
    this._save()
    return this.getRules(userId)
  }

  // ── desk state (per-user snapshot the scheduler/desk writes) ──
  saveDeskState(userId, state) {
    const existing = this.db.deskStates.find((s) => s.userId === userId)
    const rec = { userId, ...state }
    if (existing) Object.assign(existing, rec)
    else this.db.deskStates.push(rec)
    this._save()
    return rec
  }
  getDeskState(userId) {
    return this.db.deskStates.find((s) => s.userId === userId) || null
  }

  // ── alerts ──
  addAlert(userId, alert) {
    const rec = {
      id: newId('a_'),
      userId,
      ts: new Date().toISOString(),
      read: false,
      ...alert,
    }
    this.db.alerts.push(rec)
    // keep the tail bounded per user (most recent 200)
    const mine = this.db.alerts.filter((a) => a.userId === userId)
    if (mine.length > 200) {
      const drop = new Set(mine.slice(0, mine.length - 200).map((a) => a.id))
      this.db.alerts = this.db.alerts.filter((a) => !drop.has(a.id))
    }
    this._save()
    return rec
  }
  listAlerts(userId, { limit = 50 } = {}) {
    return this.db.alerts
      .filter((a) => a.userId === userId)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, limit)
  }
  markAlertsRead(userId) {
    for (const a of this.db.alerts) if (a.userId === userId) a.read = true
    this._save()
  }
}

export function createStore(config) {
  if (config.storeDriver === 'json') return new JsonStore(config.dataFile)
  throw new Error(
    `Unknown STORE_DRIVER "${config.storeDriver}". Only "json" ships here; implement the JsonStore interface for postgres — see backend/README.`,
  )
}
