/**
 * src/services/api.ts
 * Unified data access layer.
 *
 * Tier 1 — Electron IPC    (Desktop app via window.api)
 * Tier 2 — HTTP server     (Dev / web, calls /api/...)
 * Tier 3 — localStorage    (Mobile WebView, CRUD data only)
 *
 * Detection:
 *   IS_ELECTRON        → window.api.isElectron is true
 *   IS_MOBILE_WEBVIEW  → window.__EXPO_WEBVIEW__ injected by Expo native shell
 *
 * In mobile mode, CRUD data persists in localStorage.
 * Market data calls use VITE_API_BASE (set in .env) when available,
 * otherwise fail gracefully (components show empty / error state).
 */

import { Quote, NewsItem, CalendarData, WatchlistItem, Trade, Position, Alert, HistoricalData, BacktestResult, BacktestParams, ScreenerResult, TWSEData, MTFTrendRecord, TradeDTO, mapTradeDTO } from '../types';

declare global {
  interface Window {
    api?: {
      isElectron: true;
      getQuote:    (sym: string) => Promise<Quote>;
      getHistory:  (sym: string, opts?: Record<string, string | number>) => Promise<HistoricalData[]>;
      getBatch:    (syms: string[]) => Promise<Quote[]>;
      getNews:     (sym: string) => Promise<NewsItem[]>;
      getCalendar: (sym: string) => Promise<CalendarData>;
      getForex:    (pair?: string) => Promise<number>;
      getTWSE:     (stockNo: string) => Promise<TWSEData>;
      getMTF:      (sym: string, opts?: Record<string, string | number>) => Promise<MTFTrendRecord>;
      runBacktest: (p: BacktestParams) => Promise<BacktestResult>;
      getWatchlist:  () => Promise<WatchlistItem[]>;
      setWatchlist:  (l: WatchlistItem[]) => Promise<boolean>;
      getPositions:  () => Promise<{ positions: Position[]; usdtwd: number }>;
      setPositions:  (l: Position[]) => Promise<boolean>;
      getTrades:     () => Promise<Trade[]>;
      addTrade:      (t: Partial<Trade>) => Promise<Trade>;
      updateTrade:   (t: Partial<Trade>) => Promise<boolean>;
      deleteTrade:   (id: number) => Promise<boolean>;
      getAlerts:     () => Promise<Alert[]>;
      addAlert:      (a: Omit<Alert, 'id'>) => Promise<Alert>;
      deleteAlert:   (id: number) => Promise<boolean>;
      triggerAlert:  (id: number) => Promise<boolean>;
      getSetting:    <T>(key: string) => Promise<T>;
      setSetting:    <T>(key: string, val: T) => Promise<boolean>;
      getDbStats:    () => Promise<unknown>;
      getSystemStats:() => Promise<unknown>;
      runScreener:   (symbols: string[], filters?: ScreenerFilters) => Promise<{ results: ScreenerResult[] }>;
      openExternal:  (url: string) => Promise<void>;
      getVersion:    () => Promise<string>;
      getDataPath:   () => Promise<string>;
    };
  }
}

import { getCachedData, setCachedData } from './cache';
import { fetchJ } from '../utils/api';
import { loadFromStorage, saveToStorage } from '../utils/storage';

/** Log API fallbacks so failures are visible during development. */
const apiWarn = (ctx: string, e: unknown) => {
  console.warn(`[API] ${ctx} fallback:`, e instanceof Error ? e.message : e);
};

const IS_ELECTRON = typeof window !== 'undefined' && !!window.api?.isElectron;

/** True when running inside the Expo React Native WebView shell */
export const IS_MOBILE_WEBVIEW =
  typeof window !== 'undefined' && !!(window as Window & { __EXPO_WEBVIEW__?: boolean }).__EXPO_WEBVIEW__;

/**
 * Base URL for server API calls.
 * Evaluated once at module load — reading localStorage per-request is wasteful
 * and the base URL does not change within a session.
 */
const _mobileApiBase: string = IS_MOBILE_WEBVIEW
  ? (() => { try { return localStorage.getItem('mobile_api_base') ?? ''; } catch { return ''; } })()
  : '';

/**
 * True when running in mobile WebView with NO server configured.
 * Used to skip network polling that would produce noisy error toasts.
 */
export const IS_MOBILE_OFFLINE = IS_MOBILE_WEBVIEW && _mobileApiBase === '';

/** Build a full API URL, honouring _mobileApiBase when in WebView. */
export const apiUrl = (path: string) => `${_mobileApiBase}${path}`;

const E = () => {
  if (!window.api) throw new Error('Electron API not available');
  return window.api;
};

// ── Monotonic ID generator (prevents collision when Date.now() repeats in same ms) ──
let _idClock = Date.now();
const nextId = (): number => { _idClock = Math.max(Date.now(), _idClock + 1); return _idClock; };

// ── localStorage keys for mobile CRUD persistence ────────────────────────────
const LS = {
  watchlist:  'tstock_watchlist',
  positions:  'tstock_positions',
  trades:     'tstock_trades',
  alerts:     'tstock_alerts',
  settings:   'tstock_settings',
} as const;

// ── Stock (market data — requires server; fails gracefully in offline mobile) ──
export const getQuote = async (sym: string): Promise<Quote> => {
  const cached = getCachedData<Quote>(`quote:${sym}`);
  if (cached) return cached;
  const data = IS_ELECTRON
    ? await E().getQuote(sym)
    : await fetchJ<Quote>(apiUrl(`/api/stock/${sym}`));
  setCachedData(`quote:${sym}`, data);
  return data;
};

export const getHistory = (sym: string, opts?: Record<string, string | number>): Promise<HistoricalData[]> => {
  if (IS_ELECTRON) return E().getHistory(sym, opts);
  const p = new URLSearchParams(opts as Record<string, string> ?? {});
  return fetchJ<HistoricalData[]>(apiUrl(`/api/stock/${sym}/history?${p}`));
};

export const getBatchQuotes = (syms: string[]): Promise<Quote[]> =>
  IS_ELECTRON
    ? E().getBatch(syms)
    : fetchJ<Quote[]>(apiUrl(`/api/quotes?symbols=${syms.join(',')}`));

export const getNews = async (sym: string): Promise<NewsItem[]> => {
  const cached = getCachedData<NewsItem[]>(`news:${sym}`);
  if (cached) return cached;
  try {
    const data = IS_ELECTRON
      ? await E().getNews(sym)
      : await fetchJ<NewsItem[]>(apiUrl(`/api/news/${sym}`));
    setCachedData(`news:${sym}`, data);
    return data;
  } catch (e) { apiWarn('getNews', e); throw e; }
};

export const getCalendar = async (sym: string): Promise<CalendarData> => {
  const cached = getCachedData<CalendarData>(`cal:${sym}`);
  if (cached) return cached;
  try {
    const data = IS_ELECTRON
      ? await E().getCalendar(sym)
      : await fetchJ<CalendarData>(apiUrl(`/api/calendar/${sym}`));
    setCachedData(`cal:${sym}`, data);
    return data;
  } catch (e) { apiWarn('getCalendar', e); throw e; }
};

export const getForexRate = (pair = 'USDTWD=X'): Promise<number> =>
  IS_ELECTRON
    ? E().getForex(pair)
    : fetchJ<{ rate?: number }>(apiUrl(`/api/forex/${pair}`)).then(r => {
        if (r.rate == null) throw new Error('Forex rate not found');
        return r.rate;
      }).catch(e => { apiWarn('getForexRate', e); throw e; });

export const getTWSEStock = (stockNo: string): Promise<TWSEData> =>
  IS_ELECTRON ? E().getTWSE(stockNo) : fetchJ<TWSEData>(apiUrl(`/api/twse/stock/${stockNo}`));

export const getMTF = (sym: string, opts?: Record<string, string | number>): Promise<MTFTrendRecord> => {
  if (IS_ELECTRON) return E().getMTF(sym, opts);
  const p = new URLSearchParams(opts as Record<string, string> ?? {});
  return fetchJ<MTFTrendRecord>(apiUrl(`/api/stock/${sym}/mtf?${p}`));
};

export const runBacktest = (p: BacktestParams): Promise<BacktestResult> =>
  IS_ELECTRON
    ? E().runBacktest(p)
    : fetchJ<BacktestResult>(apiUrl('/api/backtest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });

// ── Watchlist ─────────────────────────────────────────────────────────────────
export const getWatchlist = (): Promise<WatchlistItem[]> => {
  if (IS_ELECTRON) return E().getWatchlist();
  if (IS_MOBILE_WEBVIEW) return Promise.resolve(loadFromStorage<WatchlistItem[]>(LS.watchlist, []));
  return fetchJ<WatchlistItem[]>(apiUrl('/api/watchlist'));
};

export const setWatchlist = (list: WatchlistItem[]): Promise<boolean> => {
  if (IS_ELECTRON) return E().setWatchlist(list);
  if (IS_MOBILE_WEBVIEW) { saveToStorage(LS.watchlist, list); return Promise.resolve(true); }
  return fetchJ<boolean>(apiUrl('/api/watchlist'), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list),
  });
};

// ── Positions ─────────────────────────────────────────────────────────────────
export const getPositions = (): Promise<{ positions: Position[]; usdtwd: number }> => {
  if (IS_ELECTRON) return E().getPositions();
  if (IS_MOBILE_WEBVIEW) {
    const saved = loadFromStorage<{ positions: Position[]; usdtwd: number }>(
      LS.positions, { positions: [], usdtwd: 32 }
    );
    return Promise.resolve(saved);
  }
  return fetchJ<{ positions: Position[]; usdtwd: number }>(apiUrl('/api/positions'));
};

export const setPositions = (list: Position[]): Promise<boolean> => {
  if (IS_ELECTRON) return E().setPositions(list);
  if (IS_MOBILE_WEBVIEW) {
    const current = loadFromStorage<{ positions: Position[]; usdtwd: number }>(
      LS.positions, { positions: [], usdtwd: 32 }
    );
    saveToStorage(LS.positions, { ...current, positions: list });
    return Promise.resolve(true);
  }
  return fetchJ<boolean>(apiUrl('/api/positions'), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list),
  });
};

// ── Trades ────────────────────────────────────────────────────────────────────
export const getTrades = async (): Promise<Trade[]> => {
  try {
    if (IS_ELECTRON) {
      const raw = await E().getTrades();
      return (Array.isArray(raw) ? raw as TradeDTO[] : []).map(mapTradeDTO);
    }
    if (IS_MOBILE_WEBVIEW) {
      return loadFromStorage<Trade[]>(LS.trades, []);
    }
    const raw = await fetchJ<TradeDTO[]>(apiUrl('/api/trades'));
    return (Array.isArray(raw) ? raw : []).map(mapTradeDTO);
  } catch (e) { apiWarn('getTrades', e); throw e; }
};

export const addTrade = (t: Partial<Trade>): Promise<Trade> => {
  if (IS_ELECTRON) return E().addTrade(t);
  if (IS_MOBILE_WEBVIEW) {
    const trades = loadFromStorage<Trade[]>(LS.trades, []);
    const next: Trade = { ...t, id: nextId() } as Trade;
    saveToStorage(LS.trades, [...trades, next]);
    return Promise.resolve(next);
  }
  return fetchJ<Trade>(apiUrl('/api/trades'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t),
  });
};

export const updateTrade = (t: Partial<Trade>): Promise<boolean> => {
  if (IS_ELECTRON) return E().updateTrade(t);
  if (IS_MOBILE_WEBVIEW) {
    const trades = loadFromStorage<Trade[]>(LS.trades, []);
    saveToStorage(LS.trades, trades.map(x => x.id === t.id ? { ...x, ...t } : x));
    return Promise.resolve(true);
  }
  return fetchJ<boolean>(apiUrl(`/api/trades/${t.id}`), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t),
  });
};

export const deleteTrade = (id: number): Promise<boolean> => {
  if (IS_ELECTRON) return E().deleteTrade(id);
  if (IS_MOBILE_WEBVIEW) {
    const trades = loadFromStorage<Trade[]>(LS.trades, []);
    saveToStorage(LS.trades, trades.filter(x => x.id !== id));
    return Promise.resolve(true);
  }
  return fetchJ(apiUrl(`/api/trades/${id}`), { method: 'DELETE' })
    .then(() => true).catch(e => { apiWarn('deleteTrade', e); throw e; });
};

export const executeTrade = (order: Partial<Trade>): Promise<Trade> => {
  if (IS_ELECTRON) return E().addTrade(order);
  if (IS_MOBILE_WEBVIEW) return addTrade(order);
  return fetchJ<Trade>(apiUrl('/api/trade/execute'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order),
  });
};

// ── Price Alerts ──────────────────────────────────────────────────────────────
export const getAlerts = (): Promise<Alert[]> => {
  if (IS_ELECTRON) return E().getAlerts();
  if (IS_MOBILE_WEBVIEW) return Promise.resolve(loadFromStorage<Alert[]>(LS.alerts, []));
  return fetchJ<Alert[]>(apiUrl('/api/alerts')).catch(e => { apiWarn('getAlerts', e); throw e; });
};

export const addAlert = (a: Omit<Alert, 'id'>): Promise<Alert> => {
  if (IS_ELECTRON) return E().addAlert(a);
  if (IS_MOBILE_WEBVIEW) {
    const alerts = loadFromStorage<Alert[]>(LS.alerts, []);
    const next: Alert = { ...a, id: nextId() } as Alert;
    saveToStorage(LS.alerts, [...alerts, next]);
    return Promise.resolve(next);
  }
  return fetchJ<Alert>(apiUrl('/api/alerts'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a),
  });
};

export const deleteAlert = (id: number): Promise<boolean> => {
  if (IS_ELECTRON) return E().deleteAlert(id);
  if (IS_MOBILE_WEBVIEW) {
    const alerts = loadFromStorage<Alert[]>(LS.alerts, []);
    saveToStorage(LS.alerts, alerts.filter(x => x.id !== id));
    return Promise.resolve(true);
  }
  return fetchJ(apiUrl(`/api/alerts/${id}`), { method: 'DELETE' })
    .then(() => true).catch(e => { apiWarn('deleteAlert', e); throw e; });
};

// ── App Settings ──────────────────────────────────────────────────────────────
export const getSetting = async <T>(key: string): Promise<T | undefined> => {
  if (IS_ELECTRON) return E().getSetting<T>(key);
  if (IS_MOBILE_WEBVIEW) {
    const all = loadFromStorage<Record<string, unknown>>(LS.settings, {});
    return (all[key] ?? undefined) as T | undefined;
  }
  const r = await fetchJ<{ value: T }>(apiUrl(`/api/settings/${key}`));
  return r.value;
};

export const setSetting = async <T>(key: string, val: T): Promise<boolean> => {
  if (IS_ELECTRON) return E().setSetting<T>(key, val);
  if (IS_MOBILE_WEBVIEW) {
    const all = loadFromStorage<Record<string, unknown>>(LS.settings, {});
    saveToStorage(LS.settings, { ...all, [key]: val });
    return true;
  }
  const r = await fetchJ<{ ok: boolean }>(apiUrl(`/api/settings/${key}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: val }),
  });
  return !!r.ok;
};

// ── DB Stats ──────────────────────────────────────────────────────────────────
export const getDbStats    = (): Promise<unknown> =>
  IS_ELECTRON ? E().getDbStats() : Promise.resolve(null);

export const getSystemStats = (): Promise<unknown> =>
  IS_ELECTRON ? E().getSystemStats() : fetchJ(apiUrl('/api/stats')).catch(() => null);

// ── Screener (XQ-style batch scan) ───────────────────────────────────────────
export interface ScreenerFilters {
  rsiBelow?: number;
  rsiAbove?: number;
  macdBullish?: boolean;
  macdBearish?: boolean;
  goldenCrossOnly?: boolean;
  deathCrossOnly?: boolean;
  volumeSpikeMin?: number;
  aboveSMA20?: boolean;
  belowSMA20?: boolean;
}

export const runScreener = (symbols: string[], filters?: ScreenerFilters): Promise<{ results: ScreenerResult[] }> =>
  fetchJ<{ results: ScreenerResult[] }>(apiUrl('/api/screener'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols, filters }),
  });

// ── Misc ──────────────────────────────────────────────────────────────────────
export const openExternal  = (url: string): void => {
  if (IS_ELECTRON) E().openExternal(url);
  else window.open(url, '_blank', 'noopener');
};

