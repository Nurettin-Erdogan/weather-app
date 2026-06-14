import { isTurkeyCoordinate, normalizeForSearch, titleCase } from './utils.js';

let districts = [];

export async function loadDistrictIndex() {
  const response = await fetch('./data/il-ilce-with-loc.json');
  if (!response.ok) throw new Error(`District data HTTP ${response.status}`);
  const payload = await response.json();
  districts = (payload.data || payload || []).flatMap(province => {
    const provinceName = province.il_adi || province.name || '';
    return (province.ilceler || []).map(district => ({
      province: provinceName,
      district: district.ilce_adi || district.name || '',
      latitude: Number(district.latitude),
      longitude: Number(district.longitude),
      provinceNorm: normalizeForSearch(provinceName),
      districtNorm: normalizeForSearch(district.ilce_adi || district.name || ''),
    }));
  }).filter(item => isTurkeyCoordinate(item.latitude, item.longitude));
  return districts.length;
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function score(item, query) {
  const full = `${item.districtNorm} ${item.provinceNorm}`;
  const [districtPart = '', provincePart = ''] = query.split('/').map(part => part.trim());
  if (provincePart) {
    if (item.districtNorm === districtPart && item.provinceNorm === provincePart) return 120;
    if (item.districtNorm.startsWith(districtPart) && item.provinceNorm.startsWith(provincePart)) return 105;
    return 0;
  }
  if (item.districtNorm === query) return 110;
  if (item.provinceNorm === query) return 100;
  if (full === query) return 108;
  if (item.districtNorm.startsWith(query)) return 90 - (item.districtNorm.length - query.length);
  if (item.provinceNorm.startsWith(query)) return 82 - (item.provinceNorm.length - query.length);
  if (full.includes(query)) return 72;
  if (query.length >= 4) {
    const distance = editDistance(item.districtNorm, query);
    if (distance <= 2) return 60 - distance * 8;
  }
  return 0;
}

function toLocation(item, language = 'tr') {
  const name = titleCase(item.district, language);
  const admin1 = titleCase(item.province, language);
  return {
    id: `${item.districtNorm}|${item.provinceNorm}`,
    name,
    admin1,
    label: `${name} / ${admin1}`,
    country: language === 'tr' ? 'Türkiye' : 'Türkiye',
    latitude: item.latitude,
    longitude: item.longitude,
    source: 'local',
  };
}

export function searchDistricts(value, language = 'tr', limit = 7) {
  const query = normalizeForSearch(value);
  if (!query) return [];
  return districts
    .map(item => ({ item, value: score(item, query) }))
    .filter(result => result.value > 0)
    .sort((a, b) => b.value - a.value || a.item.district.localeCompare(b.item.district, 'tr'))
    .slice(0, limit)
    .map(result => toLocation(result.item, language));
}

export function findDistrict(value, language = 'tr') {
  const query = normalizeForSearch(value);
  if (!query) return null;
  if (query.includes('/')) {
    const [districtPart, provincePart] = query.split('/').map(part => part.trim());
    const exact = districts.find(item => item.districtNorm === districtPart && item.provinceNorm === provincePart);
    return exact ? toLocation(exact, language) : null;
  }
  const exactDistricts = districts.filter(item => item.districtNorm === query);
  if (exactDistricts.length === 1) return toLocation(exactDistricts[0], language);
  const exactFull = districts.find(item => `${item.districtNorm} ${item.provinceNorm}` === query);
  if (exactFull) return toLocation(exactFull, language);
  const suggestion = searchDistricts(value, language, 1)[0];
  return suggestion && normalizeForSearch(suggestion.name).startsWith(query) ? suggestion : null;
}

export function nearestDistrict(latitude, longitude, language = 'tr') {
  let best = null;
  let bestDistance = Infinity;
  const lat = Number(latitude);
  const lon = Number(longitude);
  for (const item of districts) {
    const x = (item.latitude - lat) * Math.PI / 180;
    const y = (item.longitude - lon) * Math.PI / 180 * Math.cos(lat * Math.PI / 180);
    const distance = 6371 * Math.sqrt(x * x + y * y);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best ? { ...toLocation(best, language), distanceKm: bestDistance } : null;
}
