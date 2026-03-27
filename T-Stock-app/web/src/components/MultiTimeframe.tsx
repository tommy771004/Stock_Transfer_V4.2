import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react-native';
import { View, Text, SafeAreaView, StyleSheet, ScrollView } from 'react-native';
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
      <View style={styles.container}>
        <View style={styles.card}>
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
            <View style={styles.loadingWrap}>
              <Loader2 size={40} color="#818cf8" />
              <Text style={styles.loadingText}>AI 正在進行多時區共振分析...</Text>
            </View>
          ) : status.phase === 'error' ? (
            <View style={styles.errorWrap}>
              <AlertCircle size={40} color="#fb7185" />
              <Text style={styles.errorTitle}>載入失敗</Text>
              <Text style={styles.errorMessage}>{status.message}</Text>
            </View>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, styles.indicatorHeader]}>指標 (Indicator)</Text>
                    {timeframes.map((tf, i) => (
                      <Text key={i} style={[styles.th, styles.timeframeHeader]}>
                        {tf}
                      </Text>
                    ))}
                  </View>

                  {status.result.indicators.map((ind, i: number) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.td, styles.indicatorCell]}>{ind.name}</Text>
                      {ind.values.map((val: string, j: number) => {
                        const badgeStatus = (ind.statuses?.[j] ?? val) as
                          | 'bullish'
                          | 'bearish'
                          | 'neutral';
                        return (
                          <View key={j} style={[styles.td, styles.badgeCell]}>
                            <StatusBadge value={val} status={badgeStatus} />
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.synthesisBox}>
                <View style={styles.synthesisTitleRow}>
                  <Activity size={20} color="#a5b4fc" />
                  <Text style={styles.synthesisTitle}>AI 綜合評估 (AI Synthesis)</Text>
                </View>
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
                    {` ${status.result.score}/100 (${status.result.overallTrend})`}
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
      <View style={styles.badgeIconBullish}>
        <TrendingUp size={16} color="#34d399" />
      </View>
    );
  }
  if (value === 'bearish') {
    return (
      <View style={styles.badgeIconBearish}>
        <TrendingDown size={16} color="#fb7185" />
      </View>
    );
  }
  if (value === 'neutral') {
    return (
      <View style={styles.badgeIconNeutral}>
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
          status === 'bullish' && styles.badgeTextColorBullish,
          status === 'bearish' && styles.badgeTextColorBearish,
          status === 'neutral' && styles.badgeTextColorNeutral,
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
  container: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
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
  loadingWrap: {
    height: 256,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    marginTop: 16,
  },
  errorWrap: {
    height: 256,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  errorTitle: {
    color: '#fb7185',
    fontWeight: '600',
    marginTop: 12,
  },
  errorMessage: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
  },
  tableScroll: {
    flexGrow: 0,
  },
  table: {
    minWidth: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  th: {
    padding: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  td: {
    padding: 16,
    justifyContent: 'center',
  },
  indicatorHeader: {
    width: 180,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  timeframeHeader: {
    width: 140,
    textAlign: 'center',
  },
  indicatorCell: {
    width: 180,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  badgeCell: {
    width: 140,
    alignItems: 'center',
  },
  synthesisBox: {
    marginTop: 32,
    padding: 24,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    borderRadius: 16,
  },
  synthesisTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  synthesisTitle: {
    color: '#a5b4fc',
    fontWeight: '600',
    marginLeft: 8,
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
  badgeIconBullish: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  badgeIconBearish: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(244,63,94,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  badgeIconNeutral: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  badgeTextBase: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  badgeTextColorBullish: {
    color: '#86efac',
  },
  badgeTextColorBearish: {
    color: '#fda4af',
  },
  badgeTextColorNeutral: {
    color: '#fcd34d',
  },
});
