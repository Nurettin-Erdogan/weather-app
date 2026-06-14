const labels = {
  tr: {
    0: 'Açık', 1: 'Çoğunlukla açık', 2: 'Parçalı bulutlu', 3: 'Kapalı',
    45: 'Sisli', 48: 'Kırağılı sis', 51: 'Hafif çiseleme', 53: 'Çiseleme',
    55: 'Yoğun çiseleme', 56: 'Donan çiseleme', 57: 'Yoğun donan çiseleme',
    61: 'Hafif yağmur', 63: 'Yağmur', 65: 'Şiddetli yağmur',
    66: 'Donan yağmur', 67: 'Yoğun donan yağmur', 71: 'Hafif kar',
    73: 'Kar yağışı', 75: 'Yoğun kar', 77: 'Kar taneleri',
    80: 'Hafif sağanak', 81: 'Sağanak', 82: 'Şiddetli sağanak',
    85: 'Kar sağanağı', 86: 'Yoğun kar sağanağı', 95: 'Gök gürültülü fırtına',
    96: 'Dolulu fırtına', 99: 'Şiddetli dolulu fırtına',
  },
  en: {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain',
    67: 'Heavy freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
    96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm with hail',
  },
};

export function weatherLabel(code, language = 'tr') {
  return labels[language]?.[Number(code)] ?? labels.tr[Number(code)] ?? '—';
}

export function weatherIcon(code, isDay = 1) {
  const value = Number(code);
  if (value === 0) return isDay ? '☀️' : '🌙';
  if (value === 1) return isDay ? '🌤️' : '🌙';
  if (value === 2) return '⛅';
  if (value === 3) return '☁️';
  if ([45, 48].includes(value)) return '🌫️';
  if ([51, 53, 55, 56, 57, 61, 63, 66, 80, 81].includes(value)) return '🌦️';
  if ([65, 67, 82].includes(value)) return '🌧️';
  if ([71, 73, 77, 85].includes(value)) return '🌨️';
  if ([75, 86].includes(value)) return '❄️';
  if ([95, 96, 99].includes(value)) return '⛈️';
  return '🌡️';
}

export function weatherTheme(code, isDay = 1) {
  const value = Number(code);
  if (!isDay) return 'night';
  if (value === 0) return 'clear';
  if ([1, 2, 3].includes(value)) return 'cloudy';
  if ([45, 48].includes(value)) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'snow';
  if ([95, 96, 99].includes(value)) return 'thunder';
  return 'cloudy';
}
