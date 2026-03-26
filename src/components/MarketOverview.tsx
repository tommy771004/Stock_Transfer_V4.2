/**
 * MarketOverview.tsx
 *
 * 終極合併版：
 * 1. 包含真實大盤指數、熱門標的、財經新聞 (Canvas 版功能)
 * 2. 完美還原自選股清單、五檔深度、逐筆成交、快速下單 (使用者原版功能)
 * 3. 全部串接 Electron IPC API 取得真實數據
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, Globe2,
  Loader2, Newspaper, Flame, ExternalLink,
  Plus, X, Search, Zap, AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { Quote, NewsItem, WatchlistItem } from '../types';

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

// ── 介面定義 ──
interface Stock {
  symbol: string; name: string; shortName?: string;
  price: number; change: number; changePct: number;
  volume: number; open: number; high: number; low: number;
  bid: number; ask: number;
  bars: number[];   // real 7-day close prices
}

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', icon: Globe2 },
  { symbol: '^IXIC', name: 'NASDAQ',  icon: Activity },
  { symbol: 'BTC-USD', name: 'Bitcoin', icon: DollarSign },
  { symbol: '2330.TW', name: '台積電',  icon: Activity },
  { symbol: '^VIX', name: 'VIX 指數', icon: Zap }
];
const TRENDING_SYMBOLS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMD', 'MSTR'];
const BROKERS = ['元大證券 Yuanta', '盈透 Interactive Brokers', '富途 Futu'];

// ── Memoized sub-components ────────────────────────────────────────────────

interface MarketIndex {
  symbol: string;
  name: string;
  icon: React.ElementType;
  price: number;
  changePct: number;
  chartData: { close: number }[];
}

const IndexCard = memo(({ idx, compact, onSelect }: { idx: MarketIndex; compact: boolean; onSelect: (sym: string) => void }) => {
  const isUp = idx.changePct >= 0;
  return (
    <div onClick={() => onSelect(idx.symbol)}
      className={cn(
        "min-w-[200px] md:min-w-0 liquid-glass-strong rounded-2xl cursor-pointer hover:border-emerald-500/30 hover:bg-[var(--card-bg)] transition-all group shadow-lg border-[var(--border-color)] snap-center active:scale-[0.98]",
        compact ? "p-3" : "p-4 md:p-6 lg:p-8",
        idx.symbol === '^VIX' && "bg-zinc-200/10 rounded-lg"
      )}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={cn("p-4 rounded-2xl", isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
            <idx.icon size={28} />
          </div>
          <div>
            <div className="text-xl font-black text-[var(--text-color)] group-hover:text-emerald-300 transition-colors tracking-tight">{idx.name}</div>
            <div className="text-base text-[var(--text-color)] opacity-50 font-mono uppercase tracking-widest">{idx.symbol}</div>
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl md:text-3xl lg:text-4xl font-mono font-black text-[var(--text-color)] mb-3 tracking-tighter">{idx.price ? idx.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}</div>
          <div className={cn("flex items-center gap-2 text-base font-black px-3 py-1.5 rounded-lg w-fit", isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
            {isUp ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
            {isUp ? '+' : ''}{idx.changePct ? idx.changePct.toFixed(2) : '0.00'}%
          </div>
        </div>
        <div className="w-24 h-12">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={idx.chartData}>
              <defs>
                <linearGradient id={`g-${idx.symbol}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={isUp?"#10b981":"#f43f5e"} stopOpacity={0.3}/><stop offset="95%" stopColor={isUp?"#10b981":"#f43f5e"} stopOpacity={0}/></linearGradient>
              </defs>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area type="monotone" dataKey="close" stroke={isUp?"#10b981":"#f43f5e"} strokeWidth={2} fill={`url(#g-${idx.symbol})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});
IndexCard.displayName = 'IndexCard';

const WatchlistStockCard = memo(({ s, isSelected, onSelect, onRemove }: {
  s: Stock; isSelected: boolean;
  onSelect: (s: Stock) => void; onRemove: (sym: string) => void;
}) => {
  const isUp = s.changePct >= 0;
  return (
    <div onClick={() => onSelect(s)}
      className={cn('relative bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-4 cursor-pointer transition-all hover:bg-[var(--bg-color)] group',
        isSelected ? 'border-emerald-500/40 bg-emerald-500/5' : '')}>
      <button onClick={e => { e.stopPropagation(); onRemove(s.symbol); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-full bg-[var(--bg-color)] hover:bg-rose-500/30 text-[var(--text-color)] opacity-50 hover:text-rose-400 transition-all">
        <X size={10}/>
      </button>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-lg font-bold text-[var(--text-color)] tracking-tight">{s.symbol}</div>
          <div className="font-serif italic text-sm text-[var(--text-color)] opacity-50 truncate max-w-[140px]">{s.shortName}</div>
        </div>
        <span className={cn('text-sm px-3 py-1 rounded font-mono font-bold', isUp ? 'text-emerald-400' : 'text-rose-400')}>
          {isUp ? '+' : ''}{s.changePct.toFixed(2)}%
        </span>
      </div>
      <div className={cn('text-xl sm:text-2xl md:text-3xl font-bold font-mono tracking-tight', isUp ? 'text-emerald-400' : 'text-rose-400')}>
        {s.price.toFixed(2)}
      </div>
      <div className="flex justify-between text-sm text-[var(--text-color)] opacity-50 mt-6 font-mono">
        <span>B {s.bid.toFixed(2)}</span>
        <span>A {s.ask.toFixed(2)}</span>
      </div>
    </div>
  );
});
WatchlistStockCard.displayName = 'WatchlistStockCard';

export default function MarketOverview({ onSelectSymbol }: Props) {
  const { settings } = useSettings();
  const compact = Boolean(settings.compactMode);
  // ── 狀態管理 ──
  // Market Overview 狀態
  const [marketData, setMarketData] = useState<MarketIndex[]>([]);
  const [trending, setTrending] = useState<Stock[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [lastUpdate, setLastUpdate] = useState('');
  
  // Watchlist & Trading 狀態
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selected, setSelected] = useState<Stock|null>(null);
  
  // UI 控制狀態
  type LoadState = 'loading' | 'refreshing' | 'idle';
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loading = loadState === 'loading';
  const busy    = loadState === 'refreshing';
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addErr, setAddErr] = useState('');
  const [showOrder, setShowOrder] = useState(false);
  const [oSide, setOSide] = useState<'buy'|'sell'>('buy');
  const [oQty, setOQty] = useState(Number(settings.defaultOrderQty || 100));
  const [tradeMode, setTradeMode] = useState<'paper'|'real'>('paper');
  const [broker, setBroker] = useState(String(settings.defaultBroker || 'Fubon'));
  const [orderType, setOrderType] = useState(String(settings.defaultOrderType || 'ROD'));
  const [priceType, setPriceType] = useState(String(settings.defaultPriceType || 'LMT'));
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const executeTrade = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const data = await api.executeTrade({
        symbol: selected.symbol,
        side: oSide,
        qty: oQty,
        price: selected.price,
        mode: tradeMode,
        broker,
        orderType,
        priceType
      });
      
      if (data.status === 'success') {
        setToast({ msg: '交易成功', type: 'success' });
        setShowOrder(false);
      } else {
        setToast({ msg: `交易結果: ${data.message}`, type: 'error' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '交易請求失敗';
      setToast({ msg, type: 'error' });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // ── 資料抓取邏輯 ──
  const enrich = (d: WatchlistItem, bars: number[] = []): Stock => ({
    symbol:    d.symbol,
    name:      d.name ?? d.symbol,
    shortName: d.name ?? d.symbol,
    price:     d.price ?? 0,
    change:    d.change ?? 0,
    changePct: d.changePct ?? 0,
    volume:    0,
    open:      0,
    high:      0,
    low:       0,
    bid:       d.price ?? 0,
    ask:       d.price ?? 0,
    bars,
  });

  const fetchBars = async (symbol: string, days = 7): Promise<number[]> => {
    try {
      const hist = await api.getHistory(symbol, { interval: '1d' });
      if (!Array.isArray(hist) || !hist.length) return [];
      return hist.slice(-days)
        .filter((r: { close: number }) => r?.close && isFinite(Number(r.close)))
        .map((r: { close: number }) => Number(r.close));
    } catch(e) { console.warn('[MarketOverview] getHistory:', e); return []; }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadAllData = useCallback(async (quiet = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadState(quiet ? 'refreshing' : 'loading');
    setFetchErr(null);
    try {
      const wlData = await api.getWatchlist().catch(() => []);
      const enrichedStocks = (Array.isArray(wlData) ? wlData : []).map((w: WatchlistItem) => enrich(w));
      
      setStocks(enrichedStocks);
      setSelected(prev => enrichedStocks.find(e => e.symbol === prev?.symbol) ?? enrichedStocks[0] ?? null);

      const wlSymbols = enrichedStocks.map(s => s.symbol);
      
      const fetchBarsConcurrently = async (symbols: string[], days: number, concurrency = 2) => {
        const results = new Map<string, number[]>();
        for (let i = 0; i < symbols.length; i += concurrency) {
          const chunk = symbols.slice(i, i + concurrency);
          await Promise.all(chunk.map(async (s: string) => {
            const bars = await fetchBars(s, days);
            results.set(s, bars);
          }));
        }
        return results;
      };

      const barsMap = await fetchBarsConcurrently(wlSymbols, 7);
      // Merge bars into enrichedStocks in one setState (avoid double render)
      const stocksWithBars = enrichedStocks.map(s => {
        const bars = barsMap.get(s.symbol);
        return bars && bars.length ? { ...s, bars } : s;
      });
      setStocks(stocksWithBars);
      setSelected(prev => stocksWithBars.find(e => e.symbol === prev?.symbol) ?? stocksWithBars[0] ?? null);

      const indicesPromise = (async () => {
        const idxSymbols = INDICES.map(i => i.symbol);
        const quotes = await api.getBatchQuotes(idxSymbols).catch(() => []);
        const quotesArr = (Array.isArray(quotes) ? quotes.filter(Boolean) : []) as Quote[];
        const qMap = new Map(quotesArr.map((q: Quote) => [q.symbol, q]));
        
        const barsMap = await fetchBarsConcurrently(idxSymbols, 30);
        
        return INDICES.map((idx) => {
          const quote = qMap.get(idx.symbol) as Quote | undefined;
          const bars = barsMap.get(idx.symbol) || [];
          return {
            ...idx,
            price: quote?.regularMarketPrice || 0,
            changePct: quote?.regularMarketChangePercent || 0,
            chartData: bars.map(c => ({ close: c }))
          };
        });
      })();

      const trendingPromise = api.getBatchQuotes(TRENDING_SYMBOLS).then((quotes: Quote[]) => 
        quotes.map(q => ({
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          shortName: q.shortName,
          price: q.regularMarketPrice || 0,
          change: q.regularMarketChange || 0,
          changePct: q.regularMarketChangePercent || 0,
          volume: q.regularMarketVolume || 0,
          open: 0, high: 0, low: 0, bid: 0, ask: 0,
          bars: []
        }))
      ).catch(() => []);
      const newsPromise = api.getNews('^GSPC').catch(() => []);

      const [indicesData, trendingData, newsData] = await Promise.all([indicesPromise, trendingPromise, newsPromise]);

      setMarketData(indicesData);
      setTrending(Array.isArray(trendingData) ? trendingData : [trendingData]);
      setNews(Array.isArray(newsData) ? newsData.slice(0, 6) : []);
      setLastUpdate(new Date().toLocaleTimeString());

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '載入市場數據失敗';
      console.error('[MarketOverview] loadAllData:', msg);
      setFetchErr(msg);
    } finally {
      setLoadState('idle');
      loadingRef.current = false;
    }
  }, []);

  const pullState = usePullToRefresh(containerRef, {
    onRefresh: () => loadAllData(true),
  });

  useEffect(() => { loadAllData(); }, [loadAllData]);
  useEffect(() => {
    const id = setInterval(() => loadAllData(true), 30000);
    return () => clearInterval(id);
  }, [loadAllData]);

  // ── 互動處理 ──
  const handleAdd = async () => {
    const sym = addInput.trim().toUpperCase(); if (!sym) return;
    if (stocks.find(s => s.symbol === sym)) { setAddInput(''); setShowAdd(false); return; }
    setBusy(true); setAddErr('');
    try {
      const q: Quote = await api.getQuote(sym);
      if (!q?.regularMarketPrice) throw new Error('找不到此代碼，請確認格式');
      
      const bars = await fetchBars(sym, 7);
      const ns = enrich(q, bars);
      const updated = [...stocks, ns];
      
      setStocks(updated); setSelected(ns);
      await api.setWatchlist(updated.map(s => ({ symbol:s.symbol, name:s.name })));
      setAddInput(''); setShowAdd(false);
    } catch(e: unknown) { 
      const msg = e instanceof Error ? e.message : '查詢失敗';
      setAddErr(msg); 
    }
    finally { setBusy(false); }
  };

  const handleRemove = async (sym: string) => {
    const updated = stocks.filter(s => s.symbol !== sym);
    setStocks(updated);
    if (selected?.symbol === sym) setSelected(updated[0] ?? null);
    await api.setWatchlist(updated.map(s => ({ symbol:s.symbol, name:s.name })));
  };

  const up = (s: { changePct: number } | Stock) => s.changePct >= 0;

  if (fetchErr && marketData.length === 0 && stocks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="text-rose-400" size={32}/>
        <div className="text-sm font-bold text-rose-400">市場資料載入失敗</div>
        <div className="text-xs text-slate-500">{fetchErr}</div>
        <button onClick={() => loadAllData()} className="px-4 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors">重試</button>
      </div>
    );
  }

  if (loading && marketData.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
        <Loader2 className="animate-spin text-emerald-400" size={32}/>
        <div className="text-sm font-bold text-white tracking-widest">INITIALIZING MARKET DATA ENGINE...</div>
        <div className="text-xs text-slate-500">正在與 Yahoo Finance 建立安全連線並獲取真實報價</div>
      </div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn("h-full flex flex-col overflow-auto pb-10 pr-4 relative bg-[var(--bg-color)] text-[var(--text-color)]", compact ? "gap-2" : "gap-8")}
    >
      <PullToRefreshIndicator state={pullState} />

      {toast && (
        <div className={cn("fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xl z-50 whitespace-nowrap animate-in fade-in slide-in-from-top-4", toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500')}>
          {toast.msg}
        </div>
      )}
      
      {/* ── 1. 頁面標題列與大盤指數 ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between shrink-0 gap-2">
        <div className="text-xs text-zinc-500 font-mono bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg uppercase tracking-widest self-start sm:self-auto">
          LAST UPDATE: {lastUpdate}
        </div>
      </div>

      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 shrink-0 overflow-x-auto pb-2 md:pb-0 mobile-hide-scrollbar snap-x snap-mandatory md:snap-none">
        {marketData.map((idx) => (
          <IndexCard key={idx.symbol} idx={idx} compact={compact} onSelect={onSelectSymbol} />
        ))}
      </div>

      {/* ── 2. Watchlist & Deep Analysis ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="font-serif italic text-lg text-zinc-100">Watchlist</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {BROKERS.map((b,i) => (
              <button key={i} onClick={() => setBroker(b)}
                className={cn('px-3 py-1.5 sm:py-1 rounded text-[10px] font-mono uppercase transition-all border press-feedback',
                  broker===b?'bg-emerald-500/10 text-emerald-400 border-emerald-500/30':'bg-zinc-950 text-zinc-500 border-zinc-800 hover:bg-zinc-900')}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* 左側：自選股 Grid */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {stocks.map(s => (
              <WatchlistStockCard
                key={s.symbol}
                s={s}
                isSelected={selected?.symbol === s.symbol}
                onSelect={(stock) => { setSelected(stock); onSelectSymbol?.(stock.symbol); }}
                onRemove={handleRemove}
              />
            ))}

            {/* 新增自選股 Card */}
            <div onClick={() => !showAdd && setShowAdd(true)}
              className="liquid-glass rounded-2xl border-dashed border-zinc-800 p-4 cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all flex flex-col items-center justify-center min-h-[160px] bg-zinc-900/50">
              {showAdd ? (
                <div className="w-full space-y-3" onClick={e => e.stopPropagation()}>
                  <div className="text-base font-bold text-zinc-100 mb-3">新增自選股</div>
                  <div className="flex items-center gap-2 bg-zinc-950 rounded-xl px-4 border border-zinc-800">
                    <Search size={16} className="text-zinc-500 shrink-0"/>
                    <input autoFocus value={addInput} onChange={e => { setAddInput(e.target.value.toUpperCase()); setAddErr(''); }}
                      onKeyDown={e => e.key==='Enter' && handleAdd()} placeholder="輸入代碼..."
                      className="flex-1 bg-transparent py-3 text-base text-zinc-100 focus:outline-none"/>
                  </div>
                  {addErr && <div className="text-sm text-rose-400 px-1">{addErr}</div>}
                  <div className="flex gap-3">
                    <button onClick={handleAdd} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-emerald-950 text-emerald-400 text-sm border border-emerald-900/50 flex items-center justify-center">
                      {busy?<Loader2 size={14} className="animate-spin mr-1.5"/>:null} 確認
                    </button>
                    <button onClick={() => { setShowAdd(false); setAddInput(''); setAddErr(''); }} className="flex-1 py-2.5 rounded-lg bg-zinc-800 text-zinc-400 text-sm border border-zinc-700 hover:bg-zinc-700">取消</button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3"><Plus size={24} className="text-zinc-500"/></div>
                  <div className="text-sm text-zinc-500 font-semibold">新增標的</div>
                </div>
              )}
            </div>
          </div>

          {/* 右側：五檔與逐筆成交 (給已選取的標的) */}
          {selected && (
            <div className="w-full lg:w-[260px] flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
              <div className="liquid-glass rounded-2xl p-4 flex-1 flex flex-col shadow-lg bg-zinc-900/50 border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">報價詳情</h3>
                  </div>
                  <span className="text-xs text-emerald-400 font-mono font-bold bg-emerald-950 px-2 py-0.5 rounded">{selected.symbol}</span>
                </div>
                <div className="text-xs font-mono space-y-2 mt-4">
                  <div className="flex justify-between py-1 border-b border-zinc-800">
                    <span className="text-zinc-500">開盤價</span>
                    <span className="text-zinc-100">{selected.open?.toFixed(2) ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800">
                    <span className="text-zinc-500">最高價</span>
                    <span className="text-emerald-400">{selected.high?.toFixed(2) ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800">
                    <span className="text-zinc-500">最低價</span>
                    <span className="text-rose-400">{selected.low?.toFixed(2) ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800">
                    <span className="text-zinc-500">成交量</span>
                    <span className="text-zinc-100">{selected.volume?.toLocaleString() ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800">
                    <span className="text-zinc-500">買進價</span>
                    <span className="text-zinc-100">{selected.bid?.toFixed(2) ?? '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800">
                    <span className="text-zinc-500">賣出價</span>
                    <span className="text-zinc-100">{selected.ask?.toFixed(2) ?? '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. 市場焦點與財經新聞 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[250px]">
        {/* 左側：熱門交易標的 */}
        <div className="lg:col-span-1 liquid-glass rounded-2xl p-5 flex flex-col shadow-lg bg-zinc-900/50 border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Flame size={16} className="text-orange-400"/> 市場熱點 (Trending)
            </h2>
          </div>
          <div className="flex lg:grid lg:grid-cols-1 gap-3 overflow-x-auto pb-2 lg:pb-0">
            {trending.length > 0 ? trending.map((t: Stock) => {
              const isUp = (t.changePct || 0) >= 0;
              return (
                <div key={t.symbol} onClick={() => onSelectSymbol(t.symbol)}
                  className="min-w-[200px] lg:min-w-0 flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-900 cursor-pointer group transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-100">
                      {t.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-100 group-hover:text-emerald-300 transition-colors">{t.symbol}</div>
                      <div className="text-xs text-zinc-500 max-w-[80px] truncate">{t.shortName || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-zinc-100 font-bold">{t.price?.toFixed(2) || '---'}</div>
                    <div className={cn("text-xs font-bold font-mono", isUp ? "text-emerald-400" : "text-rose-400")}>
                      {isUp ? '+' : ''}{(t.changePct || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            }) : <div className="text-xs text-zinc-500 text-center py-6">載入中...</div>}
          </div>
        </div>

        {/* 右側：即時市場新聞 */}
        <div className="lg:col-span-2 liquid-glass rounded-2xl p-5 flex flex-col shadow-lg bg-zinc-900/50 border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Newspaper size={16} className="text-indigo-400"/> 國際財經快訊 (News)
            </h2>
          </div>
          <div className="flex-1 overflow-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pr-1">
            {news.length > 0 ? news.map((n: NewsItem, i: number) => (
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                className="flex flex-col p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-xs font-bold text-zinc-300 group-hover:text-indigo-300 leading-relaxed line-clamp-2">
                    {n.title}
                  </h3>
                  <ExternalLink size={12} className="text-zinc-600 shrink-0"/>
                </div>
                <div className="text-xs text-zinc-500 mt-auto flex items-center gap-1">
                  <span>{n.publisher || 'Yahoo Finance'}</span>
                  <span>·</span>
                  <span>{new Date((n.providerPublishTime || Date.now()/1000) * 1000).toLocaleString()}</span>
                </div>
              </a>
            )) : <div className="col-span-full text-center text-xs text-zinc-500 py-10">讀取新聞中...</div>}
          </div>
        </div>
      </div>

      {/* ── 4. 懸浮快速下單按鈕 (保留您的原創功能) ── */}
      <div className="fixed bottom-20 right-4 md:bottom-10 md:right-6 z-[60] safe-area-bottom safe-area-right">
        {showOrder && selected && (
          <>
            {/* Mobile Backdrop */}
            <div 
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[65]" 
              onClick={() => setShowOrder(false)} 
            />
            
            {/* Order Panel (Bottom Sheet on Mobile, Floating Card on Desktop) */}
            <div className={cn(
              "fixed md:absolute z-[70] transition-transform duration-300 ease-out",
              "bottom-0 left-0 right-0 w-full bg-zinc-950 rounded-t-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-zinc-800",
              "md:bottom-14 md:right-0 md:left-auto md:w-72 md:rounded-2xl md:p-5 md:shadow-2xl md:bg-zinc-900/90 md:backdrop-blur-md md:border md:border-zinc-800"
            )}>
              {/* Mobile Handle */}
              <div className="md:hidden w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-6" />
              
              <div className="flex items-center justify-between mb-4 md:mb-3">
                <div>
                  <h3 className="text-lg md:text-sm font-bold text-zinc-100">快速委託</h3>
                  <div className="text-xs text-zinc-500">{selected.symbol}</div>
                </div>
                <button onClick={() => setShowOrder(false)} className="p-2 md:p-1 rounded-full hover:bg-zinc-800 text-zinc-400">
                  <X size={18} className="md:w-3.5 md:h-3.5" />
                </button>
              </div>
              
              <div className="flex gap-2 md:gap-1.5 mb-5 md:mb-4">
                {(['buy','sell'] as const).map(s => (
                  <button key={s} onClick={() => setOSide(s)}
                    className={cn('flex-1 py-3 md:py-2 rounded-xl text-base md:text-sm font-bold transition-colors', 
                      oSide===s?(s==='buy'?'bg-emerald-500 text-zinc-950':'bg-rose-500 text-zinc-100'):'bg-zinc-900 text-zinc-400 hover:bg-zinc-800')}>
                    {s==='buy'?'買進':'賣出'}
                  </button>
                ))}
              </div>
              
              <div className="space-y-4 md:space-y-3">
                <div className="flex gap-2">
                  <select value={tradeMode} onChange={e => setTradeMode(e.target.value as 'paper' | 'real')} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-zinc-100 text-sm md:text-xs">
                    <option value="paper">模擬交易</option>
                    <option value="real">實際交易</option>
                  </select>
                  <select value={broker} onChange={e => setBroker(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-zinc-100 text-sm md:text-xs">
                    <option value="Fubon">富邦</option>
                    <option value="Cathay">國泰</option>
                    <option value="UB">聯邦</option>
                    <option value="Sinopac">永豐金</option>
                  </select>
                </div>
                
                <div className="flex gap-2">
                  <select value={orderType} onChange={e => setOrderType(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-zinc-100 text-sm md:text-xs">
                    <option value="ROD">ROD</option>
                    <option value="IOC">IOC</option>
                    <option value="FOK">FOK</option>
                  </select>
                  <select value={priceType} onChange={e => setPriceType(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-zinc-100 text-sm md:text-xs">
                    <option value="LMT">限價</option>
                    <option value="MKT">市價</option>
                  </select>
                </div>
                
                <div className="flex justify-between text-sm md:text-xs py-1">
                  <span className="text-zinc-400">現價</span>
                  <span className={cn('font-mono font-bold text-lg md:text-base', up(selected)?'text-emerald-400':'text-rose-400')}>{selected.price.toFixed(2)}</span>
                </div>
                
                <div>
                  <div className="text-xs text-zinc-500 mb-1.5 md:mb-1">委託數量</div>
                  <input type="number" value={oQty} onChange={e => setOQty(Number(e.target.value))} min={1}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 md:px-3 md:py-2 text-zinc-100 font-mono text-base md:text-xs focus:outline-none focus:border-emerald-500/40"/>
                </div>
                
                <div className="flex justify-between text-sm md:text-xs pt-2 border-t border-zinc-800">
                  <span className="text-zinc-400">預估金額</span>
                  <span className="text-zinc-100 font-mono text-lg md:text-base">${(selected.price*oQty).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                </div>
                
                <button onClick={executeTrade} className={cn('w-full py-4 md:py-2.5 rounded-xl text-base md:text-sm font-bold mt-2', oSide==='buy'?'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]':'bg-rose-500 text-zinc-100 hover:bg-rose-400 shadow-[0_0_15px_rgba(251,113,133,0.3)]')}>
                  確認{oSide==='buy'?'買進':'賣出'}
                </button>
              </div>
            </div>
          </>
        )}
        <button onClick={() => setShowOrder(v => !v)}
          className="flex items-center gap-2 px-5 py-3 md:py-2.5 bg-emerald-500 text-zinc-950 font-bold rounded-full shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:bg-emerald-400 transition-all text-base md:text-sm hover:scale-105 active:scale-95">
          <Zap size={18} className="md:w-4 md:h-4"/> <span className="hidden xs:inline">快速委託</span>
        </button>
      </div>

    </motion.div>
  );
}