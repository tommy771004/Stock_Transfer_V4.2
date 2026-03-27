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
 *
 * JS injection timing:
 *   PRE_INJECTED_JS  → injectedJavaScriptBeforeContentLoaded
 *     Runs BEFORE the page's <script> tags execute, so api.ts module-level
 *     constants (IS_MOBILE_WEBVIEW) see window.__EXPO_WEBVIEW__ = true.
 *   POST_INJECTED_JS → injectedJavaScript
 *     Runs AFTER DOMContentLoaded — used for UX tweaks only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
const IS_DEV = __DEV__ && DEV_SERVER_URL !== '';

// ─── JS injected BEFORE page content loads ────────────────────────────────────
/**
 * CRITICAL: these flags must be set before the React web bundle's module-level
 * constants are evaluated. injectedJavaScriptBeforeContentLoaded fires before
 * any <script> tags in the HTML are parsed, so IS_MOBILE_WEBVIEW in api.ts
 * will correctly see true when the module initialises.
 *
 * __IS_TABLET__ uses window.screen.width so it reflects the actual device
 * width at injection time (not a frozen Dimensions snapshot).
 */
const PRE_INJECTED_JS = `
(function () {
  window.__EXPO_WEBVIEW__ = true;
  window.__PLATFORM__    = ${JSON.stringify(Platform.OS)};
  window.__IS_TABLET__   = window.screen.width >= 768;
  true;
})();
`;

// ─── JS injected AFTER page content loads ────────────────────────────────────
const POST_INJECTED_JS = `
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

  true;
})();
`;

// ─── Types ────────────────────────────────────────────────────────────────────
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// ─── Component ────────────────────────────────────────────────────────────────
export default function MainScreen() {
  const webRef    = useRef<WebView>(null);
  const insets    = useSafeAreaInsets();
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const [status,     setStatus]     = useState<LoadStatus>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [webUri,     setWebUri]     = useState<string | null>(IS_DEV ? DEV_SERVER_URL : null);
  const [canGoBack,  setCanGoBack]  = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // ── Detect tablet ──────────────────────────────────────────────────────────
  const [dims, setDims] = useState(Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub.remove();
  }, []);
  const isTablet = dims.width >= 768;

  // ── Copy bundled HTML to cache ─────────────────────────────────────────────
  // Depends on retryCount so tapping "Retry" after a FileSystem error
  // re-executes the copy logic instead of leaving the user on a dead spinner.
  useEffect(() => {
    if (IS_DEV) return;

    let cancelled = false;

    (async () => {
      try {
        setStatus('loading');
        setWebUri(null);
        const destDir   = FileSystem.cacheDirectory! + 'tstock-web/';
        const destIndex = destDir + 'index.html';

        const info = await FileSystem.getInfoAsync(destIndex);
        if (info.exists && retryCount === 0) {
          if (!cancelled) setWebUri(destIndex);
          return;
        }

        // On retry: delete stale cache so a fresh copy is made
        if (info.exists) {
          await FileSystem.deleteAsync(destIndex, { idempotent: true });
        }

        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const asset = Asset.fromModule(require('../assets/web/index.html'));
        await asset.downloadAsync();
        await FileSystem.copyAsync({ from: asset.localUri!, to: destIndex });
        if (!cancelled) setWebUri(destIndex);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : '無法載入應用程式資源';
        setErrorMsg(msg || '無法載入應用程式資源');
        setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [retryCount]);

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

  const onLoadEnd = useCallback(() => {
    setStatus('ready');
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const onRetry = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fadeAnim.setValue(0);
    setErrorMsg('');
    setStatus('idle');
    if (!webUri) {
      // FileSystem error path: re-trigger the copy useEffect
      setRetryCount(c => c + 1);
    } else {
      // WebView load error path: reload the already-copied HTML
      webRef.current?.reload();
    }
  }, [fadeAnim, webUri]);

  // ── Error screen ───────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.errTitle}>T-Stock 發生錯誤</Text>
        <Text style={s.errMsg}>{errorMsg || '頁面載入失敗'}</Text>
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

  // ── WebView source ─────────────────────────────────────────────────────────
  // FileSystem.cacheDirectory already returns a full file:/// URI on both
  // iOS and Android — do NOT add another file:// prefix.
  const source: { uri: string } = { uri: webUri };

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
      {/* DEV badge — visible only in __DEV__ builds, shows load source */}
      {__DEV__ && status === 'ready' && (
        <View style={s.devBadge} pointerEvents="none">
          <Text style={s.devTxt}>
            {IS_DEV ? `DEV  ${DEV_SERVER_URL}` : `DEV  cache`}
          </Text>
        </View>
      )}

      {/* Loading spinner — shown until WebView fires onLoadEnd */}
      {status !== 'ready' && (
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <ActivityIndicator size="large" color="#34d399" />
          <Text style={s.loadTxt}>T-Stock 啟動中…</Text>
        </View>
      )}

      {/* WebView fades in after onLoadEnd */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <WebView
          ref={webRef}
          source={source}
          style={s.webview}
          // ── Security / access ──
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs={Platform.OS !== 'android'}
          originWhitelist={['*']}
          mixedContentMode="compatibility"
          // ── Performance ──
          cacheEnabled
          // ── JS injection ──
          // PRE: sets window.__EXPO_WEBVIEW__ before the React bundle executes
          injectedJavaScriptBeforeContentLoaded={PRE_INJECTED_JS}
          // POST: UX tweaks after DOM is ready
          injectedJavaScript={POST_INJECTED_JS}
          // ── Events ──
          onLoadStart={() => setStatus('loading')}
          onLoadEnd={onLoadEnd}
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
      </Animated.View>
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
  devBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(239,68,68,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 999,
  },
  devTxt: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
});
