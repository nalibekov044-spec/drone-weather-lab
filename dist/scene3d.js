import { rotorPositions } from "./physics.js";
import { geometryFor, triangulateParts } from "./drone-builder.js";
import { sampleField } from "./flow-lines.js";

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

function resizeCanvas(canvas, pixelRatio = 1.5) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(pixelRatio, window.devicePixelRatio || 1);
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
    this.colors = palette();
    this.model = null;
    this.modelRevision = 0;
    this.staticCanvas = document.createElement("canvas");
    this.staticKey = "";
    this.projectedLines = [];
    this.traceRequestedKey = "";
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
        outline: face.outline !== false,
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
      if (!this.model && face.outline) ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  droneGeometry(parameters, result, pose, time, systemState) {
    const colors = this.colors;
    const faces = [];
    const lines = [];
    const rotorCount = Number(parameters.rotors);
    const design = geometryFor(parameters);
    const rotors = design.rotors;
    const propRadius = parameters.diameter * 0.0254 / (2 * design.worldScale);
    rotors.forEach((rotor, index) => {
      const angle = Math.atan2(rotor.y, rotor.x);
      const motorTemperature = systemState?.motorTemps?.[index] ?? parameters.temperature;
      const motorHealth = systemState?.motorHealths?.[index] ?? 1;
      const motorColor = motorHealth < 0.35 || motorTemperature > 135
        ? colors.danger
        : motorTemperature > 90 ? colors.warning : index % 2 ? colors.cyan : colors.accent;
      const propColor = parameters.icing === "none" ? (index % 2 ? colors.cyan : colors.accent) : "#c9efff";
      if (!this.model && !design.parts) {
        faces.push(...boxFaces([rotor.x * 0.5, 0, rotor.y * 0.5], [0.72, 0.055, 0.075], angle, colors.surface, pose));
        faces.push(...cylinderFaces([rotor.x, 0.07, rotor.y], 0.095, 0.14, 10, motorColor, pose));
      }
      lines.push({ points: circlePoints([rotor.x, 0, rotor.y], propRadius, rotor.diskY, 48, pose), color: propColor, width: parameters.icing === "none" ? 0.8 : 1.4, alpha: result.propOverlap ? 0.16 : 0.28 });
      const spin = time * Math.min(18, (result.effectiveRpms?.[index] || parameters.rpm) / 900) * (index % 2 ? -1 : 1);
      const bladeA = posePoint(add([rotor.x, 0, rotor.y], [Math.cos(spin) * propRadius, rotor.diskY + 0.005, Math.sin(spin) * propRadius]), pose);
      const bladeB = posePoint(add([rotor.x, 0, rotor.y], [-Math.cos(spin) * propRadius, rotor.diskY + 0.005, -Math.sin(spin) * propRadius]), pose);
      lines.push({ points: [bladeA, bladeB], color: colors.text, width: 2, alpha: result.propOverlap ? 0.3 : 0.6 });
    });

    if (this.model) {
      const triangles = this.modelPreview || this.model;
      // Coherent clustered preview only; CFD receives the complete imported mesh.
      for (let i = 0; i < triangles.length; i += 9) {
        faces.push({ points: [0, 3, 6].map(o => posePoint([triangles[i + o], triangles[i + o + 1], triangles[i + o + 2]], pose)), color: colors.muted });
      }
    } else if (design.parts) {
      const key = JSON.stringify(design.parts);
      if (key !== this.builderKey) { this.builderKey=key; this.builderFaces=triangulateParts(design.parts); }
      faces.push(...this.builderFaces.map(face=>({points:face.points.map(p=>posePoint(p,pose)),color:face.role==="motor"?colors.accent:face.role==="body"?"#335b64":colors.surface,outline:false})));
    } else if (parameters.dronePreset === "racing") {
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
    const colors = this.colors;
    this.drawFaces(ctx, geometry.faces, basis, colors);
    geometry.lines.forEach(line => this.drawPolyline(ctx, line.points, basis, line.color, line.width, line.alpha));
    if (systemState) this.drawMotorHazards(ctx, basis, geometry.rotors, pose, systemState, time, colors);
  }

  drawMotorHazards(ctx, basis, rotors, pose, systemState, time, colors) {
    rotors.forEach((rotor, index) => {
      const temperature = systemState.motorTemps?.[index] || 0;
      const fire = systemState.motorFire?.[index] || 0;
      if (temperature < 78 && fire < 0.01) return;
      const base = posePoint([rotor.x, rotor.diskY ?? 0.17, rotor.y], pose);
      const projected = this.project(base, basis);
      if (!projected) return;
      const heat = clamp((temperature - 75) / 80, 0, 1);
      const glow = ctx.createRadialGradient(projected.x, projected.y, 1, projected.x, projected.y, 12 + heat * 12);
      glow.addColorStop(0, `rgba(255,93,45,${0.12 + heat * 0.22})`);
      glow.addColorStop(1, "rgba(255,93,45,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(projected.x, projected.y, 12 + heat * 12, 0, TAU); ctx.fill();

      if (temperature > 145 || fire > 0.03) {
        for (let particle = 0; particle < 4; particle += 1) {
          const age = (time * (0.22 + fire * 0.3) + particle * 0.137 + index * 0.071) % 1;
          const smokePoint = add(base, [Math.sin(particle * 4.1 + time) * 0.08 * age, 0.15 + age * (0.65 + fire * 0.5), Math.cos(particle * 3.2 + time * 0.7) * 0.08 * age]);
          const smoke = this.project(smokePoint, basis);
          if (!smoke) continue;
          ctx.fillStyle = `rgba(130,145,140,${(1 - age) * (0.1 + heat * 0.15)})`;
          ctx.beginPath(); ctx.arc(smoke.x, smoke.y, 2 + age * 7, 0, TAU); ctx.fill();
        }
      }

      if (fire > 0.06) {
        const pulse = 0.82 + Math.sin(time * 22 + index) * 0.18;
        const flameHeight = 8 + fire * 18;
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
    const { ctx, width, height } = resizeCanvas(this.canvas, this.pixelRatio || 1.5);
    const colors = this.colors;
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
      const recent = state.trail.filter(point => state.t - (point.t ?? state.t) < 5).slice(-70);
      for (let i = 1; i < recent.length; i++) {
        const points = [recent[i - 1], recent[i]].map(point => [clamp(point.x * driftScale, -2.6, 2.6), clamp(0.35 + (point.z || 0) * 0.12, -0.78, 1.85), clamp(point.y * driftScale, -2.6, 2.6)]);
        this.drawPolyline(ctx, points, basis, colors.accent, 1.4, i / recent.length * 0.4);
      }
    }

    const windAngle = state.windVector ? Math.atan2(state.windVector[1], state.windVector[0]) : parameters.windDirection * Math.PI / 180;
    const windVector = [Math.cos(windAngle) * 1.2, 0, Math.sin(windAngle) * 1.2];
    this.drawFlightWind(ctx, basis, state, parameters, colors);
    this.drawArrow3D(ctx, basis, [-2.5, 1.5, -2.1], windVector, colors.cyan, this.quantity?.(state.windNow, "speed") || `${format(state.windNow, 1)} м/с`);
    this.drawWeatherEffects(ctx, basis, parameters, state.t, colors);
    this.drawDrone(ctx, basis, parameters, result, pose, state.t, state);

    ctx.fillStyle = colors.muted;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("Мышь: вращение · Колесо: масштаб", 18, height - 18);
    ctx.fillStyle = colors.text;
    ctx.fillText(`Высота ${this.quantity?.(state.z, "m") || `${format(state.z, 1)} м`} · Наклон ${format(result.tilt, 1)}°`, 18, 24);
  }

  drawFlightWind(ctx, basis, state, parameters, colors) {
    const vector = [state.windVector?.[0] ?? 0, parameters.verticalWind, state.windVector?.[1] ?? 0];
    const speed = Math.hypot(...vector);
    if (speed < 0.03) return;
    if (!this.windParticles) this.windParticles = Array.from({ length: 240 }, (_, i) => ({ position: [((i * 0.6180339) % 1) * 6 - 3, ((i * 0.4142136) % 1) * 3 - 0.8, ((i * 0.7320508) % 1) * 6 - 3] }));
    const dt = Math.max(0, Math.min(0.1, state.t - (this.windTime ?? state.t)));
    this.windTime = state.t;
    const direction = vector.map(v => v / speed);
    const motion = Math.min(4, speed * 0.14), tailLength = Math.min(0.45, 0.08 + speed * 0.016);
    const count = this.pixelRatio === 1 ? 140 : 240;
    for (let i = 0; i < count; i++) {
      const p = this.windParticles[i].position;
      for (let axis = 0; axis < 3; axis++) {
        const low = axis === 1 ? -0.8 : -3, span = axis === 1 ? 3 : 6;
        p[axis] = low + ((p[axis] - low + direction[axis] * motion * dt) % span + span) % span;
      }
      const tail = p.map((v, axis) => v - direction[axis] * tailLength);
      // Ambient wind display only. Surface streamlines live in the CFD view.
      this.drawPolyline(ctx, [tail, p], basis, i % 4 ? colors.cyan : colors.accent, i % 3 ? 0.9 : 1.3, 0.13 + (i % 5) * 0.035);
    }
  }

  emitCFDStatus() {
    if (this.onCFDStatus) this.onCFDStatus({
      status: this.cfd.status,
      progress: this.cfd.progress,
      iterations: this.cfd.iterations,
      residual: this.cfd.residual,
      error: this.cfd.error,
      stats: this.cfd.field?.stats || null
    });
  }

  handleWorkerMessage(message) {
    if (message.type === "lines") {
      if (message.key === this.cfd.fieldKey && message.traceKey === this.traceRequestedKey) {
        this.streamlineCache = { key: message.traceKey, lines: message.lines };
        this.staticKey = "";
      }
      return;
    }
    if (message.type === "progress") {
      if (message.key === this.cfd.desiredKey) {
        this.cfd.status = "solving";
        this.cfd.progress = message.progress;
        this.cfd.iterations = message.iterations;
        this.cfd.residual = message.residual;
        this.emitCFDStatus();
      }
      return;
    }
    if (message.key !== this.cfd.desiredKey) return;
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
      this.traceRequestedKey = "";
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
    const design = geometryFor(parameters);
    const roundedDownwash = Math.round(result.downwashSpeed * 2) / 2;
    const propRadius = parameters.diameter * 0.0254 / (2 * design.worldScale);
    const config = {
      quality: settings.quality,
      dronePreset: parameters.dronePreset,
      rotors: parameters.rotors,
      frameSize: design.frameSize || parameters.frameSize,
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
      , worldScale: design.worldScale,
      geometryParts: design.parts,
      rotorCenters: design.rotors,
      solverMode: settings.solverMode || "trt",
      iterationBudget: settings.iterationBudget || "standard",
      rotorThrusts: result.rotorThrusts.map(t => Math.round(t * 10) / 10),
      modelRevision: this.modelRevision,
      meshEnabled: Boolean(this.meshCFD && this.model)
    };
    const key = JSON.stringify(config);
    if (key === this.cfd.desiredKey) return;
    if (this.workerBusy) { this.worker.postMessage({ type: "cancel" }); this.workerBusy = false; }
    this.cfd.desiredKey = key;
    this.cfd.status = "queued";
    this.cfd.progress = 0;
    this.pendingCFD = { key, config: { ...config, meshTriangles: this.meshCFD ? this.model : null } };
    clearTimeout(this.workerTimer);
    this.workerTimer = setTimeout(() => {
      if (!this.worker) {
        this.cfd.status = "error";
        this.cfd.error = "Web Worker недоступен";
        this.emitCFDStatus();
      } else if (!this.workerBusy) {
        this.startCFD(this.pendingCFD);
      }
    }, 300);
    this.emitCFDStatus();
  }

  continueCFD() {
    if (!this.workerBusy && this.pendingCFD && this.cfd.fieldKey === this.cfd.desiredKey) this.startCFD({ ...this.pendingCFD, type: "continue" });
  }

  setCFDPaused(paused) { this.worker?.postMessage({ type: paused ? "pause" : "resume" }); }

  renderAirflow(parameters, result, settings, time, format) {
    const { ctx, width, height } = resizeCanvas(this.canvas, this.pixelRatio || 1.5);
    const colors = this.colors;
    this.sliderZoom = settings.zoom;
    const basis = this.cameraBasis(width, height);
    this.ensureCFD(parameters, result, settings);
    const fieldReady = this.cfd.field && this.cfd.fieldKey === this.cfd.desiredKey;
    if (fieldReady) {
      const cacheKey = [this.cfd.fieldKey, settings.count, settings.layer].join("|");
      if (cacheKey !== this.traceRequestedKey) {
        this.traceRequestedKey = cacheKey;
        this.worker.postMessage({ type: "trace", key: this.cfd.fieldKey, trace: { key: cacheKey, count: settings.count, layer: settings.layer } });
      }
    }
    const staticKey = JSON.stringify([this.streamlineCache.key, this.canvas.width, this.canvas.height, this.camera, settings.zoom, settings.colorMode, parameters.dronePreset, parameters.diameter, parameters.frameSize, parameters.rotors, parameters.flowObstacle, parameters.obstacleSize, this.modelRevision, geometryFor(parameters).parts]);
    if (staticKey !== this.staticKey) {
      this.staticKey = staticKey;
      this.staticCanvas.width = this.canvas.width; this.staticCanvas.height = this.canvas.height;
      const background = this.staticCanvas.getContext("2d");
      background.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
      this.clear(background, width, height, colors);
      this.drawGrid(background, basis, colors, -1.4, 3.5, 0.5);
      const geometry = this.droneGeometry(parameters, result, { position: [0, 0, 0] }, 0, null);
      this.buildDepthMask(geometry.faces, basis, width, height);
      this.drawDrone(background, basis, parameters, result, { position: [0, 0, 0] }, 0, null);
      this.projectedLines = [];
      const field = this.cfd.field;
      if (field && this.streamlineCache.lines.length) {
        const bands = Array.from({ length: 6 }, () => []);
        this.streamlineCache.lines.forEach(line => {
          const projected = line.map(p => this.project(p.point, basis));
          this.projectedLines.push({ projected, line });
          for (let i = 1; i < line.length; i++) {
              const sample = line[i], previous = projected[i - 1], current = projected[i];
              const ratio = settings.colorMode === "vorticity" ? sample.vorticity / Math.max(0.001, field.stats.maxVorticity) : settings.colorMode === "pressure" ? (sample.pressure / Math.max(1, Math.abs(field.stats.minPressure), Math.abs(field.stats.maxPressure)) + 1) / 2 : sample.speed / Math.max(0.1, field.stats.maxSpeed);
              if (!previous || !current) continue;
              if (!this.depthVisible(previous) || !this.depthVisible(current)) continue;
              bands[Math.min(5, Math.max(0, Math.floor(ratio * 6)))].push(previous, current);
          }
        });
        // Six batched strokes for the entire field, with each segment classified once.
        bands.forEach((segments, band) => {
            background.beginPath();
            for (let i = 0; i < segments.length; i += 2) { background.moveTo(segments[i].x, segments[i].y); background.lineTo(segments[i + 1].x, segments[i + 1].y); }
            const speedColours = ["#49739d", "#508db5", "#55abc5", "#5bc4d7", "#66d9ff", "#b0f5ef"];
            background.strokeStyle = settings.colorMode === "pressure" ? ["#6d8dff", "#899def", "#82b9d1", "#bac79b", "#e2c67a", "#ffd166"][band] : settings.colorMode === "vorticity" ? ["#4f9589", "#65bca5", "#75f3c8", "#cbc992", "#ed917f", "#ff6b75"][band] : speedColours[band];
            background.lineWidth = 1.1;
            background.globalAlpha = 0.48 + band * 0.065;
            background.stroke();
        });
      }
      background.globalAlpha = 1;
    }
    ctx.drawImage(this.staticCanvas, 0, 0, width, height);
    if (fieldReady && settings.probe) {
      const point = settings.probe.map(v => v / this.cfd.field.stats.worldScale);
      const sample = sampleField(point, this.cfd.field), screen = this.project(point, basis);
      if (sample && screen) {
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(screen.x, screen.y, 6, 0, TAU); ctx.stroke();
        ctx.fillStyle = colors.accent; ctx.font = "12px monospace"; ctx.fillText(this.quantity?.(sample.speed, "speed", 2) || `${sample.speed.toFixed(2)} м/с`, screen.x + 10, screen.y - 8);
      }
    }
    this.drawFlowParticles(ctx, time * (settings.flowRate || 0.35) / 0.35, colors);
    this.drawMotorHazards(ctx, basis, geometryFor(parameters).rotors, { position: [0, 0, 0] }, settings.systemState, time, colors);

    const windAngle = parameters.windDirection * Math.PI / 180;
    this.drawArrow3D(ctx, basis, [-2.5, 1.65, -2], [Math.cos(windAngle) * 1.25, 0, Math.sin(windAngle) * 1.25], colors.cyan, this.quantity?.(parameters.windSpeed, "speed") || `${format(parameters.windSpeed, 1)} м/с`);
    ctx.fillStyle = colors.muted;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("DRAG — ORBIT  •  WHEEL — ZOOM", 18, height - 18);
    ctx.fillStyle = colors.text;
    const cfdLabel = fieldReady
      ? `${this.cfd.field.stats.method} · ${this.cfd.field.stats.cells.toLocaleString("ru-RU")} CELLS`
      : this.cfd.status === "error" ? "CFD ERROR" : `UPDATING · ${Math.round(this.cfd.progress * 100)}% · PREVIOUS FIELD`;
    ctx.fillText(`${settings.layer.toUpperCase()} · ${cfdLabel}`, 18, 24);
  }

  drawFlowParticles(ctx, time, colors) {
    const at = (line, projected, phase) => {
      if (phase < 0) return null;
      let lo = 0, hi = line.length - 1;
      while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (line[mid].travelTime <= phase) lo = mid; else hi = mid; }
      const a = projected[lo], b = projected[hi]; if (!a || !b) return null;
      const s = (phase - line[lo].travelTime) / Math.max(1e-9, line[hi].travelTime - line[lo].travelTime);
      return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, depth: a.depth + (b.depth - a.depth) * s };
    };
    ctx.fillStyle = colors.accent; ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let k = 0; k < this.projectedLines.length; k++) {
      const { line, projected } = this.projectedLines[k];
      const duration = line[line.length - 1].travelTime;
      if (!(duration > 0)) continue;
      // The bead advances continuously according to local velocity, not point indices.
      const phase = (time * 0.35 + k * 0.618033 * duration) % duration;
      const point = at(line, projected, phase);
      if (!point || !this.depthVisible(point)) continue;
      const { x, y } = point;
      ctx.moveTo(x + 1.6, y); ctx.arc(x, y, 1.6, 0, TAU);
    }
    ctx.fill();
    // Short fading tails give a continuous direction cue without recomputing flow.
    for (let tail = 1; tail <= 3; tail++) {
      ctx.globalAlpha = 0.3 / tail; ctx.beginPath();
      for (let k = 0; k < this.projectedLines.length; k++) {
        const { line, projected } = this.projectedLines[k], duration = line[line.length - 1].travelTime;
        if (!(duration > 0)) continue;
        const phase = (time * 0.35 + k * 0.618033 * duration) % duration;
        const interval = Math.min(0.012, duration / 24);
        const a = at(line, projected, phase - tail * interval), b = at(line, projected, phase - (tail - 1) * interval);
        if (a && b && this.depthVisible(a) && this.depthVisible(b)) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  setModel(triangles, useInCFD = false, preview = null) {
    this.model = triangles; this.modelPreview = preview; this.meshCFD = useInCFD;
    this.modelRevision++;
    this.staticKey = "";
  }

  buildDepthMask(faces, basis, width, height) {
    const w = 256, h = Math.max(64, Math.round(w * height / width));
    const depth = new Float32Array(w * h); depth.fill(Infinity);
    const sx = w / width, sy = h / height;
    for (const face of faces) {
      const projected = face.points.map(p => this.project(p, basis));
      if (projected.some(p => !p)) continue;
      for (let i = 1; i < projected.length - 1; i++) {
        const [a,b,c] = [projected[0], projected[i], projected[i+1]].map(p => ({ x:p.x*sx, y:p.y*sy, depth:p.depth }));
        const det = (b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
        if (Math.abs(det) < 1e-8) continue;
        const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))), x1=Math.min(w-1,Math.ceil(Math.max(a.x,b.x,c.x)));
        const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))), y1=Math.min(h-1,Math.ceil(Math.max(a.y,b.y,c.y)));
        for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) {
          const u=((b.y-c.y)*(x+0.5-c.x)+(c.x-b.x)*(y+0.5-c.y))/det;
          const v=((c.y-a.y)*(x+0.5-c.x)+(a.x-c.x)*(y+0.5-c.y))/det;
          if (u<0||v<0||u+v>1) continue;
          const z=1/(u/a.depth+v/b.depth+(1-u-v)/c.depth), index=x+y*w;
          depth[index]=Math.min(depth[index],z);
        }
      }
    }
    this.depthMask={depth,w,h,sx,sy};
  }

  depthVisible(p) {
    if (!this.depthMask) return true;
    const {depth,w,h,sx,sy}=this.depthMask;
    const x=Math.floor(p.x*sx),y=Math.floor(p.y*sy);
    return x<0||x>=w||y<0||y>=h||p.depth<=depth[x+y*w]+0.04;
  }
}
