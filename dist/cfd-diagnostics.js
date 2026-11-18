export function matchedViscosity(config) {
  const reference = Math.max(1, Math.hypot(config.windSpeed || 0, config.verticalWind || 0), config
    .downwashSpeed || 0);
  const tau = config.solverMode === 'bgk' ? .62 : .54;
  return (tau - .5) / 3 * (6 / 40) * config.worldScale * reference / .065;
}
export function gridIdentity(config) {
  const {
    quality,
    iterationBudget,
    maxSteps,
    meshTriangles,
    ...physics
  } = config;
  return JSON.stringify(physics);
}
export function compareGridResults(rows) {
  return [...rows].sort((a, b) => b.spacingM - a.spacingM).map((row, i, a) => ({
    ...row,
    changeN: i ? Math.hypot(...row.force.map((v, k) => v - a[i - 1].force[k])) : null
  }));
}
