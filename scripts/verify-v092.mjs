// 0.92 checks: centre-of-gravity mixer and moment signs, mission trace and margin, altitude ceiling,
// A/B verdicts, dash handling and new translations. Run: node --experimental-vm-modules scripts/verify-v092.mjs
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
const physics = await ns('physics'), engineering = await ns('engineering'), power = await ns('power-system'),
  comparison = await ns('comparison'), i18n = await ns('i18n'), lab = (await ns('workbench-language')).labText,
  chart = await ns('lab-chart'), builder = await ns('drone-builder');
const near = (a, b, t = 1e-9, msg = '') => assert(Math.abs(a - b) <= t, `${msg} ${a} versus ${b}`);
const G = physics.G, base = { ...physics.baseDefaults };
const report = { version: '0.92.0-beta' };

// 1. Mixer for a centre-of-gravity offset.
const layouts = [];
for (const preset of ['survey', 'racing', 'industrialHex', 'cargoOcto', 'custom']) {
  const p = { ...base, ...(physics.dronePresets[preset] || {}), dronePreset: preset };
  const positions = physics.rotorPlanPositions(p), n = positions.length;
  const zero = engineering.cgMotorLoads([0, 0], positions);
  zero.shares.forEach(s => near(s, 1, 1e-12, 'zero offset share'));
  let worstConstraint = 0;
  for (const cg of [[.01, 0], [0, -.015], [.012, .008], [-.02, .005]]) {
    const loads = engineering.cgMotorLoads(cg, positions);
    const sum = loads.shares.reduce((a, b) => a + b, 0), mx = loads.shares.reduce((a, s, i) => a + s * positions[i].x, 0),
      my = loads.shares.reduce((a, s, i) => a + s * positions[i].y, 0), yaw = loads.shares.reduce((a, s, i) => a + (i % 2 ? -s : s), 0);
    worstConstraint = Math.max(worstConstraint, Math.abs(sum - n), Math.abs(mx - n * cg[0]), Math.abs(my - n * cg[1]), Math.abs(yaw));
  }
  assert(worstConstraint < 1e-12);
  layouts.push({ preset, rotors: n, maxConstraintError: worstConstraint });
}
// Analytic quad X result: offset d towards motor 1 on radius R needs 1 + 2d/R on that motor.
{
  const p = { ...base, dronePreset: 'survey', rotors: 4 }, positions = physics.rotorPlanPositions(p), R = Math.hypot(positions[0].x, positions[0].y), d = .02;
  const loads = engineering.cgMotorLoads([positions[0].x / R * d, positions[0].y / R * d], positions);
  near(loads.max, 1 + 2 * d / R, 1e-12, 'quad analytic');
  report.quadAnalytic = { radiusM: R, offsetM: d, mostLoadedShare: loads.max, expected: 1 + 2 * d / R };
}
assert.throws(() => engineering.cgMotorLoads([NaN, 0], physics.rotorPlanPositions(base)));

// 2. Moments: a CG offset held by the mixer thrust distribution is balanced; a weak motor drifts towards itself.
const balance = [];
for (const preset of ['survey', 'industrialHex', 'cargoOcto', 'custom']) {
  const p = { ...base, ...(physics.dronePresets[preset] || {}), dronePreset: preset, payload: 0, windSpeed: 0, gusts: 0, customCG: [.012, 0, -.009] };
  const positions = physics.rotorPlanPositions(p), loads = engineering.cgMotorLoads([p.customCG[0], p.customCG[2]], positions);
  const reference = physics.calculate(p), rpm = Math.min(p.rpm, .8 * Math.min(p.maxRpm, reference.rpmPowerLimit) / Math.sqrt(loads.max));
  const r = physics.calculate(p, { motorRpms: loads.shares.map(s => rpm * Math.sqrt(s)) });
  r.effectiveRpms.forEach((v, i) => near(v, rpm * Math.sqrt(loads.shares[i]), 1e-9, 'unclamped rpm'));
  const equal = physics.calculate(p, { motorRpms: positions.map(() => rpm) });
  assert(r.imbalanceMoment < 1e-9 * r.weight, `${preset} mixer leaves ${r.imbalanceMoment} N·m`);
  near(r.balancePercent, 100, 1e-7);
  assert(equal.imbalanceMoment > 1e-3, 'equal thrust does not hold an offset CG');
  balance.push({ preset, mixerImbalanceNm: r.imbalanceMoment, equalThrustImbalanceNm: equal.imbalanceMoment, equalThrustBalancePercent: equal.balancePercent });
}
{
  const p = { ...base, windSpeed: 0, payload: 0 }, positions = physics.rotorPlanPositions(p), rpms = positions.map(() => p.rpm);
  for (let i = 0; i < positions.length; i++) {
    const weak = rpms.map((v, j) => j === i ? v * .85 : v), r = physics.calculate(p, { motorRpms: weak });
    // Flight drift uses (-pitchMoment, rollMoment); a weak motor lowers its side, so the drift points towards it.
    assert(-r.pitchMoment * positions[i].x + r.rollMoment * positions[i].y > 0, `motor ${i + 1} drift direction`);
    // 0.91 summed rotor thrust with the weight sign; the same case drifted away from the weak motor.
    const oldRoll = r.thrusts.reduce((s, t, j) => s + positions[j].y * t, 0), oldPitch = -r.thrusts.reduce((s, t, j) => s + positions[j].x * t, 0);
    assert(-oldPitch * positions[i].x + oldRoll * positions[i].y < 0);
  }
  report.weakMotorDirection = 'each of 4 motors at 85% RPM: drift towards the weak motor (0.91: away from it)';
}
// The existing 0.90 relation between a CG offset and the moments still holds.
{
  const cg = physics.calculate({ ...base, customCG: [.03, 0, .02] }), zero = physics.calculate(base);
  near(cg.rollMoment - zero.rollMoment, base.mass * G * .02, 1e-8); near(cg.pitchMoment - zero.pitchMoment, -base.mass * G * .03, 1e-8);
}
report.mixer = { layouts, balance };

// 3. Mission: 0.91 arithmetic unchanged, trace, distance and margin.
function oldMission(p, stages) { // frozen copy of the 0.91 stage loop
  let state = power.initialBattery(p), seconds = 0; const rows = [];
  for (const stage of stages) {
    const q = { ...p, altitude: stage.altitude, windSpeed: stage.wind + stage.speed };
    if (p.temperatureMode === 'standard') q.temperature = 15 - .0065 * stage.altitude;
    const start = state.outputWh; let elapsed = 0, reason = 'complete', watts = 0;
    while (elapsed < stage.minutes * 60) {
      if (state.soc <= (p.reserveCharge ?? 15) + 1e-8) { reason = 'reserve'; break; }
      const result = physics.calculate(q, { batteryState: state }); watts = result.electricalPower;
      if (!result.feasible) { reason = 'flight-limit'; break; }
      const c = power.batteryCircuit(q, state, watts);
      if (!c.feasible || !c.controllerPowered) { reason = 'power-limit'; break; }
      const toReserve = (state.soc - (p.reserveCharge ?? 15)) / 100 * c.capacityAh * 3600 / Math.max(1e-9, c.current);
      const dt = Math.min(2, stage.minutes * 60 - elapsed, toReserve);
      if (dt <= 1e-7) { reason = 'reserve'; break; }
      const advanced = power.dischargeStep(state, q, watts, q.windSpeed, result.density, dt, p.reserveCharge ?? 15);
      state = advanced.state; elapsed += advanced.seconds; seconds += advanced.seconds;
      if (advanced.seconds < 1e-8) { reason = 'reserve'; break; }
    }
    rows.push({ name: stage.name, seconds: elapsed, wh: state.outputWh - start, soc: state.soc, temperature: state.temperature, watts, reason, distanceM: stage.speed * elapsed });
    if (reason !== 'complete') break;
  }
  return { rows, seconds, soc: state.soc };
}
const plan = [{ name: 'Departure', minutes: 2, speed: 3, altitude: 500, wind: 3 }, { name: 'Survey', minutes: 8, speed: 0, altitude: 500, wind: 6 }, { name: 'Return', minutes: 2, speed: 5, altitude: 500, wind: 6 }];
const cases = [
  ['default', base, plan],
  ['standard temperature', { ...base, temperatureMode: 'standard' }, plan.map(s => ({ ...s, altitude: 2500 }))],
  ['manual pressure', { ...base, pressureMode: 'manual', pressureHpa: 880 }, plan],
  ['reaches reserve', { ...base, stateOfCharge: 40 }, plan],
  ['heavy', { ...base, payload: 4.5 }, plan]
];
const missionChecks = [];
for (const [name, p, stages] of cases) {
  const now = engineering.missionForecast(p, stages), old = oldMission(p, stages);
  // 0.93 adds motorLoad to each row; every 0.91 field must stay identical.
  assert.equal(JSON.stringify(now.rows.map(({ motorLoad, ...r }) => r)), JSON.stringify(old.rows), `${name}: rows differ from 0.91`);
  assert.equal(now.seconds, old.seconds);
  for (let i = 1; i < now.trace.length; i++) assert(now.trace[i].seconds > now.trace[i - 1].seconds && now.trace[i].soc <= now.trace[i - 1].soc + 1e-12);
  near(now.trace.at(-1).seconds, now.seconds, 1e-9); near(now.trace.at(-1).soc, now.soc, 1e-12);
  near(now.distanceM, now.rows.reduce((s, r, i) => s + stages[i].speed * r.seconds, 0), 1e-9);
  let marginCheck = null;
  if (now.complete) {
    assert(now.margin && now.margin.seconds > 0 && now.margin.soc >= (p.reserveCharge ?? 15) - 1e-6);
    const extra = now.margin.seconds / 60;
    if (extra < 119) {
      const shorter = engineering.missionForecast(p, [...stages, { ...stages.at(-1), minutes: Math.max(.1, extra * .98) }], { margin: false }),
        longer = engineering.missionForecast(p, [...stages, { ...stages.at(-1), minutes: extra + .2 }], { margin: false });
      assert(shorter.complete, `${name}: 98% of the margin should fit`); assert(!longer.complete, `${name}: margin + 0.2 min should not fit`);
      marginCheck = { marginMinutes: extra, reason: now.margin.reason, socAtEnd: now.margin.soc };
    }
  } else assert.equal(now.margin, null);
  missionChecks.push({ name, complete: now.complete, minutes: now.seconds / 60, distanceM: now.distanceM, tracePoints: now.trace.length, margin: marginCheck });
}
report.mission = missionChecks;

// 4. Altitude ceiling.
{
  const envelope = engineering.altitudeEnvelope(base, { step: 100 });
  const at = h => physics.calculate({ ...base, altitude: h, pressureMode: 'auto', temperatureMode: 'standard' });
  assert(!envelope.hover.above && !envelope.hover.below);
  assert(at(envelope.hover.altitude - .01).feasible && !at(envelope.hover.altitude + .5).feasible);
  assert(envelope.margin.altitude <= envelope.hover.altitude);
  assert(at(envelope.margin.altitude - .01).reserve >= 30 && at(envelope.margin.altitude + .5).reserve < 30);
  for (let i = 1; i < envelope.rows.length; i++) assert(envelope.rows[i].density < envelope.rows[i - 1].density);
  const manual = engineering.altitudeEnvelope({ ...base, pressureMode: 'manual', pressureHpa: 700 }, { step: 500 }),
    auto = engineering.altitudeEnvelope(base, { step: 500 });
  assert.equal(JSON.stringify(manual.rows), JSON.stringify(auto.rows), 'manual pressure must not freeze density');
  const fixed = engineering.altitudeEnvelope({ ...base, temperatureMode: 'manual', temperature: 5 }, { temperature: 'settings', step: 1000 });
  fixed.rows.forEach(r => assert.equal(r.temperature, 5));
  const series = physics.graphSeries({ ...base, temperatureMode: 'standard', pressureMode: 'auto' }, 'altitude', 'reserve', 0, 6000, 601);
  const firstInfeasible = series.find(point => !point.result.feasible).x;
  assert(firstInfeasible > envelope.hover.altitude && firstInfeasible - envelope.hover.altitude <= 10 + 1e-9);
  const ground = engineering.altitudeEnvelope({ ...base, payload: 15 }, { step: 500 });
  assert(ground.hover.below);
  const light = engineering.altitudeEnvelope({ ...base, payload: 0, mass: .8 }, { step: 500, maxAltitude: 3000 });
  assert(light.hover.above);
  assert.throws(() => engineering.altitudeEnvelope(base, { maxAltitude: 20000 }));
  report.altitudeCeiling = { hoverM: envelope.hover.altitude, hoverLimit: envelope.hover.limit, reserve30M: envelope.margin.altitude, graphFirstInfeasibleM: firstInfeasible, heavyBelowSeaLevel: ground.hover.below, lightAboveRange: light.hover.above };
}

// 5. Propeller clearance shown for built-in presets matches the overlap rule used by physics.
for (const preset of ['survey', 'racing', 'industrialHex', 'cargoOcto'])
  for (const scale of [.6, 1, 1.4]) {
    const p = { ...base, ...physics.dronePresets[preset], dronePreset: preset };
    p.diameter = Math.min(32, p.diameter * scale);
    const clearance = p.frameSize / 1000 * Math.sin(Math.PI / p.rotors) - p.diameter * .0254;
    assert.equal(clearance < 0, physics.calculate(p).propOverlap, `${preset} × ${scale}`);
  }

// 6. A/B verdicts and changed settings.
{
  const a = { ...base }, b = { ...base, payload: base.payload + .5, windSpeed: 30, rpm: base.rpm + 200 };
  const rows = comparison.compareConfigurations(a, b), reserve = rows.find(r => r.key === 'reserve');
  for (const r of rows) {
    if (r.verdict === 'better') assert((r.b - r.a) * comparison.metricDirections[r.key] > 0);
    if (r.verdict === 'worse') assert((r.b - r.a) * comparison.metricDirections[r.key] < 0);
  }
  assert(['better', 'worse', 'same'].includes(reserve.verdict));
  const changed = comparison.changedParameters(a, b).map(c => c.key).sort();
  assert.deepEqual(changed, ['payload', 'rpm'], 'weather is taken from A and must not be listed');
  const heavy = comparison.compareConfigurations(a, { ...a, payload: 15 }).find(r => r.key === 'flightMinutes');
  assert.equal(heavy.bAvailable, false); assert.equal(heavy.verdict, 'na');
  report.comparison = { rows: rows.map(r => ({ key: r.key, verdict: r.verdict, percent: r.percent })), changed };
}

// 7. Dashes, translations and chart ticks.
for (const language of ['ru', 'en', 'es']) {
  i18n.setLanguage(language);
  assert.equal(i18n.t('—'), '—', `${language}: lone dash must stay a dash`);
  assert.equal(i18n.t('A — B'), 'A : B');
}
i18n.setLanguage('en');
for (const key of ['лучше', 'хуже', 'н/д', 'Что отличается в B', 'Итог для B']) assert(!/[А-Яа-яЁё]/.test(i18n.t(key)), key);
i18n.setLanguage('es');
assert.equal(i18n.t('лучше'), 'mejor');
let labEntries = 0;
const source = fs.readFileSync(path.join(root, 'dist/workbench.js'), 'utf8');
for (const m of source.matchAll(/\b(?:L|k)\('((?:[^'\\]|\\.)*)'\)/g)) {
  const entry = lab[m[1]];
  if (['CAD', 'X', 'Y', 'Z'].includes(m[1])) continue;
  assert(entry && entry[0] && entry[1], `missing translation: ${m[1]}`);
  labEntries++;
}
assert.deepEqual(chart.niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
{ const ticks = chart.niceTicks(20.04, 20.41, 4); assert.equal(ticks.length, 4); [20.1, 20.2, 20.3, 20.4].forEach((v, i) => near(ticks[i], v, 1e-9)); }
assert.equal(chart.stepDigits(.05), 2); assert.equal(chart.stepDigits(10), 0);
report.translations = { workbenchCallsChecked: labEntries, dashCases: 3 };
report.notes = ['Checks the model against its own equations and analytic cases; no flight or bench experiment.'];
fs.writeFileSync(path.join(root, 'verification-v092.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
