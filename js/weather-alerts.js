const THUNDERSTORM_CODES = new Set([95, 96, 99]);
const HEAVY_RAIN_CODES = new Set([65, 67, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

function finiteValues(values, indexes) {
  return indexes
    .map(index => Number(values?.[index]))
    .filter(Number.isFinite);
}

function nextHourlyIndexes(weather, limit = 24) {
  const times = weather?.hourly?.time || [];
  const currentTime = weather?.current?.time || times[0] || '';
  return times
    .map((time, index) => time >= currentTime ? index : -1)
    .filter(index => index >= 0)
    .slice(0, limit);
}

function maximum(values, fallback = null) {
  return values.length ? Math.max(...values) : fallback;
}

function minimum(values, fallback = null) {
  return values.length ? Math.min(...values) : fallback;
}

export function buildWeatherAlerts(weather, airQuality, preferences = {}) {
  const hourly = weather?.hourly || {};
  const indexes = nextHourlyIndexes(weather);
  const codes = finiteValues(hourly.weather_code, indexes);
  const temperatures = finiteValues(hourly.temperature_2m, indexes);
  const windSpeeds = finiteValues(hourly.wind_speed_10m, indexes);
  const precipitation = finiteValues(hourly.precipitation, indexes);
  const rainProbabilities = finiteValues(hourly.precipitation_probability, indexes);
  const alerts = [];
  const rainThreshold = Number(preferences.rainProbability) || 60;
  const windThreshold = Number(preferences.windSpeed) || 45;
  const uvThreshold = Number(preferences.uvIndex) || 7;

  if (codes.some(code => THUNDERSTORM_CODES.has(code))) {
    alerts.push({ type: 'thunderstorm', severity: 'danger' });
  }

  const rainPeak = maximum(precipitation);
  if (codes.some(code => HEAVY_RAIN_CODES.has(code)) || (rainPeak !== null && rainPeak >= 7.5)) {
    alerts.push({
      type: 'heavyRain',
      severity: rainPeak !== null && rainPeak >= 15 ? 'danger' : 'warning',
      value: rainPeak,
    });
  }

  const rainProbabilityPeak = maximum(rainProbabilities);
  if (
    rainProbabilityPeak !== null
    && rainProbabilityPeak >= rainThreshold
    && !alerts.some(alert => alert.type === 'heavyRain')
  ) {
    alerts.push({ type: 'rainChance', severity: 'warning', value: rainProbabilityPeak });
  }

  if (codes.some(code => SNOW_CODES.has(code))) {
    alerts.push({ type: 'snow', severity: 'warning' });
  }

  const windPeak = maximum(windSpeeds);
  if (windPeak !== null && windPeak >= windThreshold) {
    alerts.push({
      type: 'strongWind',
      severity: windPeak >= 75 ? 'danger' : 'warning',
      value: windPeak,
    });
  }

  const temperaturePeak = maximum(temperatures);
  if (temperaturePeak !== null && temperaturePeak >= 35) {
    alerts.push({
      type: 'heat',
      severity: temperaturePeak >= 40 ? 'danger' : 'warning',
      value: temperaturePeak,
    });
  }

  const temperatureLow = minimum(temperatures);
  if (temperatureLow !== null && temperatureLow <= 0) {
    alerts.push({
      type: 'frost',
      severity: temperatureLow <= -5 ? 'danger' : 'warning',
      value: temperatureLow,
    });
  }

  const uvIndex = Number(weather?.daily?.uv_index_max?.[0]);
  if (Number.isFinite(uvIndex) && uvIndex >= uvThreshold) {
    alerts.push({
      type: 'uv',
      severity: uvIndex >= 11 ? 'danger' : 'warning',
      value: uvIndex,
    });
  }

  const aqi = Number(airQuality?.current?.european_aqi);
  if (Number.isFinite(aqi) && aqi >= 60) {
    alerts.push({
      type: 'airQuality',
      severity: aqi >= 100 ? 'danger' : 'warning',
      value: aqi,
    });
  }

  return alerts;
}
