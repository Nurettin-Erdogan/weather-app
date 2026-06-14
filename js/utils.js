export function normalizeForSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleCase(value, language = 'tr') {
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';
  return String(value || '')
    .toLocaleLowerCase(locale)
    .split(/(\s+|-|\/)/)
    .map(part => /\w/u.test(part) ? part.charAt(0).toLocaleUpperCase(locale) + part.slice(1) : part)
    .join('');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function debounce(callback, delay = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

export function isValidCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function isTurkeyCoordinate(latitude, longitude) {
  return isValidCoordinate(latitude, longitude)
    && Number(latitude) >= 35 && Number(latitude) <= 43
    && Number(longitude) >= 25 && Number(longitude) <= 45;
}

export function formatTemperature(celsius, unit = 'C') {
  const value = Number(celsius);
  if (!Number.isFinite(value)) return '—';
  return unit === 'F'
    ? `${Math.round((value * 9 / 5) + 32)} °F`
    : `${Math.round(value)} °C`;
}

export function formatLocalTime(value, language = 'tr') {
  if (!value) return '—';
  const [date = '', time = ''] = String(value).split('T');
  const parts = date.split('-');
  if (parts.length !== 3) return String(value);
  return language === 'tr'
    ? `${parts[2]}.${parts[1]}.${parts[0]} ${time.slice(0, 5)}`
    : `${parts[1]}/${parts[2]}/${parts[0]} ${time.slice(0, 5)}`;
}

export function formatHour(value) {
  return String(value || '').split('T')[1]?.slice(0, 5) || '—';
}

export function formatDay(value, language = 'tr') {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
  }).format(date);
}

export function windDirection(degrees, language = 'tr') {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return '—';
  const tr = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return (language === 'tr' ? tr : en)[Math.round(value / 45) % 8];
}

export function airQualityLabel(value, language = 'tr') {
  const aqi = Number(value);
  if (!Number.isFinite(aqi)) return '—';
  const labels = language === 'tr'
    ? ['Çok iyi', 'İyi', 'Orta', 'Kötü', 'Çok kötü', 'Aşırı kötü']
    : ['Very good', 'Good', 'Moderate', 'Poor', 'Very poor', 'Extremely poor'];
  if (aqi <= 20) return labels[0];
  if (aqi <= 40) return labels[1];
  if (aqi <= 60) return labels[2];
  if (aqi <= 80) return labels[3];
  if (aqi <= 100) return labels[4];
  return labels[5];
}

export function cacheKey(latitude, longitude) {
  return `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}`;
}

export function mapUrls(latitude, longitude) {
  const lat = Number(latitude).toFixed(5);
  const lon = Number(longitude).toFixed(5);
  return {
    map: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=10/${lat}/${lon}`,
    radar: `https://www.windy.com/${lat}/${lon}?radar,${lat},${lon},8`,
  };
}
