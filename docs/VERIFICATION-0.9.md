# Verification of 0.9 Beta

Local build from the available 0.89 source. Node 24.22.1 on Linux. No deployment or Windows EXE build was performed.

## Reproduce

```sh
node scripts/build-standalone.mjs
node --experimental-vm-modules scripts/verify-v090.mjs
node --experimental-vm-modules scripts/verify-v089.mjs
node --experimental-vm-modules scripts/verify-v087.mjs
node --experimental-vm-modules scripts/verify-v088.mjs
node --experimental-vm-modules scripts/verify-v085.mjs
node --experimental-vm-modules scripts/verify-ui.mjs --offline
node --experimental-vm-modules scripts/verify-standalone.mjs
```

## Numerical evidence

- 60 S/P/chemistry configurations, 720 electrical load cases. Maximum terminal power balance residual 2.27e-13 W.
- Analytical mass/CG/point-inertia fixture and added CG moments verified. Ct/Cp inversion checked using known coefficients.
- One two-minute mission segment and two consecutive one-minute segments give an energy difference of 0 Wh for the same fixture. Initial reserve stops the mission without discharge. Invalid stage limits are rejected.
- 575 main dictionary entries have Spanish translations. English/Spanish static HTML text and dictionary strings contain no untranslated Cyrillic, excluding the Russian language name. Workbench text uses a separate trilingual catalogue.
- 25 runtime JavaScript modules parse. Visual housing detail and explosion leave physical geometry unchanged.
- Regression suites: 1080 battery circuits; 288 coupled battery/ESC/CAD configurations; 180 power-allocation cases with RC storage balance; 133 counted shortcut/modifier cases. Historical suite/report labels remain in their files while running current code.
- CFD regression covers shear-wave decay, actuator force/torque, sphere force direction, LES, finite fields and uniform-flow mass balance. The solver core is unchanged from 0.89.
- Standalone tests execute embedded mesh import, silhouette, CFD and streamline workers without runtime script or stylesheet requests. The legacy UI harness uses stubbed Canvas/worker transport; it does not mount the browser-only workbench panels.

## Browser evidence

Cloud Chrome opened the modular app and the built standalone HTML. The following were exercised through actual UI controls:

- Eight views with unique DOM IDs; keyboard 6 opens Batteries. No horizontal document overflow at the checked desktop viewport.
- Spanish labels, graph formula, numeric formatting, Sand/Polar/Graphite themes and light-theme text/background contrast. Camera/view controls and exploded housing were inspected in Canvas fallback.
- Invalid series count disables pack installation; an 8S LiFePO4 pack installs the expected chemistry/cell count/capacity and changes live voltage. A named 6S2P Li-ion profile was saved and exported; the downloaded JSON was read back and contains the entered cell values.
- Component ledger applied mass/CG, independent calculation rendered its quantities, and a three-stage mission completed with sequential charge/energy results. A named local project was saved and loaded.
- Fast manual CFD completed, a speed slice was displayed, and graph baseline/data-table controls worked. After changing wind in manual mode, the field was marked outdated and slice sampling was refused until recalculation.
- A PNG scene download completed. The capture path composites WebGL with the overlay during rendering; this browser used Canvas, so real GPU capture remains unverified.
- Native browser fullscreen was unavailable here; the expanded-scene fallback filled the viewport. Mobile devices and a real Windows executable were not tested.

Only browser-extension metadata errors were observed in the inspected console logs; no app error was observed in these exercised paths. Passing checks is not proof that every possible error has been found.

## Model limits

Four cell curves and thermal parameters are illustrative. Pack mass sums cell masses; connections/holders require separate components. CAD does not infer mass or Cd. Component inertia is a point-mass estimate and no rotational attitude-control solver was added. Independent design calculations use initial charge and healthy motors. Missions assume steady horizontal stages with headwind and omit climb energy, acceleration and future motor damage. CFD remains coarse-grid with elevated numerical viscosity and no real-drone experimental calibration. Display-only housing details do not alter the CFD mask.

## References

- NASA Glenn drag equation and area/Cd relationship: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/ and https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-coefficient/
- Equivalent-circuit cell method: https://www.mathworks.com/help/simscape-battery/ref/batteryequivalentcircuit.html
- Earlier CFD method references and RC integration details: VERIFICATION-0.88.md and VERIFICATION-0.89.md.

References explain equations and methods; they do not calibrate this simulator's chosen coefficients.
