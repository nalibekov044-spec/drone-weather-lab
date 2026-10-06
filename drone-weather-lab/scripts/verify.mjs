import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), "..");
const modules = new Map();
async function load(name) {
  const filename = path.resolve(root, name);
  if (modules.has(filename)) return modules.get(filename);
  const mod = new vm.SourceTextModule(fs.readFileSync(filename, "utf8"), { identifier: filename });
  modules.set(filename, mod);
  await mod.link((specifier, parent) => load(path.relative(root, path.resolve(path.dirname(parent.identifier), specifier))));
  return mod;
}
const physics = await load("dist/physics.js"); await physics.evaluate();
const cfd = await load("dist/cfd-core.js"); await cfd.evaluate();
const flow = await load("dist/flow-lines.js"); await flow.evaluate();
const mesh = await load("dist/mesh-import.js"); await mesh.evaluate();
const { calculate, baseDefaults } = physics.namespace;
const r = calculate(baseDefaults);
assert(r.batteryFeasible && r.terminalVoltage < baseDefaults.voltage);
assert(Math.abs(r.current * r.terminalVoltage - r.electricalPower) < 1e-6);
assert(Math.abs(r.rotorThrusts.reduce((a,b)=>a+b,0) - r.requiredVertical) < 1e-6);
assert(!calculate({ ...baseDefaults, batteryCRating: 1 }).batteryFeasible);
assert(calculate(baseDefaults, { motorHealths: [0,1,1,1] }).effectiveRpms[0] === 0);
assert(calculate({ ...baseDefaults, calibratedProps: true, ct: 0.001, cp: 0.15 }).availableThrust < r.availableThrust);
const obj = "v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 4 8 7 3\nf 1 5 8 4\nf 2 3 7 6\n";
const parsed = mesh.namespace.parseMesh(new TextEncoder().encode(obj).buffer, "cube.obj");
assert(parsed.closed && parsed.triangleCount === 12);
const transformed = mesh.namespace.transformMesh(parsed, 1, "y", 0);
assert.equal(Math.max(...transformed), 0.5);
const mask = mesh.namespace.voxelizeMesh(transformed, 21,21,21, {xMin:-1,xMax:1,yMin:-1,yMax:1,zMin:-1,zMax:1});
assert(mask[10 + 21 * (10 + 21 * 10)] === 1);
assert(mask[0] === 0);
assert(!mesh.namespace.parseMesh(new TextEncoder().encode(obj.replace("f 2 3 7 6\n", "")).buffer, "open.obj").closed);
const base = { ...baseDefaults, quality: "fast", density: r.density, propRadius: baseDefaults.diameter * 25.4 * 0.72 / baseDefaults.frameSize, rotorThrusts: r.rotorThrusts, downwashSpeed: r.downwashSpeed };
for (const config of [base, { ...base, windSpeed:0, verticalWind:0 }, { ...base, windDirection:90, windSpeed:20 }, { ...base, meshTriangles:transformed, flowObstacle:"wall", obstacleSize:1 }]) {
  const f = cfd.namespace.solveCFD(config);
  for (const key of ["velocityX","velocityY","velocityZ","pressure","vorticity"]) assert(f[key].every(Number.isFinite), key);
  assert(Math.abs((f.bounds.yMax - f.bounds.yMin)/(f.ny-1) - 6/(f.nx-1)) < 1e-12);
  assert(Math.abs(f.stats.appliedThrust - r.requiredVertical) < 1e-6);
  const started = performance.now();
  const lines = flow.namespace.traceLines(f, config, 144, "volume");
  assert(lines.length > 80, `Only ${lines.length} lines`);
  for (const line of lines) {
    assert(line[line.length-1].travelTime > 0);
    assert(line.every(p => flow.namespace.sampleField(p.point, f)));
  }
  console.log(JSON.stringify({wind:config.windSpeed, imported:!!config.meshTriangles, elapsedMs:f.stats.elapsedMs, maxSpeed:f.stats.maxSpeed, residual:f.stats.residual, solidCells:f.stats.solidCells, lines:lines.length, traceMs:Math.round(performance.now()-started), effectiveRe:f.stats.effectiveReynolds}));
}
const html = fs.readFileSync(path.join(root,"dist/index.html"),"utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length, new Set(ids).size);
for (const name of fs.readdirSync(path.join(root,"dist")).filter(n=>n.endsWith(".js"))) new vm.SourceTextModule(fs.readFileSync(path.join(root,"dist",name),"utf8"));
console.log("Physics, CFD, mesh topology, voxelization, streamlines, syntax and HTML IDs passed.");
