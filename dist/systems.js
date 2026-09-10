const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function stepMotorThermals(system, parameters, result, windNow, dt) {
  const count = result.effectiveRpms.length;
  const averageRpm = result.effectiveRpms.reduce((sum, rpm) => sum + rpm, 0) / Math.max(1, count);
  const cooling = 1 + windNow * 0.055 + parameters.rainRate * 0.006;
  const temperatures = Array.from({ length: count }, (_, index) => system.temperatures[index] ?? Math.max(parameters.temperature, 20));
  const healths = Array.from({ length: count }, (_, index) => system.healths[index] ?? 1);
  const fires = Array.from({ length: count }, (_, index) => system.fires[index] ?? 0);
  const loads = [];

  const nextTemperatures = temperatures.map((temperature, index) => {
    const rpmBias = averageRpm > 1 ? (result.effectiveRpms[index] / averageRpm) ** 3 : 1;
    const manufacturingTolerance = 1 + (index - (count - 1) / 2) * 0.018;
    const electricalLoad = result.motorLoadPercents?.[index] ?? result.powerLoad * rpmBias;
    const load = Math.max(0, electricalLoad * manufacturingTolerance);
    loads[index] = load;
    const target = Math.min(260, parameters.temperature + 20 + Math.max(0, load - 32) * 0.86 + fires[index] * 75);
    const timeConstant = Math.max(2.8, (load > 100 ? 6 : 18) / cooling);
    return Math.max(parameters.temperature, temperature + (target - temperature) * dt / timeConstant);
  });

  const nextHealths = healths.map((health, index) => {
    const loadDamage = Math.max(0, loads[index] - 145) * dt / 12000;
    const heatDamage = Math.max(0, nextTemperatures[index] - 102) * dt / 3200;
    const fireDamage = fires[index] * dt * 0.024;
    return clamp(health - loadDamage - heatDamage - fireDamage, 0, 1);
  });

  const nextFires = fires.map((fire, index) => {
    const ignition = Math.max(0, nextTemperatures[index] - 148) / 42 + Math.max(0, loads[index] - 220) / 420;
    return ignition > 0 ? clamp(fire + ignition * dt * 0.11, 0, 1) : clamp(fire - dt * 0.018, 0, 1);
  });

  return { temperatures: nextTemperatures, healths: nextHealths, fires: nextFires, loads };
}
