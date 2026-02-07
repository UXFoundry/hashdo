import { defineCard } from '@hashdo/core';

/**
 * Stock Quote card — shows current price and change for a stock ticker.
 *
 * Uses Yahoo Finance v8 API (public, no key required).
 * Includes a watchlist action for tracking multiple stocks.
 */
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
    const symbol = inputs.symbol.toUpperCase();

    // Fetch from Yahoo Finance (public endpoint)
    let quote: Record<string, unknown>;
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
      );
      const data = (await res.json()) as any;
      const result = data.chart?.result?.[0];
      const meta = result?.meta ?? {};

      quote = {
        symbol,
        name: meta.shortName || meta.symbol || symbol,
        price: meta.regularMarketPrice ?? 0,
        previousClose: meta.chartPreviousClose ?? meta.previousClose ?? 0,
        currency: meta.currency || inputs.currency || 'USD',
        exchange: meta.exchangeName || 'N/A',
        marketState: meta.marketState || 'UNKNOWN',
      };
    } catch {
      // Fallback with demo data if API unavailable
      quote = {
        symbol,
        name: symbol,
        price: 150.0 + Math.random() * 50,
        previousClose: 148.0 + Math.random() * 50,
        currency: inputs.currency || 'USD',
        exchange: 'DEMO',
        marketState: 'REGULAR',
      };
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
    <div style="font-family:system-ui,sans-serif; padding:20px; max-width:320px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <div>
          <div style="font-size:24px; font-weight:700;">${vm.symbol}</div>
          <div style="font-size:13px; color:#888;">${vm.name} · ${vm.exchange}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px; font-weight:700;">
            ${typeof vm.price === 'number' ? (vm.price as number).toFixed(2) : vm.price}
          </div>
          <div style="font-size:14px; color:${vm.color}; font-weight:600;">
            ${vm.arrow} ${vm.change} (${vm.changePercent}%)
          </div>
        </div>
      </div>
      <div style="margin-top:16px; padding-top:12px; border-top:1px solid #eee; font-size:12px; color:#999;">
        ${vm.currency} · ${vm.marketState === 'REGULAR' ? 'Market Open' : vm.marketState}
      </div>
    </div>
  `,
});
