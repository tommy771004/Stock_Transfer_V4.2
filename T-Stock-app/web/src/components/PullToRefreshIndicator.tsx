import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Animated, Easing, Platform, SafeAreaView } from 'react-native';
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

export const PriceBar: React.FC<PriceBarProps> = React.memo(
  ({ symbol, twse, loading, price, isUp, change, pct, high, low, vol, focusMode, setFocusMode, onSetAlert, loadData }) => {
    const { settings } = useSettings();
    const compact = settings.compactMode;
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertVal, setAlertVal] = useState('');
    const alertInputRef = useRef<TextInput>(null);
    const modalAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (alertOpen) {
        requestAnimationFrame(() => alertInputRef.current?.focus?.());
        Animated.timing(modalAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      } else {
        modalAnim.setValue(0);
      }
    }, [alertOpen, modalAnim]);

    const handleAlertSubmit = () => {
      const target = parseFloat(alertVal);
      if (!isNaN(target) && target > 0) {
        onSetAlert(symbol, target);
        setAlertOpen(false);
        setAlertVal('');
      }
    };

    return (
      <SafeAreaView>
        <View style={[styles.card, compact ? styles.cardCompact : styles.cardRegular]}>
          <View style={[styles.leftRow, compact ? styles.gapSm : styles.gapMd]}>
            <Text style={[styles.symbol, compact ? styles.symbolCompact : styles.symbolRegular]}>{symbol}</Text>
            {twse && <Text style={[styles.badge, compact ? styles.badgeCompact : styles.badgeRegular]}>TWSE</Text>}

            {loading ? (
              <View style={styles.inlineRow}>
                <View style={[styles.pulse, compact ? styles.pulsePriceCompact : styles.pulsePriceRegular]} />
                <Loader2 size={compact ? 16 : 20} color="rgba(255,255,255,0.5)" />
              </View>
            ) : price != null ? (
              <View style={styles.inlineRow}>
                <Text style={[styles.price, compact ? styles.priceCompact : styles.priceRegular, isUp ? styles.up : styles.down]}>{safeN(price)}</Text>
                {isUp ? <TrendingUp size={compact ? 16 : 18} color="#34d399" /> : <TrendingDown size={compact ? 16 : 18} color="#fb7185" />}
              </View>
            ) : null}

            {!loading && change != null && (
              <Text style={[styles.change, compact ? styles.changeCompact : styles.changeRegular, isUp ? styles.up : styles.down]}>
                {isUp ? '+' : ''}
                {safeN(change)} ({isUp ? '+' : ''}
                {safeN(pct)}%)
              </Text>
            )}

            {loading && <View style={[styles.pulse, compact ? styles.pulseChangeCompact : styles.pulseChangeRegular]} />}
          </View>

          <View style={[styles.rightRow, compact ? styles.gapSm : styles.gapMd]}>
            {high != null && (
              <Text style={[styles.metaText, compact ? styles.metaCompact : styles.metaRegular]}>
                高 <Text style={styles.up}>{safeN(high)}</Text>
              </Text>
            )}
            {low != null && (
              <Text style={[styles.metaText, compact ? styles.metaCompact : styles.metaRegular]}>
                低 <Text style={styles.down}>{safeN(low)}</Text>
              </Text>
            )}
            {vol != null && !isNaN(Number(vol)) && (
              <Text style={[styles.metaText, compact ? styles.metaCompact : styles.metaRegular]}>
                量{' '}
                <Text style={styles.metaValue}>
                  {Number(vol) >= 1e6 ? `${(Number(vol) / 1e6).toFixed(1)}M` : Number(vol).toLocaleString()}
                </Text>
              </Text>
            )}

            <TouchableOpacity
              onPress={() => setFocusMode(!focusMode)}
              accessibilityLabel="專注模式"
              accessibilityState={{ pressed: focusMode }}
              style={[styles.actionBtn, compact ? styles.actionBtnCompact : styles.actionBtnRegular, focusMode ? styles.focusActive : styles.focusInactive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionText, focusMode ? styles.focusTextActive : styles.focusTextInactive]}>✨ 專注</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setAlertVal(String(price ?? ''));
                setAlertOpen(true);
              }}
              accessibilityLabel="設定價格警示"
              style={[styles.actionBtn, compact ? styles.actionBtnCompact : styles.actionBtnRegular, styles.actionBtnMuted]}
              activeOpacity={0.8}
            >
              <Text style={styles.actionTextMuted}>🔔 警示</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={loadData}
              disabled={loading}
              accessibilityLabel="重新載入資料"
              style={[styles.actionBtn, compact ? styles.actionBtnCompact : styles.actionBtnRegular, styles.actionBtnMuted, loading && styles.disabled]}
              activeOpacity={0.8}
            >
              <RefreshCw size={compact ? 12 : 14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={alertOpen} transparent animationType="none" onRequestClose={() => setAlertOpen(false)}>
          <View style={styles.backdrop}>
            <Animated.View
              style={[
                styles.modalCard,
                {
                  opacity: modalAnim,
                  transform: [
                    {
                      scale: modalAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.95, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>設定價格警示</Text>
                <TouchableOpacity onPress={() => setAlertOpen(false)} style={styles.closeBtn} accessibilityLabel="關閉" activeOpacity={0.8}>
                  <X size={16} color="#a1a1aa" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubText}>
                {symbol} · 當前價格: {safeN(price)}
              </Text>

              <Text style={styles.modalLabel}>目標價格</Text>
              <TextInput
                ref={alertInputRef}
                value={alertVal}
                onChangeText={setAlertVal}
                onSubmitEditing={handleAlertSubmit}
                placeholder="輸入目標價格"
                placeholderTextColor="#71717a"
                keyboardType="numeric"
                returnKeyType="done"
                style={styles.input}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setAlertOpen(false)} style={[styles.modalBtn, styles.cancelBtn]} activeOpacity={0.85}>
                  <Text style={styles.cancelBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAlertSubmit} style={[styles.modalBtn, styles.confirmBtn]} activeOpacity={0.85}>
                  <Text style={styles.confirmBtnText}>確認設定</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }
);

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(18,18,24,0.88)',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardCompact: {
    padding: 8,
  },
  cardRegular: {
    padding: 12,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  gapSm: { columnGap: 8, rowGap: 8 },
  gapMd: { columnGap: 16, rowGap: 8 },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  symbol: {
    fontWeight: '900',
    color: '#f4f4f5',
  },
  symbolCompact: { fontSize: 18 },
  symbolRegular: { fontSize: 24 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.2)',
    color: '#34d399',
    overflow: 'hidden',
  },
  badgeCompact: { fontSize: 11 },
  badgeRegular: { fontSize: 12 },
  price: {
    fontWeight: '900',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  priceCompact: { fontSize: 20 },
  priceRegular: { fontSize: 28 },
  change: {
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  changeCompact: { fontSize: 12 },
  changeRegular: { fontSize: 14 },
  up: { color: '#34d399' },
  down: { color: '#fb7185' },
  pulse: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 6,
  },
  pulsePriceCompact: { width: 64, height: 24 },
  pulsePriceRegular: { width: 96, height: 32 },
  pulseChangeCompact: { width: 80, height: 16 },
  pulseChangeRegular: { width: 112, height: 20 },
  metaText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  metaCompact: { fontSize: 11 },
  metaRegular: { fontSize: 13 },
  metaValue: { color: '#f4f4f5' },
  actionBtn: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnCompact: { padding: 4 },
  actionBtnRegular: { padding: 6 },
  actionBtnMuted: { opacity: 0.6 },
  actionText: {
    fontSize: 12,
    color: '#f4f4f5',
  },
  actionTextMuted: {
    fontSize: 12,
    color: '#f4f4f5',
    opacity: 0.6,
  },
  focusActive: {
    backgroundColor: 'rgba(16,185,129,0.2)',
  },
  focusInactive: {
    backgroundColor: 'transparent',
  },
  focusTextActive: { color: '#34d399' },
  focusTextInactive: { color: '#f4f4f5' },
  disabled: {
    opacity: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 16,
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
    color: '#f4f4f5',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
  },
  modalSubText: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#a1a1aa',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#f4f4f5',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    columnGap: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  confirmBtn: {
    backgroundColor: '#10b981',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f4f4f5',
    opacity: 0.7,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
});
