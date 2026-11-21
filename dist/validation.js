// 0.94: checking the model against measurements. Bench tables (RPM, thrust, voltage, current or power) and
// flight logs (time, voltage, current) are read from CSV; the model is evaluated at the measured speeds.
import {
  calculate,
  baseDefaults
} from './physics.js';
import {
  motorSpec,
  motorPoint,
  motorConstants
} from './motor-model.js';

const G = 9.80665;
const INCH = 0.0254;

function splitLine(line, delimiter) {
  const out = [];
  let cell = '',
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      out.push(cell);
      cell = '';
    } else cell += c;
  }
  out.push(cell);
  return out.map(s => s.trim());
}

function toNumber(text, decimalComma) {
  const s = String(text).trim().replace(/\s/g, '');
  if (!s) return NaN;
  return Number(decimalComma ? s.replace(',', '.') : s);
}

// Column roles from header names in English or Russian, with the unit read from the header.
function columnRole(header) {
  const h = header.toLowerCase();
  const unit = (h.match(/\(([^)]*)\)|\[([^\]]*)\]|_(kgf|gf|g|n|lbf|kg|us|ms|s|v|a|w)$/) || []).slice(1).find(Boolean) || '';
  if (/thrust|тяга/.test(h)) {
    const u = unit.trim();
    const factor = /lbf/.test(u) ? 4.4482216 : /^(kgf|kg|кгс|кг)$/.test(u) ? G : /^(n|н|newton)$/.test(u) ? 1 :
      G / 1000;
    return {
      role: 'thrust',
      factor
    };
  }
  if (/rpm|об\/мин|speed|обороты/.test(h) && !/air|ветер|wind/.test(h)) return {
    role: 'rpm',
    factor: 1
  };
  if (/mechanical power|shaft|мощность на валу|мех/.test(h)) return {
    role: 'shaftPower',
    factor: 1
  };
  if (/electrical power|power|мощность|watt|\bw\b/.test(h)) return {
    role: 'electricalPower',
    factor: 1
  };
  if (/time|время|timeus|timems/.test(h)) return {
    role: 'time',
    factor: /us|мкс|timeus/.test(unit + h) ? 1e-6 : /ms|мс|timems/.test(unit + h) ? 1e-3 : 1
  };
  if (/volt|vbat|напряж|\bv\b/.test(h)) return {
    role: 'voltage',
    factor: /mv/.test(unit) ? 1e-3 : 1
  };
  if (/curr|amp|\bток\b|\ba\b/.test(h)) return {
    role: 'current',
    factor: /ma/.test(unit) ? 1e-3 : 1
  };
  return null;
}

export function parseMeasurementCSV(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim() && !/^\s*#/.test(line));
  if (lines.length < 2) throw Error('csv-empty');
  const first = lines[0];
  const delimiter = [';', '\t', ','].reduce((best, d) => first.split(d).length > first.split(best).length ? d : best,
    ',');
  const decimalComma = delimiter !== ',';
  const headers = splitLine(first, delimiter);
  const roles = headers.map(columnRole);
  const index = role => roles.findIndex(r => r?.role === role);
  const has = role => index(role) >= 0;
  const kind = has('rpm') && has('thrust') ? 'bench' : has('time') && has('voltage') && has('current') ? 'log' :
    null;
  if (!kind) throw Error('csv-columns');
  const read = (cells, role) => {
    const i = index(role);
    return i < 0 ? NaN : toNumber(cells[i], decimalComma) * roles[i].factor;
  };
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    if (kind === 'bench') {
      const rpm = read(cells, 'rpm'),
        thrustN = read(cells, 'thrust'),
        voltage = read(cells, 'voltage'),
        current = read(cells, 'current');
      let electricalPower = read(cells, 'electricalPower');
      if (!Number.isFinite(electricalPower) && Number.isFinite(voltage) && Number.isFinite(current))
        electricalPower = voltage * current;
      if (Number.isFinite(rpm) && rpm > 0 && Number.isFinite(thrustN) && thrustN > 0) rows.push({
        rpm,
        thrustN,
        voltage: Number.isFinite(voltage) ? voltage : null,
        current: Number.isFinite(current) ? current : null,
        electricalPower: Number.isFinite(electricalPower) ? electricalPower : null,
        shaftPower: Number.isFinite(read(cells, 'shaftPower')) ? read(cells, 'shaftPower') : null
      });
    } else {
      const time = read(cells, 'time'),
        voltage = read(cells, 'voltage'),
        current = read(cells, 'current');
      if ([time, voltage, current].every(Number.isFinite)) rows.push({
        time,
        voltage,
        current
      });
    }
  }
  if (rows.length < (kind === 'bench' ? 2 : 5)) throw Error('csv-rows');
  if (kind === 'log') {
    const t0 = rows[0].time;
    rows.forEach(r => r.time -= t0);
    rows.sort((a, b) => a.time - b.time);
  }
  return {
    kind,
    rows,
    columns: headers.filter((_, i) => roles[i])
  };
}

// Propeller and motor of a bench setup; air from the setup or from the current weather.
function benchParameters(p, setup = {}) {
  return {
    ...baseDefaults,
    ...p,
    ...setup,
    rpm: 1000,
    windSpeed: 0,
    gusts: 0,
    verticalWind: 0,
    rainRate: 0,
    icing: 'none'
  };
}

function shaftFromElectrical(q, rpm, electricalPower, voltage) {
  const esc = Math.min(1, Math.max(0.5, q.escEfficiency / 100));
  const motorInput = electricalPower * esc;
  if (q.motorModel !== 'datasheet') return motorInput * Math.min(0.98, Math.max(0.35, q.motorEfficiency / 100));
  // Invert the datasheet model at the measured speed: R·I² + E·I = input, shaft = (I − I0)·E.
  const c = motorConstants(motorSpec(q), 25),
    emf = rpm * Math.PI / 30 / c.kvRad;
  const current = (-emf + Math.sqrt(emf * emf + 4 * c.resistance * motorInput)) / (2 * c.resistance);
  return Math.max(0, (current - c.idleCurrent) * emf);
}

export function compareBench(p, rows, setup = {}) {
  const q = benchParameters(p, setup);
  const r = calculate(q);
  const D = q.diameter * INCH,
    rho = r.density,
    esc = Math.min(1, Math.max(0.5, q.escEfficiency / 100));
  const out = rows.map(row => {
    const n = row.rpm / 60;
    const thrust = r.thrustCoefficient * rho * n * n * D ** 4;
    const shaft = r.powerCoefficient * rho * n ** 3 * D ** 5;
    const input = q.motorModel === 'datasheet' ? motorPoint(motorSpec(q), row.rpm, shaft, 25).input : shaft / Math
      .min(0.98, Math.max(0.35, q.motorEfficiency / 100));
    const electrical = input / esc;
    return {
      ...row,
      modelThrustN: thrust,
      modelElectricalPower: electrical,
      modelShaftPower: shaft,
      thrustError: (thrust / row.thrustN - 1) * 100,
      powerError: row.electricalPower ? (electrical / row.electricalPower - 1) * 100 : null
    };
  });
  const mean = values => values.length ? values.reduce((s, v) => s + Math.abs(v), 0) / values.length : null;
  return {
    rows: out,
    density: rho,
    thrustMAE: mean(out.map(r => r.thrustError)),
    powerMAE: mean(out.filter(r => r.powerError !== null).map(r => r.powerError)),
    motorModel: q.motorModel
  };
}

// Least squares through the origin: T = Ct·ρ·n²·D⁴ and P = Cp·ρ·n³·D⁵ over all rows.
export function fitPropeller(p, rows, setup = {}) {
  const q = benchParameters(p, setup);
  const rho = calculate(q).density,
    D = q.diameter * INCH;
  const xs = rows.map(r => r.rpm / 60);
  const ct = rows.reduce((s, r, i) => s + r.thrustN * xs[i] ** 2, 0) / rows.reduce((s, r, i) => s + xs[i] ** 4, 0) /
    (rho * D ** 4);
  const powered = rows.map((r, i) => ({
    n: xs[i],
    shaft: r.shaftPower ?? (r.electricalPower ? shaftFromElectrical(q, r.rpm, r.electricalPower, r.voltage) : null)
  })).filter(r => Number.isFinite(r.shaft) && r.shaft > 0);
  const cp = powered.length ? powered.reduce((s, r) => s + r.shaft * r.n ** 3, 0) / powered.reduce((s, r) => s + r
    .n ** 6, 0) / (rho * D ** 5) : null;
  const r2 = (values, model) => {
    const m = values.reduce((s, v) => s + v, 0) / values.length;
    const total = values.reduce((s, v) => s + (v - m) ** 2, 0),
      residual = values.reduce((s, v, i) => s + (v - model[i]) ** 2, 0);
    return total > 0 ? 1 - residual / total : 1;
  };
  return {
    ct,
    cp,
    density: rho,
    thrustR2: r2(rows.map(r => r.thrustN), xs.map(n => ct * rho * n * n * D ** 4)),
    powerR2: cp ? r2(powered.map(r => r.shaft), powered.map(r => cp * rho * r.n ** 3 * D ** 5)) : null,
    shaftMeasured: rows.some(r => r.shaftPower !== null),
    figureOfMerit: cp ? ct ** 1.5 / (cp * Math.sqrt(Math.PI / 2)) : null
  };
}

// Average electrical power of a flight log against the model's hover power for the current drone and weather.
export function compareFlightLog(p, rows) {
  const powered = rows.filter(r => r.current > 0.5);
  if (powered.length < 3) throw Error('log-idle');
  let energyJ = 0,
    duration = 0;
  for (let i = 1; i < rows.length; i++) {
    const dt = rows[i].time - rows[i - 1].time;
    if (!(dt > 0) || dt > 5 || rows[i].current <= 0.5) continue;
    energyJ += (rows[i].voltage * rows[i].current + rows[i - 1].voltage * rows[i - 1].current) / 2 * dt;
    duration += dt;
  }
  if (!(duration > 0)) throw Error('log-time');
  const averagePower = energyJ / duration;
  const model = calculate({
    ...baseDefaults,
    ...p
  });
  const step = Math.max(1, Math.ceil(rows.length / 400));
  return {
    averagePower,
    energyWh: energyJ / 3600,
    duration,
    chargeAh: rows.reduce((s, r, i) => {
      const dt = i ? r.time - rows[i - 1].time : 0;
      return dt > 0 && dt <= 5 ? s + r.current * dt / 3600 : s;
    }, 0),
    averageVoltage: powered.reduce((s, r) => s + r.voltage, 0) / powered.length,
    modelPower: model.electricalPower,
    difference: (model.electricalPower / averagePower - 1) * 100,
    series: rows.filter((_, i) => i % step === 0).map(r => ({
      time: r.time,
      power: r.voltage * r.current
    }))
  };
}
