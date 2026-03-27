import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Linking,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Loader2, ArrowRight, Zap } from 'lucide-react-native';
import Decimal from 'decimal.js';
import { useSettings } from '../contexts/SettingsContext';
import { NewsItem, Order, SentimentData } from '../types';
import { safeN } from '../utils/helpers';

interface RightPanelProps {
  price: number | null;
  symbol: string;
  news: NewsItem[];
  newsStatus: 'idle' | 'loading' | 'error';
  sentiment: SentimentData | null;
  tab: 'news' | 'calendar' | 'mtf';
  setTab: (tab: 'news' | 'calendar' | 'mtf') => void;
  eDateFmt: string | null;
  chat: string;
  setChat: (chat: string) => void;
  chatRep: string;
  chatStatus: 'idle' | 'busy';
  handleChat: () => void;
  oSide: 'buy' | 'sell';
  setOSide: (side: 'buy' | 'sell') => void;
  orderQty: number;
  setOrderQty: (qty: number) => void;
  isUp: boolean;
  onGoBacktest?: (sym: string) => void;
  executeOrder: (symbol: string, side: 'buy' | 'sell', qty: number, price: number) => void;
  mtfData: Record<string, string> | null;
  mtfStatus: 'idle' | 'loading' | 'error';
  portfolio: Order[];
  orderStatus?: 'idle' | 'busy';
}

export const RightPanel: React.FC<RightPanelProps> = React.memo(
  ({
    price,
    symbol,
    news,
    sentiment,
    newsStatus,
    tab,
    setTab,
    eDateFmt,
    chat,
    setChat,
    chatRep,
    chatStatus,
    handleChat,
    oSide,
    setOSide,
    orderQty,
    setOrderQty,
    isUp,
    onGoBacktest,
    executeOrder,
    mtfData,
    mtfStatus,
    portfolio,
    orderStatus,
  }) => {
    const { settings } = useSettings();
    const compact = settings.compactMode;

    const totalValue = portfolio.reduce((acc, order) => {
      const p = Number(order?.price) || 0;
      const q = Number(order?.qty) || 0;
      const value = isFinite(p) && isFinite(q) ? new Decimal(p).times(q).toNumber() : 0;
      return acc + (order?.side === 'sell' ? -value : value);
    }, 0);

    const renderNewsItem = ({ item, index }: { item: NewsItem; index: number }) => (
      <TouchableOpacity
        key={`${item.link}-${index}`}
        onPress={() => Linking.openURL(item.link)}
        activeOpacity={0.8}
        style={[styles.newsItem, compact ? styles.p1 : styles.p2]}
      >
        <Text style={[styles.newsTitle, compact ? styles.textXs : styles.textSm]} numberOfLines={2}>
          {item.title}
        </Text>
      </TouchableOpacity>
    );

    const sentimentValue = sentiment
      ? typeof sentiment === 'object'
        ? sentiment.overall
        : String(sentiment)
      : '';

    const sStr = sentimentValue.toLowerCase();
    const isBull = sStr.includes('bullish') || sStr.includes('樂觀');
    const isBear = sStr.includes('bearish') || sStr.includes('悲觀');

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, compact ? styles.gap1 : styles.gap3]}>
          <View style={[styles.card, compact ? styles.p2 : styles.p4]}>
            <View style={styles.rowBetweenStart}>
              <View>
                <Text style={[styles.metaLabel, compact ? styles.labelMeta : styles.textXs]}>
                  Portfolio Value
                </Text>
                <Text style={[styles.portfolioValue, compact ? styles.textLg : styles.text2xl]}>
                  NT$ {totalValue.toLocaleString()}
                </Text>
              </View>

              {sentiment ? (
                <View
                  style={[
                    styles.sentimentBox,
                    isBull
                      ? styles.sentimentBull
                      : isBear
                        ? styles.sentimentBear
                        : styles.sentimentNeutral,
                  ]}
                >
                  <Text style={[styles.metaLabel, compact ? styles.labelMeta : styles.textXs]}>
                    Sentiment
                  </Text>
                  <Text
                    style={[
                      styles.sentimentText,
                      compact ? styles.textSm : styles.textBase,
                      isBull ? styles.textBull : isBear ? styles.textBear : styles.textNeutral,
                    ]}
                  >
                    {sentimentValue}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.card, compact ? styles.p2 : styles.p4, styles.flex1]}>
            <View style={[styles.tabRow, compact ? styles.textXs : styles.textSm]}>
              {(['news', 'calendar', 'mtf'] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.8} style={styles.tabBtn}>
                  <Text
                    style={[
                      styles.tabText,
                      tab === t ? styles.tabActive : styles.tabInactive,
                    ]}
                  >
                    {t === 'news' ? 'News' : t === 'calendar' ? 'Calendar' : 'MTF'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.contentArea}>
              {tab === 'news' ? (
                <View style={styles.listCol}>
                  {newsStatus === 'loading' ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#a1a1aa" />
                      <Text style={styles.textXs}>載入新聞中...</Text>
                    </View>
                  ) : newsStatus === 'error' ? (
                    <Text style={[styles.errorText, styles.textXs]}>新聞載入失敗</Text>
                  ) : news.length > 0 ? (
                    <FlatList
                      data={news}
                      keyExtractor={(item, index) => `${item.link}-${index}`}
                      renderItem={renderNewsItem}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.flatListContent}
                    />
                  ) : (
                    <Text style={[styles.mutedText, styles.textXs, styles.centerText, styles.mt4]}>無新聞</Text>
                  )}
                </View>
              ) : tab === 'mtf' ? (
                <View style={styles.listCol}>
                  {mtfStatus === 'loading' ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#a1a1aa" />
                      <Text style={styles.textXs}>分析多時框中...</Text>
                    </View>
                  ) : mtfStatus === 'error' ? (
                    <Text style={[styles.errorText, styles.textXs]}>MTF 分析失敗</Text>
                  ) : mtfData ? (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.flatListContent}>
                      {Object.entries(mtfData).map(([tf, signal]) => (
                        <View key={tf} style={[styles.mtfRow, compact ? styles.p1 : styles.p2]}>
                          <Text style={[styles.mtfTf, compact ? styles.textXs : styles.textSm]}>{tf}</Text>
                          <View
                            style={[
                              styles.signalPill,
                              signal === 'bullish'
                                ? styles.signalBull
                                : signal === 'bearish'
                                  ? styles.signalBear
                                  : styles.signalNeutral,
                            ]}
                          >
                            <Text style={[styles.signalText, compact ? styles.textXs : styles.textSm]}>
                              {signal === 'bullish' ? '偏多' : signal === 'bearish' ? '偏空' : '中性'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={[styles.mutedText, styles.textXs, styles.centerText, styles.mt4]}>無資料</Text>
                  )}
                </View>
              ) : (
                <View style={styles.listCol}>
                  {eDateFmt ? (
                    <View style={styles.calendarCard}>
                      <Text style={[styles.calendarTitle, compact ? styles.textXs : styles.textSm]}>
                        財報發布
                      </Text>
                      <View style={styles.rowBetween}>
                        <Text style={styles.mutedText}>日期</Text>
                        <Text style={styles.monoText}>{eDateFmt}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.mutedText, styles.textXs, styles.centerText, styles.mt4]}>無日曆事件</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          <View style={[styles.chatWrap, compact ? styles.mt1 : styles.mt2]}>
            {(chatRep || chatStatus === 'busy') && (
              <View style={[styles.chatBox, compact ? styles.textXs : styles.textSm]}>
                {chatStatus === 'busy' ? (
                  <View style={styles.chatBusyRow}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.chatBusyText}>思考中…</Text>
                  </View>
                ) : (
                  <Text style={[styles.textColor]}>{chatRep}</Text>
                )}
              </View>
            )}

            <View style={styles.inputWrap}>
              <TextInput
                value={chat}
                onChangeText={setChat}
                onSubmitEditing={handleChat}
                placeholder="詢問 AI 策略…"
                placeholderTextColor="#71717a"
                style={[
                  styles.input,
                  compact ? styles.py15 : styles.py2,
                  compact ? styles.textXs : styles.textSm,
                ]}
                returnKeyType="send"
              />
              <TouchableOpacity
                onPress={handleChat}
                disabled={chatStatus === 'busy'}
                activeOpacity={0.85}
                style={[
                  styles.sendBtn,
                  compact ? styles.btn7 : styles.btn8,
                  chatStatus === 'busy' ? styles.btnBusy : styles.btnReady,
                ]}
              >
                {chatStatus === 'busy' ? (
                  <Loader2 size={14} color="#000000" />
                ) : (
                  <ArrowRight size={14} color="#000000" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.orderPanel, compact ? styles.p2 : styles.p3]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.orderTitle, compact ? styles.labelMeta : styles.textXs]}>下單面板</Text>
              <View style={styles.sideToggle}>
                {(['buy', 'sell'] as const).map((s) => (
                  <TouchableOpacity key={s} onPress={() => setOSide(s)} activeOpacity={0.8} style={styles.sideBtn}>
                    <Text
                      style={[
                        styles.sideText,
                        compact ? styles.textXs : styles.textSm,
                        oSide === s
                          ? s === 'buy'
                            ? styles.sideActiveBuy
                            : styles.sideActiveSell
                          : styles.sideInactive,
                      ]}
                    >
                      {s === 'buy' ? '買進' : '賣出'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.orderDetails, compact ? styles.textXs : styles.textSm]}>
              <View style={styles.rowBetween}>
                <Text style={styles.mutedText}>現價</Text>
                <Text style={[styles.monoBold, isUp ? styles.textBull : styles.textBear]}>{safeN(price)}</Text>
              </View>

              <TextInput
                value={String(orderQty)}
                onChangeText={(value) => setOrderQty(Math.max(1, Number(value)))}
                keyboardType="numeric"
                placeholder="委託數量"
                placeholderTextColor="#71717a"
                style={[
                  styles.qtyInput,
                  compact ? styles.textXs : styles.textSm,
                ]}
              />

              <View style={styles.rowBetween}>
                <Text style={styles.mutedText}>預估金額</Text>
                <Text style={styles.monoText}>
                  {price && isFinite(Number(price)) && isFinite(orderQty)
                    ? `$${(Number(price) * orderQty).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : '—'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => price && executeOrder(symbol, oSide, orderQty, price)}
                disabled={orderStatus === 'busy' || !price}
                activeOpacity={0.85}
                style={[
                  styles.executeBtn,
                  compact ? styles.py15 : styles.py2,
                  oSide === 'buy' ? styles.executeBuy : styles.executeSell,
                  (orderStatus === 'busy' || !price) ? styles.btnDisabled : null,
                ]}
              >
                {orderStatus === 'busy' ? <Loader2 size={16} color="#000000" /> : <Zap size={16} color="#000000" />}
                <Text style={styles.executeText}>
                  {orderStatus === 'busy' ? '處理中...' : `AI 智能${oSide === 'buy' ? '買進' : '賣出'}`}
                </Text>
              </TouchableOpacity>

              {onGoBacktest ? (
                <TouchableOpacity
                  onPress={() => onGoBacktest(symbol)}
                  activeOpacity={0.85}
                  style={[
                    styles.backtestBtn,
                    compact ? styles.py15 : styles.py2,
                  ]}
                >
                  <Text style={[styles.backtestText, compact ? styles.textXs : styles.textSm]}>
                    📊 回測此標的
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }
);

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { width: '100%', flexDirection: 'column' },
  flex1: { flex: 1, minHeight: 0 },
  gap1: { gap: 4 },
  gap3: { gap: 12 },
  p1: { padding: 4 },
  p2: { padding: 8 },
  p3: { padding: 12 },
  p4: { padding: 16 },
  mt1: { marginTop: 4 },
  mt2: { marginTop: 8 },
  mt4: { marginTop: 16 },
  rowBetweenStart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { borderWidth: 1, borderColor: '#27272a', borderRadius: 12, backgroundColor: '#09090b' },
  metaLabel: { fontStyle: 'italic', textTransform: 'uppercase', opacity: 0.5, color: '#a1a1aa' },
  labelMeta: { fontSize: 10 },
  textXs: { fontSize: 12 },
  textSm: { fontSize: 14 },
  textBase: { fontSize: 16 },
  textLg: { fontSize: 18 },
  text2xl: { fontSize: 24 },
  portfolioValue: { fontWeight: '700', color: '#f4f4f5', letterSpacing: -0.5, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  sentimentBox: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  sentimentBull: { backgroundColor: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.1)' },
  sentimentBear: { backgroundColor: 'rgba(244,63,94,0.05)', borderColor: 'rgba(244,63,94,0.1)' },
  sentimentNeutral: { backgroundColor: 'rgba(113,113,122,0.05)', borderColor: 'rgba(113,113,122,0.1)' },
  sentimentText: { fontWeight: '700', lineHeight: 16, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  textBull: { color: '#34d399' },
  textBear: { color: '#fb7185' },
  textNeutral: { color: '#a1a1aa' },
  tabRow: { flexDirection: 'row', gap: 16, marginBottom: 8, flexShrink: 0 },
  tabBtn: {},
  tabText: { fontStyle: 'italic', textTransform: 'uppercase' },
  tabActive: { color: '#f4f4f5', opacity: 1 },
  tabInactive: { color: '#f4f4f5', opacity: 0.3 },
  contentArea: { flex: 1, minHeight: 0 },
  listCol: { flex: 1, gap: 4, minHeight: 0 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 8 },
  errorText: { color: '#fb7185', textAlign: 'center', paddingVertical: 32 },
  mutedText: { color: '#71717a' },
  centerText: { textAlign: 'center' },
  newsItem: { borderRadius: 12, backgroundColor: '#09090b' },
  newsTitle: { fontWeight: '700', color: '#f4f4f5', lineHeight: 18 },
  flatListContent: { gap: 4, paddingBottom: 4 },
  mtfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: '#09090b' },
  mtfTf: { fontWeight: '700', color: '#f4f4f5' },
  signalPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontWeight: '700' },
  signalText: { fontWeight: '700' },
  signalBull: { backgroundColor: 'rgba(16,185,129,0.15)' },
  signalBear: { backgroundColor: 'rgba(244,63,94,0.15)' },
  signalNeutral: { backgroundColor: '#27272a' },
  calendarCard: { backgroundColor: '#09090b', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#27272a' },
  calendarTitle: { fontWeight: '700', color: '#34d399', marginBottom: 4 },
  monoText: { color: '#f4f4f5', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  chatWrap: { flexShrink: 0, gap: 6 },
  chatBox: { color: '#f4f4f5', backgroundColor: '#09090b', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: '#27272a', maxHeight: 192 },
  chatBusyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatBusyText: { color: '#f4f4f5' },
  textColor: { color: '#f4f4f5' },
  inputWrap: { position: 'relative' },
  input: {
    width: '100%',
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 32,
    color: '#f4f4f5',
  },
  py15: { paddingVertical: 6 },
  py2: { paddingVertical: 8 },
  sendBtn: { position: 'absolute', right: 4, top: '50%', marginTop: -16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btn7: { width: 28, height: 28 },
  btn8: { width: 32, height: 32 },
  btnBusy: { transform: [{ scale: 0.95 }], backgroundColor: '#22c55e', opacity: 0.5 },
  btnReady: { backgroundColor: '#22c55e' },
  orderPanel: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', flexShrink: 0 },
  orderTitle: { fontWeight: '700', color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 },
  sideToggle: { flexDirection: 'row', gap: 2, backgroundColor: '#09090b', borderRadius: 8, padding: 2 },
  sideBtn: {},
  sideText: { fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sideActiveBuy: { backgroundColor: '#22c55e', color: '#000000' },
  sideActiveSell: { backgroundColor: '#f43f5e', color: '#ffffff' },
  sideInactive: { color: '#71717a' },
  orderDetails: { gap: 6 },
  monoBold: { fontWeight: '700', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  qtyInput: {
    width: '100%',
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#f4f4f5',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  executeBtn: { width: '100%', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  executeBuy: { backgroundColor: '#22c55e' },
  executeSell: { backgroundColor: '#f43f5e' },
  executeText: { fontWeight: '700', color: '#000000' },
  btnDisabled: { opacity: 0.5 },
  backtestBtn: {
    width: '100%',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  backtestText: { fontWeight: '700', color: '#fcd34d' },
});
