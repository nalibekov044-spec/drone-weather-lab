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
// Conditions of one mission stage: airspeed is ground speed plus headwind.
function stageConditions(p, stage) {
  const q = {
    ...p,
    altitude: stage.altitude,
    windSpeed: stage.wind + stage.speed
  };
  if (p.temperatureMode === 'standard') q.temperature = 15 - .0065 * stage.altitude;
  return q;
}

// Integrates constant-demand flight in one set of conditions until the time budget, the reserve or a model limit.
// The arithmetic is the 0.91 stage loop; `onStep` only observes the state after each step.
function flyConditions(p, q, start, budgetSeconds, onStep) {
  let state = start,
    elapsed = 0,
    reason = 'complete',
    watts = 0,
    motorLoad = 0;
  while (elapsed < budgetSeconds) {
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
    // 0.93: hover input power per motor relative to its rating; above 100% the motors overheat over time.
    motorLoad = Math.max(motorLoad, result.requiredPowerLoad);
    const c = batteryCircuit(q, state, watts);
    if (!c.feasible || !c.controllerPowered) {
      reason = 'power-limit';
      break;
    }
    const toReserve = (state.soc - (p.reserveCharge ?? 15)) / 100 * c.capacityAh * 3600 / Math.max(1e-9, c
      .current);
    const dt = Math.min(2, budgetSeconds - elapsed, toReserve);
    if (dt <= 1e-7) {
      reason = 'reserve';
      break;
    }
    const advanced = dischargeStep(state, q, watts, q.windSpeed, result.density, dt, p.reserveCharge ?? 15);
    state = advanced.state;
    elapsed += advanced.seconds;
    if (advanced.seconds < 1e-8) {
      reason = "reserve";
      break;
    }
    onStep?.(state, elapsed);
  }
  return {
    state,
    elapsed,
    reason,
    watts,
    motorLoad
  };
}

export function missionForecast(p, stages, options = {}) {
  validateMissionStages(stages);
  let state = initialBattery(p),
    seconds = 0;
  const rows = [],
    trace = [{
      seconds: 0,
      soc: state.soc,
      stage: 0
    }];
  for (const [index, stage] of stages.entries()) {
    finite(stage.minutes, .1, 120, 'duration');
    finite(stage.speed, 0, 40, 'speed');
    finite(stage.altitude, 0, 5000, 'altitude');
    finite(stage.wind, 0, 40, 'wind');
    const q = stageConditions(p, stage);
    const start = state.outputWh,
      offset = seconds;
    const run = flyConditions(p, q, state, stage.minutes * 60, (s, elapsed) => trace.push({
      seconds: offset + elapsed,
      soc: s.soc,
      stage: index
    }));
    state = run.state;
    seconds += run.elapsed;
    rows.push({
      name: String(stage.name || '').slice(0, 60),
      seconds: run.elapsed,
      wh: state.outputWh - start,
      soc: state.soc,
      temperature: state.temperature,
      watts: run.watts,
      reason: run.reason,
      distanceM: stage.speed * run.elapsed,
      motorLoad: run.motorLoad
    });
    if (run.reason !== 'complete') break;
  }
  const complete = rows.length === stages.length && rows.every(r => r.reason === 'complete');
  // 0.92: how long the drone could continue in the conditions of the last stage before the planned reserve.
  let margin = null;
  if (complete && options.margin !== false) {
    const last = stages.at(-1),
      extra = [],
      run = flyConditions(p, stageConditions(p, last), state, (options.marginMinutes ?? 120) * 60, (s,
        elapsed) => extra.push({
        seconds: seconds + elapsed,
        soc: s.soc
      }));
    margin = {
      seconds: run.elapsed,
      reason: run.reason,
      soc: run.state.soc,
      trace: extra
    };
  }
  return {
    rows,
    seconds,
    wh: state.outputWh,
    soc: state.soc,
    temperature: state.temperature,
    complete,
    distanceM: rows.reduce((sum, r) => sum + r.distanceM, 0),
    motorLoad: Math.max(0, ...rows.map(r => r.motorLoad)),
    trace,
    margin
  };
}

// 0.92: hover feasibility versus altitude. Pressure always follows the barometric formula here;
// temperature follows the standard atmosphere or stays as configured.
const ceilingLimits = r => !r.battery.controllerPowered ? 'controller' : !r.thrustFeasible ? 'thrust' : !r
  .powerFeasible ? 'power' : !r.tiltFeasible ? 'tilt' : !r.batteryFeasible ? 'battery' : r.verticalDemand < 0 ?
  'updraft' : r.feasible ? 'none' : 'other';
export function altitudeEnvelope(p, options = {}) {
  const maxAltitude = finite(options.maxAltitude ?? 6000, 500, 8000, 'maximum altitude'),
    step = finite(options.step ?? 500, 50, 2000, 'altitude step'),
    margin = finite(options.reserveMargin ?? 30, 0, 300, 'reserve margin'),
    standard = (options.temperature ?? 'standard') === 'standard';
  const at = altitude => {
    const q = {
      ...p,
      altitude,
      pressureMode: 'auto'
    };
    if (standard) q.temperatureMode = 'standard';
    else if (q.temperatureMode === 'standard') q.temperature = 15 - .0065 * altitude;
    const r = calculate(q);
    return {
      altitude,
      temperature: q.temperatureMode === 'standard' ? 15 - .0065 * altitude : q.temperature,
      density: r.density,
      pressureHpa: r.pressure / 100,
      watts: r.electricalPower,
      reserve: r.reserve,
      minutes: r.flightMinutes,
      hoverRpm: r.hoverRpm,
      feasible: r.feasible,
      motorLoad: r.requiredPowerLoad,
      overload: r.motorOverload,
      limit: ceilingLimits(r)
    };
  };
  // Scan finely, then bisect the first transition: feasibility need not be monotonic in every setting.
  const ceiling = test => {
    let previous = at(0);
    if (!test(previous)) return {
      altitude: 0,
      below: true,
      limit: previous.limit === 'none' ? 'margin' : previous.limit
    };
    const scan = Math.min(25, step);
    for (let h = scan; h <= maxAltitude + 1e-9; h += scan) {
      const current = at(Math.min(h, maxAltitude));
      if (!test(current)) {
        let low = previous.altitude,
          high = current.altitude;
        for (let i = 0; i < 24; i++) {
          const mid = (low + high) / 2;
          if (test(at(mid))) low = mid;
          else high = mid;
        }
        const limit = at(high);
        return {
          altitude: low,
          below: false,
          limit: limit.limit === 'none' ? 'margin' : limit.limit
        };
      }
      previous = current;
    }
    return {
      altitude: maxAltitude,
      above: true,
      limit: 'none'
    };
  };
  const rows = [];
  for (let h = 0; h <= maxAltitude + 1e-9; h += step) rows.push(at(Math.min(h, maxAltitude)));
  return {
    rows,
    hover: ceiling(r => r.feasible),
    margin: ceiling(r => r.feasible && r.reserve >= margin),
    reserveMargin: margin,
    maxAltitude,
    temperature: standard ? 'standard' : 'settings'
  };
}

// 0.92: thrust share of each motor needed to hold a horizontal centre-of-gravity offset.
// Solves the minimum-norm mixer: total thrust = weight, roll and pitch moments cancel the offset,
// yaw torque stays zero (rotor torque is proportional to thrust in this model). 1 = average motor.
export function cgMotorLoads(cg, positions) {
  if (!Array.isArray(cg) || cg.length !== 2 || !cg.every(Number.isFinite)) throw Error('centre of gravity');
  if (!Array.isArray(positions) || positions.length < 3) throw Error('rotor positions');
  const n = positions.length,
    rows = [positions.map(() => 1), positions.map(r => r.x), positions.map(r => r.y)];
  if (n >= 4) rows.push(positions.map((_, i) => i % 2 ? -1 : 1));
  const target = [n, n * cg[0], n * cg[1], 0].slice(0, rows.length);
  const m = rows.length,
    gram = rows.map(a => rows.map(b => a.reduce((sum, v, i) => sum + v * b[i], 0)));
  // Gaussian elimination with partial pivoting on the small m × m system.
  const aug = gram.map((row, i) => [...row, target[i]]);
  for (let c = 0; c < m; c++) {
    let pivot = c;
    for (let r = c + 1; r < m; r++)
      if (Math.abs(aug[r][c]) > Math.abs(aug[pivot][c])) pivot = r;
    if (Math.abs(aug[pivot][c]) < 1e-12) throw Error('rotor layout');
    [aug[c], aug[pivot]] = [aug[pivot], aug[c]];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = aug[r][c] / aug[c][c];
      for (let k = c; k <= m; k++) aug[r][k] -= f * aug[c][k];
    }
  }
  const lambda = aug.map((row, i) => row[m] / row[i]);
  const shares = positions.map((_, i) => rows.reduce((sum, row, j) => sum + row[i] * lambda[j], 0));
  return {
    offset: Math.hypot(cg[0], cg[1]),
    shares,
    max: Math.max(...shares),
    min: Math.min(...shares)
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

// 0.93.1: the same mixer with motor limits. caps[i] is the largest share motor i can give
// (available thrust / average need); a failed motor has cap 0. Active-set loop: solve on the free motors,
// clamp the worst violator to 0 or its cap, repeat. With too few free motors the solve becomes weighted
// least squares that keeps roll and pitch first (weight 10), then lift (1), and gives up yaw first (0.1),
// as flight controllers do under saturation: the drone keeps its attitude and loses height or spins. Residuals are what the motors cannot deliver.
export function cgAllocation(cg, positions, caps, weight) {
  if (!Array.isArray(cg) || cg.length !== 2 || !cg.every(Number.isFinite)) throw Error('centre of gravity');
  const n = positions.length;
  if (n < 3 || !Array.isArray(caps) || caps.length !== n || !caps.every(c => Number.isFinite(c) && c >= 0)) throw Error('motor limits');
  const R = Math.max(...positions.map(r => Math.hypot(r.x, r.y)), 1e-6);
  const rows = [positions.map(() => 1), positions.map(r => r.x / R), positions.map(r => r.y / R)],
    target = [n, n * cg[0] / R, n * cg[1] / R],
    weights = [1, 10, 10];
  if (n >= 4) {
    rows.push(positions.map((_, i) => i % 2 ? -1 : 1));
    target.push(0);
    weights.push(.1);
  }
  const solve = (matrix, rhs) => {
    const m = rhs.length, aug = matrix.map((row, i) => [...row, rhs[i]]);
    for (let c = 0; c < m; c++) {
      let pivot = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(aug[r][c]) > Math.abs(aug[pivot][c])) pivot = r;
      [aug[c], aug[pivot]] = [aug[pivot], aug[c]];
      for (let r = 0; r < m; r++) {
        if (r === c) continue;
        const f = aug[r][c] / aug[c][c];
        for (let k = c; k <= m; k++) aug[r][k] -= f * aug[c][k];
      }
    }
    return aug.map((row, i) => row[m] / row[i]);
  };
  const fixed = new Map();
  let shares = Array(n).fill(0);
  for (let iteration = 0; iteration <= n; iteration++) {
    const free = [...Array(n).keys()].filter(i => !fixed.has(i));
    const rhs = target.map((t, k) => t - [...fixed].reduce((s, [i, v]) => s + rows[k][i] * v, 0));
    // (AᵀWA + εI) x = AᵀW b on the free motors; ε is tiny, so an underdetermined case gives the minimum-norm mixer.
    const normal = free.map(a => free.map(b => rows.reduce((s, row, k) => s + weights[k] * row[a] * row[b], 0) + (a === b ? 1e-12 : 0))),
      right = free.map(a => rows.reduce((s, row, k) => s + weights[k] * row[a] * rhs[k], 0));
    const x = free.length ? solve(normal, right) : [];
    shares = [...Array(n).keys()].map(i => fixed.has(i) ? fixed.get(i) : x[free.indexOf(i)]);
    let worst = -1, excess = 1e-9;
    for (const i of free) {
      const over = shares[i] < 0 ? -shares[i] : shares[i] - caps[i];
      if (over > excess) {
        excess = over;
        worst = i;
      }
    }
    if (worst < 0) break;
    fixed.set(worst, shares[worst] < 0 ? 0 : caps[worst]);
  }
  shares = shares.map((s, i) => Math.min(caps[i], Math.max(0, s)));
  const average = weight / n,
    momentX = shares.reduce((s, v, i) => s + v * positions[i].x, 0) - n * cg[0],
    momentY = shares.reduce((s, v, i) => s + v * positions[i].y, 0) - n * cg[1];
  return {
    shares,
    saturated: [...fixed.keys()].sort((a, b) => a - b),
    thrustError: shares.reduce((s, v) => s + v, 0) / n - 1,
    momentResidual: Math.hypot(momentX, momentY) * average,
    yawError: n >= 4 ? shares.reduce((s, v, i) => s + (i % 2 ? -v : v), 0) / n : 0
  };
}
