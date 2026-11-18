# Drone Weather Lab 0.89 Beta

[Русский](README.md)

The simulator shows how wind, altitude, propellers and the battery affect a multicopter. Version 0.89 is a small update. It adds keyboard shortcuts and fixes the battery model, graphs and CAD.

## Run it

Unzip the archive and open **Drone-Weather-Lab-0.89-Beta.html**. Nothing needs to be installed. It works offline because styles, code and workers are built into the file.

Some browsers block workers in a local file. In that case run `python scripts/start.py`, or `Start.cmd` on Windows.

The `dist/` folder is ready for static hosting. With GitHub Pages turned on, the site rebuilds after every push to `main`. No EXE is included, but the build scripts are.

## What changed

- Shortcuts for all four views, battery replacement, report and settings download, force vectors, camera reset and help. They use physical key positions, so a Russian layout works too. They do nothing while you type.
- A new card shows where battery power goes: shafts, motors, ESC, electronics and the RC branch.
- RC branch energy and heat are integrated analytically inside each step.
- The quick flight time estimate no longer lowers cold capacity twice.
- The forecast uses the final current and voltage. A voltage below the controller cutoff reduces the available thrust.
- A strong updraft no longer gets an artificial minimum thrust.
- Graphs stay inside their range and use the current battery and ESC state.
- Stale power data no longer stays on screen during a pause.
- CAD is not recalculated when nothing changed. Broken ASCII STL vertices are rejected.

The shortcut table is in the Russian README and in the in-app help (H).

## Limits

This is a teaching model. CFD runs on a coarse D3Q19 grid with higher viscosity than real air. Blades and the boundary layer are not resolved. The CFD force is shown on its own and does not move the drone. The CFD core did not change in 0.89.

Battery and motor numbers have not been checked against real hardware. CAD drag area comes from the silhouette. You set mass, Cd and material yourself.

## Checks

Commands and results are in `docs/VERIFICATION-0.89.md`. The numbers are in `verification-v089.json`. All checks pass. That does not prove there are no bugs.

Rebuild the HTML file with `node scripts/build-standalone.mjs` (Node 24).
