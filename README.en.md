# Drone Weather Lab 0.94 Beta

[Русский](README.md) · [Español](README.es.md)

[![Tests](https://github.com/nalibekov044-spec/drone-weather-lab/actions/workflows/tests.yml/badge.svg)](https://github.com/nalibekov044-spec/drone-weather-lab/actions/workflows/tests.yml)

The simulator shows how wind, altitude, propellers, motors and the battery affect a multicopter. In 0.94 the model was checked against published bench data, and its numbers are now much closer to real drones.

## Run it

Unzip the archive and open **Drone-Weather-Lab-0.94-Beta.html**, or `Start.cmd` on Windows. Nothing needs to be installed.

## What is new

- **Propeller power fixed.** It was about 2.5 times too high. Hover power now matches T-MOTOR bench tables within a few percent, and flight time is realistic.
- **Datasheet motor.** A motor can be set by three datasheet numbers: Kv, winding resistance and idle current. The speed limit follows the voltage, efficiency changes with load, and heating comes from copper and iron losses.
- **Validation tab (key 9).** The model is compared with manufacturer bench tables and with your own CSV. Ct and Cp can be fitted to your measurements.
- **Temperatures.** Under the flight scene you can see what overheats first and when. Three overload tests make a motor really burn.
- **Motor failure in flight.** A quadcopter without one motor spins and sinks; a hexacopter holds its heading.
- **Smaller fixes.** Realistic preset batteries, current and efficiency on motor cards, new statuses, temperatures to CSV, checks on GitHub.

Why does a motor not burn in normal flight? It should not. A matched motor has a margin, like a real one. To see overheating, run one of the overload tests.

Details: `docs/CHANGES-0.94.md` (in Russian).

## Limits

The model is checked against bench tables, not against a real flight. Thermal values are illustrative.

## Checks

`node scripts/verify-all.mjs` runs all 15 checks. Results are in `docs/VERIFICATION-0.94.md`. All checks pass. That does not prove there are no bugs.
