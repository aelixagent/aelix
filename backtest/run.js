#!/usr/bin/env node
// backtest/run.js
//
// CLI runner for the offline backtest engine.
//
//   node backtest/run.js --strategy <name> --bars <path> [options]
//
// Options:
//   --strategy <name>   mean-reversion | left-side-accumulation   (aliases: mr | left-side)
//   --bars <path>       JSON file: [{date,open,high,low,close,volume}, ...] (daily OHLCV)
//   --symbol <sym>      label stamped into the report (default derived from the strategy)
//   --out <path>        where to write the full report (default backtest/reports/<strategy>.json)
//   --desk              ALSO emit the COMPACT summary the dashboard drops into
//                       desk-state.json under "backtests" (printed + written as
//                       backtest/reports/<strategy>.compact.json)
//   --risk <pct>        override risk-per-trade % (defaults: 1 mean-rev, 2 left-side)
//   --start <usd>       starting equity (default 10000)
//   --commission <usd>  per-fill commission (default 0)
//   --slippage <bps>    per-fill slippage in bps (default 5)
//
// LIVE USE: this validator is offline. In production the PM fetches real daily bars for a
// symbol via the `robinhood-trading` MCP tool `get_equity_historicals`, saves them to a
// JSON file shaped exactly like the fixtures ([{date,open,high,low,close,volume}]), and
// passes that file as --bars. Nothing here touches any account or places any order.
//
// Everything this prints/writes is ILLUSTRATIVE. It is NOT a track record and NOT
// financial advice.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBacktest } from './engine.js';
import { computeMetrics, compactSummary } from './metrics.js';
import { meanReversion } from './strategies/mean-reversion.js';
import { leftSideAccumulation } from './strategies/left-side-accumulation.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const STRATEGIES = {
  'mean-reversion': { factory: meanReversion, risk: 1, symbol: 'DEMO-UPTREND' },
  mr: { factory: meanReversion, risk: 1, symbol: 'DEMO-UPTREND', canonical: 'mean-reversion' },
  'left-side-accumulation': { factory: leftSideAccumulation, risk: 2, symbol: 'DEMO-DRAWDOWN' },
  'left-side': { factory: leftSideAccumulation, risk: 2, symbol: 'DEMO-DRAWDOWN', canonical: 'left-side-accumulation' },
};

function parseArgs(argv) {
  const args = { desk: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--desk') args.desk = true;
    else if (a.startsWith('--')) {
      args[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function die(msg) {
  console.error(`error: ${msg}`);
  console.error('usage: node backtest/run.js --strategy <name> --bars <path> [--out <p>] [--symbol <s>] [--desk]');
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const stratKey = args.strategy;
  if (!stratKey) die('missing --strategy');
  const entry = STRATEGIES[stratKey];
  if (!entry) die(`unknown --strategy "${stratKey}" (known: ${Object.keys(STRATEGIES).join(', ')})`);
  const canonical = entry.canonical || stratKey;
  if (!args.bars) die('missing --bars <path>');

  const barsPath = resolve(process.cwd(), args.bars);
  let bars;
  try {
    bars = JSON.parse(readFileSync(barsPath, 'utf8'));
  } catch (e) {
    die(`could not read/parse bars at ${barsPath}: ${e.message}`);
  }
  if (!Array.isArray(bars) || bars.length < 2) die('bars must be a JSON array of >= 2 OHLCV objects');
  for (const b of bars) {
    if (b == null || b.date == null || b.open == null || b.high == null || b.low == null || b.close == null) {
      die('each bar needs {date, open, high, low, close, volume}');
    }
  }

  const params = {
    startingEquityUsd: args.start != null ? Number(args.start) : 10000,
    riskPerTradePct: args.risk != null ? Number(args.risk) : entry.risk,
    perTradeCapPct: 15,
    concentrationCapPct: 25,
    stopLossPct: 8,
    commissionUsd: args.commission != null ? Number(args.commission) : 0,
    slippageBps: args.slippage != null ? Number(args.slippage) : 5,
  };
  const symbol = args.symbol || entry.symbol;

  const report = runBacktest({ bars, strategy: entry.factory, params, meta: { strategy: canonical, symbol } });
  computeMetrics(report);
  // run.js stamps the actual run time (the engine default is a fixed author-time date).
  report.generatedAt = new Date().toISOString();

  const compact = compactSummary(report); // reads report._internals before we strip it
  delete report._internals; // not part of the committed report schema

  const outPath = args.out ? resolve(process.cwd(), args.out) : resolve(HERE, 'reports', `${canonical}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  printSummary(report, outPath);

  if (args.desk) {
    const compactPath = resolve(HERE, 'reports', `${canonical}.compact.json`);
    writeFileSync(compactPath, JSON.stringify(compact, null, 2) + '\n');
    console.log('\n--- COMPACT (desk-state.json "backtests[]") -------------------------');
    console.log(JSON.stringify(compact));
    console.log(`written: ${compactPath}`);
  }
}

function printSummary(report, outPath) {
  const m = report.metrics;
  const p = report.period;
  const row = (k, v) => `  ${k.padEnd(20)} ${v}`;
  console.log(`\nBACKTEST  ${report.strategy}  ::  ${report.symbol}   (ILLUSTRATIVE — not a track record)`);
  console.log(`  period               ${p.from} -> ${p.to}  (${p.bars} bars)`);
  console.log(row('totalReturn%', fmt(m.totalReturnPct)));
  console.log(row('buyHoldReturn%', fmt(m.buyHoldReturnPct)));
  console.log(row('trades', m.trades));
  console.log(row('winRate%', fmt(m.winRatePct)));
  console.log(row('avgWin% / avgLoss%', `${fmt(m.avgWinPct)} / ${fmt(m.avgLossPct)}`));
  console.log(row('profitFactor', fmt(m.profitFactor)));
  console.log(row('maxDrawdown%', fmt(m.maxDrawdownPct)));
  console.log(row('avgHoldDays', fmt(m.avgHoldDays)));
  console.log(row('exposure%', fmt(m.exposurePct)));
  console.log(row('sharpe', fmt(m.sharpe)));
  console.log(`  trades:`);
  for (const t of report.trades) {
    console.log(
      `    ${t.entryDate} -> ${t.exitDate}  x${String(t.qty).padStart(3)}  @${fmt(t.entryPrice)} -> ${fmt(t.exitPrice)}  ${String(t.exitReason).padEnd(12)} pnl ${fmt(t.pnlPct)}%  hold ${t.holdDays}d`
    );
  }
  console.log(`  report written: ${outPath}`);
}

const fmt = (n) => (typeof n === 'number' ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : String(n));

main();
