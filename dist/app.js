import {
  createActivityLoop
} from "./activity.js";
import {
  installWorkbench
} from "./workbench.js";
import {
  batteryCircuit,
  initialBattery,
  stepBattery,
  stepESC,
  escAvailability,
  batterySeries,
  packEnergyWh,
  packSpecificEnergy,
  forecastBattery,
  powerBudget,
  curves
} from "./power-system.js";
import {
  t,
  getLanguage,
  setLanguage,
  installLanguage
} from "./i18n.js";
import {
  compareConfigurations,
  changedParameters
} from "./comparison.js";
import {
  baseDefaults,
  calculate,
  dronePresets,
  graphMetrics,
  graphSeries,
  graphVariables,
  pressureFromAltitude,
  relativeAirflow,
  dragAreas,
  motorDraw,
  rotorPlanPositions
} from "./physics.js";
import {
  cgAllocation
} from "./engineering.js";
import {
  GraphRenderer
} from "./renderers.js";
import {
  DroneScene3D
} from "./scene3d.js";
import {
  stepMotorThermals,
  thermalAvailability
} from "./systems.js";
import {
  unitSpec,
  parameterUnits,
  toDisplay,
  fromDisplay,
  graphKinds,
  shortcutAction
} from "./units.js";
import {
  installExactControls
} from "./exact-controls.js";
import {
  transformMesh,
  fitMesh,
  meshBounds,
  orientedDimensions
} from "./mesh-import.js";
import {
  builderDefaults,
  designGeometry,
  geometryFor,
  exportDesignSTL
} from "./drone-builder.js";
import {
  sampleField
} from "./flow-lines.js";

const $ = id => document.getElementById(id);
const numberIds = [
  "mass", "payload", "frameSize", "rotors", "diameter", "pitch", "dragArea", "dragCoefficient",
  "propEfficiency",
  "rpm", "maxRpm", "motorMaxPower", "motorEfficiency", "windSpeed", "windDirection", "gusts",
  "gustFrequency",
  "turbulence", "verticalWind", "rainRate", "temperature", "altitude", "humidity", "pressureHpa", "voltage",
  "batteryCells", "capacity", "stateOfCharge", "batteryTemp", "payloadX", "payloadY", "controlResponse",
  "maxTilt", "obstacleSize",
  "windTransition", "batteryResistance", "batteryCRating", "ct", "cp",
  "batteryHealth", "batteryMass", "cellCutoff", "reserveCharge", "escCurrentLimit", "escEfficiency",
  "avionicsPower", "controllerCutoff", "controllerRate", "sensorLatency",
  "bodyLength", "bodyWidth", "bodyHeight", "armLength", "armThickness", "frameStretch", "motorDiameter",
  "motorHeight", "motorKv", "motorResistance", "motorIdleCurrent"
];
const selectIds = ["dronePreset", "pressureMode", "icing", "flowObstacle", "bodyShape", "rotorLayout",
  "batteryChemistry", "temperatureMode", "motorModel"
];
const inputs = Object.fromEntries([...numberIds, ...selectIds].map(id => [id, $(id)]));
const flightCanvas = $("flightCanvas");
const graphCanvas = $("graphCanvas");
const airflowCanvas = $("airflowCanvas");
const graphRenderer = new GraphRenderer(graphCanvas);
const flightScene = new DroneScene3D(flightCanvas, "flight");
const airflowScene = new DroneScene3D(airflowCanvas, "airflow");
const graphTooltip = $("graphTooltip");

const ui = {
  thrustReserve: $("thrustReserve"),
  thrustRatio: $("thrustRatio"),
  tiltAngle: $("tiltAngle"),
  flightTime: $("flightTime"),
  powerDraw: $("powerDraw"),
  batteryCurrent: $("batteryCurrent"),
  batteryLoad: $("batteryLoad"),
  maxWind: $("maxWind"),
  displacement: $("displacement"),
  airDensity: $("airDensity"),
  peakWind: $("peakWind"),
  motorBalance: $("motorBalance"),
  effectiveRpm: $("effectiveRpm"),
  motorThermal: $("motorThermal"),
  flightStatus: $("flightStatus"),
  flowSpeed: $("flowSpeed"),
  flowDensity: $("flowDensity"),
  downwashSpeed: $("downwashSpeed"),
  cfdStatus: $("cfdStatus"),
  cfdCells: $("cfdCells"),
  reynoldsNumber: $("reynoldsNumber"),
  flowLegend: $("flowLegend")
};

const format = (value, digits = 1) => Number(value).toLocaleString(getLanguage() === "es" ? "es-ES" :
  getLanguage() === "en" ? "en-US" : "ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
let unitSystem = "metric";
try {
  if (localStorage.getItem("drone-lab-units") === "imperial") unitSystem = "imperial";
} catch {}
$("unitSystem").value = unitSystem;
let exactControls;
const quantity = (value, kind, digits = 1) =>
  `${format(toDisplay(value, kind, unitSystem), digits)} ${unitSpec(kind, unitSystem).label}`;
const visibleLoad = value => value > 500 ? ">500%" : `${format(value, 0)}%`;
// 0.93: winding health only; the temperature effect (weaker magnets) is applied in calculate from motorTemps.
const effectiveMotorHealths = () => state.motorHealths.map(h => h);
flightScene.quantity = airflowScene.quantity = quantity;

const outputConfig = {
  ...Object.fromEntries(Object.keys(builderDefaults).filter(id => typeof builderDefaults[id] === "number")
    .map(id => [id, v => id === "frameStretch" ? `${format(v, 2)}×` : `${Math.round(v)} мм`])),
  mass: value => `${format(value, 1)} кг`,
  payload: value => `${format(value, 1)} кг`,
  frameSize: value => `${Math.round(value)} мм`,
  diameter: value => `${format(value, 1)}″`,
  pitch: value => `${format(value, 1)}″`,
  dragArea: value => `${format(value, 2)} м²`,
  dragCoefficient: value => format(value, 2),
  propEfficiency: value => `${Math.round(value)}%`,
  rpm: value =>
    `${Math.round(value).toLocaleString(getLanguage() === "es" ? "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU")} об/мин`,
  maxRpm: value =>
    `${Math.round(value).toLocaleString(getLanguage() === "es" ? "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU")} об/мин`,
  motorMaxPower: value =>
    `${Math.round(value).toLocaleString(getLanguage() === "es" ? "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU")} Вт`,
  motorEfficiency: value => `${Math.round(value)}%`,
  windSpeed: value => `${format(value, 1)} м/с`,
  windDirection: value => `${Math.round(value)}°`,
  gusts: value => `${Math.round(value)}%`,
  gustFrequency: value => `${format(value, 1)} Гц`,
  turbulence: value => `${Math.round(value)}%`,
  verticalWind: value => `${format(value, 1)} м/с`,
  rainRate: value => `${Math.round(value)} мм/ч`,
  temperature: value => `${Math.round(value)} °C`,
  altitude: value =>
    `${Math.round(value).toLocaleString(getLanguage() === "es" ? "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU")} м`,
  humidity: value => `${Math.round(value)}%`,
  pressureHpa: value => `${Math.round(value)} гПа`,
  voltage: value => `${format(value, 1)} В`,
  capacity: value =>
    `${Math.round(value).toLocaleString(getLanguage() === "es" ? "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU")} мА·ч`,
  stateOfCharge: value => `${Math.round(value)}%`,
  batteryTemp: value => `${Math.round(value)} °C`,
  payloadX: value => `${Math.round(value)} см`,
  payloadY: value => `${Math.round(value)} см`,
  controlResponse: value => `${format(value, 1)} с`,
  maxTilt: value => `${Math.round(value)}°`,
  obstacleSize: value => `${format(value, 1)}×`,
  windTransition: value => `${format(value, 1)} с`,
  batteryResistance: value => `${format(value * 1000, 0)} мОм`,
  batteryHealth: value => `${format(value, 0)}%`,
  batteryMass: value => quantity(value, "kg", 2),
  cellCutoff: value => `${format(value, 2)} V`,
  reserveCharge: value => `${format(value, 0)}%`,
  escCurrentLimit: value => `${format(value, 1)} A`,
  escEfficiency: value => `${format(value, 1)}%`,
  avionicsPower: value => `${format(value, 1)} W`,
  controllerCutoff: value => `${format(value, 1)} V`,
  controllerRate: value => `${format(value, 0)} Hz`,
  sensorLatency: value => `${format(value, 1)} ms`,
  batteryCRating: value => `${format(value, 0)} C`,
  ct: value => format(value, 3),
  cp: value => format(value, 4),
  motorKv: value => `${Math.round(value)} об/мин/В`,
  motorResistance: value => `${format(value * 1000, 0)} мОм`,
  motorIdleCurrent: value => `${format(value, 2)} А`
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
  motorFire: [],
  motorLoads: [],
  motorActualRpms: [],
  motorExposure: [],
  motorIgnition: [],
  battery: null,
  batteryActual: null,
  escTemps: [],
  windVector: null,
  accumulator: 0,
  lastRender: 0,
  lastMetrics: 0,
  renderMs: 0,
  model: null,
  cadAerodynamics: null,
  modelDimensionsMm: null,
  modelUp: "z",
  forecast: null,
  forecastAt: -Infinity,
  autoFps: 60,
  lastPerformanceCheck: 0,
  lastGraphUpdate: 0
};
const liveOptions = (extra = {}) => ({
  motorRpms: state.motorRpms,
  motorHealths: effectiveMotorHealths(),
  motorTemps: state.motorTemps,
  batteryState: state.battery || initialBattery(getParameters()),
  escTemps: state.escTemps,
  ...extra
});
let parameterCache = null;
let customCG = null,
  workbench = null,
  activityLoop = null;
let flowSnapshot = {
  key: "",
  result: null
};

function cfdSettings() {
  return {
    quality: $("cfdQuality").value,
    solverMode: $("solverMode").value,
    iterationBudget: $("iterationBudget").value,
    smagorinsky: $("turbulenceModel").value === "smagorinsky" ? 0.12 : 0,
    rotorSwirl: $("rotorSwirl").checked,
    matchViscosity: $("matchViscosity")?.checked ?? true
  };
}

function meanFlowResult(parameters) {
  // A mean-flow solve must not restart at every animated gust or thermal time step.
  const healths = effectiveMotorHealths().map(h => Math.round(h * 10) / 10),
    temps = state.motorTemps.map(v => Math.round(v / 10) * 10);
  const key = JSON.stringify([parameters, state.motorRpms, healths, temps]);
  if (flowSnapshot.key !== key) flowSnapshot = {
    key,
    result: calculate(parameters, {
      motorRpms: state.motorRpms,
      motorHealths: healths,
      motorTemps: temps
    })
  };
  return flowSnapshot.result;
}

function drawResidual(stats) {
  const canvas = $("residualCanvas"),
    ctx = canvas.getContext("2d");
  const w = canvas.width,
    h = canvas.height,
    x0 = 64,
    y0 = 24,
    pw = w - 86,
    ph = h - 48;
  ctx.clearRect(0, 0, w, h);
  ctx.font = "12px monospace";
  const history = stats?.residualHistory || [];
  if (!history.length) return;
  const y = r => y0 + Math.min(1, Math.max(0, -Math.log10(Math.max(1e-5, r)) / 5)) * ph;
  for (const value of [1, 0.01, 0.001, 0.00001]) {
    ctx.strokeStyle = value === 0.001 ? "#75f3c8" : "#29463f";
    ctx.beginPath();
    ctx.moveTo(x0, y(value));
    ctx.lineTo(w - 22, y(value));
    ctx.stroke();
    ctx.fillStyle = "#a2bab3";
    ctx.fillText(t(`${value * 100}%`), 3, y(value) + 4);
  }
  const first = history[0].iteration,
    last = history[history.length - 1].iteration;
  ctx.strokeStyle = "#66d9ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  history.forEach((p, i) => {
    const x = x0 + (p.iteration - first) / Math.max(1, last - first) * pw;
    i ? ctx.lineTo(x, y(p.residual)) : ctx.moveTo(x, y(p.residual));
  });
  ctx.stroke();
  const forceHistory = stats?.forceHistory || [];
  ctx.strokeStyle = "#f6b766";
  ctx.beginPath();
  let forceStarted = false;
  for (const point of forceHistory) {
    if (!Number.isFinite(point.residual)) continue;
    const x = x0 + (point.iteration - first) / Math.max(1, last - first) * pw;
    forceStarted ? ctx.lineTo(x, y(point.residual)) : ctx.moveTo(x, y(point.residual));
    forceStarted = true;
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = "#a2bab3";
  ctx.fillText(t(`${first}`), x0, h - 5);
  ctx.fillText(t(`${last} итераций`), w - 142, h - 5);
  ctx.fillText(t("Невязка · скорость голубая, сила жёлтая · логарифмическая шкала"), x0, 14);
}

function updateProbe() {
  const field = airflowScene.cfd.field;
  if (!field || airflowScene.cfd.fieldKey !== airflowScene.cfd.desiredKey) {
    $("probeReading").textContent = "Дождись расчёта текущей конфигурации";
    return;
  }
  const position = ["probeX", "probeY", "probeZ"].map(id => Number($(id).value));
  const sample = sampleField(position.map(v => v / field.stats.worldScale), field);
  $("probeReading").textContent =
    `(${position.map(v => format(toDisplay(v, "m", unitSystem), 2)).join("; ")}) ${unitSpec("m", unitSystem).label} · ` +
    (sample ?
      `|u| ${quantity(sample.speed, "speed", 2)} · p ${quantity(sample.pressure, "pressure")} · |∇×u| ${format(sample.vorticity, 1)} с⁻¹` :
      "Внутри твёрдого тела или за границей области");
}

airflowScene.onCFDStatus = info => {
  $("continueCFD").disabled = info.status !== "ready";
  ui.cfdStatus.className = "";
  if (info.status === "ready" && info.stats) {
    workbench?.acceptCFD(info.stats, airflowScene.pendingCFD?.config);
    ui.cfdStatus.textContent =
      `${info.stats.converged ? "установился" : "приближение"} · ${info.stats.elapsedMs} мс`;
    ui.cfdCells.textContent =
      `${info.stats.cells.toLocaleString(getLanguage() === "es" ? "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU")} ячеек`;
    ui.reynoldsNumber.textContent = Math.round(info.stats.reynolds).toLocaleString(getLanguage() === "es" ?
      "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU");
    const s = info.stats;
    $("cfdDiagnostics").innerHTML =
      `<div class="diagnostic-grid">
      <span>Невязка<strong>${format(s.residual * 100, 2)}%</strong><small>Относительное изменение скорости за 20 итераций. Цель &lt; 0,1%; ${s.converged ? "достигнута" : "не достигнута, поле ещё меняется"}.</small></span>
      <span>Размер ячейки<strong>${quantity(s.spacingM * 1000, "mm", 2)}</strong><small>Детали меньше двух или трёх ячеек не разрешаются надёжно.</small></span>
      <span>Re решателя<strong>${format(s.effectiveReynolds, 0)}</strong><small>С повышенной численной вязкостью. Не равен физическому Re ${format(s.reynolds, 0)}.</small></span>
      <span>Сила дисков<strong>${quantity(s.appliedThrust, "force")}</strong><small>Интеграл источника импульса в воздухе, связан с вертикальной тягой.</small></span>
      <span>∇·u, RMS<strong>${format(s.divergenceRms, 2)} с⁻¹</strong><small>Остаточная сжимаемость / дискретизация вдали от стенок; в идеале ноль.</small></span>
      <span>Итерации<strong>${s.iterations} · ${format(s.simulatedTime, 2)} с</strong><small>Численное время установления, не время полёта.</small></span>
      <span>Сила на всех твёрдых телах<strong>${s.meanSurfaceForce.map(v => quantity(v, "force")).join("; ")}</strong><small>Среднее последних десяти измерений. По обмену импульсом, без связи с моделью полёта.</small></span>
      <span>Невязка силы<strong>${Number.isFinite(s.forceResidual) ? format(s.forceResidual * 100, 2) + "%" : "…"}</strong><small>Изменение силы за 20 итераций. Для остановки нужно меньше 0,5%.</small></span>
      <span>Баланс воздуха<strong>${format(s.massFlow.relativeImbalance * 100, 2)}%</strong><small>Разница входящего и выходящего массового расхода. Во время установления часть воздуха накапливается внутри.</small></span>
      <span>Пиковая добавочная вязкость<strong>${format(s.maxEddyViscosity, 6)} м²/с</strong><small>Модель LES оценивает перенос импульса неразрешёнными вихрями. Базовая вязкость решателя остаётся повышенной.</small></span>
      <span>Численная вязкость<strong>${format(s.numericalViscosity,6)} м²/с</strong><small>Сравнивай сетки при одной вязкости.</small></span>
      <span>Средняя плотность<strong>${format(s.densityDrift * 100, 3)}%</strong><small>Отклонение средней плотности от входной.</small></span>
    </div><p>${s.method}. Число Маха сетки: ${format(s.maxLatticeMach, 3)}; отклонение плотности до ${format(s.maxDensityDeviation * 100, 2)}%. ${s.maxLatticeMach > 0.2 ? "Высокая сжимаемость: результат требует осторожности." : ""} ${s.solidCells < 8 ? "Корпус плохо разрешён: увеличь сетку или размер модели." : ""} ${getParameters().dronePreset === "custom" && getParameters().armThickness < s.spacingM * 2000 ? "Лучи тоньше двух ячеек: их обтекание не разрешено." : ""} ${s.underresolvedDisks?.length ? `Недостаточно ячеек в дисках M${s.underresolvedDisks.join(", M")}: увеличь сетку.` : ""} Сеточная сходимость и сравнение с экспериментом не выполнены. CFD использует заданный начальный заряд батареи. Текущий разряд виден в режиме полёта. CFD использует средний ветер; доступность моторов с учётом температуры округлена до 10%. Давление относительно входа.</p>`;
    drawResidual(s);
    updateProbe();
  } else if (info.status === "cancelled" || info.status === "stale") {
    ui.cfdStatus.textContent = info.status === "cancelled" ? "Расчёт отменён" : "Поле устарело";
    $("cfdDiagnostics").textContent = "Нажми «Рассчитать поток» для текущих настроек.";
    updateProbe();
  } else if (info.status === "error") {
    ui.cfdStatus.textContent = "ошибка расчёта";
    ui.cfdStatus.classList.add("danger-text");
    $("cfdDiagnostics").textContent = info.error || "Расчёт не завершён.";
    drawResidual(null);
    updateProbe();
  } else {
    ui.cfdStatus.textContent =
      `расчёт ${Math.round((info.progress || 0) * 100)}%${info.iterations ? ` · ${info.iterations} ит.` : ""}`;
    ui.cfdStatus.classList.add("warning-text");
  }
};

function getParameters() {
  if (parameterCache) return parameterCache;
  const parameters = Object.fromEntries(numberIds.map(id => [id, Number(inputs[id].value)]));
  selectIds.forEach(id => {
    parameters[id] = inputs[id].value;
  });
  if (parameters.pressureMode === "auto") {
    parameters.pressureHpa = pressureFromAltitude(parameters.altitude) / 100;
  }
  if (parameters.temperatureMode === "standard") parameters.temperature = 15 - 0.0065 * parameters.altitude;
  parameters.rotors = Number(parameters.rotors);
  if (parameters.batteryCells > 0) parameters.voltage = parameters.batteryCells * (curves[parameters
    .batteryChemistry] || curves.lipo).nominal;
  if (state.cadAerodynamics && $("cadDrag").checked) parameters.cadAerodynamics = state.cadAerodynamics;
  if (customCG) parameters.customCG = [...customCG];
  parameters.calibratedProps = $("calibratedProps").checked;
  parameterCache = parameters;
  return parameterCache;
}

function invalidateParameters() {
  parameterCache = null;
  state.graphDirty = true;
  syncOutputs(getParameters());
}

function motorRpms(parameters) {
  if (!$("individualMotors").checked) return Array.from({
    length: parameters.rotors
  }, () => parameters.rpm);
  return Array.from({
    length: parameters.rotors
  }, (_, index) => {
    const input = $(`motorRpm${index}`),
      value = Number(input?.value);
    return input && input.value !== "" && Number.isFinite(value) && value >= 0 && value <= 28000 ? value :
      state.motorRpms[index] ?? parameters.rpm;
  });
}

function ensureMotorState(parameters, reset = false) {
  const ambient = parameters.temperature;
  state.motorTemps = Array.from({
    length: parameters.rotors
  }, (_, index) => reset ? ambient : state.motorTemps[index] ?? ambient);
  state.motorHealths = Array.from({
    length: parameters.rotors
  }, (_, index) => reset ? 1 : state.motorHealths[index] ?? 1);
  state.motorFire = Array.from({
    length: parameters.rotors
  }, (_, index) => reset ? 0 : state.motorFire[index] ?? 0);
  state.motorExposure = Array.from({
    length: parameters.rotors
  }, (_, index) => reset ? 0 : state.motorExposure[index] ?? 0);
  state.motorIgnition = Array.from({
    length: parameters.rotors
  }, (_, index) => reset ? 0 : state.motorIgnition[index] ?? 0);
}

function updateOutput(id, value) {
  const output = $(`${id}Value`);
  if (output && outputConfig[id]) output.textContent = parameterUnits[id] ? quantity(value, parameterUnits[
    id], ["dragArea", "batteryResistance"].includes(id) ? 3 : 2) : outputConfig[id](value);
}

function syncOutputs(parameters) {
  Object.keys(outputConfig).forEach(id => updateOutput(id, parameters[id]));
  if (parameters.pressureMode === "auto") {
    inputs.pressureHpa.value = Math.round(parameters.pressureHpa);
    updateOutput("pressureHpa", parameters.pressureHpa);
  }
  inputs.voltage.disabled = parameters.batteryCells > 0;
  if (inputs.voltage.disabled) inputs.voltage.value = String(parameters.voltage);
  const cells = batterySeries(parameters),
    nominal = cells * (curves[parameters.batteryChemistry] || curves.lipo).nominal;
  $("batterySeriesHint").textContent =
    `${cells}S · ${format(nominal, 1)} V номинал · ${format(cells * 4.2, 1)} V полный заряд. Масса аккумулятора входит в массу дрона; отдельно повторно не прибавляется.`;
  inputs.dragArea.disabled = Boolean(parameters.cadAerodynamics);
  inputs.temperature.disabled = parameters.temperatureMode === "standard";
  if (inputs.temperature.disabled) inputs.temperature.value = String(parameters.temperature);
  inputs.pressureHpa.disabled = parameters.pressureMode !== "manual";
  inputs.ct.disabled = inputs.cp.disabled = !parameters.calibratedProps;
  // 0.94: Kv, winding resistance and idle current belong to the datasheet model; fixed efficiency to the simple one.
  const datasheetMotor = parameters.motorModel === "datasheet";
  document.querySelectorAll(".datasheet-only").forEach(label => label.hidden = !datasheetMotor);
  inputs.motorEfficiency.disabled = datasheetMotor;
  const custom = parameters.dronePreset === "custom";
  $("builderPanel").hidden = !custom;
  inputs.frameSize.disabled = custom;
  if (custom) {
    const g = designGeometry(parameters);
    updateOutput("frameSize", g.frameSize);
    $("builderSummary").textContent =
      `Габарит рамы по осям: ${quantity(g.frameSize, "mm", 2)} · объём корпуса: ${quantity(g.bodyVolume * 1000, "volume", 3)} · зазор винтов: ${quantity(g.clearance * 1000, "mm", 2)}.${g.clearance < 0 ? " ВНИМАНИЕ: винты пересекаются. Увеличь лучи или уменьши диаметр." : ""}`;
  }
  $("streamlineCountValue").textContent = $("streamlineCount").value;
  $("airflowZoomValue").textContent = `${format($("airflowZoom").value, 1)}×`;
  exactControls?.refresh();
  if (parameters.pressureMode === "auto" && $("pressureHpaExact")) $("pressureHpaExact").value = String(
    Number(toDisplay(parameters.pressureHpa, "hpa", unitSystem).toPrecision(12)));
}

function setStatus(parameters, result, peakWind) {
  const status = ui.flightStatus;
  status.className = "status";
  let text = "Стабильно";
  const hottestMotor = Math.max(...state.motorTemps);
  const weakestMotor = Math.min(...state.motorHealths);
  const strongestFire = Math.max(...state.motorFire);
  const actualLoad = Math.max(0, ...state.motorLoads);
  const stand = $("standTest").checked;
  // 0.93: the order goes from what has already happened (power loss, fire, failure) to what is about to happen.
  if (!result.battery.controllerPowered) {
    status.classList.add("danger");
    text = (state.battery?.temperature ?? 0) >= 75 ? "Батарея перегрелась: питание отключено" :
      "Контроллер без питания";
  } else if (strongestFire > 0.06) {
    status.classList.add("danger");
    text = "Возгорание мотора";
  } else if (weakestMotor < 0.18) {
    status.classList.add("danger");
    // 0.94: what the re-mixed motors cannot hold after the failure.
    text = Math.abs(state.allocation?.yawError ?? 0) > 0.05 ? "Отказ двигателя: дрон вращается" : (state
      .allocation?.thrustError ?? 0) < -0.01 ? "Отказ двигателя: тяги не хватает" : "Отказ двигателя";
  } else if (hottestMotor > 125) {
    status.classList.add("danger");
    text = "Критический перегрев";
  } else if (Math.max(...state.escTemps) > 95) {
    status.classList.add("warning");
    text = "ESC снижает мощность";
  } else if (hottestMotor > 88 || weakestMotor < 0.75) {
    status.classList.add("warning");
    text = "Деградация двигателя";
  } else if (stand) {
    if (actualLoad > 100) status.classList.add("warning");
    text = `Стендовый тест · нагрузка ${visibleLoad(actualLoad)}`;
  } else if (!result.thrustFeasible) {
    status.classList.add("danger");
    text = "Тяги недостаточно";
  } else if (!result.tiltFeasible) {
    status.classList.add("danger");
    text = "Превышен предел наклона";
  } else if (!result.powerFeasible) {
    status.classList.add("danger");
    text = "Мощности недостаточно";
  } else if (!result.batteryFeasible) {
    status.classList.add("danger");
    text = "Батарея не держит нагрузку";
  } else if (actualLoad > 100 || result.motorOverload) {
    status.classList.add("warning");
    text = "Моторы выше номинала: нагрев";
  } else if (result.commandLimited) {
    status.classList.add("warning");
    text = result.voltageLimited ? "Обороты ограничены напряжением и Kv" :
      "Команда RPM выше предела: обороты ограничены";
  } else if (result.icingRisk) {
    status.classList.add("warning");
    text = "Возможное обледенение";
  } else if (result.reserve < 20 || peakWind > result.maxWind) {
    status.classList.add("warning");
    text = "Малый запас";
  }
  const statusHtml = `<span></span> ${text}`;
  if (status.dataset.html !== statusHtml) {
    status.dataset.html = statusHtml;
    status.innerHTML = statusHtml;
  }
}

// 0.95: write text only when it changed; unchanged writes still cost layout and re-translation.
// The comparison uses the text the app wrote, not the DOM text, which the translator may have changed.
const writtenText = new WeakMap();
function setText(element, text) {
  if (!element) return;
  const value = String(text);
  if (writtenText.get(element) === value && element.isConnected) return;
  writtenText.set(element, value);
  element.textContent = value;
}

function updateMetrics(parameters, result) {
  const peakWind = parameters.windSpeed * (1 + parameters.gusts / 100);
  const peakResult = calculate(parameters, liveOptions({
    windSpeed: peakWind
  }));
  setText(ui.thrustReserve, `${format(peakResult.reserve, 0)}%`);
  setText(ui.thrustRatio, `${format(result.thrustToWeight, 2)} : 1 тяга/вес`);
  setText(ui.tiltAngle, `${format(result.tilt, 1)}°`);
  if (!state.forecast || state.forecastParameters !== parameters || state.t - state.forecastAt > 2) {
    state.forecast = forecastBattery(parameters, state.battery || initialBattery(parameters), peakResult
      .electricalPower, peakWind, peakResult.density);
    state.forecastParameters = parameters;
    state.forecastAt = state.t;
  }
  setText(ui.flightTime, peakResult.feasible ? `${format(state.forecast.minutes, 1)} мин` :
    "Нет зависания");
  const reasons = {
    reserve: "до заданного резерва",
    cutoff: "до отсечки напряжения",
    "power-limit": "до ограничения мощности",
    temperature: "до тепловой защиты",
    "time-limit": "горизонт прогноза: 6 часов"
  };
  $("enduranceReason").textContent =
    `${reasons[state.forecast.reason]} · при постоянной мощности для пикового ветра`;
  setText(ui.powerDraw, peakResult.feasible ? `${format(peakResult.electricalPower, 0)} Вт` :
    "режим полёта невозможен");
  const actualBattery = state.batteryActual || result.battery;
  setText(ui.batteryCurrent, `${format(actualBattery.current, 1)} А`);
  ui.batteryLoad.textContent =
    `команда ${visibleLoad(peakResult.commandPowerLoad)} · полёт ${visibleLoad(peakResult.requiredPowerLoad)}`;
  setText(ui.maxWind, quantity(result.maxWind, "speed"));
  setText(ui.airDensity, quantity(result.density, "density", unitSystem === "imperial" ? 5 : 3));
  setText(ui.peakWind, quantity(peakWind, "speed"));
  setText(ui.motorBalance, `${format(result.balancePercent, 0)}%`);
  const averageEffectiveRpm = result.effectiveRpms.reduce((sum, value) => sum + value, 0) / Math.max(1, result
    .effectiveRpms.length);
  // 0.93: actual spinning speed (hover share in flight, full command on the stand), the command after limits,
  // and the hard limit from ESC, battery and maximum RPM.
  const locale = getLanguage() === "es" ? "es-ES" : getLanguage() === "en" ? "en-US" : "ru-RU",
    actualRpms = state.motorActualRpms.length ? state.motorActualRpms : result.effectiveRpms,
    averageActualRpm = actualRpms.reduce((sum, value) => sum + value, 0) / Math.max(1, actualRpms.length);
  ui.effectiveRpm.textContent =
    `${Math.round(averageActualRpm).toLocaleString(locale)} · команда ${Math.round(averageEffectiveRpm).toLocaleString(locale)} · предел ${Math.round(Math.min(parameters.maxRpm, result.rpmPowerLimit)).toLocaleString(locale)}`;
  const hottestMotor = Math.max(...state.motorTemps);
  const weakestMotor = Math.min(...state.motorHealths);
  const actualLoads = state.motorLoads.length ? state.motorLoads : result.motorLoadPercents;
  const hottestLoad = Math.max(...actualLoads);
  ui.motorThermal.textContent =
    `${quantity(hottestMotor, "temperature", 0)} · ресурс ${format(weakestMotor * 100, 0)}% · нагрузка ${visibleLoad(hottestLoad)}`;
  ui.motorThermal.classList.toggle("danger-text", hottestMotor > 120 || weakestMotor < 0.5);
  ui.motorThermal.classList.toggle("warning-text", hottestMotor > 85 && hottestMotor <= 120);
  setText(ui.displacement, quantity(Math.hypot(state.x, state.y, state.z), "m", 2));
  document.querySelectorAll(".motor-condition").forEach((element, index) => {
    const temperature = state.motorTemps[index] ?? parameters.temperature;
    const health = state.motorHealths[index] ?? 1;
    const load = actualLoads[index] ?? 0;
    element.textContent =
      `${quantity(temperature, "temperature", 0)} · ${format(health * 100, 0)}% · ${visibleLoad(load)}`;
    element.classList.toggle("danger-text", temperature > 120 || health < 0.5 || load > 140);
    element.classList.toggle("warning-text", !element.classList.contains("danger-text") && (temperature >
      85 || load > 100));
  });
  setText(ui.flowSpeed, quantity(parameters.windSpeed, "speed"));
  setText(ui.flowDensity, `${$("streamlineCount").value} линий`);
  setText(ui.downwashSpeed, quantity(result.downwashSpeed, "speed"));
  updateMotorCards(parameters, result);
  const engineering = [
    ...(state.batteryActual && state.powerBudget ? [
      ["Расход мощности", `${format(state.powerBudget.delivered,0)} Вт`,
        `На валах ${format(state.powerBudget.shaft,0)} Вт · потери моторов ${format(state.powerBudget.motorHeat,1)} Вт · ESC ${format(state.powerBudget.esc,1)} Вт · электроника ${format(state.powerBudget.avionics,1)} Вт. Потери батареи ${format(state.powerBudget.batteryHeat,1)} Вт; запасание в RC ${format(state.powerBudget.rcStorage,1)} Вт.`
      ]
    ] : []),
    ["Давление ветра", quantity(result.dynamicPressure, "pressure"),
      "q = ½ρV². Удвоение скорости даёт четырёхкратное давление."
    ],
    ["Нагрузка на диск", quantity(result.diskLoading, "pressure"),
      "Вес / суммарная площадь дисков. Меньшая нагрузка снижает идеальные затраты на зависание."
    ],
    ["Идеальная мощность", `${format(result.inducedPower, 0)} Вт`,
      "Нижняя оценка по теории импульса, без профильных и электрических потерь."
    ],
    ["Конец лопасти", `${format(result.tipMach, 2)} M`,
      "Число Маха показывает скорость относительно скорости звука. При M > 0,65 простая модель винта ненадёжна."
    ],
    ["Батарея под нагрузкой", `${format(result.terminalVoltage, 1)} В`,
      `Просадка ${format(result.voltageSag, 1)} В; тепловые потери: ${format(result.batteryHeat, 0)} Вт. Сопротивление зависит от температуры и ресурса, RC-ветвь моделирует задержанную просадку.`
    ],
    ["Дальняя струя, идеал", quantity(result.farWakeSpeed, "speed"),
      "В штиле далеко под идеальным диском: ≈2vᵢ. Не измеренная скорость из CFD."
    ],
    ["Ветер сейчас", quantity(state.windNow, "speed"),
      "Порывы и плавный переход в динамике полёта. CFD рассчитывает среднее поле."
    ],
    ["Отрисовка", `${format(state.renderMs, 1)} мс`,
      "Время последнего кадра, не гарантия FPS. Авто снижает частоту и разрешение при нагрузке."
    ]
  ];
  $("engineeringMetrics").innerHTML = engineering.map(([label, value, help]) =>
    `<span>${label}<strong>${value}</strong><small>${help}</small></span>`).join("");
  const warnings = [];
  if (result.propOverlap) warnings.push(
    "Диаметры винтов больше расстояния между соседними моторами: диски перекрываются. Увеличь раму или уменьши винты; расчёт независимых дисков в этом режиме ненадёжен."
  );
  if (result.tipMach > 0.65) warnings.push(
    "Высокая скорость концов лопастей: сжимаемость и шум здесь не моделируются.");
  if (result.hoverShaftPower < result.inducedPower) warnings.push(
    "Выбранные Cₜ/Cₚ дают мощность ниже идеальной: коэффициенты физически несогласованы.");
  if (!result.batteryFeasible) warnings.push("Превышена токоотдача или слишком большая просадка батареи.");
  setText($("engineeringWarnings"), warnings.join(" "));
  $("engineeringWarnings").className = warnings.length ? "warning-text" : "";
  updatePowerTelemetry(parameters, result, actualBattery);
  setStatus(parameters, peakResult, peakWind);
}

function replaceBattery() {
  state.battery = initialBattery(getParameters());
  state.batteryActual = null;
  state.powerBudget = null;
  state.forecast = null;
  state.graphDirty = true;
  state.lastMetrics = 0;
}

function resetDynamics(repair = true) {
  Object.assign(state, {
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
    windVector: null,
    accumulator: 0,
    trail: [],
    motorLoads: [],
    motorActualRpms: [],
    motorDraws: [],
    yaw: 0,
    yawRate: 0,
    allocation: null
  });
  ensureMotorState(getParameters(), repair);
  if (repair) {
    replaceBattery();
    state.escTemps = Array(getParameters().rotors).fill(getParameters().temperature);
  }
}

function updateMotorCards(parameters, result) {
  const container = $("motorCards");
  if (container.children.length !== parameters.rotors) {
    container.replaceChildren();
    for (let i = 0; i < parameters.rotors; i++) {
      const card = document.createElement("article");
      card.className = "motor-card";
      container.append(card);
    }
  }
  Array.from(container.children).forEach((card, i) => {
    const temp = state.motorTemps[i],
      health = state.motorHealths[i],
      availability = thermalAvailability(temp);
    const failed = health < 0.18,
      burning = state.motorFire[i] > 0.06;
    // 0.93: the card shows the power the motor really draws and its real speed.
    const load = state.motorLoads[i] ?? result.motorLoadPercents[i] ?? 0,
      rpm = state.motorActualRpms[i] ?? result.effectiveRpms[i] ?? 0;
    // 0.94: the datasheet model shows the motor current and efficiency at the real operating point.
    const datasheet = parameters.motorModel === "datasheet",
      draw = state.motorDraws?.[i];
    const label = burning ? "Огонь" : failed ? "Отказ" : temp > 125 ? "Перегрев" : datasheet ? temp > 95 ?
      "Магниты слабеют" : load > 100 ? "Перегрузка" : "Норма" : availability < 1 ?
      "Магниты слабеют" : load > 100 ? "Перегрузка" : "Норма";
    const detail = datasheet && draw && Number.isFinite(draw.current) ?
      `Ток ${format(draw.current, 1)} А · КПД ${format(draw.efficiency * 100, 0)}% · ${format(rpm, 0)} RPM` :
      `Магниты ${format(availability * 100, 0)}% · ${format(rpm, 0)} RPM`;
    const cardClass = `motor-card ${burning || failed ? "critical" : temp > 95 ? "warm" : ""}`;
    if (card.className !== cardClass) card.className = cardClass;
    // 0.95: rebuild a card only when its text changed (fewer DOM changes and fewer re-translations).
    const html =
      `<header><strong>M${i + 1}</strong><span>${label}</span></header><div class="motor-temperature">${quantity(temp, "temperature", 0)}</div><div class="health-track"><i style="width:${health * 100}%"></i></div><small>Ресурс ${format(health * 100, 0)}% · нагрузка ${visibleLoad(load)}</small><small>${detail}</small>`;
    if (card.dataset.html !== html) {
      card.dataset.html = html;
      card.innerHTML = html;
    }
  });
}

function buildMotorGrid() {
  const parameters = getParameters();
  ensureMotorState(parameters);
  const grid = $("motorGrid");
  const enabled = $("individualMotors").checked;
  grid.hidden = !enabled;
  if (!enabled) {
    state.motorRpms = Array.from({
      length: parameters.rotors
    }, () => parameters.rpm);
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
    input.addEventListener("input", () => {
      input.setCustomValidity(input.validity.rangeOverflow || input.validity.rangeUnderflow ?
        "Обороты от 0 до 28000." : "");
      if (!input.checkValidity() || input.value === "") return;
      state.motorRpms = motorRpms(getParameters());
      state.graphDirty = true;
    });
    label.append(input);
    const condition = document.createElement("span");
    condition.className = "motor-condition";
    condition.textContent = ":° · :% · :%";
    condition.title = "Температура · ресурс · нагрузка";
    label.append(condition);
    grid.append(label);
  }
  state.motorRpms = motorRpms(parameters);
}

function applyPreset(key) {
  customCG = null;
  if (key === "custom") {
    if (state.model) $("removeModel").click();
    parameterCache = null;
    syncOutputs(getParameters());
    buildMotorGrid();
    resetDynamics();
    return;
  }
  const preset = dronePresets[key];
  if (!preset) return;
  $("calibratedProps").checked=false;inputs.ct.value=String(baseDefaults.ct);inputs.cp.value=String(baseDefaults.cp);
  Object.entries(preset).forEach(([id, value]) => {
    if (inputs[id] && typeof value !== "string") inputs[id].value = String(value);
  });
  // 0.95: a preset may carry measured propeller coefficients (the racer's three-blade propeller).
  if (preset.calibratedProps) $("calibratedProps").checked = true;
  inputs.rotors.value = String(preset.rotors);
  inputs.batteryCells.value = "0";
  inputs.batteryChemistry.value = "lipo";
  inputs.dronePreset.value = key;
  parameterCache = null;
  $("individualMotors").checked = false;
  buildMotorGrid();
  resetDynamics();
  syncOutputs(getParameters());
  if (state.model) refreshModel();
}

function simulate(dt, parameters) {
  const gustPhase = state.t * parameters.gustFrequency * Math.PI * 2;
  const turbulence = parameters.turbulence / 100;
  const gustWave = 0.62 * Math.sin(gustPhase) + 0.25 * Math.sin(gustPhase * 2.17 + 1.3) + 0.13 * Math.sin(
    gustPhase * 4.8 + 0.2);
  const targetWind = Math.max(0, parameters.windSpeed * (1 + parameters.gusts / 100 * gustWave + turbulence *
    0.08 * Math.sin(state.t * 8.7)));
  const windAngle = parameters.windDirection * Math.PI / 180 + turbulence * 0.18 * Math.sin(state.t * 3.4);
  const target = [Math.cos(windAngle) * targetWind, Math.sin(windAngle) * targetWind];
  if (!state.windVector) state.windVector = target;
  const blend = 1 - Math.exp(-dt / parameters.windTransition);
  state.windVector = state.windVector.map((v, i) => v + (target[i] - v) * blend);
  const windNow = Math.hypot(...state.windVector);
  if (!state.battery || !$("batteryDrain").checked) state.battery = initialBattery(parameters);
  const relative = relativeAirflow(parameters, [state.vx, state.vy, state.vz], state.windVector);
  const dynamicResult = calculate(parameters, liveOptions(relative));
  const relativeAngle = relative.windDirection * Math.PI / 180;
  const windX = dynamicResult.windForce * Math.cos(relativeAngle);
  const windY = dynamicResult.windForce * Math.sin(relativeAngle);
  const response = Math.max(0.2, parameters.controlResponse + parameters.sensorLatency / 1000 + 0.5 /
    parameters.controllerRate);
  const kp = 1.15 / response;
  const kd = 1.7 / Math.sqrt(response);
  const ki = 0.14 / response;
  state.ix = Math.max(-25, Math.min(25, state.ix + state.x * dt));
  state.iy = Math.max(-25, Math.min(25, state.iy + state.y * dt));
  let controlX = -dynamicResult.mass * (kp * state.x + kd * state.vx + ki * state.ix);
  let controlY = -dynamicResult.mass * (kp * state.y + kd * state.vy + ki * state.iy);
  if (!dynamicResult.battery.controllerPowered) controlX = controlY = 0;
  const controlMagnitude = Math.hypot(controlX, controlY);
  if (controlMagnitude > dynamicResult.horizontalAuthority && controlMagnitude > 0) {
    const scale = dynamicResult.horizontalAuthority / controlMagnitude;
    controlX *= scale;
    controlY *= scale;
  }
  const arm = Math.max(0.05, (parameters.dronePreset === "custom" ? designGeometry(parameters).frameSize :
    parameters.frameSize) / 2000);
  const imbalanceX = -dynamicResult.pitchMoment / arm * 0.12;
  const imbalanceY = dynamicResult.rollMoment / arm * 0.12;
  const ax = (windX + controlX + imbalanceX) / dynamicResult.mass;
  const ay = (windY + controlY + imbalanceY) / dynamicResult.mass;
  const verticalAuthority = Math.sqrt(Math.max(0, dynamicResult.availableThrust ** 2 - Math.hypot(controlX,
    controlY) ** 2));
  const desiredVerticalThrust = Math.max(0, dynamicResult.requiredVertical - dynamicResult.mass * (1.7 * state
    .z + 1.45 * state.vz));
  // 0.94: after a motor failure the re-mixed motors may not lift the full weight (thrustError < 0).
  const liftShare = state.allocation ? Math.max(0, 1 + Math.min(0, state.allocation.thrustError)) : 1;
  const actualVerticalThrust = dynamicResult.battery.controllerPowered ? Math.min(verticalAuthority * liftShare,
    desiredVerticalThrust) : 0;
  state.actualVerticalThrust = actualVerticalThrust;
  const az = (actualVerticalThrust - dynamicResult.verticalDemand) / dynamicResult.mass;
  // 0.93: on the test stand the frame is fixed and every motor spins at the commanded RPM
  // (after the ESC, battery and maximum-RPM limits). In flight the controller only uses the thrust it needs.
  const stand = $("standTest")?.checked === true;
  if (stand) {
    state.vx = state.vy = state.vz = 0;
    state.ix = state.iy = 0;
  } else {
    state.vx = (state.vx + ax * dt) * Math.pow(0.996, dt * 60);
    state.vy = (state.vy + ay * dt) * Math.pow(0.996, dt * 60);
    state.vz = (state.vz + az * dt) * Math.pow(0.998, dt * 60);
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.z = Math.max(-30, Math.min(12, state.z + state.vz * dt));
  }
  state.controlX = stand ? 0 : controlX;
  state.controlY = stand ? 0 : controlY;
  state.windNow = windNow;
  const actualThrust = stand ? dynamicResult.availableThrust : Math.hypot(actualVerticalThrust, controlX,
    controlY);
  const thrustFraction = Math.min(1, actualThrust / Math.max(1e-9, dynamicResult.availableThrust));
  const powerFraction = thrustFraction ** 1.5;
  // Thrust ∝ RPM², so the spinning speed is the commanded speed times √(thrust share).
  // 0.94: with a failed motor in flight the controller re-mixes. The motor-limited mixer (0.93.1) gives every
  // working motor its own thrust: roll and pitch first, then lift, and yaw is given up first, so a quadcopter
  // spins while a hexacopter can hold its heading. The working motors carry more and heat more.
  const failedInFlight = !stand && state.motorHealths.some(health => health < 0.18);
  let actualRpms, actualShafts;
  state.allocation = null;
  if (failedInFlight && actualThrust > 1e-6) {
    const average = actualThrust / parameters.rotors;
    const allocation = cgAllocation([0, 0], rotorPlanPositions(parameters), dynamicResult.thrusts.map(thrust =>
      thrust / Math.max(1e-9, average)), actualThrust);
    state.allocation = allocation;
    const thrustScale = dynamicResult.thrustCoefficient * dynamicResult.density * dynamicResult.diameterM ** 4;
    actualRpms = allocation.shares.map(share => 60 * Math.sqrt(Math.max(0, share * average) / Math.max(1e-12,
      thrustScale)));
    actualShafts = actualRpms.map(rpm => dynamicResult.powerCoefficient * dynamicResult.density * (rpm / 60) **
      3 * dynamicResult.diameterM ** 5);
  } else {
    actualRpms = dynamicResult.effectiveRpms.map(rpm => rpm * Math.sqrt(thrustFraction));
    actualShafts = dynamicResult.shaftPowers.map(power => power * powerFraction);
  }
  state.motorActualRpms = actualRpms;
  // Uneven torque from the re-mixed motors turns the frame; air drag on the frame limits the spin rate.
  const yawError = state.allocation?.yawError ?? 0;
  state.yawRate = (state.yawRate || 0) + (yawError * 14 - (state.yawRate || 0) * 1.2) * dt;
  if (Math.abs(yawError) < 0.02) state.yawRate *= Math.exp(-3 * dt);
  state.yaw = ((state.yaw || 0) + state.yawRate * dt) % (Math.PI * 2);
  // 0.94: input power and losses at the real operating point (fixed efficiency or the datasheet model).
  const draws = motorDraw(parameters, dynamicResult, actualRpms, actualShafts, state.motorTemps, state
    .motorHealths);
  state.motorDraws = draws;
  const motorPowers = draws.map(draw => draw.input);
  const actualPower = motorPowers.reduce((sum, power) => sum + power, 0) / dynamicResult.escEfficiency +
    dynamicResult.avionicsPower;
  state.batteryActual = batteryCircuit(parameters, state.battery, actualPower);
  state.powerBudget = powerBudget(state.batteryActual, motorPowers, dynamicResult.motorEfficiencies,
    dynamicResult.escEfficiency, dynamicResult.avionicsPower);
  if ($("batteryDrain").checked) state.battery = stepBattery(state.battery, parameters, state.batteryActual,
    windNow, dynamicResult.density, dt);
  state.escTemps = stepESC(state.escTemps, parameters, motorPowers, state.batteryActual.terminalVoltage,
    windNow, dynamicResult.density, dt);
  // Heating follows the power each motor actually draws, relative to its continuous rating.
  state.motorLoads = motorPowers.map(power => power / Math.max(1, parameters.motorMaxPower) * 100);
  updateMotorThermals(dt, parameters, {
    ...dynamicResult,
    motorThermalLoadPercents: state.motorLoads,
    motorLossWatts: draws.map(draw => draw.loss)
  });
  state.t += dt;
  if (state.t % 0.075 < dt) {
    state.trail.push({
      x: state.x,
      y: state.y,
      z: state.z,
      t: state.t
    });
    if (state.trail.length > 280) state.trail.shift();
  }
  return dynamicResult;
}

function updateMotorThermals(dt, parameters, result) {
  const next = stepMotorThermals({
    temperatures: state.motorTemps,
    healths: state.motorHealths,
    fires: state.motorFire,
    exposure: state.motorExposure,
    ignition: state.motorIgnition
  }, parameters, result, state.windNow, dt);
  state.motorTemps = next.temperatures;
  state.motorHealths = next.healths;
  state.motorFire = next.fires;
  state.motorExposure = next.exposure;
  state.motorIgnition = next.ignition;
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
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
    from = variable.min;
    to = variable.max;
  }
  if (from > to)[from, to] = [to, from];
  from = Math.max(variable.min, Math.min(variable.max, from));
  to = Math.max(variable.min, Math.min(variable.max, to));
  if (from === to) {
    from = variable.min;
    to = variable.max;
  }
  $("graphFrom").value = String(toDisplay(from, parameterUnits[variableName], unitSystem));
  $("graphTo").value = String(toDisplay(to, parameterUnits[variableName], unitSystem));
  const points = graphSeries(parameters, variableName, metricName, from, to, 100, {
    motorRpms: state.motorRpms,
    motorHealths: effectiveMotorHealths(),
    motorTemps: state.motorTemps,
    batteryState: state.battery,
    escTemps: state.escTemps
  });
  const xKind = parameterUnits[variableName],
    yKind = graphKinds[metricName];
  const displayPoints = points.map(p => ({
    ...p,
    x: toDisplay(p.x, xKind, unitSystem),
    y: toDisplay(p.y, yKind, unitSystem)
  }));
  if (points.length) graphRenderer.draw(displayPoints, {
    ...variable,
    unit: xKind ? unitSpec(xKind, unitSystem).label : variable.unit
  }, {
    ...metric,
    unit: yKind ? unitSpec(yKind, unitSystem).label : metric.unit
  }, toDisplay(parameters[variableName], xKind, unitSystem), format);
  $("graphFormula").textContent = metric.formula;
}

function setActiveView(view) {
  document.querySelector?.(".app-shell")?.setAttribute("data-view", view);
  state.activeView = view;
  if (view === "graph") state.graphDirty = true;
  document.querySelectorAll(".mode-tab").forEach(tab => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".view-panel").forEach(panel => {
    const active = panel.id === `${view}View`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

document.querySelectorAll(".mode-tab").forEach(tab => tab.addEventListener("click", () => setActiveView(tab
  .dataset.view)));

// 0.95: a bigger battery is heavier. When capacity, voltage, cell count or chemistry change, the battery mass
// follows its energy at the pack's own Wh/kg (scaled by chemistry), and the drone mass changes by the same amount.
let batteryBaseline = null;
const batteryInputs = ["capacity", "voltage", "batteryCells", "batteryChemistry"];
function adjustBatteryMass(event) {
  const id = event.target?.id;
  if (!batteryInputs.includes(id)) return;
  const before = parameterCache || batteryBaseline;
  if (!before || !$("batteryMassAuto").checked) return;
  const value = id === "batteryChemistry" ? inputs[id].value : Number(inputs[id].value);
  const after = {
    ...before,
    [id]: value
  };
  if (id === "voltage") after.batteryCells = 0;
  const oldWh = packEnergyWh(before),
    newWh = packEnergyWh(after);
  if (!(oldWh > 0) || !(before.batteryMass > 0)) return;
  const perKg = oldWh / before.batteryMass * (packSpecificEnergy[after.batteryChemistry] || 165) / (packSpecificEnergy[
    before.batteryChemistry] || 165);
  const batteryMass = Math.min(8, Math.max(0.005, newWh / perKg));
  const delta = batteryMass - Number(inputs.batteryMass.value);
  const mass = Math.min(Number(inputs.mass.max), Math.max(Number(inputs.mass.min), Number(inputs.mass.value) + delta));
  inputs.batteryMass.value = String(batteryMass);
  inputs.mass.value = String(mass);
  batteryBaseline = {
    ...after,
    batteryMass,
    mass
  };
}
document.addEventListener("input", adjustBatteryMass, true);
document.addEventListener("change", event => {
  if (event.target?.id === "batteryChemistry") adjustBatteryMass(event);
}, true);
numberIds.forEach(id => inputs[id].addEventListener("input", () => {
  parameterCache = null;
  state.batteryActual = null;
  if (id === "rotors") buildMotorGrid();
  if (["voltage", "batteryCells", "capacity", "stateOfCharge", "batteryTemp", "batteryHealth"].includes(
      id)) replaceBattery();
  if (id === "rpm" && !$("individualMotors").checked) state.motorRpms = motorRpms(getParameters());
  updateOutput(id, Number(inputs[id].value));
  state.graphDirty = true;
  syncOutputs(getParameters());
  if ((id === "frameSize" || id in builderDefaults) && state.model) refreshModel();
}));
selectIds.forEach(id => inputs[id].addEventListener("change", () => {
  state.batteryActual = null;
  invalidateParameters();
  if (id === "batteryChemistry") replaceBattery();
}));
$("calibratedProps").addEventListener("change", invalidateParameters);

inputs.dronePreset.addEventListener("change", event => {
  applyPreset(event.target.value);
  state.graphDirty = true;
});
inputs.pressureMode.addEventListener("change", () => {
  inputs.pressureHpa.disabled = inputs.pressureMode.value !== "manual";
  state.graphDirty = true;
});
inputs.icing.addEventListener("change", () => {
  state.graphDirty = true;
});
$("individualMotors").addEventListener("change", () => {
  buildMotorGrid();
  state.graphDirty = true;
});
$("graphVariable").addEventListener("change", event => {
  graphRangeFor(event.target.value);
  state.graphDirty = true;
});
$("graphMetric").addEventListener("change", () => {
  state.graphDirty = true;
});
$("graphFrom").addEventListener("input", () => {
  state.graphDirty = true;
});
$("graphTo").addEventListener("input", () => {
  state.graphDirty = true;
});
$("streamlineCount").addEventListener("input", () => {
  $("streamlineCountValue").textContent = $("streamlineCount").value;
});
$("airflowZoom").addEventListener("input", () => {
  $("airflowZoomValue").textContent = `${format($("airflowZoom").value, 1)}×`;
});
$("airflowLayer").addEventListener("change", () => {
  airflowScene.streamlineCache.key = "";
});
$("flowColor").addEventListener("change", () => {
  const labels = {
    speed: "скорость",
    pressure: "давление",
    vorticity: "завихрение"
  };
  ui.flowLegend.textContent = labels[$("flowColor").value];
});
$("repairMotors").addEventListener("click", () => {
  ensureMotorState(getParameters(), true);
  state.motorLoads = [];
  state.motorActualRpms = [];
  state.escTemps = Array(getParameters().rotors).fill(getParameters().temperature);
  state.graphDirty = true;
});

$("toggleSimulation").addEventListener("click", () => {
  state.running = !state.running;
  $("toggleSimulation").textContent = state.running ? "Пауза" : "Продолжить";
  state.lastTime = performance.now();
});

$("resetSimulation").addEventListener("click", () => {
  customCG = null;
  Object.entries(baseDefaults).forEach(([id, value]) => {
    if (inputs[id] && typeof value !== "object" && id !== "label" && id !== "style") inputs[id]
      .value = String(value);
  });
  $("individualMotors").checked = false;
  $("standTest").checked = false;
  $("streamlineCount").value = "360";
  $("airflowZoom").value = "1";
  $("airflowLayer").value = "volume";
  $("cfdQuality").value = "balanced";
  $("turbulenceModel").value = "smagorinsky";
  $("rotorSwirl").checked = true;
  $("solverMode").value = "trt";
  $("iterationBudget").value = "standard";
  $("flowRate").value = "0.35";
  $("flowColor").value = "speed";
  inputs.flowObstacle.value = "none";
  inputs.obstacleSize.value = "1";
  $("calibratedProps").checked = false;
  $("removeModel").click();
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
  if (!nearest) {
    graphTooltip.hidden = true;
    return;
  }
  const variable = graphVariables[$("graphVariable").value];
  const metric = graphMetrics[$("graphMetric").value];
  const xKind = parameterUnits[$("graphVariable").value],
    yKind = graphKinds[$("graphMetric").value];
  graphTooltip.innerHTML =
    `${variable.label}: <strong>${format(nearest.point.x, 1)} ${xKind ? unitSpec(xKind, unitSystem).label : variable.unit}</strong><br>${metric.label}: <strong>${format(nearest.point.y, 2)} ${yKind ? unitSpec(yKind, unitSystem).label : metric.unit}</strong>`;
  const rect = graphCanvas.getBoundingClientRect();
  graphTooltip.style.left = `${Math.min(rect.width - 160, Math.max(8, nearest.x + 12))}px`;
  graphTooltip.style.top = `${Math.max(8, nearest.y - 54)}px`;
  graphTooltip.hidden = false;
});
graphCanvas.addEventListener("pointerleave", () => {
  graphTooltip.hidden = true;
});

const modelDimensionIds = ["modelWidth", "modelHeight", "modelLength"];
let areaWorker = null,
  areaGeneration = 0;

const unitNames = {
  mm: "миллиметры",
  cm: "сантиметры",
  m: "метры",
  in: "дюймы"
};
// 0.95: volume of the closed mesh at the chosen size, and the mass if printed or cut from a material.
const modelMaterials = {
  pla: 1.24,
  petg: 1.27,
  nylon: 1.14,
  carbon: 1.6,
  aluminium: 2.7
};
function updateModelMass() {
  const out = $("modelMass");
  if (!out || !state.model) return;
  const source = state.model.sourceDimensions,
    dims = modelDimensionIds.map(id => Number($(id).value));
  const ratio = dims.reduce((a, v) => a * v, 1) / Math.max(1e-30, source.reduce((a, v) => a * v, 1) * (unitScaleMm() **
    3));
  const volumeCm3 = state.model.sourceVolume * unitScaleMm() ** 3 * ratio / 1000;
  const areaCm2 = state.model.sourceArea * unitScaleMm() ** 2 * Math.cbrt(ratio) ** 2 / 100;
  const infill = Math.min(100, Math.max(5, Number($("modelInfill").value) || 100)) / 100;
  const density = modelMaterials[$("modelMaterial").value] || 1.24;
  const grams = volumeCm3 * density * infill;
  out.textContent = state.model.closed || state.model.badEdges < 50 ?
    `Объём ${format(volumeCm3, 0)} см³ · поверхность ${format(areaCm2, 0)} см² · масса из этого материала ≈ ${format(grams, 0)} г. Это масса корпуса без электроники; в массу дрона её не добавляю сам.` :
    "Сетка не замкнута, объём посчитать нельзя.";
}
function unitScaleMm() {
  return ({
    mm: 1,
    cm: 10,
    m: 1000,
    in: 25.4
  })[$("modelUnits").value] || (Number($("modelSpan").value) / Math.max(1e-12, state.model?.sourceSpan || 1));
}
function populateModelDimensions() {
  if (!state.model) return;
  const mode = $("modelUnits").value,
    oriented = orientedDimensions(state.model, $("modelUp").value);
  const factor = {
    mm: 1,
    cm: 10,
    m: 1000,
    in: 25.4
  } [mode];
  const raw = state.model.sourceDimensions;
  const dims = factor ? oriented.map(v => v * state.model.sourceSpan * factor) : oriented.map(v => v * Number(
    $("modelSpan").value));
  modelDimensionIds.forEach((id, i) => $(id).value = String(Number(dims[i].toPrecision(10))));
  state.modelDimensionsMm = dims;
  state.modelUp = $("modelUp").value;
  $("modelSource").textContent =
    `${state.model.name} · исходные X × Y × Z: ${raw.map(v=>format(v,3)).join(" × ")} ед. файла.`;
}

function refreshModel() {
  if (!state.model) return;
  const dims = modelDimensionIds.map(id => Number($(id).value)),
    yaw = Number($("modelYaw").value);
  if (modelDimensionIds.some(id => $(id).value === "") || dims.some(v => !Number.isFinite(v) || v < 0 || v >
      2000) || !Number.isFinite(yaw) || Math.abs(yaw) > 360 || Math.max(...dims) <= 0) {
    $("modelStatus").textContent = "Размеры CAD: от 0 до 2000 мм, поворот: от −360° до 360°.";
    return;
  }
  try {
    const areaKey = JSON.stringify([dims, $("modelUp").value, yaw]);
    const reuseArea = state.areaModel === state.model && state.areaKey === areaKey && (state
      .cadAerodynamics || areaWorker);
    const scale = geometryFor(getParameters()).worldScale;
    const metres = fitMesh(state.model, dims.map(v => v / 1000), $("modelUp").value, yaw);
    const triangles = Float32Array.from(metres, v => v / scale);
    // Preview uses the full mesh dimensions; its decimation must not change the scale.
    const oriented = orientedDimensions(state.model, $("modelUp").value);
    const previewDims = orientedDimensions({
      triangles: state.model.preview
    }, $("modelUp").value).map((v, i) => oriented[i] > 1e-12 ? dims[i] / 1000 / scale * v / oriented[i] : 0);
    const preview = fitMesh({
      triangles: state.model.preview
    }, previewDims, $("modelUp").value, yaw);
    const bound = meshBounds(triangles),
      real = meshBounds(metres).dimensions;
    const exceedsDomain = bound.min.some((v, i) => v < [-2.8, -1.4, -2.2][i]) || bound.max.some((v, i) => v >
      [2.8, 1.4, 2.2][i]);
    $("meshCFD").disabled = !state.model.closed || exceedsDomain;
    if ($("meshCFD").disabled) $("meshCFD").checked = false;
    state.modelDimensionsMm = dims;
    $("modelDimensions").textContent =
      `После поворота: X ${format(real[0]*1000,2)} × Y ${format(real[1]*1000,2)} × Z ${format(real[2]*1000,2)} мм. Центр сетки совмещён с центром рамы.`;
    const guesses = [state.model.unitGuess && $("modelUnits").value === state.model.unitGuess ?
      `единицы: ${unitNames[state.model.unitGuess]} (по размеру)` : "", state.model.upGuess && $("modelUp").value === state
      .model.upGuess ? `вертикаль: ${state.model.upGuess.toUpperCase()} (самая тонкая ось)` : ""
    ].filter(Boolean).join(", ");
    $("modelStatus").textContent =
      `${state.model.name} · ${format(state.model.triangleCount, 0)} треугольников${state.model.simplified ? ` (упрощено из ${format(state.model.sourceTriangleCount, 0)})` : ""} · ${state.model.closed ? "замкнутая сетка" : `незамкнутая / дефектная: ${state.model.badEdges} проблемных рёбер`}.${guesses ? ` Угадано: ${guesses}. Проверь и поправь, если нужно.` : ""} ${exceedsDomain ? "CAD выходит к границе области: CFD отключён." : "Проверь положение винтов: их центры задаёт рама."}`;
    updateModelMass();
    flightScene.setModel(triangles, false, preview);
    airflowScene.setModel(triangles, $("meshCFD").checked, preview);
    if (reuseArea) {
      parameterCache = null;
      state.graphDirty = true;
      syncOutputs(getParameters());
      return;
    }
    areaGeneration++;
    areaWorker?.terminate();
    areaWorker = null;
    state.areaModel = state.model;
    state.areaKey = areaKey;
    state.cadAerodynamics = null;
    parameterCache = null;
    $("cadDrag").disabled = true;
    $("cadDragStatus").textContent = "Оцениваю площадь проекции корпуса…";
    const generation = areaGeneration,
      worker = new Worker(new URL("./mesh-worker.js", import.meta.url), {
        type: "module"
      });
    areaWorker = worker;
    worker.onmessage = ({
      data
    }) => {
      if (generation !== areaGeneration) return;
      if (data.error) $("cadDragStatus").textContent = data.error;
      else {
        state.cadAerodynamics = data.aerodynamics;
        $("cadDrag").disabled = false;
        parameterCache = null;
        state.graphDirty = true;
        const a = dragAreas({
          ...getParameters(),
          cadAerodynamics: data.aerodynamics
        });
        $("cadDragStatus").textContent =
          `Проекция: ${format(a.frontal,4)} м² по ветру · ${format(a.top,4)} м² сверху. Приближение по силуэту 96 × 96. C𝒹 задаётся вручную; масса и моторы не меняются.`;
        syncOutputs(getParameters());
      }
      worker.terminate();
      areaWorker = null;
    };
    worker.onerror = () => {
      if (generation === areaGeneration) $("cadDragStatus").textContent = "Не удалось оценить площадь CAD.";
      worker.terminate();
      areaWorker = null;
    };
    worker.postMessage({
      type: "analyze",
      triangles: metres
    }, [metres.buffer]);
    syncOutputs(getParameters());
  } catch (error) {
    $("modelStatus").textContent = error.message;
  }
}

let modelWorker = null,
  modelGeneration = 0;
// 0.95: one entry point for the file input and for drag and drop onto the CAD section or the scene.
$("modelFile").addEventListener("change", event => importModelFile(event.target.files[0]));
for (const zone of [document.querySelector(".cad-group"), $("flightCanvas")].filter(Boolean)) {
  zone.addEventListener("dragover", event => {
    if (![...(event.dataTransfer?.items || [])].some(item => item.kind === "file")) return;
    event.preventDefault();
    document.querySelector(".cad-group")?.classList.add("dropping");
  });
  zone.addEventListener("dragleave", () => document.querySelector(".cad-group")?.classList.remove("dropping"));
  zone.addEventListener("drop", event => {
    const file = event.dataTransfer?.files?.[0];
    document.querySelector(".cad-group")?.classList.remove("dropping");
    if (!file) return;
    event.preventDefault();
    const group = document.querySelector(".cad-group");
    if (group && !group.open) group.open = true;
    importModelFile(file);
  });
}
async function importModelFile(file) {
  if (!file) return;
  if (!/\.(stl|obj|3mf)$/i.test(file.name)) {
    $("modelStatus").textContent = "Поддерживаются STL, OBJ и 3MF. Из STEP / CAD сначала экспортируй сетку.";
    return;
  }
  if (file.size > 64 * 1024 * 1024) {
    $("modelStatus").textContent = "Файл больше 64 МБ. Уменьши сетку в CAD.";
    return;
  }
  modelWorker?.terminate();
  const generation = ++modelGeneration;
  $("modelStatus").textContent = "Читаю модель и проверяю замкнутость…";
  try {
    const buffer = await file.arrayBuffer();
    if (generation !== modelGeneration) return;
    const worker = new Worker(new URL("./mesh-worker.js", import.meta.url), {
      type: "module"
    });
    modelWorker = worker;
    worker.onmessage = ({
      data
    }) => {
      if (generation !== modelGeneration) return;
      if (data.error) $("modelStatus").textContent = data.error;
      else {
        areaGeneration++;
        areaWorker?.terminate();
        areaWorker = null;
        state.areaModel = null;
        state.areaKey = "";
        state.cadAerodynamics = null;
        parameterCache = null;
        $("cadDrag").disabled = true;
        state.model = data.mesh;
        // 0.95: the units and the vertical axis are guessed from the size; both stay editable.
        if (data.mesh.unitGuess) $("modelUnits").value = data.mesh.unitGuess;
        if (data.mesh.upGuess) $("modelUp").value = data.mesh.upGuess;
        populateModelDimensions();
        $("meshCFD").checked = false;
        $("removeModel").disabled = false;
        refreshModel();
      }
      worker.terminate();
      modelWorker = null;
    };
    worker.onerror = () => {
      if (generation !== modelGeneration) return;
      $("modelStatus").textContent = "Не удалось прочитать модель. Попробуй облегчённый STL / OBJ.";
      worker.terminate();
      modelWorker = null;
    };
    worker.postMessage({
      buffer,
      name: file.name
    }, [buffer]);
  } catch {
    $("modelStatus").textContent = "Не удалось открыть файл модели.";
  }
}
for (const id of ["modelMaterial", "modelInfill"]) $(id).addEventListener("input", updateModelMass);
$("modelSpan").addEventListener("change", () => {
  $("modelUnits").value = "fit";
  populateModelDimensions();
  refreshModel();
});
$("modelUnits").addEventListener("change", () => {
  if ($("modelUnits").value !== "manual") populateModelDimensions();
  refreshModel();
});
$("modelUp").addEventListener("change", () => {
  if (!state.model) return;
  if ($("modelUnits").value === "manual") {
    const swap = (d, up) => up === "z" ? [d[0], d[2], d[1]] : up === "x" ? [d[1], d[0], d[2]] : d;
    const d = swap(swap(state.modelDimensionsMm, state.modelUp), $("modelUp").value);
    modelDimensionIds.forEach((id, i) => $(id).value = String(d[i]));
    state.modelUp = $("modelUp").value;
  } else populateModelDimensions();
  refreshModel();
});
for (const id of modelDimensionIds) $(id).addEventListener("change", () => {
  if (!state.model) return;
  const i = modelDimensionIds.indexOf(id),
    value = Number($(id).value),
    previous = state.modelDimensionsMm?.[i];
  if ($("modelAspect").checked && previous > 0 && value > 0) modelDimensionIds.forEach((name, j) => {
    if (j !== i) $(name).value = String(state.modelDimensionsMm[j] * value / previous);
  });
  $("modelUnits").value = "manual";
  refreshModel();
});
for (const id of ["modelYaw", "meshCFD"]) $(id).addEventListener("change", refreshModel);
$("cadDrag").addEventListener("change", () => {
  parameterCache = null;
  state.graphDirty = true;
  syncOutputs(getParameters());
});
$("resetModelTransform").addEventListener("click", () => {
  $("modelYaw").value = "0";
  $("modelUp").value = "z";
  $("modelUnits").value = "fit";
  $("modelSpan").value = String(getParameters().frameSize);
  populateModelDimensions();
  refreshModel();
});
$("removeModel").addEventListener("click", () => {
  modelGeneration++;
  modelWorker?.terminate();
  modelWorker = null;
  areaGeneration++;
  areaWorker?.terminate();
  areaWorker = null;
  state.model = null;
  state.areaModel = null;
  state.areaKey = "";
  state.cadAerodynamics = null;
  state.modelDimensionsMm = null;
  parameterCache = null;
  $("cadDrag").checked = false;
  $("cadDrag").disabled = true;
  $("modelDimensions").textContent = "";
  $("cadDragStatus").textContent =
    "Масса, коэффициент сопротивления и положение моторов задаются отдельно.";
  $("modelFile").value = "";
  $("meshCFD").checked = false;
  $("meshCFD").disabled = true;
  $("removeModel").disabled = true;
  flightScene.setModel(null);
  airflowScene.setModel(null);
  state.graphDirty = true;
  syncOutputs(getParameters());
  $("modelStatus").textContent = "Встроенная модель. Загрузи STL / OBJ из CAD, чтобы заменить корпус.";
});

document.querySelectorAll("[data-weather]").forEach(button => button.addEventListener("click", () => {
  const presets = {
    mountain: {
      altitude: 5000,
      pressureMode: "auto",
      temperatureMode: "standard",
      windSpeed: 12,
      gusts: 30,
      turbulence: 25,
      humidity: 30
    },
    calm: {
      windSpeed: 0,
      gusts: 0,
      turbulence: 0,
      rainRate: 0,
      verticalWind: 0
    },
    gust: {
      windSpeed: 10,
      gusts: 65,
      turbulence: 35,
      gustFrequency: 0.4,
      rainRate: 0
    },
    rain: {
      windSpeed: 7,
      gusts: 35,
      turbulence: 25,
      rainRate: 35,
      humidity: 90
    }
  };
  for (const [id, value] of Object.entries(presets[button.dataset.weather])) inputs[id].value = String(
    value);
  invalidateParameters();
}));

$("exportReport").addEventListener("click", () => {
  const parameters = getParameters();
  const result = calculate(parameters, liveOptions());
  airflowScene.ensureCFD(parameters, meanFlowResult(parameters), cfdSettings());
  const matchingCFD = airflowScene.cfd.fieldKey === airflowScene.cfd.desiredKey && airflowScene.cfd
    .status === "ready";
  const report = {
    version: "0.96.0-beta",
    enduranceForecast: state.forecast,
    powerBudget: state.powerBudget,
    battery: state.battery,
    batteryActual: state.batteryActual,
    electronics: {
      escTemperatures: state.escTemps
    },
    generatedAt: new Date().toISOString(),
    displayUnits: unitSystem,
    parameters,
    result,
    motors: {
      standTest: $("standTest").checked,
      loadsPercentOfRated: state.motorLoads,
      actualRpms: state.motorActualRpms,
      temperatures: state.motorTemps,
      healths: state.motorHealths,
      fires: state.motorFire,
      exposure: state.motorExposure,
      ignition: state.motorIgnition
    },
    importedMesh: state.model ? {
      name: state.model.name,
      triangles: state.model.triangleCount,
      closed: state.model.closed,
      spanMm: Number($("modelSpan").value),
      dimensionsMm: state.modelDimensionsMm,
      sourceUnits: $("modelUnits").value,
      aerodynamics: state.cadAerodynamics,
      dragEnabled: $("cadDrag").checked,
      upAxis: $("modelUp").value,
      yaw: Number($("modelYaw").value),
      usedInCFD: Boolean(airflowScene.meshCFD)
    } : null,
    cfd: matchingCFD ? {
      configuration: JSON.parse(airflowScene.cfd.fieldKey),
      stats: airflowScene.cfd.field.stats
    } : {
      status: "not-current-or-not-calculated"
    },
    limitations: [
      "TRT/BGK D3Q19 actuator-disk approximation; no experiment or grid-convergence validation.",
      "CFD mean wind, motor availability with thermal derating rounded to 10%; flight dynamics include smoothed gusts.",
      "Physical and effective solver Reynolds numbers differ.",
      "CAD projection is a rasterized silhouette estimate, no automatic mass or Cd identification. CFD force is not fed into flight dynamics.",
      "Battery voltage curves and battery, motor and ESC thermal coefficients are illustrative, not device-specific predictions."
    ]
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json"
  }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "drone-weather-lab-v0.96.0-beta-report.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {
    type
  }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("exportDesign").addEventListener("click", () => download("drone-design-mm-Y-up.stl", exportDesignSTL(
  getParameters()), "model/stl"));
$("saveDesign").addEventListener("click", () => {
  download("drone-weather-lab-design.json", JSON.stringify({
    format: "drone-weather-lab-design",
    version: 1,
    parameters: getParameters()
  }, null, 2), "application/json");
  $("designStatus").textContent =
    "Сохранены геометрия, погода и общие настройки. CAD-файл, отдельные RPM и повреждения не включены.";
});
$("loadDesign").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error("Файл настроек должен быть меньше 100 КБ.");
    const data = JSON.parse(await file.text());
    if (!data.parameters || typeof data.parameters !== "object" || Array.isArray(data.parameters))
      throw new Error("Нужен JSON, сохранённый кнопкой «Сохранить настройки».");
    const newKeys = ["batteryCells", "batteryHealth", "batteryMass", "cellCutoff", "reserveCharge",
      "escCurrentLimit", "escEfficiency", "avionicsPower", "controllerCutoff", "controllerRate",
      "sensorLatency", "batteryChemistry", "temperatureMode", "motorModel", "motorKv", "motorResistance",
      "motorIdleCurrent"
    ];
    const p = {
      ...Object.fromEntries(newKeys.map(id => [id, baseDefaults[id]])),
      ...data.parameters
    };
    if (data.format !== "drone-weather-lab-design" || data.version !== 1 || !p || typeof p !== "object")
      throw new Error("Нужен JSON, сохранённый кнопкой «Сохранить настройки».");
    // Validate the whole document before changing a single control.
    const updates = [];
    for (const id of numberIds) {
      const value = p[id],
        input = inputs[id];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(
        `Неверный параметр ${id}.`);
      const lo = input.getAttribute("min"),
        hi = input.getAttribute("max");
      const automaticPressure = id === "pressureHpa" && p.pressureMode === "auto" && value > 0 &&
        value < 1200;
      if (!automaticPressure && ((lo !== null && value < Number(lo)) || (hi !== null && value > Number(
          hi)) || (id === "rotors" && ![4, 6, 8].includes(value)) || (id === "batteryCells" && (!
          Number.isInteger(value) || value < 0 || value > 16)))) throw new Error(
        `Параметр ${id} вне диапазона.`);
      updates.push([id, value]);
    }
    for (const id of selectIds) {
      if (![...inputs[id].options].some(o => o.value === p[id])) throw new Error(
        `Неверный вариант ${id}.`);
      updates.push([id, p[id]]);
    }
    if (p.customCG !== undefined && (!Array.isArray(p.customCG) || p.customCG.length !== 3 || !p
        .customCG.every(v => Number.isFinite(v) && Math.abs(v) <= 2))) throw Error(
      "Invalid centre of gravity");
    customCG = p.customCG || null;
    for (const [id, value] of updates) inputs[id].value = String(value);
    $("removeModel").click();
    $("individualMotors").checked = false;
    $("calibratedProps").checked = p.calibratedProps === true;
    invalidateParameters();
    buildMotorGrid();
    resetDynamics();
    $("designStatus").textContent = "Настройки загружены. Состояние полёта и моторов сброшено.";
  } catch (error) {
    $("designStatus").textContent = error.message;
  }
  event.target.value = "";
});
$("continueCFD").addEventListener("click", () => airflowScene.continueCFD());
for (const id of ["probeX", "probeY", "probeZ"]) $(id).addEventListener("input", updateProbe);

$("replaceBattery").addEventListener("click", replaceBattery);
$("batteryDrain").addEventListener("change", replaceBattery);

function updatePowerTelemetry(p, result, circuit) {
  const battery = state.battery || initialBattery(p);
  setText($("chargeReading"), `${format(battery.soc, 1)}%`);
  const charge = String(Math.round(battery.soc * 10) / 10);
  if ($("chargeBar").getAttribute("aria-valuenow") !== charge) {
    $("chargeBar").value = Number(charge);
    $("chargeBar").setAttribute("aria-valuenow", charge);
  }
  setText($("packReading"), `${format(circuit.terminalVoltage, 2)} V · ${quantity(battery.temperature, "temperature", 1)}`);
  setText($("packHistory"), `${format(battery.usedAh * 1000, 0)} mAh · ${format(battery.outputWh, 2)} Wh`);
  setText($("escReading"), `${quantity(Math.max(p.temperature, ...state.escTemps), "temperature", 1)} · ${format(p.escCurrentLimit, 1)} A`);
  setText($("controllerReading"), circuit.controllerPowered ?
    `${format(p.controllerRate, 0)} Hz · ${format(p.sensorLatency, 1)} ms` : "Контроллер без питания");
  setText($("atmosphereReading"), `${quantity(p.altitude, "m", 0)} · ${quantity(result.pressure / 100, "hpa", 1)}`);
}

const parameterHelp = {
  turbulenceModel: "Smagorinsky LES добавляет вязкость по локальному тензору напряжений. Cₛ = 0,12. Это приближённая модель неразрешённых вихрей; она не делает грубую сетку точной.",
  rotorSwirl: "Момент Q = P / ω оценивается по мощности вала и рабочим оборотам. Источник закручивает воздух вокруг диска; соседние моторы вращаются в противоположные стороны. Лопасти не разрешаются.",
  solverMode: "TRT разделяет симметричную и антисимметричную части распределения. В этой реализации вязкость ниже, чем у BGK. Это всё ещё приближённый низко-Re расчёт, а не DNS реального дрона.",
  iterationBudget: "Эскиз: 100/220/360 шагов в зависимости от сетки. Стандарт: вдвое больше; длинный: вшестеро. Считать дальше продолжает текущее поле. Остановка: невязка скорости <0,1%, силы <0,5%, баланса массы <1% и дрейф плотности <1% три проверки подряд, минимум 200 шагов.",
  flowRate: "Меняет только скорость просмотра частиц. Их путь и локальная скорость берутся из численного поля. Не меняет ветер и результат расчёта.",
  armLength: "Расстояние от центра дрона до оси мотора до растяжения рамы. Изменяет реальное плечо тяги и положение дисков в CFD.",
  frameStretch: "Удлиняет расположение моторов по оси Z, вдоль корпуса. Масса и лобовая площадь автоматически не пересчитываются.",
  pitch: "Шаг показывает теоретическое продвижение винта за оборот в твёрдой среде. Это не высота лопасти; влияет на оценочные Cₜ и Cₚ.",
  dragArea: "Площадь поперёк ветра. Влияет на силу F = ½ρC𝒹AV². Не равна общей площади поверхности или площади дисков винтов.",
  dragCoefficient: "C𝒹 описывает форму и сопротивление. Не извлекается автоматически из модели; для точности нужен эксперимент или проверенный CFD.",
  propEfficiency: "Поправка состояния винтов: повреждение, дождь и лёд снижают тягу и увеличивают потребляемую мощность. Это эмпирическая модель.",
  ct: "Безразмерный коэффициент: T = Cₜρn²D⁴, n в оборотах/с, D в метрах. Бери из стендовых данных своего винта; для чистого винта выставь состояние 100%.",
  cp: "Безразмерный коэффициент мощности на валу: P = Cₚρn³D⁵. Не путай с электрической мощностью и коэффициентом момента Cq.",
  rpm: "В полёте контроллер сам снижает обороты до нужной тяги, а команда задаёт, сколько тяги ему доступно. Реальные обороты ограничены пределом двигателя, током ESC и мощностью батареи. На стендовом тесте моторы крутятся именно на команде. Дым и огонь условные, они не предсказывают реальный отказ.",
  standTest: "Дрон закреплён на стенде и не двигается. Все моторы крутятся на команде RPM, но не выше предела двигателя, тока ESC и мощности батареи. Так проверяют, выдержит ли мотор долгую работу на этих оборотах. Что перегреется первым и когда, показывает раздел «Температуры» под сценой. Батарея при 75 °C отключает питание.",
  motorMaxPower: "Номинальная длительная мощность на входе мотора. Это не потолок: если ESC и батарея дают больше, мотор её возьмёт и будет перегреваться. При номинале без ветра мотор нагревается примерно на 65 °C выше воздуха; мощность на валу меньше из-за КПД.",
  motorModel: "Простая модель задаёт мотор номинальной мощностью и постоянным КПД. Модель по даташиту берёт три числа из паспорта мотора: Kv, сопротивление обмотки и ток холостого хода. Тогда предел оборотов зависит от напряжения батареи, КПД меняется с нагрузкой, а нагрев считается по реальным потерям: в меди I²R и в железе I₀·E. Горячая обмотка сопротивляется сильнее, поэтому перегретый мотор греется ещё быстрее.",
  motorKv: "Обороты без нагрузки на один вольт. Вместе с напряжением батареи задаёт предел оборотов: под нагрузкой мотор не раскрутится быстрее, чем позволяет напряжение за вычетом падения на обмотке.",
  motorResistance: "Сопротивление обмотки из паспорта мотора (internal resistance). Потери в меди равны I²R и растут как квадрат тока. При нагреве на 100 °C сопротивление меди растёт примерно на 39%.",
  motorIdleCurrent: "Ток без винта, обычно его меряют при 10 В. Описывает потери в железе и трение, они растут с оборотами.",
  motorEfficiency: "КПД преобразования электрической мощности в механическую. Потери мотора нагревают мотор. КПД и нагрев ESC учитываются отдельно.",
  windTransition: "Постоянная времени плавного перехода: через это время пройдено примерно 63% изменения скорости. Влияет на полёт, не на стационарный CFD.",
  gustFrequency: "В герцах измеряется число колебаний в секунду. 0,5 Гц означает характерный период около 2 секунд.",
  turbulence: "Условная интенсивность нерегулярных порывов в полёте. Это не полноценная модель LES/RANS в CFD.",
  verticalWind: "Положительное значение задаёт поток вверх, отрицательное вниз. Вертикальная аэродинамическая сила оценивается отдельно. Вихревое кольцо роторов не моделируется.",
  pressureMode: "Автоматический режим берёт давление из стандартной барометрической атмосферы по высоте. Ручной режим использует указанное тобой давление для расчёта плотности.",
  icing: "Лёд ухудшает тягу и увеличивает сопротивление. Скорость накопления льда и точная форма льда не рассчитываются.",
  batteryResistance: "Сопротивление пакета при 20 °C. Модель увеличивает его на холоде и при уменьшении ресурса. Ветвь RC добавляет постепенную просадку и восстановление напряжения. Коэффициенты примерные, без данных конкретного аккумулятора.",
  batteryChemistry: "LiPo и Li-ion используют разные примерные кривые напряжения от заряда. Номинальное напряжение задаёт размер пакета. Для точного расчёта нужны измерения твоих ячеек.",
  batteryMass: "Теплоёмкость пакета оценивается как масса × 900 Дж/(кг·К). Масса батареи уже должна входить в массу дрона, это поле влияет только на нагрев.",
  reserveCharge: "Оценка времени полёта заканчивается на этом заряде. Это плановый резерв, он не выключает моторы.",
  cellCutoff: "Нижнее напряжение одной ячейки. Доступная мощность ограничивается так, чтобы пакет не опускался ниже этого порога.",
  escCurrentLimit: "Предел тока каждого регулятора. Мощность моторов ограничивается током ESC, нагревом, доступной мощностью батареи и пределом самого мотора.",
  escEfficiency: "КПД регулятора. Разница между входной и выходной мощностью нагревает ESC. Тепловая модель примерная; после 95 °C мощность постепенно снижается.",
  controllerRate: "Частота обновления контроллера учитывается как половина периода в задержке реакции. Это приближение, не эмуляция прошивки или процессора.",
  sensorLatency: "Задержка датчиков добавляется к времени реакции контроллера. Большая задержка делает компенсацию ветра медленнее.",
  controllerCutoff: "Минимальное входное напряжение питания контроллера. При недостаточном напряжении или мощности удержание точки прекращается.",
  temperatureMode: "Стандартная атмосфера: 15 °C на уровне моря и снижение на 6,5 °C на километр. Ручной режим позволяет задать температуру отдельно от высоты.",
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
  const input = $(id),
    parent = input?.closest("label");
  if (!parent) continue;
  const help = document.createElement("details");
  help.className = "control-help";
  const summary = document.createElement("summary");
  summary.textContent = "Что это значит?";
  const p = document.createElement("p");
  p.textContent = text;
  help.append(summary, p);
  // A summary inside a checkbox label would toggle the checkbox, so checkbox help goes after the label.
  if (input.type === "checkbox" && typeof parent.after === "function") {
    help.classList.add("wide");
    parent.after(help);
  } else parent.append(help);
}

function frame(now, activity = {
  run: true,
  draw: !document.hidden
}) {
  const dt = Math.min(0.25, Math.max(0, (now - state.lastTime) / 1000));
  state.lastTime = now;
  if (!activity.run) return;
  const renderMode = $("renderQuality").value;
  if (now - state.lastPerformanceCheck > 2000) {
    if (state.renderMs > 22) state.autoFps = 30;
    else if (state.renderMs < 9) state.autoFps = 60;
    state.lastPerformanceCheck = now;
  }
  const targetFps = renderMode === "eco" ? 30 : renderMode === "auto" ? state.autoFps : 60;
  if (state.running) state.accumulator += dt;
  if (activity.draw && now - state.lastRender < 1000 / targetFps - 1) return;
  state.lastRender = now;
  const started = performance.now();
  const parameters = getParameters();
  ensureMotorState(parameters);
  state.motorRpms = motorRpms(parameters);
  let result;
  let substeps = 0;
  while (state.running && state.accumulator >= 1 / 60 && substeps < 15) {
    result = simulate(1 / 60, parameters);
    state.accumulator -= 1 / 60;
    substeps++;
  }
  if (substeps === 15) state.accumulator = 0;
  if (!activity.draw) {
    workbench?.tick(now, false);
    return;
  }
  result ||= calculate(parameters, liveOptions());
  if (["flight", "graph", "compare"].includes(state.activeView) && now - state.lastMetrics > 200) {
    updateMetrics(parameters, result);
    state.lastMetrics = now;
  }
  const pixelRatio = renderMode === "eco" || targetFps === 30 ? 1 : renderMode === "high" ? 2 : 1.5;
  flightScene.pixelRatio = airflowScene.pixelRatio = pixelRatio;
  if (state.activeView === "flight") {
    state.showForces = $("forceVectors").checked;
    flightScene.renderFlight(state, parameters, result, format);
    const rendererLabel = flightScene.gpu ? "WebGL" : "Canvas";
    if ($("rendererStatus").textContent !== rendererLabel) $("rendererStatus").textContent = rendererLabel;
  } else if (state.activeView === "graph") {
    if (now - state.lastGraphUpdate > 1000) {
      state.graphDirty = true;
      state.lastGraphUpdate = now;
    }
    if (state.graphDirty) {
      renderGraph(parameters);
      state.graphDirty = false;
    }
  } else if (state.activeView === "airflow") {
    airflowScene.renderAirflow(parameters, meanFlowResult(parameters), {
      layer: $("airflowLayer").value,
      count: Number($("streamlineCount").value),
      zoom: Number($("airflowZoom").value),
      ...cfdSettings(),
      flowRate: Number($("flowRate").value),
      probe: ["probeX", "probeY", "probeZ"].map(id => Number($(id).value)),
      colorMode: $("flowColor").value,
      systemState: state,
      showGeometry: $("showCFDGeometry").checked
    }, state.t, format);
  }
  for (const scene of [flightScene, airflowScene]) {
    if (scene.captureNextFrame && scene.mode === state.activeView) {
      const capture = scene.captureNextFrame;
      scene.captureNextFrame = null;
      capture();
    }
  }
  workbench?.tick(now);
  state.renderMs = state.renderMs * 0.85 + (performance.now() - started) * 0.15;
}

exactControls = installExactControls([...document.querySelectorAll('input[type="range"]'), $("modelSpan")],
  () => unitSystem);
$("unitSystem").addEventListener("change", () => {
  graphRenderer.baseline = null;
  const oldSystem = unitSystem,
    kind = parameterUnits[$("graphVariable").value];
  const range = ["graphFrom", "graphTo"].map(id => fromDisplay(Number($(id).value), kind, oldSystem));
  unitSystem = $("unitSystem").value;
  try {
    localStorage.setItem("drone-lab-units", unitSystem);
  } catch {}
  ["graphFrom", "graphTo"].forEach((id, i) => {
    $(id).value = String(toDisplay(range[i], kind, unitSystem));
  });
  exactControls.refresh(true);
  syncOutputs(getParameters());
  updateProbe();
  if (airflowScene.cfd.field?.stats) airflowScene.emitCFDStatus();
  state.graphDirty = true;
  state.lastMetrics = 0;
  renderComparison();
  workbench?.unitsChanged?.();
});
$("showShortcuts").addEventListener("click", () => {
  $("shortcutHelp").hidden = !$("shortcutHelp").hidden;
  $("showShortcuts").setAttribute("aria-expanded", String(!$("shortcutHelp").hidden));
});
document.addEventListener("keydown", event => {
  const action = shortcutAction(event);
  if (!action) return;
  event.preventDefault();
  if (action === "pause") $("toggleSimulation").click();
  else if (action === "repair") $("repairMotors").click();
  else if (action === "reset") resetDynamics(false);
  else if (action === "help") $("showShortcuts").click();
  else if (action === "closeHelp") {
    $("shortcutHelp").hidden = true;
    $("showShortcuts").setAttribute("aria-expanded", "false");
  } else if (action === "resetAll") $("resetSimulation").click();
  else if (action === "battery") $("replaceBattery").click();
  else if (action === "report") $("exportReport").click();
  else if (action === "save") $("saveDesign").click();
  else if (action === "vectors") {
    $("forceVectors").checked = !$("forceVectors").checked;
  } else if (action === "camera") {
    flightScene.resetCamera();
    airflowScene.resetCamera();
  } else setActiveView(action);
});
graphRangeFor("windSpeed");
buildMotorGrid();
replaceBattery();
syncOutputs(getParameters());
window.addEventListener("resize", () => {
  state.graphDirty = true;
});
activityLoop = createActivityLoop({
  onFrame: frame,
  onStateChange(activity, now) {
    state.lastTime = now;
    state.accumulator = 0;
    state.lastMetrics = 0;
    airflowScene.setCFDPaused(!activity.run);
    workbench?.activityChanged();
  }
});
activityLoop.start();

let comparisonA = null,
  comparisonB = null;

function renderComparison() {
  if (!comparisonA) {
    $("comparisonResult").textContent = t("Сначала сохрани A");
    return;
  }
  const rows = compareConfigurations(comparisonA, comparisonB);
  const names = {
    reserve: "Запас тяги",
    tilt: "Наклон",
    flightMinutes: "Время полёта",
    electricalPower: "Мощность",
    current: "Ток батареи",
    maxWind: "Предел ветра",
    availableThrust: "Доступная тяга",
    thrustToWeight: "Тяга / вес"
  };
  const signed = (text, value) => value > 0 ? `+${text}` : text;
  const display = (key, value) => key === "tilt" ? `${format(value)}°` : key === "reserve" ? `${format(value)}%` :
    key === "electricalPower" ? `${format(value, 0)} Вт` : key === "current" ? `${format(value)} А` : key ===
    "flightMinutes" ? `${format(value)} мин` : key === "thrustToWeight" ? `${format(value, 2)}×` : quantity(value,
      key === "availableThrust" ? "force" : "speed");
  const verdictText = {
    better: "лучше",
    worse: "хуже",
    same: "без изменений",
    na: "н/д",
    info: "справочно",
    context: "другая масса"
  };
  const table = document.createElement("table");
  table.className = "comparison-table";
  const head = table.createTHead().insertRow();
  for (const name of ["", "A", "B", "Δ B − A", "Итог для B"]) {
    const th = document.createElement("th");
    th.textContent = name;
    head.append(th);
  }
  const body = table.createTBody();
  for (const item of rows) {
    const row = body.insertRow();
    // 0.92: flight time outside the hover limits is "not available", not zero minutes.
    const a = item.aAvailable ? display(item.key, item.a) : "н/д",
      b = item.b == null ? "…" : item.bAvailable ? display(item.key, item.b) : "н/д";
    let delta = "…";
    if (item.b != null) delta = item.verdict === "na" ? "н/д" : signed(display(item.key, item.b - item.a), item.b -
      item.a);
    const cells = [t(names[item.key]), a, b, delta].map(value => {
      const cell = row.insertCell();
      cell.textContent = value;
      return cell;
    });
    const percentCell = cells[3];
    if (item.b != null && item.percent !== null && !["reserve", "tilt"].includes(item.key) && item.verdict !==
      "same" && Math.abs(item.percent) >= .5) {
      const small = document.createElement("small");
      small.textContent = ` (${signed(format(item.percent, 0), item.percent)}%)`;
      percentCell.append(small);
    }
    const verdict = row.insertCell();
    verdict.className = `comparison-verdict verdict-${item.b == null ? "na" : item.verdict}`;
    verdict.textContent = item.b == null ? "…" : verdictText[item.verdict];
  }
  const parts = [table];
  if (comparisonB) {
    // 0.92: list the design and battery settings that differ; weather is always taken from A.
    const heading = document.createElement("h3");
    heading.className = "comparison-subhead";
    heading.textContent = "Что отличается в B";
    const changes = changedParameters(comparisonA, comparisonB);
    if (!changes.length) {
      const p = document.createElement("p");
      p.className = "comparison-note";
      p.textContent = "Настройки дрона и батареи у A и B совпадают.";
      parts.push(heading, p);
    } else {
      const list = document.createElement("ul");
      list.className = "comparison-changes";
      for (const change of changes) {
        const li = document.createElement("li"),
          name = document.createElement("span"),
          from = document.createElement("span"),
          arrow = document.createElement("span"),
          to = document.createElement("strong");
        name.textContent = parameterLabel(change.key);
        from.textContent = parameterText(change.key, change.a);
        arrow.textContent = " → ";
        to.textContent = parameterText(change.key, change.b);
        li.append(name, from, arrow, to);
        list.append(li);
      }
      parts.push(heading, list);
    }
  }
  $("comparisonResult").replaceChildren(...parts);
}

// 0.92: readable name and value of a saved parameter, taken from its control in the current language.
function parameterLabel(id) {
  if (id === "customCG") return t("Центр тяжести");
  if (id === "calibratedProps") return $("calibratedProps")?.closest?.("label")?.textContent?.trim() || id;
  const label = inputs[id]?.closest?.("label");
  const text = label?.querySelector?.("span")?.firstChild?.nodeValue?.trim() || label?.textContent?.trim();
  return text || id;
}

function parameterText(id, value) {
  if (value === undefined || value === null) return "н/д";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (id === "customCG" && Array.isArray(value)) return `${value.map(v => format(toDisplay(v * 1000, "mm",
    unitSystem), 1)).join(" / ")} ${unitSpec("mm", unitSystem).label}`;
  if (inputs[id]?.tagName === "SELECT") return [...inputs[id].options].find(o => o.value === String(value))
    ?.textContent || String(value);
  if (typeof value !== "number") return String(value);
  if (parameterUnits[id]) return quantity(value, parameterUnits[id], ["dragArea", "batteryResistance"].includes(id) ?
    3 : 2);
  return outputConfig[id] ? outputConfig[id](value) : format(value, 2);
}
$("captureA").addEventListener("click", () => {
  comparisonA = {
    ...getParameters()
  };
  comparisonB = null;
  $("captureB").disabled = false;
  renderComparison();
});
$("captureB").addEventListener("click", () => {
  comparisonB = {
    ...getParameters()
  };
  renderComparison();
});
$("clearComparison").addEventListener("click", () => {
  comparisonA = comparisonB = null;
  $("captureB").disabled = true;
  renderComparison();
});
$("language").value = getLanguage();
$("language").addEventListener("change", event => setLanguage(event.target.value));
document.addEventListener("languagechange", () => {
  exactControls.refresh(true);
  syncOutputs(getParameters());
  state.graphDirty = true;
  state.lastMetrics = 0;
  if (airflowScene.cfd.field) airflowScene.emitCFDStatus();
  renderComparison();
});
installLanguage();

function applyWorkbenchParameters(values, options = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw Error("parameters");
  if (options.complete && [...numberIds, ...selectIds].some(id => !(id in values))) throw Error(
    "incomplete project");
  if (values.customCG !== undefined && (!Array.isArray(values.customCG) || values.customCG.length !== 3 || !
      values.customCG.every(v => Number.isFinite(v) && Math.abs(v) <= 2))) throw Error("centre of gravity");
  if (values.calibratedProps !== undefined && typeof values.calibratedProps !== "boolean") throw Error(
    "propeller coefficients");
  const updates = [];
  for (const [id, value] of Object.entries(values)) {
    if (numberIds.includes(id)) {
      const el = inputs[id],
        lo = el.getAttribute("min"),
        hi = el.getAttribute("max");
      if (typeof value !== "number" || !Number.isFinite(value) || (lo !== null && value < +lo) || (hi !==
          null && value > +hi) || (id === "rotors" && ![4, 6, 8].includes(value)) || (id === "batteryCells" &&
          !Number.isInteger(value))) throw Error(id);
      updates.push([id, value]);
    } else if (selectIds.includes(id)) {
      if (![...inputs[id].options].some(o => o.value === value)) throw Error(id);
      updates.push([id, value]);
    }
  }
  if (options.validateOnly) return;
  updates.forEach(([id, value]) => inputs[id].value = String(value));
  if (values.calibratedProps !== undefined) $("calibratedProps").checked = values.calibratedProps;
  parameterCache = null;
  state.batteryActual = null;
  state.powerBudget = null;
  state.forecast = null;
  if (options.resetFlight) resetDynamics();
  else if (options.battery) replaceBattery();
  if (values.rotors) buildMotorGrid();
  if (values.dronePreset) $('builderPanel').hidden = values.dronePreset !== "custom";
  syncOutputs(getParameters());
  state.graphDirty = true;
  state.lastMetrics = 0;
  if (state.model && (values.frameSize || values.dronePreset || values.armLength)) refreshModel();
}
workbench = installWorkbench({
  activityLoop,
  getUnitSystem: () => unitSystem,
  state,
  getParameters,
  applyParameters: applyWorkbenchParameters,
  setView: setActiveView,
  scenes: [flightScene, airflowScene],
  download,
  graphRenderer,
  ensureGraph() {
    renderGraph(getParameters());
    state.graphDirty = false;
  },
  graphRangeFor,
  invalidate: invalidateParameters,
  setCG(value) {
    if (value !== null && (!Array.isArray(value) || value.length !== 3 || !value.every(v => Number
        .isFinite(v) && Math.abs(v) <= 2))) throw Error("centre of gravity");
    customCG = value;
    parameterCache = null;
    state.graphDirty = true;
  },
  graphUnit(id, metric) {
    const kind = metric ? graphKinds[id] : parameterUnits[id];
    return kind ? unitSpec(kind, unitSystem).label : (metric ? graphMetrics[id] : graphVariables[id])
      .unit;
  },
  fromGraph(value, id) {
    return fromDisplay(value, parameterUnits[id], unitSystem);
  }
});

document.addEventListener('keydown', event => {
  const tab = event.target?.closest?.('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('.mode-tab')],
    i = tabs.indexOf(tab);
  if (i < 0) return;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key ===
    'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  setActiveView(tabs[next].dataset.view);
  tabs[next].focus();
});
