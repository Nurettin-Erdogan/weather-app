import { isTurkeyCoordinate, normalizeForSearch, titleCase } from './utils.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

function timeoutSignal(parentSignal, timeout = 14000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout);
  parentSignal?.addEventListener('abort', () => controller.abort(parentSignal.reason), { once: true });
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function requestJson(url, options = {}) {
  const timeout = timeoutSignal(options.signal, options.timeout);
  try {
    const response = await fetch(url, { signal: timeout.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    timeout.clear();
  }
}

function forecastUrl(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
      'precipitation', 'rain', 'weather_code', 'cloud_cover', 'wind_speed_10m',
      'wind_direction_10m', 'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m', 'apparent_temperature', 'precipitation_probability',
      'relative_humidity_2m', 'weather_code', 'wind_speed_10m',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_probability_max', 'sunrise', 'sunset', 'uv_index_max',
      'wind_speed_10m_max',
    ].join(','),
    timezone: 'auto',
    forecast_days: '5',
  });
  return `${FORECAST_URL}?${params}`;
}

function airUrl(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'european_aqi,pm10,pm2_5',
    timezone: 'auto',
  });
  return `${AIR_URL}?${params}`;
}

export async function fetchWeatherBundle(latitude, longitude, signal) {
  if (!isTurkeyCoordinate(latitude, longitude)) throw new Error('Coordinate outside Türkiye');
  const [weather, airQuality] = await Promise.all([
    requestJson(forecastUrl(latitude, longitude), { signal }),
    requestJson(airUrl(latitude, longitude), { signal }).catch(() => null),
  ]);
  return { weather, airQuality };
}

export async function searchRemoteLocation(query, language = 'tr', signal) {
  const params = new URLSearchParams({
    name: query,
    count: '10',
    language,
    format: 'json',
    countryCode: 'TR',
  });
  const data = await requestJson(`${GEOCODING_URL}?${params}`, { signal });
  const normalizedQuery = normalizeForSearch(query);
  const candidates = (data.results || []).filter(result => (
    result.country_code === 'TR' && isTurkeyCoordinate(result.latitude, result.longitude)
  ));
  candidates.sort((a, b) => {
    const aExact = normalizeForSearch(a.name) === normalizedQuery ? 1 : 0;
    const bExact = normalizeForSearch(b.name) === normalizedQuery ? 1 : 0;
    return bExact - aExact || (b.population || 0) - (a.population || 0);
  });
  const result = candidates[0];
  if (!result) return null;
  const name = titleCase(result.name, language);
  const admin1 = titleCase(result.admin1 || '', language);
  return {
    id: `${normalizeForSearch(name)}|${normalizeForSearch(admin1)}`,
    name,
    admin1,
    label: admin1 ? `${name} / ${admin1}` : name,
    country: result.country || 'Türkiye',
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    source: 'open-meteo',
  };
}

export async function fetchApproximateIpLocation(signal) {
  const data = await requestJson('https://ipwho.is/', { signal, timeout: 10000 });
  if (data.success === false || !isTurkeyCoordinate(data.latitude, data.longitude)) return null;
  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    city: data.city || '',
    country: data.country || 'Türkiye',
  };
}
