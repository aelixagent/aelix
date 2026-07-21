#!/usr/bin/env node
// desk-log.mjs — append-only JSONL decision log for the Robinhood Agentic desk.
//
// Realizes Core Principle #3 (Transparency & Audit) and CLAUDE.md step 6
// ("log it where the user asks"). Dependency-free, pure ESM — runs on plain
// `node`, no npm install. See docs/LOGGING.md for the schema and workflow.
//
// This is tooling + documentation. It NEVER places, approves, or modifies an
// order and does not weaken any guardrail: it only records what the desk did.
//
// Library:
//   appendRecord(file, record) -> validates required keys + event enum, then
//                                 appends exactly one JSON line (never rewrites).
//   readTail(file, n)          -> last n parsed records (oldest→newest).
//   toDeskState(records)       -> maps records to the dashboard decisionLog tail.
//   validateFile(file)         -> { ok, count, errors:[{line,message}] }.
//
// CLI:
//   node tools/desk-log.mjs validate  <file.jsonl>       parse + assert every line
//   node tools/desk-log.mjs tail      <file.jsonl> [n]   pretty-print last n
//   node tools/desk-log.mjs deskstate <file.jsonl> [n]   print decisionLog[] JSON

import { appendFileSync, readFileSync, existsSync } from 'node:fs'

// event enum — the only values a decision-log line may carry.
export const ALLOWED_EVENTS = Object.freeze([
  'desk_run',
  'approval',
  'order_placed',
  'order_filled',
  'halt',
  'injection',
])

// Required on every line, regardless of event type.
const REQUIRED_KEYS = ['ts', 'event', 'session']

/**
 * Validate a single decision-log record. Returns null if valid, else a string
 * describing the first problem found. Pure — does no I/O.
 */
export function validateRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return 'record must be a JSON object'
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in record)) return `missing required key "${key}"`
  }
  if (typeof record.ts !== 'string' || record.ts.trim() === '') {
    return '"ts" must be a non-empty ISO-8601 string'
  }
  if (Number.isNaN(Date.parse(record.ts))) {
    return `"ts" is not a parseable date: ${JSON.stringify(record.ts)}`
  }
  if (typeof record.session !== 'string' || record.session.trim() === '') {
    return '"session" must be a non-empty string'
  }
  if (!ALLOWED_EVENTS.includes(record.event)) {
    return `"event" must be one of ${ALLOWED_EVENTS.join('|')}, got ${JSON.stringify(record.event)}`
  }
  return null
}

/**
 * Append exactly one record as a single JSON line. Creates the file if absent,
 * otherwise appends only — it NEVER reads or rewrites existing lines, so the log
 * stays a durable append-only audit trail. Returns the record on success.
 * Throws if the record is invalid (nothing is written on a throw).
 */
export function appendRecord(file, record) {
  const problem = validateRecord(record)
  if (problem) throw new Error(`invalid record: ${problem}`)
  const line = JSON.stringify(record)
  if (line.includes('\n')) {
    // Defensive: JSON.stringify never emits raw newlines, but guard anyway so
    // one record can never smear across two log lines.
    throw new Error('serialized record contains a newline')
  }
  appendFileSync(file, line + '\n')
  return record
}

/**
 * Read and parse the last n records. Blank lines are ignored. Returns [] if the
 * file does not exist. Order is preserved (oldest→newest). Throws on malformed
 * JSON so a corrupt tail is surfaced rather than silently dropped.
 */
export function readTail(file, n = 10) {
  if (!existsSync(file)) return []
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const slice = n > 0 ? lines.slice(-n) : lines
  return slice.map((line, i) => {
    try {
      return JSON.parse(line)
    } catch (err) {
      throw new Error(`could not parse tail line ${i + 1}: ${err.message}`)
    }
  })
}

// ---- dashboard mapping (decisionLog tail shape) --------------------------

const APPROVED = new Set(['approved', 'approve', 'yes', 'confirmed'])
const REJECTED = new Set(['rejected', 'declined', 'denied', 'no'])

/** tone ∈ pos|neg|flat|warn — derived deterministically from the record. */
function toneFor(rec) {
  switch (rec.event) {
    case 'order_filled':
      return 'pos'
    case 'halt':
      return 'neg'
    case 'injection':
      return 'warn'
    case 'approval': {
      const d = String(rec.decision ?? '').toLowerCase()
      if (APPROVED.has(d)) return 'pos'
      if (REJECTED.has(d)) return 'neg'
      return 'flat'
    }
    case 'order_placed':
      return 'flat'
    case 'desk_run':
      // A run that surfaced an injection attempt is worth flagging amber.
      return Number(rec.injectionAlerts) > 0 ? 'warn' : 'flat'
    default:
      return 'flat'
  }
}

/** Which symbol, if any, the row is about. Explicit symbol wins; else proposed. */
function symbolFor(rec) {
  if ('symbol' in rec) return rec.symbol ?? null
  if (rec.proposed && typeof rec.proposed === 'object' && rec.proposed.symbol) {
    return rec.proposed.symbol
  }
  return null
}

/** One-line summary. Prefer the record's own summary; else synthesize one. */
function summaryFor(rec) {
  if (typeof rec.summary === 'string' && rec.summary.trim() !== '') {
    return rec.summary.trim()
  }
  const sym = symbolFor(rec)
  switch (rec.event) {
    case 'desk_run':
      return `Desk run${Array.isArray(rec.tickers) ? ` on ${rec.tickers.join(', ')}` : ''}.`
    case 'approval':
      return `${rec.decision ?? 'decision'}${sym ? ` ${sym}` : ''}${rec.by ? ` by ${rec.by}` : ''}.`
    case 'order_placed':
      return `Placed ${(rec.side ?? '').toUpperCase()} ${rec.qty ?? ''} ${sym ?? ''} (${rec.status ?? 'submitted'}).`.replace(/\s+/g, ' ').trim()
    case 'order_filled':
      return `Filled ${rec.qty ?? ''} ${sym ?? ''} @ ${rec.price ?? '—'}.`.replace(/\s+/g, ' ').trim()
    case 'halt':
      return `Halt${rec.reason ? `: ${rec.reason}` : ''}.`
    case 'injection':
      return `Injection flagged${rec.source ? ` from ${rec.source}` : ''}.`
    default:
      return rec.event
  }
}

/**
 * Map parsed records to the dashboard "decisionLog" tail shape:
 *   { ts, event, summary, symbol, tone }
 * This array is what the PM pastes into desk-state.json.
 */
export function toDeskState(records) {
  return records.map((rec) => ({
    ts: rec.ts,
    event: rec.event,
    summary: summaryFor(rec),
    symbol: symbolFor(rec),
    tone: toneFor(rec),
  }))
}

// ---- file validation (line-numbered) -------------------------------------

/**
 * Validate every line of a JSONL file. Returns { ok, count, errors } where
 * errors is [{ line, message }] with 1-based line numbers. Blank lines are
 * skipped. A missing file is reported as a single error.
 */
export function validateFile(file) {
  if (!existsSync(file)) {
    return { ok: false, count: 0, errors: [{ line: 0, message: `file not found: ${file}` }] }
  }
  const raw = readFileSync(file, 'utf8').split('\n')
  const errors = []
  let count = 0
  raw.forEach((line, idx) => {
    const lineNo = idx + 1
    if (line.trim() === '') return // ignore blank / trailing-newline lines
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch (err) {
      errors.push({ line: lineNo, message: `invalid JSON — ${err.message}` })
      return
    }
    const problem = validateRecord(parsed)
    if (problem) {
      errors.push({ line: lineNo, message: problem })
      return
    }
    count += 1
  })
  return { ok: errors.length === 0, count, errors }
}

// ---- CLI -----------------------------------------------------------------

function usage() {
  return [
    'Usage:',
    '  node tools/desk-log.mjs validate  <file.jsonl>       parse + assert every line',
    '  node tools/desk-log.mjs tail      <file.jsonl> [n]   pretty-print last n (default 10)',
    '  node tools/desk-log.mjs deskstate <file.jsonl> [n]   print decisionLog[] JSON (default 20)',
  ].join('\n')
}

function cliValidate(file) {
  if (!file) {
    console.error('validate: missing <file.jsonl>')
    return 2
  }
  const { ok, count, errors } = validateFile(file)
  if (ok) {
    console.log(`PASS — ${count} valid record${count === 1 ? '' : 's'} in ${file}`)
    return 0
  }
  for (const e of errors) {
    console.error(`FAIL line ${e.line}: ${e.message}`)
  }
  console.error(`FAIL — ${errors.length} bad line${errors.length === 1 ? '' : 's'} (${count} valid) in ${file}`)
  return 1
}

function cliTail(file, nArg) {
  if (!file) {
    console.error('tail: missing <file.jsonl>')
    return 2
  }
  const n = Number.parseInt(nArg ?? '10', 10)
  const records = readTail(file, Number.isNaN(n) ? 10 : n)
  if (records.length === 0) {
    console.log('(no records)')
    return 0
  }
  console.log(JSON.stringify(records, null, 2))
  return 0
}

function cliDeskState(file, nArg) {
  if (!file) {
    console.error('deskstate: missing <file.jsonl>')
    return 2
  }
  const n = Number.parseInt(nArg ?? '20', 10)
  const records = readTail(file, Number.isNaN(n) ? 20 : n)
  console.log(JSON.stringify(toDeskState(records), null, 2))
  return 0
}

function main(argv) {
  const [cmd, file, nArg] = argv
  switch (cmd) {
    case 'validate':
      return cliValidate(file)
    case 'tail':
      return cliTail(file, nArg)
    case 'deskstate':
      return cliDeskState(file, nArg)
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      console.log(usage())
      return cmd === undefined ? 2 : 0
    default:
      console.error(`unknown command: ${cmd}\n\n${usage()}`)
      return 2
  }
}

// Run as CLI only when invoked directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
