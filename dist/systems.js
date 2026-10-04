const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Educational model without motor-specific thermal calibration.
export function thermalAvailability(temperature) {
  return clamp(1 - Math.max(0, temperature - 95) / 150, 0.25, 1);
}

export function stepMotorThermals(system, parameters, result, windNow, dt) {
  const next = { temperatures: [], healths: [], fires: [], loads: [], exposure: [], ignition: [] };
  const cooling = 1 + Math.max(0, windNow) * 0.035 + Math.max(0, parameters.rainRate) * 0.003;
  for (let i = 0; i < result.effectiveRpms.length; i++) {
    const health = system.healths[i] ?? 1;
    const temperature = system.temperatures[i] ?? parameters.temperature;
    const fire = system.fires[i] ?? 0;
    const load = Math.max(0, result.motorLoadPercents?.[i] ?? result.powerLoad ?? 0);
    const active = health > 0.02 && result.effectiveRpms[i] > 1;
    const ratio = active ? clamp(load / 100, 0, 3) : 0;
    // Exact exponential solution of dT/dt = (target - T)/tau.
    const lossScale = clamp((100 - parameters.motorEfficiency) / 12, 0.3, 3);
    const target = parameters.temperature + (12 * ratio + 34 * ratio * ratio) * lossScale / cooling + fire * 80;
    const tau = 42 / cooling;
    const temp = clamp(temperature + (target - temperature) * (1 - Math.exp(-dt / tau)), parameters.temperature, 320);
    const exposure = Math.max(0, (system.exposure?.[i] || 0) + (ratio > 1 ? ratio * ratio - 1 : -0.6) * dt);
    const stress = Math.max(0, exposure - 25) / 80000;
    const heatDamage = Math.max(0, temp - 110) ** 2 / 500000;
    const remaining = clamp(health - (stress + heatDamage + fire * 0.012) * dt, 0, 1);
    const ignition = Math.max(0, (system.ignition?.[i] || 0) + (active && temp > 175 && ratio > 1.15 ? (temp - 175) / 35 : -1.5) * dt);
    const nextFire = ignition > 12 && active ? clamp(fire + dt * 0.065, 0, 1) : Math.max(0, fire - dt * 0.04);
    next.temperatures.push(temp); next.healths.push(remaining); next.fires.push(nextFire);
    next.loads.push(load); next.exposure.push(exposure); next.ignition.push(ignition);
  }
  return next;
}
