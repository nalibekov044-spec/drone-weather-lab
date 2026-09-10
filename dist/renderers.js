const TAU = Math.PI * 2;

function colors() {
  const style = getComputedStyle(document.documentElement);
  const read = name => style.getPropertyValue(name).trim();
  return {
    bg: "#081310",
    line: read("--line"),
    text: read("--text"),
    muted: read("--muted"),
    accent: read("--accent"),
    blue: read("--blue"),
    warning: read("--warning")
  };
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

export class GraphRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.layout = null;
  }

  draw(points, variable, metric, currentX, format) {
    const { ctx, width, height } = resizeCanvas(this.canvas);
    const palette = colors();
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);
    if (!points.length) {
      ctx.fillStyle = palette.muted;
      ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText("Нет допустимых значений", 28, 38);
      this.layout = null;
      return;
    }

    const margin = width < 520 ? { top: 38, right: 20, bottom: 64, left: 62 } : { top: 44, right: 34, bottom: 70, left: 78 };
    const plot = { x: margin.left, y: margin.top, width: width - margin.left - margin.right, height: height - margin.top - margin.bottom };
    const xMin = Math.min(...points.map(point => point.x));
    const xMax = Math.max(...points.map(point => point.x));
    let yMin = Math.min(...points.map(point => point.y));
    let yMax = Math.max(...points.map(point => point.y));
    const rawRange = yMax - yMin;
    const yPad = rawRange > 1e-9 ? rawRange * 0.12 : Math.max(1, Math.abs(yMax) * 0.1);
    yMin -= yPad;
    yMax += yPad;
    if (metric.unit === "%") {
      yMin = Math.min(yMin, 0);
      yMax = Math.max(yMax, 0);
    }
    const xScale = value => plot.x + (value - xMin) / Math.max(1e-9, xMax - xMin) * plot.width;
    const yScale = value => plot.y + plot.height - (value - yMin) / Math.max(1e-9, yMax - yMin) * plot.height;

    ctx.strokeStyle = palette.line;
    ctx.fillStyle = palette.muted;
    ctx.lineWidth = 1;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    for (let index = 0; index <= 5; index += 1) {
      const yValue = yMin + (yMax - yMin) * index / 5;
      const py = yScale(yValue);
      ctx.beginPath(); ctx.moveTo(plot.x, py); ctx.lineTo(plot.x + plot.width, py); ctx.stroke();
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(format(yValue, Math.abs(yMax - yMin) < 10 ? 1 : 0), plot.x - 10, py);
    }
    for (let index = 0; index <= 5; index += 1) {
      const xValue = xMin + (xMax - xMin) * index / 5;
      const px = xScale(xValue);
      ctx.beginPath(); ctx.moveTo(px, plot.y); ctx.lineTo(px, plot.y + plot.height); ctx.stroke();
      ctx.textAlign = index === 0 ? "left" : index === 5 ? "right" : "center";
      ctx.textBaseline = "top";
      ctx.fillText(format(xValue, Math.abs(xMax - xMin) < 20 ? 1 : 0), px, plot.y + plot.height + 10);
    }

    if (yMin < 0 && yMax > 0) {
      ctx.strokeStyle = palette.warning;
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(plot.x, yScale(0)); ctx.lineTo(plot.x + plot.width, yScale(0)); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const gradient = ctx.createLinearGradient(plot.x, 0, plot.x + plot.width, 0);
    gradient.addColorStop(0, palette.blue);
    gradient.addColorStop(1, palette.accent);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((point, index) => {
      const px = xScale(point.x);
      const py = yScale(point.y);
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    if (currentX >= xMin && currentX <= xMax) {
      const current = points.reduce((best, point) => Math.abs(point.x - currentX) < Math.abs(best.x - currentX) ? point : best, points[0]);
      const px = xScale(current.x);
      const py = yScale(current.y);
      ctx.fillStyle = palette.bg;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = palette.text;
      ctx.textAlign = px > plot.x + plot.width * 0.78 ? "right" : "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${format(current.y, 1)} ${metric.unit}`, px + (px > plot.x + plot.width * 0.78 ? -10 : 10), py - 8);
    }

    ctx.fillStyle = palette.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${variable.label}, ${variable.unit}`, plot.x + plot.width / 2, height - 12);
    ctx.save();
    ctx.translate(18, plot.y + plot.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${metric.label}, ${metric.unit}`, 0, 0);
    ctx.restore();
    this.layout = { points, plot, xScale, yScale };
  }

  nearest(clientX) {
    if (!this.layout) return null;
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const { points, plot, xScale, yScale } = this.layout;
    if (px < plot.x || px > plot.x + plot.width) return null;
    const point = points.reduce((best, candidate) => Math.abs(xScale(candidate.x) - px) < Math.abs(xScale(best.x) - px) ? candidate : best, points[0]);
    return { point, x: xScale(point.x), y: yScale(point.y) };
  }
}
