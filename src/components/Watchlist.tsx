import React from 'react';
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { safeCn, safeN } from '../utils/helpers';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { WatchlistItem, SearchResult } from '../types';

interface WatchlistProps {
  watchlist: WatchlistItem[];
  norm: string;
  symbol: string;
  onSymbolChange: (sym: string) => void;
  wlAdding: boolean;
  setWlAdding: React.Dispatch<React.SetStateAction<boolean>>;
  wlSearch: string;
  setWlSearch: React.Dispatch<React.SetStateAction<string>>;
  addToWatchlist: (sym: string) => void;
  searchResults?: SearchResult[];
  isSearching?: boolean;
}

export const Watchlist: React.FC<WatchlistProps> = React.memo(({
  watchlist, norm, symbol, onSymbolChange, wlAdding, setWlAdding, wlSearch, setWlSearch, addToWatchlist, searchResults = [], isSearching = false
}) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [filter, setFilter] = React.useState<'all' | 'bullish' | 'bearish'>('all');

  const filteredWatchlist = React.useMemo(() => {
    return watchlist.filter(w => {
      const isUp = (Number(w.changePct) || 0) >= 0;
      if (filter === 'bullish') return isUp;
      if (filter === 'bearish') return !isUp;
      return true;
    });
  }, [watchlist, filter]);

  return (
    <div className={safeCn("liquid-glass rounded-2xl flex-1 flex flex-col min-h-0 bg-[var(--card-bg)] border-[var(--border-color)]", compact ? "p-2" : "p-4")}>
      <div className={safeCn("flex items-center justify-between shrink-0", compact ? "mb-1" : "mb-3")}>
        <span className={safeCn("font-bold text-zinc-500 uppercase tracking-wider", compact ? "label-meta" : "text-sm")}>追蹤清單</span>
        <div className="flex gap-1">
          <select value={filter} onChange={e => setFilter(e.target.value as 'all' | 'bullish' | 'bearish')} className={safeCn("bg-[var(--bg-color)] text-[var(--text-color)] rounded-lg focus:outline-none border border-[var(--border-color)]", compact ? "label-meta px-1 py-0.5" : "text-xs px-2 py-1")}>
            <option value="all">全部</option>
            <option value="bullish">偏多</option>
            <option value="bearish">偏空</option>
          </select>
          <button onClick={() => setWlAdding(v => !v)} className={safeCn("flex items-center justify-center rounded-lg hover:bg-[var(--border-color)] text-zinc-500 hover:text-emerald-400 transition-colors", compact ? "w-6 h-6" : "w-8 h-8")}>
            {wlAdding ? <X size={compact ? 12 : 14} /> : <Plus size={compact ? 12 : 14} />}
          </button>
        </div>
      </div>

      {wlAdding && (
        <div className="mb-3 flex flex-col gap-2 shrink-0 relative z-50">
          <div className="flex gap-2">
            <input
              value={wlSearch}
              onChange={e => setWlSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addToWatchlist(wlSearch.toUpperCase())}
              placeholder="搜尋代碼或名稱 e.g. AAPL"
              autoFocus
              className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-sm text-[var(--text-color)] focus:outline-none focus:border-emerald-500/50"
            />
            <button onClick={() => addToWatchlist(wlSearch.toUpperCase())} className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-950 text-emerald-400 hover:bg-emerald-900 transition-colors border border-emerald-900/50 shrink-0 self-center">
              <Plus size={12} />
            </button>
          </div>
          
          {/* Auto-complete Dropdown */}
          {wlSearch.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden z-[60] max-h-60 overflow-y-auto">
              {isSearching ? (
                <div className="p-3 text-center text-xs text-[var(--text-color)] opacity-50">搜尋中...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((res, i) => (
                  <button
                    key={`${res.symbol}-${i}`}
                    onClick={() => {
                      addToWatchlist(res.symbol);
                      setWlSearch('');
                      setWlAdding(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--border-color)] flex items-center justify-between border-b border-[var(--border-color)] last:border-0 transition-colors"
                  >
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-bold text-[var(--text-color)]">{res.symbol}</span>
                      <span className="text-xs text-[var(--text-color)] opacity-50 truncate">{res.shortname || res.longname}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-color)] text-[var(--text-color)] opacity-70 shrink-0">{res.exchDisp}</span>
                  </button>
                ))
              ) : (
                <div className="p-3 text-center text-xs text-[var(--text-color)] opacity-50">找不到相關標的</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 min-h-0 content-start p-1 custom-scrollbar" role="listbox" aria-label="追蹤清單">
        <AnimatePresence>
          {filteredWatchlist.length === 0
            ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col-span-2 flex flex-col items-center justify-center gap-2 py-6">
                <div className="w-10 h-10 rounded-xl bg-zinc-800/50 flex items-center justify-center border border-zinc-800">
                  <TrendingUp size={16} className="text-zinc-700"/>
                </div>
                <p className="text-xs text-zinc-500 font-bold">{filter === 'all' ? '追蹤清單為空' : `無${filter === 'bullish' ? '偏多' : '偏空'}的股票`}</p>
                {filter === 'all' && <p className="text-xs text-zinc-700">點擊 + 新增第一檔追蹤標的</p>}
              </motion.div>
            : filteredWatchlist.map(w => {
              const isActive = w.symbol === norm || w.symbol === symbol;
              const wUp = (Number(w.changePct) || 0) >= 0;
              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={w.symbol}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={0}
                  onClick={() => onSymbolChange(w.symbol)}
                  onKeyDown={e => e.key === 'Enter' && onSymbolChange(w.symbol)}
                  className={safeCn(
                    'stock-card flex flex-col rounded-xl cursor-pointer transition-all group active:scale-[0.97]',
                    compact ? 'p-4' : 'p-6',
                    isActive
                      ? 'bg-emerald-950/30 border border-emerald-900/50'
                      : 'hover:bg-[var(--border-color)]/50 border border-[var(--border-color)]'
                  )}>
                  <div className="flex justify-between items-start mb-2">
                    <div className={safeCn('font-bold truncate', compact ? 'text-base' : 'text-lg', isActive ? 'text-emerald-300' : 'text-[var(--text-color)]')}>{w.shortName ?? w.name ?? ''}</div>
                    <div className={safeCn('font-bold truncate', compact ? 'text-sm' : 'text-base', 'text-zinc-500')}>{w.symbol}</div>
                  </div>
                  <div className={safeCn('font-mono font-bold text-center', compact ? 'text-2xl' : 'text-3xl', isActive ? 'text-emerald-300' : 'text-[var(--text-color)]')}>{safeN(w.price)}</div>
                  <div className={safeCn('font-mono font-medium flex items-center justify-center gap-1', compact ? 'text-sm' : 'text-base', wUp ? 'text-emerald-400' : 'text-rose-400')}>
                    {wUp ? <TrendingUp size={compact ? 14 : 16} /> : <TrendingDown size={compact ? 14 : 16} />}
                    {wUp ? '+' : ''}{safeN(w.changePct)}%
                  </div>
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>
    </div>
  );
});
