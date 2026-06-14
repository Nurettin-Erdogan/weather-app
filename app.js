const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const resultDiv = document.getElementById('result');
const suggestionsContainer = document.getElementById('suggestions');
const clearBtn = document.getElementById('clearBtn');
const unitCBtn = document.getElementById('unitCBtn');
const unitFBtn = document.getElementById('unitFBtn');
const searchForm = document.getElementById('searchForm');
const useLocationBtn = document.getElementById('useLocationBtn');

let unit = localStorage.getItem('weather_unit') || 'C';
let lastWeatherData = null;
let lastLocation = { latitude: null, longitude: null, name: '', country: '' };
let localDistrictsFlat = [];
let fuseSearch = null;
let suggestionIdCounter = 0;

const DEBUG = false;

function debugWarn(...args) {
  if (DEBUG) console.warn(...args);
}

function debugError(...args) {
  if (DEBUG) console.error(...args);
}

/* =========================================================
   BAŞLANGIÇ AYARLARI
========================================================= */

if (suggestionsContainer) {
  suggestionsContainer.setAttribute('role', 'listbox');
  suggestionsContainer.setAttribute('aria-label', 'Arama önerileri');
}

if (cityInput) {
  cityInput.setAttribute('role', 'combobox');
  cityInput.setAttribute('aria-autocomplete', 'list');
  cityInput.setAttribute('aria-controls', 'suggestions');
  cityInput.setAttribute('aria-expanded', 'false');
  cityInput.setAttribute('aria-haspopup', 'listbox');
}

if (unitCBtn) unitCBtn.setAttribute('role', 'radio');
if (unitFBtn) unitFBtn.setAttribute('role', 'radio');

/* =========================================================
   YARDIMCI FONKSİYONLAR
========================================================= */

function toTitleCaseTR(text) {
  if (!text) return '';

  return String(text)
    .toLocaleLowerCase('tr-TR')
    .split(/(\s+|-|\/)/)
    .map(part => {
      if (!part || /^\s+$/.test(part) || part === '-' || part === '/') return part;
      return part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1);
    })
    .join('');
}

function normalizeForSearch(value) {
  if (!value) return '';

  let text = String(value).toLocaleLowerCase('tr-TR');

  try {
    text = text.normalize('NFD').replace(/\p{M}/gu, '');
  } catch (e) {
    // Eski tarayıcılarda Unicode normalize desteklenmeyebilir.
  }

  text = text
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c');

  // Slash ve noktalama işaretlerini boşluğa çeviriyoruz.
  // Böylece "Kadıköy / İstanbul" => "kadikoy istanbul" olur.
  text = text.replace(/[^a-z0-9]+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

function stripLocationPrefix(value) {
  return String(value || '')
    .replace(/^\s*konumum\s*:\s*/i, '')
    .replace(/^\s*ip\s*konumu\s*:\s*/i, '')
    .trim();
}

function debounce(fn, ms = 250) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTemp(celsius) {
  const number = Number(celsius);

  if (Number.isNaN(number)) return '—';

  if (unit === 'C') return `${Math.round(number)} °C`;

  return `${Math.round((number * 9 / 5) + 32)} °F`;
}

function setActiveUnitButton() {
  if (unitCBtn) {
    unitCBtn.setAttribute('aria-pressed', unit === 'C' ? 'true' : 'false');
    unitCBtn.setAttribute('aria-checked', unit === 'C' ? 'true' : 'false');
  }

  if (unitFBtn) {
    unitFBtn.setAttribute('aria-pressed', unit === 'F' ? 'true' : 'false');
    unitFBtn.setAttribute('aria-checked', unit === 'F' ? 'true' : 'false');
  }
}

function isValidCoordinate(lat, lon) {
  const nLat = Number(lat);
  const nLon = Number(lon);
  return !Number.isNaN(nLat) && !Number.isNaN(nLon);
}

/* =========================================================
   LOCAL İL / İLÇE VERİSİ
========================================================= */

async function loadLocalJson() {
  const sources = [
    'data/il-ilce-with-loc.json',
    'data/il-ilce.json'
  ];

  for (const source of sources) {
    try {
      const resp = await fetch(source);

      if (!resp.ok) {
        debugWarn(`${source} yüklenemedi:`, resp.status);
        continue;
      }

      const json = await resp.json();
      return { json, source };
    } catch (e) {
      debugWarn(`${source} okuma hatası:`, e);
    }
  }

  return { json: [], source: '' };
}

function flattenLocalDistricts(json) {
  const provinces = Array.isArray(json) ? json : (json.data || []);
  const flat = [];

  for (const provinceItem of provinces) {
    const province = provinceItem.il_adi || provinceItem.province || provinceItem.name || provinceItem.il || '';
    const districts = provinceItem.ilceler || provinceItem.districts || provinceItem.children || [];

    for (const districtItem of districts) {
      let district = '';
      let latitude = null;
      let longitude = null;

      if (typeof districtItem === 'string') {
        district = districtItem;
      } else {
        district = districtItem.ilce_adi || districtItem.ilce || districtItem.name || districtItem.district || '';
        latitude = districtItem.latitude ?? districtItem.lat ?? null;
        longitude = districtItem.longitude ?? districtItem.lon ?? districtItem.lng ?? null;
      }

      if (!district || !province) continue;

      flat.push({
        province,
        district,
        latitude,
        longitude,
        province_norm: normalizeForSearch(province),
        district_norm: normalizeForSearch(district),
        search_key: `${district} ${province}`,
        search_key_norm: normalizeForSearch(`${district} ${province}`)
      });
    }
  }

  return flat;
}

async function reindexLocalDistricts() {
  const { json, source } = await loadLocalJson();
  const flat = flattenLocalDistricts(json);

  localDistrictsFlat = flat;

  if (typeof Fuse !== 'undefined') {
    try {
      fuseSearch = new Fuse(localDistrictsFlat, {
        keys: [
          { name: 'search_key_norm', weight: 0.9 },
          { name: 'district_norm', weight: 0.7 },
          { name: 'province_norm', weight: 0.3 }
        ],
        threshold: 0.28,
        ignoreLocation: true
      });
    } catch (e) {
      debugWarn('Fuse oluşturulamadı:', e);
      fuseSearch = null;
    }
  }

  debugWarn('Local il/ilçe index hazır:', localDistrictsFlat.length, source);
  return localDistrictsFlat.length > 0;
}

function parseDistrictProvinceQuery(query) {
  const clean = stripLocationPrefix(query);

  if (clean.includes('/')) {
    const parts = clean.split('/').map(p => normalizeForSearch(p)).filter(Boolean);
    return {
      district: parts[0] || '',
      province: parts[1] || '',
      full: normalizeForSearch(clean)
    };
  }

  return {
    district: '',
    province: '',
    full: normalizeForSearch(clean)
  };
}

function scoreLocalCandidate(item, parsed) {
  const q = parsed.full;
  const qDistrict = parsed.district;
  const qProvince = parsed.province;

  if (!q) return 0;

  // "Kadıköy / İstanbul" gibi net girişlerde ilçe ve il birlikte eşleşmeli.
  if (qDistrict && qProvince) {
    if (item.district_norm === qDistrict && item.province_norm === qProvince) return 100;
    if (item.district_norm === qDistrict && item.province_norm.includes(qProvince)) return 92;
    if (item.district_norm.includes(qDistrict) && item.province_norm === qProvince) return 88;
    return 0;
  }

  if (item.district_norm === q) return 95;
  if (item.search_key_norm === q) return 100;

  // "kadikoy istanbul" gibi slashsız giriş için.
  if (item.search_key_norm === q) return 98;
  if (q.includes(item.district_norm) && q.includes(item.province_norm)) return 90;

  // Tek kelime / kısa aramalarda fazla gevşek includes yapmıyoruz.
  if (q.length >= 4 && item.district_norm.startsWith(q)) return 75;
  if (q.length >= 5 && item.search_key_norm.startsWith(q)) return 70;

  return 0;
}

function findBestLocalDistrict(query) {
  if (!localDistrictsFlat || !localDistrictsFlat.length) return null;

  const parsed = parseDistrictProvinceQuery(query);

  let best = null;
  let bestScore = 0;

  for (const item of localDistrictsFlat) {
    const score = scoreLocalCandidate(item, parsed);

    if (score > bestScore && isValidCoordinate(item.latitude, item.longitude)) {
      best = item;
      bestScore = score;
    }
  }

  if (best && bestScore >= 70) return best;

  // Fuse sadece kullanıcı tam ilçe/il formatı vermediyse devreye girsin.
  if (!parsed.province && fuseSearch) {
    try {
      const results = fuseSearch.search(parsed.full).slice(0, 1);

      if (results.length) {
        const item = results[0].item;
        const fuseScore = results[0].score ?? 1;

        if (item && isValidCoordinate(item.latitude, item.longitude) && fuseScore <= 0.25) {
          return item;
        }
      }
    } catch (e) {
      debugWarn('Fuse local arama hatası:', e);
    }
  }

  return null;
}

/* =========================================================
   ÖNERİLER / AUTOCOMPLETE
========================================================= */

async function searchSuggestions(query) {
  const q = String(query || '').trim();

  if (!q) {
    renderSuggestions([], '');
    return;
  }

  const qnorm = normalizeForSearch(q);
  const results = [];

  if (fuseSearch && localDistrictsFlat.length) {
    try {
      const fuseResults = fuseSearch.search(qnorm).slice(0, 10);

      for (const result of fuseResults) {
        const item = result.item || result;

        results.push({
          source: 'local',
          name: toTitleCaseTR(item.district),
          admin1: toTitleCaseTR(item.province),
          latitude: item.latitude,
          longitude: item.longitude,
          country: 'Türkiye'
        });

        if (results.length >= 7) break;
      }
    } catch (e) {
      debugWarn('Fuse öneri hatası:', e);
    }
  }

  const dedup = [];
  const seen = new Set();

  for (const item of results) {
    const key = `${normalizeForSearch(item.name)}|${normalizeForSearch(item.admin1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(item);
  }

  renderSuggestions(dedup.slice(0, 7), q);
}

function renderSuggestions(items, q) {
  if (!suggestionsContainer) return;

  suggestionsContainer.innerHTML = '';

  if (cityInput) {
    cityInput.setAttribute('aria-expanded', items && items.length ? 'true' : 'false');
  }

  if (!items || items.length === 0) return;

  items.forEach((item, index) => {
    const div = document.createElement('div');

    div.className = 'suggestion-item';
    div.tabIndex = 0;
    div.id = `suggestion-${suggestionIdCounter++}`;
    div.setAttribute('role', 'option');
    div.setAttribute('aria-selected', 'false');

    div.dataset.idx = String(index);
    div.dataset.name = item.name || '';
    div.dataset.admin1 = item.admin1 || '';
    div.dataset.lat = item.latitude ?? '';
    div.dataset.lon = item.longitude ?? '';
    div.dataset.country = item.country || 'Türkiye';

    div.innerHTML = `
      <div class="suggestion-main">${escapeHtml(item.name || '')}</div>
      ${item.admin1 ? `<div class="suggestion-sub">${escapeHtml(item.admin1)}</div>` : ''}
    `;

    div.addEventListener('click', () => selectSuggestionFromElement(div));

    div.addEventListener('focus', () => {
      suggestionsContainer.querySelectorAll('.suggestion-item').forEach(si => {
        si.setAttribute('aria-selected', 'false');
      });
      div.setAttribute('aria-selected', 'true');
    });

    div.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        selectSuggestionFromElement(div);
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (div.nextElementSibling) div.nextElementSibling.focus();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (div.previousElementSibling) div.previousElementSibling.focus();
        else if (cityInput) cityInput.focus();
      } else if (ev.key === 'Escape') {
        suggestionsContainer.innerHTML = '';
        if (cityInput) {
          cityInput.focus();
          cityInput.setAttribute('aria-expanded', 'false');
        }
      }
    });

    suggestionsContainer.appendChild(div);
  });
}

function selectSuggestionFromElement(el) {
  const lat = el.dataset.lat;
  const lon = el.dataset.lon;
  const name = el.dataset.name || '';
  const admin1 = el.dataset.admin1 || '';
  const country = el.dataset.country || 'Türkiye';

  const displayName = admin1 ? `${toTitleCaseTR(name)} / ${toTitleCaseTR(admin1)}` : toTitleCaseTR(name);

  cityInput.value = displayName;
  suggestionsContainer.innerHTML = '';

  if (cityInput) cityInput.setAttribute('aria-expanded', 'false');

  if (isValidCoordinate(lat, lon)) {
    fetchAndRender(lat, lon, toTitleCaseTR(name), country || 'Türkiye');
    saveRecent(displayName);
    return;
  }

  searchLocationRemote(displayName);
}

/* =========================================================
   HAVA DURUMU API
========================================================= */

async function fetchAndRender(latitude, longitude, name = '', country = '') {
  showGeoNotice('');
  setLoading(true);

  try {
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(latitude)}` +
      `&longitude=${encodeURIComponent(longitude)}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&timezone=auto`;

    debugWarn('Weather URL:', weatherUrl);

    const response = await fetch(weatherUrl);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      debugError('Open-Meteo HTTP hatası:', response.status, text);
      showResultError(`Hava servisi kullanılamıyor. (${response.status})`, () => fetchAndRender(latitude, longitude, name, country));
      return;
    }

    const weather = await response.json().catch(err => {
      debugError('JSON parse hatası:', err);
      return null;
    });

    if (!weather || !weather.current_weather) {
      debugError('Beklenen current_weather alanı yok:', weather);
      showResultError('Hava verisi alınamadı.', () => fetchAndRender(latitude, longitude, name, country));
      return;
    }

    lastWeatherData = weather;
    lastLocation = { latitude, longitude, name, country };
    renderWeatherFromData(weather, name, country);
  } catch (error) {
    debugError('fetchAndRender genel hata:', error);
    showResultError('Hava servisine şu anda ulaşılamadı. İnternet bağlantınızı kontrol edin veya birkaç saniye sonra tekrar deneyin.', () => fetchAndRender(latitude, longitude, name, country));
  } finally {
    setLoading(false);
  }
}

function renderWeatherFromData(weatherData, name = '', country = '') {
  const current = weatherData.current_weather;
const hintHtml = dailyHtml
  ? '<p class="forecast-hint">Günlük kartlara tıklayarak saatlik tahmini görebilirsin.</p>'
  : '';
  if (!current) {
    resultDiv.innerHTML = '<p>Hava verisi yok.</p>';
    return;
  }

  const currentCode = Number(current.weathercode ?? current.weather_code ?? 0);
  const currentTemp = current.temperature;
  const currentWind = current.windspeed ?? current.wind_speed ?? current.wind_speed_10m ?? '—';
  const currentTime = current.time;

  updateWeatherBackground(currentCode);

  const html = `
    <div class="weather-current">
      <div class="icon">${getIcon(currentCode)}</div>
      <div class="details">
        <p><strong>Şehir:</strong> ${escapeHtml(toTitleCaseTR(name))}${country ? ', ' + escapeHtml(toTitleCaseTR(country)) : ''}</p>
        <p><strong>Sıcaklık:</strong> ${formatTemp(currentTemp)}</p>
        <p><strong>Rüzgar:</strong> ${escapeHtml(currentWind)} km/h</p>
        <p><strong>Hava:</strong> ${escapeHtml(weatherCodeMap[currentCode] || 'Bilinmeyen hava durumu')}</p>
        <p><strong>Saat:</strong> ${currentTime ? new Date(currentTime).toLocaleString('tr-TR') : '—'}</p>
      </div>
    </div>
  `;

  const dailyHtml = buildDailyHtml(weatherData);

resultDiv.innerHTML =
  html +
  dailyHtml +
  hintHtml +
  '<div id="hourlyPanel" class="forecast-hourly" aria-hidden="true" tabindex="-1"></div>';  attachHourlyPanel(weatherData);
}

function buildDailyHtml(weatherData) {
  const daily = weatherData.daily || {};
  const times = daily.time || [];
  const maxes = daily.temperature_2m_max || [];
  const mins = daily.temperature_2m_min || [];
  const codes = daily.weather_code || daily.weathercode || [];

  if (!times.length) return '';

  const n = Math.min(5, times.length);
  let html = '<div class="forecast-daily" aria-label="5 günlük tahmin"><div class="cards">';

  for (let i = 0; i < n; i++) {
    let dayLabel = times[i];

    try {
      dayLabel = new Date(times[i]).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' });
    } catch (e) {
      debugWarn('Tarih formatlama hatası:', e);
    }

    html += `
      <div class="card" role="button" tabindex="0" aria-label="Tahmin ${i + 1}" aria-expanded="false">
        <div class="card-day">${escapeHtml(dayLabel)}</div>
        <div class="card-icon">${getIcon(codes[i])}</div>
        <div class="card-temp">
          <div class="card-temp-max">${formatTemp(maxes[i])}</div>
          <div class="card-temp-min">${formatTemp(mins[i])}</div>
        </div>
      </div>
    `;
  }

  html += '</div></div>';
  return html;
}

function attachHourlyPanel(weatherData) {
  try {
    const dailyTimes = weatherData.daily?.time || [];
    const hourly = weatherData.hourly || {};
    const hourTimes = hourly.time || [];
    const hourlyPanel = document.getElementById('hourlyPanel');
    const cards = resultDiv.querySelectorAll('.forecast-daily .card');

    if (!hourlyPanel || !cards.length) return;

    hourlyPanel.innerHTML = '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'unit-btn hourly-close';
    closeBtn.textContent = 'Kapat';

    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'hour-rows';

    hourlyPanel.appendChild(closeBtn);
    hourlyPanel.appendChild(rowsContainer);

    hourlyPanel.setAttribute('role', 'region');
    hourlyPanel.setAttribute('aria-label', 'Saatlik tahmin');
    hourlyPanel.setAttribute('aria-hidden', 'true');
    hourlyPanel.tabIndex = -1;

    let lastOpenedCard = null;

    function closeHourly() {
      hourlyPanel.classList.remove('open');
      hourlyPanel.setAttribute('aria-hidden', 'true');
      hourlyPanel.dataset.date = '';
      cards.forEach(card => card.setAttribute('aria-expanded', 'false'));
      if (lastOpenedCard) lastOpenedCard.focus();
      lastOpenedCard = null;
      document.removeEventListener('keydown', hourlyEscHandler);
    }

    function hourlyEscHandler(e) {
      if (e.key === 'Escape') closeHourly();
    }

    closeBtn.addEventListener('click', closeHourly);

    cards.forEach((card, index) => {
      card.addEventListener('click', () => {
        const date = dailyTimes[index];
        if (!date) return;

        if (hourlyPanel.dataset.date === date && hourlyPanel.classList.contains('open')) {
          closeHourly();
          return;
        }

        const rows = [];

        for (let i = 0; i < hourTimes.length; i++) {
          const time = hourTimes[i];
          if (!time || !time.startsWith(date)) continue;

          rows.push({
            time,
            temp: hourly.temperature_2m?.[i] ?? null,
            humidity: hourly.relative_humidity_2m?.[i] ?? null,
            wind: hourly.wind_speed_10m?.[i] ?? null,
            code: hourly.weather_code?.[i] ?? null
          });
        }

        rowsContainer.innerHTML = '';

        if (!rows.length) {
          rowsContainer.innerHTML = '<div class="no-hours">Saatlik veri bulunamadı.</div>';
        } else {
          rows.forEach(rowData => {
            const row = document.createElement('div');
            row.className = 'hour-row';

            const timeLabel = new Date(rowData.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

            row.innerHTML = `
              <div class="hour-time">${escapeHtml(timeLabel)}</div>
              <div class="hour-icon">${getIcon(rowData.code)}</div>
              <div class="hour-temp">${formatTemp(rowData.temp)}</div>
            `;

            rowsContainer.appendChild(row);
          });
        }

        hourlyPanel.dataset.date = date;
        hourlyPanel.classList.add('open');
        hourlyPanel.setAttribute('aria-hidden', 'false');
        cards.forEach(c => c.setAttribute('aria-expanded', 'false'));
        card.setAttribute('aria-expanded', 'true');
        lastOpenedCard = card;
        closeBtn.focus();
        document.addEventListener('keydown', hourlyEscHandler);
      });

      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          card.click();
        }
      });
    });
  } catch (e) {
    debugWarn('Saatlik panel bağlama hatası:', e);
  }
}

/* =========================================================
   HAVA KODLARI
========================================================= */

function getIcon(code) {
  code = Number(code);

  const map = {
    0: '☀️',
    1: '🌤️',
    2: '⛅',
    3: '☁️',
    45: '🌫️',
    48: '🌫️',
    51: '🌦️',
    53: '🌦️',
    55: '🌦️',
    56: '🌧️',
    57: '🌧️',
    61: '🌧️',
    63: '🌧️',
    65: '🌧️',
    66: '🌧️',
    67: '🌧️',
    71: '🌨️',
    73: '🌨️',
    75: '❄️',
    77: '❄️',
    80: '🌦️',
    81: '🌧️',
    82: '⛈️',
    85: '🌨️',
    86: '❄️',
    95: '⛈️',
    96: '⛈️',
    99: '⛈️'
  };

  return map[code] || '🌡️';
}

function updateWeatherBackground(code) {
  code = Number(code);
  const body = document.body;
  if (!body) return;

  body.classList.remove('clear', 'cloudy', 'rain', 'snow', 'fog', 'thunder');

  if ([0].includes(code)) body.classList.add('clear');
  else if ([1, 2, 3].includes(code)) body.classList.add('cloudy');
  else if ([45, 48].includes(code)) body.classList.add('fog');
  else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) body.classList.add('rain');
  else if ([71, 73, 75, 77, 85, 86].includes(code)) body.classList.add('snow');
  else if ([95, 96, 99].includes(code)) body.classList.add('thunder');
  else body.classList.add('cloudy');
}

const weatherCodeMap = {
  0: 'Açık',
  1: 'Az bulutlu',
  2: 'Parçalı bulutlu',
  3: 'Bulutlu',
  45: 'Sisli',
  48: 'Kırağılı sis',
  51: 'Hafif çiseleme',
  53: 'Orta çiseleme',
  55: 'Yoğun çiseleme',
  56: 'Hafif donan çiseleme',
  57: 'Yoğun donan çiseleme',
  61: 'Hafif yağmur',
  63: 'Orta şiddetli yağmur',
  65: 'Şiddetli yağmur',
  66: 'Hafif donan yağmur',
  67: 'Yoğun donan yağmur',
  71: 'Hafif kar',
  73: 'Orta şiddetli kar',
  75: 'Yoğun kar',
  77: 'Kar tanecikleri',
  80: 'Hafif sağanak',
  81: 'Orta sağanak',
  82: 'Şiddetli sağanak',
  85: 'Hafif kar sağanağı',
  86: 'Yoğun kar sağanağı',
  95: 'Gök gürültülü fırtına',
  96: 'Dolu ile fırtına',
  99: 'Şiddetli dolulu fırtına'
};

/* =========================================================
   HATA VE YÜKLEME DURUMLARI
========================================================= */

function showResultError(message, retryCallback) {
  if (!resultDiv) return;

  resultDiv.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'error-wrapper';
  container.setAttribute('role', 'alert');
  container.setAttribute('aria-live', 'polite');

  const p = document.createElement('p');
  p.className = 'error-text';
  p.textContent = message || 'Bir hata oluştu.';
  container.appendChild(p);

  if (typeof retryCallback === 'function') {
    const btn = document.createElement('button');
    btn.textContent = 'Tekrar Dene';
    btn.className = 'unit-btn retry-btn';
    btn.type = 'button';

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = 'Bekleniyor...';

      try {
        const result = retryCallback();
        if (result && typeof result.then === 'function') await result;
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });

    container.appendChild(btn);
  }

  resultDiv.appendChild(container);
}

function setLoading(isLoading) {
  const controls = [cityInput, searchBtn, clearBtn, useLocationBtn, unitCBtn, unitFBtn];
  controls.forEach(el => {
    if (el) el.disabled = !!isLoading;
  });

  if (!resultDiv) return;

  if (isLoading) {
    resultDiv.setAttribute('aria-busy', 'true');
    resultDiv.innerHTML = `
      <div class="loading-wrapper" role="status" aria-live="polite">
        <div class="loading" aria-hidden="true"></div>
        <div class="loading-message">Yükleniyor...</div>
      </div>
    `;
    document.body.classList.add('loading-active');
  } else {
    resultDiv.removeAttribute('aria-busy');
    document.body.classList.remove('loading-active');
    if (!lastWeatherData) resultDiv.innerHTML = '<p>Bir şehir arat.</p>';
  }
}

/* =========================================================
   SON ARAMALAR
========================================================= */

function getRecentList() {
  try {
    const arr = JSON.parse(localStorage.getItem('weather_recent') || '[]');
    if (!Array.isArray(arr)) return [];

    return arr
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .filter(item => !/^ip konumu\s*:/i.test(item));
  } catch (e) {
    return [];
  }
}

function saveRecent(value) {
  try {
    if (!value) return;

    const key = 'weather_recent';
    let arr = getRecentList();

    arr = arr.filter(item => normalizeForSearch(item) !== normalizeForSearch(value));
    arr.unshift(value);

    if (arr.length > 5) arr = arr.slice(0, 5);

    localStorage.setItem(key, JSON.stringify(arr));
    renderRecent();
  } catch (e) {
    debugWarn('Son arama kaydetme hatası:', e);
  }
}

function renderRecent() {
  const container = document.getElementById('recent');
  if (!container) return;

  const arr = getRecentList();

  if (!arr.length) {
    container.innerHTML = '';
    return;
  }

  cont.innerHTML = `
  <div class="recent-head">
    <div class="recent-title"><strong>Son Aramalar</strong></div>
    <button id="clearRecentBtn" class="clear-recent-btn" type="button">Temizle</button>
  </div>
  <div class="recent-list">
    ${arr.map(a => `<button class="recent-item" type="button">${escapeHtml(a)}</button>`).join('')}
  </div>
`;

  container.querySelectorAll('.recent-item').forEach(button => {
    button.addEventListener('click', () => {
      cityInput.value = button.textContent;
      handleSearch();
    });
  });
}
const clearRecentBtn = document.getElementById('clearRecentBtn');

if (clearRecentBtn) {
  clearRecentBtn.addEventListener('click', () => {
    localStorage.removeItem('weather_recent');
    renderRecent();
  });
}

/* =========================================================
   ARAMA AKIŞI
========================================================= */

async function searchLocationRemote(query) {
  try {
    const cleanQuery = stripLocationPrefix(query);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=1&language=tr&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      showResultError('Konum servisi kullanılamıyor. Lütfen tekrar deneyin.', () => searchLocationRemote(cleanQuery));
      return;
    }

    const data = await response.json().catch(() => null);

    if (!data || !data.results || !data.results.length) {
      showResultError('Şehir bulunamadı. Başka bir isim deneyin.');
      return;
    }

    const location = data.results[0];
    const name = location.name || cleanQuery;
    const country = location.country || '';

    await fetchAndRender(location.latitude, location.longitude, name, country);
    saveRecent(location.admin1 ? `${name} / ${location.admin1}` : name);
  } catch (e) {
    debugWarn('Uzak konum arama hatası:', e);
    showResultError('Arama başarısız. Ağ bağlantınızı kontrol edip tekrar deneyin.', () => searchLocationRemote(query));
  }
}

async function handleSearch() {
  const query = stripLocationPrefix(cityInput.value).trim();
  if (!query) return;

  if (suggestionsContainer) suggestionsContainer.innerHTML = '';
  if (cityInput) cityInput.setAttribute('aria-expanded', 'false');

  showGeoNotice('');

  const localMatch = findBestLocalDistrict(query);

  if (localMatch) {
    const niceDistrict = toTitleCaseTR(localMatch.district);
    const niceProvince = toTitleCaseTR(localMatch.province);
    const displayName = `${niceDistrict} / ${niceProvince}`;

    cityInput.value = displayName;

    await fetchAndRender(localMatch.latitude, localMatch.longitude, niceDistrict, 'Türkiye');
    saveRecent(displayName);
    return;
  }

  await searchLocationRemote(query);
}

/* =========================================================
   KONUM İZNİ VE LOCAL REVERSE GEOCODE
========================================================= */

function showGeoNotice(message, isError = false) {
  const element = document.getElementById('geoNotice');
  if (!element) return;

  if (!message) {
    element.hidden = true;
    element.style.display = 'none';
    element.textContent = '';
    element.classList.remove('error');
    element.removeAttribute('tabindex');
    return;
  }

  if (isError) {
    element.innerHTML = `
      <span class="geo-icon" aria-hidden="true">📍</span>
      <span class="geo-text">${escapeHtml(message)}</span>
      <button id="geoHelpLink" class="link-button" type="button" aria-label="Konum izni nasıl açılır?">Nasıl izin verilir?</button>
    `;
  } else {
    element.innerHTML = `
      <span class="geo-icon" aria-hidden="true">📍</span>
      <span class="geo-text">${escapeHtml(message)}</span>
    `;
  }

  element.hidden = false;
  element.style.display = 'block';
  element.classList.toggle('error', !!isError);
  element.setAttribute('tabindex', '-1');

  const help = document.getElementById('geoHelpLink');
  if (help) {
    help.addEventListener('click', (event) => {
      event.preventDefault();
      openGeoModal();
    });
  }
}

function openGeoModal() {
  const overlay = document.getElementById('geoModalOverlay');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.style.display = 'flex';

  const closeButton = document.getElementById('geoModalClose');
  if (closeButton) closeButton.focus();
}

function closeGeoModal() {
  const overlay = document.getElementById('geoModalOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.style.display = 'none';
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const dLon = (Number(lon2) - Number(lon1)) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(Number(lat1) * Math.PI / 180) *
    Math.cos(Number(lat2) * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function findNearestLocalDistrict(latitude, longitude) {
  if (!localDistrictsFlat || !localDistrictsFlat.length) return null;

  let best = null;
  let bestDistance = Infinity;

  for (const item of localDistrictsFlat) {
    if (!isValidCoordinate(item.latitude, item.longitude)) continue;

    const distance = distanceKm(latitude, longitude, item.latitude, item.longitude);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }

  if (!best) return null;

  return {
    name: toTitleCaseTR(best.district),
    admin1: toTitleCaseTR(best.province),
    country: 'Türkiye',
    distanceKm: bestDistance
  };
}

async function reverseGeocode(latitude, longitude) {
  // Dış reverse geocoding API kullanılmıyor.
  // Open-Meteo reverse endpoint'i tarayıcıda CORS hatası verdiği için local JSON üzerinden en yakın ilçe bulunuyor.
  return findNearestLocalDistrict(latitude, longitude);
}

async function ipFallback() {
  const endpoints = [
    'https://ipwho.is/',
    'https://ipapi.co/json/',
    'https://ipinfo.io/json',
    'https://ip-api.com/json/'
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json().catch(() => null);
      if (!data) continue;

      let lat = data.latitude !== undefined ? Number(data.latitude) : Number(data.lat);
      let lon = data.longitude !== undefined ? Number(data.longitude) : Number(data.lon);

      if ((!lat || !lon) && data.loc && typeof data.loc === 'string' && data.loc.includes(',')) {
        const parts = data.loc.split(',').map(s => s.trim());
        lat = Number(parts[0]);
        lon = Number(parts[1]);
      }

      if (isValidCoordinate(lat, lon)) {
        return {
          latitude: lat,
          longitude: lon,
          city: data.city || data.region || data.region_name || '',
          country: data.country_name || data.country || data.countryCode || '',
          source: url
        };
      }
    } catch (e) {
      debugWarn('IP fallback hatası:', url, e);
    }
  }

  return null;
}

function handleUseLocation() {
  if (!navigator.geolocation) {
    showGeoNotice('Tarayıcınız konum servislerini desteklemiyor.', true);
    return;
  }

  showGeoNotice('Konum isteniyor…', false);
  setLoading(true);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      setLoading(false);
      showGeoNotice('');

      const latitude = position.coords?.latitude;
      const longitude = position.coords?.longitude;

      if (!isValidCoordinate(latitude, longitude)) {
        showGeoNotice('Konum alınamadı.', true);
        return;
      }

      const nearest = await reverseGeocode(latitude, longitude);
      const placeName = nearest?.name || 'Konumum';
      const country = nearest?.country || '';

      await fetchAndRender(latitude, longitude, placeName, country);
      saveRecent(`Konumum: ${toTitleCaseTR(placeName)}`);
    },
    async (error) => {
      setLoading(false);

      if (error && error.code === 1) {
        showGeoNotice('Konum izni reddedildi. IP tabanlı yaklaşık konum deneniyor...', false);

        const location = await ipFallback();

        if (location && isValidCoordinate(location.latitude, location.longitude)) {
          const nearest = await reverseGeocode(location.latitude, location.longitude);
          const placeName = nearest?.name || location.city || 'Yaklaşık konum';
          const country = nearest?.country || location.country || '';

          await fetchAndRender(location.latitude, location.longitude, placeName, country);
          saveRecent(`IP konumu: ${toTitleCaseTR(placeName)}`);
        } else {
          showGeoNotice('IP tabanlı konum alınamadı. Manuel arama yapın.', true);
        }
      } else {
        showGeoNotice('Konum alınamadı: ' + (error?.message || 'Bilinmeyen hata'), true);
      }
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

/* =========================================================
   EVENTLER
========================================================= */

if (cityInput) {
  cityInput.addEventListener('input', debounce(event => {
    searchSuggestions(event.target.value);
  }, 250));

  cityInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearch();
    } else if (event.key === 'ArrowDown') {
      const first = suggestionsContainer?.querySelector('.suggestion-item');
      if (first) {
        first.focus();
        event.preventDefault();
      }
    }
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    cityInput.value = '';
    if (suggestionsContainer) suggestionsContainer.innerHTML = '';
    if (cityInput) {
      cityInput.focus();
      cityInput.setAttribute('aria-expanded', 'false');
    }
  });
}

if (searchForm) {
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    handleSearch();
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', event => {
    event.preventDefault();
    handleSearch();
  });
}

if (unitCBtn) {
  unitCBtn.addEventListener('click', () => {
    unit = 'C';
    localStorage.setItem('weather_unit', unit);
    setActiveUnitButton();
    if (lastWeatherData) renderWeatherFromData(lastWeatherData, lastLocation.name, lastLocation.country);
  });
}

if (unitFBtn) {
  unitFBtn.addEventListener('click', () => {
    unit = 'F';
    localStorage.setItem('weather_unit', unit);
    setActiveUnitButton();
    if (lastWeatherData) renderWeatherFromData(lastWeatherData, lastLocation.name, lastLocation.country);
  });
}

if (useLocationBtn) {
  useLocationBtn.addEventListener('click', handleUseLocation);
}

document.addEventListener('click', event => {
  if (!event.target) return;
  if (event.target.id === 'geoModalClose') closeGeoModal();
  if (event.target.id === 'geoModalOverlay') closeGeoModal();
});

/* =========================================================
   SAYFA YÜKLENİNCE
========================================================= */

window.reindexLocalDistricts = reindexLocalDistricts;

window.addEventListener('load', async () => {
  setActiveUnitButton();
  await reindexLocalDistricts();
  renderRecent();

  if (navigator.permissions && navigator.permissions.query) {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission && permission.state === 'denied') {
        showGeoNotice('Konum izni tarayıcı tarafından engellenmiş. Site izinlerinden konumu açın.', true);
      }
    } catch (e) {
      debugWarn('Permission kontrol hatası:', e);
    }
  }
});
