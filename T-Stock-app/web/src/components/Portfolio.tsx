import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, useWindowDimensions } from 'react-native';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine,
  BarChart, Bar,
  type TooltipProps,
} from 'recharts';
import {
  TrendingUp, TrendingDown, RefreshCw, Loader2, Plus, Trash2, Wallet,
  Edit2, Check, X, AlertCircle, BarChart2, BookOpen, Settings2, Download,
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import CardStack from './CardStack';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { buildPortfolioPdf } from '../utils/exportPdf';
import { Position, Trade, HistoricalData } from '../types';
import Decimal from 'decimal.js';

const COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#94a3b8', '#fb923c', '#38bdf8'];

interface Props {
  onGoBacktest?: (sym: string) => void;
  onGoJournal?: (sym?: string) => void;
}

type PortfolioStatus = 'loading' | 'refreshing' | 'idle' | 'error';

function buildEquityCurve(trades: Trade[], start: number, benchCloses: Pick<HistoricalData, 'date' | 'close'>[] = []) {
  if (!trades.length) return [];
  const sorted = [...trades]
    .filter(t => t && typeof t === 'object')
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  let eq = start;
  const bMap = new Map(benchCloses.map(r => [String(r.date ?? '').slice(0, 10), Number(r.close)]));
  const firstDate = sorted[0]?.date?.slice(0, 10) ?? '';
  const benchKeys = [...bMap.keys()].sort();
  const startKey = benchKeys.find(k => k >= firstDate) ?? benchKeys[0] ?? '';
  const bStart = bMap.get(startKey) ?? 0;
  return sorted.map(t => {
    const pnl = Number(t.pnl) || 0;
    if (!isFinite(pnl)) return null;
    eq += pnl;
    const d = t.date?.slice(0, 10) ?? '';
    const bClose = bMap.get(d);
    const benchVal = bStart > 0 && bClose && isFinite(bClose) ? Math.round(start * (bClose / bStart)) : undefined;
    return { date: d, value: Math.round(eq), benchmark: benchVal };
  }).filter(Boolean) as { date: string; value: number; benchmark?: number }[];
}

function normalizeDate(d: string | number | null | undefined): string {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
}

const EquityTip = (props: TooltipProps<number, string>) => {
  const { active, payload, label } = props as { active?: boolean; payload?: { dataKey: string; value?: number }[]; label?: string };
  if (!active || !payload?.length) return null;
  const portPayload = payload.find((p) => p.dataKey === 'value');
  const benchPayload = payload.find((p) => p.dataKey === 'benchmark');
  const alpha = portPayload && benchPayload ? ((portPayload.value ?? 0) - (benchPayload.value ?? 0)) : null;

  return (
    <View style={styles.tipCard}>
      <Text style={styles.tipLabel}>{label}</Text>
      {portPayload?.value !== undefined && <Text style={styles.tipPort}>策略: ${Number(portPayload.value).toLocaleString()}</Text>}
      {benchPayload?.value !== undefined && <Text style={styles.tipBench}>基準: ${Number(benchPayload.value).toLocaleString()}</Text>}
      {alpha !== null && (
        <Text style={[styles.tipAlpha, { color: alpha >= 0 ? '#6ee7b7' : '#fb7185' }]}>
          Alpha: {alpha >= 0 ? '+' : ''}{alpha.toLocaleString()}
        </Text>
      )}
    </View>
  );
};

const AllocationPieChart = memo(({ alloc, totalMV, compact }: { alloc: { name: string; value: number; color: string }[]; totalMV: number; compact: boolean }) => (
  <View style={[styles.panel, compact ? styles.panelCompact : styles.panelNormal]}>
    <Text style={[styles.panelTitle, compact ? styles.textXs : styles.textXs]}>資產配置圓餅圖</Text>
    <Text style={[styles.panelSub, compact ? styles.labelMeta : styles.textXs]}>各持倉占總市值比例</Text>
    <View style={styles.rowFlex}>
      <View style={styles.flex1}>
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <PieChart>
            <Pie data={alloc} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={2} dataKey="value" stroke="none" isAnimationActive={false}>
              {alloc.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | string | readonly (number | string)[] | undefined) => {
                const val = Array.isArray(v) ? v[0] : v;
                return [`NT$${Number(val || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, '市值'];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </View>
      <View style={styles.legendWrap}>
        {alloc.map((d, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={styles.legendLeft}>
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <Text style={[styles.legendName, compact ? styles.labelMeta : styles.textXs]} numberOfLines={1}>{d.name}</Text>
            </View>
            <Text style={[styles.legendPct, compact ? styles.labelMeta : styles.textXs]}>
              {totalMV > 0 ? ((d.value / totalMV) * 100).toFixed(1) : '0.0'}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  </View>
));
AllocationPieChart.displayName = 'AllocationPieChart';

const PnLBarChartPanel = memo(({ pnlData, compact }: { pnlData: { name: string; pnl: number; color: string }[]; compact: boolean }) => (
  <View style={[styles.panel, compact ? styles.panelCompact : styles.panelNormal]}>
    <Text style={[styles.panelTitle, compact ? styles.textXs : styles.textXs]}>各資產未實現損益</Text>
    <Text style={[styles.panelSub, compact ? styles.labelMeta : styles.textXs]}>持倉標的盈虧分佈</Text>
    <View style={styles.flex1}>
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <BarChart data={pnlData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
          <XAxis type="number" tick={{ fill: 'var(--text-color)', opacity: 0.5, fontSize: compact ? 8 : 9 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}K`} />
          <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-color)', opacity: 0.7, fontSize: compact ? 8 : 9 }} tickLine={false} axisLine={false} width={compact ? 50 : 60} />
          <Tooltip
            cursor={{ fill: 'var(--border-color)' }}
            contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number | string | readonly (number | string)[] | undefined) => {
              const val = Array.isArray(v) ? v[0] : v;
              return [`$${Number(val || 0).toLocaleString()}`, '損益'];
            }}
          />
          <ReferenceLine x={0} stroke="var(--border-color)" />
          <Bar dataKey="pnl" isAnimationActive={false}>
            {pnlData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </View>
  </View>
));
PnLBarChartPanel.displayName = 'PnLBarChartPanel';

export default function Portfolio({ onGoBacktest, onGoJournal }: Props) {
  const { settings } = useSettings();
  const compact = Boolean(settings.compactMode);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [positions, setPos] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [usdtwd, setUsdtwd] = useState(32.5);
  const [status, setStatus] = useState<PortfolioStatus>('loading');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState<Partial<Position>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newPos, setNewPos] = useState({ symbol: '', name: '', shares: '', avgCost: '', currency: 'USD' });
  const [saveErr, setSaveErr] = useState('');
  const [initCap, setInitCap] = useState<number | null>(null);
  const [showCapSet, setShowCapSet] = useState(false);
  const [capInput, setCapInput] = useState('');
  const [benchmark, setBenchmark] = useState<HistoricalData[]>([]);
  const benchSym = 'SPY';
  const containerRef = useRef<any>(null);
  const pullState = usePullToRefresh(containerRef, { onRefresh: () => fetchAll(true) });

  const fetchAll = useCallback(async (quiet = false) => {
    setStatus(quiet ? 'refreshing' : 'loading');
    try {
      const [posData, tradeData, fxRate] = await Promise.all([
        api.getPositions(),
        api.getTrades(),
        api.getForexRate('USDTWD=X'),
      ]);
      const pos = Array.isArray(posData.positions) ? posData.positions : [];
      const rate = fxRate > 0 ? fxRate : (posData.usdtwd > 0 ? posData.usdtwd : 32.5);
      setPos(pos);
      setUsdtwd(rate);
      setTrades(Array.isArray(tradeData) ? tradeData : []);
      setInitCap(prev => {
        if (prev === null && pos.length) {
          const totalCost = pos.reduce((s: number, p: Position) => {
            const cost = new Decimal(p.avgCost).times(p.shares).times(p.currency === 'TWD' ? 1 : rate).toNumber();
            return s + (isFinite(cost) ? cost : 0);
          }, 0);
          return Math.round(totalCost) || 1_000_000;
        }
        return prev;
      });
      setStatus('idle');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const threeYearsAgo = new Date();
        threeYearsAgo.setDate(threeYearsAgo.getDate() - 365 * 3);
        const period1 = threeYearsAgo.toISOString().split('T')[0];
        const hist = await api.getHistory(benchSym, { period1, interval: '1d' });
        if (!cancelled && Array.isArray(hist) && hist.length > 1) {
          const closes = hist.filter(r => r?.close && isFinite(Number(r.close)));
          setBenchmark(closes);
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [benchSym]);

  const safeRate = usdtwd > 0 ? usdtwd : 32.5;
  const totalMV = positions.reduce((s, p) => s + (p.marketValueTWD ?? p.marketValue ?? 0), 0);
  const totalCost = positions.reduce((s, p) => {
    const cost = new Decimal(p.avgCost).times(p.shares).times(p.currency === 'TWD' ? 1 : safeRate).toNumber();
    return s + (isFinite(cost) ? cost : 0);
  }, 0);
  const totalPnL = new Decimal(totalMV).minus(totalCost).toNumber();
  const totalPct = totalCost > 0 ? new Decimal(totalPnL).div(totalCost).times(100).toNumber() : 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayPnL = trades.filter(t => normalizeDate(t.date) === today).reduce((s, t) => s + (t.pnl ?? 0), 0);
  const wins = trades.filter(t => (t.pnl ?? 0) > 0);
  const winRate = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : '0.0';
  const startCap = initCap ?? 1_000_000;
  const equityCurve = buildEquityCurve(trades, startCap, benchmark);

  const maxDD = useMemo(() => {
    let peak = startCap;
    let dd = 0;
    for (const point of equityCurve) {
      if (point.value > peak) peak = point.value;
      const cur = peak > 0 ? (peak - point.value) / peak : 0;
      if (cur > dd) dd = cur;
    }
    return dd;
  }, [equityCurve, startCap]);

  const alloc = useMemo(() => positions.map((p, i) => ({ name: p.symbol, value: p.marketValueTWD ?? p.marketValue ?? 0, color: COLORS[i % COLORS.length] })), [positions]);
  const pnlData = useMemo(() => positions.map((p) => ({ name: p.symbol, pnl: Math.round(p.pnl ?? 0), color: (p.pnl ?? 0) >= 0 ? '#34d399' : '#fb7185' })).sort((a, b) => b.pnl - a.pnl), [positions]);

  const persist = async (updated: Position[]) => {
    setSaveErr('');
    try {
      await api.setPositions(updated.map(p => ({ symbol: p.symbol, name: p.name, shares: p.shares, avgCost: p.avgCost, currency: p.currency })));
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : '儲存失敗');
    }
  };

  const handleAdd = async () => {
    const sharesNum = Number(newPos.shares);
    const avgCostNum = Number(newPos.avgCost);
    if (!newPos.symbol || !newPos.shares || !newPos.avgCost) { setSaveErr('請填入代碼、股數、均價'); return; }
    if (!isFinite(sharesNum) || sharesNum <= 0 || !isFinite(avgCostNum) || avgCostNum <= 0) { setSaveErr('股數與均價必須為有效正數'); return; }
    const pos: Position = { symbol: newPos.symbol.toUpperCase(), name: newPos.name || newPos.symbol.toUpperCase(), shares: sharesNum, avgCost: avgCostNum, currency: newPos.currency };
    const updated = [...positions, pos];
    await persist(updated);
    setShowAdd(false);
    setNewPos({ symbol: '', name: '', shares: '', avgCost: '', currency: 'USD' });
    await fetchAll(true);
  };

  const handleDelete = async (idx: number) => { const u = positions.filter((_, i) => i !== idx); await persist(u); await fetchAll(true); };
  const handleSaveEdit = async () => {
    if (editIdx === null) return;
    const updated = positions.map((p, i) => i === editIdx ? { ...p, ...editBuf } : p);
    await persist(updated);
    setEditIdx(null);
    fetchAll(true);
  };

  const applyCapital = () => {
    const v = parseInt(capInput.replace(/[,，]/g, ''), 10);
    if (v > 0) { setInitCap(v); setShowCapSet(false); }
    else setSaveErr('請輸入有效數字');
  };

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <Loader2 size={28} color="#34d399" />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorWrap}>
          <View style={styles.errorIconWrap}>
            <AlertCircle size={32} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>連線異常</Text>
          <Text style={styles.errorDesc}>無法取得投資組合資料，請檢查網路連線或稍後再試。</Text>
          <TouchableOpacity onPress={() => fetchAll()} style={styles.retryBtn}>
            <RefreshCw size={14} color="#e5e7eb" />
            <Text style={styles.retryText}>重新整理</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <motion.View
        ref={containerRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <PullToRefreshIndicator state={pullState} />
          {saveErr ? (
            <View style={styles.errorBanner}>
              <AlertCircle size={13} color="#fb7185" />
              <Text style={styles.errorBannerText}>{saveErr}</Text>
              <TouchableOpacity onPress={() => setSaveErr('')} style={styles.errorBannerClose}>
                <X size={11} color="#fb7185" />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.toolbar}>
            <TouchableOpacity
              onPress={() => buildPortfolioPdf(positions, trades, { totalValue: totalMV, totalPnl: totalPnL, totalPnlPct: totalPct, winRate: Number(winRate) })}
              style={styles.pdfBtn}
            >
              <Download size={13} color="#cbd5e1" />
              <Text style={styles.pdfBtnText}>匯出 PDF</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.kpiGrid}>
            {[
              { label: '總持倉市值 (TWD)', value: `NT$${(totalMV / 10000).toFixed(1)}萬`, sub: `匯率 ${usdtwd.toFixed(1)}`, up: true, tip: '所有持倉的當前市場總值（台幣）' },
              { label: '未實現損益', value: `${totalPnL >= 0 ? '+' : ''}NT$${Math.abs(totalPnL / 10000).toFixed(1)}萬`, sub: `${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}%`, up: totalPnL >= 0, tip: '現值 − 成本，正數=帳面獲利' },
              { label: '今日已實現損益', value: `${todayPnL >= 0 ? '+' : ''}$${todayPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: today, up: todayPnL >= 0, tip: '今天在交易日誌中記錄的損益合計' },
              { label: '最大回撤 (MDD)', value: `${(maxDD * 100).toFixed(1)}%`, sub: `歷史最大帳面虧損`, up: maxDD < 0.2, tip: '歷史淨值從高點回落的最大幅度' },
            ].map(c => (
              <View key={c.label} style={[styles.kpiCard, compact ? styles.kpiCardCompact : styles.kpiCardNormal]}>
                <Text style={[styles.kpiLabel, compact ? styles.labelMeta : styles.textXs]}>{c.label}</Text>
                <Text style={[styles.kpiValue, compact ? styles.textLg : styles.text2xl, c.up ? styles.kpiValueUp : styles.kpiValueDown]}>{c.value}</Text>
                <View style={styles.kpiSubRow}>
                  {c.up ? <TrendingUp size={compact ? 10 : 12} color="#10b981" /> : <TrendingDown size={compact ? 10 : 12} color="#ef4444" />}
                  <Text style={styles.kpiSub}>{c.sub}</Text>
                </View>
                <Text style={[styles.kpiTip, compact ? styles.labelMeta : styles.textXs]}>{c.tip}</Text>
              </View>
            ))}
          </View>

          <View style={styles.chartGrid}>
            <AllocationPieChart alloc={alloc} totalMV={totalMV} compact={compact} />
            <PnLBarChartPanel pnlData={pnlData} compact={compact} />
            <View style={[styles.panel, compact ? styles.panelCompact : styles.panelNormal]}>
              <View style={styles.equityHeader}>
                <View>
                  <Text style={[styles.panelTitle, compact ? styles.textXs : styles.textXs]}>損益曲線</Text>
                  <Text style={[styles.panelSub, compact ? styles.labelMeta : styles.textXs]}>基於交易日誌的已實現損益累積</Text>
                </View>
                <TouchableOpacity onPress={() => { setCapInput(String(startCap)); setShowCapSet(v => !v); }} style={styles.capBtn}>
                  <Settings2 size={compact ? 8 : 9} color="rgba(255,255,255,0.7)" />
                  <Text style={[styles.capBtnText, compact ? styles.labelMeta : styles.textXs]}>初始資金</Text>
                </TouchableOpacity>
              </View>

              {showCapSet && (
                <View style={styles.capRow}>
                  <TextInput
                    accessibilityLabel="初始資金"
                    keyboardType="numeric"
                    value={capInput}
                    onChangeText={setCapInput}
                    placeholder="初始資金"
                    placeholderTextColor="#71717a"
                    style={styles.capInput}
                  />
                  <TouchableOpacity onPress={applyCapital} style={styles.capApplyBtn}>
                    <Text style={styles.capApplyText}>套用</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowCapSet(false)} style={styles.capCancelBtn}>
                    <Text style={styles.capCancelText}>取消</Text>
                  </TouchableOpacity>
                </View>
              )}

              {equityCurve.length > 1 ? (
                <View style={styles.flex1}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <AreaChart data={equityCurve}>
                      <defs>
                        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <ReferenceLine y={startCap} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: compact ? 8 : 9 }} tickLine={false} interval="preserveStartEnd" tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: '#71717a', fontSize: compact ? 8 : 9 }} tickLine={false} tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}K`} />
                      <Tooltip content={<EquityTip />} />
                      {benchmark.length > 0 && <Area type="monotone" dataKey="benchmark" name={`${benchSym} 基準`} stroke="#52525b" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2" isAnimationActive={false} />}
                      <Area type="monotone" dataKey="value" name="策略淨值" stroke="#10b981" strokeWidth={2} fill="url(#eg)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </View>
              ) : (
                <View style={styles.emptyChart}>
                  <BarChart2 size={20} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.emptyChartText}>在交易日誌中新增交易後顯示損益曲線</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeaderRow}>
              <View>
                <Text style={[styles.tableTitle, compact ? styles.textSm : styles.textBase]}>持倉明細</Text>
                <Text style={styles.tableSubtitle}>即時報價 · 每次刷新重新取得</Text>
              </View>
              <View style={styles.tableActions}>
                <TouchableOpacity onPress={() => fetchAll(true)} disabled={status === 'refreshing'} style={[styles.smallActionBtn, compact ? styles.smallActionBtnCompact : styles.smallActionBtnNormal]}>
                  <RefreshCw size={compact ? 12 : 14} color="rgba(255,255,255,0.75)" />
                  <Text style={styles.smallActionText}>刷新</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAdd(v => !v); setSaveErr(''); }} style={[styles.addBtn, compact ? styles.smallActionBtnCompact : styles.smallActionBtnNormal]}>
                  <Plus size={compact ? 12 : 14} color="#86efac" />
                  <Text style={styles.addBtnText}>新增持倉</Text>
                </TouchableOpacity>
              </View>
            </View>

            {showAdd && (
              <View style={styles.addForm}>
                {([['代碼', 'symbol', 'text'], ['名稱', 'name', 'text'], ['股數', 'shares', 'number'], ['均價', 'avgCost', 'number'], ['幣別', 'currency', 'text']] as [string, keyof typeof newPos, string][]).map(([ph, k, t]) => (
                  <View key={k} style={styles.addField}>
                    <Text style={styles.addFieldLabel}>{ph}</Text>
                    <TextInput
                      accessibilityLabel={ph}
                      keyboardType={t === 'number' ? 'numeric' : 'default'}
                      placeholder={ph}
                      placeholderTextColor="#71717a"
                      style={styles.addInput}
                      value={newPos[k]}
                      onChangeText={txt => setNewPos(p => ({ ...p, [k]: txt }))}
                    />
                  </View>
                ))}
                <View style={styles.addActionsWrap}>
                  <Text style={styles.addFieldLabel}>操作</Text>
                  <View style={styles.addActions}>
                    <TouchableOpacity onPress={handleAdd} style={styles.addConfirmBtn}><Text style={styles.addConfirmText}>✓</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { setShowAdd(false); setSaveErr(''); }} style={styles.addCancelBtn}><Text style={styles.addCancelText}>✕</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.flex1}>
              {!isDesktop ? (
                <View style={styles.mobileWrap}>
                  {positions.length > 0 ? (
                    <CardStack
                      items={positions.map((p, i) => ({ ...p, id: p.symbol + i }))}
                      renderCard={(p: Position & { id?: string }) => (
                        <View style={styles.mobileCard}>
                          <View>
                            <View style={styles.mobileCardHeader}>
                              <View>
                                <Text style={styles.mobileSymbol}>{p.symbol}</Text>
                                <Text style={styles.mobileName}>{p.shortName ?? p.name}</Text>
                              </View>
                              <Text style={[styles.mobilePct, (p.pnlPercent ?? 0) >= 0 ? styles.goodBg : styles.badBg]}>
                                {(p.pnlPercent ?? 0) >= 0 ? '+' : ''}{(p.pnlPercent ?? 0).toFixed(2)}%
                              </Text>
                            </View>

                            <View style={styles.mobileStatsGrid}>
                              <View style={styles.mobileStat}>
                                <Text style={styles.mobileStatLabel}>現價</Text>
                                <Text style={styles.mobileStatValue}>{p.currentPrice?.toFixed(2) ?? '---'}</Text>
                              </View>
                              <View style={[styles.mobileStat, styles.alignEnd]}>
                                <Text style={styles.mobileStatLabel}>損益</Text>
                                <Text style={[styles.mobileStatValue, (p.pnl ?? 0) >= 0 ? styles.pnlPos : styles.pnlNeg]}>
                                  {(p.pnl ?? 0) >= 0 ? '+' : ''}{Math.round(p.pnl ?? 0).toLocaleString()}
                                </Text>
                              </View>
                              <View style={styles.mobileStat}>
                                <Text style={styles.mobileStatLabel}>股數</Text>
                                <Text style={styles.mobileStatValue}>{p.shares.toLocaleString()}</Text>
                              </View>
                              <View style={[styles.mobileStat, styles.alignEnd]}>
                                <Text style={styles.mobileStatLabel}>均價</Text>
                                <Text style={styles.mobileStatValue}>{p.avgCost.toFixed(2)}</Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${Math.min(Math.abs(p.pnlPercent ?? 0) * 2, 100)}%`, backgroundColor: (p.pnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }]} />
                          </View>
                        </View>
                      )}
                    />
                  ) : (
                    <View style={styles.emptyWrap}>
                      <Wallet size={32} color="#3f3f46" />
                      <Text style={styles.emptyTitle}>尚無持倉資料</Text>
                      <Text style={styles.emptySubtitle}>點擊「新增持倉」開始追蹤投資組合</Text>
                      <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.firstAddBtn}>
                        <Plus size={12} color="#86efac" />
                        <Text style={styles.firstAddText}>新增第一筆持倉</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.tableWrap}>
                  <View style={styles.table}>
                    <View style={styles.tableHeadRow}>
                      {['代碼 / 名稱', '股數', '均價', '現價', '市值 (TWD)', '幣別', '未實現損益', '漲跌幅', '操作'].map((h, i) => (
                        <Text key={i} style={[styles.th, i >= 5 ? styles.textRight : null]}>{h}</Text>
                      ))}
                    </View>

                    {positions.length === 0 ? (
                      <View style={styles.emptyTableRow}>
                        <Text style={styles.emptyTableText}>尚無持倉，請點擊上方「新增持倉」按鈕</Text>
                      </View>
                    ) : (
                      positions.map((p, idx) => (
                        <View key={p.symbol} style={styles.trRow}>
                          <View style={styles.tdSymbol}>
                            <View style={styles.symbolCircle}>
                              <Text style={styles.symbolCircleText}>{p.symbol.charAt(0)}</Text>
                            </View>
                            <View>
                              <Text style={styles.tdSymbolText}>{p.symbol}</Text>
                              <Text style={styles.tdSubText}>{p.shortName ?? p.name}</Text>
                            </View>
                          </View>

                          <View style={styles.td}>
                            {editIdx === idx ? (
                              <TextInput
                                accessibilityLabel="持股數量"
                                keyboardType="numeric"
                                style={styles.inlineInputSmall}
                                value={String(editBuf.shares ?? p.shares)}
                                onChangeText={txt => setEditBuf(b => ({ ...b, shares: Number(txt) }))}
                              />
                            ) : (
                              <Text style={styles.monoMuted}>{p.shares.toLocaleString()}</Text>
                            )}
                          </View>

                          <View style={styles.td}>
                            {editIdx === idx ? (
                              <TextInput
                                accessibilityLabel="平均成本"
                                keyboardType="numeric"
                                style={styles.inlineInputMedium}
                                value={String(editBuf.avgCost ?? p.avgCost)}
                                onChangeText={txt => setEditBuf(b => ({ ...b, avgCost: Number(txt) }))}
                              />
                            ) : (
                              <Text style={styles.monoMuted}>{p.avgCost.toFixed(2)}</Text>
                            )}
                          </View>

                          <View style={styles.td}>
                            <Text style={styles.monoWhite}>{p.currentPrice != null ? p.currentPrice.toFixed(2) : <Loader2 size={12} color="#52525b" />}</Text>
                          </View>

                          <View style={[styles.td, styles.textRight]}>
                            <Text style={styles.monoWhite}>${Math.round(p.marketValueTWD ?? p.marketValue ?? 0).toLocaleString()}</Text>
                          </View>

                          <View style={[styles.td, styles.textRight]}>
                            <Text style={[styles.currencyTag, p.currency === 'TWD' ? styles.currencyTwd : styles.currencyUsd]}>{p.currency}</Text>
                          </View>

                          <View style={[styles.td, styles.textRight]}>
                            <Text style={[styles.monoBold, (p.pnl ?? 0) >= 0 ? styles.pnlPos : styles.pnlNeg]}>
                              {(p.pnl ?? 0) >= 0 ? '+' : ''}{Math.round(p.pnl ?? 0).toLocaleString()}
                            </Text>
                          </View>

                          <View style={[styles.td, styles.textRight]}>
                            <Text style={[styles.pctTag, (p.pnlPercent ?? 0) >= 0 ? styles.goodBg : styles.badBg]}>
                              {(p.pnlPercent ?? 0) >= 0 ? '+' : ''}{(p.pnlPercent ?? 0).toFixed(2)}%
                            </Text>
                          </View>

                          <View style={styles.td}>
                            <View style={styles.actionsRight}>
                              {editIdx === idx ? (
                                <>
                                  <TouchableOpacity onPress={handleSaveEdit} style={styles.iconBtnGood}><Check size={10} color="#34d399" /></TouchableOpacity>
                                  <TouchableOpacity onPress={() => setEditIdx(null)} style={styles.iconBtnDark}><X size={10} color="#a1a1aa" /></TouchableOpacity>
                                </>
                              ) : (
                                <>
                                  {onGoBacktest && (
                                    <TouchableOpacity onPress={() => onGoBacktest(p.symbol)} style={styles.iconBtnAmber}>
                                      <BarChart2 size={10} color="#f59e0b" />
                                    </TouchableOpacity>
                                  )}
                                  {onGoJournal && (
                                    <TouchableOpacity onPress={() => onGoJournal(p.symbol)} style={styles.iconBtnIndigo}>
                                      <BookOpen size={10} color="#818cf8" />
                                    </TouchableOpacity>
                                  )}
                                  <TouchableOpacity onPress={() => { setEditIdx(idx); setEditBuf({}); }} style={styles.iconBtnDark}>
                                    <Edit2 size={10} color="#a1a1aa" />
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => handleDelete(idx)} style={styles.iconBtnRed}>
                                    <Trash2 size={10} color="#fb7185" />
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </motion.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40, gap: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: 'rgba(24,24,27,0.5)', borderRadius: 24, borderWidth: 1, borderColor: '#27272a' },
  errorIconWrap: { width: 64, height: 64, borderRadius: 999, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#f4f4f5', marginBottom: 8 },
  errorDesc: { color: '#a1a1aa', marginBottom: 24, textAlign: 'center', maxWidth: 320 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#27272a', borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { color: '#e5e7eb', fontWeight: '500' },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(244,63,94,0.1)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)', borderRadius: 12, padding: 12 },
  errorBannerText: { color: '#fb7185', fontSize: 12, flex: 1 },
  errorBannerClose: { marginLeft: 'auto' },

  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pdfBtnText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  kpiCard: { flexGrow: 1, flexBasis: 0, minWidth: 160, backgroundColor: 'var(--card-bg)', borderRadius: 24, borderWidth: 1, borderColor: 'var(--border-color)', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  kpiCardCompact: { padding: 12 },
  kpiCardNormal: { padding: 24 },
  kpiLabel: { color: 'var(--text-color)', opacity: 0.5, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8, fontWeight: '700' },
  kpiValue: { marginBottom: 4, fontWeight: '900', fontFamily: 'monospace' },
  kpiValueUp: { color: 'var(--text-color)' },
  kpiValueDown: { color: '#f43f5e' },
  kpiSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, fontWeight: '500' },
  kpiSub: { color: 'var(--text-color)', opacity: 0.6, fontSize: 12 },
  kpiTip: { color: 'var(--text-color)', opacity: 0.4, marginTop: 12, fontWeight: '500' },

  chartGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, minHeight: 260 },
  panel: { backgroundColor: 'var(--card-bg)', borderRadius: 16, borderWidth: 1, borderColor: 'var(--border-color)', minHeight: 260 },
  panelCompact: { padding: 8, flexGrow: 1, flexBasis: 0, minWidth: 280 },
  panelNormal: { padding: 16, flexGrow: 1, flexBasis: 0, minWidth: 280 },
  panelTitle: { fontWeight: '700', color: 'var(--text-color)', marginBottom: 4 },
  panelSub: { color: 'var(--text-color)', opacity: 0.5, marginBottom: 8 },
  rowFlex: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  flex1: { flex: 1 },
  legendWrap: { width: 140, maxHeight: '100%' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  legendLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  legendName: { color: 'var(--text-color)', opacity: 0.7, flex: 1 },
  legendPct: { color: 'var(--text-color)', opacity: 0.5, fontFamily: 'monospace' },

  equityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  capBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'var(--bg-color)', borderRadius: 8, borderWidth: 1, borderColor: 'var(--border-color)' },
  capBtnText: { color: 'var(--text-color)', opacity: 0.5 },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  capInput: { flex: 1, backgroundColor: 'var(--bg-color)', borderWidth: 1, borderColor: 'var(--border-color)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, color: 'var(--text-color)', fontFamily: 'monospace', fontSize: 14 },
  capApplyBtn: { paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#022c22', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(6,95,70,0.5)' },
  capApplyText: { color: '#34d399', fontSize: 12 },
  capCancelBtn: { paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'var(--border-color)', borderRadius: 8, borderWidth: 1, borderColor: 'var(--border-color)' },
  capCancelText: { color: 'var(--text-color)', opacity: 0.6, fontSize: 12 },
  emptyChart: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyChartText: { color: '#52525b', fontSize: 12, textAlign: 'center' },

  tableCard: { backgroundColor: 'var(--card-bg)', borderRadius: 16, padding: 16, flex: 1, borderWidth: 1, borderColor: 'var(--border-color)' },
  tableHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tableTitle: { fontWeight: '700', color: 'var(--text-color)' },
  tableSubtitle: { color: 'var(--text-color)', opacity: 0.5, marginTop: 2, fontSize: 12 },
  tableActions: { flexDirection: 'row', gap: 8 },
  smallActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border-color)', backgroundColor: 'var(--border-color)', opacity: 0.7 },
  smallActionBtnCompact: { paddingHorizontal: 8, paddingVertical: 4 },
  smallActionBtnNormal: { paddingHorizontal: 10, paddingVertical: 6 },
  smallActionText: { color: 'var(--text-color)', opacity: 0.9, fontSize: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.2)' },
  addBtnText: { color: '#a7f3d0', fontSize: 12 },

  addForm: { marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 12, backgroundColor: 'var(--bg-color)', borderWidth: 1, borderColor: 'var(--border-color)' },
  addField: { minWidth: 120, flexGrow: 1, flexBasis: 0 },
  addFieldLabel: { fontSize: 12, color: 'var(--text-color)', opacity: 0.5, marginBottom: 4 },
  addInput: { backgroundColor: 'var(--bg-color)', borderWidth: 1, borderColor: 'var(--border-color)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: 'var(--text-color)', fontSize: 14 },
  addActionsWrap: { minWidth: 100 },
  addActions: { flexDirection: 'row', gap: 6 },
  addConfirmBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.2)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', alignItems: 'center' },
  addConfirmText: { color: '#a7f3d0', fontWeight: '700' },
  addCancelBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'var(--border-color)', borderWidth: 1, borderColor: 'var(--border-color)', alignItems: 'center' },
  addCancelText: { color: 'var(--text-color)', opacity: 0.6, fontWeight: '700' },

  mobileWrap: { paddingBottom: 16 },
  mobileCard: { width: '100%', height: '100%', backgroundColor: 'var(--card-bg)', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: 'var(--border-color)', justifyContent: 'space-between' },
  mobileCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  mobileSymbol: { fontSize: 20, fontWeight: '700', color: 'var(--text-color)' },
  mobileName: { fontSize: 14, color: 'var(--text-color)', opacity: 0.5 },
  mobilePct: { fontSize: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, fontWeight: '700' },
  goodBg: { backgroundColor: 'rgba(16,185,129,0.2)', color: '#34d399' },
  badBg: { backgroundColor: 'rgba(244,63,94,0.2)', color: '#fb7185' },
  mobileStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  mobileStat: { flexBasis: '48%', flexGrow: 1, flexDirection: 'column' },
  mobileStatLabel: { color: 'var(--text-color)', opacity: 0.5, fontSize: 12, marginBottom: 4 },
  mobileStatValue: { color: 'var(--text-color)', fontFamily: 'monospace', fontWeight: '700' },
  alignEnd: { alignItems: 'flex-end' },
  pnlPos: { color: '#34d399' },
  pnlNeg: { color: '#fb7185' },
  progressTrack: { width: '100%', height: 8, backgroundColor: 'var(--border-color)', borderRadius: 999, overflow: 'hidden', marginTop: 16 },
  progressFill: { height: '100%' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 16 },
  emptyTitle: { color: '#a1a1aa', fontWeight: '700', marginTop: 12, marginBottom: 4 },
  emptySubtitle: { color: '#52525b', fontSize: 12, marginBottom: 16, textAlign: 'center' },
  firstAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.2)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  firstAddText: { color: '#34d399', fontSize: 12, fontWeight: '700' },

  tableWrap: { overflow: 'hidden' },
  table: { width: '100%' },
  tableHeadRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'var(--border-color)', paddingBottom: 10 },
  th: { flex: 1, color: 'var(--text-color)', opacity: 0.5, fontSize: 12, fontWeight: '500' },
  trRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(39,39,42,0.5)', paddingVertical: 12 },
  td: { flex: 1, paddingRight: 6 },
  tdSymbol: { flex: 1.6, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6 },
  symbolCircle: { width: 28, height: 28, borderRadius: 999, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  symbolCircleText: { color: '#f4f4f5', fontSize: 11, fontWeight: '700' },
  tdSymbolText: { color: '#f4f4f5', fontSize: 12, fontWeight: '700' },
  tdSubText: { color: '#71717a', fontSize: 9 },
  monoMuted: { fontFamily: 'monospace', color: '#d4d4d8' },
  monoWhite: { fontFamily: 'monospace', color: '#f4f4f5' },
  monoBold: { fontFamily: 'monospace', fontWeight: '700' },
  textRight: { textAlign: 'right' as const },
  currencyTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 9, fontWeight: '700', overflow: 'hidden' },
  currencyTwd: { backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399' },
  currencyUsd: { backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' },
  pctTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, fontSize: 9, fontWeight: '700', fontFamily: 'monospace', overflow: 'hidden' },
  actionsRight: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, alignItems: 'center' },
  iconBtnGood: { padding: 6, borderRadius: 6, backgroundColor: 'rgba(16,185,129,0.1)' },
  iconBtnDark: { padding: 6, borderRadius: 6, backgroundColor: '#27272a' },
  iconBtnAmber: { padding: 6, borderRadius: 6, backgroundColor: 'rgba(245,158,11,0.1)' },
  iconBtnIndigo: { padding: 6, borderRadius: 6, backgroundColor: 'rgba(99,102,241,0.1)' },
  iconBtnRed: { padding: 6, borderRadius: 6, backgroundColor: 'rgba(244,63,94,0.1)' },
  inlineInputSmall: { backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a', borderRadius: 4, color: '#f4f4f5', paddingHorizontal: 6, paddingVertical: 4, width: 64, fontSize: 12 },
  inlineInputMedium: { backgroundColor: '#09090b', borderWidth: 1, borderColor: '#27272a', borderRadius: 4, color: '#f4f4f5', paddingHorizontal: 6, paddingVertical: 4, width: 84, fontSize: 12 },
  emptyTableRow: { paddingVertical: 40, alignItems: 'center' },
  emptyTableText: { color: '#71717a', fontSize: 14 },

  tipCard: { backgroundColor: 'var(--card-bg)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, minWidth: 160 },
  tipLabel: { color: '#94a3b8', marginBottom: 6, fontSize: 12 },
  tipPort: { color: '#34d399', fontSize: 12 },
  tipBench: { color: '#94a3b8', fontSize: 12 },
  tipAlpha: { marginTop: 4, fontSize: 12 },

  textXs: { fontSize: 12 },
  textSm: { fontSize: 14 },
  textBase: { fontSize: 16 },
  textLg: { fontSize: 18 },
  text2xl: { fontSize: 24 },
  labelMeta: { fontSize: 10 },
});
