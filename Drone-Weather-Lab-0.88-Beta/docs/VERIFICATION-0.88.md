# Verification of 0.88 Beta

## Run

```sh
node scripts/build-standalone.mjs
node --experimental-vm-modules scripts/verify-v087.mjs
node --experimental-vm-modules scripts/verify-v085.mjs
node --experimental-vm-modules scripts/verify-v088.mjs
node --experimental-vm-modules scripts/verify-ui.mjs --offline
node --experimental-vm-modules scripts/verify-standalone.mjs
```

Node 24 was used. The 0.85/0.87 script names refer to regression suites; they run against the current dist/ modules. Their reports retain historical version labels. verification-v088.json is the report for the new features. No claim that every possible input or every device is covered.

## Evidence

- 1080 battery circuit cases from the earlier suite: power balance, current limits, empty/hot pack handling; constant-current SOC, energy, thermal and polarization integration.
- 288 new combined preset/chemistry/temperature/charge/ESC cases. Terminal power agrees with current × voltage; commanded motor power respects pack availability and ESC input-current limits within numerical tolerance.
- Constant 500 W forecast with 20% reserve: 21.5065 minutes at dt=2 s versus 21.5046 minutes at dt=0.5 s for the configured illustrative pack. These are a verification fixture, not measured drone endurance.
- A 0.1 × 0.2 × 0.3 m rectangular mesh gives projected areas 0.060 / 0.020 / 0.030 m² along the tested directions. Independent scaling, yaw, negative-angle periodicity, concave polygon silhouette, malformed coordinates and non-planar faces checked.
- Uniform-flow CFD remains uniform and satisfies mass balance. A missing loaded actuator disk and boundary-intersecting mesh are rejected. Earlier tests also cover shear-wave decay, reversed sphere force, conservation of actuator force and torque, LES activation and finite output fields.
- Offline UI integration uses a stub Canvas and worker transport. Embedded workers execute actual mesh parsing, silhouette estimation, CFD and streamline calculations. This does not simulate browser permissions.
- Real cloud-browser QA: opened modular app, loaded the supplied OBJ with an actual file chooser, selected mm/Y-up, edited independent length to 300 mm, enabled CAD drag/CFD, and completed a CFD solve. The field remained labelled approximate. The browser used Canvas fallback; GPU shader rendering and iPhone/Android were not verified in this release.

## Remaining model limits

CFD numerical viscosity is elevated and the grid is coarse; physical and effective Re differ. There is no experimental calibration or real-drone grid-convergence study. A small residual is not proof of physical accuracy. Rotor disks and stationary geometry approximate the real hardware; no resolved blades or boundary layers. Drag silhouette interpolation is approximate; Cd, materials, mass, CG and rotor placement are not inferred from uploaded CAD. Future motor degradation and full 1.0 electronics redesign are outside this release.

## Model references

- NASA Glenn, drag equation: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/
- NASA Glenn, drag coefficient and reference area: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-coefficient/
- Deters, Ananda & Selig, Reynolds-number effects on small-scale propeller performance (2014), coefficient definitions: https://m-selig.ae.illinois.edu/pubs/DetersAnandaSelig-2014-AIAA-2014-2151.pdf
- Guo, Zheng & Shi (2002), forcing in LBM: https://journals.aps.org/pre/abstract/10.1103/PhysRevE.65.046308

These references ground equations and methods; they do not validate the simulator's chosen coefficients.
