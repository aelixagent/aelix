// backtest/engine.js
//
// Event-driven, long-only, single-symbol backtest engine.
//
// Model (kept deliberately conservative — see backtest/README.md "Caveats"):
//  - Daily bars only, no intraday. One decision per bar, evaluated on the CLOSE.
//  - NEXT-BAR-OPEN FILLS: a signal generated on bar i's close is filled at bar i+1's
//    open. This removes look-ahead — we never trade on information from the same bar we
//    act on.
//  - Slippage: buys fill at open*(1+slippageBps/1e4), sells at open*(1-slippageBps/1e4).
//  - Commission: flat commissionUsd charged per fill (entry tranche, add, and exit).
//  - Risk-based sizing: shares = floor( (riskPct% of NAV) / per-share-risk ), then
//    clamped by the per-trade cap, the concentration cap, and available cash.
//  - Hard stop: each position carries a stopPrice. If a bar CLOSES at/below it, the
//    position is flattened at the next open (exitReason "stop"). For mean-reversion the
//    stop is entry*(1 - stopLossPct%) (the -8% per-position guardrail). Left-side
//    accumulation substitutes its own wider, risk-budgeted whole-position kill-stop, as
//    that strategy prescribes (its 2% total-risk cap is what bounds the trade).
//  - SINGLE CONCURRENT POSITION. Mean-reversion is one entry per setup. Left-side may
//    add ONE planned tranche (scale-in) to the same position — that averaging-down is
//    the *defined exception* documented in strategies/left-side-accumulation.md.
//
// Everything here is illustrative. Feeding it real bars does NOT constitute a track
// record or financial advice.

export const DEFAULT_PARAMS = {
  startingEquityUsd: 10000,
  riskPerTradePct: 1, // mean-reversion default; run.js raises to 2 for left-side
  perTradeCapPct: 15, // strategies/README.md per-trade cap
  concentrationCapPct: 25, // strategies/README.md concentration cap
  stopLossPct: 8, // -8% per-position hard stop (mean-reversion)
  commissionUsd: 0,
  slippageBps: 5,
};

const FIXED_GENERATED_AT = '2026-07-11T00:00:00Z';

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Run a backtest.
 * @param {Object} cfg
 * @param {Array}  cfg.bars       OHLCV bars [{date,open,high,low,close,volume}]
 * @param {Function} cfg.strategy strategy factory: (params) => strategy instance
 * @param {Object} [cfg.params]   overrides merged onto DEFAULT_PARAMS
 * @param {Object} [cfg.meta]     { strategy, symbol } stamped into the report
 * @returns {Object} the BACKTEST REPORT object (see backtest/README.md schema)
 */
export function runBacktest({ bars, strategy, params = {}, meta = {} }) {
  if (!Array.isArray(bars) || bars.length < 2) {
    throw new Error('runBacktest: need at least 2 bars');
  }
  const P = { ...DEFAULT_PARAMS, ...params };
  const strat = strategy(P);
  const ctx = strat.prepare(bars);
  const slip = P.slippageBps / 10000;

  const buyFill = (open) => open * (1 + slip);
  const sellFill = (open) => open * (1 - slip);

  // Mutable engine state.
  const state = { cash: P.startingEquityUsd, position: null };
  const trades = [];
  const equityCurve = [];
  let pending = null; // order scheduled on the previous bar, filled at THIS bar's open
  let inPositionBars = 0;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    // 1) Execute any order scheduled on the previous bar, at THIS bar's open.
    if (pending) {
      if (pending.action === 'enter') {
        state.position = openPosition(state, P, buyFill, bar, pending);
      } else if (pending.action === 'add' && state.position) {
        addTranche(state, P, buyFill, bar, pending);
      } else if (pending.action === 'exit' && state.position) {
        trades.push(closePosition(state, P, sellFill, bar, i, pending.reason, false));
        state.position = null;
      }
      pending = null;
    }

    // 2) Generate signals on this bar's CLOSE → schedule for next bar's open.
    //    (Never on the last bar: there is no next open to fill against.)
    if (i >= strat.warmup && i < bars.length - 1) {
      if (state.position) {
        if (bar.close <= state.position.stopPrice) {
          pending = { action: 'exit', reason: 'stop' };
        } else {
          const ex = strat.exitSignal(ctx, i, state.position);
          if (ex) {
            pending = { action: 'exit', reason: ex.reason };
          } else if (strat.addSignal) {
            const add = strat.addSignal(ctx, i, state.position);
            if (add) pending = { action: 'add', ...add };
          }
        }
      } else {
        const en = strat.entrySignal(ctx, i);
        if (en) pending = { action: 'enter', barIndex: i, ...en };
      }
    }

    // 3) Mark-to-market NAV at the close and record the equity-curve point.
    const equity = state.cash + (state.position ? state.position.qty * bar.close : 0);
    equityCurve.push({ date: bar.date, equity: round2(equity) });
    if (state.position) inPositionBars++;
  }

  // 4) Force-close any position still open at the end, at the last bar's close.
  if (state.position) {
    const li = bars.length - 1;
    trades.push(closePosition(state, P, sellFill, bars[li], li, 'end', true));
    state.position = null;
    equityCurve[li].equity = round2(state.cash);
  }

  return {
    schemaVersion: 1,
    strategy: meta.strategy || strat.name,
    symbol: meta.symbol || 'DEMO',
    generatedAt: FIXED_GENERATED_AT,
    params: {
      startingEquityUsd: P.startingEquityUsd,
      riskPerTradePct: P.riskPerTradePct,
      perTradeCapPct: P.perTradeCapPct,
      concentrationCapPct: P.concentrationCapPct,
      stopLossPct: P.stopLossPct,
      commissionUsd: P.commissionUsd,
      slippageBps: P.slippageBps,
    },
    period: { from: bars[0].date, to: bars[bars.length - 1].date, bars: bars.length },
    metrics: null, // filled in downstream by metrics.js (run.js / test.js)
    equityCurve,
    trades,
    _internals: { inPositionBars, closes: bars.map((b) => b.close) },
  };
}

// ----------------------------- fill helpers -----------------------------

function openPosition(state, P, buyFill, bar, order) {
  const fill = buyFill(bar.open);
  const nav = state.cash; // flat → NAV is all cash
  let stopPrice;
  let refPrice;
  if (order.stopMode === 'pct') {
    stopPrice = fill * (1 - order.stopPct / 100);
    refPrice = fill;
  } else {
    stopPrice = order.stopPrice;
    refPrice = order.refPrice != null ? order.refPrice : fill;
  }
  const perShareRisk = refPrice - stopPrice;
  if (perShareRisk <= 0) return null; // guard: no valid stop distance

  const riskUsd = (order.riskPct / 100) * nav;
  let fullShares = Math.floor(riskUsd / perShareRisk);
  // Concentration cap on the FULL planned position (uses ref/plan price).
  const concShares = Math.floor(((P.concentrationCapPct / 100) * nav) / refPrice);
  fullShares = Math.min(fullShares, concShares);
  if (fullShares < 1) return null;

  const frac = order.sizeFraction != null ? order.sizeFraction : 1;
  let shares = Math.floor(fullShares * frac);
  // Per-trade cap on THIS order.
  const perTradeShares = Math.floor(((P.perTradeCapPct / 100) * nav) / fill);
  shares = Math.min(shares, perTradeShares);
  // Cash constraint.
  const affordable = Math.floor((state.cash - P.commissionUsd) / fill);
  shares = Math.min(shares, affordable);
  if (shares < 1) return null;

  const grossCost = shares * fill;
  state.cash -= grossCost + P.commissionUsd;
  return {
    entryIndex: order.barIndex,
    entryDate: bar.date,
    qty: shares,
    grossCost,
    stopPrice,
    plannedShares: fullShares,
    t2Level: order.t2Level != null ? order.t2Level : null,
    tranchesFilled: 1,
    commissionUsd: P.commissionUsd,
  };
}

function addTranche(state, P, buyFill, bar, order) {
  const pos = state.position;
  const fill = buyFill(bar.open);
  const nav = state.cash + pos.qty * bar.open;
  const remaining = pos.plannedShares - pos.qty;
  if (remaining < 1) return;
  const frac = order.sizeFraction != null ? order.sizeFraction : 0.4;
  let shares = Math.min(Math.floor(pos.plannedShares * frac), remaining);
  // Concentration cap on the resulting position.
  const concShares = Math.floor(((P.concentrationCapPct / 100) * nav) / fill) - pos.qty;
  shares = Math.min(shares, concShares);
  // Per-trade cap on this add order.
  const perTradeShares = Math.floor(((P.perTradeCapPct / 100) * nav) / fill);
  shares = Math.min(shares, perTradeShares);
  const affordable = Math.floor((state.cash - P.commissionUsd) / fill);
  shares = Math.min(shares, affordable);
  if (shares < 1) return; // stay partial — a legitimate outcome for left-side

  const grossCost = shares * fill;
  state.cash -= grossCost + P.commissionUsd;
  pos.qty += shares;
  pos.grossCost += grossCost;
  pos.commissionUsd += P.commissionUsd;
  pos.tranchesFilled += 1;
}

function closePosition(state, P, sellFill, bar, exitIndex, reason, useClose) {
  const pos = state.position;
  const px = useClose ? bar.close : bar.open;
  const fill = sellFill(px);
  const grossProceeds = pos.qty * fill;
  const totalCommission = pos.commissionUsd + P.commissionUsd;
  state.cash += grossProceeds - P.commissionUsd;
  const pnlUsd = grossProceeds - pos.grossCost - totalCommission;
  const pnlPct = (pnlUsd / pos.grossCost) * 100;
  return {
    entryDate: pos.entryDate,
    entryPrice: round4(pos.grossCost / pos.qty),
    exitDate: bar.date,
    exitPrice: round4(fill),
    qty: pos.qty,
    pnlUsd: round2(pnlUsd),
    pnlPct: round2(pnlPct),
    exitReason: reason,
    holdDays: exitIndex - pos.entryIndex,
  };
}
