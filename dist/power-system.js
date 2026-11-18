const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const curves = {
  lipo: { nominal: 3.7, points: [[0, 3.2], [0.1, 3.5], [0.2, 3.65], [0.5, 3.8], [0.8, 4.0], [1, 4.2]] },
  lion: { nominal: 3.6, points: [[0, 2.9], [0.1, 3.3], [0.2, 3.5], [0.5, 3.65], [0.8, 3.95], [1, 4.2]] }
};

export function batterySeries(p) {
  const nominal = (curves[p.batteryChemistry] || curves.lipo).nominal;
  return clamp(Math.round(Number(p.batteryCells) > 0 ? Number(p.batteryCells) : p.voltage / nominal), 1, 16);
}

export function initialBattery(p) {
  return { soc: p.stateOfCharge, temperature: p.batteryTemp, polarization: 0, usedAh: 0, outputWh: 0, heatWh: 0, sourceWh: 0 };
}

export function openCircuitCellVoltage(soc, chemistry = "lipo") {
  const { points } = curves[chemistry] || curves.lipo;
  const s = clamp(soc / 100, 0, 1);
  for (let i = 1; i < points.length; i++) {
    const [x, v] = points[i], [previous, voltage] = points[i - 1];
    if (s <= x) return voltage + (v - voltage) * (s - previous) / (x - previous);
  }
  return points.at(-1)[1];
}

export function batteryCircuit(p, state = initialBattery(p), requestedPower = 0) {
  const chemistry = curves[p.batteryChemistry] || curves.lipo;
  const seriesScale = batterySeries(p);
  const capacityAh = p.capacity / 1000 * clamp((p.batteryHealth ?? 100) / 100, 0.1, 1);
  const openVoltage = seriesScale * openCircuitCellVoltage(state.soc, p.batteryChemistry);
  const coldFactor = Math.exp(clamp((20 - state.temperature) * 0.025, -0.35, 1.5));
  const resistance = Math.max(0, p.batteryResistance) * coldFactor * (2 - clamp((p.batteryHealth ?? 100) / 100, 0.1, 1));
  const polarizationResistance = resistance * 0.35;
  const polarization = Math.max(0, state.polarization || 0);
  const sourceVoltage = Math.max(0, openVoltage - polarization);
  const cutoffVoltage = seriesScale * (p.cellCutoff ?? 3.2);
  const currentRating = capacityAh * p.batteryCRating;
  let currentLimit = Math.max(0, currentRating);
  if (resistance > 1e-12) currentLimit = Math.min(currentLimit, sourceVoltage / (2 * resistance), Math.max(0, (sourceVoltage - cutoffVoltage) / resistance));
  if (state.soc <= 0 || state.temperature >= 75 || sourceVoltage <= cutoffVoltage) currentLimit = 0;
  const maximumPower = Math.max(0, currentLimit * (sourceVoltage - resistance * currentLimit));
  const deliveredPower = Math.min(Math.max(0, requestedPower), maximumPower);
  const root = Math.sqrt(Math.max(0, sourceVoltage ** 2 - 4 * resistance * deliveredPower));
  const current = deliveredPower > 0 ? 2 * deliveredPower / Math.max(1e-9, sourceVoltage + root) : 0;
  const terminalVoltage = Math.max(0, sourceVoltage - resistance * current);
  const heat = current * current * resistance + (polarizationResistance > 0 ? polarization * polarization / polarizationResistance : 0);
  return {
    openVoltage, sourceVoltage, terminalVoltage, current, currentLimit, currentRating, maximumPower, deliveredPower,
    requestedPower, resistance, polarizationResistance, cutoffVoltage, capacityAh, heat,
    ohmicHeat: current * current * resistance, polarizationHeat: polarizationResistance > 0 ? polarization * polarization / polarizationResistance : 0,
    cells: seriesScale, nominalVoltage: seriesScale * chemistry.nominal, voltageSag: openVoltage - terminalVoltage,
    feasible: requestedPower <= maximumPower + 1e-6 && state.soc > 0 && terminalVoltage >= cutoffVoltage - 1e-6,
    controllerPowered: state.soc > 0 && maximumPower >= (p.avionicsPower ?? 18) && terminalVoltage >= (p.controllerCutoff ?? 6)
  };
}

// Exact RC and thermal integration for frozen current, OCV and resistance during a step.
// Flight uses 1/60 s; forecasts compare smaller steps to bound this approximation.
export function stepBattery(state, p, circuit, wind, density, dt) {
  if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid battery time step");
  if (dt === 0) return { ...state };
  const capacity = Math.max(1e-9, circuit.capacityAh);
  const current = Math.max(0, circuit.current);
  const activeDt = current > 0 ? Math.min(dt, Math.max(0, state.soc) / 100 * capacity * 3600 / current) : dt;
  const inactiveDt = dt - activeDt;
  const conductance = (0.8 + Math.max(0, wind) * 0.12) * Math.sqrt(Math.max(0.1, density / 1.225));
  const heatCapacity = Math.max(0.05, p.batteryMass ?? 0.8) * 900;
  const k = conductance / heatCapacity, tau = 20, rp = circuit.polarizationResistance;
  let polarization = Math.max(0, state.polarization || 0), temperature = state.temperature;
  let heatJ = 0, outputJ = 0;
  const exactLosses = Number.isFinite(circuit.ohmicHeat);
  const integrate = (seconds, amps) => {
    if (seconds <= 0) return;
    const decay = Math.exp(-seconds / tau), target = amps * rp, transient = polarization - target;
    const integral = rate => -Math.expm1(-rate * seconds) / rate;
    const convolution = rate => Math.abs(k - rate) < 1e-12 ? seconds * Math.exp(-k * seconds) : (Math.exp(-rate * seconds) - Math.exp(-k * seconds)) / (k - rate);
    const h0 = exactLosses ? amps * amps * (circuit.resistance + rp) : amps > 0 || current === 0 ? circuit.heat : 0;
    const h1 = exactLosses && rp > 0 ? 2 * amps * transient : 0;
    const h2 = exactLosses && rp > 0 ? transient * transient / rp : 0;
    temperature = p.temperature + (temperature - p.temperature) * Math.exp(-k * seconds)
      + (h0 * convolution(0) + h1 * convolution(1 / tau) + h2 * convolution(2 / tau)) / heatCapacity;
    heatJ += h0 * seconds + h1 * integral(1 / tau) + h2 * integral(2 / tau);
    if (exactLosses) outputJ += amps * ((circuit.openVoltage - amps * circuit.resistance - target) * seconds - transient * integral(1 / tau));
    else if (amps > 0) outputJ += circuit.deliveredPower * seconds;
    polarization = exactLosses && rp === 0 ? 0 : target + transient * decay;
  };
  integrate(activeDt, current); integrate(inactiveDt, 0);
  const usedAh = Math.min(Math.max(0, state.soc) / 100 * capacity, current * activeDt / 3600);
  return {
    soc: Math.max(0, state.soc - usedAh / capacity * 100), temperature, polarization,
    usedAh: (state.usedAh || 0) + usedAh, outputWh: (state.outputWh || 0) + Math.max(0, outputJ) / 3600,
    heatWh: (state.heatWh || 0) + Math.max(0, heatJ) / 3600,
    sourceWh: (state.sourceWh || 0) + (Number.isFinite(circuit.openVoltage) ? current * circuit.openVoltage * activeDt / 3600 : outputJ / 3600 + heatJ / 3600)
  };
}

export function escAvailability(temperature) {
  return clamp((135 - temperature) / 40, 0, 1);
}

export function stepESC(temperatures, p, motorPowers, voltage, wind, density, dt) {
  const efficiency = clamp((p.escEfficiency ?? 97) / 100, 0.5, 1);
  const conductance = (0.35 + Math.max(0, wind) * 0.025) * Math.sqrt(Math.max(0.1, density / 1.225));
  return motorPowers.map((power, i) => {
    const loss = Math.max(0, power) * (1 / efficiency - 1);
    const target = p.temperature + loss / conductance;
    return target + ((temperatures[i] ?? p.temperature) - target) * Math.exp(-dt * conductance / 18);
  });
}

// Constant electrical demand; integrates SOC, polarization and cooling until the first limit.
// This is a forecast of this battery model, not a manufacturer endurance rating.
export function forecastBattery(p, start, watts, wind = 0, density = 1.225, options = {}) {
  let state = { ...start }, seconds = 0;
  const reserve = clamp(p.reserveCharge ?? 15, 0, 100);
  const dt = options.dt ?? 2, maximumSeconds = options.maximumSeconds ?? 21600;
  if (!(Number.isFinite(dt) && Number.isFinite(maximumSeconds) && dt > 0 && maximumSeconds >= 0 && Number.isFinite(watts) && watts >= 0)) throw new Error("Invalid battery forecast parameters");
  let reason = "time-limit", finalCircuit = batteryCircuit(p, state, watts);
  while (seconds < maximumSeconds) {
    finalCircuit = batteryCircuit(p, state, watts);
    if (state.soc <= reserve + 1e-9) { reason = "reserve"; break; }
    if (!finalCircuit.controllerPowered || !finalCircuit.feasible) {
      reason = state.temperature >= 75 ? "temperature" : finalCircuit.sourceVoltage <= finalCircuit.cutoffVoltage ? "cutoff" : "power-limit";
      break;
    }
    const toReserve = finalCircuit.current > 0 ? (state.soc - reserve) / 100 * finalCircuit.capacityAh * 3600 / finalCircuit.current : Infinity;
    const step = Math.min(dt, maximumSeconds - seconds, toReserve);
    state = stepBattery(state, p, finalCircuit, wind, density, step);
    seconds += step;
  }
  if (state.soc <= reserve + 1e-9) reason = "reserve";
  finalCircuit = batteryCircuit(p, state, watts);
  return { seconds, minutes: seconds / 60, reason, finalState: { ...state }, finalSoc: state.soc, finalTemperature: state.temperature, deliveredWh: state.outputWh - (start.outputWh || 0), circuit: finalCircuit };
}

export function powerBudget(circuit, motorInputs, efficiencies, escEfficiency, avionicsDemand) {
  const eta = clamp(escEfficiency, 0.5, 1), delivered = circuit.deliveredPower;
  const avionics = Math.min(Math.max(0, avionicsDemand), delivered);
  const requestedMotorBus = motorInputs.reduce((sum,v)=>sum+Math.max(0,v),0)/eta;
  const scale = requestedMotorBus > 0 ? Math.min(1, Math.max(0, delivered-avionics)/requestedMotorBus) : 0;
  const motors = motorInputs.reduce((sum,v)=>sum+Math.max(0,v)*scale,0);
  const shaft = motorInputs.reduce((sum,v,i)=>sum+Math.max(0,v)*scale*clamp(efficiencies[i]??1,0,1),0);
  const esc = motors*(1/eta-1), motorHeat=motors-shaft;
  const chemical = circuit.current*circuit.openVoltage;
  const polarizationPower = circuit.current*(circuit.openVoltage-circuit.sourceVoltage);
  const rcStorage = polarizationPower-(circuit.polarizationHeat||0);
  const unassigned = Math.max(0,delivered-avionics-motors/eta);
  return { chemical, delivered, shaft, motorHeat, esc, avionics, batteryHeat:circuit.heat, rcStorage, unassigned,
    balanceError:chemical-shaft-motorHeat-esc-avionics-circuit.heat-rcStorage-unassigned };
}
