import { defineCard } from '@hashdo/core';

const marketStateLabels: Record<string, string> = {
  REGULAR: 'Market Open',
  PRE: 'Pre-Market',
  PREPRE: 'Pre-Market',
  POST: 'After Hours',
  POSTPOST: 'After Hours',
  CLOSED: 'Market Closed',
};
export default defineCard({
  name: 'stock-quote',
  description:
    'Look up a stock price by ticker symbol. Shows current price, daily change, and key stats.',

  inputs: {
    symbol: {
      type: 'string',
      required: true,
      description: 'Stock ticker symbol (e.g. AAPL, MSFT, TSLA)',
    },
    currency: {
      type: 'string',
      required: false,
      default: 'USD',
      description: 'Display currency',
      enum: ['USD', 'EUR', 'GBP', 'JPY'] as const,
    },
  },

  async getData({ inputs, state }) {
    const symbol = (inputs.symbol || 'AAPL').toUpperCase();

    // Fetch from Yahoo Finance (public endpoint)
    let quote: Record<string, unknown>;
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
      );
      if (!res.ok) {
        throw new Error(`Yahoo Finance API ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as any;
      const result = data.chart?.result?.[0];
      const meta = result?.meta;
      if (!meta) {
        throw new Error(`No data returned for ${symbol}`);
      }

      quote = {
        symbol,
        name: meta.shortName || meta.symbol || symbol,
        price: meta.regularMarketPrice ?? 0,
        previousClose: meta.chartPreviousClose ?? meta.previousClose ?? 0,
        currency: meta.currency || inputs.currency || 'USD',
        exchange: meta.exchangeName || 'N/A',
        marketState: meta.marketState || 'CLOSED',
      };
    } catch (err) {
      console.error(`[stock-quote] ${err instanceof Error ? err.message : err}`);
      throw new Error(`Failed to fetch data for "${symbol}". The API may be unavailable — try again in a moment.`);
    }

    const price = quote.price as number;
    const previousClose = quote.previousClose as number;
    const change = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    // Track in state
    const history = (state.lookupHistory as string[]) ?? [];
    if (!history.includes(symbol)) history.push(symbol);

    return {
      viewModel: {
        ...quote,
        change: change.toFixed(2),
        changePercent: changePercent.toFixed(2),
        isPositive: change >= 0,
        arrow: change >= 0 ? '▲' : '▼',
        color: change >= 0 ? '#22c55e' : '#ef4444',
        marketLabel: marketStateLabels[quote.marketState as string] ?? 'Market Closed',
        lookupCount: history.length,
      },
      state: {
        lookupHistory: history,
        lastLookup: symbol,
        lastPrice: price,
      },
    };
  },

  actions: {
    addToWatchlist: {
      label: 'Add to Watchlist',
      description: 'Add this stock to your personal watchlist for tracking',
      async handler({ cardInputs, state }) {
        const watchlist = (state.watchlist as string[]) ?? [];
        const symbol = (cardInputs.symbol as string).toUpperCase();

        if (watchlist.includes(symbol)) {
          return { message: `${symbol} is already on your watchlist` };
        }

        watchlist.push(symbol);
        return {
          state: { ...state, watchlist },
          message: `Added ${symbol} to watchlist. Tracking: ${watchlist.join(', ')}`,
        };
      },
    },

    setAlert: {
      label: 'Set Price Alert',
      description: 'Set an alert when the stock reaches a target price',
      inputs: {
        targetPrice: {
          type: 'number',
          required: true,
          description: 'Target price to trigger the alert',
        },
        direction: {
          type: 'string',
          required: true,
          description: 'Alert when price goes above or below target',
          enum: ['above', 'below'] as const,
        },
      },
      permission: 'confirm',
      async handler({ cardInputs, actionInputs, state }) {
        const symbol = (cardInputs.symbol as string).toUpperCase();
        const alerts = (state.alerts as Record<string, unknown>[]) ?? [];

        alerts.push({
          symbol,
          targetPrice: actionInputs.targetPrice,
          direction: actionInputs.direction,
          createdAt: new Date().toISOString(),
        });

        return {
          state: { ...state, alerts },
          message: `Alert set: notify when ${symbol} goes ${actionInputs.direction} $${actionInputs.targetPrice}`,
        };
      },
    },
  },

  template: (vm) => `
    <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:340px; background:#fff; border-radius:16px; overflow:hidden;">
      <div style="padding:20px 24px 16px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          <div style="width:40px; height:40px; border-radius:10px; background:${vm.isPositive ? '#f0fdf4' : '#fef2f2'}; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; color:${vm.color};">${(vm.symbol as string).charAt(0)}</div>
          <div>
            <div style="font-size:16px; font-weight:700; color:#111; letter-spacing:-0.01em;">${vm.symbol}</div>
            <div style="font-size:12px; color:#999; font-weight:400;">${vm.name}</div>
          </div>
          <div style="margin-left:auto; padding:4px 10px; border-radius:20px; background:${vm.isPositive ? '#f0fdf4' : '#fef2f2'}; color:${vm.color}; font-size:12px; font-weight:600;">${vm.arrow} ${vm.changePercent}%</div>
        </div>
        <div style="margin-bottom:4px;">
          <span style="font-size:36px; font-weight:700; color:#111; letter-spacing:-0.02em;">${typeof vm.price === 'number' ? (vm.price as number).toFixed(2) : vm.price}</span>
          <span style="font-size:14px; color:#999; font-weight:400; margin-left:4px;">${vm.currency}</span>
        </div>
        <div style="font-size:13px; color:${vm.color}; font-weight:500;">
          ${vm.isPositive ? '+' : ''}${vm.change} today
        </div>
      </div>
      <div style="padding:12px 24px; background:#fafafa; border-top:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:11px; color:#bbb; font-weight:500; text-transform:uppercase; letter-spacing:0.05em;">${vm.exchange}</span>
        <span style="font-size:11px; color:#bbb;">${vm.marketLabel}</span>
      </div>
    </div>
  `,
});
