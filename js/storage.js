const KEYS = {
  settings: 'weather_settings_v2',
  favorites: 'weather_favorites_v2',
  recent: 'weather_recent_v2',
  cache: 'weather_cache_v2',
  latest: 'weather_latest_v2',
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

export function getSettings() {
  return { unit: 'C', language: 'tr', theme: 'system', rainAlerts: false, ...read(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

export function getFavorites() {
  return read(KEYS.favorites, []);
}

export function toggleFavorite(location) {
  const favorites = getFavorites();
  const index = favorites.findIndex(item => item.id === location.id);
  if (index >= 0) favorites.splice(index, 1);
  else favorites.unshift(location);
  write(KEYS.favorites, favorites.slice(0, 8));
  return favorites.slice(0, 8);
}

export function getRecent() {
  return read(KEYS.recent, []);
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

export function saveWeatherCache(key, payload) {
  const cache = read(KEYS.cache, {});
  cache[key] = { payload, savedAt: new Date().toISOString() };
  const trimmed = Object.fromEntries(Object.entries(cache).slice(-12));
  write(KEYS.cache, trimmed);
  write(KEYS.latest, { key, payload, savedAt: new Date().toISOString() });
}

export function getWeatherCache(key) {
  return read(KEYS.cache, {})[key] || null;
}

export function getLatestWeatherCache() {
  return read(KEYS.latest, null);
}
