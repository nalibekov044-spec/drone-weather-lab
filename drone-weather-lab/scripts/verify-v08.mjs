import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..'), modules = new Map();
async function load(file) {
  file = path.resolve(root, file); if (modules.has(file)) return modules.get(file);
  const m = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file }); modules.set(file, m);
  await m.link((s, p) => load(path.resolve(path.dirname(p.identifier), s))); return m;
}
async function module(name) { const m = await load(`dist/${name}.js`); if (m.status !== 'evaluated') await m.evaluate(); return m.namespace; }
const i18n = await module('i18n'), physics = await module('physics'), comparison = await module('comparison'), builder = await module('drone-builder'), cfd = await module('cfd-core'), flow = await module('flow-lines');
i18n.setLanguage('en');
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
for (const m of html.matchAll(/>([^<>]+)</g)) {
  const text = m[1].trim(); if (text === 'Русский') continue;
  assert(!/[А-Яа-яЁё]/.test(i18n.t(text)), `Untranslated HTML: ${text}`);
}
for (const source of Object.keys(i18n.dictionary)) assert(!/[А-Яа-яЁё]/.test(i18n.t(source)), `Untranslated entry: ${source}`);
i18n.setLanguage('ru'); assert.equal(i18n.t('Запас тяги'), 'Запас тяги');
const a = { ...physics.baseDefaults }, b = { ...a, payload: a.payload + 1, windSpeed: 35, temperature: -10 };
const rows = comparison.compareConfigurations(a, b);
const expected = physics.calculate({ ...b, ...Object.fromEntries(comparison.weatherKeys.map(k => [k, a[k]])) });
assert.equal(rows.find(r => r.key === 'reserve').b, expected.reserve);
assert(rows.find(r => r.key === 'reserve').b < rows.find(r => r.key === 'reserve').a);
for (const preset of Object.keys(physics.dronePresets)) {
  const g = builder.geometryFor({ ...a, ...physics.dronePresets[preset], dronePreset: preset });
  assert(g.parts.some(p => p.role === 'battery')); assert(g.parts.some(p => p.role === 'camera'));
  assert.equal(g.parts.filter(p => p.role === 'motor').length, g.rotors.length);
}
const sphere = { kind: 'ellipsoid', center: [0, 0, 0], size: [1, 1, 1], role: 'body' };
const config = { ...a, windSpeed: 3, windDirection: 0, verticalWind: 0, downwashSpeed: 0, quality: 'fast', maxSteps: 600, density: 1.225, worldScale: 0.36, frameSize: 360, kinematicViscosity: 0.035, geometryParts: [sphere], rotorThrusts: [0, 0, 0, 0], propRadius: 0.2 };
const positive = cfd.solveCFD(config), negative = cfd.solveCFD({ ...config, windDirection: 180 });
assert(positive.stats.surfaceForce[0] > 0, 'Drag must point with the incoming wind');
assert(negative.stats.surfaceForce[0] < 0, 'Reversed wind must reverse drag');
assert(Math.abs(positive.stats.surfaceForce[0] + negative.stats.surfaceForce[0]) < 1e-4, 'Mirror drag');
assert(Math.abs(positive.stats.surfaceForce[1]) < 1e-4 && Math.abs(positive.stats.surfaceForce[2]) < 1e-4, 'No lateral force on symmetric sphere');
const front = flow.sampleField([-0.65, 0, 0], positive), back = flow.sampleField([0.65, 0, 0], positive);
assert(front.pressure > back.pressure, 'Upstream pressure must exceed downstream pressure');
assert(Math.abs(positive.stats.densityDrift) < 0.01, 'Bounded mean density deviation');
const fine = cfd.solveCFD({ ...config, quality: 'balanced', maxSteps: 1400 });
assert(Math.abs(fine.stats.numericalViscosity - positive.stats.numericalViscosity) < 1e-12, 'Grid study uses the same physical viscosity');
assert(fine.velocityX.every(Number.isFinite));
const report = {
  version: '0.8.0', purpose: 'Numerical regression and limited grid sensitivity check, not experimental drone validation',
  sphere: { windSpeed: config.windSpeed, diameterM: 0.36, kinematicViscosity: 0.035, upstreamPressurePa: front.pressure, downstreamPressurePa: back.pressure },
  grids: [positive, fine].map(f => ({ cells: f.stats.cells, cellSizeM: f.stats.spacingM, viscosity: f.stats.numericalViscosity, effectiveReynolds: f.stats.effectiveReynolds, iterations: f.stats.iterations, residual: f.stats.residual, converged: f.stats.converged, forceN: f.stats.surfaceForce, meanDensityDeviation: f.stats.densityDrift, maxLatticeMach: f.stats.maxLatticeMach, elapsedMs: f.stats.elapsedMs })),
  dragRelativeDifference: Math.abs(fine.stats.surfaceForce[0] - positive.stats.surfaceForce[0]) / Math.abs(fine.stats.surfaceForce[0]),
  conclusions: ['Uniform-flow, conservation, continuation and hover checks are in verify-v06.mjs.', 'Two grids indicate sensitivity only. No Richardson extrapolation or grid independence is established.', 'Physical viscosity is held constant for the sphere case. Default drone calculations use regularised viscosity.']
};
fs.writeFileSync(path.join(root, 'verification-v08.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log('v0.8 passed: English coverage, language switch, equal-weather comparison, shared preset geometry, drag direction, symmetry, pressure and fixed-viscosity grid sensitivity.');
