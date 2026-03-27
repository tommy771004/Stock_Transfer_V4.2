import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import {
  Play,
  Download,
  Trophy,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronDown,
  Settings,
  Activity,
  ArrowDownRight,
  Target,
  FileText,
} from 'lucide-react-native';
import { runBacktest, IS_MOBILE_WEBVIEW } from '../services/api';
import { BacktestResult, BacktestMetrics } from '../types';
import { buildBacktestPdf } from '../utils/exportPdf';

const STRATEGIES = [
  {
    id: 'ma_crossover',
    label: '均線交叉策略',
    en: 'MA Crossover',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.12)',
    type: '趨勢跟蹤',
    desc: '當短期均線（10日）向上穿越長期均線（30日）時買進，反之賣出。適合趨勢明顯的市場。',
    buyDesc: 'SMA10 由下往上穿越 SMA30（黃金交叉）→ 多方趨勢確立，買進',
    sellDesc: 'SMA10 由上往下穿越 SMA30（死亡交叉）→ 空方訊號，賣出',
    beginner: '💡 新手說明：均線是一段時間內價格的平均值。短期均線穿越長期均線代表近期買盤增強，是趨勢轉多的訊號。',
    suitable: '📈 適合行情：單邊趨勢（牛市或熊市）',
    avoid: '⚠️ 不適合：震盪整理盤，容易產生假訊號',
  },
  {
    id: 'neural',
    label: '多因子AI策略',
    en: 'Neural Transfer',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.12)',
    type: 'AI模型',
    desc: '模擬機器學習模型，同時分析動量、成交量、波動度三個因子，综合評分後決策。',
    buyDesc: 'EMA8/EMA21 動量評分>0.3，且成交量放大，且 ATR 波動率>0.8%，三因子同時滿足才買進',
    sellDesc: 'EMA8/EMA21 動量評分轉負（-0.2以下），模型認為上漲動能消失，賣出',
    beginner: '💡 新手說明：AI策略同時看多個指標（動量+量能+波動），需要多個條件同時成立才下單，訊號較少但精準度較高。',
    suitable: '📈 適合行情：趨勢+量能配合的市場',
    avoid: '⚠️ 不適合：低波動、無趨勢的市場',
  },
  {
    id: 'rsi',
    label: 'RSI 超買超賣',
    en: 'RSI Mean Rev.',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    type: '均值回歸',
    desc: 'RSI（相對強弱指標）低於35時認為超賣，等待回升後買進；高於65時認為超買，等待回落後賣出。',
    buyDesc: 'RSI(14) 從 35 以下回升到 35 → 超賣結束，開始反彈，買進',
    sellDesc: 'RSI(14) 從 65 以上回落到 65 → 超買結束，開始回落，賣出',
    beginner: '💡 新手說明：RSI衡量「最近漲跌幅的強弱」，0~30代表超賣（可能反彈），70~100代表超買（可能下跌）。本策略等待反轉確認後才進場。',
    suitable: '📈 適合行情：區間震盪行情',
    avoid: '⚠️ 不適合：單邊趨勢行情（容易抄底套牢）',
  },
  {
    id: 'macd',
    label: 'MACD 動能策略',
    en: 'MACD Momentum',
    color: '#f472b6',
    bg: 'rgba(244,114,182,0.12)',
    type: '動量策略',
    desc: 'MACD柱狀圖（快慢線差值）由負轉正，且主線在零軸之上，確認多頭動能；柱狀圖轉負則賣出。',
    buyDesc: 'MACD 柱狀圖由負轉正（動能翻多），且 MACD 主線>0（在零軸上方），買進',
    sellDesc: 'MACD 柱狀圖由正轉負（動能翻空），賣出離場',
    beginner: '💡 新手說明：MACD用兩條不同速度的均線相減，代表市場「動能強弱」。柱狀圖由負轉正代表多頭力量開始超越空頭。',
    suitable: '📈 適合行情：趨勢轉折點、中期趨勢',
    avoid: '⚠️ 不適合：快速震盪行情（MACD反應較慢）',
  },
];

type StratId = typeof STRATEGIES[number]['id'];
const DEFAULT_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'BTC-USD', 'ETH-USD', '2330.TW', 'SPY', 'QQQ'];

export default function BacktestPage({ initialSymbol }: { initialSymbol?: string } = {}) {
  const [symbolsList, setSymbolsList] = useState<string[]>(DEFAULT_SYMBOLS);
  const [symbol, setSymbol] = useState(initialSymbol ?? 'AAPL');
  const [period1, setPeriod1] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [period2, setPeriod2] = useState(() => new Date().toISOString().split('T')[0]);
  const [capital, setCapital] = useState('1000000');
  const [strategy, setStrategy] = useState<StratId>('ma_crossover');
  
  type BtRunState = 'idle' | 'running' | 'comparing';
  const [runState, setRunState] = useState<BtRunState>('idle');
  const running = runState === 'running';
  const comparing = runState === 'comparing';
  
  const [result, setResult] = useState<BacktestResult & { strategy: string } | null>(null);
  const [error, setError] = useState('');
  const [tradeSort, setTradeSort] = useState<'date' | 'pnl'>('date');
  const [showDd, setShowDd] = useState(true);
  
  const chartKeyRef = useRef(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareResults, setCompareResults] = useState<Record<string, BacktestResult & { strategy: string }>>({});

  const strat = STRATEGIES.find(s => s.id === strategy) ?? STRATEGIES[0];

  const handleCompare = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('請輸入股票代碼'); return; }
    setRunState('comparing'); setError(''); setCompareResults({});
    const cap = parseInt(capital.replace(/,/g, ''), 10) || 1_000_000;
    const results: Record<string, BacktestResult & { strategy: string }> = {};
    
    for (let i = 0; i < STRATEGIES.length; i += 2) {
      const chunk = STRATEGIES.slice(i, i + 2);
      await Promise.all(chunk.map(async s => {
        try {
          const r = await runBacktest({ symbol: sym, period1, period2: period2 || undefined, initialCapital: cap, strategy: s.id });
          if (r?.metrics) results[s.id] = { ...r, strategy: s.id };
        } catch (e) { console.warn('[BacktestPage] runBacktest strategy:', s.id, e); }
      }));
    }
    
    setCompareResults({ ...results });
    setCompareMode(true);
    setRunState('idle');
  };

  const handleRun = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('請輸入股票/加密貨幣代碼'); return; }
    if (new Date(period1) >= new Date(period2)) { setError('開始日期必須早於結束日期'); return; }
    if (!symbolsList.includes(sym)) setSymbolsList(p => [sym, ...p]);

    chartKeyRef.current += 1;

    setRunState('running'); setError(''); setResult(null);
    try {
      const cap = parseInt(capital.replace(/,/g, ''), 10) || 1_000_000;
      const r = await runBacktest({ symbol: sym, strategy, initialCapital: cap, startDate: period1, endDate: period2 || '' });
      if (!r || typeof r !== 'object') throw new Error('伺服器回傳格式錯誤');
      const safe = {
        ...r,
        equityCurve: Array.isArray(r.equityCurve) ? r.equityCurve : [],
        trades: Array.isArray(r.trades) ? r.trades : [],
        metrics: r.metrics || { roi: 0, sharpe: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, avgWin: 0, avgLoss: 0, profitFactor: 0 },
        strategy,
      };
      if (safe.equityCurve.length === 0) throw new Error('該時間區間內無足夠歷史資料，請擴大日期範圍（建議至少6個月）');
      setResult(safe);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : '回測執行失敗，請稍後再試');
    } finally {
      setRunState('idle');
    }
  };

  const exportCSV = () => {
    Alert.alert('匯出功能', '匯出 CSV 功能目前僅支援桌面版。');
  };

  const cycleStrategy = () => {
    const currentIndex = STRATEGIES.findIndex(s => s.id === strategy);
    const nextIndex = (currentIndex + 1) % STRATEGIES.length;
    setStrategy(STRATEGIES[nextIndex].id);
  };

  const metrics: BacktestMetrics = result?.metrics || { roi: 0, sharpe: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, avgWin: 0, avgLoss: 0, profitFactor: 0 };
  const equityData = result?.equityCurve || [];
  const benchEnd = equityData[equityData.length - 1]?.benchmark ?? 0;
  const resultStrat = STRATEGIES.find(s => s.id === result?.strategy) || strat;

  const tradesRaw = result?.trades || [];
  const trades = [...tradesRaw].sort((a, b) =>
    tradeSort === 'pnl' ? (b.pnl ?? 0) - (a.pnl ?? 0) : new Date(b.exitTime ?? '').getTime() - new Date(a.exitTime ?? '').getTime()
  );

  let maxWinStreak = 0, maxLossStreak = 0, curW = 0, curL = 0;
  for (const t of [...tradesRaw].reverse()) {
    if (t.result === 'WIN') { curW++; curL = 0; maxWinStreak = Math.max(maxWinStreak, curW); }
    else { curL++; curW = 0; maxLossStreak = Math.max(maxLossStreak, curL); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerIcon}>
            <Play size={24} color="#09090b" fill="#09090b" />
          </View>
          <View style={styles.headerTextContainer}>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>回測引擎</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>V4.2</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>QUANTUM BACKTESTING LAB</Text>
          </View>
        </View>

        <View style={styles.headerControls}>
          <TextInput
            style={styles.input}
            value={symbol}
            onChangeText={text => setSymbol(text.toUpperCase())}
            placeholder="代碼 (AAPL, 2330.TW)"
            placeholderTextColor="#71717a"
          />
          
          <TouchableOpacity style={styles.input} onPress={cycleStrategy}>
            <Text style={styles.inputText}>{strat.label}</Text>
            <ChevronDown size={16} color="#71717a" />
          </TouchableOpacity>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity 
              style={[styles.btnSecondary, (comparing || running) && styles.btnDisabled]} 
              onPress={handleCompare} 
              disabled={comparing || running}
            >
              {comparing ? <Loader2 size={16} color="#a5b4fc" /> : <TrendingUp size={16} color="#a5b4fc" />}
              <Text style={styles.btnSecondaryText}>比較績效</Text>
            </TouchableOpacity>

            {result && (
              <TouchableOpacity 
                style={styles.btnOutline} 
                onPress={() => buildBacktestPdf(symbol, strat.label, metrics, result.trades ?? [])}
              >
                <Download size={16} color="#d4d4d8" />
                <Text style={styles.btnOutlineText}>匯出 PDF</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.btnPrimary, (running || comparing) && styles.btnDisabled]} 
              onPress={handleRun} 
              disabled={running || comparing}
            >
              {running ? <Loader2 size={16} color="#09090b" /> : <Play size={16} color="#09090b" fill="#09090b" />}
              <Text style={styles.btnPrimaryText}>{running ? '執行中' : '開始回測'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Settings & Strategy Info */}
      <View style={styles.gridContainer}>
        <View style={styles.settingsCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Settings size={16} color="#a1a1aa" />
            </View>
            <Text style={styles.cardTitle}>回測設定</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>初始資金 (USD)</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={capital}
                onChangeText={setCapital}
                keyboardType="numeric"
              />
              <Text style={styles.inputSuffix}>$</Text>
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formGroupHalf}>
              <Text style={styles.label}>開始日期</Text>
              <TextInput
                style={styles.input}
                value={period1}
                onChangeText={setPeriod1}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#71717a"
              />
            </View>
            <View style={styles.formGroupHalf}>
              <Text style={styles.label}>結束日期</Text>
              <TextInput
                style={styles.input}
                value={period2}
                onChangeText={setPeriod2}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#71717a"
              />
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.label}>策略參數</Text>
          <View style={styles.formRow}>
            <View style={styles.formGroupHalf}>
              <Text style={styles.subLabel}>參數 A</Text>
              <TextInput style={styles.input} defaultValue="10" keyboardType="numeric" />
            </View>
            <View style={styles.formGroupHalf}>
              <Text style={styles.subLabel}>參數 B</Text>
              <TextInput style={styles.input} defaultValue="30" keyboardType="numeric" />
            </View>
          </View>
        </View>

        <View style={[styles.strategyCard, { borderColor: strat.color + '30' }]}>
          <View style={styles.stratHeader}>
            <View style={[styles.stratIcon, { backgroundColor: strat.bg, borderColor: strat.color + '30' }]}>
              <Info size={24} color={strat.color} />
            </View>
            <View style={styles.stratTitleContainer}>
              <View style={styles.stratTitleRow}>
                <Text style={styles.stratTitle}>{strat.label}</Text>
                <View style={[styles.stratTypeBadge, { borderColor: strat.color + '50' }]}>
                  <Text style={[styles.stratTypeText, { color: strat.color }]}>{strat.type}</Text>
                </View>
              </View>
              <Text style={styles.stratDesc}>{strat.desc}</Text>
            </View>
          </View>

          <View style={styles.stratSignalsRow}>
            <View style={styles.signalBoxBuy}>
              <Text style={styles.signalBoxTitleBuy}>買進訊號 (ENTRY)</Text>
              <Text style={styles.signalBoxDesc}>{strat.buyDesc}</Text>
            </View>
            <View style={styles.signalBoxSell}>
              <Text style={styles.signalBoxTitleSell}>賣出訊號 (EXIT)</Text>
              <Text style={styles.signalBoxDesc}>{strat.sellDesc}</Text>
            </View>
          </View>

          <View style={styles.stratTagsRow}>
            <View style={styles.stratTag}>
              <Text style={styles.stratTagText}>📈 {strat.suitable}</Text>
            </View>
            <View style={styles.stratTag}>
              <Text style={styles.stratTagText}>⚠️ {strat.avoid}</Text>
            </View>
          </View>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <AlertCircle size={18} color="#fb7185" />
          <View style={styles.errorTextContainer}>
            <Text style={styles.errorTitle}>回測失敗</Text>
            <Text style={styles.errorDesc}>{error}</Text>
          </View>
        </View>
      ) : null}

      {/* Compare Results */}
      {compareMode && Object.keys(compareResults).length > 0 && (
        <View style={styles.compareCard}>
          <View style={styles.compareHeader}>
            <View style={styles.compareTitleRow}>
              <View style={styles.compareIcon}>
                <Trophy size={24} color="#818cf8" />
              </View>
              <View>
                <Text style={styles.compareTitle}>多策略績效矩陣</Text>
                <Text style={styles.compareSubtitle}>{symbol} · {period1} ～ {period2}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.btnCloseCompare} onPress={() => { setCompareMode(false); setCompareResults({}); }}>
              <Text style={styles.btnCloseCompareText}>關閉比較</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.th, { width: 150 }]}>策略名稱</Text>
                <Text style={[styles.th, styles.textRight, { width: 100 }]}>總報酬率</Text>
                <Text style={[styles.th, styles.textRight, { width: 100 }]}>夏普比率</Text>
                <Text style={[styles.th, styles.textRight, { width: 100 }]}>最大回撤</Text>
                <Text style={[styles.th, styles.textRight, { width: 100 }]}>勝率</Text>
                <Text style={[styles.th, styles.textRight, { width: 80 }]}>交易次數</Text>
              </View>
              {STRATEGIES.map(s => {
                const r = compareResults[s.id];
                if (!r) return null;
                const m = r.metrics;
                const best = Object.values(compareResults).reduce((max, x) => (x.metrics?.roi ?? 0) > (max.metrics?.roi ?? 0) ? x : max, Object.values(compareResults)[0]);
                const isBest = r === best;
                return (
                  <View key={s.id} style={[styles.tableRow, isBest && styles.tableRowBest]}>
                    <View style={[styles.td, { width: 150, flexDirection: 'row', alignItems: 'center' }]}>
                      <View style={[styles.stratColorIndicator, { backgroundColor: s.color }]} />
                      <View>
                        <Text style={styles.tdTextBold}>{s.label}</Text>
                        {isBest && <Text style={styles.bestBadgeText}>TOP PERFORMER</Text>}
                      </View>
                    </View>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, (m?.roi ?? 0) >= 0 ? styles.textEmerald : styles.textRose, { width: 100 }]}>
                      {(m?.roi ?? 0) >= 0 ? '+' : ''}{m?.roi ?? 0}%
                    </Text>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, (m?.sharpe ?? 0) >= 1 ? styles.textEmerald : (m?.sharpe ?? 0) >= 0 ? styles.textAmber : styles.textRose, { width: 100 }]}>
                      {m?.sharpe ?? 0}
                    </Text>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, styles.textRose, { width: 100 }]}>
                      -{m?.maxDrawdown ?? 0}%
                    </Text>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, (m?.winRate ?? 0) >= 50 ? styles.textEmerald : styles.textRose, { width: 100 }]}>
                      {m?.winRate ?? 0}%
                    </Text>
                    <Text style={[styles.td, styles.textRight, styles.tdText, { width: 80 }]}>
                      {m?.totalTrades ?? 0}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Results */}
      {result ? (
        <View style={styles.resultsContainer}>
          <View style={styles.resultHeaderCard}>
            <View style={styles.resultHeaderLeft}>
              <View style={styles.resultHeaderIcon}>
                <Activity size={28} color="#818cf8" />
              </View>
              <View>
                <View style={styles.resultTitleRow}>
                  <Text style={styles.resultTitle}>{resultStrat.label}</Text>
                  <View style={styles.reportBadge}>
                    <Text style={styles.reportBadgeText}>STRATEGY REPORT</Text>
                  </View>
                </View>
                <Text style={styles.resultSubtitle}>{symbol} · {period1} ～ {period2}</Text>
              </View>
            </View>
            <View style={styles.resultHeaderRight}>
              <View style={styles.roiBox}>
                <Text style={styles.roiLabel}>TOTAL RETURN</Text>
                <Text style={[styles.roiValue, metrics.roi >= 0 ? styles.textEmerald : styles.textRose]}>
                  {metrics.roi >= 0 ? '+' : ''}{metrics.roi}%
                </Text>
              </View>
            </View>
          </View>

          {/* Chart Placeholder */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.chartLegend}>
                <View style={[styles.legendDot, { backgroundColor: resultStrat.color }]} />
                <Text style={styles.legendText}>{resultStrat.label}</Text>
                <View style={[styles.legendDot, { backgroundColor: '#64748b', marginLeft: 12 }]} />
                <Text style={styles.legendText}>BUY & HOLD</Text>
              </View>
              <TouchableOpacity style={styles.btnToggleDd} onPress={() => setShowDd(!showDd)}>
                <Text style={styles.btnToggleDdText}>{showDd ? 'HIDE DRAWDOWN' : 'SHOW DRAWDOWN'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chartPlaceholder}>
              <Activity size={48} color="#3f3f46" />
              <Text style={styles.chartPlaceholderText}>Chart Visualization</Text>
              <Text style={styles.chartPlaceholderSub}>
                {equityData.length} data points available. Implement with react-native-chart-kit or victory-native.
              </Text>
            </View>
          </View>

          {/* Metrics Grid */}
          <View style={styles.metricsGrid}>
            {[
              { label: '總報酬率 (ROI)', value: `${metrics.roi >= 0 ? '+' : ''}${metrics.roi}%`, sub: `基準：${benchEnd >= 0 ? '+' : ''}${benchEnd.toFixed(1)}%`, color: metrics.roi >= 0 ? 'emerald' : 'rose', icon: <TrendingUp size={20} color={metrics.roi >= 0 ? '#34d399' : '#fb7185'} /> },
              { label: '夏普比率 (Sharpe)', value: Number(metrics.sharpe).toFixed(2), sub: metrics.sharpe > 1 ? 'Excellent Risk/Reward' : metrics.sharpe > 0 ? 'Moderate Performance' : 'High Risk Exposure', color: metrics.sharpe > 1 ? 'emerald' : metrics.sharpe > 0 ? 'amber' : 'rose', icon: <Activity size={20} color={metrics.sharpe > 1 ? '#34d399' : metrics.sharpe > 0 ? '#fbbf24' : '#fb7185'} /> },
              { label: '最大回撤 (MDD)', value: `-${metrics.maxDrawdown}%`, sub: 'Peak-to-Trough Decline', color: 'rose', icon: <ArrowDownRight size={20} color="#fb7185" /> },
              { label: '勝率 (Win Rate)', value: `${metrics.winRate}%`, sub: `${tradesRaw.filter(t => t.result === 'WIN').length}W / ${tradesRaw.filter(t => t.result === 'LOSS').length}L`, color: metrics.winRate >= 50 ? 'emerald' : 'amber', icon: <Target size={20} color={metrics.winRate >= 50 ? '#34d399' : '#fbbf24'} /> },
            ].map((c, i) => (
              <View key={i} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <View style={[styles.metricIconBox, c.color === 'emerald' ? styles.bgEmeraldSubtle : c.color === 'rose' ? styles.bgRoseSubtle : styles.bgAmberSubtle]}>
                    {c.icon}
                  </View>
                  <Text style={styles.metricLabel}>{c.label}</Text>
                </View>
                <Text style={[styles.metricValue, c.color === 'emerald' ? styles.textEmerald : c.color === 'rose' ? styles.textRose : styles.textAmber]}>{c.value}</Text>
                <Text style={styles.metricSub}>{c.sub}</Text>
              </View>
            ))}
          </View>

          {/* Advanced Metrics */}
          <View style={styles.advMetricsCard}>
            <View style={styles.advMetricsHeader}>
              <Settings size={14} color="#94a3b8" />
              <Text style={styles.advMetricsTitle}>進階績效矩陣</Text>
            </View>
            <View style={styles.advMetricsGrid}>
              {[
                ['獲利因子', `${metrics.profitFactor?.toFixed(2) ?? '—'}`],
                ['平均獲利', metrics.avgWin != null ? `+${metrics.avgWin}%` : '—'],
                ['平均虧損', metrics.avgLoss != null ? `${metrics.avgLoss}%` : '—'],
                ['最長連勝', `${maxWinStreak}筆`],
                ['最長連敗', `${maxLossStreak}筆`],
                ['策略評級', metrics.roi > 50 ? '🏆 卓越' : metrics.roi > 20 ? '✅ 良好' : '📊 普通'],
              ].map(([k, v], i) => (
                <View key={i} style={styles.advMetricItem}>
                  <Text style={styles.advMetricLabel}>{k}</Text>
                  <Text style={styles.advMetricValue}>{v}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Trades Table */}
          <View style={styles.tradesCard}>
            <View style={styles.tradesHeader}>
              <View style={styles.tradesHeaderLeft}>
                <View style={styles.tradesIcon}>
                  <FileText size={24} color="#94a3b8" />
                </View>
                <View>
                  <View style={styles.tradesTitleRow}>
                    <Text style={styles.tradesTitle}>成交明細</Text>
                    <View style={styles.tradesCountBadge}>
                      <Text style={styles.tradesCountText}>TOTAL {tradesRaw.length} TRADES</Text>
                    </View>
                  </View>
                  <View style={styles.tradesStatsRow}>
                    <Text style={styles.tradesStatWin}>{tradesRaw.filter(t => t.result === 'WIN').length} WINS</Text>
                    <Text style={styles.tradesStatLoss}>{tradesRaw.filter(t => t.result === 'LOSS').length} LOSSES</Text>
                  </View>
                </View>
              </View>
              <View style={styles.tradesActions}>
                <View style={styles.sortToggle}>
                  <TouchableOpacity style={[styles.sortBtn, tradeSort === 'date' && styles.sortBtnActive]} onPress={() => setTradeSort('date')}>
                    <Text style={[styles.sortBtnText, tradeSort === 'date' && styles.sortBtnTextActive]}>TIME</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.sortBtn, tradeSort === 'pnl' && styles.sortBtnActive]} onPress={() => setTradeSort('pnl')}>
                    <Text style={[styles.sortBtnText, tradeSort === 'pnl' && styles.sortBtnTextActive]}>PNL</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.btnExport} onPress={exportCSV} disabled={!trades.length}>
                  <Download size={14} color="#34d399" />
                  <Text style={styles.btnExportText}>EXPORT</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.th, { width: 100 }]}>Entry Date</Text>
                  <Text style={[styles.th, { width: 100 }]}>Exit Date</Text>
                  <Text style={[styles.th, styles.textRight, { width: 80 }]}>Entry</Text>
                  <Text style={[styles.th, styles.textRight, { width: 80 }]}>Exit</Text>
                  <Text style={[styles.th, styles.textRight, { width: 80 }]}>Size</Text>
                  <Text style={[styles.th, styles.textRight, { width: 60 }]}>Hold</Text>
                  <Text style={[styles.th, styles.textRight, { width: 80 }]}>ROI%</Text>
                  <Text style={[styles.th, styles.textRight, { width: 80 }]}>PnL</Text>
                  <Text style={[styles.th, styles.textCenter, { width: 80 }]}>Status</Text>
                </View>
                {trades.map((t, i) => (
                  <View key={i} style={styles.tableRow}>
                    <Text style={[styles.td, styles.tdText, { width: 100 }]}>{t.entryTime}</Text>
                    <Text style={[styles.td, styles.tdText, { width: 100 }]}>{t.exitTime}</Text>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, { width: 80 }]}>{Number(t.entryPrice).toFixed(2)}</Text>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, { width: 80 }]}>{Number(t.exitPrice).toFixed(2)}</Text>
                    <Text style={[styles.td, styles.textRight, styles.tdText, { width: 80 }]}>{Number(t.amount).toLocaleString()}</Text>
                    <Text style={[styles.td, styles.textRight, styles.tdText, { width: 60 }]}>{t.holdDays}d</Text>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, (t.pnlPct ?? 0) >= 0 ? styles.textEmerald : styles.textRose, { width: 80 }]}>
                      {(t.pnlPct ?? 0) >= 0 ? '+' : ''}{Number(t.pnlPct ?? 0).toFixed(2)}%
                    </Text>
                    <Text style={[styles.td, styles.textRight, styles.tdTextBold, (t.pnl ?? 0) >= 0 ? styles.textEmerald : styles.textRose, { width: 80 }]}>
                      {(t.pnl ?? 0) >= 0 ? '+' : ''}{Number(t.pnl ?? 0).toFixed(0)}
                    </Text>
                    <View style={[styles.td, styles.textCenter, { width: 80, alignItems: 'center' }]}>
                      <View style={[styles.statusBadge, t.result === 'WIN' ? styles.statusBadgeWin : styles.statusBadgeLoss]}>
                        {t.result === 'WIN' ? <TrendingUp size={10} color="#34d399" /> : <TrendingDown size={10} color="#fb7185" />}
                        <Text style={[styles.statusBadgeText, t.result === 'WIN' ? styles.textEmerald : styles.textRose]}>
                          {t.result === 'WIN' ? 'PROFIT' : 'LOSS'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      ) : !running && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBox}>
            <Play size={40} color="#34d399" fill="#34d399" />
          </View>
          <Text style={styles.emptyTitle}>準備好驗證你的交易策略了嗎？</Text>
          <Text style={styles.emptyDesc}>
            回測引擎允許你使用歷史市場數據來模擬交易表現。雖然過去的績效不保證未來結果，但它是優化策略、建立信心的關鍵步驟。
          </Text>

          <View style={styles.stratPreviewGrid}>
            {STRATEGIES.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.stratPreviewCard, strategy === s.id && [styles.stratPreviewCardActive, { borderColor: s.color + '40' }]]}
                onPress={() => setStrategy(s.id)}
              >
                <View style={[styles.stratPreviewDot, { backgroundColor: s.color }]} />
                <Text style={styles.stratPreviewTitle}>{s.label}</Text>
                <Text style={styles.stratPreviewDesc} numberOfLines={3}>{s.desc}</Text>
                <Text style={[styles.stratPreviewType, { color: s.color }]}>{s.type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.disclaimerBox}>
            <View style={styles.disclaimerHeader}>
              <AlertCircle size={16} color="#fbbf24" />
              <Text style={styles.disclaimerTitle}>投資風險免責聲明</Text>
            </View>
            <Text style={styles.disclaimerText}>
              本工具提供的回測結果僅供學術研究與策略開發參考。市場環境瞬息萬變，歷史數據無法完全預測未來走勢。所有交易決策應由投資者自行評估，本平台不承擔任何因使用本工具而產生的投資損失。
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    padding: 16,
    gap: 24,
  },
  headerCard: {
    backgroundColor: 'rgba(9,9,11,0.5)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#10b981',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#f4f4f5',
  },
  versionBadge: {
    backgroundColor: 'rgba(52,211,153,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.2)',
  },
  versionText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#71717a',
    letterSpacing: 2,
    marginTop: 4,
  },
  headerControls: {
    gap: 12,
  },
  input: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#f4f4f5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#f4f4f5',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  btnSecondary: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    paddingVertical: 12,
    borderRadius: 16,
  },
  btnSecondaryText: {
    color: '#a5b4fc',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  btnOutline: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#3f3f46',
    paddingVertical: 12,
    borderRadius: 16,
  },
  btnOutlineText: {
    color: '#d4d4d8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  btnPrimary: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 16,
  },
  btnPrimaryText: {
    color: '#09090b',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  gridContainer: {
    gap: 16,
  },
  settingsCard: {
    backgroundColor: 'rgba(24,24,27,0.5)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    backgroundColor: '#27272a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#f4f4f5',
    letterSpacing: 2,
  },
  formGroup: {
    gap: 8,
  },
  formGroupHalf: {
    flex: 1,
    gap: 8,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#71717a',
    letterSpacing: 1,
    marginLeft: 4,
  },
  subLabel: {
    fontSize: 10,
    color: '#a1a1aa',
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputSuffix: {
    position: 'absolute',
    right: 16,
    fontSize: 12,
    fontWeight: '900',
    color: '#71717a',
  },
  divider: {
    height: 1,
    backgroundColor: '#27272a',
    marginVertical: 8,
  },
  strategyCard: {
    backgroundColor: 'rgba(24,24,27,0.5)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    gap: 20,
  },
  stratHeader: {
    flexDirection: 'row',
    gap: 16,
  },
  stratIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stratTitleContainer: {
    flex: 1,
    gap: 4,
  },
  stratTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  stratTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#f4f4f5',
  },
  stratTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#09090b',
    borderWidth: 1,
  },
  stratTypeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  stratDesc: {
    fontSize: 12,
    color: '#a1a1aa',
    lineHeight: 18,
  },
  stratSignalsRow: {
    flexDirection: 'column',
    gap: 12,
  },
  signalBoxBuy: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(16,185,129,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.1)',
  },
  signalBoxSell: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(244,63,94,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.1)',
  },
  signalBoxTitleBuy: {
    fontSize: 10,
    fontWeight: '900',
    color: '#34d399',
    letterSpacing: 1,
    marginBottom: 8,
  },
  signalBoxTitleSell: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fb7185',
    letterSpacing: 1,
    marginBottom: 8,
  },
  signalBoxDesc: {
    fontSize: 12,
    color: '#d4d4d8',
    lineHeight: 18,
  },
  stratTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stratTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  stratTagText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#a1a1aa',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.3)',
    padding: 16,
    borderRadius: 16,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fda4af',
    marginBottom: 4,
  },
  errorDesc: {
    fontSize: 12,
    color: '#fda4af',
  },
  compareCard: {
    backgroundColor: 'rgba(24,24,27,0.8)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 20,
  },
  compareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  compareTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compareIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  compareTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  compareSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
    marginTop: 4,
  },
  btnCloseCompare: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnCloseCompareText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  table: {
    minWidth: 600,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 12,
    marginBottom: 8,
  },
  th: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)',
  },
  tableRowBest: {
    backgroundColor: 'rgba(16,185,129,0.03)',
  },
  td: {
    justifyContent: 'center',
  },
  tdText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  tdTextBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  textRight: {
    textAlign: 'right',
  },
  textCenter: {
    textAlign: 'center',
  },
  textEmerald: { color: '#34d399' },
  textRose: { color: '#fb7185' },
  textAmber: { color: '#fbbf24' },
  bgEmeraldSubtle: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' },
  bgRoseSubtle: { backgroundColor: 'rgba(244,63,94,0.1)', borderColor: 'rgba(244,63,94,0.2)' },
  bgAmberSubtle: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.2)' },
  stratColorIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
    marginRight: 12,
  },
  bestBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#34d399',
    backgroundColor: 'rgba(52,211,153,0.1)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  resultsContainer: {
    gap: 24,
  },
  resultHeaderCard: {
    backgroundColor: 'rgba(24,24,27,0.5)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  resultHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  resultHeaderIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  resultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#f4f4f5',
  },
  reportBadge: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  reportBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#71717a',
    letterSpacing: 1,
  },
  resultSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#a1a1aa',
    marginTop: 4,
  },
  resultHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roiBox: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'flex-end',
  },
  roiLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#71717a',
    letterSpacing: 1,
  },
  roiValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  chartCard: {
    backgroundColor: 'rgba(24,24,27,0.8)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minHeight: 300,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },
  btnToggleDd: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnToggleDdText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  chartPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
  },
  chartPlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#a1a1aa',
    marginTop: 12,
  },
  chartPlaceholderSub: {
    fontSize: 12,
    color: '#71717a',
    textAlign: 'center',
    marginTop: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(24,24,27,0.5)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  metricIconBox: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  metricSub: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 1,
  },
  advMetricsCard: {
    backgroundColor: 'rgba(24,24,27,0.5)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  advMetricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  advMetricsTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
  },
  advMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  advMetricItem: {
    width: '45%',
    gap: 4,
  },
  advMetricLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 1,
  },
  advMetricValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  tradesCard: {
    backgroundColor: 'rgba(24,24,27,0.8)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tradesHeader: {
    flexDirection: 'column',
    gap: 16,
    marginBottom: 20,
  },
  tradesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tradesIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tradesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tradesTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  tradesCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tradesCountText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
  },
  tradesStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tradesStatWin: {
    fontSize: 10,
    fontWeight: '900',
    color: '#34d399',
    backgroundColor: 'rgba(52,211,153,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.2)',
  },
  tradesStatLoss: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fb7185',
    backgroundColor: 'rgba(244,63,94,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.2)',
  },
  tradesActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sortBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sortBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sortBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
  },
  sortBtnTextActive: {
    color: '#ffffff',
  },
  btnExport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(52,211,153,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.2)',
  },
  btnExportText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#34d399',
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeWin: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.2)',
  },
  statusBadgeLoss: {
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderColor: 'rgba(244,63,94,0.2)',
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 24,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(16,185,129,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  stratPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    width: '100%',
  },
  stratPreviewCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  stratPreviewCardActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stratPreviewDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  stratPreviewTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  stratPreviewDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
  },
  stratPreviewType: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  disclaimerBox: {
    backgroundColor: 'rgba(245,158,11,0.05)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.1)',
    width: '100%',
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  disclaimerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fbbf24',
    letterSpacing: 1,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
  },
});
