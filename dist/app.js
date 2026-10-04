import {
  baseDefaults,
  calculate,
  dronePresets,
  graphMetrics,
  graphSeries,
  graphVariables,
  pressureFromAltitude
} from "./physics.js";
import { GraphRenderer } from "./renderers.js";
import { DroneScene3D } from "./scene3d.js";
import { stepMotorThermals, thermalAvailability } from "./systems.js";
import { unitSpec, parameterUnits, toDisplay, fromDisplay, graphKinds, shortcutAction } from "./units.js";
import { installExactControls } from "./exact-controls.js";
import { transformMesh } from "./mesh-import.js";
import { builderDefaults, designGeometry, geometryFor, exportDesignSTL } from "./drone-builder.js";
import { sampleField } from "./flow-lines.js";

const $ = id => document.getElementById(id);
const numberIds = [
  "mass", "payload", "frameSize", "rotors", "diameter", "pitch", "dragArea", "dragCoefficient", "propEfficiency",
  "rpm", "maxRpm", "motorMaxPower", "motorEfficiency", "windSpeed", "windDirection", "gusts", "gustFrequency",
  "turbulence", "verticalWind", "rainRate", "temperature", "altitude", "humidity", "pressureHpa", "voltage",
  "capacity", "stateOfCharge", "batteryTemp", "payloadX", "payloadY", "controlResponse", "maxTilt", "obstacleSize",
  "windTransition", "batteryResistance", "batteryCRating", "ct", "cp",
  "bodyLength", "bodyWidth", "bodyHeight", "armLength", "armThickness", "frameStretch", "motorDiameter", "motorHeight"
];
const selectIds = ["dronePreset", "pressureMode", "icing", "flowObstacle", "bodyShape", "rotorLayout"];
const inputs = Object.fromEntries([...numberIds, ...selectIds].map(id => [id, $(id)]));
const flightCanvas = $("flightCanvas");
const graphCanvas = $("graphCanvas");
const airflowCanvas = $("airflowCanvas");
const graphRenderer = new GraphRenderer(graphCanvas);
const flightScene = new DroneScene3D(flightCanvas, "flight");
const airflowScene = new DroneScene3D(airflowCanvas, "airflow");
const graphTooltip = $("graphTooltip");

const ui = {
  thrustReserve: $("thrustReserve"), thrustRatio: $("thrustRatio"), tiltAngle: $("tiltAngle"), flightTime: $("flightTime"),
  powerDraw: $("powerDraw"), batteryCurrent: $("batteryCurrent"), batteryLoad: $("batteryLoad"), maxWind: $("maxWind"),
  displacement: $("displacement"), airDensity: $("airDensity"), peakWind: $("peakWind"), motorBalance: $("motorBalance"),
  effectiveRpm: $("effectiveRpm"), motorThermal: $("motorThermal"), flightStatus: $("flightStatus"), flowSpeed: $("flowSpeed"),
  flowDensity: $("flowDensity"), downwashSpeed: $("downwashSpeed"), cfdStatus: $("cfdStatus"), cfdCells: $("cfdCells"),
  reynoldsNumber: $("reynoldsNumber"), flowLegend: $("flowLegend")
};

const format = (value, digits = 1) => Number(value).toLocaleString("ru-RU", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
});
let unitSystem = "metric";
try { if (localStorage.getItem("drone-lab-units") === "imperial") unitSystem = "imperial"; } catch {}
$("unitSystem").value = unitSystem;
let exactControls;
const quantity = (value, kind, digits = 1) => `${format(toDisplay(value, kind, unitSystem), digits)} ${unitSpec(kind, unitSystem).label}`;
const visibleLoad = value => value > 500 ? ">500%" : `${format(value, 0)}%`;
const effectiveMotorHealths = () => state.motorHealths.map((h, i) => h * thermalAvailability(state.motorTemps[i]));
flightScene.quantity = airflowScene.quantity = quantity;

const outputConfig = {
  ...Object.fromEntries(Object.keys(builderDefaults).filter(id => typeof builderDefaults[id] === "number").map(id => [id, v => id === "frameStretch" ? `${format(v, 2)}×` : `${Math.round(v)} мм`])),
  mass: value => `${format(value, 1)} кг`, payload: value => `${format(value, 1)} кг`, frameSize: value => `${Math.round(value)} мм`,
  diameter: value => `${format(value, 1)}″`, pitch: value => `${format(value, 1)}″`, dragArea: value => `${format(value, 2)} м²`,
  dragCoefficient: value => format(value, 2), propEfficiency: value => `${Math.round(value)}%`,
  rpm: value => `${Math.round(value).toLocaleString("ru-RU")} об/мин`, maxRpm: value => `${Math.round(value).toLocaleString("ru-RU")} об/мин`,
  motorMaxPower: value => `${Math.round(value).toLocaleString("ru-RU")} Вт`, motorEfficiency: value => `${Math.round(value)}%`,
  windSpeed: value => `${format(value, 1)} м/с`, windDirection: value => `${Math.round(value)}°`, gusts: value => `${Math.round(value)}%`,
  gustFrequency: value => `${format(value, 1)} Гц`, turbulence: value => `${Math.round(value)}%`, verticalWind: value => `${format(value, 1)} м/с`,
  rainRate: value => `${Math.round(value)} мм/ч`, temperature: value => `${Math.round(value)} °C`, altitude: value => `${Math.round(value).toLocaleString("ru-RU")} м`,
  humidity: value => `${Math.round(value)}%`, pressureHpa: value => `${Math.round(value)} гПа`, voltage: value => `${format(value, 1)} В`,
  capacity: value => `${Math.round(value).toLocaleString("ru-RU")} мА·ч`, stateOfCharge: value => `${Math.round(value)}%`, batteryTemp: value => `${Math.round(value)} °C`,
  payloadX: value => `${Math.round(value)} см`, payloadY: value => `${Math.round(value)} см`, controlResponse: value => `${format(value, 1)} с`,
  maxTilt: value => `${Math.round(value)}°`, obstacleSize: value => `${format(value, 1)}×`,
  windTransition: value => `${format(value, 1)} с`, batteryResistance: value => `${format(value * 1000, 0)} мОм`, batteryCRating: value => `${format(value, 0)} C`, ct: value => format(value, 3), cp: value => format(value, 3)
};

const state = {
  running: true,
  activeView: "flight",
  graphDirty: true,
  t: 0,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  ix: 0,
  iy: 0,
  controlX: 0,
  controlY: 0,
  windNow: 0,
  trail: [],
  lastTime: performance.now(),
  motorRpms: [],
  motorTemps: [],
  motorHealths: [],
  motorFire: [], motorExposure: [], motorIgnition: []
  , windVector: null, accumulator: 0, lastRender: 0, lastMetrics: 0, renderMs: 0, model: null,
  autoFps: 60, lastPerformanceCheck: 0, lastGraphUpdate: 0
};
let parameterCache = null;
let flowSnapshot = { key: "", result: null };

function cfdSettings() { return { quality: $("cfdQuality").value, solverMode: $("solverMode").value, iterationBudget: $("iterationBudget").value }; }
function meanFlowResult(parameters) {
  // A mean-flow solve must not restart at every animated gust or thermal time step.
  const healths = state.motorHealths.map(h => Math.round(h * 10) / 10);
  const key = JSON.stringify([parameters, state.motorRpms, healths]);
  if (flowSnapshot.key !== key) flowSnapshot = { key, result: calculate(parameters, { motorRpms: state.motorRpms, motorHealths: healths }) };
  return flowSnapshot.result;
}

function drawResidual(stats) {
  const canvas = $("residualCanvas"), ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height, x0 = 64, y0 = 24, pw = w - 86, ph = h - 48;
  ctx.clearRect(0, 0, w, h); ctx.font = "12px monospace";
  const history = stats?.residualHistory || [];
  if (!history.length) return;
  const y = r => y0 + Math.min(1, Math.max(0, -Math.log10(Math.max(1e-5, r)) / 5)) * ph;
  for (const value of [1, 0.01, 0.001, 0.00001]) {
    ctx.strokeStyle = value === 0.001 ? "#75f3c8" : "#29463f"; ctx.beginPath(); ctx.moveTo(x0, y(value)); ctx.lineTo(w - 22, y(value)); ctx.stroke();
    ctx.fillStyle = "#a2bab3"; ctx.fillText(`${value * 100}%`, 3, y(value) + 4);
  }
  const first = history[0].iteration, last = history[history.length - 1].iteration;
  ctx.strokeStyle = "#66d9ff"; ctx.lineWidth = 2; ctx.beginPath();
  history.forEach((p, i) => { const x = x0 + (p.iteration - first) / Math.max(1, last - first) * pw; i ? ctx.lineTo(x, y(p.residual)) : ctx.moveTo(x, y(p.residual)); });
  ctx.stroke(); ctx.lineWidth = 1; ctx.fillStyle = "#a2bab3";
  ctx.fillText(`${first}`, x0, h - 5); ctx.fillText(`${last} итераций`, w - 142, h - 5); ctx.fillText("Невязка · логарифмическая шкала · цель 0,1%", x0, 14);
}

function updateProbe() {
  const field = airflowScene.cfd.field;
  if (!field || airflowScene.cfd.fieldKey !== airflowScene.cfd.desiredKey) { $("probeReading").textContent = "Дождись расчёта текущей конфигурации"; return; }
  const position = ["probeX", "probeY", "probeZ"].map(id => Number($(id).value));
  const sample = sampleField(position.map(v => v / field.stats.worldScale), field);
  $("probeReading").textContent = `(${position.map(v => format(toDisplay(v, "m", unitSystem), 2)).join("; ")}) ${unitSpec("m", unitSystem).label} · ` + (sample ? `|u| ${quantity(sample.speed, "speed", 2)} · p ${quantity(sample.pressure, "pressure")} · |∇×u| ${format(sample.vorticity, 1)} с⁻¹` : "Внутри твёрдого тела или за границей области");
}

airflowScene.onCFDStatus = info => {
  $("continueCFD").disabled = info.status !== "ready";
  ui.cfdStatus.className = "";
  if (info.status === "ready" && info.stats) {
    ui.cfdStatus.textContent = `${info.stats.converged ? "установился" : "приближение"} · ${info.stats.elapsedMs} мс`;
    ui.cfdCells.textContent = `${info.stats.cells.toLocaleString("ru-RU")} ячеек`;
    ui.reynoldsNumber.textContent = Math.round(info.stats.reynolds).toLocaleString("ru-RU");
    const s = info.stats;
    $("cfdDiagnostics").innerHTML = `<div class="diagnostic-grid">
      <span>Невязка<strong>${format(s.residual * 100, 2)}%</strong><small>Относительное изменение скорости за 20 итераций. Цель &lt; 0,1%; ${s.converged ? "достигнута" : "не достигнута, поле ещё меняется"}.</small></span>
      <span>Размер ячейки<strong>${quantity(s.spacingM * 1000, "mm", 2)}</strong><small>Детали меньше двух или трёх ячеек не разрешаются надёжно.</small></span>
      <span>Re решателя<strong>${format(s.effectiveReynolds, 0)}</strong><small>С повышенной численной вязкостью. Не равен физическому Re ${format(s.reynolds, 0)}.</small></span>
      <span>Сила дисков<strong>${quantity(s.appliedThrust, "force")}</strong><small>Интеграл источника импульса в воздухе, связан с вертикальной тягой.</small></span>
      <span>∇·u, RMS<strong>${format(s.divergenceRms, 2)} с⁻¹</strong><small>Остаточная сжимаемость / дискретизация вдали от стенок; в идеале ноль.</small></span>
      <span>Итерации<strong>${s.iterations} · ${format(s.simulatedTime, 2)} с</strong><small>Численное время установления, не время полёта.</small></span>
    </div><p>${s.method}. Число Маха сетки: ${format(s.maxLatticeMach, 3)}; отклонение плотности до ${format(s.maxDensityDeviation * 100, 2)}%. ${s.maxLatticeMach > 0.2 ? "Высокая сжимаемость: результат требует осторожности." : ""} ${s.solidCells < 8 ? "Корпус плохо разрешён: увеличь сетку или размер модели." : ""} ${getParameters().dronePreset === "custom" && getParameters().armThickness < s.spacingM * 2000 ? "Лучи тоньше двух ячеек: их обтекание не разрешено." : ""} Сеточная сходимость и сравнение с экспериментом не выполнены. CFD использует средний ветер; ресурс моторов округлён до 10%. Давление относительно входа.</p>`;
    drawResidual(s); updateProbe();
  } else if (info.status === "error") {
    ui.cfdStatus.textContent = "ошибка расчёта";
    ui.cfdStatus.classList.add("danger-text");
    $("cfdDiagnostics").textContent = info.error || "Расчёт не завершён.";
    drawResidual(null); updateProbe();
  } else {
    ui.cfdStatus.textContent = `расчёт ${Math.round((info.progress || 0) * 100)}%${info.iterations ? ` · ${info.iterations} ит.` : ""}`;
    ui.cfdStatus.classList.add("warning-text");
  }
};

function getParameters() {
  if (parameterCache) return parameterCache;
  const parameters = Object.fromEntries(numberIds.map(id => [id, Number(inputs[id].value)]));
  selectIds.forEach(id => { parameters[id] = inputs[id].value; });
  if (parameters.pressureMode === "auto") {
    parameters.pressureHpa = pressureFromAltitude(parameters.altitude) / 100;
  }
  parameters.rotors = Number(parameters.rotors);
  parameters.calibratedProps = $("calibratedProps").checked;
  parameterCache = parameters;
  return parameterCache;
}

function invalidateParameters() { parameterCache = null; state.graphDirty = true; syncOutputs(getParameters()); }

function motorRpms(parameters) {
  if (!$("individualMotors").checked) return Array.from({ length: parameters.rotors }, () => parameters.rpm);
  return Array.from({ length: parameters.rotors }, (_, index) => {
    const input = $(`motorRpm${index}`), value = Number(input?.value);
    return input && input.value !== "" && Number.isFinite(value) && value >= 0 && value <= 28000 ? value : state.motorRpms[index] ?? parameters.rpm;
  });
}

function ensureMotorState(parameters, reset = false) {
  const ambient = parameters.temperature;
  state.motorTemps = Array.from({ length: parameters.rotors }, (_, index) => reset ? ambient : state.motorTemps[index] ?? ambient);
  state.motorHealths = Array.from({ length: parameters.rotors }, (_, index) => reset ? 1 : state.motorHealths[index] ?? 1);
  state.motorFire = Array.from({ length: parameters.rotors }, (_, index) => reset ? 0 : state.motorFire[index] ?? 0);
  state.motorExposure = Array.from({ length: parameters.rotors }, (_, index) => reset ? 0 : state.motorExposure[index] ?? 0);
  state.motorIgnition = Array.from({ length: parameters.rotors }, (_, index) => reset ? 0 : state.motorIgnition[index] ?? 0);
}

function updateOutput(id, value) {
  const output = $(`${id}Value`);
  if (output && outputConfig[id]) output.textContent = parameterUnits[id] ? quantity(value, parameterUnits[id], ["dragArea", "batteryResistance"].includes(id) ? 3 : 2) : outputConfig[id](value);
}

function syncOutputs(parameters) {
  Object.keys(outputConfig).forEach(id => updateOutput(id, parameters[id]));
  if (parameters.pressureMode === "auto") {
    inputs.pressureHpa.value = Math.round(parameters.pressureHpa);
    updateOutput("pressureHpa", parameters.pressureHpa);
  }
  inputs.pressureHpa.disabled = parameters.pressureMode !== "manual";
  inputs.ct.disabled = inputs.cp.disabled = !parameters.calibratedProps;
  const custom = parameters.dronePreset === "custom";
  $("builderPanel").hidden = !custom; inputs.frameSize.disabled = custom;
  if (custom) {
    const g = designGeometry(parameters);
    updateOutput("frameSize", g.frameSize);
    $("builderSummary").textContent = `Габарит рамы по осям: ${quantity(g.frameSize, "mm", 2)} · объём корпуса: ${quantity(g.bodyVolume * 1000, "volume", 3)} · зазор винтов: ${quantity(g.clearance * 1000, "mm", 2)}.${g.clearance < 0 ? " ВНИМАНИЕ: винты пересекаются. Увеличь лучи или уменьши диаметр." : ""}`;
  }
  $("streamlineCountValue").textContent = $("streamlineCount").value;
  $("airflowZoomValue").textContent = `${format($("airflowZoom").value, 1)}×`;
  exactControls?.refresh();
  if (parameters.pressureMode === "auto" && $("pressureHpaExact")) $("pressureHpaExact").value = String(Number(toDisplay(parameters.pressureHpa, "hpa", unitSystem).toPrecision(12)));
}

function setStatus(parameters, result, peakWind) {
  const status = ui.flightStatus;
  status.className = "status";
  let text = "Стабильно";
  const hottestMotor = Math.max(...state.motorTemps);
  const weakestMotor = Math.min(...state.motorHealths);
  const strongestFire = Math.max(...state.motorFire);
  if (strongestFire > 0.06) {
    status.classList.add("danger"); text = "Возгорание мотора / ESC";
  } else if (weakestMotor < 0.18) {
    status.classList.add("danger"); text = "Отказ двигателя";
  } else if (hottestMotor > 125) {
    status.classList.add("danger"); text = "Критический перегрев";
  } else if (hottestMotor > 88 || weakestMotor < 0.75) {
    status.classList.add("warning"); text = "Деградация двигателя";
  } else if (parameters.rpm > parameters.maxRpm || state.motorRpms.some(value => value > parameters.maxRpm)) {
    status.classList.add("danger"); text = "RPM выше механического предела";
  } else if (state.motorRpms.some((value, index) => value > result.rpmPowerLimits[index])) {
    status.classList.add("danger"); text = "RPM недостижимы по мощности";
  } else if (!result.thrustFeasible) {
    status.classList.add("danger"); text = "Тяги недостаточно";
  } else if (!result.tiltFeasible) {
    status.classList.add("danger"); text = "Превышен предел наклона";
  } else if (!result.powerFeasible) {
    status.classList.add("danger"); text = "Мощности недостаточно";
  } else if (!result.batteryFeasible) {
    status.classList.add("danger"); text = "Батарея не держит нагрузку";
  } else if (result.icingRisk) {
    status.classList.add("warning"); text = "Возможное обледенение";
  } else if (result.reserve < 20 || peakWind > result.maxWind) {
    status.classList.add("warning"); text = "Малый запас";
  }
  status.innerHTML = `<span></span> ${text}`;
}

function updateMetrics(parameters, result) {
  const peakWind = parameters.windSpeed * (1 + parameters.gusts / 100);
  const peakResult = calculate(parameters, { windSpeed: peakWind, motorRpms: state.motorRpms, motorHealths: effectiveMotorHealths() });
  ui.thrustReserve.textContent = `${format(peakResult.reserve, 0)}%`;
  ui.thrustRatio.textContent = `${format(result.thrustToWeight, 2)} : 1 тяга/вес`;
  ui.tiltAngle.textContent = `${format(result.tilt, 1)}°`;
  ui.flightTime.textContent = peakResult.feasible ? `${format(peakResult.flightMinutes, 1)} мин` : "—";
  ui.powerDraw.textContent = peakResult.feasible ? `${format(peakResult.electricalPower, 0)} Вт` : "режим полёта невозможен";
  ui.batteryCurrent.textContent = `${format(peakResult.current, 1)} А`;
  ui.batteryLoad.textContent = `команда ${visibleLoad(peakResult.commandPowerLoad)} · полёт ${visibleLoad(peakResult.requiredPowerLoad)}`;
  ui.maxWind.textContent = quantity(result.maxWind, "speed");
  ui.airDensity.textContent = quantity(result.density, "density", unitSystem === "imperial" ? 5 : 3);
  ui.peakWind.textContent = quantity(peakWind, "speed");
  ui.motorBalance.textContent = `${format(result.balancePercent, 0)}%`;
  const averageEffectiveRpm = result.effectiveRpms.reduce((sum, value) => sum + value, 0) / Math.max(1, result.effectiveRpms.length);
  ui.effectiveRpm.textContent = `${Math.round(averageEffectiveRpm).toLocaleString("ru-RU")} · предел ${Math.round(result.rpmPowerLimit).toLocaleString("ru-RU")}`;
  const hottestMotor = Math.max(...state.motorTemps);
  const weakestMotor = Math.min(...state.motorHealths);
  const hottestLoad = Math.max(...result.motorLoadPercents);
  ui.motorThermal.textContent = `${quantity(hottestMotor, "temperature", 0)} · ресурс ${format(weakestMotor * 100, 0)}% · нагрузка ${visibleLoad(hottestLoad)}`;
  ui.motorThermal.classList.toggle("danger-text", hottestMotor > 120 || weakestMotor < 0.5);
  ui.motorThermal.classList.toggle("warning-text", hottestMotor > 85 && hottestMotor <= 120);
  ui.displacement.textContent = quantity(Math.hypot(state.x, state.y, state.z), "m", 2);
  document.querySelectorAll(".motor-condition").forEach((element, index) => {
    const temperature = state.motorTemps[index] ?? parameters.temperature;
    const health = state.motorHealths[index] ?? 1;
    const load = result.motorLoadPercents[index] ?? 0;
    element.textContent = `${quantity(temperature, "temperature", 0)} · ${format(health * 100, 0)}% · ${visibleLoad(load)}`;
    element.classList.toggle("danger-text", temperature > 120 || health < 0.5 || load > 140);
    element.classList.toggle("warning-text", !element.classList.contains("danger-text") && (temperature > 85 || load > 100));
  });
  ui.flowSpeed.textContent = quantity(parameters.windSpeed, "speed");
  ui.flowDensity.textContent = `${$("streamlineCount").value} линий`;
  ui.downwashSpeed.textContent = quantity(result.downwashSpeed, "speed");
  updateMotorCards(parameters, result);
  const engineering = [
    ["Давление ветра", quantity(result.dynamicPressure, "pressure"), "q = ½ρV². Удвоение скорости даёт четырёхкратное давление."],
    ["Нагрузка на диск", quantity(result.diskLoading, "pressure"), "Вес / суммарная площадь дисков. Меньшая нагрузка снижает идеальные затраты на зависание."],
    ["Идеальная мощность", `${format(result.inducedPower, 0)} Вт`, "Нижняя оценка по теории импульса, без профильных и электрических потерь."],
    ["Конец лопасти", `${format(result.tipMach, 2)} M`, "Число Маха показывает скорость относительно скорости звука. При M > 0,65 простая модель винта ненадёжна."],
    ["Батарея под нагрузкой", `${format(result.terminalVoltage, 1)} В`, `Просадка ${format(result.voltageSag, 1)} В; тепло I²R: ${format(result.batteryHeat, 0)} Вт. Оценка по постоянному сопротивлению.`],
    ["Дальняя струя, идеал", quantity(result.farWakeSpeed, "speed"), "В штиле далеко под идеальным диском: ≈2vᵢ. Не измеренная скорость из CFD."],
    ["Ветер сейчас", quantity(state.windNow, "speed"), "Порывы и плавный переход в динамике полёта. CFD рассчитывает среднее поле."],
    ["Отрисовка", `${format(state.renderMs, 1)} мс`, "Время последнего кадра, не гарантия FPS. Авто снижает частоту и разрешение при нагрузке."]
  ];
  $("engineeringMetrics").innerHTML = engineering.map(([label, value, help]) => `<span>${label}<strong>${value}</strong><small>${help}</small></span>`).join("");
  const warnings = [];
  if (result.propOverlap) warnings.push("Диаметры винтов больше расстояния между соседними моторами: диски перекрываются. Увеличь раму или уменьши винты; расчёт независимых дисков в этом режиме ненадёжен.");
  if (result.tipMach > 0.65) warnings.push("Высокая скорость концов лопастей: сжимаемость и шум здесь не моделируются.");
  if (result.hoverShaftPower < result.inducedPower) warnings.push("Выбранные Cₜ/Cₚ дают мощность ниже идеальной: коэффициенты физически несогласованы.");
  if (!result.batteryFeasible) warnings.push("Превышена токоотдача или слишком большая просадка батареи.");
  $("engineeringWarnings").textContent = warnings.join(" ");
  $("engineeringWarnings").className = warnings.length ? "warning-text" : "";
  setStatus(parameters, peakResult, peakWind);
}

function resetDynamics(repair = true) {
  Object.assign(state, { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ix: 0, iy: 0, controlX: 0, controlY: 0, windNow: 0, windVector: null, accumulator: 0, trail: [] });
  ensureMotorState(getParameters(), repair);
}

function updateMotorCards(parameters, result) {
  const container = $("motorCards");
  if (container.children.length !== parameters.rotors) {
    container.replaceChildren();
    for (let i = 0; i < parameters.rotors; i++) { const card = document.createElement("article"); card.className = "motor-card"; container.append(card); }
  }
  Array.from(container.children).forEach((card, i) => {
    const temp = state.motorTemps[i], health = state.motorHealths[i], availability = thermalAvailability(temp);
    const failed = health < 0.18, burning = state.motorFire[i] > 0.06;
    const label = burning ? "Огонь" : failed ? "Отказ" : temp > 125 ? "Перегрев" : availability < 1 ? "Снижение мощности" : result.motorLoadPercents[i] > 100 ? "Перегрузка" : "Норма";
    card.className = `motor-card ${burning || failed ? "critical" : temp > 95 ? "warm" : ""}`;
    card.innerHTML = `<header><strong>M${i + 1}</strong><span>${label}</span></header><div class="motor-temperature">${quantity(temp, "temperature", 0)}</div><div class="health-track"><i style="width:${health * 100}%"></i></div><small>Ресурс ${format(health * 100, 0)}% · нагрузка ${visibleLoad(result.motorLoadPercents[i])}</small><small>Тепловой лимит ${format(availability * 100, 0)}% · ${format(result.effectiveRpms[i], 0)} RPM</small>`;
  });
}

function buildMotorGrid() {
  const parameters = getParameters();
  ensureMotorState(parameters);
  const grid = $("motorGrid");
  const enabled = $("individualMotors").checked;
  grid.hidden = !enabled;
  if (!enabled) {
    state.motorRpms = Array.from({ length: parameters.rotors }, () => parameters.rpm);
    return;
  }
  const oldValues = Array.from(grid.querySelectorAll("input")).map(input => Number(input.value));
  grid.replaceChildren();
  for (let index = 0; index < parameters.rotors; index += 1) {
    const label = document.createElement("label");
    label.className = "motor-control";
    label.textContent = `M${index + 1}`;
    const input = document.createElement("input");
    input.id = `motorRpm${index}`;
    input.type = "number";
    input.min = "0";
    input.max = "28000";
    input.step = "any";
    input.value = String(oldValues[index] ?? parameters.rpm);
    input.setAttribute("aria-label", `Обороты двигателя ${index + 1}`);
    input.addEventListener("input", () => { input.setCustomValidity(input.validity.rangeOverflow || input.validity.rangeUnderflow ? "Обороты от 0 до 28000." : ""); if (!input.checkValidity() || input.value === "") return; state.motorRpms = motorRpms(getParameters()); state.graphDirty = true; });
    label.append(input);
    const condition = document.createElement("span");
    condition.className = "motor-condition";
    condition.textContent = "—° · —% · —%";
    condition.title = "Температура · ресурс · нагрузка";
    label.append(condition);
    grid.append(label);
  }
  state.motorRpms = motorRpms(parameters);
}

function applyPreset(key) {
  if (key === "custom") {
    if (state.model) $("removeModel").click();
    parameterCache = null; syncOutputs(getParameters()); buildMotorGrid(); resetDynamics(); return;
  }
  const preset = dronePresets[key];
  if (!preset) return;
  Object.entries(preset).forEach(([id, value]) => {
    if (inputs[id] && typeof value !== "string") inputs[id].value = String(value);
  });
  inputs.rotors.value = String(preset.rotors);
  inputs.dronePreset.value = key;
  parameterCache = null;
  $("individualMotors").checked = false;
  buildMotorGrid();
  resetDynamics();
  syncOutputs(getParameters());
}

function simulate(dt, parameters) {
  const gustPhase = state.t * parameters.gustFrequency * Math.PI * 2;
  const turbulence = parameters.turbulence / 100;
  const gustWave = 0.62 * Math.sin(gustPhase) + 0.25 * Math.sin(gustPhase * 2.17 + 1.3) + 0.13 * Math.sin(gustPhase * 4.8 + 0.2);
  const targetWind = Math.max(0, parameters.windSpeed * (1 + parameters.gusts / 100 * gustWave + turbulence * 0.08 * Math.sin(state.t * 8.7)));
  const windAngle = parameters.windDirection * Math.PI / 180 + turbulence * 0.18 * Math.sin(state.t * 3.4);
  const target = [Math.cos(windAngle) * targetWind, Math.sin(windAngle) * targetWind];
  if (!state.windVector) state.windVector = target;
  const blend = 1 - Math.exp(-dt / parameters.windTransition);
  state.windVector = state.windVector.map((v, i) => v + (target[i] - v) * blend);
  const windNow = Math.hypot(...state.windVector), actualWindAngle = Math.atan2(state.windVector[1], state.windVector[0]);
  const dynamicResult = calculate(parameters, { windSpeed: windNow, motorRpms: state.motorRpms, motorHealths: effectiveMotorHealths() });
  const windX = dynamicResult.windForce * Math.cos(actualWindAngle);
  const windY = dynamicResult.windForce * Math.sin(actualWindAngle);
  const response = Math.max(0.2, parameters.controlResponse);
  const kp = 1.15 / response;
  const kd = 1.7 / Math.sqrt(response);
  const ki = 0.14 / response;
  state.ix = Math.max(-25, Math.min(25, state.ix + state.x * dt));
  state.iy = Math.max(-25, Math.min(25, state.iy + state.y * dt));
  let controlX = -dynamicResult.mass * (kp * state.x + kd * state.vx + ki * state.ix);
  let controlY = -dynamicResult.mass * (kp * state.y + kd * state.vy + ki * state.iy);
  const controlMagnitude = Math.hypot(controlX, controlY);
  if (controlMagnitude > dynamicResult.horizontalAuthority && controlMagnitude > 0) {
    const scale = dynamicResult.horizontalAuthority / controlMagnitude;
    controlX *= scale; controlY *= scale;
  }
  const arm = Math.max(0.05, parameters.frameSize / 2000);
  const imbalanceX = -dynamicResult.pitchMoment / arm * 0.12;
  const imbalanceY = dynamicResult.rollMoment / arm * 0.12;
  const ax = (windX + controlX + imbalanceX) / dynamicResult.mass;
  const ay = (windY + controlY + imbalanceY) / dynamicResult.mass;
  const verticalAuthority = Math.sqrt(Math.max(0, dynamicResult.availableThrust ** 2 - Math.hypot(controlX, controlY) ** 2));
  const desiredVerticalThrust = Math.max(0, dynamicResult.requiredVertical - dynamicResult.mass * (1.7 * state.z + 1.45 * state.vz));
  const actualVerticalThrust = Math.min(verticalAuthority, desiredVerticalThrust);
  const az = (actualVerticalThrust - dynamicResult.requiredVertical) / dynamicResult.mass;
  state.vx = (state.vx + ax * dt) * Math.pow(0.996, dt * 60);
  state.vy = (state.vy + ay * dt) * Math.pow(0.996, dt * 60);
  state.vz = (state.vz + az * dt) * Math.pow(0.998, dt * 60);
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z = Math.max(-30, Math.min(12, state.z + state.vz * dt));
  state.controlX = controlX;
  state.controlY = controlY;
  state.windNow = windNow;
  updateMotorThermals(dt, parameters, dynamicResult);
  state.t += dt;
  if (state.t % 0.075 < dt) {
    state.trail.push({ x: state.x, y: state.y, z: state.z, t: state.t });
    if (state.trail.length > 280) state.trail.shift();
  }
  return dynamicResult;
}

function updateMotorThermals(dt, parameters, result) {
  const next = stepMotorThermals({ temperatures: state.motorTemps, healths: state.motorHealths, fires: state.motorFire, exposure: state.motorExposure, ignition: state.motorIgnition }, parameters, result, state.windNow, dt);
  state.motorTemps = next.temperatures;
  state.motorHealths = next.healths;
  state.motorFire = next.fires;
  state.motorExposure = next.exposure; state.motorIgnition = next.ignition;
}

function graphRangeFor(variableName) {
  const definition = graphVariables[variableName];
  $("graphFrom").value = String(toDisplay(definition.min, parameterUnits[variableName], unitSystem));
  $("graphTo").value = String(toDisplay(definition.max, parameterUnits[variableName], unitSystem));
  $("graphFrom").step = $("graphTo").step = "any";
}

function renderGraph(parameters) {
  const variableName = $("graphVariable").value;
  const metricName = $("graphMetric").value;
  const variable = graphVariables[variableName];
  const metric = graphMetrics[metricName];
  let from = fromDisplay(Number($("graphFrom").value), parameterUnits[variableName], unitSystem);
  let to = fromDisplay(Number($("graphTo").value), parameterUnits[variableName], unitSystem);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) { from = variable.min; to = variable.max; }
  if (from > to) [from, to] = [to, from];
  const points = graphSeries(parameters, variableName, metricName, from, to, 100, { motorRpms: state.motorRpms, motorHealths: effectiveMotorHealths() });
  const xKind = parameterUnits[variableName], yKind = graphKinds[metricName];
  const displayPoints = points.map(p => ({ ...p, x: toDisplay(p.x, xKind, unitSystem), y: toDisplay(p.y, yKind, unitSystem) }));
  if (points.length) graphRenderer.draw(displayPoints, { ...variable, unit: xKind ? unitSpec(xKind, unitSystem).label : variable.unit }, { ...metric, unit: yKind ? unitSpec(yKind, unitSystem).label : metric.unit }, toDisplay(parameters[variableName], xKind, unitSystem), format);
  $("graphFormula").textContent = metric.formula;
}

function setActiveView(view) {
  state.activeView = view;
  if (view === "graph") state.graphDirty = true;
  document.querySelectorAll(".mode-tab").forEach(tab => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".view-panel").forEach(panel => {
    const active = panel.id === `${view}View`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

document.querySelectorAll(".mode-tab").forEach(tab => tab.addEventListener("click", () => setActiveView(tab.dataset.view)));

numberIds.forEach(id => inputs[id].addEventListener("input", () => {
  parameterCache = null;
  if (id === "rotors") buildMotorGrid();
  if (id === "rpm" && !$("individualMotors").checked) state.motorRpms = motorRpms(getParameters());
  updateOutput(id, Number(inputs[id].value));
  state.graphDirty = true;
  syncOutputs(getParameters());
  if ((id === "frameSize" || id in builderDefaults) && state.model) refreshModel();
}));
selectIds.forEach(id => inputs[id].addEventListener("change", invalidateParameters));
$("calibratedProps").addEventListener("change", invalidateParameters);

inputs.dronePreset.addEventListener("change", event => { applyPreset(event.target.value); state.graphDirty = true; });
inputs.pressureMode.addEventListener("change", () => { inputs.pressureHpa.disabled = inputs.pressureMode.value !== "manual"; state.graphDirty = true; });
inputs.icing.addEventListener("change", () => { state.graphDirty = true; });
$("individualMotors").addEventListener("change", () => { buildMotorGrid(); state.graphDirty = true; });
$("graphVariable").addEventListener("change", event => { graphRangeFor(event.target.value); state.graphDirty = true; });
$("graphMetric").addEventListener("change", () => { state.graphDirty = true; });
$("graphFrom").addEventListener("input", () => { state.graphDirty = true; });
$("graphTo").addEventListener("input", () => { state.graphDirty = true; });
$("streamlineCount").addEventListener("input", () => { $("streamlineCountValue").textContent = $("streamlineCount").value; });
$("airflowZoom").addEventListener("input", () => { $("airflowZoomValue").textContent = `${format($("airflowZoom").value, 1)}×`; });
$("airflowLayer").addEventListener("change", () => { airflowScene.streamlineCache.key = ""; });
$("flowColor").addEventListener("change", () => {
  const labels = { speed: "скорость", pressure: "давление", vorticity: "завихрение" };
  ui.flowLegend.textContent = labels[$("flowColor").value];
});
$("repairMotors").addEventListener("click", () => {
  ensureMotorState(getParameters(), true);
  state.graphDirty = true;
});

$("toggleSimulation").addEventListener("click", () => {
  state.running = !state.running;
  $("toggleSimulation").textContent = state.running ? "Пауза" : "Продолжить";
  state.lastTime = performance.now();
});

$("resetSimulation").addEventListener("click", () => {
  Object.entries(baseDefaults).forEach(([id, value]) => {
    if (inputs[id] && typeof value !== "object" && id !== "label" && id !== "style") inputs[id].value = String(value);
  });
  $("individualMotors").checked = false;
  $("streamlineCount").value = "216";
  $("airflowZoom").value = "1";
  $("airflowLayer").value = "volume";
  $("cfdQuality").value = "balanced";
  $("solverMode").value = "trt"; $("iterationBudget").value = "standard"; $("flowRate").value = "0.35";
  $("flowColor").value = "speed";
  inputs.flowObstacle.value = "none";
  inputs.obstacleSize.value = "1";
  $("calibratedProps").checked = false;
  parameterCache = null;
  syncOutputs(getParameters());
  graphRangeFor("windSpeed");
  buildMotorGrid();
  resetDynamics();
  state.running = true;
  state.graphDirty = true;
  $("toggleSimulation").textContent = "Пауза";
});

graphCanvas.addEventListener("pointermove", event => {
  const nearest = graphRenderer.nearest(event.clientX);
  if (!nearest) { graphTooltip.hidden = true; return; }
  const variable = graphVariables[$("graphVariable").value];
  const metric = graphMetrics[$("graphMetric").value];
  const xKind = parameterUnits[$("graphVariable").value], yKind = graphKinds[$("graphMetric").value];
  graphTooltip.innerHTML = `${variable.label}: <strong>${format(nearest.point.x, 1)} ${xKind ? unitSpec(xKind, unitSystem).label : variable.unit}</strong><br>${metric.label}: <strong>${format(nearest.point.y, 2)} ${yKind ? unitSpec(yKind, unitSystem).label : metric.unit}</strong>`;
  const rect = graphCanvas.getBoundingClientRect();
  graphTooltip.style.left = `${Math.min(rect.width - 160, Math.max(8, nearest.x + 12))}px`;
  graphTooltip.style.top = `${Math.max(8, nearest.y - 54)}px`;
  graphTooltip.hidden = false;
});
graphCanvas.addEventListener("pointerleave", () => { graphTooltip.hidden = true; });

function refreshModel() {
  if (!state.model) return;
  const span = Number($("modelSpan").value);
  const useInCFD = $("meshCFD").checked && state.model.closed;
  if (!Number.isFinite(span) || span < 20 || span > 2000) {
    $("modelStatus").textContent = "Укажи размер от 20 до 2000 мм."; return;
  }
  const worldSpan = span / 1000 / geometryFor(getParameters()).worldScale;
  const triangles = transformMesh(state.model, worldSpan, $("modelUp").value, Number($("modelYaw").value));
  const preview = transformMesh({ triangles: state.model.preview }, worldSpan, $("modelUp").value, Number($("modelYaw").value));
  let exceedsDomain = false;
  for (let i = 0; i < triangles.length; i += 3) if (Math.abs(triangles[i]) > 2.5 || Math.abs(triangles[i + 1]) > 1.2 || Math.abs(triangles[i + 2]) > 2) { exceedsDomain = true; break; }
  $("meshCFD").disabled = !state.model.closed || exceedsDomain;
  if (exceedsDomain) $("meshCFD").checked = false;
  const meshDescription = `${state.model.name} · ${state.model.triangleCount.toLocaleString("ru-RU")} треугольников · ${state.model.closed ? "замкнутая сетка" : `незамкнутая / дефектная: ${state.model.badEdges} проблемных рёбер`}.`;
  $("modelStatus").textContent = `${meshDescription} ${exceedsDomain ? "Модель выходит из расчётной области: уменьши размер или поверни её. CFD отключён." : state.model.closed ? "Можно включить CFD по этой геометрии. Проверь совпадение центров винтов с типовой рамой." : "Пока только отображение. Исправь дыры в CAD для CFD."} ${state.model.triangleCount > 3000 ? "Предпросмотр упрощён для скорости; CFD использует все треугольники." : ""}`;
  flightScene.setModel(triangles, false, preview);
  airflowScene.setModel(triangles, useInCFD && !exceedsDomain, preview);
}

let modelWorker = null, modelGeneration = 0;
$("modelFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 16 * 1024 * 1024) { $("modelStatus").textContent = "Файл больше 16 МБ. Уменьши сетку в CAD."; return; }
  modelWorker?.terminate();
  const generation = ++modelGeneration;
  $("modelStatus").textContent = "Читаю модель и проверяю замкнутость…";
  try {
    const buffer = await file.arrayBuffer();
    if (generation !== modelGeneration) return;
    const worker = new Worker(new URL("./mesh-worker.js", import.meta.url), { type: "module" });
    modelWorker = worker;
    worker.onmessage = ({ data }) => {
      if (generation !== modelGeneration) return;
      if (data.error) $("modelStatus").textContent = data.error;
      else {
        state.model = data.mesh;
        $("meshCFD").checked = false;
        $("removeModel").disabled = false;
        refreshModel();
      }
      worker.terminate(); modelWorker = null;
    };
    worker.onerror = () => { if (generation !== modelGeneration) return; $("modelStatus").textContent = "Не удалось прочитать модель. Попробуй облегчённый STL / OBJ."; worker.terminate(); modelWorker = null; };
    worker.postMessage({ buffer, name: file.name }, [buffer]);
  } catch { $("modelStatus").textContent = "Не удалось открыть файл модели."; }
});
for (const id of ["modelSpan", "modelUp", "modelYaw", "meshCFD"]) $(id).addEventListener("change", refreshModel);
$("removeModel").addEventListener("click", () => {
  modelGeneration++; modelWorker?.terminate(); modelWorker = null;
  state.model = null; $("modelFile").value = "";
  $("meshCFD").checked = false; $("meshCFD").disabled = true; $("removeModel").disabled = true;
  flightScene.setModel(null); airflowScene.setModel(null);
  $("modelStatus").textContent = "Встроенная модель. Загрузи STL / OBJ из CAD, чтобы заменить корпус.";
});

document.querySelectorAll("[data-weather]").forEach(button => button.addEventListener("click", () => {
  const presets = { calm: { windSpeed: 0, gusts: 0, turbulence: 0, rainRate: 0, verticalWind: 0 }, gust: { windSpeed: 10, gusts: 65, turbulence: 35, gustFrequency: 0.4, rainRate: 0 }, rain: { windSpeed: 7, gusts: 35, turbulence: 25, rainRate: 35, humidity: 90 } };
  for (const [id, value] of Object.entries(presets[button.dataset.weather])) inputs[id].value = String(value);
  invalidateParameters();
}));

$("exportReport").addEventListener("click", () => {
  const parameters = getParameters();
  const result = calculate(parameters, { motorRpms: state.motorRpms, motorHealths: effectiveMotorHealths() });
  airflowScene.ensureCFD(parameters, meanFlowResult(parameters), cfdSettings());
  const matchingCFD = airflowScene.cfd.fieldKey === airflowScene.cfd.desiredKey && airflowScene.cfd.status === "ready";
  const report = { version: "0.7.0", generatedAt: new Date().toISOString(), displayUnits: unitSystem, parameters, result, motors: { temperatures: state.motorTemps, healths: state.motorHealths, fires: state.motorFire, exposure: state.motorExposure, ignition: state.motorIgnition },
    importedMesh: state.model ? { name: state.model.name, triangles: state.model.triangleCount, closed: state.model.closed, spanMm: Number($("modelSpan").value), upAxis: $("modelUp").value, yaw: Number($("modelYaw").value), usedInCFD: Boolean(airflowScene.meshCFD) } : null,
    cfd: matchingCFD ? { configuration: JSON.parse(airflowScene.cfd.fieldKey), stats: airflowScene.cfd.field.stats } : { status: "not-current-or-not-calculated" },
    limitations: ["TRT/BGK D3Q19 actuator-disk approximation; no experiment or grid-convergence validation.", "CFD mean wind, motor health rounded to 10%; flight dynamics include smoothed gusts.", "Physical and effective solver Reynolds numbers differ.", "Mass and drag coefficient entered manually; imported mesh only changes CFD geometry when enabled."] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "drone-weather-lab-v0.7-report.json"; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("exportDesign").addEventListener("click", () => download("drone-design-mm-Y-up.stl", exportDesignSTL(getParameters()), "model/stl"));
$("saveDesign").addEventListener("click", () => {
  download("drone-weather-lab-design.json", JSON.stringify({ format: "drone-weather-lab-design", version: 1, parameters: getParameters() }, null, 2), "application/json");
  $("designStatus").textContent = "Сохранены геометрия, погода и общие настройки. CAD-файл, отдельные RPM и повреждения не включены.";
});
$("loadDesign").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 100000) throw new Error("Файл настроек должен быть меньше 100 КБ.");
    const data = JSON.parse(await file.text()), p = data.parameters;
    if (data.format !== "drone-weather-lab-design" || data.version !== 1 || !p || typeof p !== "object") throw new Error("Нужен JSON, сохранённый кнопкой «Сохранить настройки».");
    // Validate the whole document before changing a single control.
    const updates = [];
    for (const id of numberIds) {
      const value = p[id], input = inputs[id];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Неверный параметр ${id}.`);
      const lo = input.getAttribute("min"), hi = input.getAttribute("max");
      const automaticPressure = id === "pressureHpa" && p.pressureMode === "auto" && value > 0 && value < 1200;
      if (!automaticPressure && ((lo !== null && value < Number(lo)) || (hi !== null && value > Number(hi)) || (id === "rotors" && ![4, 6, 8].includes(value)))) throw new Error(`Параметр ${id} вне диапазона.`);
      updates.push([id, value]);
    }
    for (const id of selectIds) {
      if (![...inputs[id].options].some(o => o.value === p[id])) throw new Error(`Неверный вариант ${id}.`);
      updates.push([id, p[id]]);
    }
    for (const [id, value] of updates) inputs[id].value = String(value);
    $("removeModel").click(); $("individualMotors").checked = false;
    $("calibratedProps").checked = p.calibratedProps === true;
    invalidateParameters(); buildMotorGrid(); resetDynamics();
    $("designStatus").textContent = "Настройки загружены. Состояние полёта и моторов сброшено.";
  } catch (error) { $("designStatus").textContent = error.message; }
  event.target.value = "";
});
$("continueCFD").addEventListener("click", () => airflowScene.continueCFD());
for (const id of ["probeX", "probeY", "probeZ"]) $(id).addEventListener("input", updateProbe);

const parameterHelp = {
  solverMode: "TRT разделяет симметричную и антисимметричную части распределения. В этой реализации вязкость ниже, чем у BGK. Это всё ещё приближённый низко-Re расчёт, а не DNS реального дрона.",
  iterationBudget: "Эскиз: 100/220/360 шагов в зависимости от сетки. Стандарт: вдвое больше; длинный: вшестеро. Считать дальше продолжает текущее поле. Остановка: невязка ниже 0,1% три проверки подряд, минимум 200 шагов.",
  flowRate: "Меняет только скорость просмотра частиц. Их путь и локальная скорость берутся из численного поля. Не меняет ветер и результат расчёта.",
  armLength: "Расстояние от центра дрона до оси мотора до растяжения рамы. Изменяет реальное плечо тяги и положение дисков в CFD.",
  frameStretch: "Удлиняет расположение моторов по оси Z, вдоль корпуса. Масса и лобовая площадь автоматически не пересчитываются.",
  pitch: "Шаг показывает теоретическое продвижение винта за оборот в твёрдой среде. Это не высота лопасти; влияет на оценочные Cₜ и Cₚ.",
  dragArea: "Площадь поперёк ветра. Влияет на силу F = ½ρC𝒹AV². Не равна общей площади поверхности или площади дисков винтов.",
  dragCoefficient: "C𝒹 описывает форму и сопротивление. Не извлекается автоматически из модели; для точности нужен эксперимент или проверенный CFD.",
  propEfficiency: "Поправка состояния винтов: повреждение, дождь и лёд снижают тягу и увеличивают потребляемую мощность. Это эмпирическая модель.",
  ct: "Безразмерный коэффициент: T = Cₜρn²D⁴, n в оборотах/с, D в метрах. Бери из стендовых данных своего винта; для чистого винта выставь состояние 100%.",
  cp: "Безразмерный коэффициент мощности на валу: P = Cₚρn³D⁵. Не путай с электрической мощностью и коэффициентом момента Cq.",
  rpm: "Команда задаёт доступную тягу. Удержание точки предполагает снижение оборотов до требуемых. Перегрузка команды используется как отдельный стресс-тест моторов. Дым и огонь условные, они не предсказывают реальный отказ.",
  motorMaxPower: "Допустимая электрическая мощность одного мотора с ESC. Мощность на валу ниже из-за КПД. Лимит зависит от ресурса мотора.",
  motorEfficiency: "КПД преобразования электрической мощности в механическую. Остаток нагревает мотор и регулятор ESC.",
  windTransition: "Постоянная времени плавного перехода: через это время пройдено примерно 63% изменения скорости. Влияет на полёт, не на стационарный CFD.",
  gustFrequency: "В герцах измеряется число колебаний в секунду. 0,5 Гц означает характерный период около 2 секунд.",
  turbulence: "Условная интенсивность нерегулярных порывов в полёте. Это не полноценная модель LES/RANS в CFD.",
  verticalWind: "Положительное значение задаёт поток вверх, отрицательное вниз. Вертикальная аэродинамическая сила оценивается отдельно. Вихревое кольцо роторов не моделируется.",
  pressureMode: "Автоматический режим берёт давление из стандартной барометрической атмосферы по высоте. Ручной режим использует указанное тобой давление для расчёта плотности.",
  icing: "Лёд ухудшает тягу и увеличивает сопротивление. Скорость накопления льда и точная форма льда не рассчитываются.",
  batteryResistance: "Сопротивление всего пакета, включая соединения. Даёт просадку U = U₀ − IR и тепловые потери I²R. Меняется с температурой и зарядом; здесь задано постоянным.",
  batteryCRating: "C × ёмкость в А·ч = допустимый ток в А. Например, 10 А·ч × 25 C = 250 А. Паспортные C-рейтинг и реальный длительный ток могут отличаться.",
  controlResponse: "При меньшем значении условный PID-контроллер быстрее компенсирует снос. Реальная настройка автопилота сложнее этой модели.",
  cfdQuality: "Больше кубических ячеек и итераций дают больше деталей, но увеличивают вычислительную нагрузку. Даже максимальная сетка здесь не промышленная.",
  flowColor: "Скорость и избыточное давление отображаются в выбранных единицах, завихрение |∇×u| в с⁻¹. Цветовая шкала нормируется по текущему полю.",
  airflowLayer: "Меняет плоскость начальных точек. Дальше линии движутся по полному 3D-полю, поэтому могут выйти из выбранной плоскости.",
  renderQuality: "Авто снижает FPS и плотность пикселей при высокой стоимости кадра. Экономный ограничивает отрисовку 30 FPS; физика идёт фиксированным шагом 1/60 с. В скрытой вкладке симуляция приостанавливается.",
  frameSize: "Расстояние между противоположными моторами. Расположение центров дисков определяется этой рамой; импорт CAD не переносит центры моторов автоматически.",
  modelSpan: "Реальный наибольший габарит импортированной сетки. STL/OBJ часто не содержат однозначных единиц, поэтому размер задаётся вручную."
};
for (const [id, text] of Object.entries(parameterHelp)) {
  const input = $(id), parent = input?.closest("label");
  if (!parent) continue;
  const help = document.createElement("details"); help.className = "control-help";
  const summary = document.createElement("summary"); summary.textContent = "Что это значит?";
  const p = document.createElement("p"); p.textContent = text;
  help.append(summary, p); parent.append(help);
}

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - state.lastTime) / 1000));
  state.lastTime = now;
  if (document.hidden) { requestAnimationFrame(frame); return; }
  const renderMode = $("renderQuality").value;
  if (now - state.lastPerformanceCheck > 2000) {
    if (state.renderMs > 22) state.autoFps = 30;
    else if (state.renderMs < 9) state.autoFps = 60;
    state.lastPerformanceCheck = now;
  }
  const targetFps = renderMode === "eco" ? 30 : renderMode === "auto" ? state.autoFps : 60;
  if (state.running) state.accumulator += dt;
  if (now - state.lastRender < 1000 / targetFps - 1) { requestAnimationFrame(frame); return; }
  state.lastRender = now;
  const started = performance.now();
  const parameters = getParameters();
  ensureMotorState(parameters);
  state.motorRpms = motorRpms(parameters);
  let result;
  let substeps = 0;
  while (state.running && state.accumulator >= 1 / 60 && substeps < 6) {
    result = simulate(1 / 60, parameters); state.accumulator -= 1 / 60; substeps++;
  }
  if (substeps === 6) state.accumulator = 0;
  result ||= calculate(parameters, { motorRpms: state.motorRpms, motorHealths: effectiveMotorHealths() });
  if (now - state.lastMetrics > 200) { updateMetrics(parameters, result); state.lastMetrics = now; }
  const pixelRatio = renderMode === "eco" || targetFps === 30 ? 1 : renderMode === "high" ? 2 : 1.5;
  flightScene.pixelRatio = airflowScene.pixelRatio = pixelRatio;
  if (state.activeView === "flight") {
    flightScene.renderFlight(state, parameters, result, format);
  } else if (state.activeView === "graph") {
    if (now - state.lastGraphUpdate > 1000) { state.graphDirty = true; state.lastGraphUpdate = now; }
    if (state.graphDirty) {
      renderGraph(parameters);
      state.graphDirty = false;
    }
  } else {
    airflowScene.renderAirflow(parameters, meanFlowResult(parameters), {
      layer: $("airflowLayer").value,
      count: Number($("streamlineCount").value),
      zoom: Number($("airflowZoom").value),
      ...cfdSettings(),
      flowRate: Number($("flowRate").value),
      probe: ["probeX", "probeY", "probeZ"].map(id => Number($(id).value)),
      colorMode: $("flowColor").value,
      systemState: state
    }, state.t, format);
  }
  state.renderMs = state.renderMs * 0.85 + (performance.now() - started) * 0.15;
  requestAnimationFrame(frame);
}

exactControls = installExactControls([...document.querySelectorAll('input[type="range"]'), $("modelSpan")], () => unitSystem);
$("unitSystem").addEventListener("change", () => {
  const oldSystem = unitSystem, kind = parameterUnits[$("graphVariable").value];
  const range = ["graphFrom", "graphTo"].map(id => fromDisplay(Number($(id).value), kind, oldSystem));
  unitSystem = $("unitSystem").value;
  try { localStorage.setItem("drone-lab-units", unitSystem); } catch {}
  ["graphFrom", "graphTo"].forEach((id, i) => { $(id).value = String(toDisplay(range[i], kind, unitSystem)); });
  exactControls.refresh(true); syncOutputs(getParameters()); updateProbe();
  if (airflowScene.cfd.field?.stats) airflowScene.emitCFDStatus();
  state.graphDirty = true; state.lastMetrics = 0;
});
$("showShortcuts").addEventListener("click", () => {
  $("shortcutHelp").hidden = !$("shortcutHelp").hidden;
  $("showShortcuts").setAttribute("aria-expanded", String(!$("shortcutHelp").hidden));
});
document.addEventListener("keydown", event => {
  const action = shortcutAction(event); if (!action) return;
  event.preventDefault();
  if (action === "pause") $("toggleSimulation").click();
  else if (action === "repair") $("repairMotors").click();
  else if (action === "reset") resetDynamics(false);
  else if (action === "help") $("showShortcuts").click();
  else setActiveView(action);
});
graphRangeFor("windSpeed");
buildMotorGrid();
syncOutputs(getParameters());
window.addEventListener("resize", () => { state.graphDirty = true; });
document.addEventListener("visibilitychange", () => { state.lastTime = performance.now(); state.accumulator = 0; airflowScene.setCFDPaused(document.hidden); });
requestAnimationFrame(frame);
