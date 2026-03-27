import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, X } from 'lucide-react-native';
import { safeN } from '../utils/helpers';
import { useSettings } from '../contexts/SettingsContext';
import { TWSEData } from '../types';

interface PriceBarProps {
  symbol: string;
  twse: TWSEData | null;
  loading: boolean;
  price: number | null;
  isUp: boolean;
  change: number | null;
  pct: number | null;
  high: number | null;
  low: number | null;
  vol: number | null;
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  onSetAlert: (symbol: string, price: number) => void;
  loadData: () => void;
}

const AnimatedContainer = React.memo(({ children, style }: { children: React.ReactNode; style?: any }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
});

export const PriceBar: React.FC<PriceBarProps> = React.memo(
  ({ symbol, twse, loading, price, isUp, change, pct, high, low, vol, focusMode, setFocusMode, onSetAlert, loadData }) => {
    const { settings } = useSettings();
    const compact = settings.compactMode;
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertVal, setAlertVal] = useState('');
    const alertInputRef = useRef<TextInput>(null);

    useEffect(() => {
      if (alertOpen) {
        setTimeout(() => alertInputRef.current?.focus(), 50);
      }
    }, [alertOpen]);

    const handleAlertSubmit = () => {
      const target = parseFloat(alertVal);
      if (!isNaN(target) && target > 0) {
        onSetAlert(symbol, target);
        setAlertOpen(false);
        setAlertVal('');
      }
    };

    const volumeText =
      vol != null && !isNaN(Number(vol))
        ? Number(vol) >= 1e6
          ? `${(Number(vol) / 1e6).toFixed(1)}M`
          : Number(vol).toLocaleString()
        : null;

    return (
      <>
        <AnimatedContainer style={styles.container}>
          <View
            style={[
              styles.bar,
              compact ? styles.barCompact : styles.barRegular,
            ]}
          >
            <View
              style={[
                styles.leftRow,
                compact ? styles.leftRowCompact : styles.leftRowRegular,
              ]}
            >
              <Text style={[styles.symbol, compact ? styles.symbolCompact : styles.symbolRegular]}>{symbol}</Text>
              {twse ? <Text style={[styles.twseBadge, compact && styles.twseBadgeCompact]}>TWSE</Text> : null}

              {loading ? (
                <View style={styles.loadingRow}>
                  <View style={[styles.pulse, compact ? styles.pulsePriceCompact : styles.pulsePriceRegular]} />
                  <ActivityIndicator size={compact ? 'small' : 'small'} color="rgba(255,255,255,0.5)" />
                </View>
              ) : price != null ? (
                <View style={styles.loadingRow}>
                  <Text
                    style={[
                      styles.price,
                      compact ? styles.priceCompact : styles.priceRegular,
                      isUp ? styles.up : styles.down,
                    ]}
                  >
                    {safeN(price)}
                  </Text>
                  {isUp ? (
                    <TrendingUp size={compact ? 16 : 18} color="#34d399" />
                  ) : (
                    <TrendingDown size={compact ? 16 : 18} color="#fb7185" />
                  )}
                </View>
              ) : null}

              {!loading && change != null ? (
                <Text
                  style={[
                    styles.change,
                    compact ? styles.changeCompact : styles.changeRegular,
                    isUp ? styles.up : styles.down,
                  ]}
                >
                  {isUp ? '+' : ''}
                  {safeN(change)} ({isUp ? '+' : ''}
                  {safeN(pct)}%)
                </Text>
              ) : null}

              {loading ? <View style={[styles.pulse, compact ? styles.pulseChangeCompact : styles.pulseChangeRegular]} /> : null}
            </View>

            <View
              style={[
                styles.rightRow,
                compact ? styles.rightRowCompact : styles.rightRowRegular,
              ]}
            >
              {high != null ? (
                <Text style={compact ? styles.metaCompact : styles.metaRegular}>
                  高 <Text style={styles.highText}>{safeN(high)}</Text>
                </Text>
              ) : null}
              {low != null ? (
                <Text style={compact ? styles.metaCompact : styles.metaRegular}>
                  低 <Text style={styles.lowText}>{safeN(low)}</Text>
                </Text>
              ) : null}
              {volumeText != null ? (
                <Text style={compact ? styles.metaCompact : styles.metaRegular}>
                  量 <Text style={styles.metaValue}>{volumeText}</Text>
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={() => setFocusMode(!focusMode)}
                accessibilityLabel="專注模式"
                accessibilityRole="button"
                accessibilityState={{ selected: focusMode }}
                style={[
                  styles.actionButton,
                  compact ? styles.actionButtonCompact : styles.actionButtonRegular,
                  focusMode ? styles.focusActive : styles.focusInactive,
                ]}
              >
                <Text style={[styles.actionText, focusMode && styles.focusText]}>✨ 專注</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setAlertVal(String(price ?? ''));
                  setAlertOpen(true);
                }}
                accessibilityLabel="設定價格警示"
                accessibilityRole="button"
                style={[styles.actionButton, compact ? styles.actionButtonCompact : styles.actionButtonRegular, styles.focusInactive]}
              >
                <Text style={styles.actionText}>🔔 警示</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={loadData}
                disabled={loading}
                accessibilityLabel="重新載入資料"
                accessibilityRole="button"
                style={[styles.actionButton, compact ? styles.actionButtonCompact : styles.actionButtonRegular, styles.focusInactive, loading && styles.disabledButton]}
              >
                {loading ? <Loader2 size={compact ? 12 : 14} color="rgba(255,255,255,0.6)" /> : <RefreshCw size={compact ? 12 : 14} color="rgba(255,255,255,0.6)" />}
              </TouchableOpacity>
            </View>
          </View>
        </AnimatedContainer>

        <Modal visible={alertOpen} transparent animationType="fade" onRequestClose={() => setAlertOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setAlertOpen(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>設定價格警示</Text>
                <TouchableOpacity onPress={() => setAlertOpen(false)} style={styles.closeButton} accessibilityLabel="關閉">
                  <X size={16} color="#a1a1aa" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubtitle}>
                {symbol} · 當前價格: {safeN(price)}
              </Text>

              <Text style={styles.inputLabel}>目標價格</Text>
              <TextInput
                ref={alertInputRef}
                value={alertVal}
                onChangeText={setAlertVal}
                onSubmitEditing={handleAlertSubmit}
                placeholder="輸入目標價格"
                placeholderTextColor="#71717a"
                keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                returnKeyType="done"
                style={styles.input}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setAlertOpen(false)} style={[styles.modalActionButton, styles.cancelButton]}>
                  <Text style={styles.cancelButtonText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAlertSubmit} style={[styles.modalActionButton, styles.confirmButton]}>
                  <Text style={styles.confirmButtonText}>確認設定</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  bar: {
    backgroundColor: 'var(--card-bg)',
    borderColor: 'var(--border-color)',
    borderWidth: 1,
    borderRadius: 24,
    flexShrink: 0,
    justifyContent: 'space-between',
  },
  barCompact: {
    padding: 8,
    gap: 8,
    flexDirection: 'column',
  },
  barRegular: {
    padding: 12,
    gap: 8,
    flexDirection: 'column',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  leftRowCompact: {
    gap: 8,
  },
  leftRowRegular: {
    gap: 12,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rightRowCompact: {
    gap: 8,
  },
  rightRowRegular: {
    gap: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  symbol: {
    fontWeight: '900',
    color: 'var(--text-color)',
  },
  symbolCompact: {
    fontSize: 18,
  },
  symbolRegular: {
    fontSize: 24,
  },
  twseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#34d399',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    overflow: 'hidden',
    fontSize: 12,
  },
  twseBadgeCompact: {
    fontSize: 11,
  },
  price: {
    fontWeight: '900',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  priceCompact: {
    fontSize: 20,
  },
  priceRegular: {
    fontSize: 30,
  },
  up: {
    color: '#34d399',
  },
  down: {
    color: '#fb7185',
  },
  change: {
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  changeCompact: {
    fontSize: 12,
  },
  changeRegular: {
    fontSize: 14,
  },
  pulse: {
    backgroundColor: 'var(--border-color)',
    borderRadius: 4,
  },
  pulsePriceCompact: {
    width: 64,
    height: 24,
  },
  pulsePriceRegular: {
    width: 96,
    height: 32,
  },
  pulseChangeCompact: {
    width: 80,
    height: 16,
  },
  pulseChangeRegular: {
    width: 112,
    height: 20,
  },
  metaCompact: {
    color: 'var(--text-color)',
    opacity: 0.6,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
  },
  metaRegular: {
    color: 'var(--text-color)',
    opacity: 0.6,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
  },
  highText: {
    color: '#34d399',
  },
  lowText: {
    color: '#fb7185',
  },
  metaValue: {
    color: 'var(--text-color)',
  },
  actionButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonCompact: {
    padding: 4,
  },
  actionButtonRegular: {
    padding: 6,
  },
  actionText: {
    color: 'var(--text-color)',
    opacity: 0.6,
  },
  focusActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  focusInactive: {
    backgroundColor: 'transparent',
  },
  focusText: {
    color: '#34d399',
    opacity: 1,
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'var(--card-bg)',
    borderWidth: 1,
    borderColor: 'var(--border-color)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'var(--text-color)',
  },
  closeButton: {
    padding: 4,
    borderRadius: 8,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#a1a1aa',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    backgroundColor: 'var(--bg-color)',
    borderColor: 'var(--border-color)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: 'var(--text-color)',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalActionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'var(--border-color)',
  },
  confirmButton: {
    backgroundColor: '#10b981',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'var(--text-color)',
    opacity: 0.7,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
});
