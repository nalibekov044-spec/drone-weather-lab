import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
async function module(name) { const m = new vm.SourceTextModule(fs.readFileSync(path.join(root, "dist", name), "utf8")); await m.link(() => {}); await m.evaluate(); return m.namespace; }
const u = await module("units.js"), thermal = await module("systems.js");
for (const system of ["metric", "imperial"]) for (const kind of Object.values(u.parameterUnits)) for (const value of [-40, 0, 1.23456, 32, 1000]) {
  assert(Math.abs(u.fromDisplay(u.toDisplay(value, kind, system), kind, system) - value) < 1e-8);
}
assert.equal(u.toDisplay(0, "temperature", "imperial"), 32);
assert.equal(u.toDisplay(15, "inch", "metric"), 381);
assert.equal(u.parseExact("1,237"), 1.237);
assert(Number.isNaN(u.parseExact("1.2.3")));
assert(!u.validateExact("", 0, 20, "kg", "metric").valid);
assert(!u.validateExact("99", 0, 20, "kg", "metric").valid);
assert(u.validateExact("1.234567", 0, 20, "kg", "metric").valid);
const event = { key: "F", target: { closest: () => null } };
assert.equal(u.shortcutAction(event), "repair");
assert.equal(u.shortcutAction({ ...event, repeat: true }), null);
assert.equal(u.shortcutAction({ ...event, target: { closest: () => ({}) } }), null);
const p = { temperature: 20, motorEfficiency: 88, rainRate: 0 };
const initial = () => ({ temperatures: [20], healths: [1], fires: [0], exposure: [0], ignition: [0] });
function advance(system, load, seconds, dt = 1 / 60, wind = 0, rpm = 5000) {
  for (let t = 0; t < seconds - 1e-8; t += dt) system = thermal.stepMotorThermals(system, p, { effectiveRpms: [rpm], motorLoadPercents: [load] }, wind, dt);
  return system;
}
const burst = advance(initial(), 300, 5);
assert.equal(burst.fires[0], 0); assert(burst.healths[0] > 0.99);
const nominal = advance(initial(), 90, 300);
assert.equal(nominal.fires[0], 0); assert.equal(nominal.healths[0], 1);
const warm = advance(initial(), 200, 35);
assert(warm.temperatures[0] > nominal.temperatures[0]); assert(warm.healths[0] < 1);
const cool = advance(warm, 0, 120, 1 / 60, 8, 0);
assert(cool.temperatures[0] < warm.temperatures[0]); assert(cool.healths[0] <= warm.healths[0]);
assert(thermal.thermalAvailability(cool.temperatures[0]) > thermal.thermalAvailability(warm.temperatures[0]));
const severe = advance(initial(), 300, 60);
assert(severe.fires[0] > 0); assert(severe.healths[0] < warm.healths[0]);
const stopped = advance({ temperatures: [20], healths: [0], fires: [0] }, 5000, 60, 1 / 60, 0, 0);
assert.equal(stopped.fires[0], 0); assert.equal(stopped.temperatures[0], 20);
const fine = advance(initial(), 150, 20), coarse = advance(initial(), 150, 20, 1 / 30);
assert(Math.abs(fine.temperatures[0] - coarse.temperatures[0]) < 1e-8);
assert(Math.abs(fine.healths[0] - coarse.healths[0]) < 0.001);
const windy = advance(initial(), 150, 60, 1 / 60, 15), still = advance(initial(), 150, 60);
assert(windy.temperatures[0] < still.temperatures[0]);
console.log("v0.7 passed: unit round trips, decimal validation, typing-safe shortcuts, short overload, delayed fire, cooling, irreversible wear, failed motor and timestep invariance.");
console.log(JSON.stringify({ burstTemperature:burst.temperatures[0], severeTemperature:severe.temperatures[0], fireAt60s:severe.fires[0], healthAt60s:severe.healths[0] }));
