import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import Decimal from 'decimal.js';
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, Animated, Modal, Platform, Pressable, Linking } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Line } from 'react-native-svg';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, Globe2,
  Loader2, Newspaper, Flame, ExternalLink,
  Plus, X, Search, Zap, AlertCircle
} from 'lucide-react-native';
import * as api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { Quote, NewsItem, WatchlistItem } from '../types';

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

interface Stock {
  symbol: string; name: string; shortName?: string;
  price: number; change: number; changePct: number;
  volume: number; open: number; high: number; low: number;
  bid: number; ask: number;
  bars: number[];
}

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', icon: Globe2 },
  { symbol: '^IXIC', name: 'NASDAQ', icon: Activity },
  { symbol: 'BTC-USD', name: 'Bitcoin', icon: DollarSign },
  { symbol: '2330.TW', name: '台積電', icon: Activity },
  { symbol: '^VIX', name: 'VIX 指數', icon: Zap }
];
const TRENDING_SYMBOLS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMD', 'MSTR'];
const BROKERS = ['元大證券 Yuanta', '盈透 Interactive Brokers', '富途 Futu'];

interface MarketIndex {
  symbol: string;
  name: string;
  icon: React.ElementType;
  price: number;
  changePct: number;
  chartData: { close: number }[];
}

const CardIcon = ({ Icon, color, size }: { Icon: React.ElementType; color: string; size: number }) => (
  <Icon size={size} color={color} />
);

const IndexCard = memo(({ idx, compact, onSelect }: { idx: MarketIndex; compact: boolean; onSelect: (sym: string) => void }) => {
  const isUp = idx.changePct >= 0;
  return (
    <Pressable onPress={() => onSelect(idx.symbol)} style={({ pressed }) => [styles.indexCard, compact && styles.indexCardCompact, idx.symbol === '^VIX' && styles.indexCardVix, pressed && styles.pressed]}>
      <View style={styles.indexTop}>
        <View style={styles.indexHeader}>
          <View style={[styles.indexIconWrap, isUp ? styles.upBg : styles.downBg]}>
            <CardIcon Icon={idx.icon} color={isUp ? '#34d399' : '#fb7185'} size={28} />
          </View>
          <View>
            <Text style={styles.indexName}>{idx.name}</Text>
            <Text style={styles.indexSymbol}>{idx.symbol}</Text>
          </View>
        </View>
      </View>
      <View style={styles.indexBottom}>
        <View>
          <Text style={styles.indexPrice}>{idx.price ? idx.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}</Text>
          <View style={[styles.changeBadge, isUp ? styles.upBadge : styles.downBadge]}>
            {isUp ? <TrendingUp size={18} color="#34d399" /> : <TrendingDown size={18} color="#fb7185" />}
            <Text style={[styles.changeText, isUp ? styles.upText : styles.downText]}>{isUp ? '+' : ''}{idx.changePct ? idx.changePct.toFixed(2) : '0.00'}%</Text>
          </View>
        </View>
        <View style={styles.sparkWrap}>
          <Sparkline data={idx.chartData} color={isUp ? '#10b981' : '#f43f5e'} id={`g-${idx.symbol}`} />
        </View>
      </View>
    </Pressable>
  );
});
IndexCard.displayName = 'IndexCard';

const WatchlistStockCard = memo(({ s, isSelected, onSelect, onRemove }: {
  s: Stock; isSelected: boolean;
  onSelect: (s: Stock) => void; onRemove: (sym: string) => void;
}) => {
  const isUp = s.changePct >= 0;
  return (
    <Pressable onPress={() => onSelect(s)} style={({ pressed }) => [styles.watchCard, isSelected && styles.watchCardSelected, pressed && styles.pressed]}>
      <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onRemove(s.symbol); }} style={styles.removeBtn}>
        <X size={10} color="#a1a1aa" />
      </TouchableOpacity>
      <View style={styles.watchTop}>
        <View>
          <Text style={styles.watchSymbol}>{s.symbol}</Text>
          <Text style={styles.watchShort}>{s.shortName}</Text>
        </View>
        <Text style={[styles.watchChange, isUp ? styles.upText : styles.downText]}>{isUp ? '+' : ''}{s.changePct.toFixed(2)}%</Text>
      </View>
      <Text style={[styles.watchPrice, isUp ? styles.upText : styles.downText]}>{s.price.toFixed(2)}</Text>
      <View style={styles.watchBidAsk}>
        <Text style={styles.watchBidAskText}>B {s.bid.toFixed(2)}</Text>
        <Text style={styles.watchBidAskText}>A {s.ask.toFixed(2)}</Text>
      </View>
    </Pressable>
  );
});
WatchlistStockCard.displayName = 'WatchlistStockCard';

const Sparkline = ({ data, color, id }: { data: { close: number }[]; color: string; id: string }) => {
  const width = 96;
  const height = 48;
  if (!data || data.length < 2) {
    return <View style={{ width, height }} />;
  }
  const values = data.map(d => d.close).filter(v => Number.isFinite(v));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const linePath = `M ${points[0]} ${points.slice(1).map(p => `L ${p}`).join(' ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="5%" stopColor={color} stopOpacity={0.3} />
          <Stop offset="95%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${id})`} />
      <Path d={linePath} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
};

export default function MarketOverview({ onSelectSymbol }: Props) {
  const { settings } = useSettings();
  const compact = Boolean(settings.compactMode);
  const [marketData, setMarketData] = useState<MarketIndex[]>([]);
  const [trending, setTrending] = useState<Stock[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [lastUpdate, setLastUpdate] = useState('');
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selected, setSelected] = useState<Stock | null>(null);
  type LoadState = 'loading' | 'refreshing' | 'idle';
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loading = loadState === 'loading';
  const busy = loadState === 'refreshing';
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addErr, setAddErr] = useState('');
  const [showOrder, setShowOrder] = useState(false);
  const [oSide, setOSide] = useState<'buy' | 'sell'>('buy');
  const [oQty, setOQty] = useState(Number(settings.defaultOrderQty || 100));
  const [tradeMode, setTradeMode] = useState<'paper' | 'real'>('paper');
  const [broker, setBroker] = useState(String(settings.defaultBroker || 'Fubon'));
  const [orderType, setOrderType] = useState(String(settings.defaultOrderType || 'ROD'));
  const [priceType, setPriceType] = useState(String(settings.defaultPriceType || 'LMT'));
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const containerRef = useRef<ScrollView>(null);
  const loadingRef = useRef(false);

  const enrich = (d: WatchlistItem, bars: number[] = []): Stock => ({
    symbol: d.symbol,
    name: d.name ?? d.symbol,
    shortName: d.name ?? d.symbol,
    price: d.price ?? 0,
    change: d.change ?? 0,
    changePct: d.changePct ?? 0,
    volume: 0,
    open: 0,
    high: 0,
    low: 0,
    bid: d.price ?? 0,
    ask: d.price ?? 0,
    bars,
  });

  const fetchBars = async (symbol: string, days = 7): Promise<number[]> => {
    try {
      const hist = await api.getHistory(symbol, { interval: '1d' });
      if (!Array.isArray(hist) || !hist.length) return [];
      return hist.slice(-days)
        .filter((r: { close: number }) => r?.close && isFinite(Number(r.close)))
        .map((r: { close: number }) => Number(r.close));
    } catch (e) {
      console.warn('[MarketOverview] getHistory:', e);
      return [];
    }
  };

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
        const barsMapIdx = await fetchBarsConcurrently(idxSymbols, 30);
        return INDICES.map((idx) => {
          const quote = qMap.get(idx.symbol) as Quote | undefined;
          const bars = barsMapIdx.get(idx.symbol) || [];
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

  const pullState = usePullToRefresh(containerRef, { onRefresh: () => loadAllData(true) });

  useEffect(() => { loadAllData(); }, [loadAllData]);
  useEffect(() => {
    const id = setInterval(() => loadAllData(true), 30000);
    return () => clearInterval(id);
  }, [loadAllData]);

  const executeTrade = async () => {
    if (!selected) return;
    setLoadState('refreshing');
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
      setLoadState('idle');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleAdd = async () => {
    const sym = addInput.trim().toUpperCase();
    if (!sym) return;
    if (stocks.find(s => s.symbol === sym)) { setAddInput(''); setShowAdd(false); return; }
    setLoadState('refreshing');
    setAddErr('');
    try {
      const q: Quote = await api.getQuote(sym);
      if (!q?.regularMarketPrice) throw new Error('找不到此代碼，請確認格式');
      const bars = await fetchBars(sym, 7);
      const ns = enrich(q, bars);
      const updated = [...stocks, ns];
      setStocks(updated);
      setSelected(ns);
      await api.setWatchlist(updated.map(s => ({ symbol: s.symbol, name: s.name })));
      setAddInput('');
      setShowAdd(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '查詢失敗';
      setAddErr(msg);
    } finally {
      setLoadState('idle');
    }
  };

  const handleRemove = async (sym: string) => {
    const updated = stocks.filter(s => s.symbol !== sym);
    setStocks(updated);
    if (selected?.symbol === sym) setSelected(updated[0] ?? null);
    await api.setWatchlist(updated.map(s => ({ symbol: s.symbol, name: s.name })));
  };

  const up = (s: { changePct: number } | Stock) => s.changePct >= 0;

  if (fetchErr && marketData.length === 0 && stocks.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <AlertCircle size={32} color="#fb7185" />
          <Text style={styles.errorTitle}>市場資料載入失敗</Text>
          <Text style={styles.errorText}>{fetchErr}</Text>
          <TouchableOpacity onPress={() => loadAllData()} style={styles.retryBtn}>
            <Text style={styles.retryText}>重試</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && marketData.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <Loader2 size={32} color="#34d399" />
          <Text style={styles.loadingTitle}>INITIALIZING MARKET DATA ENGINE...</Text>
          <Text style={styles.loadingText}>正在與 Yahoo Finance 建立安全連線並獲取真實報價</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={containerRef} contentContainerStyle={[styles.container, compact ? styles.containerCompact : styles.containerGap]} showsVerticalScrollIndicator={false}>
        <PullToRefreshIndicator state={pullState} />
        {toast && (
          <View style={[styles.toast, toast.type === 'success' ? styles.toastSuccess : styles.toastError]}>
            <Text style={styles.toastText}>{toast.msg}</Text>
          </View>
        )}

        <View style={styles.headerRow}>
          <View style={styles.lastUpdate}>
            <Text style={styles.lastUpdateText}>LAST UPDATE: {lastUpdate}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.indexRow}>
          {marketData.map((idx) => (
            <IndexCard key={idx.symbol} idx={idx} compact={compact} onSelect={onSelectSymbol} />
          ))}
        </ScrollView>

        <View style={styles.watchSection}>
          <View style={styles.watchHeader}>
            <Text style={styles.watchTitle}>Watchlist</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brokerRow}>
              {BROKERS.map((b, i) => (
                <TouchableOpacity key={i} onPress={() => setBroker(b)} style={[styles.brokerBtn, broker === b ? styles.brokerBtnActive : styles.brokerBtnInactive]}>
                  <Text style={[styles.brokerText, broker === b ? styles.brokerTextActive : styles.brokerTextInactive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.watchGridWrap}>
            <View style={styles.watchGrid}>
              {stocks.map(s => (
                <WatchlistStockCard
                  key={s.symbol}
                  s={s}
                  isSelected={selected?.symbol === s.symbol}
                  onSelect={(stock) => { setSelected(stock); onSelectSymbol?.(stock.symbol); }}
                  onRemove={handleRemove}
                />
              ))}

              <Pressable onPress={() => !showAdd && setShowAdd(true)} style={({ pressed }) => [styles.addCard, pressed && styles.pressed]}>
                {showAdd ? (
                  <View style={styles.addInner} onStartShouldSetResponder={() => true}>
                    <Text style={styles.addTitle}>新增自選股</Text>
                    <View style={styles.searchBox}>
                      <Search size={16} color="#737373" />
                      <TextInput
                        autoFocus
                        value={addInput}
                        onChangeText={(text) => { setAddInput(text.toUpperCase()); setAddErr(''); }}
                        onSubmitEditing={handleAdd}
                        placeholder="輸入代碼..."
                        placeholderTextColor="#737373"
                        style={styles.searchInput}
                      />
                    </View>
                    {!!addErr && <Text style={styles.addErr}>{addErr}</Text>}
                    <View style={styles.addActions}>
                      <TouchableOpacity onPress={handleAdd} disabled={busy} style={styles.confirmBtn}>
                        {busy ? <Loader2 size={14} color="#34d399" /> : null}
                        <Text style={styles.confirmText}>確認</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setShowAdd(false); setAddInput(''); setAddErr(''); }} style={styles.cancelBtn}>
                        <Text style={styles.cancelText}>取消</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.addEmpty}>
                    <View style={styles.addCircle}><Plus size={24} color="#737373" /></View>
                    <Text style={styles.addEmptyText}>新增標的</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {selected && (
              <View style={styles.quotePanel}>
                <View style={styles.quoteCard}>
                  <View style={styles.quoteHeader}>
                    <Text style={styles.quoteTitle}>報價詳情</Text>
                    <Text style={styles.quoteSymbol}>{selected.symbol}</Text>
                  </View>
                  <View style={styles.quoteList}>
                    <QuoteRow label="開盤價" value={selected.open?.toFixed(2) ?? '-'} />
                    <QuoteRow label="最高價" value={selected.high?.toFixed(2) ?? '-'} valueStyle={styles.earnText} />
                    <QuoteRow label="最低價" value={selected.low?.toFixed(2) ?? '-'} valueStyle={styles.lossText} />
                    <QuoteRow label="成交量" value={selected.volume?.toLocaleString() ?? '-'} />
                    <QuoteRow label="買進價" value={selected.bid?.toFixed(2) ?? '-'} />
                    <QuoteRow label="賣出價" value={selected.ask?.toFixed(2) ?? '-'} />
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.marketSection}>
          <View style={styles.trendingCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}><Flame size={16} color="#fb923c" /> 市場熱點 (Trending)</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingRow}>
              {trending.length > 0 ? trending.map((t: Stock) => {
                const isUp = (t.changePct || 0) >= 0;
                return (
                  <Pressable key={t.symbol} onPress={() => onSelectSymbol(t.symbol)} style={({ pressed }) => [styles.trendingItem, pressed && styles.pressed]}>
                    <View style={styles.trendingLeft}>
                      <View style={styles.trendingAvatar}>
                        <Text style={styles.trendingAvatarText}>{t.symbol.slice(0, 2)}</Text>
                      </View>
                      <View>
                        <Text style={styles.trendingSymbol}>{t.symbol}</Text>
                        <Text style={styles.trendingShort}>{t.shortName || 'N/A'}</Text>
                      </View>
                    </View>
                    <View style={styles.trendingRight}>
                      <Text style={styles.trendingPrice}>{t.price?.toFixed(2) || '---'}</Text>
                      <Text style={[styles.trendingChange, isUp ? styles.upText : styles.downText]}>{isUp ? '+' : ''}{(t.changePct || 0).toFixed(2)}%</Text>
                    </View>
                  </Pressable>
                );
              }) : <Text style={styles.loadingInline}>載入中...</Text>}
            </ScrollView>
          </View>

          <View style={styles.newsCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}><Newspaper size={16} color="#818cf8" /> 國際財經快訊 (News)</Text>
            </View>
            <View style={styles.newsGrid}>
              {news.length > 0 ? news.map((n: NewsItem, i: number) => (
                <Pressable key={i} onPress={() => n.link && Linking.openURL(n.link)} style={({ pressed }) => [styles.newsItem, pressed && styles.pressed]}>
                  <View style={styles.newsTop}>
                    <Text style={styles.newsTitle} numberOfLines={2}>{n.title}</Text>
                    <ExternalLink size={12} color="#52525b" />
                  </View>
                  <View style={styles.newsMeta}>
                    <Text style={styles.newsMetaText}>{n.publisher || 'Yahoo Finance'}</Text>
                    <Text style={styles.newsMetaText}>·</Text>
                    <Text style={styles.newsMetaText}>{new Date((n.providerPublishTime || Date.now() / 1000) * 1000).toLocaleString()}</Text>
                  </View>
                </Pressable>
              )) : <Text style={styles.loadingInlineWide}>讀取新聞中...</Text>}
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.orderFloating}>
        <Modal visible={showOrder && !!selected} transparent animationType="fade" onRequestClose={() => setShowOrder(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShowOrder(false)} />
          <View style={styles.orderSheetWrap}>
            <View style={styles.orderSheet}>
              <View style={styles.handle} />
              <View style={styles.orderHeader}>
                <View>
                  <Text style={styles.orderTitle}>快速委託</Text>
                  <Text style={styles.orderSub}>{selected?.symbol}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowOrder(false)} style={styles.orderClose}>
                  <X size={18} color="#a1a1aa" />
                </TouchableOpacity>
              </View>

              <View style={styles.sideRow}>
                {(['buy', 'sell'] as const).map(s => (
                  <TouchableOpacity key={s} onPress={() => setOSide(s)} style={[styles.sideBtn, oSide === s ? (s === 'buy' ? styles.sideBuyActive : styles.sideSellActive) : styles.sideInactive]}>
                    <Text style={[styles.sideText, oSide === s ? styles.sideTextActive : styles.sideTextInactive]}>{s === 'buy' ? '買進' : '賣出'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formGap}>
                <View style={styles.selectRow}>
                  <PickerLike value={tradeMode} onChange={v => setTradeMode(v as 'paper' | 'real')} options={[['paper', '模擬交易'], ['real', '實際交易']]} />
                  <PickerLike value={broker} onChange={setBroker} options={[['Fubon', '富邦'], ['Cathay', '國泰'], ['UB', '聯邦'], ['Sinopac', '永豐金']]} />
                </View>

                <View style={styles.selectRow}>
                  <PickerLike value={orderType} onChange={setOrderType} options={[['ROD', 'ROD'], ['IOC', 'IOC'], ['FOK', 'FOK']]} />
                  <PickerLike value={priceType} onChange={setPriceType} options={[['LMT', '限價'], ['MKT', '市價']]} />
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.labelMuted}>現價</Text>
                  <Text style={[styles.currentPrice, up(selected) ? styles.upText : styles.downText]}>{selected?.price.toFixed(2)}</Text>
                </View>

                <View>
                  <Text style={styles.qtyLabel}>委託數量</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={String(oQty)}
                    onChangeText={(text) => setOQty(Number(text))}
                    style={styles.qtyInput}
                  />
                </View>

                <View style={styles.totalRow}>
                  <Text style={styles.labelMuted}>預估金額</Text>
                  <Text style={styles.totalText}>${new Decimal(selected?.price || 0).times(oQty).toNumber().toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                </View>

                <TouchableOpacity onPress={executeTrade} style={[styles.executeBtn, oSide === 'buy' ? styles.buyBtn : styles.sellBtn]}>
                  <Text style={styles.executeText}>確認{oSide === 'buy' ? '買進' : '賣出'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <TouchableOpacity onPress={() => setShowOrder(v => !v)} style={styles.fab}>
          <Zap size={18} color="#052e16" />
          <Text style={styles.fabText}>快速委託</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const QuoteRow = ({ label, value, valueStyle }: { label: string; value: string; valueStyle?: any }) => (
  <View style={styles.quoteRow}>
    <Text style={styles.quoteKey}>{label}</Text>
    <Text style={[styles.quoteValue, valueStyle]}>{value}</Text>
  </View>
);

const PickerLike = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) => (
  <View style={styles.picker}>
    {options.map(([val, label]) => {
      const active = val === value;
      return (
        <TouchableOpacity key={val} onPress={() => onChange(val)} style={[styles.pickerOption, active ? styles.pickerOptionActive : styles.pickerOptionInactive]}>
          <Text style={[styles.pickerText, active ? styles.pickerTextActive : styles.pickerTextInactive]}>{label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#09090b' },
  container: { paddingBottom: 40, paddingRight: 16, paddingHorizontal: 16, backgroundColor: '#09090b' },
  containerGap: { gap: 32 },
  containerCompact: { gap: 8 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  errorTitle: { color: '#fb7185', fontSize: 14, fontWeight: '700' },
  errorText: { color: '#64748b', fontSize: 12, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  retryText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  loadingTitle: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },
  loadingText: { color: '#64748b', fontSize: 12, textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  lastUpdate: { backgroundColor: '#09090b', borderColor: '#27272a', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignSelf: 'flex-start' },
  lastUpdateText: { color: '#71717a', fontSize: 10, fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }), textTransform: 'uppercase', letterSpacing: 1.5 },
  indexRow: { gap: 16, paddingBottom: 8 },
  indexCard: { minWidth: 200, borderRadius: 20, borderWidth: 1, borderColor: '#27272a', padding: 16, backgroundColor: 'rgba(24,24,27,0.92)', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  indexCardCompact: { padding: 12 },
  indexCardVix: { backgroundColor: 'rgba(228,228,231,0.06)', borderRadius: 16 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  indexTop: { marginBottom: 24 },
  indexHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  indexIconWrap: { padding: 16, borderRadius: 16 },
  upBg: { backgroundColor: 'rgba(16,185,129,0.1)' },
  downBg: { backgroundColor: 'rgba(244,63,94,0.1)' },
  indexName: { fontSize: 20, fontWeight: '900', color: '#e4e4e7' },
  indexSymbol: { fontSize: 12, color: 'rgba(228,228,231,0.5)', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }), textTransform: 'uppercase', letterSpacing: 2 },
  indexBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  indexPrice: { fontSize: 28, fontWeight: '900', color: '#e4e4e7', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }), marginBottom: 12 },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, width: 'auto' },
  upBadge: { backgroundColor: 'rgba(16,185,129,0.1)' },
  downBadge: { backgroundColor: 'rgba(244,63,94,0.1)' },
  changeText: { fontSize: 14, fontWeight: '900' },
  upText: { color: '#34d399' },
  downText: { color: '#fb7185' },
  upBadgeText: { color: '#34d399' },
  downBadgeText: { color: '#fb7185' },
  sparkWrap: { width: 96, height: 48 },
  watchSection: { gap: 16 },
  watchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  watchTitle: { color: '#fafafa', fontSize: 18, fontStyle: 'italic' },
  brokerRow: { gap: 8 },
  brokerBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  brokerBtnActive: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' },
  brokerBtnInactive: { backgroundColor: '#09090b', borderColor: '#27272a' },
  brokerText: { fontSize: 10, textTransform: 'uppercase', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
  brokerTextActive: { color: '#34d399' },
  brokerTextInactive: { color: '#71717a' },
  watchGridWrap: { flexDirection: 'row', gap: 16 },
  watchGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  watchCard: { minWidth: '48%', flexGrow: 1, backgroundColor: '#18181b', borderColor: '#27272a', borderWidth: 1, borderRadius: 16, padding: 16, position: 'relative' },
  watchCardSelected: { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.05)' },
  removeBtn: { position: 'absolute', top: 8, right: 8, padding: 4, borderRadius: 999, backgroundColor: '#09090b' },
  watchTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  watchSymbol: { color: '#e4e4e7', fontSize: 18, fontWeight: '700' },
  watchShort: { color: 'rgba(228,228,231,0.5)', fontSize: 12, fontStyle: 'italic', maxWidth: 140 },
  watchChange: { fontSize: 12, fontWeight: '700', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
  watchPrice: { fontSize: 22, fontWeight: '700', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
  watchBidAsk: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  watchBidAskText: { color: 'rgba(228,228,231,0.5)', fontSize: 12, fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
  addCard: { flexBasis: '100%', minHeight: 160, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: '#27272a', backgroundColor: 'rgba(24,24,27,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  addInner: { width: '100%', gap: 12 },
  addTitle: { color: '#fafafa', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#09090b', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: '#27272a' },
  searchInput: { flex: 1, color: '#fafafa', paddingVertical: 12, fontSize: 16 },
  addErr: { color: '#fb7185', fontSize: 14, paddingHorizontal: 4 },
  addActions: { flexDirection: 'row', gap: 12 },
  confirmBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#052e16', borderWidth: 1, borderColor: '#14532d', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  confirmText: { color: '#34d399', fontSize: 14, fontWeight: '700' },
  cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#27272a', borderWidth: 1, borderColor: '#3f3f46', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#a1a1aa', fontSize: 14, fontWeight: '700' },
  addEmpty: { alignItems: 'center', justifyContent: 'center' },
  addCircle: { width: 48, height: 48, borderRadius: 999, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  addEmptyText: { color: '#71717a', fontSize: 14, fontWeight: '600' },
  quotePanel: { width: '100%' },
  quoteCard: { backgroundColor: 'rgba(24,24,27,0.9)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#27272a', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  quoteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  quoteTitle: { color: '#fafafa', fontSize: 14, fontWeight: '700' },
  quoteSymbol: { color: '#34d399', fontSize: 12, fontWeight: '700', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }), backgroundColor: '#052e16', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  quoteList: { marginTop: 16, gap: 8 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  quoteKey: { color: '#71717a', fontSize: 12 },
  quoteValue: { color: '#fafafa', fontSize: 12 },
  earnText: { color: '#34d399' },
  lossText: { color: '#fb7185' },
  marketSection: { flex: 1, minHeight: 250, gap: 24 },
  trendingCard: { borderRadius: 20, padding: 20, backgroundColor: 'rgba(24,24,27,0.9)', borderWidth: 1, borderColor: '#27272a' },
  newsCard: { borderRadius: 20, padding: 20, backgroundColor: 'rgba(24,24,27,0.9)', borderWidth: 1, borderColor: '#27272a' },
  sectionHeader: { marginBottom: 16 },
  sectionTitle: { color: '#fafafa', fontSize: 14, fontWeight: '700' },
  trendingRow: { gap: 12 },
  trendingItem: { minWidth: 200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 14, backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a' },
  trendingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trendingAvatar: { width: 28, height: 28, borderRadius: 999, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' },
  trendingAvatarText: { color: '#fafafa', fontSize: 11, fontWeight: '700' },
  trendingSymbol: { color: '#fafafa', fontSize: 12, fontWeight: '700' },
  trendingShort: { color: '#71717a', fontSize: 12, maxWidth: 80 },
  trendingRight: { alignItems: 'flex-end' },
  trendingPrice: { color: '#fafafa', fontSize: 12, fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }), fontWeight: '700' },
  trendingChange: { fontSize: 12, fontWeight: '700', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
  loadingInline: { color: '#71717a', textAlign: 'center', paddingVertical: 24, fontSize: 12 },
  newsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  newsItem: { flexBasis: '31%', minWidth: 180, flexGrow: 1, padding: 12, borderRadius: 14, backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a' },
  newsTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  newsTitle: { color: '#d4d4d8', fontSize: 12, fontWeight: '700', lineHeight: 18, flex: 1 },
  newsMeta: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  newsMetaText: { color: '#71717a', fontSize: 12 },
  loadingInlineWide: { color: '#71717a', textAlign: 'center', width: '100%', paddingVertical: 24, fontSize: 12 },
  orderFloating: { position: 'absolute', right: 16, bottom: 16, zIndex: 60 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#34d399', borderRadius: 999, shadowColor: '#34d399', shadowOpacity: 0.3, shadowRadius: 14, elevation: 6 },
  fabText: { color: '#052e16', fontWeight: '700', fontSize: 14 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  orderSheetWrap: { flex: 1, justifyContent: 'flex-end' },
  orderSheet: { backgroundColor: '#09090b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 1, borderTopColor: '#27272a' },
  handle: { width: 48, height: 6, backgroundColor: '#27272a', borderRadius: 999, alignSelf: 'center', marginBottom: 24 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  orderTitle: { color: '#fafafa', fontSize: 18, fontWeight: '700' },
  orderSub: { color: '#71717a', fontSize: 12 },
  orderClose: { padding: 8, borderRadius: 999, backgroundColor: '#18181b' },
  sideRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  sideBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  sideBuyActive: { backgroundColor: '#34d399' },
  sideSellActive: { backgroundColor: '#fb7185' },
  sideInactive: { backgroundColor: '#18181b' },
  sideText: { fontSize: 14, fontWeight: '700' },
  sideTextActive: { color: '#0a0a0a' },
  sideTextInactive: { color: '#a1a1aa' },
  formGap: { gap: 16 },
  selectRow: { flexDirection: 'row', gap: 8 },
  picker: { flex: 1, flexDirection: 'row', backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a', borderRadius: 14, overflow: 'hidden' },
  pickerOption: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  pickerOptionActive: { backgroundColor: '#18181b' },
  pickerOptionInactive: { backgroundColor: '#09090b' },
  pickerText: { fontSize: 12, fontWeight: '700' },
  pickerTextActive: { color: '#fafafa' },
  pickerTextInactive: { color: '#a1a1aa' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  labelMuted: { color: '#a1a1aa', fontSize: 12 },
  currentPrice: { fontSize: 16, fontWeight: '700', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
  qtyLabel: { color: '#71717a', fontSize: 12, marginBottom: 6 },
  qtyInput: { backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: '#fafafa', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }), fontSize: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#27272a' },
  totalText: { color: '#fafafa', fontSize: 16, fontWeight: '700', fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
  executeBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  buyBtn: { backgroundColor: '#34d399' },
  sellBtn: { backgroundColor: '#fb7185' },
  executeText: { color: '#fafafa', fontSize: 14, fontWeight: '700' },
  toast: { position: 'absolute', top: 20, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, zIndex: 50 },
  toastSuccess: { backgroundColor: '#10b981' },
  toastError: { backgroundColor: '#ef4444' },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
