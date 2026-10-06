import { calculate } from './physics.js';
export const weatherKeys = ['windSpeed', 'windDirection', 'gusts', 'gustFrequency', 'turbulence', 'verticalWind', 'rainRate', 'temperature', 'altitude', 'humidity', 'pressureMode', 'pressureHpa', 'icing', 'windTransition'];
export function compareConfigurations(a, b) {
  const sameWeather = b ? { ...b, ...Object.fromEntries(weatherKeys.map(key => [key, a[key]])) } : null;
  const first = calculate(a), second = sameWeather ? calculate(sameWeather) : null;
  return ['reserve', 'tilt', 'flightMinutes', 'electricalPower', 'current', 'maxWind', 'availableThrust'].map(key => ({ key, a: first[key], b: second ? second[key] : null }));
}
