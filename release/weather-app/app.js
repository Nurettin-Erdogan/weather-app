const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const resultDiv = document.getElementById('result');
const suggestionsContainer = document.getElementById('suggestions');
if (suggestionsContainer) {
  suggestionsContainer.setAttribute('role', 'listbox');
  suggestionsContainer.setAttribute('aria-label', 'Arama önerileri');
}
const clearBtn = document.getElementById('clearBtn');
const unitCBtn = document.getElementById('unitCBtn');
const unitFBtn = document.getElementById('unitFBtn');

// internal id counter for suggestion items
let suggestionIdCounter = 0;

// ensure combobox attributes exist (HTML already sets most, keep stateful here)
if (cityInput) {
  cityInput.setAttribute('role', 'combobox');
  cityInput.setAttribute('aria-autocomplete', 'list');
  cityInput.setAttribute('aria-controls', 'suggestions');
  cityInput.setAttribute('aria-expanded', 'false');
  cityInput.setAttribute('aria-haspopup', 'listbox');
}
if (unitCBtn) unitCBtn.setAttribute('role','radio');
if (unitFBtn) unitFBtn.setAttribute('role','radio');

let unit = localStorage.getItem('weather_unit') || 'C';
let lastWeatherData = null;
let lastLocation = { latitude: null, longitude: null, name: '', country: '' };

const DEBUG = false;
function debugWarn(...args) {
  if (DEBUG) console.warn(...args);
}

function debugError(...args) {
  if (DEBUG) console.error(...args);
}

// local index
let localDistrictsFlat = [];
let fuseSearch = null;

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

function normalizeForSearch(s) {
  if (!s) return '';
  // Normalize case with Turkish locale, remove diacritics, map Turkish chars to ascii
  let t = String(s).toLocaleLowerCase('tr-TR');
  // decompose combined diacritics and remove them
  try { t = t.normalize('NFD').replace(/\p{M}/gu, ''); } catch (e) { /* ignore if unsupported */ }
  // map Turkish special chars to ascii equivalents
  t = t.replace(/[ıİ]/g, 'i')
       .replace(/[ğĞ]/g, 'g')
       .replace(/[üÜ]/g, 'u')
       .replace(/[şŞ]/g, 's')
       .replace(/[öÖ]/g, 'o')
       .replace(/[çÇ]/g, 'c');
  // remove any remaining non-alphanum (keep spaces and hyphen)
  t = t.replace(/[^a-z0-9\s-]/g, '');
  return t.trim();
}

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}

async function reindexLocalDistricts() {
  try {
    const resp = await fetch('data/il-ilce-with-loc.json');
    if (!resp.ok) return false;
    const json = await resp.json();
    const provinces = Array.isArray(json) ? json : (json.data || []);
    const flat = [];
    for (const p of provinces) {
      const province = p.il_adi || p.province || '';
      const ilceler = p.ilceler || [];
      for (const ic of ilceler) {
        const districtName = ic.ilce_adi || ic.ilce || ic.name || '';
        flat.push({ 
          province, 
          district: districtName, 
          latitude: ic.latitude ?? ic.lat ?? null, 
          longitude: ic.longitude ?? ic.lon ?? null,
          province_norm: normalizeForSearch(province),
          district_norm: normalizeForSearch(districtName),
          search_key: `${districtName} ${province}`,
          search_key_norm: normalizeForSearch(`${districtName} ${province}`)
        });
      }
    }
    localDistrictsFlat = flat;
    if (typeof Fuse !== 'undefined') {
      try {
        fuseSearch = new Fuse(localDistrictsFlat, {
          keys: [
            { name: 'search_key_norm', weight: 0.9 },
            { name: 'district_norm', weight: 0.7 },
            { name: 'province_norm', weight: 0.3 }
          ],
          threshold: 0.4,
          ignoreLocation: true
        });
      } catch(e) { fuseSearch = null; }
    }
    return true;
  } catch (e) {
    debugWarn('reindex error', e);
    return false;
  }
}

async function searchSuggestions(query) {
  const q = String(query || '').trim();
  if (!q) { renderSuggestions([], ''); return; }
  const qnorm = normalizeForSearch(q);
  const results = [];

  // local Fuse results
    if (fuseSearch && localDistrictsFlat && localDistrictsFlat.length) {
    try {
      const fs = fuseSearch.search(qnorm).slice(0, 10);
      for (const r of fs) {
        const item = r.item || r;
        results.push({ source: 'local', name: item.district, admin1: item.province, latitude: item.latitude, longitude: item.longitude });
        if (results.length >= 7) break;
      }
    } catch (e) { debugWarn('fuse search err', e); }
  }

  // remote fallback if not enough local results
  if (results.length < 7) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=20&language=tr&format=json`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const remote = (data && data.results) ? data.results : [];
        for (const r of remote) {
          if (!r || !r.name) continue;
          results.push({ source: 'remote', name: r.name, admin1: r.admin1 || '', latitude: r.latitude, longitude: r.longitude, country: r.country || '' });
          if (results.length >= 7) break;
        }
      }
    } catch (e) { debugWarn('remote geocode fail', e); }
  }

  // dedupe by name+admin1
  const dedup = [];
  const seen = new Set();
  for (const it of results) {
    const key = `${String(it.name||'').toLocaleLowerCase()}|${String(it.admin1||'').toLocaleLowerCase()}`;
    if (seen.has(key)) continue; seen.add(key); dedup.push(it);
  }

  renderSuggestions(dedup.slice(0,7), q);
}

function renderSuggestions(items, q) {
  if (!suggestionsContainer) return;
  suggestionsContainer.innerHTML = '';
  if (!items || items.length === 0) { suggestionsContainer.innerHTML = '<div class="suggestion-item no-results">Eşleşen sonuç yok</div>'; return; }
  items.forEach((it, i) => {
    const rawName = it.name || '';
    const rawSub = it.admin1 || '';
    const lat = (it.latitude !== undefined && it.latitude !== null) ? it.latitude : '';
    const lon = (it.longitude !== undefined && it.longitude !== null) ? it.longitude : '';
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.tabIndex = 0;
    // ensure unique id to reference from combobox
    div.id = `suggestion-${suggestionIdCounter++}`;
    div.setAttribute('role','option');
    div.setAttribute('aria-selected', 'false');
    div.dataset.idx = String(i);
    div.dataset.name = it.name || '';
    div.dataset.admin1 = it.admin1 || '';
    div.dataset.lat = lat;
    div.dataset.lon = lon;
    div.innerHTML = `<div class="suggestion-main">${wrapMatch(rawName, q)}</div>${rawSub ? `<div class="suggestion-sub">${wrapMatch(rawSub, q)}</div>` : ''}`;
    div.addEventListener('click', () => selectSuggestionFromElement(div));
    div.addEventListener('focus', () => { if (suggestionsContainer) suggestionsContainer.querySelectorAll('.suggestion-item').forEach(si=>si.setAttribute('aria-selected','false')); div.setAttribute('aria-selected','true'); });
    div.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectSuggestionFromElement(div); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); if (div.nextElementSibling) div.nextElementSibling.focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (div.previousElementSibling) div.previousElementSibling.focus(); else cityInput.focus(); }
      else if (ev.key === 'Escape') { cityInput.focus(); if (suggestionsContainer) suggestionsContainer.innerHTML = ''; }
    });
    suggestionsContainer.appendChild(div);
  });
}

function selectSuggestionFromElement(el) {
  const lat = el.dataset.lat;
  const lon = el.dataset.lon;
  const name = el.dataset.name || '';
  const admin1 = el.dataset.admin1 || '';
  cityInput.value = admin1 ? `${name} / ${admin1}` : name;
  suggestionsContainer.innerHTML = '';
  if (lat && lon) {
    fetchAndRender(lat, lon, name, '');
    saveRecent(cityInput.value);
    return;
  }
  // try remote geocode for the specific suggestion
  (async () => {
    try {
      const q = `${name}${admin1 ? (', ' + admin1) : ''}, Turkey`;
      const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=tr&format=json`;
      const r = await fetch(u);
      if (!r.ok) { showResultError('Konum servisi kullanılamıyor. Lütfen daha sonra tekrar deneyin.'); return; }
      const data = await r.json().catch(()=>({}));
      if (data && data.results && data.results.length) {
        const loc = data.results[0];
        await fetchAndRender(loc.latitude, loc.longitude, loc.name || name, loc.country || '');
        saveRecent(cityInput.value);
      } else {
        showResultError('Seçilen ilçe için koordinat bulunamadı.');
      }
    } catch (e) { debugWarn('select geocode err', e); showResultError('Koordinat sorgusu yapılamadı.'); }
  })();
}

function wrapMatch(text, q) {
  if (!q) return escapeHtml(text);
  try {
    const nq = normalizeForSearch(q);
    const normText = normalizeForSearch(text);
    const start = (() => {
      // build mapping from normalized indices to original string indices
      const map = [];
      let acc = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const nch = normalizeForSearch(ch);
        if (!nch) continue;
        for (let k = 0; k < nch.length; k++) { map.push(i); acc += nch[k]; }
      }
      const idx = acc.indexOf(nq);
      if (idx === -1) return null;
      const s = map[idx];
      const e = map[idx + nq.length - 1];
      return [s, e];
    })();
    if (!start) return escapeHtml(text);
    const s = start[0]; const e = start[1];
    const before = escapeHtml(text.slice(0, s));
    const match = escapeHtml(text.slice(s, e + 1));
    const after = escapeHtml(text.slice(e + 1));
    return before + `<span class="match">${match}</span>` + after;
  } catch (e) { return escapeHtml(text); }
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }
function escapeHtml(str) { return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

async function fetchAndRender(latitude, longitude, name = '', country = '') {
  setLoading(true);
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const resp = await fetch(weatherUrl);
    if (!resp.ok) { showResultError(`Hava servisi kullanılamıyor. (${resp.status})`, () => fetchAndRender(latitude, longitude, name, country)); return; }
    const weather = await resp.json().catch(()=>null);
    if (!weather || !weather.current_weather) { showResultError('Hava verisi alınamadı.', () => fetchAndRender(latitude, longitude, name, country)); return; }
    lastWeatherData = weather; lastLocation = { latitude, longitude, name, country };
    renderWeatherFromData(weather, name, country);
  } catch (e) { debugError(e); showResultError('Hava verisi alınamadı. Ağ bağlantınızı kontrol edip tekrar deneyin.', () => fetchAndRender(latitude, longitude, name, country)); }
  finally { setLoading(false); }
}

function renderWeatherFromData(weatherData, name='', country='') {
  const current = weatherData.current_weather;
  if (!current) { resultDiv.innerHTML = '<p>Hava verisi yok.</p>'; return; }
  const icon = getIcon(current.weathercode || 0);
  const desc = weatherCodeMap[current.weathercode] || '';
  updateWeatherBackground(Number(current.weathercode || 0));
  const html = `
    <div class="weather-current">
      <div class="icon">${icon}</div>
      <div class="details">
        <p><strong>Şehir:</strong> ${escapeHtml(name)}${country ? (', ' + escapeHtml(country)) : ''}</p>
        <p><strong>Sıcaklık:</strong> ${formatTemp(current.temperature)}</p>
        <p><strong>Rüzgar:</strong> ${current.windspeed} km/h</p>
        <p><strong>Hava:</strong> ${escapeHtml(desc)}</p>
        <p><strong>Saat:</strong> ${new Date(current.time).toLocaleString('tr-TR')}</p>
      </div>
    </div>
  `;
  // build daily forecast (up to 5 days)
  let dailyHtml = '';
  try {
    const d = weatherData.daily || {};
    const times = d.time || [];
    const maxes = d.temperature_2m_max || [];
    const mins = d.temperature_2m_min || [];
    const codes = d.weathercode || [];
    if (times && times.length) {
      const n = Math.min(5, times.length);
      dailyHtml = '<div class="forecast-daily" aria-label="5 günlük tahmin"><div class="cards">';
      for (let i = 0; i < n; i++) {
        const dateStr = times[i];
        const max = maxes[i];
        const min = mins[i];
        const code = codes[i];
        let dayLabel = dateStr;
        try { dayLabel = new Date(dateStr).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }); } catch (e) {}
        dailyHtml += `<div class="card" role="group" aria-label="Tahmin ${i+1}">`;
        dailyHtml += `<div class="card-day">${escapeHtml(dayLabel)}</div>`;
        dailyHtml += `<div class="card-icon">${getIcon(code)}</div>`;
        dailyHtml += `<div class="card-temp"><div class="card-temp-max">${formatTemp(max)}</div><div class="card-temp-min">${formatTemp(min)}</div></div>`;
        dailyHtml += `</div>`;
      }
      dailyHtml += '</div></div>';
    }
  } catch (e) { debugWarn('daily render err', e); }

  // add hourly panel placeholder and render (aria-hidden initially)
  resultDiv.innerHTML = html + dailyHtml + '<div id="hourlyPanel" class="forecast-hourly" aria-hidden="true" tabindex="-1"></div>';

  // attach click handlers to daily cards to show hourly details
  try {
    const dailyTimes = (weatherData.daily && weatherData.daily.time) || [];
    const hourly = weatherData.hourly || {};
    const hourTimes = hourly.time || [];
    const hourlyPanel = document.getElementById('hourlyPanel');
    if (hourlyPanel) {
      // build container, close button and rows
      hourlyPanel.innerHTML = '';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'unit-btn hourly-close';
      closeBtn.textContent = 'Kapat';
      closeBtn.style.marginBottom = '8px';
      hourlyPanel.appendChild(closeBtn);
      const rowsContainer = document.createElement('div');
      rowsContainer.className = 'hour-rows';
      hourlyPanel.appendChild(rowsContainer);

      // accessibility attributes
      hourlyPanel.setAttribute('role', 'region');
      hourlyPanel.setAttribute('aria-label', 'Saatlik tahmin');
      hourlyPanel.setAttribute('aria-hidden', 'true');
      hourlyPanel.tabIndex = -1;

      const cards = resultDiv.querySelectorAll('.forecast-daily .card');
      let lastOpenedCard = null;
      function closeHourly() {
        hourlyPanel.classList.remove('open');
        hourlyPanel.setAttribute('aria-hidden', 'true');
        hourlyPanel.dataset.date = '';
        cards.forEach(c => c.setAttribute('aria-expanded', 'false'));
        if (lastOpenedCard) { try { lastOpenedCard.focus(); } catch (e) {} }
        lastOpenedCard = null;
        document.removeEventListener('keydown', hourlyEscHandler);
      }
      function hourlyEscHandler(e) { if (e.key === 'Escape') closeHourly(); }
      closeBtn.addEventListener('click', () => closeHourly());

      cards.forEach((card, idx) => {
        card.setAttribute('role','button');
        card.setAttribute('tabindex','0');
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          const date = dailyTimes[idx];
          if (!date) return;
          // toggle
          if (hourlyPanel.dataset.date === date && hourlyPanel.classList.contains('open')) {
            closeHourly();
            card.setAttribute('aria-expanded','false');
            return;
          }
          // build hourly rows for the selected date
          const hrs = [];
          for (let i = 0; i < hourTimes.length; i++) {
            const t = hourTimes[i];
            if (!t) continue;
            if (t.startsWith(date)) {
              hrs.push({
                time: t,
                temp: (hourly.temperature_2m && hourly.temperature_2m[i] !== undefined) ? hourly.temperature_2m[i] : null,
                humidity: (hourly.relativehumidity_2m && hourly.relativehumidity_2m[i] !== undefined) ? hourly.relativehumidity_2m[i] : null,
                wind: (hourly.windspeed_10m && hourly.windspeed_10m[i] !== undefined) ? hourly.windspeed_10m[i] : null,
                code: (hourly.weathercode && hourly.weathercode[i] !== undefined) ? hourly.weathercode[i] : null
              });
            }
          }
          // render
          rowsContainer.innerHTML = '';
          if (!hrs.length) {
            rowsContainer.innerHTML = '<div class="no-hours">Saatlik veri bulunamadı.</div>';
            hourlyPanel.classList.remove('open');
            hourlyPanel.setAttribute('aria-hidden', 'true');
            hourlyPanel.dataset.date = '';
            cards.forEach(c => c.setAttribute('aria-expanded','false'));
            return;
          }
          hrs.forEach(h => {
            const hr = document.createElement('div');
            hr.className = 'hour-row';
            const tLbl = new Date(h.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            hr.innerHTML = `<div class="hour-time">${escapeHtml(tLbl)}</div><div class="hour-icon">${getIcon(h.code)}</div><div class="hour-temp">${formatTemp(h.temp)}</div>`;
            rowsContainer.appendChild(hr);
          });
          hourlyPanel.dataset.date = date;
          hourlyPanel.classList.add('open');
          hourlyPanel.setAttribute('aria-hidden', 'false');
          // collapse others
          cards.forEach(c => c.setAttribute('aria-expanded','false'));
          card.setAttribute('aria-expanded','true');
          lastOpenedCard = card;
          // focus close button for keyboard users
          try { closeBtn.focus(); } catch(e) {}
          document.addEventListener('keydown', hourlyEscHandler);
          hourlyPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); } });
      });
    }
  } catch (e) { debugWarn('hourly attach err', e); }
}

// show error in result area with optional retry
function showResultError(msg, retryCallback) {
  if (!resultDiv) return;
  // clear result area and show accessible alert
  resultDiv.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'error-wrapper';
  container.setAttribute('role', 'alert');
  container.setAttribute('aria-live', 'polite');

  const p = document.createElement('p');
  p.className = 'error-text';
  p.textContent = msg || 'Bir hata oluştu.';
  container.appendChild(p);

  if (typeof retryCallback === 'function') {
    const btn = document.createElement('button');
    btn.textContent = 'Tekrar Dene';
    btn.className = 'unit-btn retry-btn';
    btn.style.marginTop = '8px';
    btn.setAttribute('aria-label', 'Tekrar dene');

    // safe async handler: disable while running, await promise if returned
    btn.addEventListener('click', async (ev) => {
      if (btn.disabled) return;
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Bekleniyor...';
      btn.setAttribute('aria-busy', 'true');
      try {
        const res = retryCallback();
        if (res && typeof res.then === 'function') {
          await res;
        }
      } catch (err) {
        debugWarn('retry callback failed', err);
      } finally {
        try { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = prev; } catch(e){}
      }
    });

    container.appendChild(btn);
    // focus the retry button so screen readers announce it
    setTimeout(() => { try { btn.focus(); } catch (e) {} }, 50);
  }

  resultDiv.appendChild(container);
}

function setLoading(v) {
  const controls = [cityInput, searchBtn, clearBtn, useLocationBtn, unitCBtn, unitFBtn];
  controls.forEach(el => { if (el) el.disabled = !!v; });
  if (!resultDiv) return;
  if (v) {
    resultDiv.setAttribute('aria-busy', 'true');
    resultDiv.innerHTML = '<div class="loading-wrapper" role="status" aria-live="polite"><div class="loading" aria-hidden="true"></div><div class="loading-message">Yükleniyor...</div></div>';
    document.body.classList.add('loading-active');
  } else {
    resultDiv.removeAttribute('aria-busy');
    document.body.classList.remove('loading-active');
    if (!lastWeatherData) resultDiv.innerHTML = '<p>Bir şehir arat.</p>';
  }
}

function getIcon(code) {
  const map = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',61:'🌧️',71:'🌨️',95:'⛈️'};
  return map[code] || '❓';
}

function updateWeatherBackground(code) {
  const body = document.body;
  if (!body) return;
  body.classList.remove('clear', 'cloudy', 'rain', 'snow', 'fog', 'thunder');

  if ([0].includes(code)) body.classList.add('clear');
  else if ([1, 2, 3].includes(code)) body.classList.add('cloudy');
  else if ([45, 48].includes(code)) body.classList.add('fog');
  else if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) body.classList.add('rain');
  else if ([71, 73, 75, 77, 85, 86].includes(code)) body.classList.add('snow');
  else if ([95, 96, 99].includes(code)) body.classList.add('thunder');
}

const weatherCodeMap = {0:'Açık',1:'Çok az bulutlu',2:'Parçalı bulutlu',3:'Bulutlu',45:'Sis',48:'Donmuş sis',51:'Çiseleme',61:'Yağmur',71:'Kar',95:'Fırtına'};

function formatTemp(c) { const n = Number(c); if (isNaN(n)) return '—'; return unit === 'C' ? `${Math.round(n)} °C` : `${Math.round(n*9/5+32)} °F`; }

// Recent searches
function saveRecent(v) {
  try { if (!v) return; const key='weather_recent'; let arr=JSON.parse(localStorage.getItem(key)||'[]'); arr = arr.filter(x=>x.toLowerCase()!==v.toLowerCase()); arr.unshift(v); if (arr.length>5) arr=arr.slice(0,5); localStorage.setItem(key, JSON.stringify(arr)); renderRecent(); } catch(e){ debugWarn(e); } }
function renderRecent() { const cont=document.getElementById('recent'); if(!cont) return; const arr=JSON.parse(localStorage.getItem('weather_recent')||'[]'); if(!arr||!arr.length){cont.innerHTML='';return;} cont.innerHTML = '<div class="recent-title"><strong>Son Aramalar</strong></div><div class="recent-list">'+arr.map(a=>`<button class="recent-item">${escapeHtml(a)}</button>`).join('')+'</div>'; cont.querySelectorAll('.recent-item').forEach(b=>b.addEventListener('click',()=>{ cityInput.value=b.textContent; searchBtn.click(); })); }

// basic input handlers
cityInput && cityInput.addEventListener('input', debounce(e=>searchSuggestions(e.target.value), 250));
clearBtn && clearBtn.addEventListener('click', ()=>{ cityInput.value=''; suggestionsContainer.innerHTML=''; cityInput.focus(); });

// submit via form (Enter) and direct click
const searchForm = document.getElementById('searchForm');
if (searchForm) searchForm.addEventListener('submit', (ev) => { ev.preventDefault(); if (searchBtn) searchBtn.click(); });

cityInput && cityInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); if (searchBtn) searchBtn.click(); }
  else if (ev.key === 'ArrowDown') {
    const first = suggestionsContainer && suggestionsContainer.querySelector('.suggestion-item');
    if (first) { first.focus(); ev.preventDefault(); }
  }
});

if (searchBtn) searchBtn.addEventListener('click', async ()=>{
  const q = cityInput.value.trim(); if(!q) return; // try remote geocode
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=tr&format=json`;
    const r = await fetch(url); if(!r.ok){ showResultError('Konum servisi kullanılamıyor. Lütfen tekrar deneyin.', () => searchBtn.click()); return; }
    const data = await r.json().catch(()=>null);
    if (!data || !data.results || !data.results.length) { showResultError('Şehir bulunamadı. Başka bir isim deneyin.'); return; }
    const loc = data.results[0]; await fetchAndRender(loc.latitude, loc.longitude, loc.name||q, loc.country||'');
  } catch(e){ debugWarn(e); showResultError('Arama başarısız. Ağ bağlantınızı kontrol edip tekrar deneyin.', () => searchBtn.click()); }
});

// unit toggles
if (unitCBtn) unitCBtn.addEventListener('click', ()=>{ unit='C'; localStorage.setItem('weather_unit', unit); setActiveUnitButton(); if (lastWeatherData) renderWeatherFromData(lastWeatherData, lastLocation.name, lastLocation.country); });
if (unitFBtn) unitFBtn.addEventListener('click', ()=>{ unit='F'; localStorage.setItem('weather_unit', unit); setActiveUnitButton(); if (lastWeatherData) renderWeatherFromData(lastWeatherData, lastLocation.name, lastLocation.country); });

// Export reindex to window for runtime calls
window.reindexLocalDistricts = reindexLocalDistricts;

// Show a small geolocation notice (for permission guidance)
function showGeoNotice(msg, isError = false) {
  const el = document.getElementById('geoNotice');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.style.display = 'none';
    el.textContent = '';
    el.classList.remove('error');
    el.removeAttribute('tabindex');
    return;
  }

  // Build accessible content; escape user-facing text
  if (isError) {
    el.innerHTML = `<span class="geo-icon" aria-hidden="true">📍</span> <span class="geo-text">${escapeHtml(msg)}</span> <button id="geoHelpLink" class="link-button" aria-label="Konum izni nasıl açılır?">Nasıl izin verilir?</button>`;
  } else {
    el.innerHTML = `<span class="geo-icon" aria-hidden="true">📍</span> <span class="geo-text">${escapeHtml(msg)}</span>`;
  }

  el.hidden = false;
  el.style.display = 'block';
  el.classList.toggle('error', !!isError);

  // Make it keyboard focusable briefly so screen readers announce it
  el.setAttribute('tabindex', '-1');
  setTimeout(() => { try { el.focus(); } catch(e){} }, 50);

  const help = document.getElementById('geoHelpLink');
  if (help) {
    help.addEventListener('click', (ev) => { ev.preventDefault(); openGeoModal(); });
  }
}

// Modal controls
function openGeoModal() {
  const overlay = document.getElementById('geoModalOverlay');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.style.display = 'flex';
  const close = document.getElementById('geoModalClose');
  if (close) close.focus();
}

function closeGeoModal() {
  const overlay = document.getElementById('geoModalOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.style.display = 'none';
}

// attach modal close handler
document.addEventListener('click', (ev) => {
  if (!ev.target) return;
  if (ev.target.id === 'geoModalClose') {
    closeGeoModal();
  }
  // click outside modal to close
  if (ev.target.id === 'geoModalOverlay') {
    closeGeoModal();
  }
});

// IP-based fallback for approximate location when geolocation is denied
async function ipFallback() {
  // try several public IP->geo providers and be resilient to different response shapes
  const endpoints = [
    'https://ipwho.is/',
    'https://ipapi.co/json/',
    'https://ipinfo.io/json',
    'https://ip-api.com/json/'
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url);
      if (!r.ok) { debugWarn('ipFallback non-ok', url, r && r.status); continue; }
      const d = await r.json().catch(() => null);
      if (!d) continue;
      let lat = null, lon = null;
      // common shapes
      if (d.latitude !== undefined) lat = Number(d.latitude);
      else if (d.lat !== undefined) lat = Number(d.lat);
      else if (d.loc && typeof d.loc === 'string' && d.loc.indexOf(',') !== -1) {
        const parts = d.loc.split(',').map(s=>s.trim());
        lat = Number(parts[0]); lon = Number(parts[1]);
      } else if (d.location && d.location.latitude) lat = Number(d.location.latitude);

      if (d.longitude !== undefined) lon = Number(d.longitude);
      else if (d.lon !== undefined) lon = Number(d.lon);
      else if (!lon && d.loc && typeof d.loc === 'string' && d.loc.indexOf(',') !== -1) {
        const parts = d.loc.split(',').map(s=>s.trim());
        lat = Number(parts[0]); lon = Number(parts[1]);
      } else if (d.location && d.location.longitude) lon = Number(d.location.longitude);

      if (lat != null && !isNaN(lat) && lon != null && !isNaN(lon)) {
        const city = d.city || d.region || d.region_name || d.city_name || '';
        const country = d.country_name || d.country || d.countryCode || d.country || '';
        return { latitude: lat, longitude: lon, city, country, source: url };
      }
    } catch (e) {
      debugWarn('ipFallback error for', url, e);
      continue;
    }
  }
  return null;
}

// reverse geocode to get a human-readable place name for coordinates
async function reverseGeocode(latitude, longitude) {
  // Try Open-Meteo first
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&count=1&language=tr`;
    const r = await fetch(url);
    if (r && r.ok) {
      const d = await r.json().catch(() => null);
      if (d && d.results && d.results.length) {
        const res = d.results[0];
        return { name: res.name || res.admin1 || '', admin1: res.admin1 || '', country: res.country || '' };
      }
    } else {
      debugWarn('reverseGeocode open-meteo status', r && r.status);
    }
  } catch (e) {
    debugWarn('reverseGeocode open-meteo err', e);
  }

  // Fallback: Nominatim (OpenStreetMap)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&accept-language=tr`;
    const r2 = await fetch(nomUrl, { headers: { 'Accept': 'application/json' } });
    if (r2 && r2.ok) {
      const d2 = await r2.json().catch(() => null);
      if (d2) {
        const addr = d2.address || {};
        const name = addr.city || addr.town || addr.village || addr.county || d2.display_name || '';
        const country = addr.country || '';
        return { name, admin1: addr.state || addr.region || '', country };
      }
    } else {
      debugWarn('reverseGeocode nominatim status', r2 && r2.status);
    }
  } catch (e) {
    debugWarn('reverseGeocode nominatim err', e);
  }

  return null;
}

// Attach handler to explicit "use my location" button
const useLocationBtn = document.getElementById('useLocationBtn');
if (useLocationBtn) {
  useLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showGeoNotice('Tarayıcınız konum servislerini desteklemiyor.', true);
      return;
    }
    showGeoNotice('Konum isteniyor…', false);
    setLoading(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false);
          showGeoNotice('');
          const { latitude, longitude } = pos.coords || {};
          if (latitude != null && longitude != null) {
            (async () => {
              try {
                let placeName = '';
                let country = '';
                const rev = await reverseGeocode(latitude, longitude);
                if (rev) {
                  placeName = rev.name || rev.admin1 || '';
                  country = rev.country || '';
                }
                if (placeName) {
                  showGeoNotice(`Konum: ${placeName}. Hava yükleniyor...`, false);
                } else {
                  showGeoNotice('Konum bulundu. Yer adı alınamadı. Hava yükleniyor...', false);
                }
                fetchAndRender(latitude, longitude, placeName, country);
                try { saveRecent('Konumum' + (placeName ? `: ${placeName}` : '')); } catch(e) {}
              } catch (e) {
                fetchAndRender(latitude, longitude, '', '');
                try { saveRecent('Konumum'); } catch(e) {}
              }
            })();
          } else {
            showGeoNotice('Konum alınamadı.', true);
          }
        },
        (err) => {
            setLoading(false);
            if (err && err.code === 1) {
              showGeoNotice('Konum izni reddedildi. IP tabanlı yaklaşık konum deneniyor...', false);
              // attempt IP-based fallback
              ipFallback().then(loc => {
                if (loc && loc.latitude != null && loc.longitude != null) {
                  (async () => {
                    try {
                      let placeName = loc.city || loc.region || '';
                      let country = loc.country || '';
                      if (!placeName) {
                        const rev = await reverseGeocode(loc.latitude, loc.longitude);
                        if (rev) {
                          placeName = rev.name || rev.admin1 || '';
                          country = country || rev.country || '';
                        }
                      }
                      if (placeName) {
                        showGeoNotice(`Yaklaşık konum: ${placeName}. Hava yükleniyor...`, false);
                      } else {
                        showGeoNotice(`Yaklaşık konum tespit edildi (lat: ${loc.latitude.toFixed(2)}, lon: ${loc.longitude.toFixed(2)}). Hava yükleniyor...`, false);
                      }
                      fetchAndRender(loc.latitude, loc.longitude, placeName, country);
                      try { saveRecent('IP konumu' + (placeName ? `: ${placeName}` : '')); } catch(e) {}
                    } catch (e) {
                      debugWarn('ip fallback reverse err', e);
                      showGeoNotice('IP tabanlı konum alınamadı.', true);
                    }
                  })();
                } else {
                  showGeoNotice('IP tabanlı konum alınamadı. Tarayıcı izinlerini açın.', true);
                }
              }).catch(e => {
                debugWarn('ip fallback err', e);
                showGeoNotice('IP tabanlı konum alınamadı.', true);
              });
            } else {
              showGeoNotice('Konum alınamadı: ' + (err && err.message ? err.message : 'Hata'), true);
            }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
      );
    } catch (e) {
      setLoading(false);
      showGeoNotice('Konum alınamadı.', true);
    }
  });
}

// on load: reindex and show hint if permission previously denied
window.addEventListener('load', async () => {
  renderRecent();
  setActiveUnitButton();
  await reindexLocalDistricts();
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p && p.state === 'denied') {
        showGeoNotice('Konum izni tarayıcı tarafından engellenmiş. Site izinlerinden konumu açın.', true);
      }
    } catch (e) {}
  }
});
