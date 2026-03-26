export function calcEMA(closes: number[], period: number): number[] {
  if (!closes || closes.length === 0) return [];
  const k = 2 / (period + 1);
  let e = closes.slice(0, period).reduce((a, b) => (a || 0) + (b || 0), 0) / Math.min(period, closes.length);
  return closes.map((v, i) => { 
    if (i < period - 1) return v || 0; 
    e = (v || 0) * k + e * (1 - k); 
    return e; 
  });
}
export function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => i < period - 1 ? null : closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
}
export function calcRSI(closes: number[], period = 14): number[] {
  if (closes.length < 2) return closes.map(() => 50);
  const result: number[] = new Array(Math.min(period, closes.length)).fill(50);
  let ag = 0, al = 0;
  const len = Math.min(period, closes.length - 1);
  for (let i = 1; i <= len; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d;
    else al -= d;
  }
  ag /= len; al /= len;
  if (closes.length > period) result[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) { ag = (ag * (period-1) + d) / period; al = al * (period-1) / period; }
    else        { al = (al * (period-1) - d) / period; ag = ag * (period-1) / period; }
    result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return result;
}
export function calcMACD(closes: number[], fast = 12, slow = 26, sig = 9) {
  const e12 = calcEMA(closes, fast), e26 = calcEMA(closes, slow);
  const macd = e12.map((v, i) => v - e26[i]);
  const signal = calcEMA(macd, sig);
  return macd.map((v, i) => ({ MACD: v, signal: signal[i], histogram: v - signal[i] }));
}
export function calcBB(closes: number[], period = 20, mult = 2) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const sl = closes.slice(i - period + 1, i + 1);
    const mean = sl.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    return { upper: mean + mult * std, mid: mean, lower: mean - mult * std };
  });
}
export function calcVWAP(rows: { high: number; low: number; close: number; volume: number }[]) {
  let pv = 0, vol = 0;
  return rows.map(r => { const tp = (r.high + r.low + r.close) / 3; pv += tp * r.volume; vol += r.volume; return vol > 0 ? pv / vol : tp; });
}
export const calculateRSI = calcRSI;
export const calculateMACD = calcMACD;
export const calculateVWAP = calcVWAP;

export function calcKD(closes: number[], high: number[], low: number[], n = 9, m1 = 3, m2 = 3) {
  if (closes.length < n) return closes.map(() => ({ K: 50, D: 50 }));
  const kArr: number[] = [], dArr: number[] = [];
  let k = 50, d = 50;
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) { kArr.push(50); dArr.push(50); continue; }
    const windowSliceLow = low.slice(i - n + 1, i + 1);
    const windowSliceHigh = high.slice(i - n + 1, i + 1);
    if (!windowSliceLow.length || !windowSliceHigh.length) { kArr.push(50); dArr.push(50); continue; }
    const windowLow = Math.min(...windowSliceLow);
    const windowHigh = Math.max(...windowSliceHigh);
    const rsv = windowHigh === windowLow ? 50 : ((closes[i] - windowLow) / (windowHigh - windowLow)) * 100;
    k = (rsv + (m1 - 1) * k) / m1;
    d = (k + (m2 - 1) * d) / m2;
    kArr.push(k); dArr.push(d);
  }
  return kArr.map((v, i) => ({ K: v, D: dArr[i] }));
}
export function calcATR(high: number[], low: number[], close: number[], period = 14): number[] {
  if (!high || !low || !close || high.length < period) return [];
  const tr = high.map((h, i) => {
    if (i === 0) return h - low[i];
    return Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  });
  const atr: number[] = [];
  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  atr.push(sum / period);
  for (let i = period; i < tr.length; i++) {
    sum = (atr[atr.length - 1] * (period - 1) + tr[i]) / period;
    atr.push(sum);
  }
  return atr;
}
export const calculateATR = calcATR;
export const calculateKD = calcKD;
