import { formatHour } from './utils.js';

export function drawHourlyChart(canvas, hourly, unit = 'C', theme = 'light') {
  if (!canvas || !hourly?.time?.length) return;
  const count = Math.min(24, hourly.time.length);
  const temperatures = hourly.temperature_2m.slice(0, count).map(value => (
    unit === 'F' ? (value * 9 / 5) + 32 : value
  ));
  const probabilities = hourly.precipitation_probability.slice(0, count);
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(canvas.clientWidth, 320);
  const height = 220;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const colors = theme === 'dark'
    ? { text: '#dbeafe', grid: 'rgba(148,163,184,.22)', temp: '#fbbf24', rain: '#38bdf8' }
    : { text: '#334155', grid: 'rgba(100,116,139,.18)', temp: '#f97316', rain: '#0284c7' };
  const padding = { left: 34, right: 18, top: 22, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const min = Math.floor(Math.min(...temperatures) - 2);
  const max = Math.ceil(Math.max(...temperatures) + 2);
  const range = Math.max(1, max - min);

  context.font = '12px system-ui';
  context.fillStyle = colors.text;
  context.strokeStyle = colors.grid;
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotHeight * i / 4);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(`${Math.round(max - range * i / 4)}°`, 4, y + 4);
  }

  probabilities.forEach((probability, index) => {
    const x = padding.left + plotWidth * index / Math.max(1, count - 1);
    const barHeight = plotHeight * Number(probability || 0) / 100;
    context.fillStyle = `${colors.rain}55`;
    context.fillRect(x - 4, padding.top + plotHeight - barHeight, 8, barHeight);
  });

  context.strokeStyle = colors.temp;
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.beginPath();
  temperatures.forEach((temperature, index) => {
    const x = padding.left + plotWidth * index / Math.max(1, count - 1);
    const y = padding.top + plotHeight - ((temperature - min) / range * plotHeight);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  context.fillStyle = colors.text;
  for (let index = 0; index < count; index += 4) {
    const x = padding.left + plotWidth * index / Math.max(1, count - 1);
    context.fillText(formatHour(hourly.time[index]), Math.max(0, x - 15), height - 10);
  }
}
