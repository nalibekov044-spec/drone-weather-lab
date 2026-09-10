import { rotorPositions } from "./physics.js";

const TAU = Math.PI * 2;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, scalar) => [a[0] * scalar, a[1] * scalar, a[2] * scalar];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = vector => Math.hypot(vector[0], vector[1], vector[2]);
const normalize = vector => {
  const magnitude = length(vector) || 1;
  return mul(vector, 1 / magnitude);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function palette() {
  const style = getComputedStyle(document.documentElement);
  const read = name => style.getPropertyValue(name).trim();
  return {
    bg: "#06100e",
    line: read("--line"),
    lineBright: read("--line-bright"),
    text: read("--text"),
    muted: read("--muted"),
    accent: read("--accent"),
    cyan: read("--cyan"),
    blue: read("--blue"),
    warning: read("--warning"),
    danger: read("--danger"),
    surface: read("--surface-2")
  };
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function parseHex(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return [130, 160, 150];
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function shaded(hex, amount, alpha = 1) {
  const [r, g, b] = parseHex(hex);
  const scale = clamp(amount, 0.25, 1.35);
  return `rgba(${Math.round(clamp(r * scale, 0, 255))},${Math.round(clamp(g * scale, 0, 255))},${Math.round(clamp(b * scale, 0, 255))},${alpha})`;
}

function rotateY(point, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [point[0] * cosine - point[2] * sine, point[1], point[0] * sine + point[2] * cosine];
}

function rotateX(point, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [point[0], point[1] * cosine - point[2] * sine, point[1] * sine + point[2] * cosine];
}

function rotateZ(point, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine, point[2]];
}

function posePoint(point, pose) {
  let transformed = rotateX(point, pose.pitch || 0);
  transformed = rotateZ(transformed, pose.roll || 0);
  transformed = rotateY(transformed, pose.yaw || 0);
  return add(transformed, pose.position || [0, 0, 0]);
}

function boxFaces(center, size, rotation, color, pose) {
  const [width, height, depth] = size;
  const vertices = [
    [-width / 2, -height / 2, -depth / 2], [width / 2, -height / 2, -depth / 2],
    [width / 2, height / 2, -depth / 2], [-width / 2, height / 2, -depth / 2],
    [-width / 2, -height / 2, depth / 2], [width / 2, -height / 2, depth / 2],
    [width / 2, height / 2, depth / 2], [-width / 2, height / 2, depth / 2]
  ].map(vertex => posePoint(add(rotateY(vertex, rotation), center), pose));
  return [
    [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
    [3, 2, 6, 7], [1, 5, 6, 2], [0, 3, 7, 4]
  ].map(indices => ({ points: indices.map(index => vertices[index]), color }));
}

function cylinderFaces(center, radius, height, segments, color, pose) {
  const bottom = [];
  const top = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = index * TAU / segments;
    bottom.push(posePoint(add(center, [Math.cos(angle) * radius, -height / 2, Math.sin(angle) * radius]), pose));
    top.push(posePoint(add(center, [Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius]), pose));
  }
  const faces = [{ points: top, color }, { points: [...bottom].reverse(), color }];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    faces.push({ points: [bottom[index], bottom[next], top[next], top[index]], color });
  }
  return faces;
}

function sphereFaces(center, radius, color, pose) {
  const faces = [];
  const rings = 5;
  const segments = 10;
  const points = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const latitude = -Math.PI / 2 + ring * Math.PI / rings;
    points[ring] = [];
    for (let segment = 0; segment < segments; segment += 1) {
      const longitude = segment * TAU / segments;
      const local = [
        center[0] + Math.cos(latitude) * Math.cos(longitude) * radius,
        center[1] + Math.sin(latitude) * radius,
        center[2] + Math.cos(latitude) * Math.sin(longitude) * radius
      ];
      points[ring][segment] = posePoint(local, pose);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      faces.push({ points: [points[ring][segment], points[ring][next], points[ring + 1][next], points[ring + 1][segment]], color });
    }
  }
  return faces;
}

function circlePoints(center, radius, height, segments, pose) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = index * TAU / segments;
    return posePoint(add(center, [Math.cos(angle) * radius, height, Math.sin(angle) * radius]), pose);
  });
}

export class DroneScene3D {
  constructor(canvas, mode = "flight") {
    this.canvas = canvas;
    this.mode = mode;
    this.camera = {
      yaw: mode === "airflow" ? -0.82 : -0.72,
      pitch: mode === "airflow" ? 0.35 : 0.48,
      distance: mode === "airflow" ? 6.7 : 5.8,
      target: [0, 0, 0]
    };
    this.dragging = false;
    this.lastPointer = null;
    this.sliderZoom = 1;
    this.streamlineCache = { key: "", lines: [] };
    this.cfd = { status: "idle", desiredKey: "", fieldKey: "", field: null, progress: 0, error: "" };
    this.workerBusy = false;
    this.workerTimer = null;
    this.onCFDStatus = null;
    if (mode === "airflow" && typeof Worker !== "undefined") {
      this.worker = new Worker(new URL("./cfd-worker.js", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", event => this.handleWorkerMessage(event.data));
      this.worker.addEventListener("error", event => {
        this.workerBusy = false;
        this.cfd.status = "error";
        this.cfd.error = event.message || "CFD worker error";
        this.emitCFDStatus();
      });
    }
    this.attachControls();
  }

  attachControls() {
    this.canvas.addEventListener("pointerdown", event => {
      this.dragging = true;
      this.lastPointer = [event.clientX, event.clientY];
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add("is-dragging");
    });
    this.canvas.addEventListener("pointermove", event => {
      if (!this.dragging || !this.lastPointer) return;
      const dx = event.clientX - this.lastPointer[0];
      const dy = event.clientY - this.lastPointer[1];
      this.camera.yaw -= dx * 0.008;
      this.camera.pitch = clamp(this.camera.pitch + dy * 0.007, -0.18, 1.32);
      this.lastPointer = [event.clientX, event.clientY];
    });
    const release = event => {
      this.dragging = false;
      this.lastPointer = null;
      this.canvas.classList.remove("is-dragging");
      if (event.pointerId !== undefined && this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener("wheel", event => {
      event.preventDefault();
      this.camera.distance = clamp(this.camera.distance * Math.exp(event.deltaY * 0.001), 3.2, 11);
    }, { passive: false });
  }

  cameraBasis(width, height) {
    const { yaw, pitch, distance, target } = this.camera;
    const effectiveDistance = distance / this.sliderZoom;
    const position = [
      target[0] + Math.sin(yaw) * Math.cos(pitch) * effectiveDistance,
      target[1] + Math.sin(pitch) * effectiveDistance,
      target[2] + Math.cos(yaw) * Math.cos(pitch) * effectiveDistance
    ];
    const forward = normalize(sub(target, position));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = normalize(cross(right, forward));
    return { position, forward, right, up, focal: Math.min(width, height) * 1.05, center: [width / 2, height / 2] };
  }

  project(point, basis) {
    const relative = sub(point, basis.position);
    const depth = dot(relative, basis.forward);
    if (depth <= 0.08) return null;
    return {
      x: basis.center[0] + dot(relative, basis.right) * basis.focal / depth,
      y: basis.center[1] - dot(relative, basis.up) * basis.focal / depth,
      depth
    };
  }

  clear(ctx, width, height, colors) {
    const gradient = ctx.createRadialGradient(width * 0.55, height * 0.35, 20, width * 0.55, height * 0.45, Math.max(width, height) * 0.75);
    gradient.addColorStop(0, "#10251f");
    gradient.addColorStop(1, colors.bg);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawPolyline(ctx, points, basis, color, width = 1, alpha = 1) {
    const projected = points.map(point => this.project(point, basis));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let drawing = false;
    projected.forEach(point => {
      if (!point) { drawing = false; return; }
      if (!drawing) { ctx.moveTo(point.x, point.y); drawing = true; } else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawGrid(ctx, basis, colors, y = -0.82, extent = 3.6, step = 0.5) {
    for (let value = -extent; value <= extent + 0.001; value += step) {
      const major = Math.abs(value % 1) < 0.01;
      this.drawPolyline(ctx, [[-extent, y, value], [extent, y, value]], basis, major ? colors.lineBright : colors.line, major ? 1.1 : 0.7, major ? 0.54 : 0.34);
      this.drawPolyline(ctx, [[value, y, -extent], [value, y, extent]], basis, major ? colors.lineBright : colors.line, major ? 1.1 : 0.7, major ? 0.54 : 0.34);
    }
  }

  drawFaces(ctx, faces, basis, colors) {
    const light = normalize([-0.4, 0.85, 0.3]);
    const prepared = faces.map(face => {
      const projected = face.points.map(point => this.project(point, basis));
      if (projected.some(point => !point)) return null;
      const normal = normalize(cross(sub(face.points[1], face.points[0]), sub(face.points[2], face.points[0])));
      const lightAmount = 0.58 + Math.abs(dot(normal, light)) * 0.55;
      return {
        projected,
        depth: projected.reduce((sum, point) => sum + point.depth, 0) / projected.length,
        fill: shaded(face.color, lightAmount, 0.98)
      };
    }).filter(Boolean).sort((a, b) => b.depth - a.depth);
    prepared.forEach(face => {
      ctx.beginPath();
      face.projected.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fillStyle = face.fill;
      ctx.fill();
      ctx.strokeStyle = colors.lineBright;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  droneGeometry(parameters, result, pose, time, systemState) {
    const colors = palette();
    const faces = [];
    const lines = [];
    const rotorCount = Number(parameters.rotors);
    const rotors = rotorPositions(rotorCount, 0.72);
    const propRadius = clamp(parameters.diameter * 25.4 / Math.max(200, parameters.frameSize) * 0.36, 0.16, 0.34);
    rotors.forEach((rotor, index) => {
      const angle = Math.atan2(rotor.y, rotor.x);
      const motorTemperature = systemState?.motorTemps?.[index] ?? parameters.temperature;
      const motorHealth = systemState?.motorHealths?.[index] ?? 1;
      const motorColor = motorHealth < 0.35 || motorTemperature > 135
        ? colors.danger
        : motorTemperature > 90 ? colors.warning : index % 2 ? colors.cyan : colors.accent;
      const propColor = parameters.icing === "none" ? (index % 2 ? colors.cyan : colors.accent) : "#c9efff";
      faces.push(...boxFaces([rotor.x * 0.5, 0, rotor.y * 0.5], [0.72, 0.055, 0.075], angle, colors.surface, pose));
      faces.push(...cylinderFaces([rotor.x, 0.07, rotor.y], 0.095, 0.14, 10, motorColor, pose));
      lines.push({ points: circlePoints([rotor.x, 0, rotor.y], propRadius, 0.17, 32, pose), color: propColor, width: parameters.icing === "none" ? 1.4 : 2.4, alpha: 0.82 });
      const spin = time * Math.min(18, (result.effectiveRpms?.[index] || parameters.rpm) / 900) * (index % 2 ? -1 : 1);
      const bladeA = posePoint(add([rotor.x, 0, rotor.y], [Math.cos(spin) * propRadius, 0.175, Math.sin(spin) * propRadius]), pose);
      const bladeB = posePoint(add([rotor.x, 0, rotor.y], [-Math.cos(spin) * propRadius, 0.175, -Math.sin(spin) * propRadius]), pose);
      lines.push({ points: [bladeA, bladeB], color: colors.text, width: 2, alpha: 0.75 });
    });

    if (parameters.dronePreset === "racing") {
      faces.push(...boxFaces([0, 0.03, 0], [0.42, 0.18, 0.58], 0, colors.surface, pose));
      faces.push(...boxFaces([0, 0.12, -0.08], [0.28, 0.08, 0.3], 0, colors.danger, pose));
    } else if (parameters.dronePreset === "industrialHex") {
      faces.push(...cylinderFaces([0, 0.04, 0], 0.31, 0.24, 12, colors.surface, pose));
      faces.push(...cylinderFaces([0, -0.13, 0], 0.16, 0.14, 10, colors.warning, pose));
    } else if (parameters.dronePreset === "cargoOcto") {
      faces.push(...boxFaces([0, 0.02, 0], [0.58, 0.22, 0.66], 0, colors.surface, pose));
      faces.push(...boxFaces([0, -0.25, 0], [0.5, 0.32, 0.55], 0, colors.warning, pose));
    } else {
      faces.push(...boxFaces([0, 0.03, 0], [0.48, 0.24, 0.62], 0, colors.surface, pose));
      faces.push(...sphereFaces([0, -0.12, -0.34], 0.11, colors.cyan, pose));
      lines.push({ points: [posePoint([-0.3, -0.13, -0.24], pose), posePoint([-0.38, -0.55, -0.16], pose)], color: colors.text, width: 2, alpha: 0.7 });
      lines.push({ points: [posePoint([0.3, -0.13, -0.24], pose), posePoint([0.38, -0.55, -0.16], pose)], color: colors.text, width: 2, alpha: 0.7 });
      lines.push({ points: [posePoint([-0.38, -0.55, -0.16], pose), posePoint([0.38, -0.55, -0.16], pose)], color: colors.text, width: 2, alpha: 0.7 });
    }

    if (this.mode === "airflow") {
      const size = clamp(parameters.obstacleSize || 1, 0.5, 2);
      if (parameters.flowObstacle === "wall") faces.push(...boxFaces([1.28, 0, 0], [0.18 * size, 1.44 * size, 1.24 * size], 0, colors.warning, pose));
      if (parameters.flowObstacle === "sphere") faces.push(...sphereFaces([1.2, 0, 0], 0.24 * size, colors.warning, pose));
      if (parameters.flowObstacle === "payload") faces.push(...boxFaces([0, -0.38, 0], [0.6 * size, 0.36 * size, 0.56 * size], 0, colors.warning, pose));
    }
    return { faces, lines, rotors, propRadius };
  }

  drawDrone(ctx, basis, parameters, result, pose, time, systemState) {
    const geometry = this.droneGeometry(parameters, result, pose, time, systemState);
    const colors = palette();
    this.drawFaces(ctx, geometry.faces, basis, colors);
    geometry.lines.forEach(line => this.drawPolyline(ctx, line.points, basis, line.color, line.width, line.alpha));
    if (systemState) this.drawMotorHazards(ctx, basis, geometry.rotors, pose, systemState, time, colors);
  }

  drawMotorHazards(ctx, basis, rotors, pose, systemState, time, colors) {
    rotors.forEach((rotor, index) => {
      const temperature = systemState.motorTemps?.[index] || 0;
      const fire = systemState.motorFire?.[index] || 0;
      if (temperature < 78 && fire < 0.01) return;
      const base = posePoint([rotor.x, 0.17, rotor.y], pose);
      const projected = this.project(base, basis);
      if (!projected) return;
      const heat = clamp((temperature - 75) / 80, 0, 1);
      const glow = ctx.createRadialGradient(projected.x, projected.y, 1, projected.x, projected.y, 24 + heat * 20);
      glow.addColorStop(0, `rgba(255,93,45,${0.34 + heat * 0.3})`);
      glow.addColorStop(1, "rgba(255,93,45,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(projected.x, projected.y, 25 + heat * 22, 0, TAU); ctx.fill();

      if (temperature > 108 || fire > 0.03) {
        for (let particle = 0; particle < 7; particle += 1) {
          const age = (time * (0.22 + fire * 0.3) + particle * 0.137 + index * 0.071) % 1;
          const smokePoint = add(base, [Math.sin(particle * 4.1 + time) * 0.08 * age, 0.15 + age * (0.65 + fire * 0.5), Math.cos(particle * 3.2 + time * 0.7) * 0.08 * age]);
          const smoke = this.project(smokePoint, basis);
          if (!smoke) continue;
          ctx.fillStyle = `rgba(90,102,98,${(1 - age) * (0.18 + heat * 0.34)})`;
          ctx.beginPath(); ctx.arc(smoke.x, smoke.y, 3 + age * 10, 0, TAU); ctx.fill();
        }
      }

      if (fire > 0.06) {
        const pulse = 0.82 + Math.sin(time * 22 + index) * 0.18;
        const flameHeight = 14 + fire * 24;
        ctx.fillStyle = `rgba(255,88,35,${clamp(fire, 0.35, 0.95)})`;
        ctx.beginPath();
        ctx.moveTo(projected.x - 7 * pulse, projected.y + 5);
        ctx.quadraticCurveTo(projected.x - 3, projected.y - flameHeight * 0.45, projected.x + Math.sin(time * 17) * 4, projected.y - flameHeight);
        ctx.quadraticCurveTo(projected.x + 5, projected.y - flameHeight * 0.35, projected.x + 7 * pulse, projected.y + 5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,225,90,0.9)";
        ctx.beginPath();
        ctx.moveTo(projected.x - 3, projected.y + 3);
        ctx.quadraticCurveTo(projected.x, projected.y - flameHeight * 0.46, projected.x + 3, projected.y + 3);
        ctx.closePath(); ctx.fill();
      }
    });
  }

  drawWeatherEffects(ctx, basis, parameters, time, colors) {
    const intensity = clamp(parameters.rainRate / 80, 0, 1);
    if (intensity <= 0) return;
    const count = Math.round(18 + intensity * 72);
    for (let index = 0; index < count; index += 1) {
      const x = ((index * 0.618 + time * 0.17) % 1) * 6 - 3;
      const z = ((index * 0.414 + 0.31) % 1) * 5 - 2.5;
      const y = ((index * 0.271 - time * (0.8 + intensity) + 8) % 1) * 3.6 - 0.8;
      this.drawPolyline(ctx, [[x, y, z], [x - 0.05, y - 0.32, z - 0.03]], basis, colors.cyan, 0.7 + intensity, 0.18 + intensity * 0.35);
    }
  }

  drawArrow3D(ctx, basis, start, vector, color, label) {
    const end = add(start, vector);
    const start2d = this.project(start, basis);
    const end2d = this.project(end, basis);
    if (!start2d || !end2d) return;
    const angle = Math.atan2(end2d.y - start2d.y, end2d.x - start2d.x);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(start2d.x, start2d.y); ctx.lineTo(end2d.x, end2d.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end2d.x, end2d.y);
    ctx.lineTo(end2d.x - 9 * Math.cos(angle - Math.PI / 6), end2d.y - 9 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end2d.x - 9 * Math.cos(angle + Math.PI / 6), end2d.y - 9 * Math.sin(angle + Math.PI / 6));
    ctx.closePath(); ctx.fill();
    if (label) {
      ctx.font = "500 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(label, end2d.x + 8, end2d.y - 8);
    }
  }

  renderFlight(state, parameters, result, format) {
    const { ctx, width, height } = resizeCanvas(this.canvas);
    const colors = palette();
    this.sliderZoom = 1;
    const basis = this.cameraBasis(width, height);
    this.clear(ctx, width, height, colors);
    this.drawGrid(ctx, basis, colors);
    const driftScale = 0.17;
    const dronePosition = [clamp(state.x * driftScale, -2.3, 2.3), clamp(0.35 + state.z * 0.12, -0.72, 1.75), clamp(state.y * driftScale, -2.3, 2.3)];
    const tiltMagnitude = Math.atan2(Math.hypot(state.controlX, state.controlY), result.weight);
    const tiltDirection = Math.atan2(state.controlY, state.controlX);
    const pose = {
      position: dronePosition,
      roll: -Math.sin(tiltDirection) * tiltMagnitude,
      pitch: Math.cos(tiltDirection) * tiltMagnitude,
      yaw: 0
    };

    const homeCircle = Array.from({ length: 49 }, (_, index) => {
      const angle = index * TAU / 48;
      return [Math.cos(angle) * 0.28, -0.805, Math.sin(angle) * 0.28];
    });
    this.drawPolyline(ctx, homeCircle, basis, colors.accent, 1.4, 0.8);

    if (state.trail.length > 1) {
      const trail = state.trail.map(point => [clamp(point.x * driftScale, -2.6, 2.6), clamp(0.35 + (point.z || 0) * 0.12, -0.78, 1.85), clamp(point.y * driftScale, -2.6, 2.6)]);
      this.drawPolyline(ctx, trail, basis, colors.accent, 2, 0.62);
    }

    const windAngle = parameters.windDirection * Math.PI / 180;
    const windVector = [Math.cos(windAngle) * 1.2, 0, Math.sin(windAngle) * 1.2];
    for (let row = -2; row <= 2; row += 1) {
      const phase = (state.t * Math.max(0.2, state.windNow) * 0.18 + row * 0.37) % 1;
      const start = [-2.8 + phase * 4.8, 0.72 + row * 0.18, -1.4 + row * 0.65];
      this.drawArrow3D(ctx, basis, start, mul(windVector, 0.32), colors.cyan, "");
    }
    this.drawArrow3D(ctx, basis, [-2.5, 1.5, -2.1], windVector, colors.cyan, `${format(state.windNow, 1)} m/s`);
    this.drawWeatherEffects(ctx, basis, parameters, state.t, colors);
    this.drawDrone(ctx, basis, parameters, result, pose, state.t, state);

    ctx.fillStyle = colors.muted;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("DRAG — ORBIT  •  WHEEL — ZOOM", 18, height - 18);
    ctx.fillStyle = colors.text;
    ctx.fillText(`ALT ${format(state.z, 1)} m  |  TILT ${format(result.tilt, 1)}°`, 18, 24);
  }

  emitCFDStatus() {
    if (this.onCFDStatus) this.onCFDStatus({
      status: this.cfd.status,
      progress: this.cfd.progress,
      error: this.cfd.error,
      stats: this.cfd.field?.stats || null
    });
  }

  handleWorkerMessage(message) {
    if (message.type === "progress") {
      if (message.key === this.cfd.desiredKey) {
        this.cfd.status = "solving";
        this.cfd.progress = message.progress;
        this.emitCFDStatus();
      }
      return;
    }
    this.workerBusy = false;
    if (message.type === "error") {
      if (message.key === this.cfd.desiredKey) {
        this.cfd.status = "error";
        this.cfd.error = message.message;
        this.emitCFDStatus();
      }
    } else if (message.type === "result" && message.key === this.cfd.desiredKey) {
      this.cfd.field = message.field;
      this.cfd.fieldKey = message.key;
      this.cfd.status = "ready";
      this.cfd.progress = 1;
      this.cfd.error = "";
      this.streamlineCache.key = "";
      this.emitCFDStatus();
    }
    if (this.pendingCFD && this.pendingCFD.key !== message.key) this.startCFD(this.pendingCFD);
  }

  startCFD(request) {
    if (!this.worker || this.workerBusy || !request) return;
    this.workerBusy = true;
    this.cfd.status = "solving";
    this.cfd.progress = 0.04;
    this.worker.postMessage(request);
    this.emitCFDStatus();
  }

  ensureCFD(parameters, result, settings) {
    const roundedDownwash = Math.round(result.downwashSpeed * 2) / 2;
    const propRadius = clamp(parameters.diameter * 25.4 / Math.max(200, parameters.frameSize) * 0.36, 0.16, 0.34);
    const config = {
      quality: settings.quality,
      dronePreset: parameters.dronePreset,
      rotors: parameters.rotors,
      frameSize: parameters.frameSize,
      windSpeed: parameters.windSpeed,
      windDirection: parameters.windDirection,
      verticalWind: parameters.verticalWind,
      turbulence: parameters.turbulence,
      downwashSpeed: roundedDownwash,
      density: result.density,
      temperature: parameters.temperature,
      propRadius,
      flowObstacle: parameters.flowObstacle,
      obstacleSize: parameters.obstacleSize
    };
    const key = JSON.stringify(config);
    if (key === this.cfd.desiredKey) return;
    this.cfd.desiredKey = key;
    this.cfd.status = "queued";
    this.cfd.progress = 0;
    this.pendingCFD = { key, config };
    clearTimeout(this.workerTimer);
    this.workerTimer = setTimeout(() => {
      if (!this.worker) {
        this.cfd.status = "error";
        this.cfd.error = "Web Worker недоступен";
        this.emitCFDStatus();
      } else if (!this.workerBusy) {
        this.startCFD(this.pendingCFD);
      }
    }, 140);
    this.emitCFDStatus();
  }

  sampleCFD(point, field) {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = field.bounds;
    if (point[0] <= xMin || point[0] >= xMax || point[1] <= yMin || point[1] >= yMax || point[2] <= zMin || point[2] >= zMax) return null;
    const gx = (point[0] - xMin) / (xMax - xMin) * (field.nx - 1);
    const gy = (point[1] - yMin) / (yMax - yMin) * (field.ny - 1);
    const gz = (point[2] - zMin) / (zMax - zMin) * (field.nz - 1);
    const x0 = Math.floor(gx); const y0 = Math.floor(gy); const z0 = Math.floor(gz);
    const x1 = Math.min(field.nx - 1, x0 + 1); const y1 = Math.min(field.ny - 1, y0 + 1); const z1 = Math.min(field.nz - 1, z0 + 1);
    const tx = gx - x0; const ty = gy - y0; const tz = gz - z0;
    const nearest = Math.round(gx) + field.nx * (Math.round(gz) + field.nz * Math.round(gy));
    if (field.solid[nearest]) return null;
    const interpolate = array => {
      let value = 0;
      for (let corner = 0; corner < 8; corner += 1) {
        const ix = corner & 1 ? x1 : x0;
        const iy = corner & 2 ? y1 : y0;
        const iz = corner & 4 ? z1 : z0;
        const wx = corner & 1 ? tx : 1 - tx;
        const wy = corner & 2 ? ty : 1 - ty;
        const wz = corner & 4 ? tz : 1 - tz;
        value += array[ix + field.nx * (iz + field.nz * iy)] * wx * wy * wz;
      }
      return value;
    };
    const velocity = [interpolate(field.velocityX), interpolate(field.velocityY), interpolate(field.velocityZ)];
    return { velocity, speed: length(velocity), pressure: interpolate(field.pressure), vorticity: interpolate(field.vorticity) };
  }

  makeStreamlines(field, parameters, result, count, layer) {
    const angle = parameters.windDirection * Math.PI / 180;
    const wind = [Math.cos(angle), 0, Math.sin(angle)];
    const lateral = [-Math.sin(angle), 0, Math.cos(angle)];
    const rotors = rotorPositions(parameters.rotors, 0.72);
    const propRadius = clamp(parameters.diameter * 25.4 / Math.max(200, parameters.frameSize) * 0.36, 0.16, 0.34);
    const lines = [];
    const ambientCount = parameters.windSpeed < 0.2 ? 0 : Math.round(count * (layer === "volume" ? 0.76 : 1));
    for (let index = 0; index < count; index += 1) {
      let point;
      if (index >= ambientCount) {
        const rotor = rotors[(index - ambientCount) % rotors.length];
        const seedAngle = index * 2.399963;
        const radial = propRadius * (0.18 + 0.66 * ((index % 5) / 4));
        point = [rotor.x + Math.cos(seedAngle) * radial, 1.42, rotor.y + Math.sin(seedAngle) * radial];
      } else if (layer === "horizontal") {
        const offset = -1.25 + 2.5 * index / Math.max(1, ambientCount - 1);
        point = add(mul(wind, -2.05), add(mul(lateral, offset), [0, 0.12, 0]));
      } else if (layer === "vertical") {
        const vertical = -1.22 + 2.42 * index / Math.max(1, ambientCount - 1);
        point = add(mul(wind, -2.05), [0, vertical, 0]);
      } else {
        const columns = Math.ceil(Math.sqrt(ambientCount * 1.75));
        const rows = Math.ceil(ambientCount / columns);
        const offset = -1.25 + 2.5 * (index % columns) / Math.max(1, columns - 1);
        const vertical = -0.9 + 1.9 * Math.floor(index / columns) / Math.max(1, rows - 1);
        point = add(mul(wind, -2.05), add(mul(lateral, offset), [0, vertical, 0]));
      }
      const path = [];
      for (let step = 0; step < 190; step += 1) {
        const sample = this.sampleCFD(point, field);
        if (!sample || sample.speed < 0.025) break;
        path.push({ point: [...point], speed: sample.speed, pressure: sample.pressure, vorticity: sample.vorticity });
        let velocity = [...sample.velocity];
        if (layer === "horizontal") velocity[1] = 0;
        if (layer === "vertical") velocity = sub(velocity, mul(lateral, dot(velocity, lateral)));
        const midpoint = add(point, mul(normalize(velocity), 0.027));
        const middleSample = this.sampleCFD(midpoint, field);
        if (!middleSample) break;
        let middleVelocity = [...middleSample.velocity];
        if (layer === "horizontal") middleVelocity[1] = 0;
        if (layer === "vertical") middleVelocity = sub(middleVelocity, mul(lateral, dot(middleVelocity, lateral)));
        point = add(point, mul(normalize(middleVelocity), 0.054));
        if (layer === "horizontal") point[1] = 0.12;
      }
      if (path.length > 5) lines.push(path);
    }
    return lines;
  }

  streamlineColor(sample, field, mode, colors) {
    if (mode === "pressure") {
      const scale = Math.max(1, Math.abs(field.stats.minPressure), Math.abs(field.stats.maxPressure));
      const ratio = clamp(Math.abs(sample.pressure) / scale, 0, 1);
      return sample.pressure >= 0
        ? `rgba(255,209,102,${0.55 + ratio * 0.4})`
        : `rgba(109,141,255,${0.55 + ratio * 0.4})`;
    }
    if (mode === "vorticity") {
      const ratio = clamp(sample.vorticity / Math.max(0.001, field.stats.maxVorticity), 0, 1);
      return ratio > 0.55 ? `rgba(255,107,117,${0.58 + ratio * 0.38})` : `rgba(117,243,200,${0.48 + ratio * 0.42})`;
    }
    const ratio = clamp(sample.speed / Math.max(0.1, field.stats.maxSpeed), 0, 1);
    return ratio > 0.58 ? colors.cyan : colors.blue;
  }

  drawStreamlines(ctx, basis, lines, colors, time, field, colorMode) {
    lines.forEach((line, lineIndex) => {
      for (let index = 1; index < line.length; index += 1) {
        const previous = this.project(line[index - 1].point, basis);
        const current = this.project(line[index].point, basis);
        if (!previous || !current) continue;
        const ratio = clamp(line[index].speed / Math.max(0.1, field.stats.maxSpeed), 0, 1);
        ctx.strokeStyle = this.streamlineColor(line[index], field, colorMode, colors);
        ctx.globalAlpha = 0.32 + ratio * 0.48;
        ctx.lineWidth = 0.8 + ratio * 1.25;
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();
      }
      const beadIndex = Math.floor((time * 18 + lineIndex * 7) % line.length);
      const bead = this.project(line[beadIndex].point, basis);
      if (bead) {
        ctx.fillStyle = colors.accent;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(bead.x, bead.y, 2.2, 0, TAU); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  renderAirflow(parameters, result, settings, time, format) {
    const { ctx, width, height } = resizeCanvas(this.canvas);
    const colors = palette();
    this.sliderZoom = settings.zoom;
    const basis = this.cameraBasis(width, height);
    this.clear(ctx, width, height, colors);
    this.drawGrid(ctx, basis, colors, -1.05, 3.5, 0.5);

    this.ensureCFD(parameters, result, settings);
    const fieldReady = this.cfd.field && this.cfd.fieldKey === this.cfd.desiredKey;
    if (fieldReady) {
      const cacheKey = [this.cfd.fieldKey, settings.count, settings.layer].join("|");
      if (cacheKey !== this.streamlineCache.key) {
        this.streamlineCache = { key: cacheKey, lines: this.makeStreamlines(this.cfd.field, parameters, result, settings.count, settings.layer) };
      }
      this.drawStreamlines(ctx, basis, this.streamlineCache.lines, colors, time, this.cfd.field, settings.colorMode);
    }
    this.drawDrone(ctx, basis, parameters, result, { position: [0, 0, 0], pitch: 0, roll: 0, yaw: 0 }, time, settings.systemState);

    const windAngle = parameters.windDirection * Math.PI / 180;
    this.drawArrow3D(ctx, basis, [-2.5, 1.65, -2], [Math.cos(windAngle) * 1.25, 0, Math.sin(windAngle) * 1.25], colors.cyan, `${format(parameters.windSpeed, 1)} m/s`);
    ctx.fillStyle = colors.muted;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("DRAG — ORBIT  •  WHEEL — ZOOM", 18, height - 18);
    ctx.fillStyle = colors.text;
    const cfdLabel = fieldReady
      ? `${this.cfd.field.stats.method} · ${this.cfd.field.stats.cells.toLocaleString("ru-RU")} CELLS`
      : this.cfd.status === "error" ? "CFD ERROR" : `CFD SOLVING · ${Math.round(this.cfd.progress * 100)}%`;
    ctx.fillText(`${settings.layer.toUpperCase()} · ${cfdLabel}`, 18, 24);
  }
}
