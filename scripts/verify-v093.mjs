// 0.93 checks of the motor model: rated power is a rating, not a ceiling; hard limits; overload heating,
// weakening magnets, fire and failure; the test stand; flight heating independent of the RPM command.
// Run: node --experimental-vm-modules scripts/verify-v093.mjs
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
const physics = await ns('physics'), systems = await ns('systems'), power = await ns('power-system'), engineering = await ns('engineering');
const near = (a, b, t = 1e-9, msg = '') => assert(Math.abs(a - b) <= t, `${msg} ${a} versus ${b}`);
// 0.94: the propeller power model was recalibrated against bench data (hover power fell about 2.5 times),
// so the overload cases below use weaker motors to load them as much as before.
const base = { ...physics.baseDefaults }, report = { version: '0.93.1-beta', calibration: '0.94 propeller power model' };

// 1. Rated power does not cap RPM; ESC current, battery and maximum RPM do.
{
  const small = physics.calculate({ ...base, motorMaxPower: 80 }), large = physics.calculate({ ...base, motorMaxPower: 2500 });
  near(small.rpmPowerLimit, large.rpmPowerLimit, 1e-9, 'rating must not change the hard RPM limit');
  const weakEsc = physics.calculate({ ...base, escCurrentLimit: 10 });
  assert(weakEsc.rpmPowerLimit < small.rpmPowerLimit, 'ESC current is a hard limit');
  const capped = physics.calculate({ ...base, rpm: 24000 });
  assert(capped.commandLimited && capped.effectiveRpms.every(r => r <= Math.min(base.maxRpm, capped.rpmPowerLimit) + 1e-9));
  assert(!physics.calculate(base).commandLimited);
  near(small.motorLoadPercents[0] / large.motorLoadPercents[0], 2500 / 80, 1e-9, 'load is relative to the rating');
  report.hardLimits = { rpmLimitWithRating80W: small.rpmPowerLimit, rpmLimitWithRating2500W: large.rpmPowerLimit, rpmLimitEsc10A: weakEsc.rpmPowerLimit };
}
// 2. An overloaded motor can still hover; it is flagged, not declared impossible.
{
  const p = { ...base, motorMaxPower: 60 }, r = physics.calculate(p);
  assert(r.feasible && r.motorOverload && r.requiredPowerLoad > 100);
  const fine = physics.calculate(base);
  assert(fine.feasible && !fine.motorOverload);
  report.overloadHover = { requiredLoadPercent: r.requiredPowerLoad, feasible: r.feasible };
}
// 3. Hot magnets: efficiency factor 1 up to 95 °C, 0.75 from 220 °C; the motor draws more for the same thrust.
{
  near(systems.thermalAvailability(95), 1); near(systems.thermalAvailability(220), .75); near(systems.thermalAvailability(400), .75);
  for (let t = 20; t < 300; t += 5) assert(systems.thermalAvailability(t + 5) <= systems.thermalAvailability(t));
  const cold = physics.calculate(base), hot = physics.calculate(base, { motorTemps: Array(4).fill(220) });
  near(hot.motorEfficiencies[0] / cold.motorEfficiencies[0], .75, 1e-12);
  assert(hot.electricalPower > cold.electricalPower);
}
// 4. Continuous rating: at 100% load without wind (efficiency 88%) the motor settles 65 °C above the air.
{
  const p = { temperature: 15, motorEfficiency: 88, rainRate: 0 };
  let s = { temperatures: [15], healths: [1], fires: [0], exposure: [0], ignition: [0] };
  for (let i = 0; i < 60 * 600; i++) s = systems.stepMotorThermals(s, p, { effectiveRpms: [5000], motorLoadPercents: [100], motorEfficiencies: [.88] }, 0, 1 / 60);
  near(s.temperatures[0], 80, 1e-3, 'rated steady state'); assert.equal(s.healths[0], 1); assert.equal(s.fires[0], 0);
  report.ratedSteadyStateC = s.temperatures[0];
}
// Shared loop: battery, ESC and motor heating with the same coupling as the page (flight or stand).
function run(p, stand, seconds, dt = .1) {
  let st = { temperatures: Array(p.rotors).fill(p.temperature), healths: Array(p.rotors).fill(1), fires: Array(p.rotors).fill(0), exposure: [], ignition: [] },
    esc = Array(p.rotors).fill(p.temperature), bat = power.initialBattery(p);
  const events = {}, trace = [];
  for (let t = 0; t < seconds; t += dt) {
    const r = physics.calculate(p, { motorHealths: st.healths, motorTemps: st.temperatures, escTemps: esc, batteryState: bat });
    const thrust = stand ? r.availableThrust : Math.min(r.availableThrust, r.requiredThrust),
      share = Math.min(1, thrust / Math.max(1e-9, r.availableThrust));
    const motorPowers = r.shaftPowers.map((w, i) => w * share ** 1.5 / Math.max(.1, r.motorEfficiencies[i]));
    const circuit = power.batteryCircuit(p, bat, motorPowers.reduce((a, b) => a + b, 0) / r.escEfficiency + r.avionicsPower);
    bat = power.stepBattery(bat, p, circuit, p.windSpeed, r.density, dt);
    esc = power.stepESC(esc, p, motorPowers, circuit.terminalVoltage, p.windSpeed, r.density, dt);
    st = systems.stepMotorThermals(st, p, { ...r, motorThermalLoadPercents: motorPowers.map(w => w / p.motorMaxPower * 100) }, p.windSpeed, dt);
    const hottest = Math.max(...st.temperatures);
    if (hottest > 145 && events.smoke === undefined) events.smoke = t;
    if (Math.max(...st.fires) > .06 && events.fire === undefined) events.fire = t;
    if (Math.min(...st.healths) < .18 && events.failure === undefined) events.failure = t;
    trace.push({ t, hottest, load: motorPowers[0] / p.motorMaxPower * 100, rpm: r.effectiveRpms[0] * Math.sqrt(share), fire: Math.max(...st.fires) });
  }
  return { events, trace, final: trace.at(-1) };
}
// 5. Test stand at full command with a battery that can feed the motors: smoke, fire, failure, in this order.
{
  const p = { ...base, rpm: 7200, batteryCRating: 60, capacity: 10000, batteryResistance: .012, motorMaxPower: 260 };
  const stand = run(p, true, 90), flight = run(p, false, 90);
  assert(stand.events.smoke < stand.events.fire && stand.events.fire < stand.events.failure, JSON.stringify(stand.events));
  assert.equal(stand.final.rpm, 0, 'a failed motor stops');
  assert(flight.events.fire === undefined && Math.max(...flight.trace.map(x => x.hottest)) < 60, 'same command in flight only carries the hover load');
  report.standBurn = { ...stand.events, flightHottestC: Math.max(...flight.trace.map(x => x.hottest)) };
}
// 6. In flight the RPM command changes available thrust, not heating.
{
  const a = run({ ...base, rpm: 4800 }, false, 60), b = run({ ...base, rpm: 6000 }, false, 60);
  near(a.final.hottest, b.final.hottest, 1e-9, 'hover heating');
  report.flightCommandIndependence = { rpm4800C: a.final.hottest, rpm6000C: b.final.hottest };
}
// 7. A weak motor overloaded in hover burns in flight.
{
  const p = { ...base, payload: 3.5, motorMaxPower: 90, rpm: 7200 }, f = run(p, false, 150);
  assert(physics.calculate(p).feasible && f.events.fire !== undefined && f.events.failure !== undefined);
  report.flightOverloadBurn = f.events;
}
// 8. Burning continues while the winding is above 175 °C and stops after it cools.
{
  const p = { temperature: 20, motorEfficiency: 88, rainRate: 0 };
  let s = { temperatures: [20], healths: [1], fires: [0], exposure: [0], ignition: [0] }, maxFire = 0, failedAt = null;
  for (let i = 0; i < 60 * 300; i++) {
    s = systems.stepMotorThermals(s, p, { effectiveRpms: [s.healths[0] > .02 ? 5000 : 0], motorLoadPercents: [300] }, 0, 1 / 60);
    maxFire = Math.max(maxFire, s.fires[0]);
    if (failedAt === null && s.healths[0] <= .02) failedAt = i / 60;
  }
  assert(maxFire > .5 && failedAt !== null && s.fires[0] === 0 && s.temperatures[0] < 175);
  report.fireOut = { failedAtS: failedAt, maxFire, finalC: s.temperatures[0] };
}
// 9. Mission and ceiling report the hover load against the rating.
{
  const plan = [{ name: 'hover', minutes: 1, speed: 0, altitude: 500, wind: 3 }];
  const weak = engineering.missionForecast({ ...base, motorMaxPower: 60 }, plan), normal = engineering.missionForecast(base, plan);
  assert(weak.motorLoad > 100 && normal.motorLoad < 100);
  const ceiling = engineering.altitudeEnvelope({ ...base, motorMaxPower: 60 }, { step: 1000 });
  assert(ceiling.rows.some(r => r.feasible && r.overload));
}
// 10. 0.93.1 mixer with motor limits: unconstrained equals the exact mixer; limits are respected; residuals are reported.
{
  const quad = physics.rotorPlanPositions(base), hex = physics.rotorPlanPositions({ ...base, ...physics.dronePresets.industrialHex, dronePreset: 'industrialHex' });
  const free = engineering.cgAllocation([.02, -.01], quad, [3, 3, 3, 3], 30), exact = engineering.cgMotorLoads([.02, -.01], quad);
  free.shares.forEach((v, i) => near(v, exact.shares[i], 1e-9, 'unconstrained allocation'));
  assert(free.saturated.length === 0 && free.momentResidual < 1e-9);
  const capped = engineering.cgAllocation([.02, 0], quad, [1.05, 1.05, 1.05, 1.05], 30);
  capped.shares.forEach(v => assert(v >= 0 && v <= 1.05 + 1e-12));
  assert(capped.saturated.length > 0 && (capped.momentResidual > 1e-3 || capped.thrustError < -1e-3));
  const hexFail = engineering.cgAllocation([0, 0], hex, [0, 1.5, 1.5, 1.5, 1.5, 1.5], 60);
  assert(hexFail.shares[0] === 0 && hexFail.momentResidual < 1e-9 && Math.abs(hexFail.thrustError) < 1e-9, 'hexacopter survives one failed motor');
  const quadFail = engineering.cgAllocation([0, 0], quad, [0, 3, 3, 3], 30);
  assert(quadFail.shares[0] === 0 && Math.abs(quadFail.yawError) > .5, 'quadcopter with a failed motor cannot hold yaw');
  report.limitedMixer = { cappedSaturated: capped.saturated, cappedMomentNm: capped.momentResidual, cappedLiftError: capped.thrustError, hexFailedMomentNm: hexFail.momentResidual, quadFailedYawError: quadFail.yawError };
}
// 11. 0.93.1 A/B verdicts: raw thrust has no verdict, power and current are not judged across different masses.
{
  const comparison = await ns('comparison');
  const heavier = comparison.compareConfigurations(base, { ...base, payload: base.payload + .5 });
  assert.equal(heavier.find(r => r.key === 'availableThrust').verdict, 'info');
  assert.equal(heavier.find(r => r.key === 'electricalPower').verdict, 'context');
  assert.equal(heavier.find(r => r.key === 'current').verdict, 'context');
  const fasterProps = comparison.compareConfigurations(base, { ...base, motorEfficiency: base.motorEfficiency + 4 });
  assert.equal(fasterProps.find(r => r.key === 'electricalPower').verdict, 'better');
  report.abVerdicts = { heavierB: Object.fromEntries(heavier.map(r => [r.key, r.verdict])) };
}
fs.writeFileSync(path.join(root, 'verification-v093.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
