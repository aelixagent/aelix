// backtest/indicators.js
//
// Pure, dependency-free technical indicators over OHLCV arrays.
//
// Conventions (match these everywhere):
//  - Every function returns a NEW array (or object of arrays) the SAME length as the
//    input, with `null` in the leading slots where the value is undefined (not enough
//    history yet). This keeps every series index-aligned to the bar array.
//  - NO LOOK-AHEAD: the value at index i is computed only from data at indices <= i.
//  - "vals" params take a flat number[] (typically closes). "bars" params take an
//    OHLCV object[] shaped { open, high, low, close, volume }.
//
// These are illustrative building blocks for an offline strategy validator — not a
// trading recommendation and not a track record.

/** Simple moving average of `vals` over `n` periods. */
export function sma(vals, n) {
  const out = new Array(vals.length).fill(null);
  if (n <= 0) return out;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= n) sum -= vals[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Exponential moving average of `vals` over `n`. Seeded with the SMA of the first n. */
export function ema(vals, n) {
  const out = new Array(vals.length).fill(null);
  if (n <= 0 || vals.length < n) return out;
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = 0; i < n; i++) seed += vals[i];
  let prev = seed / n;
  out[n - 1] = prev;
  for (let i = n; i < vals.length; i++) {
    prev = vals[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder's RSI of `closes` over `n` (default 14). Bounded 0..100.
 * First value lands at index n (needs n price deltas); indices < n are null.
 */
export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0;
  let loss = 0;
  // Seed: average gain/loss over the first n deltas (indices 1..n).
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / n;
  let avgLoss = loss / n;
  out[n] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  // Wilder smoothing for the rest.
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (n - 1) + g) / n;
    avgLoss = (avgLoss * (n - 1) + l) / n;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * Wilder's Average True Range over `bars` and `n` (default 14).
 * First value at index n; indices < n are null.
 */
export function atr(bars, n = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length <= n) return out;
  const tr = new Array(bars.length).fill(null);
  tr[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  // Seed ATR = mean of TR[1..n].
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += tr[i];
  let prev = sum / n;
  out[n] = prev;
  for (let i = n + 1; i < bars.length; i++) {
    prev = (prev * (n - 1) + tr[i]) / n;
    out[i] = prev;
  }
  return out;
}

/** Rolling maximum of bar highs over `n`. Leading n-1 slots are null. */
export function rollingHigh(bars, n) {
  const out = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i < n - 1) continue;
    let m = -Infinity;
    for (let j = i - n + 1; j <= i; j++) if (bars[j].high > m) m = bars[j].high;
    out[i] = m;
  }
  return out;
}

/** Rolling minimum of bar lows over `n`. Leading n-1 slots are null. */
export function rollingLow(bars, n) {
  const out = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i < n - 1) continue;
    let m = Infinity;
    for (let j = i - n + 1; j <= i; j++) if (bars[j].low < m) m = bars[j].low;
    out[i] = m;
  }
  return out;
}

/** Rolling population standard deviation of `vals` over `n`. Leading n-1 slots null. */
export function stddev(vals, n) {
  const out = new Array(vals.length).fill(null);
  if (n <= 0) return out;
  for (let i = n - 1; i < vals.length; i++) {
    let mean = 0;
    for (let j = i - n + 1; j <= i; j++) mean += vals[j];
    mean /= n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = vals[j] - mean;
      v += d * d;
    }
    out[i] = Math.sqrt(v / n);
  }
  return out;
}

/**
 * Bollinger bands on `closes` over `n` with `k` standard deviations.
 * Returns { mid, upper, lower } — three arrays aligned to input length.
 */
export function bollinger(closes, n, k = 2) {
  const mid = sma(closes, n);
  const sd = stddev(closes, n);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null || sd[i] == null) continue;
    upper[i] = mid[i] + k * sd[i];
    lower[i] = mid[i] - k * sd[i];
  }
  return { mid, upper, lower };
}

/** Convenience: pull a flat array of a single OHLCV field from bars. */
export function field(bars, key) {
  return bars.map((b) => b[key]);
}
