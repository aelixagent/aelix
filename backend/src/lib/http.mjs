// http.mjs — a minimal router + helpers over node:http. Zero dependencies.
import { verifyJwt } from './crypto.mjs'

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code || 'error'
  }
}

export function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

async function readJsonBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limitBytes) {
        reject(new HttpError(413, 'request body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new HttpError(400, 'invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

// Very small fixed-window in-memory rate limiter (per IP). Swap for Redis at scale.
function makeRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map()
  setInterval(() => hits.clear(), windowMs).unref?.()
  return (ip) => {
    const n = (hits.get(ip) || 0) + 1
    hits.set(ip, n)
    return n <= max
  }
}

export function createRouter({ config, store }) {
  const routes = [] // { method, parts, handler, auth }
  const rateOk = makeRateLimiter({ windowMs: 60_000, max: 240 })

  function add(method, pattern, handler, { auth = false } = {}) {
    const parts = pattern.split('/').filter(Boolean)
    routes.push({ method, parts, handler, auth })
  }

  const api = {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    put: (p, h, o) => add('PUT', p, h, o),
    del: (p, h, o) => add('DELETE', p, h, o),
  }

  function match(method, pathname) {
    const segs = pathname.split('/').filter(Boolean)
    for (const r of routes) {
      if (r.method !== method) continue
      if (r.parts.length !== segs.length) continue
      const params = {}
      let ok = true
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i]
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i])
        else if (p !== segs[i]) {
          ok = false
          break
        }
      }
      if (ok) return { route: r, params }
    }
    return null
  }

  function applyCors(req, res) {
    const origin = req.headers.origin
    const allowed = config.corsOrigins
    if (origin && (allowed.includes('*') || allowed.includes(origin))) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'Origin')
      res.setHeader('access-control-allow-credentials', 'true')
      res.setHeader('access-control-allow-headers', 'authorization, content-type')
      res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
    }
  }

  function authUser(req) {
    const h = req.headers.authorization || ''
    const m = /^Bearer\s+(.+)$/i.exec(h)
    if (!m) throw new HttpError(401, 'missing bearer token', 'unauthorized')
    let claims
    try {
      claims = verifyJwt(m[1], config.jwtSecret)
    } catch {
      throw new HttpError(401, 'invalid or expired token', 'unauthorized')
    }
    const user = store.getUser(claims.sub)
    if (!user) throw new HttpError(401, 'user not found', 'unauthorized')
    return user
  }

  async function handle(req, res) {
    const ip = req.socket.remoteAddress || 'unknown'
    applyCors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (!rateOk(ip)) return json(res, 429, { error: 'rate limit exceeded' })

    const url = new URL(req.url, 'http://localhost')
    const found = match(req.method, url.pathname)
    if (!found) return json(res, 404, { error: 'not found' })

    try {
      const ctx = { req, res, params: found.params, query: url.searchParams, config, store }
      if (found.route.auth) ctx.user = authUser(req)
      if (req.method === 'POST' || req.method === 'PUT') ctx.body = await readJsonBody(req)
      const result = await found.route.handler(ctx)
      if (res.writableEnded) return
      // Envelope form is ONLY when a handler returns a numeric `status` (e.g.
      // { status: 201, body }). Otherwise the whole return value is the body —
      // so a plain body may safely contain a non-numeric `status` field.
      const isEnvelope = result && typeof result === 'object' && typeof result.status === 'number'
      const status = isEnvelope ? result.status : 200
      const body = isEnvelope ? result.body ?? { ok: true } : result ?? { ok: true }
      json(res, status, body)
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.message, code: err.code })
      console.error('[unhandled]', err)
      return json(res, 500, { error: 'internal error' })
    }
  }

  return { ...api, handle }
}
