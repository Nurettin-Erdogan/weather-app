import {
  fetchApproximateIpLocation, fetchWeatherBundle, reverseGeocodeLocation, searchRemoteLocation,
} from './js/api.js';
import { drawHourlyChart } from './js/chart.js';
import { translate } from './js/i18n.js';
import {
  findDistrict, findDistrictByAddress, hasAmbiguousDistrictName, loadDistrictIndex,
  nearestDistrict, searchDistricts,
} from './js/search.js';
import {
  addRecent, clearRecent, getLatestWeatherCache, getRecent,
  getSettings, getWeatherCache, saveSettings, saveWeatherCache,
} from './js/storage.js';
import {
  airQualityLabel, cacheKey, debounce, escapeHtml, formatDay, formatDecimal, formatHour,
  formatLocalTime, formatPercentage, formatTemperature, isTurkeyCoordinate,
  normalizeForSearch, windDirection,
} from './js/utils.js';
import { weatherIcon, weatherLabel, weatherTheme } from './js/weather-codes.js';

const AUTO_REFRESH_MS = 15 * 60 * 1000;

const elements = Object.fromEntries([
  'searchForm', 'cityInput', 'clearBtn', 'searchBtn', 'suggestions', 'locationBtn',
  'unitCBtn', 'unitFBtn', 'notice', 'result', 'recentSection', 'recentList',
  'clearRecentBtn', 'themeBtn',
  'languageBtn', 'installBtn', 'offlineBanner', 'helpBtn', 'ipDialog', 'allowIpBtn',
  'helpDialog', 'toast',
].map(id => [id, document.getElementById(id)]));

const state = {
  settings: getSettings(),
  currentLocation: null,
  currentBundle: null,
  currentFetchedAt: 0,
  currentIsCached: false,
  requestController: null,
  retryAction: null,
  installPrompt: null,
  serviceWorkerRegistration: null,
  toastTimer: null,
  locationLookupInProgress: false,
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
  elements.languageBtn.setAttribute('aria-label', t('language'));
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
  renderRecentLocations();
}

function selectUnit(unit, focus = false) {
  state.settings.unit = unit;
  saveSettings(state.settings);
  applySettings();
  if (focus) (unit === 'C' ? elements.unitCBtn : elements.unitFBtn).focus();
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

function finishRequest(controller) {
  if (state.requestController !== controller) return;
  state.requestController = null;
  setLoading(false);
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

function renderRecentLocations() {
  const recent = getRecent();
  elements.recentSection.hidden = recent.length === 0;
  elements.recentList.innerHTML = recent.map(location => `
    <button class="location-chip recent-chip" type="button" data-recent-id="${escapeHtml(location.id)}">${escapeHtml(location.label)}</button>`).join('');

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
  if (state.locationLookupInProgress) return;
  const query = elements.cityInput.value.trim();
  if (!query) return;
  let location = findDistrict(query, state.settings.language);
  if (!location && hasAmbiguousDistrictName(query)) {
    renderSuggestions(searchDistricts(query, state.settings.language), query);
    showNotice(t('ambiguousLocation'), 'warning');
    elements.cityInput.focus();
    return;
  }
  renderSuggestions([], '');
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
      finishRequest(controller);
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
  if (!options.silent) {
    setLoading(true);
    showNotice();
  }
  try {
    const bundle = await fetchWeatherBundle(safeLocation.latitude, safeLocation.longitude, controller.signal);
    state.currentLocation = safeLocation;
    state.currentBundle = bundle;
    state.currentFetchedAt = Date.now();
    state.currentIsCached = false;
    renderSuggestions([], '');
    saveWeatherCache(cacheKey(safeLocation.latitude, safeLocation.longitude), { location: safeLocation, bundle });
    if (options.addToRecent !== false) addRecent(safeLocation);
    renderWeather();
    renderRecentLocations();
  } catch (error) {
    if (error.name === 'AbortError') return;
    const cached = getWeatherCache(cacheKey(safeLocation.latitude, safeLocation.longitude));
    if (cached?.payload) {
      state.currentLocation = cached.payload.location;
      state.currentBundle = cached.payload.bundle;
      state.currentFetchedAt = Date.parse(cached.savedAt) || 0;
      state.currentIsCached = true;
      renderWeather();
      showNotice(t('cached', { time: formatLocalTime(cached.savedAt, state.settings.language) }), 'warning');
    } else if (!options.silent) {
      renderError(t('dataError'), () => openWeather(safeLocation, options));
    }
  } finally {
    finishRequest(controller);
  }
}

function hourlyIndexesForDate(weather, date) {
  const hourly = weather.hourly || {};
  const currentTime = weather.current?.time || '';
  const currentDate = currentTime.slice(0, 10);
  return date === currentDate
    ? (hourly.time || [])
      .map((value, index) => value >= currentTime ? index : -1)
      .filter(index => index >= 0)
      .slice(0, 24)
    : (hourly.time || [])
      .map((value, index) => value.startsWith(date) ? index : -1)
      .filter(index => index >= 0);
}

function hourlyDataForDate(weather, date) {
  const hourly = weather.hourly || {};
  const indexes = hourlyIndexesForDate(weather, date);
  return Object.fromEntries(Object.entries(hourly).map(([key, values]) => [
    key,
    Array.isArray(values) ? indexes.map(index => values[index]) : values,
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
  const badges = [];
  if (state.currentIsCached) badges.push(t('stale'));
  if (['gps-nearest', 'gps-low-accuracy', 'ip-approx'].includes(location.source)) {
    badges.push(t('approximateLocation'));
  }
  const statusBadges = badges.map(label => `<span class="status-badge">${escapeHtml(label)}</span>`).join('');
  const dailyUv = formatDecimal(daily.uv_index_max?.[0], language);
  const uvDetail = dailyUv === '—' ? '' : `${t('dailyMaximum')}: ${dailyUv}`;

  document.body.dataset.weather = weatherTheme(current.weather_code, current.is_day);
  elements.result.innerHTML = `
    <section class="current-card">
      <div class="current-main">
        <div class="current-location">
          <span class="eyebrow">${escapeHtml(t('current'))} ${statusBadges}</span>
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
      ${metric('UV', t('uvIndex'), formatDecimal(air.uv_index, language), uvDetail)}
      ${metric('↑', t('sunrise'), firstSunrise)}
      ${metric('↓', t('sunset'), firstSunset)}
    </section>

    <section class="forecast-section">
      <div class="section-heading"><div><span class="eyebrow">24h</span><h2>${escapeHtml(t('hourly'))}</h2></div></div>
      <div class="chart-card">
        <div class="chart-legend" aria-hidden="true">
          <span><i class="legend-line"></i>${escapeHtml(t('temperature'))}</span>
          <span><i class="legend-bar"></i>${escapeHtml(t('probability'))}</span>
        </div>
        <canvas id="hourlyChart" role="img" aria-label="${escapeHtml(t('hourly'))}"></canvas>
      </div>
      <div id="hourlyRows" class="hourly-rows"></div>
    </section>

    <section class="forecast-section">
      <div class="section-heading"><div><span class="eyebrow">${escapeHtml(t('fiveDaysShort'))}</span><h2>${escapeHtml(t('daily'))}</h2></div></div>
      <div class="daily-grid">
        ${(daily.time || []).map((date, index) => `
          <button class="day-card ${index === 0 ? 'active' : ''}" type="button" data-date="${escapeHtml(date)}" aria-pressed="${index === 0}">
            <strong>${escapeHtml(formatDay(date, language))}</strong>
            <span class="day-icon" aria-hidden="true">${weatherIcon(daily.weather_code?.[index], 1)}</span>
            <span><b>${escapeHtml(formatTemperature(daily.temperature_2m_max?.[index], unit))}</b> / ${escapeHtml(formatTemperature(daily.temperature_2m_min?.[index], unit))}</span>
            <small>${escapeHtml(t('probability'))} ${escapeHtml(formatPercentage(daily.precipitation_probability_max?.[index] ?? 0, language))}</small>
          </button>`).join('')}
      </div>
    </section>`;

  const initialDate = current.time?.slice(0, 10) || daily.time?.[0];
  renderHourlySelection(initialDate);
  document.querySelectorAll('.day-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.day-card').forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-pressed', 'true');
      renderHourlySelection(card.dataset.date);
    });
  });
}

function renderHourlySelection(date) {
  if (!date) return;
  const weather = state.currentBundle?.weather || {};
  const canvas = document.getElementById('hourlyChart');
  const label = `${t('hourly')}: ${formatDay(date, state.settings.language)}`;
  canvas?.setAttribute('aria-label', label);
  drawHourlyChart(
    canvas,
    hourlyDataForDate(weather, date),
    state.settings.unit,
    resolvedTheme(),
  );
  renderHourlyRows(date);
}

function renderHourlyRows(date) {
  const weather = state.currentBundle?.weather || {};
  const hourly = weather.hourly || {};
  const indexes = hourlyIndexesForDate(weather, date);
  const container = document.getElementById('hourlyRows');
  if (!container) return;
  container.innerHTML = indexes.map(index => `
    <article class="hour-card">
      <strong>${escapeHtml(formatHour(hourly.time[index]))}</strong>
      <span aria-hidden="true">${weatherIcon(hourly.weather_code?.[index], hourly.is_day?.[index] ?? 1)}</span>
      <b>${escapeHtml(formatTemperature(hourly.temperature_2m?.[index], state.settings.unit))}</b>
      <small>💧 ${escapeHtml(formatPercentage(hourly.precipitation_probability?.[index] ?? 0, state.settings.language))}</small>
      <small>${hourly.relative_humidity_2m?.[index] ?? '—'}%</small>
    </article>`).join('');
}

async function handleUseLocation() {
  if (!navigator.geolocation) {
    showNotice(t('locationUnavailable'), 'error');
    return;
  }
  if (state.locationLookupInProgress) return;
  state.locationLookupInProgress = true;
  elements.locationBtn.disabled = true;
  elements.searchBtn.disabled = true;
  showNotice(t('loading'));
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      const { latitude, longitude } = position.coords;
      if (!isTurkeyCoordinate(latitude, longitude)) {
        showNotice(t('outsideTurkey'), 'warning');
        return;
      }
      const nearest = nearestDistrict(latitude, longitude, state.settings.language);
      if (nearest?.distanceKm > 150) {
        showNotice(t('outsideTurkey'), 'warning');
        return;
      }
      let resolved = null;
      try {
        const address = await reverseGeocodeLocation(latitude, longitude, state.settings.language);
        resolved = findDistrictByAddress(address, state.settings.language);
      } catch {
        // The local nearest-district fallback keeps GPS usable offline.
      }
      const location = resolved || nearest || {
        name: state.settings.language === 'tr' ? 'Konumum' : 'My location',
        admin1: '',
        label: state.settings.language === 'tr' ? 'Konumum' : 'My location',
        country: 'Türkiye',
      };
      location.latitude = latitude;
      location.longitude = longitude;
      location.accuracy = Number(position.coords.accuracy) || null;
      location.source = resolved
        ? (location.accuracy > 5000 ? 'gps-low-accuracy' : 'gps-reverse')
        : 'gps-nearest';
      elements.cityInput.value = location.label;
      await openWeather(location);
    } finally {
      state.locationLookupInProgress = false;
      if (!state.requestController) {
        elements.locationBtn.disabled = false;
        elements.searchBtn.disabled = false;
      }
    }
  }, error => {
    state.locationLookupInProgress = false;
    elements.locationBtn.disabled = false;
    elements.searchBtn.disabled = false;
    if (error.code === error.PERMISSION_DENIED) {
      showNotice(t('locationDenied'), 'warning', [{ label: t('allowIp'), callback: () => elements.ipDialog.showModal() }]);
    } else {
      showNotice(t('locationUnavailable'), 'error');
    }
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 });
}

async function useApproximateIpLocation() {
  elements.ipDialog.close();
  setLoading(true);
  const controller = new AbortController();
  try {
    const approximate = await fetchApproximateIpLocation(controller.signal);
    if (!approximate) throw new Error('No IP location');
    const name = approximate.city || t('approximateLocation');
    const admin1 = approximate.region && normalizeForSearch(approximate.region) !== normalizeForSearch(name)
      ? approximate.region
      : '';
    const location = {
      id: `ip|${normalizeForSearch(name)}|${normalizeForSearch(admin1)}`,
      name,
      admin1,
      label: admin1 ? `${name} / ${admin1}` : name,
      country: approximate.country,
      latitude: approximate.latitude,
      longitude: approximate.longitude,
      source: 'ip-approx',
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

function refreshCurrentWeatherIfStale() {
  if (
    !navigator.onLine
    || document.hidden
    || state.requestController
    || state.locationLookupInProgress
    || !state.currentLocation
  ) return;
  const isStale = state.currentIsCached || Date.now() - state.currentFetchedAt >= AUTO_REFRESH_MS;
  if (isStale) openWeather(state.currentLocation, { addToRecent: false, silent: true });
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
  elements.unitCBtn.addEventListener('click', () => selectUnit('C'));
  elements.unitFBtn.addEventListener('click', () => selectUnit('F'));
  elements.unitCBtn.parentElement.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const units = ['C', 'F'];
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
    const currentIndex = units.indexOf(state.settings.unit);
    selectUnit(units[(currentIndex + direction + units.length) % units.length], true);
  });
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
  elements.clearRecentBtn.addEventListener('click', () => { clearRecent(); renderRecentLocations(); });
  elements.helpBtn.addEventListener('click', () => elements.helpDialog.showModal());
  elements.allowIpBtn.addEventListener('click', useApproximateIpLocation);
  elements.installBtn.addEventListener('click', installApp);
  window.addEventListener('online', () => {
    updateConnectionStatus();
    showToast(t('backOnline'));
    refreshCurrentWeatherIfStale();
  });
  window.addEventListener('offline', updateConnectionStatus);
  document.addEventListener('visibilitychange', refreshCurrentWeatherIfStale);
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
      './service-worker.js?v=20260622-1',
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
  renderRecentLocations();
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
      state.currentFetchedAt = Date.parse(latest.savedAt) || 0;
      state.currentIsCached = true;
      elements.cityInput.value = state.currentLocation.label;
      renderWeather();
      showNotice(t('cached', { time: formatLocalTime(latest.savedAt, state.settings.language) }), 'warning');
    }
  }
  if (new URLSearchParams(location.search).get('action') === 'location') {
    handleUseLocation();
  }
  setInterval(refreshCurrentWeatherIfStale, AUTO_REFRESH_MS);
}

initialize();
