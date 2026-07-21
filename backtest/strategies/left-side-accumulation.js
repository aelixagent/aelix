// backtest/strategies/left-side-accumulation.js
//
// Encodes strategies/left-side-accumulation.md — the planned, risk-budgeted scale-in at
// support in a quality name's fear-driven selloff. This is the *defined exception* to
// "no averaging into losers": the full ladder (both levels, both tranche sizes, the
// total $ budget, and the whole-position kill-stop) is fixed BEFORE tranche 1, and total
// risk never grows.
//
// The engine calls this instance as:
//   prepare(bars)             -> ctx
//   entrySignal(ctx, i)       -> order (opens tranche 1) | null   (only when flat)
//   addSignal(ctx, i, pos)    -> order (opens tranche 2) | null
//   exitSignal(ctx, i, pos)   -> { reason } | null
//
// LADDER (planned up front, on the bar that first qualifies the value zone):
//   Value zone gate (ALL): drawdown from the running high <= -drawdownPct (20%), AND
//     (RSI(14) <= 30 OR close <= lower Bollinger band (-2σ)), AND a stabilization sign
//     (not an accelerating-crash candle: closed up vs prior, or closed in the upper half
//     of its range).
//   Tranche 1 = 60% of planned size, filled at first contact with the zone (≈ now).
//   Tranche 2 = 40%, at the deeper support ≈ T1 * (1 - trancheGapPct) (~-11%), only when
//     price reaches it AND that bar also stabilizes.
//   Kill-stop (WHOLE position) = T2 * (1 - killStopPct) (~-8% under the deepest tranche).
//   Planned average basis = 0.6*T1 + 0.4*T2 → used with the kill-stop to size the ladder
//   so total position risk <= 2% of NAV (the engine enforces this; with a wide kill-stop
//   the 2% risk cap usually binds before the 25% concentration cap).
//
// EXIT (scale-out is SIMPLIFIED to a single full exit — see "Simplifications"):
//   - Target : close reclaims the 50DMA OR RSI(14) >= rsiTarget (55).
//   - Time   : held >= maxHoldDays (~8 weeks = 40 trading bars) with no reversal.
//   - Stop   : handled by the engine when close <= the kill-stop (exitReason "stop").
//
// SIMPLIFICATIONS (faithful-but-reduced; enforced live by the desk sub-agents, not here):
//   * FUNDAMENTAL GATES ARE NOT MODELED. The .md requires quality (fundamental >= +1),
//     "fear not thesis-break", and a fundamental-kill exit. A price backtest has no
//     fundamentals, so those are the live Fundamental/Macro analysts' job. Here we only
//     model the PRICE structure of the ladder. Do not read this as a claim the price
//     rules alone are sufficient — they are not.
//   * Two tranches only (matches the .md "two tranches max" low-touch default).
//   * Scale-OUT is collapsed to one full exit on the first strength signal, rather than
//     trimming in pieces. Conservative for reporting a single per-trade P&L.
//   * Stops evaluate on the daily CLOSE (the .md prefers a weekly close); daily close is
//     the finest granularity these bars carry.

import { sma, rsi, bollinger } from '../indicators.js';

export function leftSideAccumulation(params = {}) {
  const drawdownPct = params.drawdownPct ?? 20; // >= 20% off the running high
  const rsiOversold = params.rsiOversold ?? 30;
  const rsiTarget = params.rsiTarget ?? 60; // .md says trim at RSI 55-60; use 60 so the
  // primary scale-out is the 50DMA reclaim (trend-repaired), with RSI as the backstop
  const trancheGapPct = params.trancheGapPct ?? 0.11; // T2 ≈ 11% below T1
  const killStopPct = params.killStopPct ?? 0.08; // kill-stop ≈ 8% below T2
  const t1Fraction = params.t1Fraction ?? 0.6;
  const t2Fraction = params.t2Fraction ?? 0.4;
  const maxHoldDays = params.maxHoldDays ?? 40; // ~8 trading weeks
  const bbLen = params.bbLen ?? 20;
  const bbK = params.bbK ?? 2;
  const trendLen = params.trendLen ?? 50;
  const riskPct = params.riskPerTradePct ?? 2; // total-position risk cap (2% of NAV)

  return {
    name: 'left-side-accumulation',
    warmup: trendLen,

    prepare(bars) {
      const closes = bars.map((b) => b.close);
      // Running (expanding) high of closes → the "off the high" drawdown reference.
      const runHigh = new Array(closes.length);
      let m = -Infinity;
      for (let i = 0; i < closes.length; i++) {
        if (closes[i] > m) m = closes[i];
        runHigh[i] = m;
      }
      const bb = bollinger(closes, bbLen, bbK);
      return {
        bars,
        closes,
        runHigh,
        rsi14: rsi(closes, 14),
        sma50: sma(closes, trendLen),
        bbLower: bb.lower,
      };
    },

    entrySignal(ctx, i) {
      const { bars, closes, runHigh, rsi14, bbLower } = ctx;
      const r = rsi14[i];
      if (r == null || runHigh[i] == null) return null;

      const dd = ((closes[i] - runHigh[i]) / runHigh[i]) * 100; // <= 0
      const deepEnough = dd <= -drawdownPct;
      const oversold = r <= rsiOversold || (bbLower[i] != null && closes[i] <= bbLower[i]);
      const stabilizing = isStabilizing(bars, i);
      if (!(deepEnough && oversold && stabilizing)) return null;

      // Plan the whole ladder now (fixed before the first buy).
      const t1 = closes[i];
      const t2 = t1 * (1 - trancheGapPct);
      const killStop = t2 * (1 - killStopPct);
      const plannedAvgBasis = t1Fraction * t1 + t2Fraction * t2;

      return {
        reason: 'ladder-T1',
        riskPct, // total-position risk budget (2% of NAV)
        stopMode: 'abs',
        stopPrice: killStop, // whole-position kill-stop
        refPrice: plannedAvgBasis, // per-share risk = avg basis - kill-stop
        sizeFraction: t1Fraction, // buy 60% now
        t2Level: t2, // remembered on the position for the T2 add
      };
    },

    // Tranche 2: only after T1, only at/below the pre-named deeper level, only on a
    // stabilizing bar. Never chases above the planned level; if price never reaches T2,
    // the position simply stays partial (a win, per the .md).
    addSignal(ctx, i, pos) {
      if (pos.tranchesFilled >= 2) return null;
      if (pos.t2Level == null) return null;
      const { bars, closes } = ctx;
      if (closes[i] > pos.t2Level) return null; // not deep enough yet
      if (!isStabilizing(bars, i)) return null; // don't add on a crash candle
      return { reason: 'ladder-T2', sizeFraction: t2Fraction };
    },

    exitSignal(ctx, i, pos) {
      const { closes, sma50, rsi14 } = ctx;
      const r = rsi14[i];
      const s50 = sma50[i];
      // Scale-out (simplified to a full exit) into strength.
      if ((s50 != null && closes[i] >= s50) || (r != null && r >= rsiTarget)) {
        return { reason: 'target' };
      }
      // Time stop: fully/partly built and dead money for ~8 weeks.
      if (i - pos.entryIndex >= maxHoldDays) {
        return { reason: 'time' };
      }
      return null;
    },
  };
}

// Not an accelerating-crash candle: closed up vs the prior bar, OR closed in the upper
// half of its own range (a close off the lows / reversal hint).
function isStabilizing(bars, i) {
  if (i < 1) return false;
  const b = bars[i];
  const mid = (b.high + b.low) / 2;
  return b.close >= bars[i - 1].close || b.close > mid;
}

export default leftSideAccumulation;
