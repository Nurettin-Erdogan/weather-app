const KEYS = {
  settings: 'weather_settings_v2',
  recent: 'weather_recent_v2',
  saved: 'weather_saved_v1',
  cache: 'weather_cache_v2',
  latest: 'weather_latest_v2',
  lastLocation: 'weather_last_location_v1',
};

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked in private browsing; the app remains usable.
  }
}

function threshold(value, fallback, minimum, maximum, step = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.min(maximum, Math.max(minimum, number));
  return Math.round(clamped / step) * step;
}

export function defaultAlertPreferences() {
  return { rainProbability: 60, windSpeed: 45, uvIndex: 7 };
}

function alertPreferences(value) {
  const defaults = defaultAlertPreferences();
  return {
    rainProbability: threshold(value?.rainProbability, defaults.rainProbability, 20, 100, 5),
    windSpeed: threshold(value?.windSpeed, defaults.windSpeed, 20, 80, 5),
    uvIndex: threshold(value?.uvIndex, defaults.uvIndex, 3, 11),
  };
}

export function getSettings() {
  const stored = read(KEYS.settings, {});
  return {
    unit: ['C', 'F'].includes(stored?.unit) ? stored.unit : 'C',
    language: ['tr', 'en'].includes(stored?.language) ? stored.language : 'tr',
    theme: ['system', 'light', 'dark'].includes(stored?.theme) ? stored.theme : 'system',
    installHintDismissed: stored?.installHintDismissed === true,
    defaultLocationId: typeof stored?.defaultLocationId === 'string'
      ? stored.defaultLocationId
      : null,
    alerts: alertPreferences(stored?.alerts),
  };
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

function validLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return location
    && typeof location === 'object'
    && typeof location.id === 'string'
    && typeof location.label === 'string'
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= 35 && latitude <= 43
    && longitude >= 25 && longitude <= 45;
}

function validCacheEntry(entry) {
  const payload = entry?.payload;
  return typeof entry?.savedAt === 'string'
    && validLocation(payload?.location)
    && payload?.bundle?.weather?.current
    && Array.isArray(payload.bundle.weather.hourly?.time)
    && Array.isArray(payload.bundle.weather.daily?.time);
}

export function getRecent() {
  const recent = read(KEYS.recent, []);
  return Array.isArray(recent) ? recent.filter(validLocation).slice(0, 5) : [];
}

export function addRecent(location) {
  const recent = getRecent().filter(item => item.id !== location.id);
  recent.unshift(location);
  write(KEYS.recent, recent.slice(0, 5));
  return recent.slice(0, 5);
}

export function clearRecent() {
  write(KEYS.recent, []);
}

export function getSavedLocations() {
  const saved = read(KEYS.saved, []);
  return Array.isArray(saved) ? saved.filter(validLocation).slice(0, 8) : [];
}

export function addSavedLocation(location) {
  if (!validLocation(location)) return getSavedLocations();
  const saved = getSavedLocations().filter(item => item.id !== location.id);
  saved.unshift(location);
  write(KEYS.saved, saved.slice(0, 8));
  return saved.slice(0, 8);
}

export function removeSavedLocation(id) {
  const saved = getSavedLocations().filter(item => item.id !== id);
  write(KEYS.saved, saved);
  return saved;
}

export function saveLastLocation(location) {
  if (validLocation(location)) write(KEYS.lastLocation, location);
}

export function getLastLocation() {
  const location = read(KEYS.lastLocation, null);
  return validLocation(location) ? location : null;
}

export function saveWeatherCache(key, payload) {
  const stored = read(KEYS.cache, {});
  const cache = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const savedAt = new Date().toISOString();
  cache[key] = { payload, savedAt };
  const trimmed = Object.fromEntries(
    Object.entries(cache)
      .filter(([, entry]) => validCacheEntry(entry))
      .sort(([, a], [, b]) => Date.parse(a.savedAt) - Date.parse(b.savedAt))
      .slice(-12),
  );
  write(KEYS.cache, trimmed);
  write(KEYS.latest, { key, payload, savedAt });
}

export function getWeatherCache(key) {
  const cache = read(KEYS.cache, {});
  const entry = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache[key] : null;
  return validCacheEntry(entry) ? entry : null;
}

export function getLatestWeatherCache() {
  const latest = read(KEYS.latest, null);
  return validCacheEntry(latest) ? latest : null;
}
