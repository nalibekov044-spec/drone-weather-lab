// 0.94 checks: propeller power model against published bench data, the datasheet motor model, the thermal
// forecast, the overload tests, motor failure re-mixing, CSV measurement import and the preset batteries.
// Run: node --experimental-vm-modules scripts/verify-v094.mjs
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
const physics = await ns('physics'), systems = await ns('systems'), power = await ns('power-system'),
  engineering = await ns('engineering'), motor = await ns('motor-model'), validation = await ns('validation'),
  references = await ns('reference-data'), thermal = await ns('thermal-lab');
const near = (a, b, t, msg = '') => assert(Math.abs(a - b) <= t, `${msg} ${a} versus ${b}`);
const base = { ...physics.baseDefaults }, report = { version: '0.94.0-beta' };
const air = { temperature: 20, altitude: 0, pressureMode: 'auto', temperatureMode: 'manual', humidity: 50 };

// 1. The propeller model against T-MOTOR MN4014 tables (15 × 5, 22.2 V): thrust and electrical power.
{
  report.bench = {};
  for (const set of references.benchReferences.filter(s => s.motor)) {
    const setup = { ...air, diameter: set.diameter, pitch: set.pitch, voltage: set.voltage, propEfficiency: 86, escEfficiency: 97, motorModel: 'datasheet', ...set.motor };
    const datasheet = validation.compareBench(base, set.rows, setup);
    const rated = validation.compareBench(base, set.rows, { ...setup, motorModel: 'rated', motorEfficiency: 85 });
    assert(datasheet.thrustMAE < 8 && datasheet.powerMAE < 10, `${set.id} ${datasheet.thrustMAE} ${datasheet.powerMAE}`);
    assert(rated.powerMAE < 12, `${set.id} rated ${rated.powerMAE}`);
    const fit = validation.fitPropeller(base, set.rows, setup);
    assert(fit.figureOfMerit > 0.6 && fit.figureOfMerit < 0.8 && fit.thrustR2 > 0.99);
    report.bench[set.id] = { thrustMAE: datasheet.thrustMAE, powerMAE: datasheet.powerMAE, ratedPowerMAE: rated.powerMAE, fittedCt: fit.ct, fittedCp: fit.cp, fittedFM: fit.figureOfMerit };
  }
}
// 2. Default propeller figure of merit and hover efficiency: realistic now, about 2.5 times worse before.
{
  const c = physics.propCoefficients(5.2 / 15), s = physics.PROP_REFERENCE_STATE;
  const fm = (c.ct * s) ** 1.5 / (c.cp / s * Math.sqrt(Math.PI / 2));
  near(fm, physics.figureOfMerit(5.2 / 15), 1e-12, 'figure of merit');
  const old = { ct: (0.078 + 0.038 * 5.2 / 15) * s, cp: (0.045 + 0.04 * 5.2 / 15) / s };
  const oldFM = old.ct ** 1.5 / (old.cp * Math.sqrt(Math.PI / 2));
  assert(fm > 0.65 && fm < 0.7 && oldFM < 0.3);
  const r = physics.calculate({ ...base, ...air, windSpeed: 0, gusts: 0 });
  const gPerW = (base.mass + base.payload) * 1000 / r.electricalPower;
  assert(gPerW > 8 && gPerW < 12, `hover g/W ${gPerW}`);
  report.defaultPropeller = { figureOfMerit: fm, figureOfMeritBefore094: oldFM, hoverGramsPerWatt: gPerW, hoverWatts: r.electricalPower, flightMinutes: r.flightMinutes };
}
// 3. Datasheet motor: energy balance, temperature effects, efficiency peak, full-throttle speed.
{
  const spec = motor.motorSpec({ motorKv: 330, motorResistance: 0.085, motorIdleCurrent: 1.1 });
  const pt = motor.motorPoint(spec, 5000, 200, 25);
  near(pt.input, 200 + pt.copperLoss + pt.ironLoss, 1e-9, 'energy balance');
  const hot = motor.motorPoint(spec, 5000, 200, 125);
  near(motor.motorConstants(spec, 125).resistance / spec.resistance, 1 + 0.393, 1e-12, 'copper coefficient');
  assert(hot.current > pt.current && hot.copperLoss > pt.copperLoss * 1.5, 'a hot motor needs more current');
  const D = 15 * 0.0254, shaftAt = rpm => 0.0258 * 1.2 * (rpm / 60) ** 3 * D ** 5;
  const curve = motor.efficiencyCurve(spec, shaftAt, 9000, 25, 90);
  const best = curve.reduce((a, b) => b.efficiency > a.efficiency ? b : a);
  assert(best.rpm > curve[3].rpm && best.rpm < curve.at(-4).rpm, 'efficiency peaks inside the range');
  // Full throttle on the 22.2 V supply of the bench tests, with the model's own 15 × 5 propeller curve.
  const bench = physics.calculate({ ...base, ...air, diameter: 15, pitch: 5, propEfficiency: 86 });
  const modelShaft = rpm => bench.powerCoefficient * bench.density * (rpm / 60) ** 3 * D ** 5;
  const full330 = motor.limitedRpm(spec, modelShaft, 22.2 * motor.ESC_MODULATION, Infinity, 25);
  const full400 = motor.limitedRpm(motor.motorSpec({ motorKv: 400, motorResistance: 0.067, motorIdleCurrent: 1.3 }), modelShaft, 22.2 * motor.ESC_MODULATION, Infinity, 25);
  near(full330 / 6000, 1, 0.05, 'KV330 full throttle'); near(full400 / 6700, 1, 0.08, 'KV400 full throttle');
  report.datasheetMotor = { efficiencyPeakPercent: best.efficiency * 100, peakRpm: best.rpm, fullThrottleRpmKv330: full330, fullThrottleRpmKv400: full400 };
}
// 4. Voltage limits speed in the datasheet model: more cells, more speed; a sagging battery, less.
{
  const p = { ...base, motorModel: 'datasheet', rpm: 9000, maxRpm: 12000 };
  const full = physics.calculate(p), low = physics.calculate(p, { batteryState: { ...power.initialBattery(p), soc: 15 } }), eight = physics.calculate({ ...p, voltage: 29.6 });
  assert(low.rpmPowerLimit < full.rpmPowerLimit && eight.rpmPowerLimit > full.rpmPowerLimit * 1.2 && full.voltageLimited);
  assert(physics.calculate({ ...base, motorModel: 'datasheet' }).feasible, 'default drone hovers with datasheet motors');
  report.voltageLimit = { fullRpm: full.rpmPowerLimit, at15PercentRpm: low.rpmPowerLimit, eightCellRpm: eight.rpmPowerLimit };
}
// Simulation loop with the same coupling as the page.
function run(over, stand, seconds, dt = 0.05) {
  const p = { ...base, ...over };
  let st = { temperatures: Array(p.rotors).fill(p.temperature), healths: Array(p.rotors).fill(1), fires: Array(p.rotors).fill(0), exposure: [], ignition: [] },
    esc = Array(p.rotors).fill(p.temperature), bat = power.initialBattery(p);
  const ev = {};
  for (let t = 0; t < seconds; t += dt) {
    const r = physics.calculate(p, { motorHealths: st.healths, motorTemps: st.temperatures, escTemps: esc, batteryState: bat });
    const thrust = stand ? r.availableThrust : Math.min(r.availableThrust, r.requiredThrust), share = Math.min(1, thrust / Math.max(1e-9, r.availableThrust));
    const draws = physics.motorDraw(p, r, r.effectiveRpms.map(x => x * Math.sqrt(share)), r.shaftPowers.map(w => w * share ** 1.5), st.temperatures, st.healths);
    const inputs = draws.map(d => d.input);
    const circuit = power.batteryCircuit(p, bat, inputs.reduce((a, b) => a + b, 0) / r.escEfficiency + r.avionicsPower);
    bat = power.stepBattery(bat, p, circuit, p.windSpeed, r.density, dt);
    esc = power.stepESC(esc, p, inputs, circuit.terminalVoltage, p.windSpeed, r.density, dt);
    st = systems.stepMotorThermals(st, p, { ...r, motorThermalLoadPercents: inputs.map(w => w / p.motorMaxPower * 100), motorLossWatts: draws.map(d => d.loss) }, p.windSpeed, dt);
    const hottest = Math.max(...st.temperatures);
    if (hottest > 145 && ev.smoke === undefined) ev.smoke = t;
    if (Math.max(...st.fires) > .06 && ev.fire === undefined) ev.fire = t;
    if (Math.min(...st.healths) < .18 && ev.failure === undefined) ev.failure = t;
    if (bat.temperature >= 75 && ev.batteryCut === undefined) ev.batteryCut = t;
    ev.hottest = Math.max(ev.hottest ?? 0, hottest);
  }
  return ev;
}
// 5. A healthy default motor does not burn at full command; the overload tests do, before the battery cuts.
{
  const rated = run({ rpm: 7200 }, true, 180), datasheet = run({ rpm: 7200, motorModel: 'datasheet' }, true, 180), flight = run({}, false, 120);
  assert(rated.fire === undefined && datasheet.fire === undefined && datasheet.hottest < 90 && flight.hottest < 40);
  report.healthy = { standRatedMaxC: rated.hottest, standDatasheetMaxC: datasheet.hottest, flightMaxC: flight.hottest };
  report.overload = {};
  for (const s of thermal.overloadScenarios) {
    const ev = run(s.parameters, s.stand, 150);
    assert(ev.smoke < ev.fire && ev.fire < ev.failure && ev.failure < 120 && ev.batteryCut === undefined, `${s.id} ${JSON.stringify(ev)}`);
    report.overload[s.id] = { smokeS: ev.smoke, fireS: ev.fire, failureS: ev.failure };
  }
}
// 6. The forecast's closed form matches the integrated thermal model for a constant load.
{
  const p = { ...base, temperature: 15, rainRate: 0, motorModel: 'rated' };
  const target = systems.motorTargetTemperature(p, 1.8, 1, null, 0, 0), tau = 42;
  const predicted = thermal.timeToReach(15, target, tau, 145);
  let s = { temperatures: [15], healths: [1], fires: [0], exposure: [0], ignition: [0] }, t = 0;
  while (s.temperatures[0] < 145 && t < 600) {
    s = systems.stepMotorThermals(s, p, { effectiveRpms: [5000], motorLoadPercents: [180], motorEfficiencies: [p.motorEfficiency / 100] }, 0, 0.01);
    t += 0.01;
  }
  near(t, predicted, 0.02 * predicted + 0.05, 'time to smoke');
  assert.equal(thermal.timeToReach(150, 200, 42, 145), 0);
  assert.equal(thermal.timeToReach(20, 100, 42, 145), Infinity);
  const f = thermal.thermalForecast(p, { motorTemps: [20, 20, 20, 20], loads: [180, 180, 180, 180], draws: Array(4).fill({ efficiency: 0.88, loss: 50 }), escTemps: [20, 20, 20, 20], motorInputs: [400, 400, 400, 400], batteryTemp: 20, batteryHeat: 40, wind: 0, density: 1.2 });
  assert(f.first.part === 'motor' && f.first.event === 'smoke');
  report.forecast = { predictedSmokeS: predicted, integratedSmokeS: t };
}
// 7. Motor failure: the motor-limited mixer re-distributes thrust; a hexacopter keeps yaw, a quadcopter does not.
{
  const hexPreset = { ...base, ...physics.dronePresets.industrialHex, dronePreset: 'industrialHex' };
  const healths = [0, 1, 1, 1, 1, 1], r = physics.calculate(hexPreset, { motorHealths: healths });
  const avg = r.requiredThrust / 6, a = engineering.cgAllocation([0, 0], physics.rotorPlanPositions(hexPreset), r.thrusts.map(t => t / avg), r.requiredThrust);
  assert(Math.abs(a.yawError) < 1e-9 && Math.abs(a.thrustError) < 1e-9 && a.shares[0] === 0);
  const working = a.shares.filter(x => x > 0);
  assert(Math.max(...working) >= 1.5 - 1e-9, 'working motors carry more');
  report.hexFailureShares = a.shares;
}
// 8. CSV import: bench tables in grams, kgf and newtons, flight logs in microseconds; least squares recovers Ct and Cp.
{
  const g = validation.parseMeasurementCSV('RPM;Thrust (g);Voltage (V);Current (A)\n3900;830;22,2;3,6\n4600;1150;22,2;5,9');
  assert.equal(g.kind, 'bench'); near(g.rows[0].thrustN, 0.830 * 9.80665, 1e-9); near(g.rows[1].electricalPower, 22.2 * 5.9, 1e-9);
  const kgf = validation.parseMeasurementCSV('Motor Electrical Speed (RPM),Thrust (kgf),Mechanical Power (W)\n3000,0.5,36\n4000,0.9,72');
  near(kgf.rows[1].thrustN, 0.9 * 9.80665, 1e-9); assert.equal(kgf.rows[1].shaftPower, 72);
  const p = { ...base, ...air, diameter: 15, pitch: 5 };
  const rho = physics.calculate(p).density, D = 15 * 0.0254;
  const synthetic = [3000, 4000, 5000, 6000].map(rpm => ({ rpm, thrustN: 0.08 * rho * (rpm / 60) ** 2 * D ** 4, shaftPower: 0.025 * rho * (rpm / 60) ** 3 * D ** 5, electricalPower: null }));
  const fit = validation.fitPropeller(p, synthetic);
  near(fit.ct, 0.08, 1e-12); near(fit.cp, 0.025, 1e-12);
  let log = 'time (us),vbatLatest (V),amperageLatest (A)\n';
  for (let i = 0; i <= 600; i++) log += `${i * 100000},24,10\n`;
  const parsed = validation.parseMeasurementCSV(log), flight = validation.compareFlightLog(base, parsed.rows);
  assert.equal(parsed.kind, 'log'); near(flight.duration, 60, 1e-6); near(flight.averagePower, 240, 1e-9); near(flight.energyWh, 4, 1e-9); near(flight.chargeAh, 10 / 60, 1e-9);
  assert.throws(() => validation.parseMeasurementCSV('a,b\n1,2\n3,4'), /csv-columns/);
}
// 9. Preset batteries: realistic energy per kilogram, battery lighter than the drone; 0.93 projects still load.
{
  report.presets = {};
  for (const [key, preset] of Object.entries(physics.dronePresets)) {
    const wh = preset.capacity / 1000 * preset.voltage, density = wh / preset.batteryMass;
    assert(density > 110 && density < 230 && preset.batteryMass < preset.mass, key);
    const r = physics.calculate({ ...base, ...preset, dronePreset: key });
    assert(r.feasible, key);
    report.presets[key] = { batteryWh: wh, whPerKg: density, hoverWatts: r.electricalPower, flightMinutes: r.flightMinutes, gramsPerWatt: (preset.mass + preset.payload) * 1000 / r.electricalPower };
  }
  const old093 = Object.fromEntries(Object.entries(base).filter(([k]) => !['motorModel', 'motorKv', 'motorResistance', 'motorIdleCurrent'].includes(k)));
  near(physics.calculate(old093).electricalPower, physics.calculate(base).electricalPower, 1e-9, 'old project uses the simple motor model');
}
fs.writeFileSync(path.join(root, 'verification-v094.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
