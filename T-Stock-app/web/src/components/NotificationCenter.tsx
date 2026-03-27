import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  AlertCircle,
} from 'lucide-react-native';
import { analyzeMTF } from '../services/aiService';
import * as api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import type { HistoricalData, MTFResult } from '../types';

const timeframes = ['1 小時 (1H)', '日線 (1D)', '週線 (1W)'];

interface MTFData {
  data1h: HistoricalData[];
  data1d: HistoricalData[];
  data1wk: HistoricalData[];
}

type MTFStatus =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; result: MTFResult };

export default function MultiTimeframe({ model, symbol }: { model: string; symbol: string }) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<MTFStatus>({ phase: 'loading' });
  const [data, setData] = useState<MTFData | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setStatus({ phase: 'loading' });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const period1_1h = thirtyDaysAgo.toISOString().split('T')[0];

        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);
        const period1_1d = oneYearAgo.toISOString().split('T')[0];

        const threeYearsAgo = new Date();
        threeYearsAgo.setDate(threeYearsAgo.getDate() - 365 * 3);
        const period1_1wk = threeYearsAgo.toISOString().split('T')[0];

        const [data1h, data1d, data1wk] = await Promise.all([
          api.getHistory(symbol, { interval: '1h', period1: period1_1h }),
          api.getHistory(symbol, { interval: '1d', period1: period1_1d }),
          api.getHistory(symbol, { interval: '1wk', period1: period1_1wk }),
        ]);

        if (!cancelled && mountedRef.current) {
          setData({ data1h, data1d, data1wk });
        }
      } catch (error) {
        console.error('Error fetching MTF data:', error);
        if (!cancelled && mountedRef.current) {
          setStatus({
            phase: 'error',
            message: error instanceof Error ? error.message : '資料載入失敗',
          });
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;

    const runAnalysis = async () => {
      if (!data) return;

      try {
        setStatus({ phase: 'loading' });
        const result = await analyzeMTF(
          symbol,
          data.data1h,
          data.data1d,
          data.data1wk,
          model,
          String(settings.systemInstruction || '')
        );

        if (!cancelled && mountedRef.current) {
          if (result) setStatus({ phase: 'ready', result });
          else setStatus({ phase: 'error', message: 'AI 回傳空結果，請檢查 API Key 設定' });
        }
      } catch (error) {
        console.error('Error analyzing MTF data:', error);
        if (!cancelled && mountedRef.current) {
          setStatus({
            phase: 'error',
            message: error instanceof Error ? error.message : 'AI 分析失敗',
          });
        }
      }
    };

    runAnalysis();
    return () => {
      cancelled = true;
    };
  }, [data, model, symbol, settings.systemInstruction]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.outer}>
        <View style={styles.card}>
          <View style={styles.gradientOverlay} pointerEvents="none" />

          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Clock size={24} color="#c4b5fd" />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>多時區分析矩陣 (MTF Matrix)</Text>
              <Text style={styles.subtitle}>跨週期趨勢共振掃描，尋找高勝率交易機會</Text>
            </View>
          </View>

          {status.phase === 'loading' ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color="#818cf8" />
              <Text style={styles.loadingText}>AI 正在進行多時區共振分析...</Text>
            </View>
          ) : status.phase === 'error' ? (
            <View style={styles.centerState}>
              <AlertCircle size={40} color="#fb7185" />
              <Text style={styles.errorTitle}>載入失敗</Text>
              <Text style={styles.errorMessage}>{status.message}</Text>
            </View>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableScrollContent}>
                <View style={styles.table}>
                  <View style={styles.tableRowHeader}>
                    <Text style={[styles.tableHeaderCell, styles.indicatorCol]}>指標 (Indicator)</Text>
                    {timeframes.map((tf, i) => (
                      <Text key={i} style={styles.tableHeaderCellCenter}>
                        {tf}
                      </Text>
                    ))}
                  </View>

                  {status.result.indicators.map((ind, i: number) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.tableCell, styles.indicatorCol]}>{ind.name}</Text>
                      {ind.values.map((val: string, j: number) => {
                        const badgeStatus = (ind.statuses?.[j] ?? val) as 'bullish' | 'bearish' | 'neutral';
                        return (
                          <View key={j} style={styles.tableCellCenter}>
                            <StatusBadge value={val} status={badgeStatus} />
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.synthesisCard}>
                <Text style={styles.synthesisTitle}>
                  <Activity size={20} color="#c4b5fd" />
                  {'  '}AI 綜合評估 (AI Synthesis)
                </Text>
                <Text style={styles.synthesisText}>
                  {status.result.synthesis}
                  {'\n\n'}
                  整體共振分數：
                  <Text
                    style={[
                      styles.scoreText,
                      status.result.score >= 70
                        ? styles.scoreBullish
                        : status.result.score <= 30
                          ? styles.scoreBearish
                          : styles.scoreNeutral,
                    ]}
                  >
                    {status.result.score}/100 ({status.result.overallTrend})
                  </Text>
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function StatusBadge({
  value,
  status,
}: {
  value: string;
  status: 'bullish' | 'bearish' | 'neutral';
}) {
  if (value === 'bullish') {
    return (
      <View style={styles.badgeCircleBullish}>
        <TrendingUp size={16} color="#34d399" />
      </View>
    );
  }

  if (value === 'bearish') {
    return (
      <View style={styles.badgeCircleBearish}>
        <TrendingDown size={16} color="#fb7185" />
      </View>
    );
  }

  if (value === 'neutral') {
    return (
      <View style={styles.badgeCircleNeutral}>
        <Minus size={16} color="#fbbf24" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.badgeTextBase,
        status === 'bullish' && styles.badgeTextBullish,
        status === 'bearish' && styles.badgeTextBearish,
        status === 'neutral' && styles.badgeTextNeutral,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          status === 'bullish' && styles.badgeTextValueBullish,
          status === 'bearish' && styles.badgeTextValueBearish,
          status === 'neutral' && styles.badgeTextValueNeutral,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  outer: {
    flex: 1,
    paddingBottom: 40,
  },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 32,
    overflow: 'hidden',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    zIndex: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTextWrap: {
    marginLeft: 12,
    flexShrink: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  centerState: {
    height: 256,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
  },
  errorTitle: {
    color: '#fb7185',
    fontWeight: '600',
    fontSize: 16,
  },
  errorMessage: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 256,
  },
  tableScrollContent: {
    paddingBottom: 4,
  },
  table: {
    minWidth: '100%',
    zIndex: 10,
  },
  tableRowHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  tableHeaderCell: {
    width: 180,
    padding: 16,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  tableHeaderCellCenter: {
    width: 140,
    padding: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textAlign: 'center',
  },
  tableCell: {
    width: 180,
    padding: 16,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  tableCellCenter: {
    width: 140,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorCol: {
    width: 180,
  },
  synthesisCard: {
    marginTop: 32,
    padding: 24,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    borderRadius: 16,
    zIndex: 10,
  },
  synthesisTitle: {
    color: '#c4b5fd',
    fontWeight: '600',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  synthesisText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 22,
  },
  scoreText: {
    fontWeight: '700',
  },
  scoreBullish: {
    color: '#34d399',
  },
  scoreBearish: {
    color: '#fb7185',
  },
  scoreNeutral: {
    color: '#fbbf24',
  },
  badgeCircleBullish: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeCircleBearish: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(244,63,94,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeCircleNeutral: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeTextBase: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  badgeTextBullish: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.2)',
  },
  badgeTextBearish: {
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderColor: 'rgba(244,63,94,0.2)',
  },
  badgeTextNeutral: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.2)',
  },
  badgeTextValueBullish: {
    color: '#86efac',
  },
  badgeTextValueBearish: {
    color: '#fda4af',
  },
  badgeTextValueNeutral: {
    color: '#fcd34d',
  },
});
