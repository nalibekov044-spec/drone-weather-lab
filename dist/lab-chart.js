// 0.92: small line chart for the flight log, mission plan and altitude ceiling.
// Colours come from the active theme, so the charts follow theme changes like the main graph.
function palette() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: read('--plot-bg', read('--bg', '#081310')),
    line: read('--line', '#223a35'),
    text: read('--text', '#edf8f4'),
    muted: read('--muted', '#91aaa3'),
    accent: read('--accent', '#75f3c8'),
    blue: read('--blue', '#6d8dff'),
    warning: read('--warning', '#ffd166'),
    danger: read('--danger', '#ff6b75')
  };
}

// Decimals that a tick step needs, e.g. 0.05 → 2.
export const stepDigits = step => Math.max(0, Math.min(4, -Math.floor(Math.log10(Math.abs(step) || 1) + 1e-9)));

// "Nice" axis ticks: 1, 2 or 5 times a power of ten.
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max - min < 1e-12) {
    const pad = Math.max(1, Math.abs(max) * .1);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count),
    power = 10 ** Math.floor(Math.log10(raw)),
    step = [1, 2, 5, 10].map(f => f * power).find(s => s >= raw) || 10 * power;
  const ticks = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

export function drawLineChart(canvas, options) {
  const rect = canvas.getBoundingClientRect(),
    dpr = Math.min(2, window.devicePixelRatio || 1),
    width = Math.max(240, rect.width || canvas.width),
    height = Math.max(120, rect.height || canvas.height);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d'),
    c = palette(),
    font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.font = font;
  const series = (options.series || []).filter(s => s.points?.length);
  const all = series.flatMap(s => s.points);
  if (!all.length) {
    ctx.fillStyle = c.muted;
    ctx.textBaseline = 'middle';
    ctx.fillText(options.empty || '', 16, height / 2);
    return null;
  }
  const margin = {
    top: 22,
    right: 16,
    bottom: 34,
    left: width < 480 ? 46 : 58
  };
  const plot = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom
  };
  let xMin = options.xMin ?? Math.min(...all.map(p => p.x)),
    xMax = options.xMax ?? Math.max(...all.map(p => p.x));
  if (xMax - xMin < 1e-9) xMax = xMin + 1;
  const extraY = (options.hLines || []).map(l => l.y);
  let yMin = options.yMin ?? Math.min(...all.map(p => p.y), ...extraY),
    yMax = options.yMax ?? Math.max(...all.map(p => p.y), ...extraY);
  if (options.yMin === undefined || options.yMax === undefined) {
    const pad = yMax - yMin > 1e-9 ? (yMax - yMin) * .08 : Math.max(1, Math.abs(yMax) * .1);
    if (options.yMin === undefined) yMin -= pad;
    if (options.yMax === undefined) yMax += pad;
  }
  const yTicks = niceTicks(yMin, yMax, Math.max(2, Math.floor(plot.h / 34)));
  if (options.yMin === undefined && yTicks.length) yMin = Math.min(yMin, yTicks[0]);
  if (options.yMax === undefined && yTicks.length) yMax = Math.max(yMax, yTicks.at(-1));
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const X = v => plot.x + (v - xMin) / (xMax - xMin) * plot.w,
    Y = v => plot.y + plot.h - (v - yMin) / Math.max(1e-12, yMax - yMin) * plot.h;
  const fx = options.xFormat || (v => String(v)),
    fy = options.yFormat || (v => String(v));
  for (const band of options.bands || []) {
    ctx.fillStyle = band.color || 'rgba(240,95,90,.12)';
    ctx.fillRect(X(band.x0), plot.y, X(band.x1) - X(band.x0), plot.h);
  }
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;
  ctx.fillStyle = c.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yTicks) {
    if (v < yMin - 1e-9 || v > yMax + 1e-9) continue;
    ctx.beginPath();
    ctx.moveTo(plot.x, Y(v));
    ctx.lineTo(plot.x + plot.w, Y(v));
    ctx.stroke();
    ctx.fillText(fy(v, yStep), plot.x - 8, Y(v));
  }
  const xTicks = options.xTicks || niceTicks(xMin, xMax, Math.max(2, Math.floor(plot.w / 90)));
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  for (const v of xTicks) {
    if (v < xMin - 1e-9 || v > xMax + 1e-9) continue;
    ctx.beginPath();
    ctx.moveTo(X(v), plot.y + plot.h);
    ctx.lineTo(X(v), plot.y + plot.h + 4);
    ctx.stroke();
    ctx.fillText(fx(v), X(v), plot.y + plot.h + 8);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (options.yLabel) ctx.fillText(options.yLabel, plot.x, 13);
  if (options.xLabel) {
    ctx.textAlign = 'right';
    ctx.fillText(options.xLabel, plot.x + plot.w, 13);
  }
  // Vertical markers, e.g. mission stage boundaries.
  ctx.textAlign = 'left';
  for (const marker of options.vLines || []) {
    const x = X(marker.x);
    ctx.strokeStyle = c.line;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    if (marker.label) {
      ctx.fillStyle = c.muted;
      ctx.fillText(marker.label, x + 4, plot.y + 12);
    }
  }
  for (const line of options.hLines || []) {
    ctx.strokeStyle = c[line.tone || 'warning'] || line.tone;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.x, Y(line.y));
    ctx.lineTo(plot.x + plot.w, Y(line.y));
    ctx.stroke();
    ctx.setLineDash([]);
    if (line.label) {
      ctx.fillStyle = c[line.tone || 'warning'] || line.tone;
      ctx.textAlign = line.align === 'left' ? 'left' : 'right';
      ctx.fillText(line.label, line.align === 'left' ? plot.x + 6 : plot.x + plot.w - 4, Y(line.y) - 5);
      ctx.textAlign = 'left';
    }
  }
  for (const s of series) {
    ctx.strokeStyle = c[s.tone || 'accent'] || s.tone;
    ctx.lineWidth = s.width || 2;
    ctx.setLineDash(s.dashed ? [5, 4] : []);
    ctx.beginPath();
    s.points.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of s.points.filter(p => p.dot)) {
      ctx.fillStyle = c[s.tone || 'accent'] || s.tone;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const layout = {
    plot,
    xMin,
    xMax,
    yMin,
    yMax,
    X,
    Y,
    width,
    height,
    toX: offsetX => xMin + (offsetX - plot.x) / plot.w * (xMax - xMin)
  };
  // Hover crosshair.
  if (options.hover && Number.isFinite(options.hover.x)) {
    const hx = X(options.hover.x);
    ctx.strokeStyle = c.text;
    ctx.globalAlpha = .45;
    ctx.beginPath();
    ctx.moveTo(hx, plot.y);
    ctx.lineTo(hx, plot.y + plot.h);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (Number.isFinite(options.hover.y)) {
      ctx.fillStyle = c.text;
      ctx.beginPath();
      ctx.arc(hx, Y(options.hover.y), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return layout;
}
