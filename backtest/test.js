#!/usr/bin/env node
// backtest/test.js
//
// Tiny dependency-free assertion runner. Verifies the indicators against a handful of
// hand-computed values, then runs the engine on BOTH committed fixtures and asserts the
// report invariants the dashboard relies on. Exits non-zero on the first failure.
//
//   node backtest/test.js

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sma, ema, rsi, atr, rollingHigh, rollingLow, stddev, bollinger } from './indicators.js';
import { runBacktest } from './engine.js';
import { computeMetrics, compactSummary } from './metrics.js';
import { meanReversion } from './strategies/mean-reversion.js';
import { leftSideAccumulation } from './strategies/left-side-accumulation.js';

const HERE = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    // console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`);
  }
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const eqArr = (a, b) =>
  a.length === b.length &&
  a.every((x, i) => (x == null && b[i] == null) || (typeof x === 'number' && close(x, b[i], 1e-9)));

// ------------------------------------------------------------------ indicators
function testIndicators() {
  console.log('indicators');

  // sma of a known series
  ok('sma([1..5],3)', eqArr(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]));
  ok('sma leading nulls = n-1', sma([1, 2, 3, 4, 5], 3).slice(0, 2).every((x) => x === null));

  // ema: length + seed = sma of first n, leading nulls
  const e = ema([1, 2, 3, 4, 5, 6], 3);
  ok('ema length', e.length === 6);
  ok('ema leading nulls = n-1', e[0] === null && e[1] === null);
  ok('ema seed = sma(first n)', close(e[2], (1 + 2 + 3) / 3));

  // stddev population: classic example -> 2.0
  const sd = stddev([2, 4, 4, 4, 5, 5, 7, 9], 8);
  ok('stddev population = 2', close(sd[7], 2, 1e-9), `got ${sd[7]}`);

  // rsi bounds + monotone extremes
  const rUp = rsi([...Array(30)].map((_, i) => 10 + i), 14); // strictly increasing
  ok('rsi(increasing) = 100 where defined', rUp.filter((x) => x != null).every((x) => close(x, 100)));
  const rDn = rsi([...Array(30)].map((_, i) => 100 - i), 14); // strictly decreasing
  ok('rsi(decreasing) = 0 where defined', rDn.filter((x) => x != null).every((x) => close(x, 0)));
  ok('rsi leading nulls = n', rUp.slice(0, 14).every((x) => x === null) && rUp[14] != null);

  // atr: leading nulls + positive
  const bars = [...Array(20)].map((_, i) => ({ high: 10 + i + 1, low: 10 + i - 1, close: 10 + i }));
  const a = atr(bars, 14);
  ok('atr leading nulls = n', a.slice(0, 14).every((x) => x === null) && a[14] != null);
  ok('atr positive', a.filter((x) => x != null).every((x) => x > 0));

  // rolling high/low known
  const rb = [{ high: 1, low: 1 }, { high: 3, low: 0 }, { high: 2, low: 0 }, { high: 5, low: 1 }, { high: 4, low: 2 }];
  ok('rollingHigh n=2', eqArr(rollingHigh(rb, 2), [null, 3, 3, 5, 5]));
  ok('rollingLow n=2', eqArr(rollingLow(rb, 2), [null, 0, 0, 0, 1]));

  // bollinger relationships
  const closes = [...Array(30)].map((_, i) => 100 + Math.sin(i / 3) * 5);
  const bb = bollinger(closes, 20, 2);
  const mid = sma(closes, 20);
  ok('bollinger mid == sma', eqArr(bb.mid, mid));
  ok(
    'bollinger upper>=mid>=lower where defined',
    bb.mid.every((mv, i) => mv == null || (bb.upper[i] >= mv && mv >= bb.lower[i]))
  );

  // no look-ahead sanity: sma[i] only depends on <= i (recompute on a prefix)
  const full = sma(closes, 20);
  const prefix = sma(closes.slice(0, 25), 20);
  ok('sma no look-ahead (prefix stable)', eqArr(full.slice(0, 25), prefix));
}

// ------------------------------------------------------------------ engine/fixtures
const VALID_REASONS = new Set(['target', 'stop', 'time', 'trend-break', 'end']);

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(HERE, 'fixtures', name), 'utf8'));
}

function testRun(label, fixture, factory, params, minTrades) {
  console.log(label);
  const bars = loadFixture(fixture);
  const report = runBacktest({ bars, strategy: factory, params, meta: { strategy: label, symbol: 'TEST' } });
  computeMetrics(report);

  ok('equityCurve length == bars', report.equityCurve.length === bars.length, `${report.equityCurve.length} vs ${bars.length}`);
  ok('equityCurve equities finite & > 0', report.equityCurve.every((p) => Number.isFinite(p.equity) && p.equity > 0));
  ok('equityCurve dates align', report.equityCurve.every((p, i) => p.date === bars[i].date));

  ok(`trades >= ${minTrades}`, report.trades.length >= minTrades, `got ${report.trades.length}`);
  for (const t of report.trades) {
    ok('trade has valid exitReason', VALID_REASONS.has(t.exitReason), t.exitReason);
    ok('trade fields finite', [t.entryPrice, t.exitPrice, t.qty, t.pnlUsd, t.pnlPct, t.holdDays].every(Number.isFinite));
    ok('trade qty > 0', t.qty > 0);
    ok('trade holdDays >= 0', t.holdDays >= 0);
    ok('trade pnlPct sign matches pnlUsd', Math.sign(t.pnlPct) === Math.sign(t.pnlUsd));
  }

  const m = report.metrics;
  ok('no NaN/Infinity in metrics', Object.values(m).every((v) => Number.isFinite(v)), JSON.stringify(m));
  ok('maxDrawdownPct <= 0', m.maxDrawdownPct <= 0, `${m.maxDrawdownPct}`);
  ok('winRatePct in 0..100', m.winRatePct >= 0 && m.winRatePct <= 100);
  ok('exposurePct in 0..100', m.exposurePct >= 0 && m.exposurePct <= 100);
  ok('trades metric == trades.length', m.trades === report.trades.length);

  // schema/contract fields present
  ok('schemaVersion == 1', report.schemaVersion === 1);
  ok('has period.from/to/bars', report.period && report.period.from && report.period.to && report.period.bars === bars.length);
  ok('params has all caps', ['startingEquityUsd', 'riskPerTradePct', 'perTradeCapPct', 'concentrationCapPct', 'stopLossPct', 'commissionUsd', 'slippageBps'].every((k) => k in report.params));

  // compact summary is well-formed
  const c = compactSummary(report);
  ok('compact.metrics present', c.metrics && Number.isFinite(c.metrics.totalReturnPct));
  ok('compact.equitySpark <= 40 & finite', c.equitySpark.length <= 40 && c.equitySpark.every(Number.isFinite));

  return report;
}

// ------------------------------------------------------------------ run
console.log('\nbacktest/test.js\n');
testIndicators();
testRun('mean-reversion (uptrend fixture)', 'uptrend.json', meanReversion, {}, 1);
testRun('left-side-accumulation (drawdown fixture)', 'drawdown.json', leftSideAccumulation, { riskPerTradePct: 2 }, 1);

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
