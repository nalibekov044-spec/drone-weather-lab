export const G = 9.80665;
export const INCH = 0.0254;

export const dronePresets = {
  survey: {
    label: "Камерный квадрокоптер", style: "survey", mass: 2.4, payload: 0.7, frameSize: 520, rotors: 4,
    diameter: 15, pitch: 5.2, dragArea: 0.13, dragCoefficient: 0.95, propEfficiency: 86,
    rpm: 4800, maxRpm: 7200, motorMaxPower: 420, motorEfficiency: 88,
    voltage: 22.2, capacity: 10000
  },
  racing: {
    label: "Гоночный FPV", style: "racing", mass: 0.58, payload: 0.04, frameSize: 220, rotors: 4,
    diameter: 5.1, pitch: 4.6, dragArea: 0.026, dragCoefficient: 0.72, propEfficiency: 91,
    rpm: 16800, maxRpm: 23000, motorMaxPower: 780, motorEfficiency: 90,
    voltage: 22.2, capacity: 1300
  },
  industrialHex: {
    label: "Промышленный гексакоптер", style: "industrialHex", mass: 5.2, payload: 1.8, frameSize: 920, rotors: 6,
    diameter: 21, pitch: 7, dragArea: 0.27, dragCoefficient: 1.08, propEfficiency: 84,
    rpm: 3400, maxRpm: 5600, motorMaxPower: 880, motorEfficiency: 87,
    voltage: 44.4, capacity: 16000
  },
  cargoOcto: {
    label: "Грузовой октокоптер", style: "cargoOcto", mass: 11, payload: 6, frameSize: 1450, rotors: 8,
    diameter: 30, pitch: 10, dragArea: 0.58, dragCoefficient: 1.18, propEfficiency: 82,
    rpm: 2400, maxRpm: 3600, motorMaxPower: 1800, motorEfficiency: 86,
    voltage: 51.8, capacity: 28000
  }
};

export const baseDefaults = {
  dronePreset: "survey",
  ...dronePresets.survey,
  windSpeed: 6,
  windDirection: 35,
  gusts: 25,
  gustFrequency: 0.8,
  turbulence: 20,
  verticalWind: 0,
  rainRate: 0,
  temperature: 15,
  altitude: 500,
  humidity: 45,
  pressureMode: "auto",
  pressureHpa: 954,
  icing: "none",
  stateOfCharge: 100,
  batteryTemp: 20,
  payloadX: 0,
  payloadY: 0,
  controlResponse: 0.7,
  maxTilt: 35
};

export const graphVariables = {
  windSpeed: { label: "Скорость ветра", unit: "м/с", min: 0, max: 40, step: 0.5 },
  rpm: { label: "Обороты винтов", unit: "об/мин", min: 1000, max: 24000, step: 100 },
  mass: { label: "Масса корпуса", unit: "кг", min: 0.2, max: 20, step: 0.1 },
  payload: { label: "Полезная нагрузка", unit: "кг", min: 0, max: 15, step: 0.1 },
  diameter: { label: "Диаметр винта", unit: "дюйм", min: 3, max: 32, step: 0.5 },
  motorMaxPower: { label: "Мощность мотора", unit: "Вт", min: 80, max: 2500, step: 20 },
  altitude: { label: "Высота", unit: "м", min: 0, max: 6000, step: 100 },
  temperature: { label: "Температура", unit: "°C", min: -40, max: 55, step: 1 },
  rainRate: { label: "Интенсивность дождя", unit: "мм/ч", min: 0, max: 80, step: 1 }
};

export const graphMetrics = {
  reserve: { label: "Запас тяги", unit: "%", formula: "R = (Tдоступ / Tтреб − 1) · 100%" },
  tilt: { label: "Наклон", unit: "°", formula: "θ = atan(Fветра / Fверт)" },
  flightMinutes: { label: "Время полёта", unit: "мин", formula: "t = Eисп / Pэл" },
  electricalPower: { label: "Мощность", unit: "Вт", formula: "Pэл = ΣCₚρn³D⁵ / η + Pавионики" },
  powerLoad: { label: "Загрузка моторов", unit: "%", formula: "L = max(Pполёт, Pкоманда) / Pдоступ · 100%" },
  rpmPowerLimit: { label: "Доступный RPM", unit: "об/мин", formula: "nmax = 60 · ∛(Pвал / CₚρD⁵)" },
  availableThrust: { label: "Доступная тяга", unit: "Н", formula: "T = Σ Cₜρn²D⁴" },
  windForce: { label: "Сила ветра", unit: "Н", formula: "F = ½ρC𝒹Av²" },
  maxWind: { label: "Предел ветра", unit: "м/с", formula: "vmax = √(2Fгор / ρC𝒹A)" },
  thrustToWeight: { label: "Тяга / вес", unit: "×", formula: "Tдоступ / mg" }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pressureFromAltitude(altitude) {
  return 101325 * Math.pow(Math.max(0.12, 1 - 2.25577e-5 * altitude), 5.25588);
}

export function atmosphere(parameters) {
  const temperatureK = parameters.temperature + 273.15;
  const pressure = parameters.pressureMode === "manual"
    ? parameters.pressureHpa * 100
    : pressureFromAltitude(parameters.altitude);
  const saturationVaporPressure = 610.94 * Math.exp((17.625 * parameters.temperature) / (parameters.temperature + 243.04));
  const vaporPressure = clamp(parameters.humidity / 100 * saturationVaporPressure, 0, pressure * 0.08);
  const dryPressure = pressure - vaporPressure;
  const density = dryPressure / (287.05 * temperatureK) + vaporPressure / (461.495 * temperatureK);
  return { pressure, density, temperatureK, vaporPressure };
}

function icingEfficiency(icing) {
  if (icing === "moderate") return 0.76;
  if (icing === "trace") return 0.91;
  return 1;
}

function batteryTemperatureFactor(tempC) {
  if (tempC < 20) return clamp(1 - (20 - tempC) * 0.006, 0.55, 1);
  if (tempC > 40) return clamp(1 - (tempC - 40) * 0.003, 0.84, 1);
  return 1;
}

export function rotorPositions(count, radius = 1) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count + (count === 4 ? Math.PI / 4 : 0);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, angle };
  });
}

export function calculate(parameters, options = {}) {
  const p = { ...parameters };
  const atmosphereResult = atmosphere(p);
  const rho = atmosphereResult.density;
  const mass = p.mass + p.payload;
  const weight = mass * G;
  const diameterM = p.diameter * INCH;
  const pitchRatio = clamp(p.pitch / p.diameter, 0.18, 0.95);
  const rainEfficiency = clamp(1 - p.rainRate * 0.0015, 0.86, 1);
  const surfaceEfficiency = p.propEfficiency / 100 * icingEfficiency(p.icing) * rainEfficiency;
  const thrustCoefficient = (0.078 + 0.038 * pitchRatio) * surfaceEfficiency;
  const powerCoefficient = (0.045 + 0.04 * pitchRatio) / clamp(surfaceEfficiency, 0.5, 1);
  const motorEfficiency = clamp(p.motorEfficiency / 100, 0.35, 0.98);
  const motorHealths = Array.from({ length: p.rotors }, (_, index) => clamp(options.motorHealths?.[index] ?? 1, 0, 1));
  const motorEfficiencies = motorHealths.map(health => motorEfficiency * (0.72 + 0.28 * health));
  const shaftPowerLimits = motorHealths.map((health, index) => p.motorMaxPower * motorEfficiencies[index] * health ** 1.25);
  const rpmPowerLimits = shaftPowerLimits.map(limit => 60 * Math.cbrt(limit / Math.max(1e-9, powerCoefficient * rho * diameterM ** 5)));
  const rpmPowerLimit = Math.min(...rpmPowerLimits);
  const windSpeed = options.windSpeed ?? p.windSpeed;
  const verticalWind = options.verticalWind ?? p.verticalWind;
  const commandedRpms = options.motorRpms?.length
    ? options.motorRpms.slice(0, p.rotors)
    : Array.from({ length: p.rotors }, () => p.rpm);
  while (commandedRpms.length < p.rotors) commandedRpms.push(p.rpm);

  const effectiveRpms = commandedRpms.map((rpm, index) => clamp(rpm, 0, Math.min(p.maxRpm, rpmPowerLimits[index])));
  const requestedShaftPowers = commandedRpms.map(rpm => powerCoefficient * rho * (Math.max(0, rpm) / 60) ** 3 * diameterM ** 5);
  const thrusts = effectiveRpms.map(rpm => {
    const n = rpm / 60;
    return thrustCoefficient * rho * n ** 2 * diameterM ** 4;
  });
  const shaftPowers = effectiveRpms.map(rpm => powerCoefficient * rho * (rpm / 60) ** 3 * diameterM ** 5);
  const availableThrust = thrusts.reduce((sum, value) => sum + value, 0);
  const hardwareMaxThrust = rpmPowerLimits.reduce((sum, limit) => {
    const maxN = Math.min(p.maxRpm, limit) / 60;
    return sum + thrustCoefficient * rho * maxN ** 2 * diameterM ** 4;
  }, 0);
  const effectiveCd = p.dragCoefficient * (1 + p.rainRate * 0.003 + (p.icing === "moderate" ? 0.16 : p.icing === "trace" ? 0.06 : 0));
  const verticalArea = p.dragArea * 0.72;
  const verticalAirForce = 0.5 * rho * effectiveCd * verticalArea * verticalWind * Math.abs(verticalWind);
  const requiredVertical = Math.max(weight * 0.2, weight - verticalAirForce);
  let projectedArea = p.dragArea;
  let windForce = 0;
  let tilt = 0;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    windForce = 0.5 * rho * effectiveCd * projectedArea * windSpeed ** 2;
    tilt = Math.atan2(windForce, requiredVertical) * 180 / Math.PI;
    projectedArea = p.dragArea * (1 + 0.55 * Math.sin(tilt * Math.PI / 180));
  }
  windForce = 0.5 * rho * effectiveCd * projectedArea * windSpeed ** 2;
  const requiredThrust = Math.hypot(requiredVertical, windForce);
  tilt = Math.atan2(windForce, requiredVertical) * 180 / Math.PI;
  const reserve = (availableThrust / requiredThrust - 1) * 100;
  const hardwareReserve = (hardwareMaxThrust / requiredThrust - 1) * 100;
  const tiltLimitedHorizontal = requiredVertical * Math.tan((p.maxTilt ?? 35) * Math.PI / 180);
  const thrustLimitedHorizontal = Math.sqrt(Math.max(0, availableThrust ** 2 - requiredVertical ** 2));
  const horizontalAuthority = Math.min(tiltLimitedHorizontal, thrustLimitedHorizontal);
  const authorityTilt = Math.atan2(horizontalAuthority, requiredVertical);
  const maxProjectedArea = p.dragArea * (1 + 0.55 * Math.sin(authorityTilt));
  const maxWind = horizontalAuthority > 0
    ? Math.sqrt((2 * horizontalAuthority) / Math.max(0.0001, rho * effectiveCd * maxProjectedArea))
    : 0;
  const diskArea = p.rotors * Math.PI * (diameterM / 2) ** 2;
  const inducedPower = requiredThrust ** 1.5 / Math.sqrt(Math.max(0.001, 2 * rho * diskArea));
  const hoverRpm = 60 * Math.sqrt(requiredThrust / Math.max(1e-9, p.rotors * thrustCoefficient * rho * diameterM ** 4));
  const hoverShaftPower = p.rotors * powerCoefficient * rho * (hoverRpm / 60) ** 3 * diameterM ** 5;
  const perMotorHoverPower = hoverShaftPower / Math.max(1, p.rotors);
  const propulsionPower = motorEfficiencies.reduce((sum, efficiency) => sum + perMotorHoverPower / Math.max(0.1, efficiency), 0);
  const electricalPower = propulsionPower + 18 + p.rainRate * 0.45;
  const systemPowerLimit = motorHealths.reduce((sum, health) => sum + p.motorMaxPower * health ** 1.25, 0);
  const motorLoadPercents = requestedShaftPowers.map((power, index) => {
    const electricalLoad = power / Math.max(1e-6, shaftPowerLimits[index]) * 100;
    const mechanicalLoad = (Math.max(0, commandedRpms[index]) / Math.max(1, p.maxRpm)) ** 3 * 100;
    return Math.min(5000, Math.max(electricalLoad, mechanicalLoad));
  });
  const batteryFactor = batteryTemperatureFactor(p.batteryTemp);
  const usableEnergyWh = p.voltage * (p.capacity / 1000) * 0.80 * (p.stateOfCharge / 100) * batteryFactor;
  const current = electricalPower / Math.max(1, p.voltage);
  const requiredPowerLoad = propulsionPower / Math.max(1, systemPowerLimit) * 100;
  const commandPowerLoad = Math.max(...motorLoadPercents);
  const powerLoad = Math.max(requiredPowerLoad, commandPowerLoad);
  const tiltFeasible = tilt <= (p.maxTilt ?? 35) + 1e-6;
  const thrustFeasible = availableThrust >= requiredThrust;
  const powerFeasible = rpmPowerLimits.every(limit => hoverRpm <= Math.min(p.maxRpm, limit) + 1e-6)
    && motorLoadPercents.every(load => load <= 100 + 1e-6);
  const feasible = thrustFeasible && tiltFeasible && powerFeasible;
  const flightMinutes = feasible ? usableEnergyWh / Math.max(1, electricalPower) * 60 : 0;
  const supportedVerticalThrust = Math.min(requiredVertical, availableThrust);
  const downwashSpeed = Math.sqrt(Math.max(0, supportedVerticalThrust) / Math.max(0.001, 2 * rho * diskArea));
  const commandedElectricalPower = shaftPowers.reduce((sum, value, index) => sum + value / Math.max(0.1, motorEfficiencies[index]), 0) + 18 + p.rainRate * 0.45;
  const requestedElectricalPower = requestedShaftPowers.reduce((sum, value, index) => sum + value / Math.max(0.1, motorEfficiencies[index]), 0) + 18 + p.rainRate * 0.45;

  const positions = rotorPositions(p.rotors, p.frameSize / 2000);
  let rollMoment = 0;
  let pitchMoment = 0;
  let yawMoment = 0;
  thrusts.forEach((thrust, index) => {
    rollMoment += positions[index].y * thrust;
    pitchMoment -= positions[index].x * thrust;
    yawMoment += (index % 2 ? -1 : 1) * thrust * diameterM * 0.025;
  });
  rollMoment += p.payload * G * (p.payloadY / 100);
  pitchMoment -= p.payload * G * (p.payloadX / 100);
  const imbalanceMoment = Math.hypot(rollMoment, pitchMoment);
  const balancePercent = clamp(100 - imbalanceMoment / Math.max(0.01, weight * p.frameSize / 2000) * 100, 0, 100);

  return {
    ...atmosphereResult,
    mass,
    weight,
    diameterM,
    surfaceEfficiency,
    effectiveCd,
    projectedArea,
    thrustCoefficient,
    powerCoefficient,
    motorHealths,
    motorEfficiencies,
    shaftPowerLimits,
    rpmPowerLimits,
    thrusts,
    shaftPowers,
    requestedShaftPowers,
    commandedRpms,
    effectiveRpms,
    availableThrust,
    hardwareMaxThrust,
    rpmPowerLimit,
    windForce,
    verticalAirForce,
    requiredVertical,
    requiredThrust,
    tilt,
    reserve,
    hardwareReserve,
    horizontalAuthority,
    authorityTilt: authorityTilt * 180 / Math.PI,
    maxProjectedArea,
    maxWind,
    diskArea,
    inducedPower,
    hoverShaftPower,
    propulsionPower,
    electricalPower,
    commandedElectricalPower,
    requestedElectricalPower,
    systemPowerLimit,
    flightMinutes,
    current,
    powerLoad,
    requiredPowerLoad,
    commandPowerLoad,
    motorLoadPercents,
    downwashSpeed,
    hoverRpm,
    thrustToWeight: availableThrust / weight,
    diskLoading: weight / Math.max(0.001, diskArea),
    rollMoment,
    pitchMoment,
    yawMoment,
    imbalanceMoment,
    balancePercent,
    batteryFactor,
    feasible,
    thrustFeasible,
    powerFeasible,
    tiltFeasible,
    icingRisk: p.temperature <= 3 && p.temperature >= -15 && p.rainRate > 0 && p.icing === "none"
  };
}

export function graphSeries(parameters, variableName, metricName, from, to, samples = 90, options = {}) {
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const ratio = index / (samples - 1);
    const x = from + (to - from) * ratio;
    const trial = { ...parameters, [variableName]: x };
    const trialRpms = variableName === "rpm"
      ? Array.from({ length: trial.rotors }, () => x)
      : options.motorRpms;
    const result = calculate(trial, { motorRpms: trialRpms, motorHealths: options.motorHealths });
    points.push({ x, y: result[metricName], result });
  }
  return points.filter(point => Number.isFinite(point.y));
}
