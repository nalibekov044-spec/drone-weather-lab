# Drone Weather Lab 0.9 Beta

[Русский](README.md) · [Español](README.es.md)

The simulator shows how wind, altitude, propellers and the battery affect a multicopter. Most of the workspace was rebuilt in 0.9.

## Run it

Unzip the archive and open **Drone-Weather-Lab-0.9-Beta.html**. On Windows you can also open `Start.cmd`. Nothing needs to be installed, and it works offline.

If your browser blocks workers in a local file, run `python scripts/start.py`. The `dist/` folder is ready for static hosting. With GitHub Pages turned on, the site rebuilds by itself. No EXE is included.

## What is new

- **Workspace.** A new layout and four themes. Spanish joins Russian and English.
- **My drone.** A separate calculation for your own design. A component table gives total mass and centre of gravity.
- **Batteries.** Build a pack from cells in series (S) and parallel (P). LiPo, Li-ion, LiHV and LiFePO4 are available. Your own packs can be saved.
- **Graphs.** Fix a reference curve and compare. See the data as a table or export it to CSV.
- **Airflow.** Flow slices and a manual CFD start. An outdated field is marked.
- **3D.** A redrawn body and an exploded view.
- **New tabs.** Mission plan, flight log, projects, wind scenarios and Ct/Cp fitting from bench data.

The full list of 10 large, 5 medium and 20 small changes is in `docs/FEATURES-0.9.md`.

## Controls

Space pauses. Keys 1 to 8 open the eight tabs. R restarts the flight and keeps the battery and motors. Shift + R resets the main settings and CAD. F repairs the motors and B replaces the battery. E saves a report, S saves settings. V shows forces, O resets the camera and H opens help. Shortcuts do nothing while you type.

## Batteries

```
Qpack = Np · Qcell
Rpack = Ns · Rcell / Np
mpack = Ns · Np · mcell
```

Installing a pack does not change the drone mass, so update it in the component table. Count the battery only once. Example cells are illustrative, not real products.

## Limits

This is a teaching model. CFD uses a coarse grid and raised viscosity, and its core did not change in 0.9. The model has not been checked against a real drone. The mission plan ignores climb energy and acceleration. CAD gives size and an optional silhouette area, not mass or Cd.

## Checks

Commands and results are in `docs/VERIFICATION-0.9.md`. All checks pass. That does not prove there are no bugs. Rebuild with `node scripts/build-standalone.mjs` (Node 24).
