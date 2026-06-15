import { fetchApproximateIpLocation, fetchWeatherBundle, searchRemoteLocation } from './js/api.js';
import { drawHourlyChart } from './js/chart.js';
import { translate } from './js/i18n.js';
import { findDistrict, loadDistrictIndex, nearestDistrict, searchDistricts } from './js/search.js';
import {
  addRecent, clearRecent, getFavorites, getLatestWeatherCache, getRecent,
  getSettings, getWeatherCache, saveSettings, saveWeatherCache, toggleFavorite,
} from './js/storage.js';
import {
  airQualityLabel, cacheKey, debounce, escapeHtml, formatDay, formatHour,
  formatLocalTime, formatTemperature, normalizeForSearch, windDirection,
} from './js/utils.js';
import { weatherIcon, weatherLabel, weatherTheme } from './js/weather-codes.js';

const elements = Object.fromEntries([
  'searchForm', 'cityInput', 'clearBtn', 'searchBtn', 'suggestions', 'locationBtn',
  'unitCBtn', 'unitFBtn', 'notice', 'result', 'favoritesSection', 'favoritesList',
  'compareBtn', 'recentSection', 'recentList', 'clearRecentBtn', 'themeBtn',
  'languageBtn', 'installBtn', 'offlineBanner', 'helpBtn', 'ipDialog', 'allowIpBtn',
  'helpDialog', 'compareDialog', 'compareContent', 'toast',
].map(id => [id, document.getElementById(id)]));

const state = {
  settings: getSettings(),
  currentLocation: null,
  currentBundle: null,
  currentSavedAt: null,
  currentIsCached: false,
  requestController: null,
  retryAction: null,
  installPrompt: null,
  serviceWorkerRegistration: null,
  toastTimer: null,
};

const t = (key, variables) => translate(state.settings.language, key, variables);

function updateTranslations() {
  document.documentElement.lang = state.settings.language;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const label = t(element.dataset.i18nTitle);
    element.title = label;
    element.setAttribute('aria-label', label);
  });
  elements.cityInput.setAttribute('aria-label', t('searchLabel'));
  elements.unitCBtn.parentElement.setAttribute('aria-label', state.settings.language === 'tr' ? 'Sıcaklık birimi' : 'Temperature unit');
}

function resolvedTheme() {
  if (state.settings.theme === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return state.settings.theme;
}

function applySettings() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  elements.unitCBtn.setAttribute('aria-checked', String(state.settings.unit === 'C'));
  elements.unitFBtn.setAttribute('aria-checked', String(state.settings.unit === 'F'));
  elements.unitCBtn.classList.toggle('active', state.settings.unit === 'C');
  elements.unitFBtn.classList.toggle('active', state.settings.unit === 'F');
  updateTranslations();
  if (state.currentBundle) renderWeather();
  renderSavedLocations();
}

function setLoading(loading) {
  elements.result.setAttribute('aria-busy', String(loading));
  [elements.searchBtn, elements.locationBtn].forEach(button => { button.disabled = loading; });
  if (loading) {
    elements.result.innerHTML = `
      <div class="loading-state" role="status">
        <span class="loader" aria-hidden="true"></span>
        <strong>${escapeHtml(t('loading'))}</strong>
      </div>`;
  }
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function showNotice(message = '', type = 'info', actions = []) {
  if (!message) {
    elements.notice.hidden = true;
    elements.notice.replaceChildren();
    return;
  }
  elements.notice.hidden = false;
  elements.notice.className = `notice ${type}`;
  const text = document.createElement('span');
  text.textContent = message;
  elements.notice.replaceChildren(text);
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-action';
    button.textContent = action.label;
    button.addEventListener('click', action.callback);
    elements.notice.append(button);
  }
}

function renderError(message, retryAction = null) {
  state.retryAction = retryAction;
  elements.result.innerHTML = `
    <div class="error-state" role="alert">
      <span aria-hidden="true">!</span>
      <h2>${escapeHtml(message)}</h2>
      ${retryAction ? `<button id="retryBtn" class="primary-button" type="button">${escapeHtml(t('retry'))}</button>` : ''}
    </div>`;
  document.getElementById('retryBtn')?.addEventListener('click', () => state.retryAction?.());
}

function locationIdentity(location) {
  return location.id || `${normalizeForSearch(location.name)}|${normalizeForSearch(location.admin1)}`;
}

function normalizedLocation(location) {
  return { ...location, id: locationIdentity(location) };
}

function renderSavedLocations() {
  const favorites = getFavorites();
  const recent = getRecent();
  elements.favoritesSection.hidden = favorites.length === 0;
  elements.recentSection.hidden = recent.length === 0;
  elements.favoritesList.innerHTML = favorites.map(location => `
    <span class="location-chip">
      <button type="button" data-open-id="${escapeHtml(location.id)}">★ ${escapeHtml(location.label)}</button>
      <button class="chip-remove" type="button" data-remove-id="${escapeHtml(location.id)}" aria-label="${escapeHtml(t('removeFavorite'))}">×</button>
    </span>`).join('');
  elements.recentList.innerHTML = recent.map(location => `
    <button class="location-chip recent-chip" type="button" data-recent-id="${escapeHtml(location.id)}">${escapeHtml(location.label)}</button>`).join('');

  elements.favoritesList.querySelectorAll('[data-open-id]').forEach(button => {
    button.addEventListener('click', () => {
      const location = favorites.find(item => item.id === button.dataset.openId);
      if (location) openWeather(location);
    });
  });
  elements.favoritesList.querySelectorAll('[data-remove-id]').forEach(button => {
    button.addEventListener('click', () => {
      const location = favorites.find(item => item.id === button.dataset.removeId);
      if (location) toggleFavorite(location);
      renderSavedLocations();
    });
  });
  elements.recentList.querySelectorAll('[data-recent-id]').forEach(button => {
    button.addEventListener('click', () => {
      const location = recent.find(item => item.id === button.dataset.recentId);
      if (location) openWeather(location, { addToRecent: false });
    });
  });
}

function renderSuggestions(items, query) {
  elements.suggestions.replaceChildren();
  elements.cityInput.setAttribute('aria-expanded', String(items.length > 0));
  if (!items.length) elements.cityInput.removeAttribute('aria-activedescendant');
  const normalizedQuery = normalizeForSearch(query);
  for (const [index, item] of items.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.id = `suggestion-${index}`;
    const name = document.createElement('strong');
    if (normalizeForSearch(item.name).includes(normalizedQuery)) {
      const mark = document.createElement('mark');
      mark.className = 'match';
      mark.textContent = item.name;
      name.append(mark);
    } else {
      name.textContent = item.name;
    }
    const province = document.createElement('span');
    province.textContent = item.admin1;
    button.append(name, province);
    button.addEventListener('click', () => selectLocation(item));
    button.addEventListener('focus', () => {
      elements.suggestions.querySelectorAll('[role="option"]').forEach(option => option.setAttribute('aria-selected', 'false'));
      button.setAttribute('aria-selected', 'true');
      elements.cityInput.setAttribute('aria-activedescendant', button.id);
    });
    button.addEventListener('keydown', event => navigateSuggestions(event, button));
    elements.suggestions.append(button);
  }
}

function navigateSuggestions(event, button) {
  if (event.key === 'ArrowDown' && button.nextElementSibling) {
    event.preventDefault();
    button.nextElementSibling.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    (button.previousElementSibling || elements.cityInput).focus();
  } else if (event.key === 'Escape') {
    renderSuggestions([], '');
    elements.cityInput.focus();
  }
}

function selectLocation(location) {
  elements.cityInput.value = location.label;
  renderSuggestions([], '');
  elements.cityInput.removeAttribute('aria-activedescendant');
  openWeather(location);
}

async function handleSearch() {
  const query = elements.cityInput.value.trim();
  if (!query) return;
  renderSuggestions([], '');
  let location = findDistrict(query, state.settings.language);
  if (!location) {
    setLoading(true);
    const controller = new AbortController();
    state.requestController?.abort();
    state.requestController = controller;
    try {
      location = await searchRemoteLocation(query, state.settings.language, controller.signal);
    } catch (error) {
      if (error.name === 'AbortError') return;
      renderError(t('dataError'), handleSearch);
      return;
    } finally {
      setLoading(false);
    }
  }
  if (!location) {
    renderError(t('locationNotFound'));
    return;
  }
  elements.cityInput.value = location.label;
  await openWeather(location);
}

async function openWeather(location, options = {}) {
  const safeLocation = normalizedLocation(location);
  state.requestController?.abort();
  const controller = new AbortController();
  state.requestController = controller;
  setLoading(true);
  showNotice();
  try {
    const bundle = await fetchWeatherBundle(safeLocation.latitude, safeLocation.longitude, controller.signal);
    state.currentLocation = safeLocation;
    state.currentBundle = bundle;
    state.currentSavedAt = new Date().toISOString();
    state.currentIsCached = false;
    renderSuggestions([], '');
    saveWeatherCache(cacheKey(safeLocation.latitude, safeLocation.longitude), { location: safeLocation, bundle });
    if (options.addToRecent !== false) addRecent(safeLocation);
    renderWeather();
    renderSavedLocations();
  } catch (error) {
    if (error.name === 'AbortError') return;
    const cached = getWeatherCache(cacheKey(safeLocation.latitude, safeLocation.longitude));
    if (cached?.payload) {
      state.currentLocation = cached.payload.location;
      state.currentBundle = cached.payload.bundle;
      state.currentSavedAt = cached.savedAt;
      state.currentIsCached = true;
      renderWeather();
      showNotice(t('cached', { time: formatLocalTime(cached.savedAt, state.settings.language) }), 'warning');
    } else {
      renderError(t('dataError'), () => openWeather(safeLocation, options));
    }
  } finally {
    setLoading(false);
  }
}

function currentHourlyData(weather) {
  const hourly = weather.hourly || {};
  const currentTime = weather.current?.time || '';
  let start = hourly.time?.findIndex(value => value >= currentTime) ?? 0;
  if (start < 0) start = 0;
  const end = start + 24;
  return Object.fromEntries(Object.entries(hourly).map(([key, values]) => [
    key,
    Array.isArray(values) ? values.slice(start, end) : values,
  ]));
}

function metric(icon, label, value, detail = '') {
  return `<article class="metric-card">
    <span class="metric-icon" aria-hidden="true">${icon}</span>
    <span class="metric-label">${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
  </article>`;
}

function renderWeather() {
  const { weather, airQuality } = state.currentBundle;
  const current = weather.current || {};
  const daily = weather.daily || {};
  const location = state.currentLocation;
  const language = state.settings.language;
  const unit = state.settings.unit;
  const air = airQuality?.current || {};
  const condition = weatherLabel(current.weather_code, language);
  const icon = weatherIcon(current.weather_code, current.is_day);
  const updated = formatLocalTime(current.time, language);
  const firstSunrise = daily.sunrise?.[0] ? formatHour(daily.sunrise[0]) : '—';
  const firstSunset = daily.sunset?.[0] ? formatHour(daily.sunset[0]) : '—';
  const staleBadge = state.currentIsCached ? `<span class="status-badge">${escapeHtml(t('stale'))}</span>` : '';

  document.body.dataset.weather = weatherTheme(current.weather_code, current.is_day);
  elements.result.innerHTML = `
    <section class="current-card">
      <div class="current-main">
        <div class="current-location">
          <span class="eyebrow">${escapeHtml(t('current'))} ${staleBadge}</span>
          <h2>${escapeHtml(location.label || location.name)}</h2>
          <p>${escapeHtml(condition)} · ${escapeHtml(updated)} · ${escapeHtml(weather.timezone_abbreviation || '')}</p>
        </div>
        <div class="temperature-block">
          <span class="weather-emoji" aria-hidden="true">${icon}</span>
          <strong>${escapeHtml(formatTemperature(current.temperature_2m, unit))}</strong>
          <small>${escapeHtml(t('feelsLike'))} ${escapeHtml(formatTemperature(current.apparent_temperature, unit))}</small>
        </div>
      </div>
    </section>

    <section class="metrics-grid" aria-label="${escapeHtml(t('details'))}">
      ${metric('◒', t('humidity'), `${current.relative_humidity_2m ?? '—'}%`)}
      ${metric('↗', t('wind'), `${current.wind_speed_10m ?? '—'} km/h`, windDirection(current.wind_direction_10m, language))}
      ${metric('≋', t('gust'), `${current.wind_gusts_10m ?? '—'} km/h`)}
      ${metric('●', t('precipitation'), `${current.precipitation ?? 0} mm`)}
      ${metric('☁', t('cloud'), `${current.cloud_cover ?? '—'}%`)}
      ${metric('AQ', t('airQuality'), airQualityLabel(air.european_aqi, language), Number.isFinite(Number(air.european_aqi)) ? `AQI ${air.european_aqi}` : '')}
      ${metric('UV', t('uvIndex'), String(daily.uv_index_max?.[0] ?? '—'))}
      ${metric('↑', t('sunrise'), firstSunrise)}
      ${metric('↓', t('sunset'), firstSunset)}
    </section>

    <section class="forecast-section">
      <div class="section-heading"><div><span class="eyebrow">24h</span><h2>${escapeHtml(t('hourly'))}</h2></div></div>
      <div class="chart-card"><canvas id="hourlyChart" aria-label="${escapeHtml(t('hourly'))}"></canvas></div>
      <div id="hourlyRows" class="hourly-rows"></div>
    </section>

    <section class="forecast-section">
      <div class="section-heading"><div><span class="eyebrow">5 days</span><h2>${escapeHtml(t('daily'))}</h2></div></div>
      <div class="daily-grid">
        ${(daily.time || []).map((date, index) => `
          <button class="day-card ${index === 0 ? 'active' : ''}" type="button" data-date="${escapeHtml(date)}">
            <strong>${escapeHtml(formatDay(date, language))}</strong>
            <span class="day-icon" aria-hidden="true">${weatherIcon(daily.weather_code?.[index], 1)}</span>
            <span><b>${escapeHtml(formatTemperature(daily.temperature_2m_max?.[index], unit))}</b> / ${escapeHtml(formatTemperature(daily.temperature_2m_min?.[index], unit))}</span>
            <small>${escapeHtml(t('probability'))} %${daily.precipitation_probability_max?.[index] ?? 0}</small>
          </button>`).join('')}
      </div>
    </section>`;

  const hourly = currentHourlyData(weather);
  drawHourlyChart(document.getElementById('hourlyChart'), hourly, unit, resolvedTheme());
  renderHourlyRows(hourly.time?.[0]?.slice(0, 10) || daily.time?.[0]);
  document.querySelectorAll('.day-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.day-card').forEach(item => item.classList.remove('active'));
      card.classList.add('active');
      renderHourlyRows(card.dataset.date);
    });
  });
}

function renderHourlyRows(date) {
  const hourly = state.currentBundle?.weather?.hourly || {};
  const indexes = (hourly.time || []).map((value, index) => value.startsWith(date) ? index : -1).filter(index => index >= 0);
  const container = document.getElementById('hourlyRows');
  if (!container) return;
  container.innerHTML = indexes.map(index => `
    <article class="hour-card">
      <strong>${escapeHtml(formatHour(hourly.time[index]))}</strong>
      <span aria-hidden="true">${weatherIcon(hourly.weather_code?.[index], 1)}</span>
      <b>${escapeHtml(formatTemperature(hourly.temperature_2m?.[index], state.settings.unit))}</b>
      <small>💧 %${hourly.precipitation_probability?.[index] ?? 0}</small>
      <small>${hourly.relative_humidity_2m?.[index] ?? '—'}%</small>
    </article>`).join('');
}

async function compareFavorites() {
  const favorites = getFavorites();
  elements.compareDialog.showModal();
  if (favorites.length < 2) {
    elements.compareContent.innerHTML = `<p>${escapeHtml(t('compareEmpty'))}</p>`;
    return;
  }
  elements.compareContent.innerHTML = `<div class="loading-state"><span class="loader"></span><strong>${escapeHtml(t('loading'))}</strong></div>`;
  const controller = new AbortController();
  try {
    const results = await Promise.all(favorites.slice(0, 4).map(async location => ({
      location,
      bundle: await fetchWeatherBundle(location.latitude, location.longitude, controller.signal),
    })));
    elements.compareContent.innerHTML = `
      <div class="comparison-grid">
        ${results.map(({ location, bundle }) => {
          const current = bundle.weather.current;
          return `<article class="comparison-card">
            <span class="weather-emoji small">${weatherIcon(current.weather_code, current.is_day)}</span>
            <h3>${escapeHtml(location.label)}</h3>
            <strong>${escapeHtml(formatTemperature(current.temperature_2m, state.settings.unit))}</strong>
            <p>${escapeHtml(weatherLabel(current.weather_code, state.settings.language))}</p>
            <small>${escapeHtml(t('humidity'))}: ${current.relative_humidity_2m}%</small>
            <small>${escapeHtml(t('wind'))}: ${current.wind_speed_10m} km/h</small>
          </article>`;
        }).join('')}
      </div>`;
  } catch {
    elements.compareContent.innerHTML = `<p>${escapeHtml(t('dataError'))}</p>`;
  }
}

async function handleUseLocation() {
  if (!navigator.geolocation) {
    showNotice(t('locationUnavailable'), 'error');
    return;
  }
  showNotice(t('loading'));
  navigator.geolocation.getCurrentPosition(async position => {
    const location = nearestDistrict(position.coords.latitude, position.coords.longitude, state.settings.language) || {
      name: state.settings.language === 'tr' ? 'Konumum' : 'My location',
      admin1: '',
      label: state.settings.language === 'tr' ? 'Konumum' : 'My location',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      country: 'Türkiye',
    };
    elements.cityInput.value = location.label;
    await openWeather(location);
  }, error => {
    if (error.code === error.PERMISSION_DENIED) {
      showNotice(t('locationDenied'), 'warning', [{ label: t('allowIp'), callback: () => elements.ipDialog.showModal() }]);
    } else {
      showNotice(t('locationUnavailable'), 'error');
    }
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}

async function useApproximateIpLocation() {
  elements.ipDialog.close();
  setLoading(true);
  const controller = new AbortController();
  try {
    const approximate = await fetchApproximateIpLocation(controller.signal);
    if (!approximate) throw new Error('No IP location');
    const location = nearestDistrict(approximate.latitude, approximate.longitude, state.settings.language) || {
      id: `ip|${approximate.city}`,
      name: approximate.city,
      admin1: '',
      label: approximate.city,
      country: approximate.country,
      latitude: approximate.latitude,
      longitude: approximate.longitude,
    };
    elements.cityInput.value = location.label;
    await openWeather(location);
  } catch {
    showNotice(t('locationUnavailable'), 'error');
  } finally {
    setLoading(false);
  }
}

function updateConnectionStatus() {
  if (!navigator.onLine) {
    elements.offlineBanner.textContent = t('offline');
    elements.offlineBanner.hidden = false;
  } else {
    elements.offlineBanner.hidden = true;
  }
}

async function installApp() {
  if (!state.installPrompt) {
    showToast(t('installUnavailable'));
    return;
  }
  await state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  elements.installBtn.hidden = true;
}

function bindEvents() {
  elements.searchForm.addEventListener('submit', event => { event.preventDefault(); handleSearch(); });
  elements.cityInput.addEventListener('input', debounce(event => {
    renderSuggestions(searchDistricts(event.target.value, state.settings.language), event.target.value);
  }));
  elements.cityInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      const first = elements.suggestions.querySelector('.suggestion-item');
      if (first) { event.preventDefault(); first.focus(); }
    } else if (event.key === 'Escape') {
      renderSuggestions([], '');
    }
  });
  elements.clearBtn.addEventListener('click', () => {
    elements.cityInput.value = '';
    renderSuggestions([], '');
    elements.cityInput.focus();
  });
  elements.locationBtn.addEventListener('click', handleUseLocation);
  elements.unitCBtn.addEventListener('click', () => { state.settings.unit = 'C'; saveSettings(state.settings); applySettings(); });
  elements.unitFBtn.addEventListener('click', () => { state.settings.unit = 'F'; saveSettings(state.settings); applySettings(); });
  elements.themeBtn.addEventListener('click', () => {
    state.settings.theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
    saveSettings(state.settings);
    applySettings();
  });
  elements.languageBtn.addEventListener('click', () => {
    state.settings.language = state.settings.language === 'tr' ? 'en' : 'tr';
    saveSettings(state.settings);
    applySettings();
  });
  elements.clearRecentBtn.addEventListener('click', () => { clearRecent(); renderSavedLocations(); });
  elements.compareBtn.addEventListener('click', compareFavorites);
  elements.helpBtn.addEventListener('click', () => elements.helpDialog.showModal());
  elements.allowIpBtn.addEventListener('click', useApproximateIpLocation);
  elements.installBtn.addEventListener('click', installApp);
  window.addEventListener('online', () => { updateConnectionStatus(); showToast(t('backOnline')); });
  window.addEventListener('offline', updateConnectionStatus);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    elements.installBtn.hidden = false;
  });
  document.addEventListener('click', event => {
    if (!elements.suggestions.contains(event.target) && event.target !== elements.cityInput) renderSuggestions([], '');
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });
    state.serviceWorkerRegistration = await navigator.serviceWorker.register(
      './service-worker.js?v=20260615-2',
      { updateViaCache: 'none' },
    );
    await state.serviceWorkerRegistration.update();
  } catch {
    // PWA features are optional; core weather search remains available.
  }
}

async function initialize() {
  applySettings();
  bindEvents();
  updateConnectionStatus();
  renderSavedLocations();
  registerServiceWorker();
  try {
    await loadDistrictIndex();
  } catch {
    showNotice(t('searchDataError'), 'error');
  }
  if (!navigator.onLine) {
    const latest = getLatestWeatherCache();
    if (latest?.payload) {
      state.currentLocation = latest.payload.location;
      state.currentBundle = latest.payload.bundle;
      state.currentSavedAt = latest.savedAt;
      state.currentIsCached = true;
      elements.cityInput.value = state.currentLocation.label;
      renderWeather();
      showNotice(t('cached', { time: formatLocalTime(latest.savedAt, state.settings.language) }), 'warning');
    }
  }
  if (new URLSearchParams(location.search).get('action') === 'location') {
    handleUseLocation();
  }
}

initialize();
