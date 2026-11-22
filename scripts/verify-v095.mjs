// 0.95 checks: battery chemistry and mass, weather by place, atmosphere, motor presets, CAD import (3MF, large
// meshes, volume, unit and axis guesses) and the battery size curve.
// Run: node --experimental-vm-modules scripts/verify-v095.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..'), mods = new Map();
async function load(name) {
  const file = path.resolve(root, 'dist', name + '.js');
  if (mods.has(file)) return mods.get(file);
  const pending = (async () => {
    const m = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'));
    await m.link(s => load(s.replace('./', '').replace('.js', '')));
    return m;
  })();
  mods.set(file, pending);
  return pending;
}
async function ns(name) { const m = await load(name); if (m.status !== 'evaluated') await m.evaluate(); return m.namespace; }
const physics = await ns('physics'), power = await ns('power-system'), lab = await ns('lab-095'), mesh = await ns('mesh-import'),
  validation = await ns('validation'), references = await ns('reference-data');
const near = (a, b, t, msg = '') => assert(Math.abs(a - b) <= t, `${msg} ${a} versus ${b}`);
const base = { ...physics.baseDefaults }, report = { version: '0.95.0-beta' };

// 1. Atmosphere against the ISA table (dry air, standard temperature).
{
  const isa = [[0, 1.2250], [1000, 1.1117], [3000, 0.9093], [5000, 0.7364]];
  report.isa = isa.map(([h, rho]) => {
    const a = physics.atmosphere({ temperature: 15 - 0.0065 * h, altitude: h, humidity: 0, pressureMode: 'auto' });
    near(a.density / rho, 1, 0.005, `ISA ${h} m`);
    return { altitude: h, model: a.density, isa: rho };
  });
}
// 2. LiFePO4 resting voltages (3.65 V is the charging voltage); LiPo stays within published resting tables.
{
  near(power.openCircuitCellVoltage(100, 'lifepo4'), 3.40, 1e-9); near(power.openCircuitCellVoltage(50, 'lifepo4'), 3.31, 1e-9);
  for (let s = 0; s < 100; s += 5) assert(power.openCircuitCellVoltage(s + 5, 'lifepo4') >= power.openCircuitCellVoltage(s, 'lifepo4'));
  const lipo50 = power.openCircuitCellVoltage(50, 'lipo'), lipo10 = power.openCircuitCellVoltage(10, 'lipo');
  assert(lipo50 >= 3.74 && lipo50 <= 3.87 && lipo10 >= 3.45 && lipo10 <= 3.66);
}
// 3. Battery mass follows its energy; the battery size curve has an interior optimum under the thrust rule.
{
  near(power.packEnergyWh(base), 10 * 6 * 3.7, 1e-9, 'pack energy');
  const curve = lab.batterySizeCurve(base);
  curve.forEach((c, i) => i && assert(c.batteryMass > curve[i - 1].batteryMass && Math.abs(c.mass - c.batteryMass - (base.mass - base.batteryMass)) < 1e-9));
  const usable = curve.filter(c => c.usable), best = usable.reduce((a, b) => b.minutes > a.minutes ? b : a);
  assert(best.thrustToWeight >= 2 && best.minutes >= curve.find(c => c.factor === 1).minutes);
  assert(curve.at(-1).minutes < Math.max(...curve.map(c => c.minutes)), 'too big a battery flies less');
  report.batterySize = { nowMinutes: curve.find(c => c.factor === 1).minutes, bestCapacity: best.capacity, bestMinutes: best.minutes, bestThrustToWeight: best.thrustToWeight };
}
// 4. Weather from Open-Meteo: fields, gusts as a share of the mean wind, the nearest local hour.
{
  const time = Array.from({ length: 48 }, (_, i) => new Date(Date.UTC(2026, 10, 22, i)).toISOString().slice(0, 16));
  const data = { elevation: 2260, utc_offset_seconds: 18000, hourly: { time, temperature_2m: time.map((_, i) => -10 + i * 0.1), relative_humidity_2m: time.map(() => 70), surface_pressure: time.map(() => 774.2), wind_speed_10m: time.map(() => 8), wind_direction_10m: time.map(() => 370), wind_gusts_10m: time.map(() => 12), precipitation: time.map(() => 0.4) } };
  const index = lab.hourIndexFor(data, 3, Date.UTC(2026, 10, 22, 5, 10));
  assert.equal(time[index], '2026-11-22T13:00');
  const w = lab.weatherFromOpenMeteo(data, index);
  assert.equal(w.values.altitude, 2260); assert.equal(w.values.pressureMode, 'manual'); near(w.values.gusts, 50, 1e-9); near(w.values.windDirection, 10, 1e-9);
  assert(physics.calculate({ ...base, ...w.values }).feasible);
  assert(lab.openMeteoUrl(43.128, 77.081).startsWith('https://api.open-meteo.com/v1/forecast?latitude=43.1280&longitude=77.0810'));
  assert.throws(() => lab.weatherFromOpenMeteo({}, 0), /weather-format/);
}
// 5. Motor presets: the racer's three-blade propeller matches the T5147 bench table; realistic thrust-to-weight.
{
  const racing = { ...base, ...physics.dronePresets.racing, dronePreset: 'racing' };
  const set = references.benchReferences.find(s => s.id.startsWith('f60'));
  const check = validation.compareBench(racing, set.rows, { temperature: 20, altitude: 0, pressureMode: 'auto', temperatureMode: 'manual', humidity: 50, voltage: 25.2 });
  assert(check.thrustMAE < 5 && check.powerMAE < 10, JSON.stringify([check.thrustMAE, check.powerMAE]));
  const full = physics.calculate({ ...racing, rpm: racing.maxRpm, windSpeed: 0, gusts: 0 });
  const tw = full.hardwareMaxThrust / (full.mass * 9.81);
  assert(tw > 6 && tw < 12, `racing T/W ${tw}`);
  // Full throttle against a published point: T-MOTOR MN6007II KV160, P21×6.3, 47.31 V, 100%: 5 716 RPM.
  const hex = { ...base, ...physics.dronePresets.industrialHex, dronePreset: 'industrialHex' };
  const bench = physics.calculate({ ...hex, motorModel: 'datasheet', motorKv: 160, motorResistance: 0.178, motorIdleCurrent: 0.5, voltage: 47.31, pitch: 6.3, maxRpm: 99999, rpm: 99999, windSpeed: 0, gusts: 0 });
  near(bench.rpmPowerLimit / 5716, 1, 0.05, 'MN6007II full-throttle RPM');
  const hexDatasheet = physics.calculate({ ...hex, motorModel: 'datasheet', maxRpm: 99999, rpm: 99999, windSpeed: 0, gusts: 0 });
  near(hex.maxRpm / hexDatasheet.rpmPowerLimit, 1, 0.05, 'hex RPM cap against its own motor');
  report.hexFullThrottle = { mn6007Model: bench.rpmPowerLimit, mn6007Bench: 5716, hexCap: hex.maxRpm, hexDatasheet: hexDatasheet.rpmPowerLimit };
  for (const [key, preset] of Object.entries(physics.dronePresets)) assert(physics.calculate({ ...base, ...preset, dronePreset: key }).feasible, key);
  report.racing = { thrustMAE: check.thrustMAE, powerMAE: check.powerMAE, thrustToWeight: tw };
}
// 6. CAD: 3MF from a ZIP, exact volume, unit and axis guesses; large meshes are simplified, not rejected.
{
  const v = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0], [0, 0, 20], [100, 0, 20], [100, 100, 20], [0, 100, 20]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const xml = `<model unit="millimeter"><resources><object id="1"><mesh><vertices>${v.map(p => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}</vertices><triangles>${f.map(t => `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('')}</triangles></mesh></object></resources></model>`;
  const name = Buffer.from('3D/3dmodel.model'), data = zlib.deflateRawSync(Buffer.from(xml));
  const localHeader = Buffer.alloc(30); localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(8, 8); localHeader.writeUInt32LE(data.length, 18); localHeader.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const local = Buffer.concat([localHeader, name, data]), dir = Buffer.concat([central, name]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(local.length, 16);
  const zip = Buffer.concat([local, dir, end]);
  const box = await mesh.parseMeshAsync(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length), 'frame.3mf');
  assert(box.closed && box.triangleCount === 12); near(box.sourceVolume, 200000, 0.1); near(box.sourceArea, 28000, 0.1);
  assert.equal(box.unitGuess, 'mm'); assert.equal(box.upGuess, 'z');
  assert.equal(mesh.guessUnits(0.56), 'm'); assert.equal(mesh.guessUnits(56), 'cm'); assert.equal(mesh.guessUnits(2), null); assert.equal(mesh.guessUp([100, 95, 90]), null);
  // A closed ellipsoid of 120 000 triangles: simplified under the limit with the volume kept within 2%.
  const n = 245, tris = [];
  const P = (i, j) => { const th = Math.PI * i / n, ph = 2 * Math.PI * j / n; return [150 * Math.sin(th) * Math.cos(ph), 150 * Math.sin(th) * Math.sin(ph), 40 * Math.cos(th)]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); if (i > 0) tris.push(...a, ...b, ...d); if (i < n - 1) tris.push(...b, ...c, ...d); }
  const buffer = new ArrayBuffer(84 + tris.length / 9 * 50), view = new DataView(buffer);
  view.setUint32(80, tris.length / 9, true);
  for (let t = 0; t < tris.length / 9; t++) for (let k = 0; k < 9; k++) view.setFloat32(84 + t * 50 + 12 + k * 4, tris[t * 9 + k], true);
  const big = await mesh.parseMeshAsync(buffer, 'body.stl');
  assert(big.simplified && big.triangleCount <= mesh.MAX_TRIANGLES && big.sourceTriangleCount === tris.length / 9);
  near(big.sourceVolume / (4 / 3 * Math.PI * 150 * 150 * 40), 1, 0.02, 'volume after simplification');
  report.cad = { boxVolumeMm3: box.sourceVolume, bigSource: big.sourceTriangleCount, bigKept: big.triangleCount, bigVolumeRatio: big.sourceVolume / (4 / 3 * Math.PI * 150 * 150 * 40) };
}
fs.writeFileSync(path.join(root, 'verification-v095.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
