/**
 * src/services/backtestEngine.ts
 * 基礎回測引擎：實作 SMA 交叉策略（含手續費與滑價）
 */

export interface BacktestResult {
  totalReturn: number;
  winRate: number;
  trades: number;
  totalCommission: number;
}

export interface BacktestOptions {
  /** Commission rate per trade (e.g. 0.001425 = 0.1425% for TW stocks) */
  commissionRate?: number;
  /** Slippage per trade as fraction (e.g. 0.001 = 0.1%) */
  slippageRate?: number;
}

export const runSMACrossoverBacktest = (
  history: any[],
  shortPeriod: number = 50,
  longPeriod: number = 200,
  options: BacktestOptions = {}
): BacktestResult => {
  if (history.length < longPeriod) return { totalReturn: 0, winRate: 0, trades: 0, totalCommission: 0 };

  const commRate = options.commissionRate ?? 0.001425; // default: 台股手續費 0.1425%
  const slipRate = options.slippageRate  ?? 0.001;     // default: 滑價 0.1%

  let position = 0; // 0: flat, 1: long
  let balance = 100000;
  let entryPrice = 0;
  let trades = 0;
  let wins = 0;
  let totalCommission = 0;

  for (let i = longPeriod; i < history.length; i++) {
    const shortSMA = history.slice(i - shortPeriod, i).reduce((a, b) => a + b.close, 0) / shortPeriod;
    const longSMA = history.slice(i - longPeriod, i).reduce((a, b) => a + b.close, 0) / longPeriod;

    if (position === 0 && shortSMA > longSMA) {
      // Buy — apply slippage (worse fill) + commission
      position = 1;
      const rawPrice = history[i].close;
      const slippage = rawPrice * slipRate;
      entryPrice = rawPrice + slippage; // pay more on buy
      const commission = entryPrice * commRate;
      totalCommission += commission;
      balance -= commission; // deduct commission from balance
    } else if (position === 1 && shortSMA < longSMA) {
      // Sell — apply slippage (worse fill) + commission
      position = 0;
      const rawPrice = history[i].close;
      const slippage = rawPrice * slipRate;
      const exitPrice = rawPrice - slippage; // receive less on sell
      const commission = exitPrice * commRate;
      totalCommission += commission;
      const profit = (exitPrice - entryPrice) / entryPrice;
      balance *= (1 + profit);
      balance -= commission;
      trades++;
      if (profit > 0) wins++;
    }
  }

  return {
    totalReturn: ((balance - 100000) / 100000) * 100,
    winRate: trades > 0 ? (wins / trades) * 100 : 0,
    trades,
    totalCommission: Math.round(totalCommission * 100) / 100,
  };
};
