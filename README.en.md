# Drone Weather Lab 0.92 Beta

[Русский](README.md) · [Español](README.es.md)

The simulator shows how wind, altitude, propellers and the battery affect a multicopter. Version 0.92 brings six updates.

## Run it

Unzip the archive and open **Drone-Weather-Lab-0.92-Beta.html**, or `Start.cmd` on Windows. Nothing needs to be installed. If your browser blocks workers in a local file, run `python scripts/start.py`.

## What is new

- **Flight log.** A real chart with axes and eight channels. Point at it to read a value. A summary shows min, mean, max, Wh and mAh used.
- **Mission plan.** A charge chart by stage, the distance of each stage and the time left after the plan.
- **Altitude ceiling.** The highest altitude where the drone can still hover, and the reason it stops there. A second ceiling keeps a thrust reserve, 30% by default.
- **A/B comparison.** Better or worse for each value, with percentages. Thrust to weight was added, and the settings that differ in B are listed.
- **Centre of gravity.** Thrust and weight moments used to have the same sign. That is fixed. The component table shows how much thrust each motor needs.
- **Display.** Propeller clearance no longer shows ":". Presets get a clearance too. My drone follows the chosen language and units.

Details with formulas and checks: `docs/CHANGES-0.92.md` (in Russian).

## Limits

The model has not been checked against a real drone. CFD uses a coarse grid. The plan and the ceiling ignore climb energy and acceleration.

## Checks

Commands and results are in `docs/VERIFICATION-0.92.md`. All checks pass. That does not prove there are no bugs. Rebuild with `node scripts/build-standalone.mjs`.
