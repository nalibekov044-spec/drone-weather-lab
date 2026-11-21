const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Educational model without motor-specific thermal calibration.
// 0.93: share of the normal efficiency left when the magnets are hot (95 °C → 100%, 220 °C and above → 75%).
// A hot motor is not throttled: it keeps drawing power, makes less torque and heats faster.
export function thermalAvailability(temperature) {
  return clamp(1 - Math.max(0, temperature - 95) / 125 * 0.25, 0.75, 1);
}

// 0.94: thermal resistance from the winding to the air, from the continuous rating: at the rated input power
// with about 85% efficiency (15% losses) the winding settles 65 °C above the air, as in the 0.93 calibration.
export function motorThermalResistance(parameters) {
  return 65 / (0.15 * Math.max(1, parameters.motorMaxPower ?? 420));
}
export function motorCooling(parameters, windNow) {
  return 1 + Math.max(0, windNow) * 0.035 + Math.max(0, parameters.rainRate) * 0.003;
}
// Temperature the winding approaches with these losses (datasheet model) or this load ratio (rated model).
export function motorTargetTemperature(parameters, ratio, lossScale, lossWatts, windNow, fire = 0) {
  const cooling = motorCooling(parameters, windNow);
  const rise = Number.isFinite(lossWatts) && parameters.motorModel === "datasheet" ? Math.max(0, lossWatts) *
    motorThermalResistance(parameters) : (20 * ratio + 45 * ratio * ratio) * lossScale;
  return parameters.temperature + rise / cooling + fire * 80;
}

export function stepMotorThermals(system, parameters, result, windNow, dt) {
  const next = { temperatures: [], healths: [], fires: [], loads: [], exposure: [], ignition: [] };
  const cooling = motorCooling(parameters, windNow);
  for (let i = 0; i < result.effectiveRpms.length; i++) {
    const health = system.healths[i] ?? 1;
    const temperature = system.temperatures[i] ?? parameters.temperature;
    const fire = system.fires[i] ?? 0;
    const load = Math.max(0, result.motorLoadPercents?.[i] ?? result.powerLoad ?? 0);
    const active = health > 0.02 && result.effectiveRpms[i] > 1;
    const appliedLoad = result.motorThermalLoadPercents?.[i] ?? load;
    const ratio = active ? clamp(appliedLoad / 100, 0, 3) : 0;
    // Exact exponential solution of dT/dt = (target - T)/tau.
    // Losses follow the motor's present efficiency: weakened magnets and damage turn more input into heat.
    const efficiency = result.motorEfficiencies?.[i] ?? parameters.motorEfficiency / 100;
    const lossScale = clamp((100 - efficiency * 100) / 12, 0.3, 4);
    // 0.93 calibration: at the rated power (ratio 1) a motor without wind settles about 65 °C above the air,
    // the usual meaning of a continuous rating. Copper losses grow with current², so overload heats fast.
    // 0.94: the datasheet model passes the real losses (copper I²R + iron I0·E) in watts.
    const target = motorTargetTemperature(parameters, ratio, lossScale, active ? result.motorLossWatts?.[i] : 0,
      windNow, fire);
    const tau = 42 / cooling;
    const temp = clamp(temperature + (target - temperature) * (1 - Math.exp(-dt / tau)), parameters.temperature, 320);
    const exposure = Math.max(0, (system.exposure?.[i] || 0) + (ratio > 1 ? ratio * ratio - 1 : -0.6) * dt);
    const stress = Math.max(0, exposure - 25) / 80000;
    const heatDamage = Math.max(0, temp - 110) ** 2 / 500000;
    const remaining = clamp(health - (stress + heatDamage + fire * 0.012) * dt, 0, 1);
    // 0.93: hot insulation keeps burning after the winding fails; it goes out only when it cools below 175 °C.
    const ignition = Math.max(0, (system.ignition?.[i] || 0) + (temp > 175 ? (temp - 175) / 35 : -1.5) * dt);
    const nextFire = ignition > 12 ? clamp(fire + dt * 0.065, 0, 1) : Math.max(0, fire - dt * 0.04);
    next.temperatures.push(temp); next.healths.push(remaining); next.fires.push(nextFire);
    next.loads.push(load); next.exposure.push(exposure); next.ignition.push(ignition);
  }
  return next;
}
