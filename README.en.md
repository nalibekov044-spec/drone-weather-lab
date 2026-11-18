# Drone Weather Lab 0.91 Beta

[Русский](README.md) · [Español](README.es.md)

The simulator shows how wind, altitude, propellers and the battery affect a multicopter. Version 0.91 adds control over background calculations. It also refines the battery, propellers and CFD, and brings 21 smaller fixes.

## Run it

Unzip the archive and open **Drone-Weather-Lab-0.91-Beta.html**, or `Start.cmd` on Windows. Nothing needs to be installed. If your browser blocks workers in a local file, run `python scripts/start.py`. The `dist/` folder is ready for static hosting. No EXE is included.

## Calculation modes

The top bar has three modes. Visible tab runs calculations only while the tab is on screen. Focus only also pauses when you switch to another window. Background allowed keeps the flight and a running CFD going without drawing. The browser may still slow down or freeze a hidden tab, and a closed tab calculates nothing.

When you come back, the flight does not jump ahead. A manual pause stays paused.

## Calculations

- The battery forecast recalculates its coefficients in the middle of each step.
- The thermal model was checked with packs as small as 5 g.
- Tip speed and rotor reaction torque were corrected.
- The mission plan keeps manual pressure and checks every stage first.
- CFD on different grids now uses the same physical bounds. An optional shared base viscosity is available. The force table shows whether each result has settled.

## Interface

Four tone buttons sit next to the theme picker. Contrast, panels, search and tabs were improved. All 21 fixes are listed in `docs/CHANGES-0.91.md`, each with the problem, the code and how it was checked.

Everything from 0.9 is still there.

## Limits

The model has not been checked against a real drone. CFD uses a coarse grid and raised viscosity. The mission plan ignores climb energy and acceleration. Battery curves and thermal values are illustrative.

## Checks

Commands and results are in `docs/VERIFICATION-0.91.md`. All checks pass. That does not prove there are no bugs. Rebuild with `node scripts/build-standalone.mjs` (Node 24).
