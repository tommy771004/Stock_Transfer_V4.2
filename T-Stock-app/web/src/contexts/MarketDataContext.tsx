import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../services/api';
import { apiUrl, IS_MOBILE_OFFLINE } from '../services/api';
import { useToast } from './ToastContext';
import { Quote } from '../types';

interface TickerItem { symbol: string; pct: number; }

interface MarketDataContextType {
  tickers: TickerItem[];
  latency: number;
  isOffline: boolean;
}

const MarketDataContext = createContext<MarketDataContextType | undefined>(undefined);

const TICKER_SYMBOLS = ['TSLA', 'AAPL', 'BTC-USD', 'ETH-USD', 'NVDA', '^GSPC'];

export const MarketDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [latency, setLatency] = useState(12);
  const { toast } = useToast();
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const fetchTickers = useCallback(async () => {
    try {
      const data = await api.getBatchQuotes(TICKER_SYMBOLS);
      setTickers((Array.isArray(data) ? data : []).filter(Boolean).map((q: Quote) => ({ symbol: q.symbol ?? '', pct: q.regularMarketChangePercent ?? 0 })));
    } catch (e) {
      console.error('Failed to fetch tickers:', e);
      toastRef.current('Failed to fetch tickers: ' + (e instanceof Error ? e.message : 'Unknown error'), 'error');
    }
  }, []);

  useEffect(() => {
    // In pure offline mobile mode (no server configured) skip polling entirely —
    // every tick would produce a noisy error toast with no benefit.
    if (IS_MOBILE_OFFLINE) return;
    // 延遲執行，避免在渲染期間更新狀態
    const timer = setTimeout(fetchTickers, 0);
    const id = setInterval(fetchTickers, 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(id);
    };
  }, [fetchTickers]);

  useEffect(() => {
    if (IS_MOBILE_OFFLINE) return;
    const measureLatency = async () => {
      const start = Date.now();
      try {
        await fetch(apiUrl('/api/health'));
        setLatency(Date.now() - start);
      } catch(e) {
        console.warn('[MarketData] latency check:', e);
        setLatency(0);
      }
    };
    measureLatency();
    const id = setInterval(measureLatency, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <MarketDataContext.Provider value={{ tickers, latency, isOffline: IS_MOBILE_OFFLINE }}>
      {children}
    </MarketDataContext.Provider>
  );
};

export const useMarketData = () => {
  const context = useContext(MarketDataContext);
  if (!context) throw new Error('useMarketData must be used within MarketDataProvider');
  return context;
};
