export function inputNumber(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  return text !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : NaN;
}
export function maximumTipSpeed(circumferential, horizontal, vertical, tiltRadians = 0) {
  const axial = -horizontal * Math.sin(tiltRadians) + vertical * Math.cos(tiltRadians);
  const inPlane = Math.sqrt(Math.max(0, horizontal ** 2 + vertical ** 2 - axial ** 2));
  return Math.hypot(circumferential + inPlane, axial);
}
export function validateMissionStages(stages) {
  if (!Array.isArray(stages) || stages.length < 1 || stages.length > 8) throw Error('stages');
  for (const stage of stages)
    for (const [name, min, max] of [
        ['minutes', .1, 120],
        ['speed', 0, 40],
        ['altitude', 0, 5000],
        ['wind', 0, 40]
      ])
      if (!stage || !Number.isFinite(stage[name]) || stage[name] < min || stage[name] > max) throw Error(
      name);
  return stages;
}
export function graphNeedsRefresh(layout, variable, metric, units) {
  return !layout || layout.variable !== variable || layout.metric !== metric || layout.units !== units;
}
