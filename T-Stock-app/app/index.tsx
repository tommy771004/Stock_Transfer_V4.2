/**
 * app/index.tsx — Main screen
 *
 * Embeds the T-Stock web app (Vite single-bundle) inside a React Native WebView.
 *
 * DEV  mode: set DEV_SERVER_URL to your Vite dev-server IP → live reload
 * PROD mode: loads assets/web/index.html bundled with the native app
 *
 * Phone vs Tablet:
 *   isTablet (width >= 768) → the web app itself is responsive via Tailwind,
 *   so the WebView simply fills the screen in both cases.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';

// ─── Dev-server config ────────────────────────────────────────────────────────
/**
 * Set to your machine's local IP when developing.
 * Leave empty string for production (bundled HTML).
 *
 * Example: const DEV_SERVER_URL = 'http://192.168.1.10:5173';
 */
const DEV_SERVER_URL = '';
const IS_DEV = __DEV__ && DEV_SERVER_URL.length > 0;

// ─── JS injected into the WebView ─────────────────────────────────────────────
const INJECTED_JS = `
(function () {
  // Prevent double-tap zoom
  var last = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - last < 300) e.preventDefault();
    last = now;
  }, { passive: false });

  // Disable long-press text selection (more native feel)
  document.documentElement.style.webkitUserSelect = 'none';
  document.documentElement.style.userSelect = 'none';

  // Flags the web app can read via window.__EXPO_WEBVIEW__
  window.__EXPO_WEBVIEW__ = true;
  window.__PLATFORM__    = '${Platform.OS}';
  window.__IS_TABLET__   = ${Dimensions.get('window').width >= 768};

  true;
})();
`;

// ─── Types ────────────────────────────────────────────────────────────────────
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// ─── Component ────────────────────────────────────────────────────────────────
export default function MainScreen() {
  const webRef    = useRef<WebView>(null);
  const insets    = useSafeAreaInsets();

  const [status,    setStatus]    = useState<LoadStatus>('idle');
  const [errorMsg,  setErrorMsg]  = useState('');
  const [webUri,    setWebUri]    = useState<string | null>(IS_DEV ? DEV_SERVER_URL : null);
  const [canGoBack, setCanGoBack] = useState(false);

  // ── Detect tablet ──────────────────────────────────────────────────────────
  const [dims, setDims] = useState(Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub.remove();
  }, []);
  const isTablet = dims.width >= 768;

  // ── Copy bundled HTML to cache on first launch ─────────────────────────────
  useEffect(() => {
    if (IS_DEV) return;

    (async () => {
      try {
        setStatus('loading');
        const destDir   = FileSystem.cacheDirectory! + 'tstock-web/';
        const destIndex = destDir + 'index.html';

        const info = await FileSystem.getInfoAsync(destIndex);
        if (info.exists) {
          setWebUri(destIndex);
          return;
        }

        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const asset = Asset.fromModule(require('../assets/web/index.html'));
        await asset.downloadAsync();
        await FileSystem.copyAsync({ from: asset.localUri!, to: destIndex });
        setWebUri(destIndex);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : '無法載入應用程式資源');
        setStatus('error');
      }
    })();
  }, []);

  // ── Android hardware back button ───────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  const onRetry = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatus('idle');
    setErrorMsg('');
    webRef.current?.reload();
  }, []);

  // ── Error screen ───────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.errTitle}>T-Stock 發生錯誤</Text>
        <Text style={s.errMsg}>{errorMsg}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={onRetry} accessibilityRole="button">
          <Text style={s.retryTxt}>重試</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Waiting for URI ────────────────────────────────────────────────────────
  if (!webUri) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#34d399" />
        <Text style={s.loadTxt}>載入中…</Text>
      </View>
    );
  }

  // ── WebView source helper ──────────────────────────────────────────────────
  const source =
    webUri.startsWith('http')
      ? { uri: webUri }
      : Platform.OS === 'android'
      ? { uri: `file://${webUri}` }
      : { uri: webUri };

  // ── Tablet: optional max-width centering on very wide screens ─────────────
  const containerStyle = [
    s.container,
    {
      paddingTop:    insets.top,
      paddingBottom: insets.bottom,
      paddingLeft:   insets.left,
      paddingRight:  insets.right,
    },
    isTablet && dims.width > 1024 ? s.tabletWide : null,
  ];

  return (
    <View style={containerStyle}>
      {status === 'loading' && (
        <View style={StyleSheet.absoluteFill}>
          <View style={s.center}>
            <ActivityIndicator size="large" color="#34d399" />
            <Text style={s.loadTxt}>T-Stock 啟動中…</Text>
          </View>
        </View>
      )}

      <WebView
        ref={webRef}
        source={source}
        style={s.webview}
        // ── Security / access ──
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        originWhitelist={['*']}
        mixedContentMode="always"
        // ── Performance ──
        cacheEnabled
        // ── JS injection ──
        injectedJavaScript={INJECTED_JS}
        // ── Events ──
        onLoadStart={() => setStatus('loading')}
        onLoadEnd={() => setStatus('ready')}
        onError={e => {
          setErrorMsg(e.nativeEvent.description || '頁面載入失敗');
          setStatus('error');
        }}
        onNavigationStateChange={onNavChange}
        // ── Mobile UX ──
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        keyboardDisplayRequiresUserAction={false}
        automaticallyAdjustContentInsets={false}
        contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
        // ── Tablet: allow text scaling ──
        textZoom={isTablet ? 110 : 100}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const BG = '#09090b';

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  /** On very wide iPads (>1024 pt) keep content at a reasonable width */
  tabletWide: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1280,
  },
  webview: {
    flex: 1,
    backgroundColor: BG,
  },
  center: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadTxt: {
    color: '#71717a',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 8,
  },
  errTitle: {
    color: '#f87171',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  errMsg: {
    color: '#a1a1aa',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#18181b',
    borderColor: '#34d399',
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryTxt: {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '600',
  },
});
