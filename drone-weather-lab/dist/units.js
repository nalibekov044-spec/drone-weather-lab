import { t } from "./i18n.js";
// Inputs and saved designs keep their original units. Conversion is a view concern.
const definitions = {
  kg: ["кг", "lb", 2.20462262185], mm: ["мм", "in", 1 / 25.4],
  cm: ["см", "in", 1 / 2.54], m: ["м", "ft", 3.28083989501],
  inch: ["мм", "in", 1, 25.4], speed: ["м/с", "mph", 2.23693629205],
  area: ["м²", "ft²", 10.7639104167], temperature: ["°C", "°F", 1.8, 1, 32],
  rain: ["мм/ч", "in/h", 1 / 25.4], hpa: ["гПа", "psi", 0.0145037738],
  pressure: ["Па", "lbf/ft²", 0.020885434233], force: ["Н", "lbf", 0.22480894387],
  density: ["кг/м³", "slug/ft³", 0.00194032033198], volume: ["л", "ft³", 0.03531466672],
  resistance: ["мОм", "мОм", 1000, 1000]
};
export const parameterUnits = {
  mass: "kg", payload: "kg", frameSize: "mm", diameter: "inch", pitch: "inch", dragArea: "area",
  windSpeed: "speed", verticalWind: "speed", rainRate: "rain", temperature: "temperature",
  altitude: "m", pressureHpa: "hpa", batteryTemp: "temperature", payloadX: "cm", payloadY: "cm",
  bodyLength: "mm", bodyWidth: "mm", bodyHeight: "mm", armLength: "mm", armThickness: "mm",
  motorDiameter: "mm", motorHeight: "mm", modelSpan: "mm", probeX: "m", probeY: "m", probeZ: "m",
  batteryResistance: "resistance"
};
export function unitSpec(kind, system = "metric") {
  const d = definitions[kind];
  if (!d) return { label: "", factor: 1, offset: 0 };
  return system === "imperial" ? { label: t(d[1]), factor: d[2], offset: d[4] || 0 }
    : { label: t(d[0]), factor: d[3] || 1, offset: 0 };
}
export function toDisplay(value, kind, system) { const u = unitSpec(kind, system); return value * u.factor + u.offset; }
export function fromDisplay(value, kind, system) { const u = unitSpec(kind, system); return (value - u.offset) / u.factor; }
export function parseExact(text) {
  const normalized = String(text).trim().replace(",", ".");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized) ? Number(normalized) : NaN;
}
export function validateExact(text, min, max, kind, system) {
  const value = fromDisplay(parseExact(text), kind, system);
  const tolerance = Math.max(1, Math.abs(min || 0), Math.abs(max || 0)) * 1e-10;
  return { value, valid: Number.isFinite(value) && value >= min - tolerance && value <= max + tolerance };
}
export const graphKinds = { availableThrust: "force", windForce: "force", maxWind: "speed", diskLoading: "pressure" };
export function shortcutAction(event) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
  if (event.target?.closest?.("input, textarea, select, button, summary, [contenteditable]")) return null;
  return ({ " ": "pause", f: "repair", r: "reset", g: "graph", c: "airflow", "1": "flight", "?": "help" })[event.key.toLowerCase()]
    || ({ KeyF: "repair", KeyR: "reset", KeyG: "graph", KeyC: "airflow", Digit1: "flight" })[event.code] || null;
}
