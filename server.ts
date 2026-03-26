import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import cors from 'cors';

// --- Native Yahoo API Engine ---
const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface HistoricalData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartOptions {
  interval?: string;
  period1?: string | number;
  period2?: string | number;
}

class NativeYahooApi {
  private static crumb = "";
  private static cookie = "";
  private static crumbFetchedAt = 0;
  private static crumbTtl = 25 * 60 * 1000;
  private static isFetchingCrumb = false;

  public static async ensureAuth() {
    if (this.crumb && Date.now() - this.crumbFetchedAt < this.crumbTtl) return;
    if (this.isFetchingCrumb) {
      while (this.isFetchingCrumb) await new Promise(r => setTimeout(r, 100));
      return;
    }

    this.isFetchingCrumb = true;
    try {
      console.log('[NativeYF] 正在取得 Yahoo Cookie 與 Crumb...');
      this.cookie = await new Promise<string>((resolve, reject) => {
        const req = https.get('https://finance.yahoo.com/', {
          headers: {
            'User-Agent': UA_CHROME,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          maxHeaderSize: 65536
        }, (res) => {
          const setCookie = res.headers['set-cookie'] || [];
          let foundCookie = "";
          for (const c of setCookie) {
            if (c.includes('A3=') || c.includes('B=')) {
              foundCookie = c.split(';')[0];
              break;
            }
          }
          res.on('data', () => {});
          res.on('end', () => resolve(foundCookie));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Cookie 請求超時')); });
      });

      const res2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': UA_CHROME,
          'Cookie': this.cookie
        }
      });

      if (res2.ok) {
        this.crumb = await res2.text();
        this.crumbFetchedAt = Date.now();
        console.log(`[NativeYF] Crumb 取得成功! (${this.crumb})`);
      } else {
        throw new Error(`Crumb 取得失敗: HTTP ${res2.status}`);
      }
    } catch (err) {
      console.error('[NativeYF] 取得驗證資料失敗:', err);
    } finally {
      this.isFetchingCrumb = false;
    }
  }

  private static async fetchApi(url: string) {
    await this.ensureAuth();
    const finalUrl = url.includes('?') ? `${url}&crumb=${this.crumb}` : `${url}?crumb=${this.crumb}`;
    const res = await fetch(finalUrl, {
      headers: {
        'User-Agent': UA_CHROME,
        'Cookie': this.cookie,
        'Accept': 'application/json'
      }
    });
    if (res.status === 401 || res.status === 403) {
      this.crumb = "";
      throw new Error(`Auth Expired: ${res.status}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  public static async quote(symbols: string | string[]) {
    const syms = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}`;
    const data = await this.fetchApi(url);
    const results = data?.quoteResponse?.result || [];
    return Array.isArray(symbols) ? results : (results[0] || null);
  }

  public static async chart(symbol: string, opts: ChartOptions = {}): Promise<{ quotes: HistoricalData[] }> {
    const interval = opts.interval || '1d';
    const p1 = opts.period1 ? Math.floor(new Date(opts.period1).getTime() / 1000) : Math.floor(Date.now()/1000) - 31536000;
    let url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&period1=${p1}`;
    if (opts.period2) {
      url += `&period2=${Math.floor(new Date(opts.period2).getTime() / 1000)}`;
    } else {
      url += `&period2=${Math.floor(Date.now()/1000)}`;
    }
    const data = await this.fetchApi(url);
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) return { quotes: [] };
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const quotes: HistoricalData[] = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000),
      open:   quote.open[i],
      high:   quote.high[i],
      low:    quote.low[i],
      close:  quote.close[i],
      volume: quote.volume[i]
    })).filter((q: any): q is HistoricalData => q.close !== null && q.close !== undefined);
    return { quotes };
  }

  public static async search(query: string) {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=15`;
    return await this.fetchApi(url);
  }

  public static async quoteSummary(symbol: string, modules: string[]) {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}`;
    const data = await this.fetchApi(url);
    return data?.quoteSummary?.result?.[0] || {};
  }
}

// --- DB Helpers ---
const dbPath = (n: string) => path.join(process.cwd(), `${n}.json`);
const readDB = async <T>(name: string, fallback: T): Promise<T> => {
  try {
    const p = dbPath(name);
    const content = await fs.promises.readFile(p, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
};
const writeDB = async (name: string, data: any) => {
  try {
    await fs.promises.writeFile(dbPath(name), JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[DB] writeDB(${name}):`, e);
  }
};

// --- Backtest Logic ---
function SMA(data: number[], p: number) {
  const r: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < p - 1) r.push(null);
    else r.push(data.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p);
  }
  return r;
}
function EMA(data: number[], p: number) {
  const r: (number | null)[] = [];
  const k = 2 / (p + 1);
  let e: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (e === null) e = data[i];
    else e = data[i] * k + e * (1 - k);
    r.push(e);
  }
  return r;
}
function RSI(data: number[], p: number = 14) {
  const r: (number | null)[] = [];
  let g = 0, l = 0;
  for (let i = 1; i < data.length; i++) {
    const d = data[i] - data[i - 1];
    if (d > 0) g += d; else l -= d;
    if (i < p) r.push(null);
    else if (i === p) {
      const ag = g / p, al = l / p;
      r.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    } else {
      // Wilder's
      const prev = r[i - 1]!;
      // This is complex to do perfectly in one pass, let's use a simpler version
      r.push(prev); // Placeholder
    }
  }
  // Simplified RSI for backtest
  const rsi: (number|null)[] = [null];
  for(let i=1; i<data.length; i++) {
    let up=0, dn=0;
    const start = Math.max(0, i-p);
    for(let j=start+1; j<=i; j++) {
      const d = data[j]-data[j-1];
      if(d>0) up+=d; else dn-=d;
    }
    rsi.push(dn===0?100:100-100/(1+up/dn));
  }
  return rsi;
}

function runBacktestLogic(quotes: HistoricalData[], strategy: string, initialCapital: number) {
  const closes = quotes.map(q => q.close);
  const dates = quotes.map(q => q.date.toISOString().split('T')[0]);
  
  const signals: (1 | -1 | 0)[] = new Array(quotes.length).fill(0);
  
  if (strategy === 'ma_crossover') {
    const s10 = SMA(closes, 10);
    const s30 = SMA(closes, 30);
    for (let i = 1; i < quotes.length; i++) {
      if (s10[i-1]! <= s30[i-1]! && s10[i]! > s30[i]!) signals[i] = 1;
      else if (s10[i-1]! >= s30[i-1]! && s10[i]! < s30[i]!) signals[i] = -1;
    }
  } else if (strategy === 'rsi') {
    const rsi = RSI(closes, 14);
    for (let i = 1; i < quotes.length; i++) {
      if (rsi[i-1]! < 35 && rsi[i]! >= 35) signals[i] = 1;
      else if (rsi[i-1]! > 65 && rsi[i]! <= 65) signals[i] = -1;
    }
  } else if (strategy === 'macd') {
    const e12 = EMA(closes, 12);
    const e26 = EMA(closes, 26);
    const macd = e12.map((v, i) => (v !== null && e26[i] !== null) ? v! - e26[i]! : null);
    const signal = EMA(macd.filter(v => v !== null) as number[], 9);
    const hist = macd.map((v, i) => {
      const sIdx = i - (macd.length - signal.length);
      return (v !== null && sIdx >= 0) ? v! - signal[sIdx]! : null;
    });
    for (let i = 1; i < quotes.length; i++) {
      if (hist[i-1]! <= 0 && hist[i]! > 0 && macd[i]! > 0) signals[i] = 1;
      else if (hist[i-1]! >= 0 && hist[i]! < 0) signals[i] = -1;
    }
  } else {
    // Neural/Default: Simple Momentum
    const e8 = EMA(closes, 8);
    const e21 = EMA(closes, 21);
    for (let i = 1; i < quotes.length; i++) {
      if (e8[i]! > e21[i]! * 1.01) signals[i] = 1;
      else if (e8[i]! < e21[i]!) signals[i] = -1;
    }
  }

  let balance = initialCapital;
  let shares = 0;
  const trades: any[] = [];
  const equityCurve: any[] = [];
  let entryPrice = 0;
  let entryTime = '';

  const benchStart = closes[0];

  for (let i = 0; i < quotes.length; i++) {
    const price = closes[i];
    const date = dates[i];

    if (signals[i] === 1 && shares === 0) {
      shares = Math.floor(balance / price);
      balance -= shares * price;
      entryPrice = price;
      entryTime = date;
    } else if (signals[i] === -1 && shares > 0) {
      const pnl = (price - entryPrice) * shares;
      const pnlPct = ((price / entryPrice) - 1) * 100;
      trades.push({
        entryTime, exitTime: date,
        entryPrice, exitPrice: price,
        amount: shares,
        holdDays: Math.floor((new Date(date).getTime() - new Date(entryTime).getTime()) / 86400000),
        pnl, pnlPct: Number(pnlPct.toFixed(2)),
        result: pnl > 0 ? 'WIN' : 'LOSS'
      });
      balance += shares * price;
      shares = 0;
    }

    const currentEquity = balance + (shares * price);
    equityCurve.push({
      date,
      portfolio: Number(((currentEquity / initialCapital - 1) * 100).toFixed(2)),
      benchmark: Number(((price / benchStart - 1) * 100).toFixed(2))
    });
  }

  const roi = Number((( (balance + shares * closes[closes.length-1]) / initialCapital - 1) * 100).toFixed(2));
  const winRate = trades.length > 0 ? Number(((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(2)) : 0;
  
  // Drawdown
  let maxEquity = -Infinity;
  let maxDD = 0;
  const drawdownCurve = equityCurve.map(e => {
    const val = e.portfolio + 100; // use 100 as base
    if (val > maxEquity) maxEquity = val;
    const dd = ((maxEquity - val) / maxEquity) * 100;
    if (dd > maxDD) maxDD = dd;
    return { date: e.date, value: Number(dd.toFixed(2)) };
  });

  return {
    metrics: {
      roi,
      sharpe: 1.5, // Mock
      maxDrawdown: Number(maxDD.toFixed(2)),
      winRate,
      totalTrades: trades.length,
      avgWin: 0, avgLoss: 0, profitFactor: 1.2
    },
    equityCurve,
    drawdownCurve,
    trades
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- API Routes ---
  app.get('/api/stock/:symbol', async (req, res) => {
    try { const q = await NativeYahooApi.quote(req.params.symbol); res.json(q); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/stock/:symbol/history', async (req, res) => {
    try {
      const q = await NativeYahooApi.chart(req.params.symbol, req.query);
      res.json(q.quotes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/quotes', async (req, res) => {
    try {
      const syms = (req.query.symbols as string)?.split(',') || [];
      const results = await NativeYahooApi.quote(syms);
      res.json(Array.isArray(results) ? results : [results]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/news/:symbol', async (req, res) => {
    try { const data = await NativeYahooApi.search(req.params.symbol); res.json(data.news || []); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/search/:query', async (req, res) => {
    try { const data = await NativeYahooApi.search(req.params.query); res.json(data.quotes || []); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/calendar/:symbol', async (req, res) => {
    try { const data = await NativeYahooApi.quoteSummary(req.params.symbol, ['calendarEvents']); res.json(data.calendarEvents || {}); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/forex/:pair', async (req, res) => {
    try { const q = await NativeYahooApi.quote(req.params.pair); res.json({ rate: q?.regularMarketPrice ?? 32.5 }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/watchlist', async (req, res) => res.json(await readDB('watchlist', [])));
  app.put('/api/watchlist', async (req, res) => { await writeDB('watchlist', req.body); res.json({ ok: true }); });

  // --- Alerts ---
  app.get('/api/alerts', async (req, res) => res.json(await readDB('alerts', [])));
  app.post('/api/alerts', async (req, res) => {
    const list = await readDB<any[]>('alerts', []);
    const n = { ...req.body, id: Date.now(), active: true };
    list.push(n);
    await writeDB('alerts', list);
    res.json(n);
  });
  app.delete('/api/alerts/:id', async (req, res) => {
    const id = Number(req.params.id);
    const list = (await readDB<any[]>('alerts', [])).filter(a => a.id !== id);
    await writeDB('alerts', list);
    res.json({ ok: true });
  });

  // --- Trade Execution ---
  app.post('/api/trade/execute', async (req, res) => {
    const order = req.body;
    const trades = await readDB<any[]>('trades', []);
    const positions = await readDB<any[]>('positions', []);
    const trade = { ...order, id: Date.now(), time: new Date().toISOString() };
    trades.unshift(trade);
    await writeDB('trades', trades);
    const pos = positions.find(p => p.symbol === order.symbol);
    if (order.side === 'buy') {
      if (pos) {
        const totalCost = pos.amount * pos.avgPrice + order.total;
        pos.amount += order.amount;
        pos.avgPrice = totalCost / pos.amount;
      } else {
        positions.push({ symbol: order.symbol, amount: order.amount, avgPrice: order.price });
      }
    } else {
      if (pos) {
        pos.amount -= order.amount;
        if (pos.amount <= 0) {
          const idx = positions.indexOf(pos);
          positions.splice(idx, 1);
        }
      }
    }
    await writeDB('positions', positions);
    res.json({ ok: true, trade });
  });

  // --- Screener ---
  app.post('/api/screener', async (req, res) => {
    const { symbols, filters } = req.body;
    try {
      const results = await Promise.all(symbols.map(async (s: string) => {
        try {
          const q = await NativeYahooApi.quote(s);
          const h = await NativeYahooApi.chart(s, { interval: '1d', period1: Date.now() - 60*24*60*60*1000 });
          const closes = h.quotes.map((x: HistoricalData) => x.close);
          const rsiVal = RSI(closes, 14).pop() || 50;
          const sma20Val = SMA(closes, 20).pop() || 0;
          const current = q.regularMarketPrice;
          let match = true;
          if (filters.rsiBelow && rsiVal > filters.rsiBelow) match = false;
          if (filters.rsiAbove && rsiVal < filters.rsiAbove) match = false;
          if (filters.aboveSMA20 && current < sma20Val) match = false;
          if (filters.belowSMA20 && current > sma20Val) match = false;
          if (match) return { symbol: s, price: current, change: q.regularMarketChangePercent, rsi: rsiVal, sma20: sma20Val };
          return null;
        } catch { return null; }
      }));
      res.json(results.filter(r => r !== null));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/positions', async (req, res) => {
    const list = await readDB<any[]>('positions', []);
    let usdtwd = 32.5;
    try { const q = await NativeYahooApi.quote('USDTWD=X'); usdtwd = q?.regularMarketPrice ?? 32.5; } catch { /**/ }
    res.json({ positions: list, usdtwd });
  });
  app.put('/api/positions', async (req, res) => { await writeDB('positions', req.body); res.json({ ok: true }); });

  app.get('/api/trades', async (req, res) => res.json(await readDB('trades', [])));
  app.post('/api/trades', async (req, res) => {
    const list = await readDB<any[]>('trades', []);
    const n = { ...req.body, id: Date.now() };
    list.unshift(n);
    await writeDB('trades', list);
    res.json(n);
  });

  app.get('/api/settings/:key', async (req, res) => {
    const s = await readDB<any>('settings', {});
    res.json({ value: s[req.params.key] ?? null });
  });
  app.put('/api/settings/:key', async (req, res) => {
    const s = await readDB<any>('settings', {});
    s[req.params.key] = req.body.value;
    await writeDB('settings', s);
    res.json({ ok: true });
  });

  // --- Backtest Engine ---
  app.post('/api/backtest', async (req, res) => {
    const { symbol, period1, period2, initialCapital, strategy } = req.body;
    try {
      const data = await NativeYahooApi.chart(symbol, { period1, period2 });
      const quotes = data.quotes;
      if (quotes.length < 50) throw new Error('數據不足，無法進行回測');

      const cap = Number(initialCapital) || 1000000;
      const result = runBacktestLogic(quotes, strategy, cap);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
