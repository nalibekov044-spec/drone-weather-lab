// 0.94: what will overheat first and when, from the present losses. Each part is a first-order thermal model
// (the same ones the simulation integrates), so the time to a limit has a closed form:
//   T(t) = target + (T₀ − target)·e^(−t/τ)   ⇒   t = τ · ln((target − T₀) / (target − limit)).
import {
  motorTargetTemperature,
  motorCooling
} from './systems.js';

export const THERMAL_LIMITS = {
  motorWear: 110,
  motorSmoke: 145,
  motorFire: 175,
  escDerate: 95,
  escCut: 135,
  batteryCut: 75
};

export function timeToReach(current, target, tau, limit) {
  if (current >= limit) return 0;
  if (!(target > limit + 1e-9) || !(tau > 0)) return Infinity;
  return tau * Math.log((target - current) / (target - limit));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// s: present state of the simulation: motor temperatures, loads (% of rating), draws (input, loss, efficiency),
// fires, ESC temperatures and input powers, battery temperature and heat, wind and air density.
export function thermalForecast(p, s) {
  const items = [];
  const wind = Math.max(0, s.wind || 0),
    densityScale = Math.sqrt(Math.max(0.1, (s.density || 1.225) / 1.225));
  const cooling = motorCooling(p, wind);
  (s.motorTemps || []).forEach((temperature, i) => {
    const draw = s.draws?.[i] || {},
      ratio = clamp((s.loads?.[i] ?? 0) / 100, 0, 3),
      efficiency = draw.efficiency ?? p.motorEfficiency / 100;
    const lossScale = clamp((100 - efficiency * 100) / 12, 0.3, 4);
    const active = (s.healths?.[i] ?? 1) > 0.02 && (s.rpms?.[i] ?? Infinity) > 1;
    const target = motorTargetTemperature(p, active ? ratio : 0, lossScale, active ? draw.loss : 0, wind, s.fires?.[i] ||
      0);
    const tau = 42 / cooling;
    items.push({
      part: 'motor',
      index: i,
      temperature,
      target,
      smoke: timeToReach(temperature, target, tau, THERMAL_LIMITS.motorSmoke),
      fire: timeToReach(temperature, target, tau, THERMAL_LIMITS.motorFire)
    });
  });
  const escConductance = (0.35 + wind * 0.025) * densityScale,
    escEfficiency = clamp((p.escEfficiency ?? 97) / 100, 0.5, 1);
  (s.escTemps || []).forEach((temperature, i) => {
    const loss = Math.max(0, s.motorInputs?.[i] ?? 0) * (1 / escEfficiency - 1);
    const target = p.temperature + loss / escConductance;
    const tau = 18 / escConductance;
    items.push({
      part: 'esc',
      index: i,
      temperature,
      target,
      derate: timeToReach(temperature, target, tau, THERMAL_LIMITS.escDerate),
      cut: timeToReach(temperature, target, tau, THERMAL_LIMITS.escCut)
    });
  });
  if (Number.isFinite(s.batteryTemp)) {
    const conductance = (0.8 + wind * 0.12) * densityScale,
      heatCapacity = Math.max(0.005, p.batteryMass ?? 0.8) * 900;
    const target = p.temperature + Math.max(0, s.batteryHeat || 0) / conductance;
    items.push({
      part: 'battery',
      index: 0,
      temperature: s.batteryTemp,
      target,
      cut: timeToReach(s.batteryTemp, target, heatCapacity / conductance, THERMAL_LIMITS.batteryCut)
    });
  }
  // The first event that will happen if nothing changes.
  const events = [];
  for (const item of items) {
    if (item.part === 'motor') {
      events.push({ ...item, event: 'smoke', seconds: item.smoke }, { ...item, event: 'fire', seconds: item.fire });
    } else if (item.part === 'esc') {
      events.push({ ...item, event: 'derate', seconds: item.derate }, { ...item, event: 'cut', seconds: item.cut });
    } else events.push({ ...item, event: 'cut', seconds: item.cut });
  }
  events.sort((a, b) => a.seconds - b.seconds);
  // Limits already passed are history; the forecast names the next one still ahead.
  return {
    items,
    passed: events.filter(e => e.seconds === 0),
    first: events.find(e => Number.isFinite(e.seconds) && e.seconds > 0) || null
  };
}

// One-click overload demonstrations. Each one changes only what it needs and states why the part fails.
export const overloadScenarios = [{
  id: 'big-prop',
  stand: true,
  title: 'Too big a propeller',
  text: 'An 18 × 6.1 propeller on the 15-inch motor: the motor tries to turn it at full voltage, the current and the copper losses grow, and the hot winding resists even more.',
  parameters: {
    motorModel: 'datasheet',
    motorKv: 400,
    motorResistance: 0.067,
    motorIdleCurrent: 1.3,
    diameter: 18,
    pitch: 6.1,
    rpm: 9000,
    maxRpm: 9000,
    escCurrentLimit: 80,
    motorMaxPower: 420,
    voltage: 22.2,
    capacity: 16000,
    batteryResistance: 0.008,
    batteryCRating: 40,
    batteryMass: 2.2
  }
}, {
  id: 'overvoltage',
  stand: true,
  title: '8S battery on a 6S motor',
  text: 'The same 15-inch propeller with a third more voltage: the motor spins faster, propeller power grows with the cube of speed and the losses follow.',
  parameters: {
    motorModel: 'datasheet',
    motorKv: 400,
    motorResistance: 0.067,
    motorIdleCurrent: 1.3,
    diameter: 15,
    pitch: 5,
    rpm: 12000,
    maxRpm: 12000,
    escCurrentLimit: 60,
    motorMaxPower: 420,
    voltage: 29.6,
    capacity: 16000,
    batteryResistance: 0.01,
    batteryCRating: 40,
    batteryMass: 2.6
  }
}, {
  id: 'weak-motor',
  stand: false,
  title: 'Weak motors and a heavy payload',
  text: 'In flight the motors give only the hover thrust, but with 3.5 kg of payload that is twice the rating of 90 W motors.',
  parameters: {
    motorModel: 'rated',
    motorMaxPower: 90,
    payload: 3.5,
    rpm: 7200,
    capacity: 16000,
    batteryResistance: 0.01,
    batteryCRating: 40,
    batteryMass: 2.2
  }
}];
