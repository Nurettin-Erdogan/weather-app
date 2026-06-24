(() => {
  const fallback = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try {
    const stored = JSON.parse(localStorage.getItem('weather_settings_v2') || '{}');
    const preference = ['system', 'light', 'dark'].includes(stored?.theme)
      ? stored.theme
      : 'system';
    document.documentElement.dataset.theme = preference === 'system' ? fallback : preference;
  } catch {
    document.documentElement.dataset.theme = fallback;
  }
})();
