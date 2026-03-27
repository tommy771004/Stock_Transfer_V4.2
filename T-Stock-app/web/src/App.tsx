import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  Dimensions, BackHandler, Modal, SafeAreaView, Platform, StatusBar
} from 'react-native';
import {
  LayoutDashboard, Zap, FlaskConical, Activity, Wallet, BookOpen,
  Terminal, Settings as SettingsIcon, Target,
  Menu, BarChart2, Cpu, ChevronDown, Search, Moon, Sun, User
} from 'lucide-react-native';
import { MODELS } from './constants';
import { useDeviceType } from './hooks/useDeviceType';

import { ErrorBoundary } from './components/ErrorBoundary';
import MarketOverview from './components/MarketOverview';
import TradingCore    from './components/TradingCore';
import BacktestPage  from './components/BacktestPage';
import StrategyLab   from './components/StrategyLab';
import Portfolio     from './components/Portfolio';
import TradeJournal  from './components/TradeJournal';
import SystemLogs    from './components/SystemLogs';
import Settings      from './components/Settings';
import SentimentPage from './components/SentimentPage';
import StockScreener from './components/StockScreener';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './contexts/ToastContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { MarketDataProvider, useMarketData } from './contexts/MarketDataContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import PricingModal  from './components/PricingModal';
import { NotificationProvider } from './components/NotificationCenter';
import { NotificationBell }     from './components/NotificationCenter';
import NotificationCenter       from './components/NotificationCenter';
import { IS_MOBILE_WEBVIEW }    from './services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_DESKTOP = SCREEN_WIDTH >= 768;

class AppErrorBoundary extends React.Component<{children:React.ReactNode},{hasError:boolean;error:unknown}> {
  constructor(props: {children:React.ReactNode}) { super(props); this.state={hasError:false,error:null}; }
  static getDerivedStateFromError(e: unknown) { return {hasError:true,error:e}; }
  render() {
    if (this.state.hasError) return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>⚠️ 系統崩潰</Text>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{String(this.state.error)}</Text>
        </View>
        <TouchableOpacity onPress={()=>this.setState({hasError:false, error:null})} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>強制重新整理</Text>
        </TouchableOpacity>
      </View>
    );
    return this.props.children;
  }
}

type Page   = 'market'|'trading'|'backtest'|'strategy'|'portfolio'|'journal'|'logs'|'settings'|'sentiment'|'screener';
type TopTab = 'markets'|'orders'|'analytics';

const NAV: {id:Page;icon:React.ElementType;label:string;topTab:TopTab;shortcut?:string}[] = [
  {id:'market',   icon:LayoutDashboard, label:'市場總覽',     topTab:'markets',   shortcut:'M'},
  {id:'trading',  icon:Zap,             label:'Trading Core', topTab:'markets',   shortcut:'T'},
  {id:'backtest', icon:BarChart2,       label:'回測引擎',     topTab:'analytics', shortcut:'B'},
  {id:'strategy',  icon:FlaskConical,    label:'策略實驗室',   topTab:'analytics'},
  {id:'sentiment', icon:Activity,        label:'市場情緒',     topTab:'analytics', shortcut:'S'},
  {id:'screener',  icon:Target,         label:'智慧選股',     topTab:'analytics', shortcut:'X'},
  {id:'portfolio',icon:Wallet,          label:'投資組合',     topTab:'orders',    shortcut:'P'},
  {id:'journal',  icon:BookOpen,        label:'交易日誌',     topTab:'orders',    shortcut:'J'},
  {id:'logs',     icon:Terminal,        label:'系統配置',     topTab:'orders'},
  {id:'settings', icon:SettingsIcon,    label:'設定',         topTab:'orders'},
];
const TOP_TABS:{id:TopTab;label:string}[] = [
  {id:'markets',  label:'Markets'},
  {id:'orders',   label:'Orders'},
  {id:'analytics',label:'Analytics'},
];

const QUICK_NAVS = NAV.filter(item => item.shortcut);
const MOBILE_NAVS = NAV.filter(item => ['market', 'trading', 'backtest', 'portfolio', 'sentiment'].includes(item.id));

function MainApp() {
  const { tickers, latency, isOffline } = useMarketData();
  const { page, setPage, topTab, setTopTab } = useNavigation();
  const { settings, updateSetting } = useSettings();
  const set = (key: string, val: unknown) => updateSetting(key, val);
  const model = String(settings.defaultModel || MODELS[0].id);
  const setModel = (m: string) => set('defaultModel', m);
  const [modelOpen,  setModelOpen]  = useState(false);
  const [symbol,     setSymbol]     = useState('2330.TW');
  
  const [sidebar, setSidebar] = useState(() => {
    if (settings.sidebarDefaultState) {
      return settings.sidebarDefaultState !== 'collapsed';
    }
    return IS_DESKTOP;
  });
  const [notifOpen,  setNotifOpen]  = useState(false);
  
  const [searchOpen, setSearch]     = useState(false);
  const [searchQ,    setSearchQ]    = useState('');
  const { isMobile } = useDeviceType();

  useEffect(() => {
    if (settings.sidebarDefaultState) {
      const shouldBeOpen = settings.sidebarDefaultState !== 'collapsed';
      if (sidebar !== shouldBeOpen) {
        setTimeout(() => setSidebar(shouldBeOpen), 0);
      }
    }
  }, [settings.sidebarDefaultState, sidebar]);

  const goTrading = useCallback((sym:string)=>{
    setSymbol(sym);
    setPage('trading');
    setTopTab('markets');
  },[setPage, setTopTab]);

  const goBacktest = useCallback((sym:string)=>{
    setSymbol(sym);
    setPage('backtest');
    setTopTab('analytics');
  },[setPage, setTopTab]);

  const goJournal = useCallback((sym?:string)=>{
    if(sym) setSymbol(sym);
    setPage('journal');
    setTopTab('orders');
  },[setPage, setTopTab]);

  useEffect(()=>{
    const handleNativeBack = () => {
      if (page === 'market') {
        BackHandler.exitApp();
        return true;
      } else {
        setPage('market');
        setTopTab('markets');
        return true;
      }
    };
    BackHandler.addEventListener('hardwareBackPress', handleNativeBack);
    return ()=>{
      BackHandler.removeEventListener('hardwareBackPress', handleNativeBack);
    };
  },[page, setPage, setTopTab]);

  const handleTopTab=(tab:TopTab)=>{setTopTab(tab);const f=NAV.find(n=>n.topTab===tab);if(f)setPage(f.id); if(isMobile) setSidebar(false);};
  const handleNav=(item:typeof NAV[0])=>{setPage(item.id);setTopTab(item.topTab); if(isMobile) setSidebar(false);};
  const visibleNav=NAV.filter(n=>n.topTab===topTab);
  const activeLabel=NAV.find(n=>n.id===page)?.label??'';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={settings.theme === 'light' ? 'dark-content' : 'light-content'} backgroundColor="#0B0E14" />
      
      {/* Background Blobs */}
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />
      <View style={[styles.blob, styles.blob3]} />

      {/* Top Nav */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={()=>setSidebar(v=>!v)} style={styles.iconButton}>
            <Menu size={18} color="#94a3b8" />
          </TouchableOpacity>
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Zap size={18} color="#000" />
            </View>
            {IS_DESKTOP && (
              <Text style={styles.logoText}>QUANTUM<Text style={styles.logoTextHighlight}>AI</Text></Text>
            )}
          </View>
        </View>

        {IS_DESKTOP && (
          <View style={styles.topTabsContainer}>
            {TOP_TABS.map(t=>(
              <TouchableOpacity key={t.id} onPress={()=>handleTopTab(t.id)}
                style={[styles.topTabButton, topTab===t.id && styles.topTabButtonActive]}>
                <Text style={[styles.topTabText, topTab===t.id && styles.topTabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.headerRight}>
          {IS_DESKTOP && (
            <View style={styles.liveMarketBadge}>
              <View style={styles.liveMarketDot} />
              <Text style={styles.liveMarketText}>Live Market</Text>
            </View>
          )}

          {IS_DESKTOP && (
            <View style={styles.modelSelectorContainer}>
              <TouchableOpacity onPress={()=>setModelOpen(v=>!v)} style={styles.modelSelectorBtn}>
                <Cpu size={12} color="#818cf8" />
                <Text style={styles.modelSelectorText} numberOfLines={1}>
                  {String(MODELS.find(m=>m.id===model)?.label??model)}
                </Text>
                <ChevronDown size={10} color="#64748b" />
              </TouchableOpacity>
              {modelOpen && (
                <View style={styles.modelDropdown}>
                  {MODELS.map(m=>(
                    <TouchableOpacity key={m.id} onPress={()=>{setModel(m.id);setModelOpen(false);}}
                      style={[styles.modelDropdownItem, model===m.id && styles.modelDropdownItemActive]}>
                      <Text style={[styles.modelDropdownText, model===m.id && styles.modelDropdownTextActive]}>{m.label}</Text>
                      {model===m.id && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          <TouchableOpacity onPress={()=>setSearch(v=>!v)} style={styles.searchBtn}>
            <Search size={14} color="#94a3b8" />
            {IS_DESKTOP && <Text style={styles.searchBtnText}>搜尋</Text>}
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity onPress={()=>set('theme', settings.theme === 'light' ? 'dark' : 'light')} style={styles.iconButton}>
              {(settings.theme || 'dark') === 'light' ? <Moon size={18} color="#94a3b8" /> : <Sun size={18} color="#94a3b8" />}
            </TouchableOpacity>
            <NotificationBell onPress={() => setNotifOpen(v => !v)} />
          </View>

          <View style={styles.userAvatarWrapper}>
            <View style={styles.userAvatar}>
              <User size={16} color="#fff" />
            </View>
          </View>
        </View>
      </View>

      {/* Body */}
      <View style={styles.bodyContainer}>
        {/* Mobile Sidebar Overlay */}
        {!IS_DESKTOP && sidebar && (
          <TouchableOpacity style={styles.sidebarOverlay} onPress={() => setSidebar(false)} activeOpacity={1} />
        )}

        {/* Sidebar */}
        {(sidebar || IS_DESKTOP) && (
          <View style={[styles.sidebar, !sidebar && styles.sidebarCollapsed, !IS_DESKTOP && styles.sidebarMobile]}>
            {sidebar && (
              <View style={styles.sidebarHeader}>
                <View style={styles.sidebarAvatar}><Text style={styles.sidebarAvatarText}>A</Text></View>
                <View style={styles.sidebarUserInfo}>
                  <Text style={styles.sidebarUserName} numberOfLines={1}>Alpha Trader</Text>
                  <View style={styles.sidebarUserStatus}>
                    <View style={styles.sidebarUserStatusDot} />
                    <Text style={styles.sidebarUserStatusText}>AI CONNECTED</Text>
                  </View>
                </View>
              </View>
            )}
            <ScrollView style={styles.sidebarNav} showsVerticalScrollIndicator={false}>
              {(isMobile ? NAV : visibleNav).map(item=>{
                const Icon=item.icon, active=page===item.id;
                return (
                  <TouchableOpacity key={item.id} onPress={() => handleNav(item)}
                    style={[styles.navItem, active && styles.navItemActive]}>
                    <Icon size={18} color={active ? '#000' : '#64748b'} />
                    {(sidebar || isMobile) && <Text style={[styles.navItemText, active && styles.navItemTextActive]} numberOfLines={1}>{item.label}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {sidebar && (
              <View style={styles.sidebarFooter}>
                <Text style={styles.sidebarFooterText}>v4.1.0 · QUANTUM CORE</Text>
              </View>
            )}
          </View>
        )}

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Breadcrumbs */}
          <View style={styles.breadcrumbs}>
            <View style={styles.breadcrumbsLeft}>
              <Text style={styles.breadcrumbTextMuted}>{TOP_TABS.find(t=>t.id===topTab)?.label}</Text>
              <Text style={styles.breadcrumbSeparator}>/</Text>
              <Text style={styles.breadcrumbText}>{activeLabel}</Text>
              {page==='trading' && (
                <>
                  <Text style={styles.breadcrumbSeparator}>/</Text>
                  <Text style={styles.breadcrumbTextHighlight}>{symbol}</Text>
                </>
              )}
            </View>
            
            {!IS_DESKTOP && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileTickers}>
                {isOffline && (
                  <View style={styles.offlineBadge}>
                    <Text style={styles.offlineBadgeText}>● 離線</Text>
                  </View>
                )}
                {tickers.slice(0,4).map(t=>{
                  const up=t.pct>=0;
                  return (
                    <TouchableOpacity key={t.symbol} onPress={()=>goTrading(t.symbol)} style={styles.mobileTickerItem}>
                      <Text style={styles.mobileTickerSymbol}>{t.symbol.replace('-USD','').replace('^','')}</Text>
                      <Text style={[styles.mobileTickerPct, up ? styles.textEmerald : styles.textRose]}>
                        {up?'+':''}{(t.pct||0).toFixed(1)}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={styles.pageContainer}>
            {page==='market'    && <ErrorBoundary name="市場總覽"><MarketOverview onSelectSymbol={goTrading}/></ErrorBoundary>}
            {page==='trading'   && <ErrorBoundary name="Trading Core"><TradingCore model={model} symbol={symbol} onSymbolChange={setSymbol} onGoBacktest={goBacktest}/></ErrorBoundary>}
            {page==='backtest'  && <ErrorBoundary name="回測引擎"><BacktestPage initialSymbol={symbol}/></ErrorBoundary>}
            {page==='strategy'  && <ErrorBoundary name="策略實驗室"><StrategyLab /></ErrorBoundary>}
            {page==='sentiment' && <ErrorBoundary name="市場情緒"><SentimentPage model={model} symbol={symbol}/></ErrorBoundary>}
            {page==='screener'  && <ErrorBoundary name="智慧選股"><StockScreener onSelectSymbol={goTrading}/></ErrorBoundary>}
            {page==='portfolio' && <ErrorBoundary name="投資組合"><Portfolio onGoBacktest={goBacktest} onGoJournal={goJournal}/></ErrorBoundary>}
            {page==='journal'   && <ErrorBoundary name="交易日誌"><TradeJournal /></ErrorBoundary>}
            {page==='logs'      && <ErrorBoundary name="系統配置"><SystemLogs /></ErrorBoundary>}
            {page==='settings'  && <ErrorBoundary name="設定"><Settings /></ErrorBoundary>}
          </View>
        </View>
      </View>

      {/* Mobile Bottom Nav */}
      {!IS_DESKTOP && (
        <View style={styles.bottomNav}>
          {MOBILE_NAVS.map(item => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <TouchableOpacity key={item.id} onPress={() => {setPage(item.id as Page); setTopTab(item.topTab);}}
                style={[styles.bottomNavItem, active && styles.bottomNavItemActive]}>
                <Icon size={active ? 24 : 22} color={active ? '#34d399' : '#64748b'} />
                {active && <View style={styles.bottomNavActiveDot} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Global Search Modal */}
      <Modal visible={searchOpen} transparent animationType="fade" onRequestClose={()=>{setSearch(false);setSearchQ('');}}>
        <TouchableOpacity style={styles.searchModalOverlay} activeOpacity={1} onPress={()=>{setSearch(false);setSearchQ('');}}>
          <TouchableOpacity activeOpacity={1} style={styles.searchModalContent}>
            <View style={styles.searchInputContainer}>
              <Search size={16} color="#64748b" />
              <TextInput
                autoFocus
                value={searchQ}
                onChangeText={text => setSearchQ(text.toUpperCase())}
                onSubmitEditing={() => {
                  if(searchQ.trim()){
                    goTrading(searchQ.trim());
                    setSearch(false); setSearchQ('');
                  }
                }}
                placeholder="搜尋股票代碼… (AAPL, 2330.TW, BTC-USD)"
                placeholderTextColor="#475569"
                style={styles.searchInput}
              />
            </View>
            <View style={styles.searchShortcuts}>
              <Text style={styles.searchShortcutsTitle}>快速導覽</Text>
              {QUICK_NAVS.map(item => (
                <TouchableOpacity key={item.shortcut} onPress={()=>{handleNav(item);setSearch(false);setSearchQ('');}} style={styles.searchShortcutItem}>
                  <View style={styles.searchShortcutKey}><Text style={styles.searchShortcutKeyText}>{item.shortcut}</Text></View>
                  <Text style={styles.searchShortcutLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {searchQ.length > 0 && (
              <View style={styles.searchResultContainer}>
                <TouchableOpacity onPress={()=>{goTrading(searchQ.trim());setSearch(false);setSearchQ('');}} style={styles.searchResultItem}>
                  <View style={styles.searchResultIcon}><Zap size={13} color="#34d399" /></View>
                  <View style={styles.searchResultTextContainer}>
                    <Text style={styles.searchResultTitle}>查看 {searchQ}</Text>
                    <Text style={styles.searchResultDesc}>開啟 TradingCore 分析此代碼</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Notification Center */}
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* Footer (Desktop Only) */}
      {IS_DESKTOP && (
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerTextMuted}>LATENCY</Text>
            <Text style={styles.footerTextHighlight}>{latency}MS</Text>
            <View style={styles.footerDivider} />
            {isOffline ? (
              <View style={styles.footerStatus}>
                <View style={[styles.footerStatusDot, {backgroundColor: '#eab308'}]} />
                <Text style={[styles.footerStatusText, {color: '#eab308'}]}>OFFLINE MODE</Text>
              </View>
            ) : (
              <View style={styles.footerStatus}>
                <View style={[styles.footerStatusDot, {backgroundColor: '#34d399'}]} />
                <Text style={[styles.footerStatusText, {color: '#34d399'}]}>SYSTEM ONLINE</Text>
              </View>
            )}
          </View>
          <View style={styles.footerCenter}>
            {tickers.map(t=>{
              const up=t.pct>=0;
              return (
                <TouchableOpacity key={t.symbol} onPress={()=>goTrading(t.symbol)} style={styles.footerTicker}>
                  <Text style={styles.footerTickerSymbol}>{t.symbol.replace('-USD','').replace('^','')}</Text>
                  <Text style={[styles.footerTickerPct, up ? styles.textEmerald : styles.textRose]}>
                    {up?'+':''}{(t.pct||0).toFixed(1)}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.footerCopyright}>© 2026 QUANTUM AI</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <SubscriptionProvider>
            <ToastProvider>
              <NotificationProvider>
                <MarketDataProvider>
                  <NavigationProvider>
                    <MainApp/>
                    <PricingModal />
                  </NavigationProvider>
                </MarketDataProvider>
              </NotificationProvider>
            </ToastProvider>
          </SubscriptionProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  blob: { position: 'absolute', borderRadius: 9999, opacity: 0.2 },
  blob1: { width: 300, height: 300, backgroundColor: '#10b981', top: -50, left: -50 },
  blob2: { width: 400, height: 400, backgroundColor: '#3b82f6', bottom: -50, right: -50 },
  blob3: { width: 250, height: 250, backgroundColor: '#a855f7', top: '20%', right: '10%', opacity: 0.1 },
  
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(11,14,20,0.8)', zIndex: 50 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { width: 32, height: 32, backgroundColor: '#10b981', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  logoTextHighlight: { color: '#34d399' },
  
  topTabsContainer: { position: 'absolute', left: SCREEN_WIDTH / 2, transform: [{translateX: -100}], flexDirection: 'row', gap: 4 },
  topTabButton: { paddingHorizontal: 20, paddingVertical: 6, borderRadius: 9999 },
  topTabButtonActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  topTabText: { fontSize: 12, fontWeight: 'bold', color: '#64748b' },
  topTabTextActive: { color: '#fff' },
  
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  liveMarketBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  liveMarketDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  liveMarketText: { fontSize: 10, fontWeight: 'bold', color: '#34d399', textTransform: 'uppercase', letterSpacing: 1 },
  
  modelSelectorContainer: { position: 'relative' },
  modelSelectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modelSelectorText: { fontSize: 10, fontWeight: 'bold', color: '#cbd5e1', textTransform: 'uppercase', maxWidth: 100 },
  modelDropdown: { position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 224, backgroundColor: '#1e293b', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingVertical: 4, zIndex: 100 },
  modelDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  modelDropdownItemActive: { backgroundColor: 'rgba(16,185,129,0.05)' },
  modelDropdownText: { fontSize: 12, fontWeight: 'bold', color: '#94a3b8' },
  modelDropdownTextActive: { color: '#34d399' },
  activeBadge: { backgroundColor: 'rgba(16,185,129,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  activeBadgeText: { fontSize: 10, color: '#34d399', fontWeight: 'bold' },
  
  searchBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchBtnText: { fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' },
  
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userAvatarWrapper: { width: 32, height: 32, borderRadius: 12, backgroundColor: '#34d399', padding: 2 },
  userAvatar: { flex: 1, borderRadius: 10, backgroundColor: '#0A0E14', alignItems: 'center', justifyContent: 'center' },
  
  bodyContainer: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  sidebarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 },
  sidebar: { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(11,14,20,0.9)', zIndex: 50, width: 256 },
  sidebarCollapsed: { width: 64 },
  sidebarMobile: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  
  sidebarHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  sidebarAvatar: { width: 36, height: 36, borderRadius: 16, backgroundColor: '#34d399', alignItems: 'center', justifyContent: 'center' },
  sidebarAvatarText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  sidebarUserInfo: { flex: 1 },
  sidebarUserName: { fontSize: 14, fontWeight: '900', color: '#fff' },
  sidebarUserStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  sidebarUserStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399' },
  sidebarUserStatusText: { fontSize: 10, fontWeight: 'bold', color: '#34d399', letterSpacing: 1 },
  
  sidebarNav: { flex: 1, paddingVertical: 16, paddingHorizontal: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16, marginBottom: 4 },
  navItemActive: { backgroundColor: '#10b981' },
  navItemText: { fontSize: 14, fontWeight: 'bold', color: '#64748b', flex: 1 },
  navItemTextActive: { color: '#000' },
  
  sidebarFooter: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  sidebarFooterText: { fontSize: 10, fontWeight: 'bold', color: '#334155', letterSpacing: 1 },
  
  mainContent: { flex: 1, flexDirection: 'column' },
  breadcrumbs: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', backgroundColor: 'rgba(11,14,20,0.4)' },
  breadcrumbsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breadcrumbTextMuted: { fontSize: 12, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: 1 },
  breadcrumbSeparator: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  breadcrumbText: { fontSize: 12, fontWeight: 'bold', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 1 },
  breadcrumbTextHighlight: { fontSize: 12, color: '#34d399', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  
  mobileTickers: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 16 },
  offlineBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(234,179,8,0.3)', backgroundColor: 'rgba(234,179,8,0.1)' },
  offlineBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#eab308' },
  mobileTickerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mobileTickerSymbol: { fontSize: 10, color: '#64748b', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  mobileTickerPct: { fontSize: 10, fontWeight: '900' },
  
  pageContainer: { flex: 1, padding: IS_DESKTOP ? 24 : 16 },
  
  bottomNav: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(11,14,20,0.9)', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  bottomNavItem: { alignItems: 'center', justifyContent: 'center', minWidth: 52, minHeight: 48, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16 },
  bottomNavItemActive: { backgroundColor: 'rgba(16,185,129,0.1)' },
  bottomNavActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#34d399', marginTop: 4 },
  
  searchModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', paddingTop: IS_DESKTOP ? 96 : 64 },
  searchModalContent: { width: IS_DESKTOP ? 512 : SCREEN_WIDTH - 24, backgroundColor: '#1e293b', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase' },
  searchShortcuts: { paddingHorizontal: 16, paddingVertical: 8 },
  searchShortcutsTitle: { fontSize: 10, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  searchShortcutItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12 },
  searchShortcutKey: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  searchShortcutKeyText: { fontSize: 10, color: '#475569', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  searchShortcutLabel: { fontSize: 14, color: '#94a3b8' },
  searchResultContainer: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 16, paddingVertical: 8 },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  searchResultIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.2)', alignItems: 'center', justifyContent: 'center' },
  searchResultTextContainer: { flex: 1 },
  searchResultTitle: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  searchResultDesc: { fontSize: 12, color: '#64748b' },
  
  footer: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(0,0,0,0.6)' },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  footerTextMuted: { fontSize: 10, fontWeight: 'bold', color: '#475569', letterSpacing: 1 },
  footerTextHighlight: { fontSize: 10, fontWeight: 'bold', color: '#34d399', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  footerDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  footerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerStatusDot: { width: 6, height: 6, borderRadius: 3 },
  footerStatusText: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  footerCenter: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  footerTicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerTickerSymbol: { fontSize: 10, color: '#64748b', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  footerTickerPct: { fontSize: 10, fontWeight: '900' },
  footerCopyright: { fontSize: 10, fontWeight: 'bold', color: '#334155', letterSpacing: 2 },
  
  textEmerald: { color: '#34d399' },
  textRose: { color: '#fb7185' },
  
  errorContainer: { flex: 1, backgroundColor: '#4c0519', alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 24, fontWeight: '900', color: '#fecdd3', marginBottom: 16 },
  errorBox: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)', width: '100%', maxHeight: 256 },
  errorText: { fontSize: 14, color: '#fda4af', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  errorButton: { marginTop: 32, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#e11d48', borderRadius: 8 },
  errorButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
