import { defineCard } from '@hashdo/core';

/**
 * #do/weather — Current weather conditions.
 *
 * When no location is provided, auto-detects via IP geolocation.
 * Uses Open-Meteo (weather) and ip-api.com (geolocation) — both free, no keys.
 */
export default defineCard({
  name: 'do-weather',
  description:
    'Get current weather for any location. Call this when the user types #do/weather or asks for weather. If no location is given, auto-detects the user\'s location via IP geolocation.',

  inputs: {
    city: {
      type: 'string',
      required: false,
      description:
        'City or place name (e.g. "New York", "Tokyo"). Leave empty to auto-detect location.',
    },
    latitude: {
      type: 'number',
      required: false,
      description: 'Latitude (-90 to 90). If omitted, resolved from city or IP.',
    },
    longitude: {
      type: 'number',
      required: false,
      description: 'Longitude (-180 to 180). If omitted, resolved from city or IP.',
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
    // ── 1. Resolve location ──────────────────────────────────────────
    let lat = inputs.latitude as number | undefined;
    let lon = inputs.longitude as number | undefined;
    let locationName = (inputs.city as string) || '';

    // If city given but no coords, geocode it
    if (locationName && (lat === undefined || lon === undefined)) {
      const geo = await geocodeCity(locationName);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        locationName = geo.displayName || locationName;
      }
    }

    // If still no coords, fall back to IP geolocation
    if (lat === undefined || lon === undefined) {
      const ipGeo = await geolocateByIp();
      lat = ipGeo.lat;
      lon = ipGeo.lon;
      locationName = locationName || ipGeo.city;
    }

    // ── 2. Fetch weather ─────────────────────────────────────────────
    const tempUnit = inputs.units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const unitSymbol = tempUnit === 'celsius' ? '°C' : '°F';
    const windUnit = 'kmh';

    let weather: WeatherData;
    try {
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
      url.searchParams.set('wind_speed_unit', windUnit);
      url.searchParams.set('timezone', 'auto');
      url.searchParams.set('forecast_days', '1');

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Open-Meteo API ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as any;
      const current = data.current;
      if (!current) {
        throw new Error('No weather data returned');
      }
      const daily = data.daily;

      weather = {
        temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code,
        uvIndex: current.uv_index,
        high: daily?.temperature_2m_max?.[0],
        low: daily?.temperature_2m_min?.[0],
        sunrise: daily?.sunrise?.[0],
        sunset: daily?.sunset?.[0],
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[weather] ${detail}`);
      throw new Error(`Failed to fetch weather data: ${detail}`);
    }

    const { icon, condition } = weatherCodeToDescription(weather.weatherCode);

    const temp = Math.round(weather.temperature);
    const feelsLike = Math.round(weather.feelsLike);
    const high = weather.high !== undefined ? Math.round(weather.high) : null;
    const low = weather.low !== undefined ? Math.round(weather.low) : null;

    // ── 3. Format sunrise/sunset times ───────────────────────────────
    const formatTime = (iso?: string) => {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      } catch {
        return iso;
      }
    };

    const sunrise = formatTime(weather.sunrise);
    const sunset = formatTime(weather.sunset);

    // ── 4. Build text output for chat ────────────────────────────────
    let textOutput = `${icon} **${locationName}** — ${condition}\n\n`;
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| Temperature | **${temp}${unitSymbol}** (feels like ${feelsLike}${unitSymbol}) |\n`;
    if (high !== null && low !== null) {
      textOutput += `| High / Low | ${high}${unitSymbol} / ${low}${unitSymbol} |\n`;
    }
    textOutput += `| Humidity | ${weather.humidity}% |\n`;
    textOutput += `| Wind | ${weather.windSpeed} km/h |\n`;
    if (weather.uvIndex !== undefined) {
      textOutput += `| UV Index | ${weather.uvIndex} |\n`;
    }
    if (sunrise && sunset) {
      textOutput += `| Sunrise / Sunset | ${sunrise} / ${sunset} |\n`;
    }

    // ── 5. Build viewModel for HTML template ─────────────────────────
    const viewModel = {
      locationName,
      icon,
      condition,
      temp,
      feelsLike,
      high,
      low,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
      uvIndex: weather.uvIndex,
      sunrise,
      sunset,
      unitSymbol,
    };

    return {
      viewModel,
      textOutput,
      state: {
        lastChecked: new Date().toISOString(),
        lastLocation: locationName,
        checkCount: ((state.checkCount as number) || 0) + 1,
      },
    };
  },

  actions: {
    toggleUnits: {
      label: 'Switch Units',
      description: 'Toggle between Celsius and Fahrenheit',
      async handler({ state }) {
        const current = (state.preferredUnits as string) || 'celsius';
        const next = current === 'celsius' ? 'fahrenheit' : 'celsius';
        return {
          state: { ...state, preferredUnits: next },
          message: `Switched to ${next}`,
        };
      },
    },
  },

  template: (vm) => `
    <div style="font-family:system-ui,sans-serif; padding:20px; max-width:320px;
                background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
                border-radius:12px; color:white;">
      <div style="font-size:14px; opacity:0.9; margin-bottom:4px;">
        ${vm.locationName}
      </div>
      <div style="display:flex; align-items:center; gap:12px; margin:12px 0;">
        <span style="font-size:48px;">${vm.icon}</span>
        <div>
          <div style="font-size:36px; font-weight:700;">${vm.temp}${vm.unitSymbol}</div>
          <div style="font-size:13px; opacity:0.85;">Feels like ${vm.feelsLike}${vm.unitSymbol}</div>
        </div>
      </div>
      <div style="font-size:14px; margin-bottom:12px;">${vm.condition}</div>
      ${vm.high !== null ? `<div style="font-size:13px; opacity:0.85; margin-bottom:8px;">H: ${vm.high}${vm.unitSymbol}  L: ${vm.low}${vm.unitSymbol}</div>` : ''}
      <div style="display:flex; gap:16px; font-size:13px; opacity:0.85; flex-wrap:wrap;">
        <span>💧 ${vm.humidity}%</span>
        <span>💨 ${vm.windSpeed} km/h</span>
        ${vm.uvIndex !== undefined ? `<span>☀️ UV ${vm.uvIndex}</span>` : ''}
      </div>
      ${vm.sunrise ? `<div style="margin-top:8px; font-size:12px; opacity:0.7;">🌅 ${vm.sunrise}  🌇 ${vm.sunset}</div>` : ''}
    </div>
  `,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  uvIndex?: number;
  high?: number;
  low?: number;
  sunrise?: string;
  sunset?: string;
}

/** Geocode a city name to coordinates using Open-Meteo's geocoding API */
async function geocodeCity(
  city: string
): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`;
    const res = await fetch(url);
    const data = (await res.json()) as any;
    const result = data.results?.[0];
    if (!result) return null;

    const parts = [result.name];
    if (result.admin1) parts.push(result.admin1);
    if (result.country) parts.push(result.country);

    return {
      lat: result.latitude,
      lon: result.longitude,
      displayName: parts.join(', '),
    };
  } catch {
    return null;
  }
}

/** Get approximate location from IP address */
async function geolocateByIp(): Promise<{
  lat: number;
  lon: number;
  city: string;
}> {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=lat,lon,city,regionName,country');
    const data = (await res.json()) as any;
    const parts = [data.city, data.regionName, data.country].filter(Boolean);
    return {
      lat: data.lat ?? 0,
      lon: data.lon ?? 0,
      city: parts.join(', ') || 'Unknown Location',
    };
  } catch {
    return { lat: 40.7128, lon: -74.006, city: 'New York, NY, USA' };
  }
}

/** Map WMO weather codes to emoji and description */
function weatherCodeToDescription(code: number): {
  icon: string;
  condition: string;
} {
  const map: Record<number, { icon: string; condition: string }> = {
    0: { icon: '☀️', condition: 'Clear sky' },
    1: { icon: '🌤️', condition: 'Mainly clear' },
    2: { icon: '⛅', condition: 'Partly cloudy' },
    3: { icon: '☁️', condition: 'Overcast' },
    45: { icon: '🌫️', condition: 'Foggy' },
    48: { icon: '🌫️', condition: 'Depositing rime fog' },
    51: { icon: '🌦️', condition: 'Light drizzle' },
    53: { icon: '🌦️', condition: 'Moderate drizzle' },
    55: { icon: '🌧️', condition: 'Dense drizzle' },
    61: { icon: '🌧️', condition: 'Slight rain' },
    63: { icon: '🌧️', condition: 'Moderate rain' },
    65: { icon: '🌧️', condition: 'Heavy rain' },
    71: { icon: '🌨️', condition: 'Slight snowfall' },
    73: { icon: '🌨️', condition: 'Moderate snowfall' },
    75: { icon: '❄️', condition: 'Heavy snowfall' },
    80: { icon: '🌦️', condition: 'Rain showers' },
    81: { icon: '🌧️', condition: 'Moderate rain showers' },
    82: { icon: '⛈️', condition: 'Violent rain showers' },
    95: { icon: '⛈️', condition: 'Thunderstorm' },
    96: { icon: '⛈️', condition: 'Thunderstorm with hail' },
    99: { icon: '⛈️', condition: 'Thunderstorm with heavy hail' },
  };

  return map[code] ?? { icon: '🌡️', condition: `Weather code ${code}` };
}
