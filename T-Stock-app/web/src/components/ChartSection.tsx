import React, { Suspense, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useSettings } from '../contexts/SettingsContext';
import { HistoricalData } from '../types';

const ChartWidget = React.lazy(() => import('./ChartWidget').catch(() => ({
  default: () => (
    <View style={styles.errorWrapper}>
      <Text style={styles.errorText}>圖表載入失敗</Text>
    </View>
  ),
})));

interface ChartSectionProps {
  symbol: string;
  model: string;
  focusMode: boolean;
  data: HistoricalData[];
}

export const ChartSection: React.FC<ChartSectionProps> = React.memo(({ data }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 500,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View 
      style={[
        styles.container,
        compact ? styles.p2 : styles.p4,
        { opacity, transform: [{ scale }] }
      ]}
    >
      <Suspense fallback={
        <View style={styles.loaderWrapper}>
          <ActivityIndicator size="small" color="#34d399" />
        </View>
      }>
        <ChartWidget data={data} />
      </Suspense>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  p2: {
    padding: 8,
  },
  p4: {
    padding: 16,
  },
  errorWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#fb7185',
    fontSize: 12,
  },
  loaderWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
