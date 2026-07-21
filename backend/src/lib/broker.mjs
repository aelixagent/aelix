// broker.mjs — the per-user connection to the Robinhood Agentic account.
//
// One BrokerClient per user. Two implementations:
//   MockBroker : deterministic demo data, no network, no real account. Default —
//                lets the whole service run/CI without credentials.
//   McpBroker  : calls the real robinhood-trading MCP (HTTP) with the user's OAuth
//                token. Read-only tools are used here; ORDER PLACEMENT is never done
//                autonomously by this service (the public product is Rule-Keeper +
//                X-Ray + alerts, not a discretionary auto-trader — see backend/README).
//
// The interface both implement:
//   getAccount()            -> { name, connected, equity, cash, buyingPower, dayPnl, dayPnlPct, openPositions, ordersToday }
//   getPositions()          -> [{ symbol, qty, avgCost, last, value, pnl, pnlPct, weightPct, stop, sector }]
//   getQuote(symbol)        -> { symbol, last, changePct }
//   getFundamentals(symbol) -> { symbol, pe, sector, marketCap }
//   getEarningsCalendar(syms)-> [{ symbol, date, inDays }]
//   getOrdersToday()        -> number

// ── Deterministic demo dataset (a plausible small Agentic account) ───────────
const DEMO = {
  account: {
    name: 'Robinhood Agentic (demo)',
    equity: 10000,
    cash: 2600,
    dayPnl: -140,
  },
  positions: [
    { symbol: 'AAPL', qty: 10, avgCost: 195, last: 208, sector: 'Technology' },
    { symbol: 'MSFT', qty: 6, avgCost: 402, last: 415, sector: 'Technology' },
    { symbol: 'NVDA', qty: 4, avgCost: 168, last: 152, sector: 'Technology' },
    { symbol: 'KO', qty: 12, avgCost: 61, last: 63, sector: 'Consumer Staples' },
  ],
  quotes: {
    AAPL: 208, MSFT: 415, NVDA: 152, KO: 63, GOOGL: 178, JPM: 205, XOM: 118, PG: 168,
  },
  fundamentals: {
    AAPL: { pe: 31, sector: 'Technology', marketCap: 3.1e12 },
    MSFT: { pe: 34, sector: 'Technology', marketCap: 3.0e12 },
    NVDA: { pe: 18, sector: 'Technology', marketCap: 2.1e12 },
    KO: { pe: 24, sector: 'Consumer Staples', marketCap: 2.7e11 },
  },
  earnings: {
    NVDA: 5, // days away
    MSFT: 22,
  },
}

class MockBroker {
  constructor() {
    this.connected = true
  }
  async getAccount() {
    const positions = await this.getPositions()
    const posValue = positions.reduce((s, p) => s + p.value, 0)
    const equity = DEMO.account.cash + posValue
    return {
      name: DEMO.account.name,
      connected: true,
      equity: round2(equity),
      cash: DEMO.account.cash,
      buyingPower: DEMO.account.cash,
      dayPnl: DEMO.account.dayPnl,
      dayPnlPct: round2((DEMO.account.dayPnl / equity) * 100),
      openPositions: positions.length,
      ordersToday: 1,
    }
  }
  async getPositions() {
    const rows = DEMO.positions.map((p) => {
      const value = p.qty * p.last
      const pnl = (p.last - p.avgCost) * p.qty
      return {
        ...p,
        value: round2(value),
        pnl: round2(pnl),
        pnlPct: round2(((p.last - p.avgCost) / p.avgCost) * 100),
        stop: round2(p.avgCost * 0.92),
      }
    })
    const total = rows.reduce((s, p) => s + p.value, 0) + DEMO.account.cash
    for (const r of rows) r.weightPct = round2((r.value / total) * 100)
    return rows
  }
  async getQuote(symbol) {
    const last = DEMO.quotes[symbol] ?? 100
    return { symbol, last, changePct: 0 }
  }
  async getFundamentals(symbol) {
    return DEMO.fundamentals[symbol] || { symbol, pe: null, sector: 'Unknown', marketCap: null }
  }
  async getEarningsCalendar(symbols = []) {
    return symbols
      .filter((s) => DEMO.earnings[s] != null)
      .map((s) => ({ symbol: s, inDays: DEMO.earnings[s] }))
  }
  async getOrdersToday() {
    return 1
  }
}

// ── Real MCP-over-HTTP client (skeleton) ─────────────────────────────────────
// Robinhood's MCP uses an HTTP transport. This issues JSON-RPC "tools/call"
// requests with the user's OAuth token. Tool names must be verified against the
// live server (`claude mcp get robinhood-trading`) — they are centralized here.
const TOOL = {
  account: 'get_accounts',
  portfolio: 'get_portfolio',
  positions: 'get_equity_positions',
  quotes: 'get_equity_quotes',
  fundamentals: 'get_equity_fundamentals',
  earnings: 'get_earnings_calendar',
  orders: 'get_equity_orders',
}

class McpBroker {
  constructor({ url, accessToken }) {
    this.url = url
    this.accessToken = accessToken
    this._id = 0
  }
  async _call(name, args = {}) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++this._id,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
    if (!res.ok) throw new Error(`MCP ${name} → HTTP ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(`MCP ${name} → ${data.error.message || 'error'}`)
    // MCP tool results arrive as content parts; unwrap the first JSON/text part.
    const content = data.result?.content?.[0]
    if (!content) return data.result
    if (content.type === 'json') return content.json
    if (content.type === 'text') {
      try {
        return JSON.parse(content.text)
      } catch {
        return content.text
      }
    }
    return content
  }
  // NOTE: the mapping from raw MCP payloads to our shapes must be finalized once
  // the live tool response schemas are confirmed. Kept thin + explicit on purpose.
  async getAccount() {
    const p = await this._call(TOOL.portfolio, { account_type: 'agentic' })
    return normalizeAccount(p)
  }
  async getPositions() {
    const p = await this._call(TOOL.positions, { account_type: 'agentic' })
    return Array.isArray(p) ? p.map(normalizePosition) : []
  }
  async getQuote(symbol) {
    const q = await this._call(TOOL.quotes, { symbols: [symbol] })
    const row = Array.isArray(q) ? q[0] : q
    return { symbol, last: Number(row?.last_price ?? row?.last ?? 0), changePct: Number(row?.change_pct ?? 0) }
  }
  async getFundamentals(symbol) {
    const f = await this._call(TOOL.fundamentals, { symbols: [symbol] })
    const row = Array.isArray(f) ? f[0] : f
    return { symbol, pe: row?.pe_ratio ?? null, sector: row?.sector ?? 'Unknown', marketCap: row?.market_cap ?? null }
  }
  async getEarningsCalendar(symbols = []) {
    const e = await this._call(TOOL.earnings, { symbols })
    return Array.isArray(e) ? e : []
  }
  async getOrdersToday() {
    const o = await this._call(TOOL.orders, { account_type: 'agentic' })
    if (!Array.isArray(o)) return 0
    const today = new Date().toISOString().slice(0, 10)
    return o.filter((x) => String(x.created_at || '').startsWith(today)).length
  }
}

function normalizeAccount(p) {
  const equity = Number(p?.total_value ?? 0)
  return {
    name: 'Robinhood Agentic',
    connected: true,
    equity,
    cash: Number(p?.cash ?? p?.buying_power ?? 0),
    buyingPower: Number(p?.buying_power ?? 0),
    dayPnl: Number(p?.day_pnl ?? 0),
    dayPnlPct: Number(p?.day_pnl_pct ?? 0),
    openPositions: Number(p?.open_positions ?? 0),
    ordersToday: 0,
  }
}
function normalizePosition(x) {
  return {
    symbol: x.symbol,
    qty: Number(x.quantity ?? x.qty ?? 0),
    avgCost: Number(x.average_cost ?? x.avg_cost ?? 0),
    last: Number(x.last_price ?? x.last ?? 0),
    value: Number(x.market_value ?? 0),
    pnl: Number(x.unrealized_pnl ?? 0),
    pnlPct: Number(x.unrealized_pnl_pct ?? 0),
    weightPct: Number(x.weight_pct ?? 0),
    stop: Number(x.stop ?? 0),
    sector: x.sector ?? 'Unknown',
  }
}

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Build a broker client for a user.
 * @param {object} opts { mode, url, accessToken }
 */
export function createBroker({ mode, url, accessToken }) {
  if (mode === 'mcp') {
    if (!accessToken) throw new Error('broker mode "mcp" requires the user to have connected an account')
    return new McpBroker({ url, accessToken })
  }
  return new MockBroker()
}
