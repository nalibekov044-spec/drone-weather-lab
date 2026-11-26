// 0.96.0 checks: wind at the flight height (forecast levels and the Hellmann power law), air pressure and
// temperature above the ground, and the forecast lifted to the flight height.
// Run: node --experimental-vm-modules scripts/verify-v096.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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
const wind = await ns('wind-profile'), lab = await ns('lab-095'), physics = await ns('physics');
const near = (a, b, t, msg = '') => assert(Math.abs(a - b) <= t, `${msg} ${a} versus ${b}`);
const report = { version: '0.96.0-beta' };

// 1. Hellmann exponents for neutral air (water, open ground, built-up areas) and the power law from 10 m.
{
  assert.deepEqual(wind.hellmannExponents, { water: 0.10, open: 0.16, built: 0.34 });
  const only10 = [{ height: 10, speed: 5, direction: 90 }];
  for (const [terrain, a] of Object.entries(wind.hellmannExponents))
    for (const z of [2, 30, 120]) near(wind.windAtHeight(only10, z, a).speed, 5 * (z / 10) ** a, 1e-12, `${terrain} ${z} m`);
  report.powerLaw = Object.fromEntries(Object.entries(wind.hellmannExponents).map(([t, a]) => [t, +wind.windAtHeight(only10, 100, a).speed.toFixed(3)]));
  near(report.powerLaw.open, 5 * 10 ** 0.16, 1e-3);
}
// 2. Forecast levels: exact at 10, 80, 120 and 180 m, log-height interpolation between them, the direction
// taken through the vector (350° and 10° meet near 0°), and the exponent of the top two levels above 180 m.
{
  const levels = [{ height: 10, speed: 5, direction: 350 }, { height: 80, speed: 8, direction: 10 }, { height: 120, speed: 9, direction: 20 }, { height: 180, speed: 10, direction: 30 }];
  for (const l of levels) {
    const r = wind.windAtHeight(levels, l.height);
    near(r.speed, l.speed, 1e-12); near(r.direction, l.direction % 360, 1e-9); assert.equal(r.method, 'forecast');
  }
  const mid = wind.windAtHeight(levels, Math.sqrt(10 * 80));
  near(mid.speed, 6.5, 1e-12, 'log-height midpoint');
  assert(mid.direction < 5 || mid.direction > 355, `direction ${mid.direction}`);
  let previous = 0;
  for (let z = 10; z <= 180; z += 5) { const s = wind.windAtHeight(levels, z).speed; assert(s >= previous - 1e-12); previous = s; }
  const above = wind.windAtHeight(levels, 300), a = Math.log(10 / 9) / Math.log(180 / 120);
  near(above.speed, 10 * (300 / 180) ** a, 1e-9); assert.equal(above.method, 'extrapolated');
  const steep = wind.windAtHeight([{ height: 10, speed: 1, direction: 0 }, { height: 80, speed: 20, direction: 0 }], 160);
  near(steep.speed, 20 * 2 ** 0.6, 1e-9, 'exponent capped at 0.6');
  const below = wind.windAtHeight(levels, 2, 0.16);
  near(below.speed, 5 * 0.2 ** 0.16, 1e-12); assert.equal(below.method, 'power');
  assert.throws(() => wind.windAtHeight([], 30), /wind-profile/);
  report.levels = { at28m: +mid.speed.toFixed(3), at300m: +above.speed.toFixed(3) };
}
// 3. Air above a point with the standard lapse rate: from sea level it reproduces the ISA table within 0.1%
// (the table is for geometric altitude, the formula for geopotential altitude).
{
  const isa = [[1000, 898.76], [3000, 701.12], [5000, 540.48]];
  report.isaPressure = isa.map(([h, table]) => {
    const model = wind.airAbove(1013.25, 15, h).pressureHpa;
    near(model / table, 1, 0.001, `ISA pressure ${h} m`);
    return { altitude: h, model: +model.toFixed(2), table };
  });
  const up = wind.airAbove(774.2, -6.5, 300), back = wind.airAbove(up.pressureHpa, up.temperature, -300);
  near(back.pressureHpa, 774.2, 1e-9, 'up and back down'); near(up.temperature, -6.5 - 1.95, 1e-12);
}
// 4. The forecast at the flight height: levels with null speeds are dropped, wind and air are lifted, gusts keep
// their share of the mean wind, the altitude is the ground plus the flight height.
{
  assert(lab.openMeteoUrl(43.128, 77.081).includes('wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_80m,wind_direction_120m,wind_direction_180m'));
  const time = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 10, 27, i)).toISOString().slice(0, 16));
  const fill = v => time.map(() => v);
  const data = { elevation: 2260, utc_offset_seconds: 18000, hourly: { time, temperature_2m: fill(-6.5), relative_humidity_2m: fill(70), surface_pressure: fill(774.2), wind_speed_10m: fill(7.2), wind_direction_10m: fill(200), wind_gusts_10m: fill(12.6), precipitation: fill(0), wind_speed_80m: fill(10.1), wind_direction_80m: fill(210), wind_speed_120m: fill(11), wind_direction_120m: fill(215), wind_speed_180m: fill(null), wind_direction_180m: fill(null) } };
  const profile = wind.forecastProfile(data, 5);
  assert.deepEqual(profile.map(l => l.height), [10, 80, 120]);
  const surface = lab.weatherFromOpenMeteo(data, 5);
  const lifted = wind.liftToFlightHeight(surface, profile, 50, 'open');
  const t = Math.log(5) / Math.log(8);
  near(lifted.values.windSpeed, 7.2 + (10.1 - 7.2) * t, 1e-9, 'wind at 50 m');
  assert.equal(lifted.values.altitude, 2310); assert.equal(lifted.ground, 2260); assert.equal(lifted.method, 'forecast');
  near(lifted.values.pressureHpa, wind.airAbove(774.2, -6.5, 48).pressureHpa, 1e-9);
  assert(lifted.values.pressureHpa < 774.2 && lifted.values.pressureHpa > 768);
  near(lifted.values.gusts, surface.values.gusts, 1e-12); near(lifted.values.temperature, -6.5 - 0.0065 * 48, 1e-12);
  const noLevels = wind.liftToFlightHeight(surface, [], 50, 'built');
  near(noLevels.values.windSpeed, 7.2 * 5 ** 0.34, 1e-9); assert.equal(noLevels.method, 'power');
  // The drone still computes with the lifted weather, and the stronger wind costs power.
  const base = { ...physics.baseDefaults };
  const at10 = physics.calculate({ ...base, ...surface.values }), at120 = physics.calculate({ ...base, ...wind.liftToFlightHeight(surface, profile, 120).values });
  assert(at10.feasible && at120.feasible);
  report.flight = { wind10: 7.2, wind50: +lifted.values.windSpeed.toFixed(2), wind120: 11, pressure50: +lifted.values.pressureHpa.toFixed(1), minutes10: +at10.flightMinutes.toFixed(1), minutes120: +at120.flightMinutes.toFixed(1) };
  assert(at120.flightMinutes < at10.flightMinutes, 'more wind, less time');
}
fs.writeFileSync(path.join(root, 'verification-v096.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
