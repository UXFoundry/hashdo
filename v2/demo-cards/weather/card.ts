import { defineCard } from '@hashdo/core';

/**
 * Weather card — shows current weather conditions for a location.
 *
 * Uses the Open-Meteo API (free, no API key required).
 */
export default defineCard({
  name: 'weather',
  description:
    'Get current weather conditions for a location. Shows temperature, humidity, wind speed, and conditions.',

  inputs: {
    latitude: {
      type: 'number',
      required: true,
      description: 'Latitude of the location (-90 to 90)',
    },
    longitude: {
      type: 'number',
      required: true,
      description: 'Longitude of the location (-180 to 180)',
    },
    units: {
      type: 'string',
      required: false,
      default: 'celsius',
      description: 'Temperature units',
      enum: ['celsius', 'fahrenheit'] as const,
    },
    locationName: {
      type: 'string',
      required: false,
      description: 'Human-readable location name to display',
    },
  },

  async getData({ inputs, state }) {
    const tempUnit = inputs.units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const windUnit = 'kmh';

    let weather: Record<string, unknown>;
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(inputs.latitude));
      url.searchParams.set('longitude', String(inputs.longitude));
      url.searchParams.set(
        'current',
        'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
      );
      url.searchParams.set('temperature_unit', tempUnit);
      url.searchParams.set('wind_speed_unit', windUnit);

      const res = await fetch(url.toString());
      const data = (await res.json()) as any;
      const current = data.current;

      weather = {
        temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code,
      };
    } catch {
      // Fallback demo data
      weather = {
        temperature: 22,
        feelsLike: 20,
        humidity: 65,
        windSpeed: 12,
        weatherCode: 1,
      };
    }

    const code = weather.weatherCode as number;
    const { icon, condition } = weatherCodeToDescription(code);
    const unitSymbol = tempUnit === 'celsius' ? '°C' : '°F';

    return {
      viewModel: {
        ...weather,
        icon,
        condition,
        unitSymbol,
        locationName: inputs.locationName || `${inputs.latitude}, ${inputs.longitude}`,
        units: tempUnit,
      },
      state: {
        lastChecked: new Date().toISOString(),
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
    <div style="font-family:system-ui,sans-serif; padding:20px; max-width:300px;
                background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
                border-radius:12px; color:white;">
      <div style="font-size:14px; opacity:0.9; margin-bottom:4px;">
        ${vm.locationName}
      </div>
      <div style="display:flex; align-items:center; gap:12px; margin:12px 0;">
        <span style="font-size:48px;">${vm.icon}</span>
        <div>
          <div style="font-size:36px; font-weight:700;">
            ${typeof vm.temperature === 'number' ? Math.round(vm.temperature as number) : vm.temperature}${vm.unitSymbol}
          </div>
          <div style="font-size:13px; opacity:0.85;">
            Feels like ${typeof vm.feelsLike === 'number' ? Math.round(vm.feelsLike as number) : vm.feelsLike}${vm.unitSymbol}
          </div>
        </div>
      </div>
      <div style="font-size:14px; margin-bottom:12px;">${vm.condition}</div>
      <div style="display:flex; gap:16px; font-size:13px; opacity:0.85;">
        <span>💧 ${vm.humidity}%</span>
        <span>💨 ${vm.windSpeed} km/h</span>
      </div>
    </div>
  `,
});

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
