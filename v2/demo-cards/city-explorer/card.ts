import { defineCard } from '@hashdo/core';

/**
 * #do/city — Interactive city explorer card.
 *
 * Combines weather (Open-Meteo), country data (REST Countries), and local time
 * into a single rich dashboard. Demonstrates multi-API mashup, stateful
 * favorites, and multiple actions — the kind of card only HashDo can build.
 *
 * All APIs are free and require no keys.
 */
export default defineCard({
  name: 'do-city',
  description:
    'Explore any city in the world. Shows current weather, local time, country flag, population, currency, and languages in a single card. Call this when the user types #do/city or asks about a city.',

  inputs: {
    city: {
      type: 'string',
      required: true,
      description:
        'City name (e.g. "Paris", "Tokyo", "Cape Town"). Resolved via geocoding.',
    },
    units: {
      type: 'string',
      required: false,
      default: 'celsius',
      description: 'Temperature units',
      enum: ['celsius', 'fahrenheit'] as const,
    },
  },

  async getData({ inputs, state }) {
    const cityQuery = inputs.city || 'London';
    const tempUnit = inputs.units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const unitSymbol = tempUnit === 'celsius' ? 'C' : 'F';

    // ── 1. Geocode city ──────────────────────────────────────────────
    const geo = await geocodeCity(cityQuery);
    if (!geo) {
      throw new Error(
        `Could not find a city matching "${cityQuery}". Try a more specific name.`
      );
    }

    // ── 2. Fetch weather + country data in parallel ──────────────────
    const [weather, country] = await Promise.all([
      fetchWeather(geo.lat, geo.lon, tempUnit),
      fetchCountryData(geo.countryCode),
    ]);

    // ── 3. Compute local time from timezone ──────────────────────────
    const localTime = getLocalTime(weather.timezone);

    // ── 4. Determine background gradient based on weather + time ─────
    const isNight = localTime.hour < 6 || localTime.hour >= 20;
    const gradient = pickGradient(weather.weatherCode, isNight);

    // ── 5. Build rich text output for AI clients ─────────────────────
    let textOutput = `## ${geo.displayName} ${country.flag}\n\n`;
    textOutput += `**Local time:** ${localTime.formatted}\n\n`;
    textOutput += `### Weather\n`;
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| Conditions | ${weather.icon} ${weather.condition} |\n`;
    textOutput += `| Temperature | **${weather.temp}°${unitSymbol}** (feels like ${weather.feelsLike}°${unitSymbol}) |\n`;
    if (weather.high !== null && weather.low !== null) {
      textOutput += `| High / Low | ${weather.high}°${unitSymbol} / ${weather.low}°${unitSymbol} |\n`;
    }
    textOutput += `| Humidity | ${weather.humidity}% |\n`;
    textOutput += `| Wind | ${weather.windSpeed} km/h |\n`;
    if (weather.sunrise && weather.sunset) {
      textOutput += `| Sunrise / Sunset | ${weather.sunrise} / ${weather.sunset} |\n`;
    }
    textOutput += `\n### Country — ${country.name}\n`;
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| Capital | ${country.capital} |\n`;
    textOutput += `| Population | ${formatNumber(country.population)} |\n`;
    textOutput += `| Currency | ${country.currency} |\n`;
    textOutput += `| Languages | ${country.languages} |\n`;
    textOutput += `| Region | ${country.region}${country.subregion ? ` — ${country.subregion}` : ''} |\n`;
    textOutput += `| Timezone | ${weather.timezone} |\n`;

    // ── 6. Update state ──────────────────────────────────────────────
    const lookupHistory = (state.lookupHistory as string[]) ?? [];
    if (!lookupHistory.includes(geo.displayName)) {
      lookupHistory.push(geo.displayName);
    }

    // ── 7. View model ────────────────────────────────────────────────
    const viewModel = {
      // City
      cityName: geo.name,
      displayName: geo.displayName,
      lat: geo.lat.toFixed(2),
      lon: geo.lon.toFixed(2),

      // Time
      localTime: localTime.formatted,
      timeOfDay: isNight ? 'night' : 'day',

      // Weather
      weatherIcon: weather.icon,
      weatherCondition: weather.condition,
      temp: weather.temp,
      feelsLike: weather.feelsLike,
      high: weather.high,
      low: weather.low,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
      uvIndex: weather.uvIndex,
      sunrise: weather.sunrise,
      sunset: weather.sunset,
      unitSymbol,
      timezone: weather.timezone,

      // Country
      countryName: country.name,
      countryFlag: country.flag,
      capital: country.capital,
      population: formatNumber(country.population),
      currency: country.currency,
      languages: country.languages,
      region: country.region,
      subregion: country.subregion,

      // Style
      gradient,

      // State
      isFavorite: ((state.favorites as string[]) ?? []).includes(
        geo.displayName
      ),
      lookupCount: lookupHistory.length,
    };

    return {
      viewModel,
      textOutput,
      state: {
        ...state,
        lookupHistory,
        lastCity: geo.displayName,
      },
    };
  },

  actions: {
    toggleFavorite: {
      label: 'Toggle Favorite',
      description: 'Add or remove this city from your favorites list',
      async handler({ cardInputs, state }) {
        const favorites = (state.favorites as string[]) ?? [];
        const city = cardInputs.city as string;

        // Resolve the display name
        const geo = await geocodeCity(city);
        const name = geo?.displayName ?? city;

        const idx = favorites.indexOf(name);
        if (idx >= 0) {
          favorites.splice(idx, 1);
          return {
            state: { ...state, favorites },
            message: `Removed ${name} from favorites.`,
          };
        }

        favorites.push(name);
        return {
          state: { ...state, favorites },
          message: `Added ${name} to favorites! (${favorites.length} total)`,
        };
      },
    },

    listFavorites: {
      label: 'Show Favorites',
      description: 'List all cities saved to your favorites',
      async handler({ state }) {
        const favorites = (state.favorites as string[]) ?? [];
        if (favorites.length === 0) {
          return { message: 'No favorite cities saved yet.' };
        }
        return {
          message: `Your favorite cities (${favorites.length}):\n${favorites.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
        };
      },
    },

    toggleUnits: {
      label: 'Switch Temperature Units',
      description: 'Toggle between Celsius and Fahrenheit',
      async handler({ state }) {
        const current = (state.preferredUnits as string) || 'celsius';
        const next = current === 'celsius' ? 'fahrenheit' : 'celsius';
        return {
          state: { ...state, preferredUnits: next },
          message: `Switched to ${next}.`,
        };
      },
    },
  },

  template: (vm) => `
    <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:380px; border-radius:20px; overflow:hidden; color:#fff; background:${vm.gradient}; box-shadow:0 8px 32px rgba(0,0,0,0.18);">
      <!-- Header: City + Flag + Time -->
      <div style="padding:24px 24px 0;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-size:28px; font-weight:700; letter-spacing:-0.02em; line-height:1.1;">
              ${vm.cityName}
            </div>
            <div style="font-size:14px; opacity:0.85; margin-top:4px;">
              ${vm.countryName} ${vm.countryFlag}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px; font-weight:600; letter-spacing:-0.01em;">
              ${vm.localTime}
            </div>
            <div style="font-size:11px; opacity:0.7; margin-top:2px;">
              ${vm.timezone}
            </div>
          </div>
        </div>
      </div>

      <!-- Weather hero -->
      <div style="padding:20px 24px; display:flex; align-items:center; gap:16px;">
        <span style="font-size:56px; line-height:1;">${vm.weatherIcon}</span>
        <div>
          <div style="font-size:44px; font-weight:700; letter-spacing:-0.03em; line-height:1;">
            ${vm.temp}<span style="font-size:22px; font-weight:400; opacity:0.8;">°${vm.unitSymbol}</span>
          </div>
          <div style="font-size:15px; opacity:0.9; margin-top:2px;">${vm.weatherCondition}</div>
          <div style="font-size:12px; opacity:0.7;">Feels like ${vm.feelsLike}°${vm.unitSymbol}</div>
        </div>
      </div>

      <!-- Weather details row -->
      <div style="padding:0 24px 16px; display:flex; gap:12px; flex-wrap:wrap;">
        ${vm.high !== null ? `
        <div style="background:rgba(255,255,255,0.15); backdrop-filter:blur(8px); border-radius:10px; padding:8px 12px; flex:1; min-width:70px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7;">H / L</div>
          <div style="font-size:14px; font-weight:600; margin-top:2px;">${vm.high}° / ${vm.low}°</div>
        </div>` : ''}
        <div style="background:rgba(255,255,255,0.15); backdrop-filter:blur(8px); border-radius:10px; padding:8px 12px; flex:1; min-width:70px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7;">Humidity</div>
          <div style="font-size:14px; font-weight:600; margin-top:2px;">${vm.humidity}%</div>
        </div>
        <div style="background:rgba(255,255,255,0.15); backdrop-filter:blur(8px); border-radius:10px; padding:8px 12px; flex:1; min-width:70px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7;">Wind</div>
          <div style="font-size:14px; font-weight:600; margin-top:2px;">${vm.windSpeed} km/h</div>
        </div>
        ${vm.uvIndex !== undefined ? `
        <div style="background:rgba(255,255,255,0.15); backdrop-filter:blur(8px); border-radius:10px; padding:8px 12px; flex:1; min-width:70px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.7;">UV</div>
          <div style="font-size:14px; font-weight:600; margin-top:2px;">${vm.uvIndex}</div>
        </div>` : ''}
      </div>

      ${vm.sunrise ? `
      <div style="padding:0 24px 16px; display:flex; gap:16px; font-size:12px; opacity:0.75;">
        <span>Sunrise ${vm.sunrise}</span>
        <span>Sunset ${vm.sunset}</span>
      </div>` : ''}

      <!-- Country info -->
      <div style="background:rgba(0,0,0,0.15); backdrop-filter:blur(8px); padding:16px 24px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px 20px;">
          <div>
            <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.6;">Capital</div>
            <div style="font-size:13px; font-weight:500; margin-top:2px;">${vm.capital}</div>
          </div>
          <div>
            <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.6;">Population</div>
            <div style="font-size:13px; font-weight:500; margin-top:2px;">${vm.population}</div>
          </div>
          <div>
            <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.6;">Currency</div>
            <div style="font-size:13px; font-weight:500; margin-top:2px;">${vm.currency}</div>
          </div>
          <div>
            <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.6;">Languages</div>
            <div style="font-size:13px; font-weight:500; margin-top:2px;">${vm.languages}</div>
          </div>
        </div>
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.15); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; opacity:0.6;">${vm.region}${vm.subregion ? ' — ' + vm.subregion : ''}</span>
          <span style="font-size:11px; opacity:0.6;">${vm.lat}°, ${vm.lon}°</span>
        </div>
      </div>
    </div>
  `,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Geocode a city name using Open-Meteo's geocoding API */
async function geocodeCity(
  city: string
): Promise<{
  lat: number;
  lon: number;
  name: string;
  displayName: string;
  countryCode: string;
} | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`;
    const res = await fetch(url);
    const data = (await res.json()) as any;
    const r = data.results?.[0];
    if (!r) return null;

    const parts = [r.name];
    if (r.admin1) parts.push(r.admin1);
    if (r.country) parts.push(r.country);

    return {
      lat: r.latitude,
      lon: r.longitude,
      name: r.name,
      displayName: parts.join(', '),
      countryCode: r.country_code?.toUpperCase() ?? '',
    };
  } catch {
    return null;
  }
}

/** Fetch current weather from Open-Meteo */
async function fetchWeather(
  lat: number,
  lon: number,
  tempUnit: string
): Promise<{
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  uvIndex?: number;
  high: number | null;
  low: number | null;
  sunrise: string;
  sunset: string;
  icon: string;
  condition: string;
  timezone: string;
}> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index'
  );
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,sunrise,sunset'
  );
  url.searchParams.set('temperature_unit', tempUnit);
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Weather API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as any;
  const current = data.current;
  if (!current) throw new Error('No weather data returned');

  const daily = data.daily;
  const { icon, condition } = weatherCodeToDescription(current.weather_code);

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return {
    temp: Math.round(current.temperature_2m),
    feelsLike: Math.round(current.apparent_temperature),
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    weatherCode: current.weather_code,
    uvIndex: current.uv_index,
    high:
      daily?.temperature_2m_max?.[0] !== undefined
        ? Math.round(daily.temperature_2m_max[0])
        : null,
    low:
      daily?.temperature_2m_min?.[0] !== undefined
        ? Math.round(daily.temperature_2m_min[0])
        : null,
    sunrise: formatTime(daily?.sunrise?.[0]),
    sunset: formatTime(daily?.sunset?.[0]),
    icon,
    condition,
    timezone: data.timezone ?? 'UTC',
  };
}

/** Fetch country information from REST Countries API */
async function fetchCountryData(countryCode: string): Promise<{
  name: string;
  flag: string;
  capital: string;
  population: number;
  currency: string;
  languages: string;
  region: string;
  subregion: string;
}> {
  const fallback = {
    name: countryCode,
    flag: '',
    capital: 'N/A',
    population: 0,
    currency: 'N/A',
    languages: 'N/A',
    region: 'N/A',
    subregion: '',
  };

  if (!countryCode) return fallback;

  try {
    const res = await fetch(
      `https://restcountries.com/v3.1/alpha/${countryCode}?fields=name,flag,capital,population,currencies,languages,region,subregion`
    );
    if (!res.ok) return fallback;

    const data = (await res.json()) as any;

    // Extract currency (first one)
    const currencies = data.currencies ?? {};
    const currencyKey = Object.keys(currencies)[0] ?? '';
    const currencyObj = currencies[currencyKey];
    const currency = currencyObj
      ? `${currencyObj.symbol ?? ''} ${currencyObj.name ?? currencyKey}`.trim()
      : 'N/A';

    // Extract languages (comma-separated)
    const languages = data.languages
      ? Object.values(data.languages).join(', ')
      : 'N/A';

    return {
      name: data.name?.common ?? countryCode,
      flag: data.flag ?? '',
      capital: Array.isArray(data.capital) ? data.capital[0] : data.capital ?? 'N/A',
      population: data.population ?? 0,
      currency,
      languages,
      region: data.region ?? 'N/A',
      subregion: data.subregion ?? '',
    };
  } catch {
    return fallback;
  }
}

/** Get the local time for a timezone identifier */
function getLocalTime(timezone: string): { formatted: string; hour: number } {
  try {
    const now = new Date();
    const formatted = now.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    });
    const hour = parseInt(
      now.toLocaleString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }),
      10
    );
    return { formatted, hour: isNaN(hour) ? 12 : hour };
  } catch {
    return { formatted: '--:--', hour: 12 };
  }
}

/** Pick a gradient based on weather and time of day */
function pickGradient(weatherCode: number, isNight: boolean): string {
  if (isNight) {
    return 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)';
  }

  // Stormy / thunder
  if (weatherCode >= 95) {
    return 'linear-gradient(135deg, #373B44 0%, #4286f4 100%)';
  }
  // Rain / drizzle
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82)
  ) {
    return 'linear-gradient(135deg, #4B79A1 0%, #283E51 100%)';
  }
  // Snow
  if (weatherCode >= 71 && weatherCode <= 77) {
    return 'linear-gradient(135deg, #E6DADA 0%, #274046 100%)';
  }
  // Fog
  if (weatherCode >= 45 && weatherCode <= 48) {
    return 'linear-gradient(135deg, #606c88 0%, #3f4c6b 100%)';
  }
  // Cloudy / overcast
  if (weatherCode >= 2 && weatherCode <= 3) {
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  }
  // Clear / mainly clear
  return 'linear-gradient(135deg, #f5af19 0%, #f12711 30%, #e44d26 60%, #c94b4b 100%)';
}

/** Format a number with locale grouping (1,234,567) */
function formatNumber(n: number): string {
  if (!n) return 'N/A';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toLocaleString();
}

/** Map WMO weather codes to emoji icon and condition text */
function weatherCodeToDescription(code: number): {
  icon: string;
  condition: string;
} {
  const map: Record<number, { icon: string; condition: string }> = {
    0: { icon: '\u2600\uFE0F', condition: 'Clear sky' },
    1: { icon: '\uD83C\uDF24\uFE0F', condition: 'Mainly clear' },
    2: { icon: '\u26C5', condition: 'Partly cloudy' },
    3: { icon: '\u2601\uFE0F', condition: 'Overcast' },
    45: { icon: '\uD83C\uDF2B\uFE0F', condition: 'Foggy' },
    48: { icon: '\uD83C\uDF2B\uFE0F', condition: 'Rime fog' },
    51: { icon: '\uD83C\uDF26\uFE0F', condition: 'Light drizzle' },
    53: { icon: '\uD83C\uDF26\uFE0F', condition: 'Moderate drizzle' },
    55: { icon: '\uD83C\uDF27\uFE0F', condition: 'Dense drizzle' },
    61: { icon: '\uD83C\uDF27\uFE0F', condition: 'Slight rain' },
    63: { icon: '\uD83C\uDF27\uFE0F', condition: 'Moderate rain' },
    65: { icon: '\uD83C\uDF27\uFE0F', condition: 'Heavy rain' },
    71: { icon: '\uD83C\uDF28\uFE0F', condition: 'Slight snow' },
    73: { icon: '\uD83C\uDF28\uFE0F', condition: 'Moderate snow' },
    75: { icon: '\u2744\uFE0F', condition: 'Heavy snow' },
    80: { icon: '\uD83C\uDF26\uFE0F', condition: 'Rain showers' },
    81: { icon: '\uD83C\uDF27\uFE0F', condition: 'Moderate showers' },
    82: { icon: '\u26C8\uFE0F', condition: 'Violent showers' },
    95: { icon: '\u26C8\uFE0F', condition: 'Thunderstorm' },
    96: { icon: '\u26C8\uFE0F', condition: 'Thunderstorm with hail' },
    99: { icon: '\u26C8\uFE0F', condition: 'Thunderstorm, heavy hail' },
  };
  return map[code] ?? { icon: '\uD83C\uDF21\uFE0F', condition: `Code ${code}` };
}
