import React, { useState, useEffect, useMemo, useCallback, useRef, memo, lazy, Suspense } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  BrainCircuit, 
  Activity, 
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  RefreshCw
} from 'lucide-react-native';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { apiUrl, IS_MOBILE_WEBVIEW } from '../services/api';
import ChartWidget from './ChartWidget';
import { PerformanceSummary } from './PerformanceSummary';
import { Quote, HistoricalData, AIAnalysisResult, SentimentData, Trade } from '../types';
import { useSettings } from '../contexts/SettingsContext';

const MemoizedChartWidget = memo(ChartWidget);

const PaperTradingDashboard = lazy(() => import('./PaperTradingDashboard'));
const StrategyComparison = lazy(() => import('./StrategyComparison'));
const LiveTradingConsole = lazy(() => import('./LiveTradingConsole'));
import { analyzeStock, analyzeSentiment } from '../services/aiService';
import { calculateRSI, calculateMACD, calculateKD, calculateVWAP } from '../lib/indicators';

type FetchStatus = 'loading' | 'refreshing' | 'idle' | 'error';
type AiStatus = 'idle' | 'analyzing' | 'sentiment' | 'done';

export default function Dashboard({ model, symbol }: { model: string, symbol: string }) {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [marketData, setMarketData] = useState<Partial<Quote>[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [sentimentAnalysis, setSentimentAnalysis] = useState<SentimentData | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('loading');
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const analyzingRef = useRef(false);

  const fetchData = useCallback(async (quiet = false) => {
    setFetchStatus(quiet ? 'refreshing' : 'loading');
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);
      const period1 = oneYearAgo.toISOString().split('T')[0];

      const [quoteData, historyData, mData, tradesData] = await Promise.all([
        api.getQuote(symbol),
        api.getHistory(symbol, { period1 }),
        fetch(apiUrl(`/api/market-summary?symbol=${symbol}`)).then(r => r.json()).catch(() => []),
        api.getTrades()
      ]);

      if (quoteData) setQuote(quoteData);
      setHistoricalData(Array.isArray(historyData) ? historyData : []);
      setMarketData(Array.isArray(mData) ? mData : []);
      setRecentTrades(Array.isArray(tradesData) ? tradesData.slice(0, 5) : []);
      setFetchStatus('idle');
    } catch (error) {
      console.error("Error fetching data:", error);
      setFetchStatus('error');
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
        if (mounted) setAiStatus('analyzing');
        const analysis = await analyzeStock(symbol, quote, historicalData, model);
        if (mounted) setAiAnalysis(analysis);

        if (mounted) setAiStatus('sentiment');
        const sentiment = await analyzeSentiment(marketData, model, String(settings.systemInstruction || ''));
        if (mounted) setSentimentAnalysis(sentiment);
        if (mounted) setAiStatus('done');
      } catch (error) {
        console.error("Error running AI analysis:", error);
        if (mounted) setAiStatus('idle');
      } finally {
        analyzingRef.current = false;
      }
    };

    const handler = setTimeout(runAnalysis, 500);
    return () => { mounted = false; clearTimeout(handler); };
  }, [symbol, model, quote, historicalData, marketData, settings.systemInstruction]);

  const indicators = useMemo(() => {
    if (!Array.isArray(historicalData) || historicalData.length === 0) return null;
    
    const toNum = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
    const closes = historicalData.map(d => toNum(d?.close));
    const highs   = historicalData.map(d => toNum(d?.high));
    const lows    = historicalData.map(d => toNum(d?.low));

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
      rsiStatus: (rsi !== undefined ? (rsi > 70 ? 'bearish' : rsi < 30 ? 'bullish' : 'neutral') : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      rsiLabel: rsi !== undefined ? (rsi > 70 ? '超買區 (Overbought)' : rsi < 30 ? '超賣區 (Oversold)' : '中性區間 (Neutral)') : '-',
      
      macd: macd?.MACD !== undefined ? macd.MACD.toFixed(2) : '-',
      macdStatus: (macd?.histogram !== undefined ? (macd.histogram > 0 ? 'bullish' : 'bearish') : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      macdLabel: macd?.histogram !== undefined ? (macd.histogram > 0 ? '多頭排列 (Bullish)' : '空頭排列 (Bearish)') : '-',
      
      kdK: kd?.K !== undefined ? kd.K.toFixed(1) : '-',
      kdStatus: (kd?.K !== undefined ? (kd.K > 80 ? 'bearish' : kd.K < 20 ? 'bullish' : 'neutral') : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      kdLabel: kd?.K !== undefined ? (kd.K > 80 ? '超買區 (Overbought)' : kd.K < 20 ? '超賣區 (Oversold)' : '中性區間 (Neutral)') : '-',
      
      vwap: vwap !== undefined ? vwap.toFixed(2) : '-',
      vwapStatus: (vwap !== undefined && quote ? (quote.regularMarketPrice > vwap ? 'bullish' : 'bearish') : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      vwapLabel: vwap !== undefined && quote ? (quote.regularMarketPrice > vwap ? '價格 > VWAP' : '價格 < VWAP') : '-'
    };
  }, [historicalData, quote]);

const isUp = (quote?.regularMarketChange ?? 0) >= 0;

const exportToCSV = (data: HistoricalData[], filename: string) => {
  if (IS_MOBILE_WEBVIEW) {
    Alert.alert('匯出功能僅支援桌面版（Electron）。行動版請使用電腦匯出後傳送檔案。');
    return;
  }
  const csvContent = "data:text/csv;charset=utf-8," +
    ["Date,Open,High,Low,Close,Volume"].concat(
      data.map(r => `${r.date},${r.open},${r.high},${r.low},${r.close},${r.volume}`)
    ).join("\n");
  const encodedUri = encodeURI(csvContent);
  // @ts-ignore
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}.csv`);
  // @ts-ignore
  document.body.appendChild(link);
  try { link.click(); } finally { 
    // @ts-ignore
    document.body.removeChild(link); 
  }
};

  if (fetchStatus === 'error') {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIconWrapper}>
          <AlertCircle size={32} color="#ef4444" />
        </View>
        <Text style={styles.errorTitle}>連線異常</Text>
        <Text style={styles.errorText}>無法取得 {symbol} 的市場資料，請檢查網路連線或稍後再試。</Text>
        <TouchableOpacity 
          onPress={() => fetchData()}
          style={styles.retryButton}
        >
          <RefreshCw size={16} color="#f4f4f5" />
          <Text style={styles.retryButtonText}>重新整理</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <View style={styles.mainGrid}>
          <View style={styles.leftColumn}>
            <View style={styles.summaryWrapper}>
              <PerformanceSummary trades={recentTrades} />
            </View>
            
            <View style={cn(styles.chartCard, compact ? styles.p1 : styles.p2)}>
              <View style={styles.chartHeader}>
                <View style={styles.headerLeft}>
                  <View style={cn(styles.symbolIcon, compact ? styles.w10h10 : styles.w16h16)}>
                    <Zap size={compact ? 20 : 32} color="#34d399" />
                  </View>
                  <View style={styles.symbolInfo}>
                    <Text style={cn(styles.shortName, compact ? styles.textLg : styles.text2xl)} numberOfLines={1}>{quote?.shortName || symbol}</Text>
                    <Text style={styles.longName} numberOfLines={1}>{quote?.longName || symbol}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
