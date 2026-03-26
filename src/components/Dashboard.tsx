import { useState, useEffect, useMemo, useCallback, useRef, memo, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  BrainCircuit, 
  Activity, 
  Target,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';
import { theme } from '../lib/theme';
import * as api from '../services/api';
import ChartWidget from './ChartWidget';
import { PerformanceSummary } from './PerformanceSummary';
import { Quote, HistoricalData, AIAnalysisResult, SentimentData } from '../types';
import { useSettings } from '../contexts/SettingsContext';

const MemoizedChartWidget = memo(ChartWidget);

const SubscriptionGate = lazy(() => import('./SubscriptionGate'));
const PaperTradingDashboard = lazy(() => import('./PaperTradingDashboard'));
const StrategyComparison = lazy(() => import('./StrategyComparison'));
const LiveTradingConsole = lazy(() => import('./LiveTradingConsole'));
import { IS_AI_ENABLED } from '../constants';
import { analyzeStock, analyzeSentiment } from '../services/aiService';
import { calculateRSI, calculateMACD, calculateKD, calculateVWAP } from '../lib/indicators';

export default function Dashboard({ model, symbol }: { model: string, symbol: string }) {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [marketData, setMarketData] = useState<Partial<Quote>[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [sentimentAnalysis, setSentimentAnalysis] = useState<SentimentData | null>(null);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSentimentLoading, setIsSentimentLoading] = useState(false);
  const analyzingRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setIsRefreshing(true);
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);
      const period1 = oneYearAgo.toISOString().split('T')[0];

      const [quoteData, historyData, mData, tradesData] = await Promise.all([
        api.getQuote(symbol).catch(() => null),
        api.getHistory(symbol, { period1 }).catch(() => []),
        fetch(`/api/market-summary?symbol=${symbol}`).then(r => r.json()).catch(() => []),
        api.getTrades().catch(() => [])
      ]);
      
      if (quoteData) setQuote(quoteData);
      setHistoricalData(Array.isArray(historyData) ? historyData : []);
      setMarketData(Array.isArray(mData) ? mData : []);
      setRecentTrades(Array.isArray(tradesData) ? tradesData.slice(0, 5) : []); 
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;
    const runAnalysis = async () => {
      if (!quote || !historicalData.length || !marketData.length || analyzingRef.current) return;

      try {
        analyzingRef.current = true;
        if (mounted) setIsAnalyzing(true);
        const analysis = await analyzeStock(symbol, quote, historicalData, model);
        if (mounted) setAiAnalysis(analysis);
        if (mounted) setIsAnalyzing(false);

        if (mounted) setIsSentimentLoading(true);
        const sentiment = await analyzeSentiment(marketData, model, String(settings.systemInstruction || ''));
        if (mounted) setSentimentAnalysis(sentiment);
        if (mounted) setIsSentimentLoading(false);
      } catch (error) {
        console.error("Error running AI analysis:", error);
        if (mounted) { setIsAnalyzing(false); setIsSentimentLoading(false); }
      } finally {
        analyzingRef.current = false;
      }
    };

    const handler = setTimeout(runAnalysis, 500);
    return () => { mounted = false; clearTimeout(handler); };
  }, [symbol, model, quote?.regularMarketPrice, historicalData.length, marketData.length, quote, historicalData, marketData, settings.systemInstruction]);

  const indicators = useMemo(() => {
    if (!Array.isArray(historicalData) || historicalData.length === 0) return null;
    
    // Calculate indicators
    const closes = historicalData.map(d => Number(d?.close) || 0);
    const highs = historicalData.map(d => Number(d?.high) || 0);
    const lows = historicalData.map(d => Number(d?.low) || 0);

    const rsiArr = calculateRSI(closes);
    const macdArr = calculateMACD(closes);
    const kdArr = calculateKD(closes, highs, lows);
    const vwapArr = calculateVWAP(historicalData);
    
    const rsi = rsiArr.at(-1);
    const macd = macdArr.at(-1);
    const kd = kdArr.at(-1);
    const vwap = vwapArr.at(-1);

    return {
      rsi: rsi !== undefined ? rsi.toFixed(1) : '-',
      rsiStatus: rsi !== undefined ? (rsi > 70 ? 'bearish' : rsi < 30 ? 'bullish' : 'neutral') : 'neutral',
      rsiLabel: rsi !== undefined ? (rsi > 70 ? '超買區 (Overbought)' : rsi < 30 ? '超賣區 (Oversold)' : '中性區間 (Neutral)') : '-',
      
      macd: macd?.MACD !== undefined ? macd.MACD.toFixed(2) : '-',
      macdStatus: macd?.histogram !== undefined ? (macd.histogram > 0 ? 'bullish' : 'bearish') : 'neutral',
      macdLabel: macd?.histogram !== undefined ? (macd.histogram > 0 ? '多頭排列 (Bullish)' : '空頭排列 (Bearish)') : '-',
      
      kdK: kd?.K !== undefined ? kd.K.toFixed(1) : '-',
      kdStatus: kd?.K !== undefined ? (kd.K > 80 ? 'bearish' : kd.K < 20 ? 'bullish' : 'neutral') : 'neutral',
      kdLabel: kd?.K !== undefined ? (kd.K > 80 ? '超買區 (Overbought)' : kd.K < 20 ? '超賣區 (Oversold)' : '中性區間 (Neutral)') : '-',
      
      vwap: vwap !== undefined ? vwap.toFixed(2) : '-',
      vwapStatus: vwap !== undefined && quote ? (quote.regularMarketPrice > vwap ? 'bullish' : 'bearish') : 'neutral',
      vwapLabel: vwap !== undefined && quote ? (quote.regularMarketPrice > vwap ? '價格 > VWAP' : '價格 < VWAP') : '-'
    };
  }, [historicalData, quote]);

const isUp = (quote?.regularMarketChange ?? 0) >= 0;

const exportToCSV = (data: any[], filename: string) => {
  const csvContent = "data:text/csv;charset=utf-8," +
    ["Date,Open,High,Low,Close,Volume"].concat(
      data.map(r => `${r.date},${r.open},${r.high},${r.low},${r.close},${r.volume}`)
    ).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  try { link.click(); } finally { document.body.removeChild(link); }
};

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col gap-6 h-full pb-10"
    >
      {/* Main Content Area */}
      <div className={cn("grid grid-cols-12", compact ? "gap-4" : "gap-6")}>
        {/* Left Column - Main Chart & Indicators */}
        <div className={cn("col-span-12 lg:col-span-8 flex flex-col", compact ? "gap-4" : "gap-6", "h-full")}>
          <div className="shrink-0">
            <PerformanceSummary trades={recentTrades} />
          </div>
          {/* Chart Widget */}
          <div className={cn("flex flex-col flex-1 liquid-glass-strong rounded-[2rem] border border-zinc-800 bg-zinc-900/50 overflow-hidden", compact ? "p-0.5" : "p-1")}>
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/[0.03] to-transparent pointer-events-none" />
            <div className={cn("flex items-center justify-between mb-4 md:mb-6 relative z-10 flex-wrap gap-3", compact ? "p-3" : "p-4 md:p-6")}>
              <div className="flex items-center gap-3 md:gap-6 min-w-0">
                <div className={cn("rounded-2xl bg-zinc-800 flex items-center justify-center border border-zinc-700 shrink-0", compact ? "w-10 h-10" : "w-12 h-12 md:w-16 md:h-16")}>
                  <Zap className={cn("text-emerald-400", compact ? "w-5 h-5" : "w-6 h-6 md:w-8 md:h-8")} />
                </div>
                <div className="min-w-0">
                  <h3 className={cn("font-black text-zinc-100 tracking-tighter truncate", compact ? "text-lg" : "text-xl md:text-2xl")}>{quote?.shortName || symbol}</h3>
                  <p className="text-zinc-500 text-xs md:text-sm font-bold truncate">{quote?.longName || symbol}</p>
                </div>
                <button
                  onClick={() => fetchData(true)}
                  disabled={isRefreshing}
                  className={cn("rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-all press-feedback shrink-0", compact ? "p-2" : "p-2 md:p-3")}
                >
                  <Loader2 className={cn("w-5 h-5", isRefreshing && "animate-spin")} />
                </button>
                <button 
                  onClick={() => exportToCSV(historicalData, symbol)}
                  className={cn("rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/40 transition-all press-feedback font-black text-xs uppercase tracking-widest shrink-0", compact ? "px-3 py-1.5" : "px-4 py-2 md:px-5 md:py-2.5")}
                >
                  匯出 CSV
                </button>
              </div>
              <div className="text-right">
                <div className={cn("font-mono font-black text-zinc-100 tracking-tighter", compact ? "text-2xl" : "text-3xl")}>
                  {quote ? quote.regularMarketPrice?.toFixed(2) : '---'}
                </div>
                {quote && (
                  <div className={cn('text-sm font-mono font-black flex items-center justify-end', isUp ? 'text-emerald-400' : 'text-rose-400')}>
                    {isUp ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                    {(quote.regularMarketChange ?? 0) > 0 ? '+' : ''}{(quote.regularMarketChange ?? 0).toFixed(2)} ({quote.regularMarketChangePercent?.toFixed(2)}%)
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 w-full h-full relative z-10">
              <MemoizedChartWidget data={historicalData} />
            </div>
          </div>

          {/* Technical Indicators Grid - Compact */}
          <div className={cn("grid grid-cols-2 md:grid-cols-4", compact ? "gap-2" : "gap-4")}>
            <IndicatorCard title="RSI (14)" value={indicators?.rsi || '-'} status={indicators?.rsiStatus as any || 'neutral'} label={indicators?.rsiLabel || '-'} />
            <IndicatorCard title="MACD" value={indicators?.macd || '-'} status={indicators?.macdStatus as any || 'neutral'} label={indicators?.macdLabel || '-'} />
            <IndicatorCard title="KD (9,3,3)" value={indicators?.kdK || '-'} status={indicators?.kdStatus as any || 'neutral'} label={indicators?.kdLabel || '-'} />
            <IndicatorCard title="VWAP" value={indicators?.vwap || '-'} status={indicators?.vwapStatus as any || 'neutral'} label={indicators?.vwapLabel || '-'} />
          </div>

          {/* Recent Trades Section */}
          <div className={cn("liquid-glass-strong rounded-[2rem] border border-zinc-800 bg-zinc-900/50 shadow-xl overflow-hidden", compact ? "p-4" : "p-6")}>
            <h3 className={cn("font-black text-zinc-100 flex items-center gap-2 uppercase tracking-widest", compact ? "text-xs mb-4" : "text-sm mb-6")}>
              <Activity className="text-emerald-400" size={compact ? 14 : 16} /> 最近交易記錄
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800 font-black uppercase tracking-widest">
                    <th className="px-4 py-3">日期</th>
                    <th className="px-4 py-3">標的</th>
                    <th className="px-4 py-3">動作</th>
                    <th className="px-4 py-3 text-right">進場</th>
                    <th className="px-4 py-3 text-right">出場</th>
                    <th className="px-4 py-3 text-right">損益</th>
                    <th className="px-4 py-3">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.length > 0 ? (
                    recentTrades.map((t) => (
                      <TradeRow
                        key={t.id ?? `${t.date}-${t.symbol}-${t.price}`}
                        date={t.date?.slice(0, 10) || '-'}
                        ticker={t.symbol}
                        action={t.type === 'BUY' ? 'Buy Long' : 'Sell Short'}
                        entry={t.entryPrice}
                        exit={t.exitPrice}
                        pnl={t.pnl}
                        status={t.pnl >= 0 ? 'Win' : 'Loss'}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-zinc-600 font-black uppercase tracking-widest">
                        目前尚無交易記錄
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - AI Agent & Sentiment */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* AI Analysis */}
          <div className="liquid-glass rounded-3xl p-6 border border-[var(--border-color)] shadow-xl">
            <h3 className={cn("font-black text-[var(--text-color)] flex items-center gap-2 uppercase tracking-widest", compact ? "text-xs mb-3" : "text-sm mb-4")}>
              <BrainCircuit className="text-indigo-400" size={compact ? 14 : 16} /> AI 分析
            </h3>
            {isAnalyzing ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" /> 分析中...
              </div>
            ) : aiAnalysis ? (
              <div className="text-sm text-slate-300 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">建議:</span>
                  <span className={cn("font-bold", (aiAnalysis.action === 'BUY' || aiAnalysis.action === 'STRONG BUY') ? 'text-emerald-400' : (aiAnalysis.action === 'SELL' || aiAnalysis.action === 'STRONG SELL') ? 'text-rose-400' : 'text-yellow-400')}>
                    {(aiAnalysis.action === 'BUY' || aiAnalysis.action === 'STRONG BUY') ? '買進' : (aiAnalysis.action === 'SELL' || aiAnalysis.action === 'STRONG SELL') ? '賣出' : '觀望'}
                  </span>
                </div>
                {aiAnalysis.reasoning && <p className="text-xs text-slate-400 leading-relaxed">{aiAnalysis.reasoning}</p>}
              </div>
            ) : (
              <p className="text-xs text-slate-500">載入報價後自動分析</p>
            )}
          </div>

          {/* Sentiment */}
          <div className="liquid-glass rounded-3xl p-6 border border-[var(--border-color)] shadow-xl">
            <h3 className={cn("font-black text-[var(--text-color)] flex items-center gap-2 uppercase tracking-widest", compact ? "text-xs mb-3" : "text-sm mb-4")}>
              <Activity className="text-emerald-400" size={compact ? 14 : 16} /> 市場情緒
            </h3>
            {isSentimentLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" /> 分析市場情緒中...
              </div>
            ) : sentimentAnalysis ? (
              <div className="text-sm text-slate-300 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">傾向:</span>
                  <span className={cn("font-bold", (sentimentAnalysis.score ?? 50) >= 60 ? 'text-emerald-400' : (sentimentAnalysis.score ?? 50) <= 40 ? 'text-rose-400' : 'text-yellow-400')}>
                    {(sentimentAnalysis.score ?? 50) >= 60 ? '偏多' : (sentimentAnalysis.score ?? 50) <= 40 ? '偏空' : '中性'} ({sentimentAnalysis.score ?? 50}/100)
                  </span>
                </div>
                {sentimentAnalysis.aiAdvice && <p className="text-xs text-slate-400 leading-relaxed">{sentimentAnalysis.aiAdvice}</p>}
              </div>
            ) : (
              <p className="text-xs text-slate-500">載入市場資料後自動分析</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Bottom Section - Trading Consoles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Suspense fallback={<div className="h-60 flex items-center justify-center text-white/40">載入中...</div>}>
            <PaperTradingDashboard />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          <Suspense fallback={<div className="h-40 flex items-center justify-center text-white/40">載入中...</div>}>
            <StrategyComparison />
            <LiveTradingConsole />
          </Suspense>
        </div>
      </div>
    </motion.div>
  );
}

function IndicatorCard({ title, value, status, label }: { title: string, value: string, status: 'bullish' | 'bearish' | 'neutral', label: string }) {
  return (
    <div className="liquid-glass-strong rounded-[2rem] p-6 border border-zinc-800 bg-zinc-900/50 flex flex-col justify-between relative overflow-hidden transition-all">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/[0.03] to-transparent pointer-events-none" />
      <div className="text-xs text-zinc-500 font-black uppercase tracking-widest mb-3 relative z-10">{title}</div>
      <div className="relative z-10">
        <div className={cn(
          "text-4xl font-black mb-1.5 tracking-tighter",
          status === 'bullish' && "text-emerald-400",
          status === 'bearish' && "text-rose-400",
          status === 'neutral' && "text-amber-400"
        )}>
          {value}
        </div>
        <div className="text-xs text-zinc-600 font-black uppercase tracking-widest">{label}</div>
      </div>
    </div>
  );
}

function TimeframeBadge({ label, status }: { label: string, status: 'bullish' | 'bearish' | 'neutral' }) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center w-16 h-16 rounded-2xl border shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md",
      status === 'bullish' && "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
      status === 'bearish' && "bg-rose-500/10 border-rose-500/20 text-rose-300",
      status === 'neutral' && "bg-amber-500/10 border-amber-500/20 text-amber-300"
    )}>
      <span className="text-xs font-medium text-white/50 mb-1">{label}</span>
      {status === 'bullish' && <TrendingUp className="w-5 h-5 drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" />}
      {status === 'bearish' && <TrendingDown className="w-5 h-5 drop-shadow-[0_0_4px_rgba(251,113,133,0.5)]" />}
      {status === 'neutral' && <Activity className="w-5 h-5 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]" />}
    </div>
  );
}

function TradeRow({ date, ticker, action, entry, exit, pnl, status }: { key?: any, date: string, ticker: string, action: string, entry: number, exit: number, pnl: number, status: 'Win' | 'Loss' }) {
  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
      <td className="px-4 py-4 text-zinc-400 font-mono text-sm">{date}</td>
      <td className="px-4 py-4 font-black text-zinc-100 text-sm">{ticker}</td>
      <td className="px-4 py-3.5">
        <span className={cn(
          "px-2.5 py-1 rounded-lg text-sm font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]",
          action.includes('Buy') ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
        )}>
          {action}
        </span>
      </td>
      <td className="px-4 py-3.5 text-white/70 text-sm">{entry?.toFixed(2) ?? '-'}</td>
      <td className="px-4 py-3.5 text-white/70 text-sm">{exit?.toFixed(2) ?? '-'}</td>
      <td className={cn(
        "px-4 py-3.5 font-medium drop-shadow-sm text-sm",
        pnl > 0 ? "text-emerald-400" : "text-rose-400"
      )}>
        {pnl > 0 ? '+' : ''}{pnl?.toFixed(2) ?? '-'}
      </td>
      <td className="px-4 py-3.5">
        {status === 'Win' ? (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4 drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
            <span className="text-sm font-medium">獲利</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-rose-400">
            <XCircle className="w-4 h-4 drop-shadow-[0_0_4px_rgba(251,113,133,0.5)]" />
            <span className="text-sm font-medium">虧損</span>
          </div>
        )}
      </td>
    </tr>
  );
}

