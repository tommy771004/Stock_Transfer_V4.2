import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, RefreshCw, BarChart2 } from 'lucide-react-native';
import * as api from '../services/api';
import { Position, Quote } from '../types';
import Decimal from 'decimal.js';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';

interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  flash: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PaperTradingDashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalAssets, setTotalAssets] = useState(0);
  const [todayPnl, setTodayPnl] = useState(0);

  const fetchPositions = useCallback(async () => {
    try {
      setError(null);
      const posData = await api.getPositions();
      const positions = Array.isArray(posData.positions) ? posData.positions : [];
      if (positions.length === 0) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      const symbols = positions.map((p: Position) => p.symbol);
      const quotes = await api.getBatchQuotes(symbols).catch(() => []);
      const quoteMap = new Map<string, Quote>();
      if (Array.isArray(quotes)) {
        quotes.forEach((q: Quote) => {
          if (q?.symbol) quoteMap.set(q.symbol, q);
        });
      }

      const newHoldings: Holding[] = positions.map((p: Position) => {
        const q = quoteMap.get(p.symbol);
        const currentPrice = q?.regularMarketPrice ?? p.avgCost;
        const pnl =
          isFinite(currentPrice) && isFinite(p.avgCost) && isFinite(p.shares)
            ? new Decimal(currentPrice).minus(p.avgCost).times(p.shares).toNumber()
            : 0;

        return {
          symbol: p.symbol,
          qty: p.shares,
          avgPrice: p.avgCost,
          currentPrice,
          pnl: Math.round(pnl),
          flash: '',
        };
      });

      setHoldings(newHoldings);
      setTotalAssets(
        newHoldings.reduce(
          (s, h) => new Decimal(s).plus(new Decimal(h.currentPrice).times(h.qty)).toNumber(),
          0
        )
      );
      setTodayPnl(newHoldings.reduce((s, h) => new Decimal(s).plus(h.pnl).toNumber(), 0));
    } catch (e) {
      console.warn('[PaperTrading] refreshPrices:', e);
      setError(e instanceof Error ? e.message : '連線異常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const fetchRef = useRef(fetchPositions);
  fetchRef.current = fetchPositions;

  useEffect(() => {
    const interval = setInterval(() => fetchRef.current(), 30000);
    return () => clearInterval(interval);
  }, []);

  const winCount = holdings.filter(h => h.pnl > 0).length;
  const winRate = holdings.length > 0 ? Math.round((winCount / holdings.length) * 100) : 0;

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIconWrap}>
            <Activity size={24} color="#ef4444" />
          </View>
          <View style={styles.errorTextWrap}>
            <Text style={styles.errorTitle}>連線異常</Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
          <TouchableOpacity style={styles.retryButton} onPress={fetchPositions} activeOpacity={0.85}>
            <RefreshCw size={16} color="#f4f4f5" />
            <Text style={styles.retryButtonText}>重新整理</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingHeader}>
            <View style={[styles.pulse, { width: 190, height: 20 }]} />
            <View style={[styles.pulse, { width: 80, height: 20 }]} />
          </View>

          <View style={styles.statsRow}>
            {[1, 2, 3].map(i => (
              <View key={i} style={styles.loadingCard}>
                <View style={[styles.pulse, { width: 64, height: 12, marginBottom: 8 }]} />
                <View style={[styles.pulse, { width: 96, height: 24 }]} />
              </View>
            ))}
          </View>

          <View style={styles.loadingHoldingsRow}>
            {[1, 2].map(i => (
              <View key={i} style={styles.loadingHoldingCard} />
            ))}
          </View>

          <View style={styles.loadingSpinnerWrap}>
            <ActivityIndicator size="small" color="#a1a1aa" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            <Activity size={20} color="#34d399" />
            <Text> </Text>
            <Text>模擬交易看板 (Paper Trading)</Text>
          </Text>

          <View style={styles.headerRight}>
            <TouchableOpacity onPress={fetchPositions} style={styles.refreshIconButton} activeOpacity={0.7}>
              <RefreshCw size={14} color="#71717a" />
            </TouchableOpacity>
            <View style={styles.assetsWrap}>
              <Text style={styles.assetsLabel}>總資產</Text>
              <Text style={styles.assetsValue}>
                ${totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>未實現盈虧</Text>
            <Text style={[styles.statValue, todayPnl >= 0 ? styles.positiveText : styles.negativeText]}>
              {todayPnl >= 0 ? '+' : ''}
              ${todayPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>持倉數</Text>
            <Text style={styles.statValueWhite}>{holdings.length}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>勝率</Text>
            <Text style={styles.statValueWhite}>{winRate}%</Text>
          </View>
        </View>

        {holdings.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <BarChart2 size={20} color="#52525b" />
            </View>
            <Text style={styles.emptyTitle}>尚無持倉資料</Text>
            <Text style={styles.emptySubtitle}>在交易頁面下單後，持倉將顯示在此處</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.holdingsRow}>
              {holdings.map(h => (
                <View
                  key={h.symbol}
                  style={[
                    styles.holdingCard,
                    h.flash ? { backgroundColor: h.flash } : null,
                  ]}
                >
                  <View style={styles.holdingHeader}>
                    <Text style={styles.symbol}>{h.symbol}</Text>
                    <Text style={[styles.pnl, h.pnl > 0 ? styles.positiveText : styles.negativeText]}>
                      {h.pnl > 0 ? '+' : ''}
                      {h.pnl.toLocaleString()}
                    </Text>
                  </View>

                  <View style={styles.detailsGrid}>
                    <Text style={styles.detailText}>
                      持倉: <Text style={styles.detailValue}>{h.qty.toLocaleString()}</Text>
                    </Text>
                    <Text style={styles.detailText}>
                      均價: <Text style={styles.detailValue}>{h.avgPrice.toFixed(2)}</Text>
                    </Text>
                    <Text style={styles.detailText}>
                      現價: <Text style={styles.detailValue}>{h.currentPrice.toFixed(2)}</Text>
                    </Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        h.pnl > 0 ? styles.progressPositive : styles.progressNegative,
                        { width: `${Math.min(Math.abs(h.pnl) / 500, 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    borderRadius: 16,
    padding: 24,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshIconButton: {
    padding: 6,
    borderRadius: 8,
  },
  assetsWrap: {
    alignItems: 'flex-end',
  },
  assetsLabel: {
    fontSize: 12,
    color: '#71717a',
  },
  assetsValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(39, 39, 42, 0.95)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  statLabel: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statValueWhite: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  positiveText: {
    color: '#34d399',
  },
  negativeText: {
    color: '#fb7185',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  emptyTitle: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#52525b',
    fontSize: 12,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  holdingsRow: {
    flexDirection: 'row',
    gap: 32,
  },
  holdingCard: {
    width: Math.min(280, SCREEN_WIDTH * 0.78),
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  holdingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  symbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  pnl: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  detailsGrid: {
    gap: 8,
    marginBottom: 20,
  },
  detailText: {
    fontSize: 14,
    color: '#d4d4d8',
  },
  detailValue: {
    color: '#ffffff',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#27272a',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressPositive: {
    backgroundColor: '#10b981',
  },
  progressNegative: {
    backgroundColor: '#f43f5e',
  },
  errorContainer: {
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    minHeight: 192,
    textAlign: 'center',
  },
  errorIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTextWrap: {
    alignItems: 'center',
  },
  errorTitle: {
    color: '#f4f4f5',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  errorMessage: {
    color: '#a1a1aa',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryButtonText: {
    color: '#f4f4f5',
    fontSize: 14,
  },
  loadingContainer: {
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    borderRadius: 16,
    padding: 24,
    gap: 16,
    minHeight: 192,
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadingCard: {
    flex: 1,
    backgroundColor: 'rgba(39, 39, 42, 0.5)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  loadingHoldingsRow: {
    flexDirection: 'row',
    gap: 16,
    flex: 1,
  },
  loadingHoldingCard: {
    flex: 1,
    backgroundColor: 'rgba(39, 39, 42, 0.5)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  loadingSpinnerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  pulse: {
    backgroundColor: '#3f3f46',
    borderRadius: 8,
  },
});
