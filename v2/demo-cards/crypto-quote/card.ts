import { defineCard } from '@hashdo/core';

export default defineCard({
  name: 'do-crypto',
  description:
    'Look up a cryptocurrency price by coin ID. Shows current price, 24h change, and market cap.',

  inputs: {
    coin: {
      type: 'string',
      required: true,
      description: 'CoinGecko coin ID (e.g. bitcoin, ethereum, solana)',
    },
    currency: {
      type: 'string',
      required: false,
      default: 'usd',
      description: 'Display currency',
      enum: ['usd', 'eur', 'gbp'] as const,
    },
  },

  async getData({ inputs, state }) {
    const coin = (inputs.coin || 'bitcoin').toLowerCase();
    const currency = (inputs.currency ?? 'usd').toLowerCase();

    let data: {
      name: string;
      symbol: string;
      price: number;
      change24h: number;
      changePercent24h: number;
      marketCap: number;
      image: string;
    };

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coin}?localization=false&tickers=false&community_data=false&developer_data=false`
      );
      if (!res.ok) {
        throw new Error(`CoinGecko API ${res.status}: ${res.statusText}`);
      }
      const json = (await res.json()) as any;
      const marketData = json.market_data;
      if (!marketData) {
        throw new Error(`No market data returned for ${coin}`);
      }

      data = {
        name: json.name,
        symbol: (json.symbol as string).toUpperCase(),
        price: marketData.current_price[currency] ?? marketData.current_price.usd,
        change24h: marketData.price_change_24h_in_currency?.[currency] ?? marketData.price_change_24h ?? 0,
        changePercent24h: marketData.price_change_percentage_24h ?? 0,
        marketCap: marketData.market_cap[currency] ?? marketData.market_cap.usd ?? 0,
        image: json.image?.small ?? '',
      };
    } catch (err) {
      console.error(`[crypto-quote] ${err instanceof Error ? err.message : err}`);
      throw new Error(`Failed to fetch data for "${coin}". The API may be rate-limited — try again in a moment.`);
    }

    const isPositive = data.change24h >= 0;
    const color = isPositive ? '#22c55e' : '#ef4444';
    const currencyUpper = currency.toUpperCase();

    const formatMarketCap = (cap: number): string => {
      if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}T`;
      if (cap >= 1e9) return `${(cap / 1e9).toFixed(2)}B`;
      if (cap >= 1e6) return `${(cap / 1e6).toFixed(2)}M`;
      return cap.toLocaleString();
    };

    // Track in state
    const history = (state.lookupHistory as string[]) ?? [];
    if (!history.includes(coin)) history.push(coin);

    return {
      viewModel: {
        coin,
        name: data.name,
        symbol: data.symbol,
        price: data.price,
        change24h: data.change24h.toFixed(2),
        changePercent24h: data.changePercent24h.toFixed(2),
        marketCap: formatMarketCap(data.marketCap),
        image: data.image,
        isPositive,
        arrow: isPositive ? '▲' : '▼',
        color,
        currency: currencyUpper,
        lookupCount: history.length,
      },
      state: {
        lookupHistory: history,
        lastLookup: coin,
        lastPrice: data.price,
      },
    };
  },

  actions: {
    addToWatchlist: {
      label: 'Add to Watchlist',
      description: 'Add this coin to your personal watchlist for tracking',
      async handler({ cardInputs, state }) {
        const watchlist = (state.watchlist as string[]) ?? [];
        const coin = (cardInputs.coin as string).toLowerCase();

        if (watchlist.includes(coin)) {
          return { message: `${coin} is already on your watchlist` };
        }

        watchlist.push(coin);
        return {
          state: { ...state, watchlist },
          message: `Added ${coin} to watchlist. Tracking: ${watchlist.join(', ')}`,
        };
      },
    },
  },

  template: (vm) => `
    <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:340px; background:#fff; border-radius:16px; overflow:hidden;">
      <div style="padding:20px 24px 16px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          ${
            vm.image
              ? `<img src="${vm.image}" alt="${vm.symbol}" style="width:40px; height:40px; border-radius:10px;" />`
              : `<div style="width:40px; height:40px; border-radius:10px; background:${vm.isPositive ? '#f0fdf4' : '#fef2f2'}; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; color:${vm.color};">${(vm.symbol as string).charAt(0)}</div>`
          }
          <div>
            <div style="font-size:16px; font-weight:700; color:#111; letter-spacing:-0.01em;">${vm.symbol}</div>
            <div style="font-size:12px; color:#999; font-weight:400;">${vm.name}</div>
          </div>
          <div style="margin-left:auto; padding:4px 10px; border-radius:20px; background:${vm.isPositive ? '#f0fdf4' : '#fef2f2'}; color:${vm.color}; font-size:12px; font-weight:600;">${vm.arrow} ${vm.changePercent24h}%</div>
        </div>
        <div style="margin-bottom:4px;">
          <span style="font-size:36px; font-weight:700; color:#111; letter-spacing:-0.02em;">${typeof vm.price === 'number' ? (vm.price as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : vm.price}</span>
          <span style="font-size:14px; color:#999; font-weight:400; margin-left:4px;">${vm.currency}</span>
        </div>
        <div style="font-size:13px; color:${vm.color}; font-weight:500;">
          ${vm.isPositive ? '+' : ''}${vm.change24h} today
        </div>
      </div>
      <div style="padding:12px 24px; background:#fafafa; border-top:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:11px; color:#bbb; font-weight:500; text-transform:uppercase; letter-spacing:0.05em;">MCap ${vm.marketCap}</span>
        <span style="font-size:11px; color:#bbb;">24h change</span>
      </div>
    </div>
  `,
});
