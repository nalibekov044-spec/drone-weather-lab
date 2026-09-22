const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

export function sampleField(point, field) {
  const { bounds: b, nx, ny, nz } = field;
  if (point[0] <= b.xMin || point[0] >= b.xMax || point[1] <= b.yMin || point[1] >= b.yMax || point[2] <= b.zMin || point[2] >= b.zMax) return null;
  const g = [(point[0] - b.xMin) / (b.xMax - b.xMin) * (nx - 1), (point[1] - b.yMin) / (b.yMax - b.yMin) * (ny - 1), (point[2] - b.zMin) / (b.zMax - b.zMin) * (nz - 1)];
  if (field.solid[Math.round(g[0]) + nx * (Math.round(g[2]) + nz * Math.round(g[1]))]) return null;
  const base = g.map(Math.floor), t = g.map((v, i) => v - base[i]);
  const interpolate = data => {
    let v = 0;
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? 1 : 0, y = c & 2 ? 1 : 0, z = c & 4 ? 1 : 0;
      v += data[base[0] + x + nx * (base[2] + z + nz * (base[1] + y))] * (x ? t[0] : 1 - t[0]) * (y ? t[1] : 1 - t[1]) * (z ? t[2] : 1 - t[2]);
    }
    return v;
  };
  const velocity = [interpolate(field.velocityX), interpolate(field.velocityY), interpolate(field.velocityZ)];
  return { velocity, speed: Math.hypot(...velocity), pressure: interpolate(field.pressure), vorticity: interpolate(field.vorticity) };
}

export function traceLines(field, config, count, layer) {
  const angle = (config.windDirection || 0) * Math.PI / 180;
  const wind = [Math.cos(angle), 0, Math.sin(angle)], lateral = [-Math.sin(angle), 0, Math.cos(angle)];
  const ambientCount = config.windSpeed < 0.1 ? 0 : Math.round(count * (layer === "volume" ? 0.7 : 1));
  const lines = [];
  for (let i = 0; i < count; i++) {
    let point;
    if (i >= ambientCount) {
      const r = (i - ambientCount) % config.rotors, a = r * Math.PI * 2 / config.rotors + (config.rotors === 4 ? Math.PI / 4 : 0);
      const seed = i * 2.399963, radius = config.propRadius * (0.25 + 0.65 * ((i % 7) / 6));
      point = [Math.cos(a) * 0.72 + Math.cos(seed) * radius, 0.37, Math.sin(a) * 0.72 + Math.sin(seed) * radius];
    } else {
      const columns = Math.ceil(Math.sqrt(ambientCount * 1.6)), rows = Math.ceil(ambientCount / columns);
      let offset = -1.25 + 2.5 * (i % columns) / Math.max(1, columns - 1);
      let vertical = -1.1 + 2.25 * Math.floor(i / columns) / Math.max(1, rows - 1);
      if (layer === "horizontal") { offset = -1.25 + 2.5 * i / Math.max(1, ambientCount - 1); vertical = 0.18; }
      if (layer === "vertical") { offset = 0; vertical = -1.2 + 2.4 * i / Math.max(1, ambientCount - 1); }
      point = add(add(wind.map(v => v * -2.05), lateral, offset), [0, vertical, 0]);
    }
    const line = [], stepSize = 0.045;
    let travelTime = 0;
    for (let j = 0; j < 240; j++) {
      const sample = sampleField(point, field);
      if (!sample || sample.speed < 0.015) break;
      line.push({ point, speed: sample.speed, pressure: sample.pressure, vorticity: sample.vorticity, travelTime });
      const middle = sampleField(add(point, norm(sample.velocity), stepSize * 0.5), field);
      if (!middle) break;
      const next = add(point, norm(middle.velocity), stepSize);
      if (!sampleField(next, field)) break;
      travelTime += stepSize * field.stats.worldScale / Math.max(0.015, middle.speed);
      point = next;
    }
    if (line.length > 5) lines.push(line);
  }
  return lines;
}
