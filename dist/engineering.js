import {
  validateMissionStages
} from "./calculation-tools.js";
import {
  calculate,
  pressureFromAltitude
} from './physics.js';
import {
  batteryCircuit,
  initialBattery,
  dischargeStep
} from './power-system.js';

export const cellTypes = {
  lipo: {
    nominal: 3.7,
    cutoff: 3.2
  },
  lion: {
    nominal: 3.6,
    cutoff: 2.9
  },
  lihv: {
    nominal: 3.8,
    cutoff: 3.3
  },
  lifepo4: {
    nominal: 3.2,
    cutoff: 2.5
  }
};
export const packExamples = [{
  name: 'LiPo · 6S 5000',
  chemistry: 'lipo',
  series: 6,
  parallel: 1,
  cellMah: 5000,
  cellOhm: .005,
  cellMass: .13,
  cRating: 35
}, {
  name: 'Li-ion · 6S2P 8000',
  chemistry: 'lion',
  series: 6,
  parallel: 2,
  cellMah: 4000,
  cellOhm: .018,
  cellMass: .07,
  cRating: 8
}, {
  name: 'LiHV · 4S 1550',
  chemistry: 'lihv',
  series: 4,
  parallel: 1,
  cellMah: 1550,
  cellOhm: .006,
  cellMass: .047,
  cRating: 60
}, {
  name: 'LiFePO4 · 8S 3000',
  chemistry: 'lifepo4',
  series: 8,
  parallel: 1,
  cellMah: 3000,
  cellOhm: .008,
  cellMass: .085,
  cRating: 15
}];
const finite = (v, min, max, name) => {
  if (!Number.isFinite(v) || v < min || v > max) throw Error(name);
  return v;
};
export function buildPack(data) {
  if (!data || !cellTypes[data.chemistry]) throw Error('battery chemistry');
  const {
    series: s,
    parallel: n,
    cellMah: q,
    cellOhm: r,
    cellMass: m,
    cRating: c
  } = data;
  finite(s, 1, 16, 'series');
  finite(n, 1, 12, 'parallel');
  if (!Number.isInteger(s) || !Number.isInteger(n)) throw Error('cell count');
  finite(q, 100, 30000, 'cell capacity');
  finite(r, 0, .2, 'cell resistance');
  finite(m, .005, 1, 'cell mass');
  finite(c, 1, 100, 'C rating');
  const voltage = s * cellTypes[data.chemistry].nominal,
    capacity = q * n,
    mass = s * n * m,
    resistance = s * r / n;
  if (capacity > 30000 || mass > 8 || resistance > .5) throw Error('pack range');
  return {
    name: String(data.name || 'Custom pack').trim().slice(0, 60),
    chemistry: data.chemistry,
    series: s,
    parallel: n,
    capacity,
    mass,
    resistance,
    voltage,
    energyWh: voltage * capacity / 1000,
    currentLimit: capacity / 1000 * c,
    parameters: {
      batteryChemistry: data.chemistry,
      batteryCells: s,
      voltage,
      capacity,
      batteryMass: mass,
      batteryResistance: resistance,
      batteryCRating: c,
      cellCutoff: cellTypes[data.chemistry].cutoff
    }
  };
}
export function componentBalance(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 40) throw Error('components');
  let mass = 0,
    cg = [0, 0, 0];
  for (const item of items) {
    finite(item.mass, .001, 30, 'component mass');
    if (!Array.isArray(item.position) || item.position.length !== 3) throw Error('position');
    item.position.forEach(v => finite(v, -2000, 2000, 'position'));
    mass += item.mass;
    cg = cg.map((v, i) => v + item.mass * item.position[i] / 1000);
  }
  cg = cg.map(v => v / mass);
  const inertia = [0, 0, 0];
  for (const item of items) {
    const d = item.position.map((v, i) => v / 1000 - cg[i]);
    for (let i = 0; i < 3; i++) inertia[i] += item.mass * (d[(i + 1) % 3] ** 2 + d[(i + 2) % 3] ** 2);
  }
  return {
    mass,
    cg,
    inertia
  };
}
export function calibrateProp(thrustN, shaftWatts, rpm, diameterM, density) {
  [thrustN, shaftWatts, rpm, diameterM, density].forEach(v => finite(v, 1e-8, 1e8, 'measurement'));
  const n = rpm / 60;
  return {
    ct: thrustN / (density * n * n * diameterM ** 4),
    cp: shaftWatts / (density * n ** 3 * diameterM ** 5)
  };
}
export function missionForecast(p, stages) {
  validateMissionStages(stages);
  let state = initialBattery(p),
    seconds = 0;
  const rows = [];
  for (const stage of stages) {
    finite(stage.minutes, .1, 120, 'duration');
    finite(stage.speed, 0, 40, 'speed');
    finite(stage.altitude, 0, 5000, 'altitude');
    finite(stage.wind, 0, 40, 'wind');
    const q = {
      ...p,
      altitude: stage.altitude,
      windSpeed: stage.wind + stage.speed
    };
    if (p.temperatureMode === 'standard') q.temperature = 15 - .0065 * stage.altitude;
    const start = state.outputWh;
    let elapsed = 0,
      reason = 'complete',
      watts = 0;
    while (elapsed < stage.minutes * 60) {
      if (state.soc <= (p.reserveCharge ?? 15) + 1e-8) {
        reason = 'reserve';
        break;
      }
      const result = calculate(q, {
        batteryState: state
      });
      watts = result.electricalPower;
      if (!result.feasible) {
        reason = 'flight-limit';
        break;
      }
      const c = batteryCircuit(q, state, watts);
      if (!c.feasible || !c.controllerPowered) {
        reason = 'power-limit';
        break;
      }
      const toReserve = (state.soc - (p.reserveCharge ?? 15)) / 100 * c.capacityAh * 3600 / Math.max(1e-9, c
        .current);
      const dt = Math.min(2, stage.minutes * 60 - elapsed, toReserve);
      if (dt <= 1e-7) {
        reason = 'reserve';
        break;
      }
      const advanced = dischargeStep(state, q, watts, q.windSpeed, result.density, dt, p.reserveCharge ?? 15);
      state = advanced.state;
      elapsed += advanced.seconds;
      seconds += advanced.seconds;
      if (advanced.seconds < 1e-8) {
        reason = "reserve";
        break;
      }
    }
    rows.push({
      name: String(stage.name || '').slice(0, 60),
      seconds: elapsed,
      wh: state.outputWh - start,
      soc: state.soc,
      temperature: state.temperature,
      watts,
      reason,
      distanceM: stage.speed * elapsed
    });
    if (reason !== 'complete') break;
  }
  return {
    rows,
    seconds,
    wh: state.outputWh,
    soc: state.soc,
    temperature: state.temperature,
    complete: rows.length === stages.length && rows.every(r => r.reason === 'complete')
  };
}
export function scenarioSweep(p) {
  return [0, 5, 10, 15, 20].map(wind => {
    const r = calculate({
      ...p,
      windSpeed: wind
    });
    return {
      wind,
      watts: r.electricalPower,
      reserve: r.reserve,
      minutes: r.flightMinutes,
      feasible: r.feasible
    };
  });
}
export function csvText(rows) {
  return '\ufeff' + rows.map(row => row.map(v => {
    let s = String(v ?? '');
    if (/^[=+@\-]/.test(s) && typeof v !== 'number') s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
