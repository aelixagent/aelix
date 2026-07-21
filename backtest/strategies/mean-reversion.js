// backtest/strategies/mean-reversion.js
//
// Encodes strategies/mean-reversion.md — "buy oversold pullbacks inside an uptrend".
// Long-only, one open position at a time (no averaging, per that strategy's rules).
//
// The engine calls this instance as:
//   prepare(bars)            -> ctx (precomputed indicator arrays)
//   entrySignal(ctx, i)      -> order | null   (only when flat)
//   exitSignal(ctx, i, pos)  -> { reason } | null
// No addSignal — mean-reversion never scales in.
//
// Signal mapping to the .md rules:
//   ENTRY (all must hold on bar i's close):
//     1. Uptrend intact : close > 50DMA AND the 50DMA is RISING (sma50[i] > sma50[i-5]).
//     2. Oversold       : a clear pullback — RSI(14) <= rsiOversold (30) OR price tagging
//                         a defined support level. Two support tags are honored: the bar's
//                         low reaching the rising 50DMA (the classic "pullback to the
//                         average" in an uptrend), or the low piercing the lower Bollinger
//                         band (-kσ). This mirrors the .md's explicit "RSI<=30 OR tagging
//                         the lower end of its recent range / a defined support level"
//                         OR-clause. In a genuine uptrend a 14-period Wilder RSI rarely
//                         reaches 30 while price is still above a rising 50DMA (that much
//                         weakness usually breaks the 50DMA first), and a -2σ band tag sits
//                         well below the 50DMA — so the 50DMA-support tag is what fires on
//                         the shallow, above-trend pullbacks this strategy actually wants.
//     3. Stabilization  : the latest bar is NOT a fresh lower-low crash — either it
//                         closed up vs the prior bar, or it printed a higher/equal low.
//   (The .md's "backdrop not risk-off / no earnings / fundamentals >= 0" gates are
//    fundamental/macro judgments with no price proxy — they are enforced by the live
//    desk sub-agents, NOT here. Documented as a simplification in README.md.)
//   EXIT (any one, checked after the engine's hard -8% stop):
//     - Target     : RSI(14) >= rsiTarget (55) OR close reclaims the 20DMA.
//     - Trend break: close < 50DMA.
//     - Time stop  : held >= maxHoldDays (10) trading bars.
//
// Sizing is risk-based in the engine: risk 1% of NAV to the -8% hard stop, capped by the
// 15% per-trade and 25% concentration limits.

import { sma, rsi, bollinger } from '../indicators.js';

export function meanReversion(params = {}) {
  const rsiOversold = params.rsiOversold ?? 30;
  const rsiTarget = params.rsiTarget ?? 55;
  const trendLen = params.trendLen ?? 50;
  const reclaimLen = params.reclaimLen ?? 20;
  const risingLookback = params.risingLookback ?? 5;
  const maxHoldDays = params.maxHoldDays ?? 10;
  const bbLen = params.bbLen ?? 20;
  const bbK = params.bbK ?? 2;
  const tagBandPct = params.tagBandPct ?? 0.005; // "tag" tolerance around the 50DMA (0.5%)
  const riskPct = params.riskPerTradePct ?? 1;
  const stopPct = params.stopLossPct ?? 8;

  return {
    name: 'mean-reversion',
    // Need sma50 plus its 5-bar-ago value to judge "rising".
    warmup: trendLen + risingLookback,

    prepare(bars) {
      const closes = bars.map((b) => b.close);
      const bb = bollinger(closes, bbLen, bbK);
      return {
        bars,
        closes,
        sma50: sma(closes, trendLen),
        sma20: sma(closes, reclaimLen),
        rsi14: rsi(closes, 14),
        bbLower: bb.lower,
      };
    },

    entrySignal(ctx, i) {
      const { bars, closes, sma50, rsi14, bbLower } = ctx;
      const s50 = sma50[i];
      const s50Prev = sma50[i - risingLookback];
      const r = rsi14[i];
      if (s50 == null || s50Prev == null || r == null) return null;

      const uptrend = closes[i] > s50 && s50 > s50Prev; // above a rising 50DMA
      // Oversold OR tagging a defined support level. The support tags use the bar's LOW
      // (a dip that trades down to support intraday) so they coincide with a stabilizing
      // close (hammer) rather than excluding it. Support = the rising 50DMA itself, or the
      // lower Bollinger band. Requiring the close to still be above the 50DMA (the trend
      // gate) makes the 50DMA-tag a genuine "pullback held the average" event.
      const tag50 = bars[i].low <= s50 * (1 + tagBandPct);
      const tagBand = bbLower[i] != null && bars[i].low <= bbLower[i];
      const oversold = r <= rsiOversold || tag50 || tagBand;
      // Stabilization: not a fresh lower-low breakdown candle.
      const stabilizing =
        closes[i] >= closes[i - 1] || bars[i].low >= bars[i - 1].low;

      if (uptrend && oversold && stabilizing) {
        return {
          reason: 'oversold-dip', // entry reason (report uses exitReason only)
          riskPct,
          stopMode: 'pct',
          stopPct, // -8% hard stop → sizing distance
          sizeFraction: 1,
        };
      }
      return null;
    },

    exitSignal(ctx, i, pos) {
      const { closes, sma50, sma20, rsi14 } = ctx;
      const r = rsi14[i];
      const s20 = sma20[i];
      const s50 = sma50[i];

      // Target: momentum recovered OR price reclaimed the 20DMA.
      if ((r != null && r >= rsiTarget) || (s20 != null && closes[i] >= s20)) {
        return { reason: 'target' };
      }
      // Trend break: closed back below the 50DMA → thesis invalidated.
      if (s50 != null && closes[i] < s50) {
        return { reason: 'trend-break' };
      }
      // Time stop: no reversion after maxHoldDays.
      if (i - pos.entryIndex >= maxHoldDays) {
        return { reason: 'time' };
      }
      return null;
    },
  };
}

export default meanReversion;
