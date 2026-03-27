import React, { memo, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LineChart, Activity, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react-native';
import { analyzeSentiment as getAISentiment } from '../services/aiService';
import { apiUrl } from '../services/api';
import { SentimentData } from '../types';

function Sentiment({ model, symbol }: { model: string; symbol: string }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [marketData, setMarketData] = useState<unknown>(null);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch(apiUrl(`/api/market-summary?symbol=${symbol}`));
        const data = await response.json();
        setMarketData(data);
      } catch (error) {
        console.error('Failed to fetch market data:', error);
      }
    };
    fetchMarketData();
  }, [symbol]);

  useEffect(() => {
    const analyzeSentiment = async () => {
      if (!marketData || !Array.isArray(marketData) || marketData.length === 0) return;

      setIsAnalyzing(true);
      try {
        const aiResult = await getAISentiment(Array.isArray(marketData) ? marketData : [], model);
        setSentiment(aiResult);
      } catch (error) {
        console.error('Failed to analyze sentiment:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };
    analyzeSentiment();
  }, [marketData, model]);

  const size = 192;
  const strokeWidth = 8;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - (sentiment?.score ?? 0) / 100);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.iconWrapper}>
            <LineChart size={24} color="#a5b4fc" strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.title}>市場情緒 (Market Sentiment)</Text>
            <Text style={styles.subtitle}>AI 綜合分析新聞、社群與總經數據</Text>
          </View>
        </View>

        {isAnalyzing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#818cf8" />
            <Text style={styles.loadingText}>AI 正在分析全球市場情緒...</Text>
          </View>
        ) : sentiment ? (
          <View style={styles.grid}>
            <View style={[styles.card, styles.mainCard]}>
              <View style={styles.cardGlow} />
              <View style={styles.mainCardContent}>
                <View style={[styles.scoreCircle, { width: size, height: size }]}>
                  <Svg width={size} height={size} style={styles.svg}>
                    <Circle
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="transparent"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth={strokeWidth}
                    />
                    <Circle
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="transparent"
                      stroke={sentiment.score > 50 ? '#34d399' : '#fb7185'}
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${circumference}`}
                      strokeDashoffset={`${dashOffset}`}
                      strokeLinecap="round"
                    />
                  </Svg>
                  <View style={styles.scoreOverlay}>
                    <Text style={styles.scoreText}>{sentiment.score}</Text>
                    <Text style={styles.scoreSubText}>/ 100</Text>
                  </View>
                </View>

                <View style={styles.sentimentInfo}>
                  <Text style={styles.sentimentTitle}>綜合情緒指標</Text>
                  <View
                    style={[
                      styles.badge,
                      sentiment.score > 50 ? styles.badgePositive : styles.badgeNegative,
                    ]}
                  >
                    {sentiment.score > 50 ? (
                      <TrendingUp size={20} color="#34d399" strokeWidth={2} />
                    ) : (
                      <TrendingDown size={20} color="#fb7185" strokeWidth={2} />
                    )}
                    <Text
                      style={[
                        styles.badgeText,
                        sentiment.score > 50 ? styles.badgeTextPositive : styles.badgeTextNegative,
                      ]}
                    >
                      {sentiment.overall}
                    </Text>
                  </View>
                  <Text style={styles.adviceText}>{sentiment.aiAdvice}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.card, styles.indicatorCard]}>
              <Text style={styles.cardHeading}>
                <Activity size={20} color="#818cf8" strokeWidth={2} /> 關鍵指標
              </Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>VIX 恐慌指數</Text>
                <Text style={styles.infoValue}>{sentiment.vixLevel}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Put/Call Ratio</Text>
                <Text style={styles.infoValue}>{sentiment.putCallRatio || 'N/A'}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>市場寬度 (MMFI)</Text>
                <Text style={styles.infoValue}>{sentiment.marketBreadth || 'N/A'}</Text>
              </View>
            </View>

            <View style={[styles.card, styles.keyDriversCard]}>
              <Text style={styles.cardHeading}>
                <AlertCircle size={20} color="#818cf8" strokeWidth={2} /> 主要驅動因素 (Key Drivers)
              </Text>

              <View style={styles.driversGrid}>
                {sentiment.keyDrivers?.map((driver: string, idx: number) => (
                  <View key={idx} style={styles.driverItem}>
                    <View style={styles.driverIndex}>
                      <Text style={styles.driverIndexText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.driverText}>{driver}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    paddingBottom: 40,
    paddingHorizontal: 16,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'var(--bg-color)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'var(--border-color)',
    shadowColor: '#ffffff',
    shadowOpacity: 0.2,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
  },
  loadingContainer: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  grid: {
    flexDirection: 'column',
    gap: 24,
  },
  card: {
    backgroundColor: 'var(--card-bg)',
    borderWidth: 1,
    borderColor: 'var(--border-color)',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  mainCard: {
    padding: 32,
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  mainCardContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
    position: 'relative',
    zIndex: 1,
  },
  scoreCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svg: {
    transform: [{ rotate: '-90deg' }],
  },
  scoreOverlay: {
    position: 'absolute',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 48,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  scoreSubText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
  },
  sentimentInfo: {
    flex: 1,
  },
  sentimentTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  badgePositive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.2)',
  },
  badgeNegative: {
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderColor: 'rgba(244,63,94,0.2)',
  },
  badgeText: {
    fontSize: 18,
    fontWeight: '500',
  },
  badgeTextPositive: {
    color: '#34d399',
  },
  badgeTextNegative: {
    color: '#fb7185',
  },
  adviceText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 18,
    lineHeight: 28,
  },
  indicatorCard: {
    padding: 24,
    gap: 16,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  infoRow: {
    backgroundColor: 'var(--bg-color)',
    borderWidth: 1,
    borderColor: 'var(--border-color)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 18,
  },
  infoValue: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  keyDriversCard: {
    padding: 24,
  },
  driversGrid: {
    flexDirection: 'column',
    gap: 16,
  },
  driverItem: {
    backgroundColor: 'var(--bg-color)',
    borderWidth: 1,
    borderColor: 'var(--border-color)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  driverIndex: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  driverIndexText: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '700',
  },
  driverText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    flex: 1,
  },
});

export default memo(Sentiment);
