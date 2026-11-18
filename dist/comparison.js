import { calculate } from './physics.js';
export const weatherKeys = ['windSpeed', 'windDirection', 'gusts', 'gustFrequency', 'turbulence', 'verticalWind', 'rainRate', 'temperature', 'altitude', 'humidity', 'pressureMode', 'pressureHpa', 'icing', 'windTransition'];
// 0.92: +1 means a larger value is better for the drone, -1 means a smaller value is better.
export const metricDirections = { reserve: 1, tilt: -1, flightMinutes: 1, electricalPower: -1, current: -1, maxWind: 1, availableThrust: 1, thrustToWeight: 1 };
export function compareConfigurations(a, b) {
  const sameWeather = b ? { ...b, ...Object.fromEntries(weatherKeys.map(key => [key, a[key]])) } : null;
  const first = calculate(a), second = sameWeather ? calculate(sameWeather) : null;
  return ['reserve', 'tilt', 'flightMinutes', 'electricalPower', 'current', 'maxWind', 'availableThrust', 'thrustToWeight'].map(key => {
    const row = { key, a: first[key], b: second ? second[key] : null };
    // Flight time is zero when hover is outside the model limits: that is "not available", not "0 minutes".
    row.aAvailable = key !== 'flightMinutes' || first.feasible;
    row.bAvailable = !second ? false : key !== 'flightMinutes' || second.feasible;
    row.verdict = verdict(key, row);
    row.percent = row.verdict === 'na' || Math.abs(row.a) < 1e-12 ? null : (row.b - row.a) / Math.abs(row.a) * 100;
    return row;
  });
}
function verdict(key, row) {
  if (row.b == null || !row.aAvailable || !row.bAvailable) return 'na';
  const scale = Math.max(Math.abs(row.a), Math.abs(row.b), 1e-9);
  if (Math.abs(row.b - row.a) <= scale * 0.005) return 'same';
  return (row.b - row.a) * metricDirections[key] > 0 ? 'better' : 'worse';
}
// Parameters that differ between two saved configurations, ignoring weather taken from A and derived CAD data.
export function changedParameters(a, b, ignore = weatherKeys) {
  if (!a || !b) return [];
  const skip = new Set([...ignore, 'cadAerodynamics']);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !skip.has(key)).filter(key => {
    const x = a[key], y = b[key];
    if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    return JSON.stringify(x) !== JSON.stringify(y);
  }).map(key => ({ key, a: a[key], b: b[key] }));
}
