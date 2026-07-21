// backtest/metrics.js
//
// Turns a completed run's { trades, equityCurve, closes } into the report `metrics`
// block, plus the COMPACT summary the dashboard embeds in desk-state.json.
//
// Everything is guarded so a degenerate run (no trades, flat equity, <2 returns) yields
// clean zeros — never NaN/Infinity, which would break JSON and the UI.

const TRADING_DAYS = 252;

const round2 = (n) => Math.round(n * 100) / 100;
const safe = (n) => (Number.isFinite(n) ? n : 0);

/**
 * @param {Object} report the object returned by runBacktest (with _internals)
 * @returns metrics object (also mutates report.metrics and drops _internals)
 */
export function computeMetrics(report) {
  const { trades, equityCurve } = report;
  const internals = report._internals || {};
  const closes = internals.closes || [];
  const startingEquity = report.params?.startingEquityUsd ?? equityCurve[0]?.equity ?? 0;
  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : startingEquity;

  const totalReturnPct = startingEquity > 0 ? ((finalEquity / startingEquity) - 1) * 100 : 0;

  // Buy & hold: buy the first close, hold to the last close.
  let buyHoldReturnPct = 0;
  if (closes.length >= 2 && closes[0] > 0) {
    buyHoldReturnPct = ((closes[closes.length - 1] / closes[0]) - 1) * 100;
  }

  const n = trades.length;
  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd < 0);
  const winRatePct = n > 0 ? (wins.length / n) * 100 : 0;
  const avgWinPct = wins.length ? mean(wins.map((t) => t.pnlPct)) : 0;
  const avgLossPct = losses.length ? mean(losses.map((t) => t.pnlPct)) : 0;

  const grossProfit = wins.reduce((a, t) => a + t.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnlUsd, 0));
  let profitFactor;
  if (grossLoss > 0) profitFactor = grossProfit / grossLoss;
  else profitFactor = grossProfit > 0 ? 99.99 : 0; // no losses → sentinel (JSON-safe)

  const maxDrawdownPct = maxDrawdown(equityCurve); // <= 0
  const avgHoldDays = n > 0 ? mean(trades.map((t) => t.holdDays)) : 0;

  const bars = equityCurve.length;
  const exposurePct = bars > 0 ? (safe(internals.inPositionBars) / bars) * 100 : 0;

  const sharpe = simpleSharpe(equityCurve);

  const metrics = {
    totalReturnPct: round2(totalReturnPct),
    buyHoldReturnPct: round2(buyHoldReturnPct),
    trades: n,
    winRatePct: round2(winRatePct),
    avgWinPct: round2(avgWinPct),
    avgLossPct: round2(avgLossPct),
    profitFactor: round2(profitFactor),
    maxDrawdownPct: round2(maxDrawdownPct),
    avgHoldDays: round2(avgHoldDays),
    exposurePct: round2(exposurePct),
    sharpe: round2(sharpe),
  };
  report.metrics = metrics;
  return metrics;
}

/** Max peak-to-trough drawdown of the equity curve, as a non-positive percent. */
export function maxDrawdown(equityCurve) {
  let peak = -Infinity;
  let worst = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = ((p.equity - peak) / peak) * 100;
      if (dd < worst) worst = dd;
    }
  }
  return worst; // <= 0
}

/** Simple daily-return Sharpe (rf=0), annualized by sqrt(252). 0 if degenerate. */
export function simpleSharpe(equityCurve) {
  const rets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) rets.push(equityCurve[i].equity / prev - 1);
  }
  if (rets.length < 2) return 0;
  const m = mean(rets);
  const sd = Math.sqrt(mean(rets.map((r) => (r - m) * (r - m))));
  if (sd === 0) return 0;
  return (m / sd) * Math.sqrt(TRADING_DAYS);
}

/**
 * COMPACT summary the dashboard reads inside desk-state.json (array under "backtests").
 * @param {Object} report a report whose metrics are already computed
 * @param {number} [points] target spark length (default ~40)
 */
export function compactSummary(report, points = 40) {
  const internals = report._internals || {};
  const closes = internals.closes || [];
  const startingEquity = report.params?.startingEquityUsd ?? 0;
  const equitySpark = downsample(report.equityCurve.map((p) => p.equity), points).map(round2);

  // Buy & hold equity path (for an optional comparison spark).
  let buyHoldSpark;
  if (closes.length >= 2 && closes[0] > 0 && startingEquity > 0) {
    const bh = closes.map((c) => (startingEquity * c) / closes[0]);
    buyHoldSpark = downsample(bh, points).map(round2);
  }

  return {
    strategy: report.strategy,
    symbol: report.symbol,
    period: report.period,
    metrics: report.metrics,
    equitySpark,
    ...(buyHoldSpark ? { buyHoldSpark } : {}),
  };
}

/** Evenly downsample a numeric array to at most `points` values, keeping first & last. */
export function downsample(arr, points) {
  if (arr.length <= points) return arr.slice();
  const out = [];
  const step = (arr.length - 1) / (points - 1);
  for (let i = 0; i < points; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

function mean(a) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
