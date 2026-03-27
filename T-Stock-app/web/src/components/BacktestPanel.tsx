import React, { useState, memo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { runBacktest, BacktestConfig } from '../services/backtestEngine';
import { BacktestResult, HistoricalData } from '../types';
import { useSettings } from '../contexts/SettingsContext';

interface Props {
  history: HistoricalData[];
}

const BacktestPanelInner: React.FC<Props> = ({ history }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [result, setResult] = useState<BacktestResult | null>(null);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacityAnim, scaleAnim]);

  const handleRun = () => {
    const shortPeriod = 50;
    const longPeriod = 200;
    const signals: ('BUY' | 'SELL' | 'HOLD')[] = [];
    let position = 0;

    for (let i = 0; i < history.length; i++) {
      if (i < longPeriod) {
        signals.push('HOLD');
        continue;
      }
      const shortSMA = history.slice(i - shortPeriod, i).reduce((a, b) => a + (Number(b?.close) || 0), 0) / shortPeriod;
      const longSMA = history.slice(i - longPeriod, i).reduce((a, b) => a + (Number(b?.close) || 0), 0) / longPeriod;
      if (!isFinite(shortSMA) || !isFinite(longSMA)) { signals.push('HOLD'); continue; }

      if (position === 0 && shortSMA > longSMA) {
        signals.push('BUY');
        position = 1;
      } else if (position === 1 && shortSMA < longSMA) {
        signals.push('SELL');
        position = 0;
      } else {
        signals.push('HOLD');
      }
    }

    const config: BacktestConfig = {
      initialCapital: 100000,
      commissionRate: 0.001425,
      minimumCommission: 20,
      slippageRate: 0.001,
      taxRate: 0.003,
      positionSizing: 'all-in'
    };

    const res = runBacktest(history as HistoricalData[], signals, config);
    setResult(res);
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        compact ? styles.containerCompact : styles.containerNormal,
        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }
      ]}
    >
      <Text style={[styles.title, compact ? styles.titleCompact : styles.titleNormal]}>
        SMA 交叉回測 (50/200)
      </Text>
      
      <TouchableOpacity 
        onPress={handleRun}
        activeOpacity={0.7}
        style={[styles.button, compact ? styles.buttonCompact : styles.buttonNormal]}
      >
        <Text style={[styles.buttonText, compact ? styles.buttonTextCompact : styles.buttonTextNormal]}>
          執行回測
        </Text>
      </TouchableOpacity>

      {result && (
        <View style={[styles.resultContainer, compact ? styles.resultContainerCompact : styles.resultContainerNormal]}>
          <View style={[styles.row, compact ? styles.rowCompact : styles.rowNormal]}>
            <Text style={[styles.labelText, compact ? styles.textCompact : styles.textNormal]}>總報酬:</Text>
            <Text style={[styles.valueText, compact ? styles.textCompact : styles.textNormal]}>
              {result.totalReturn.toFixed(2)}%
            </Text>
          </View>
          <View style={[styles.row, compact ? styles.rowCompact : styles.rowNormal]}>
            <Text style={[styles.labelText, compact ? styles.textCompact : styles.textNormal]}>最大回撤:</Text>
            <Text style={[styles.valueText, compact ? styles.textCompact : styles.textNormal]}>
              {result.maxDrawdown.toFixed(2)}%
            </Text>
          </View>
          <View style={[styles.row, compact ? styles.rowCompact : styles.rowNormal]}>
            <Text style={[styles.labelText, compact ? styles.textCompact : styles.textNormal]}>交易次數:</Text>
            <Text style={[styles.valueText, compact ? styles.textCompact : styles.textNormal]}>
              {result.totalTrades}
            </Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    backgroundColor: '#1e1e1e',
    borderColor: '#333333',
    borderWidth: 1,
  },
  containerCompact: {
    padding: 8,
  },
  containerNormal: {
    padding: 16,
  },
  title: {
    fontWeight: 'bold',
    color: '#ffffff',
  },
  titleCompact: {
    fontSize: 14,
    marginBottom: 8,
  },
  titleNormal: {
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: {
    paddingVertical: 6,
  },
  buttonNormal: {
    paddingVertical: 10,
  },
  buttonText: {
    color: '#34d399',
    fontWeight: 'bold',
  },
  buttonTextCompact: {
    fontSize: 12,
  },
  buttonTextNormal: {
    fontSize: 14,
  },
  resultContainer: {
    opacity: 0.7,
  },
  resultContainerCompact: {
    marginTop: 8,
  },
  resultContainerNormal: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowCompact: {
    marginBottom: 4,
  },
  rowNormal: {
    marginBottom: 8,
  },
  labelText: {
    color: '#ffffff',
  },
  valueText: {
    color: '#ffffff',
  },
  textCompact: {
    fontSize: 12,
  },
  textNormal: {
    fontSize: 14,
  },
});

export const BacktestPanel = memo(BacktestPanelInner);
