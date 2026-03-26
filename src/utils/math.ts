import { Decimal } from 'decimal.js';

export function _ema(closes: number[], p: number): number[] {
  if (!closes.length) return [];
  const k = new Decimal(2).div(p + 1);
  let e = new Decimal(closes[0]);
  return closes.map((v, i) => {
    if (i === 0) return e.toNumber();
    const val = new Decimal(v);
    // e = val * k + e * (1 - k)
    e = val.mul(k).plus(e.mul(new Decimal(1).minus(k)));
    return e.toNumber();
  });
}

export function _rsi(closes: number[], period = 14): number {
  try {
    if (closes.length < period + 2) return 50;
    let g = new Decimal(0);
    let l = new Decimal(0);
    for (let i = closes.length - period - 1; i < closes.length - 1; i++) {
      const d = new Decimal(closes[i + 1]).minus(closes[i]);
      if (d.gt(0)) {
        g = g.plus(d);
      } else {
        l = l.plus(d.abs());
      }
    }
    const ag = g.div(period);
    const al = l.div(period);
    if (al.isZero()) return 100;
    const rs = ag.div(al);
    // 100 - 100 / (1 + rs)
    return new Decimal(100).minus(new Decimal(100).div(new Decimal(1).plus(rs))).toNumber();
  } catch {
    return 50;
  }
}

export function _macd(closes: number[]) {
  try {
    const e12 = _ema(closes, 12);
    const e26 = _ema(closes, 26);
    const ml = e12.map((v, i) => new Decimal(v).minus(e26[i]).toNumber());
    const sl = _ema(ml, 9);
    const last = ml.length - 1;
    const macdVal = new Decimal(ml[last]);
    const signalVal = new Decimal(sl[last]);
    return {
      MACD: macdVal.toNumber(),
      signal: signalVal.toNumber(),
      histogram: macdVal.minus(signalVal).toNumber()
    };
  } catch {
    return null;
  }
}

export function _sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const sum = closes.slice(-period).reduce((a, b) => a.plus(b), new Decimal(0));
  return sum.div(period).toNumber();
}
