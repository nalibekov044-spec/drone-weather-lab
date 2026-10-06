import { geometryFor, triangulateParts } from './drone-builder.js';
const vertex = `
precision mediump float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
uniform vec3 eye;
uniform vec3 right;
uniform vec3 up;
uniform vec3 forward;
uniform vec2 scale;
uniform vec3 offset;
uniform mat3 rotation;
uniform float pointSize;
varying vec3 world;
varying vec3 surface;
varying vec4 tint;
void main() {
  world = rotation * position + offset;
  surface = rotation * normal;
  vec3 d = world - eye;
  float depth = dot(d, forward);
  gl_Position = vec4(dot(d, right) * scale.x, dot(d, up) * scale.y, 1.00267 * depth - 0.160214, depth);
  gl_PointSize = pointSize;
  tint = color;
}`;
const fragment = `
precision mediump float;
varying vec3 world;
varying vec3 surface;
varying vec4 tint;
uniform vec3 eye;
uniform float lit;
void main() {
  vec3 n = normalize(surface + vec3(0.00001));
  vec3 light = normalize(vec3(-0.4, 0.9, 0.3));
  vec3 view = normalize(eye - world);
  float diffuse = max(dot(n, light), 0.0);
  float specular = pow(max(dot(n, normalize(light + view)), 0.0), 28.0) * 0.32;
  vec3 rgb = tint.rgb * mix(1.0, 0.26 + diffuse * 0.8, lit) + vec3(specular * lit);
  float fog = clamp(length(eye - world) * 0.018, 0.0, 0.3);
  gl_FragColor = vec4(mix(rgb, vec3(0.025, 0.045, 0.064), fog), tint.a);
}`;
function rotate(point, pose) {
  const cp = Math.cos(pose.pitch || 0), sp = Math.sin(pose.pitch || 0);
  const cr = Math.cos(pose.roll || 0), sr = Math.sin(pose.roll || 0);
  const cy = Math.cos(pose.yaw || 0), sy = Math.sin(pose.yaw || 0);
  const x = point[0], y = point[1] * cp - point[2] * sp, z = point[1] * sp + point[2] * cp;
  const a = x * cr - y * sr, b = x * sr + y * cr;
  return [a * cy - z * sy, b, a * sy + z * cy];
}
function color(value, alpha = 1) {
  return [parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255, alpha];
}
const materials = { body: '#6a7d8e', arm: '#253b4b', motor: '#49d8ba', battery: '#222a35', camera: '#4c7698', landing: '#b3c0cb', payload: '#ca9455', blade: '#cddce5', detail: '#52ccf5' };
export class GPUScene {
  constructor(hud) {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'low-power' });
    if (!this.gl || !this.gl.createShader) throw new Error('WebGL unavailable');
    const gl = this.gl;
    const shader = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    this.program = gl.createProgram();
    gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(this.program); if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.locations = Object.fromEntries(['eye', 'right', 'up', 'forward', 'scale', 'offset', 'rotation', 'pointSize', 'lit'].map(name => [name, gl.getUniformLocation(this.program, name)]));
    this.attributes = Object.fromEntries(['position', 'normal', 'color'].map(name => [name, gl.getAttribLocation(this.program, name)]));
    this.buffers = new Map(); this.identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const stage = document.createElement('div'); stage.className = 'gpu-stage';
    hud.parentNode.insertBefore(stage, hud); stage.append(this.canvas, hud);
    this.canvas.className = 'gpu-canvas'; hud.classList.add('gpu-hud');
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = true; });
  }
  upload(name, data, dynamic = false) {
    const gl = this.gl; let buffer = this.buffers.get(name);
    if (!buffer) { buffer = { handle: gl.createBuffer(), capacity: 0 }; this.buffers.set(name, buffer); }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.handle);
    const typed = data instanceof Float32Array ? data : new Float32Array(data);
    if (!dynamic || typed.byteLength > buffer.capacity) { gl.bufferData(gl.ARRAY_BUFFER, typed, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); buffer.capacity = typed.byteLength; }
    else if (typed.byteLength) gl.bufferSubData(gl.ARRAY_BUFFER, 0, typed);
    buffer.count = typed.length / 10; return buffer;
  }
  draw(name, mode, lit = false, pose = null, size = 2) {
    const gl = this.gl, buffer = this.buffers.get(name); if (!buffer?.count) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.handle);
    for (const [name, components, start] of [['position', 3, 0], ['normal', 3, 12], ['color', 4, 24]]) { gl.enableVertexAttribArray(this.attributes[name]); gl.vertexAttribPointer(this.attributes[name], components, gl.FLOAT, false, 40, start); }
    gl.uniform3fv(this.locations.offset, pose?.position || [0, 0, 0]);

    gl.uniformMatrix3fv(this.locations.rotation, false, pose ? new Float32Array([[1, 0, 0], [0, 1, 0], [0, 0, 1]].flatMap(p => rotate(p, pose))) : this.identity);
    gl.uniform1f(this.locations.pointSize, size * this.dpr); gl.uniform1f(this.locations.lit, lit ? 1 : 0);
    gl.drawArrays(mode, 0, buffer.count);
  }
  begin(basis, width, height, dpr) {
    const gl = this.gl; this.dpr = dpr;
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0.025, 0.045, 0.064, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
    for (const key of ['eye', 'right', 'up', 'forward']) gl.uniform3fv(this.locations[key], basis[key === 'eye' ? 'position' : key]);
    gl.uniform2f(this.locations.scale, 2 * basis.focal / width, 2 * basis.focal / height);
    if (!this.buffers.has('grid')) {
      const data = [], shade = color('#284151', 0.55);
      for (let i = -8; i <= 8; i++) for (const p of [[-4, -1.4, i / 2], [4, -1.4, i / 2], [i / 2, -1.4, -4], [i / 2, -1.4, 4]]) data.push(...p, 0, 1, 0, ...shade);
      this.upload('grid', data);
    }
    this.draw('grid', gl.LINES);
  }
  model(parameters, scene, pose, result, time) {
    const design = geometryFor(parameters);
    const key = JSON.stringify([design.parts, scene.modelRevision, parameters.flowObstacle, parameters.obstacleSize, scene.mode]);
    if (this.modelKey !== key) {
      this.modelKey = key;
      const parts = [...(design.parts || [])];
      if (!scene.model && parameters.dronePreset !== "custom") {
        if (parameters.dronePreset !== 'custom') parts.push({ kind: 'ellipsoid', center: [0, -0.18, -0.29], size: [0.075, 0.075, 0.045], role: 'detail' });
        parts.push({ kind: 'box', center: [0, 0.255, -0.09], size: [0.23, 0.012, 0.025], role: 'detail' });
        parts.push({ kind: 'box', center: [0, 0.255, 0.17], size: [0.23, 0.012, 0.025], role: 'detail' });
      }
      if (scene.mode === 'airflow') {
        const s = parameters.obstacleSize || 1;
        if (parameters.flowObstacle === 'wall') parts.push({ kind: 'box', center: [1.28, 0, 0], size: [0.18 * s, 1.44 * s, 1.24 * s], role: 'payload' });
        if (parameters.flowObstacle === 'sphere') parts.push({ kind: 'ellipsoid', center: [1.2, 0, 0], size: [0.48 * s, 0.48 * s, 0.48 * s], role: 'payload' });
        if (parameters.flowObstacle === 'payload') parts.push({ kind: 'box', center: [0, -0.38, 0], size: [0.6 * s, 0.36 * s, 0.56 * s], role: 'payload' });
      }
      let faces;
      if (scene.model) {
        faces = []; const triangles = scene.model;
        for (let i = 0; i < triangles.length; i += 9) faces.push({ points: [Array.from(triangles.slice(i, i + 3)), Array.from(triangles.slice(i + 3, i + 6)), Array.from(triangles.slice(i + 6, i + 9))], role: 'body' });
        faces.push(...triangulateParts(parts.filter(p => p.role === 'payload')));
      } else faces = triangulateParts(parts);
      const data = [];
      for (const face of faces) {
        const [a, b, c] = face.points, u = b.map((v, i) => v - a[i]), v = c.map((v, i) => v - a[i]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], norm = Math.hypot(...n) || 1;
        const ellipsoid = !scene.model && parts.find(p => p.role === face.role && p.kind === 'ellipsoid');
        for (const p of face.points) {
          const smooth = ellipsoid ? p.map((v, i) => (v - ellipsoid.center[i]) / (ellipsoid.size[i] ** 2)) : n;
          const magnitude = Math.hypot(...smooth) || 1;
          data.push(...p, ...smooth.map(v => v / magnitude), ...color(materials[face.role] || '#8194a4'));
        }
      }
      this.upload('body', data);
      const shadow = [];
      for (let i = 0; i < data.length; i += 10) { const y = data[i + 1] + 1.397; shadow.push(data[i] + y * 0.45, -1.397, data[i + 2] - y * 0.3, 0, 1, 0, ...color('#01080d', 0.26)); }
      this.upload('shadow', shadow);
    }
    if (!pose.pitch && !pose.roll && !(pose.position?.[1])) this.draw('shadow', this.gl.TRIANGLES);
    this.draw('body', this.gl.TRIANGLES, true, pose);
    const data = [];
    for (let i = 0; i < design.rotors.length; i++) {
      const r = design.rotors[i], radius = parameters.diameter * 0.0254 / (2 * design.worldScale);
      const a = time * Math.min(18, (result.effectiveRpms[i] || 0) / 900) * (i % 2 ? -1 : 1);
      for (const sign of [-1, 1]) {
        const points = [[0, -0.012], [radius * 0.25, -0.035], [radius, -0.018], [radius, 0.018], [radius * 0.25, 0.035], [0, 0.012]].map(([x, z]) => [r.x + sign * x * Math.cos(a) - z * Math.sin(a), r.diskY + 0.01, r.z + sign * x * Math.sin(a) + z * Math.cos(a)]);
        const tint = color(i % 2 ? '#adc6d8' : '#76ccb9');
        for (let j = 1; j < points.length - 1; j++) for (const p of [points[0], points[j], points[j + 1]]) data.push(...p, 0, 1, 0, ...tint);
      }
    }
    this.upload('blades', data, true); this.draw('blades', this.gl.TRIANGLES, true, pose);
  }
  airflow(lines, field, settings, time, key) {
    const cacheKey = `${key}|${settings.colorMode}`;
    const shades = settings.colorMode === 'pressure' ? ['#658aff', '#98b1d6', '#a3c9ca', '#d1ca88', '#f0b651', '#ff8059'] : settings.colorMode === 'vorticity' ? ['#326f86', '#409cbd', '#54d5ba', '#ddd078', '#f68c63', '#ff546b'] : ['#315c86', '#3b86ac', '#45b6c8', '#58d6d0', '#90eddf', '#e2fff6'];
    if (cacheKey !== this.flowKey) {
      this.flowKey = cacheKey; const data = [];
      for (const line of lines) for (let i = 1; i < line.length; i++) {
        const s = line[i]; const ratio = settings.colorMode === 'pressure' ? 0.5 + s.pressure / (2 * Math.max(1, Math.abs(field.stats.minPressure), Math.abs(field.stats.maxPressure))) : settings.colorMode === 'vorticity' ? s.vorticity / Math.max(0.001, field.stats.maxVorticity) : s.speed / Math.max(0.1, field.stats.maxSpeed);
        const tint = color(shades[Math.min(5, Math.max(0, Math.floor(ratio * 6)))], 0.55);
        data.push(...line[i - 1].point, 0, 0, 0, ...tint, ...s.point, 0, 0, 0, ...tint);
      }
      this.upload('flow', data);
    }
    this.gl.depthMask(false); this.draw('flow', this.gl.LINES);
    const beads = [];
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k], duration = line.at(-1).travelTime; if (!(duration > 0)) continue;
      const phase = (time * settings.flowRate + k * 0.618033 * duration) % duration;
      let lo = 0, hi = line.length - 1;
      while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (line[mid].travelTime <= phase) lo = mid; else hi = mid; }
      const f = (phase - line[lo].travelTime) / Math.max(1e-9, line[hi].travelTime - line[lo].travelTime);
      beads.push(...line[lo].point.map((v, i) => v + (line[hi].point[i] - v) * f), 0, 0, 0, ...color('#bbfff1', 0.9));
    }
    this.upload('beads', beads, true); this.draw('beads', this.gl.POINTS, false, null, 2.2); this.gl.depthMask(true);
  }
  mask(field) {
    if (this.maskField !== field) {
      this.maskField = field; const data = [], b = field.bounds;
      for (let y = 1; y < field.ny - 1; y++) for (let z = 1; z < field.nz - 1; z++) for (let x = 1; x < field.nx - 1; x++) {
        const i = x + field.nx * (z + field.nz * y); if (!field.solid[i]) continue;
        data.push(b.xMin + x * (b.xMax - b.xMin) / (field.nx - 1), b.yMin + y * (b.yMax - b.yMin) / (field.ny - 1), b.zMin + z * (b.zMax - b.zMin) / (field.nz - 1), 0, 0, 0, ...color('#ffcf76'));
      }
      this.upload('mask', data);
    }
    this.gl.disable(this.gl.DEPTH_TEST); this.draw('mask', this.gl.POINTS, false, null, 4); this.gl.enable(this.gl.DEPTH_TEST);
  }
  wind(state, parameters) {
    const vector = [state.windVector?.[0] || 0, parameters.verticalWind, state.windVector?.[1] || 0], speed = Math.hypot(...vector);
    if (speed < 0.03) return;
    this.windSeeds ||= Array.from({ length: 300 }, (_, i) => [((i * 0.6180339) % 1) * 6 - 3, ((i * 0.4142136) % 1) * 3 - 0.8, ((i * 0.7320508) % 1) * 6 - 3]);
    const dt = Math.max(0, Math.min(0.1, state.t - (this.windTime ?? state.t))); this.windTime = state.t;
    const data = [], dir = vector.map(v => v / speed), motion = Math.min(4, speed * 0.14), tail = Math.min(0.4, 0.08 + speed * 0.016);
    for (const p of this.windSeeds.slice(0, this.dpr === 1 ? 160 : 300)) {
      for (let axis = 0; axis < 3; axis++) { const low = axis === 1 ? -0.8 : -3, span = axis === 1 ? 3 : 6; p[axis] = low + ((p[axis] - low + dir[axis] * motion * dt) % span + span) % span; }
      data.push(...p.map((v, i) => v - dir[i] * tail), 0, 0, 0, ...color('#56bdda', 0.15), ...p, 0, 0, 0, ...color('#56bdda', 0.45));
    }
    this.upload('wind', data, true); this.gl.depthMask(false); this.draw('wind', this.gl.LINES); this.gl.depthMask(true);
  }
}
