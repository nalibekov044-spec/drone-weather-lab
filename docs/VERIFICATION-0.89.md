# Verification of 0.89 Beta

Built from the available 0.88 project; checked with Node 24.22.1 on Linux. This is a numerical implementation check, not real-drone calibration.

## Reproduce

```sh
node scripts/build-standalone.mjs
node --experimental-vm-modules scripts/verify-v089.mjs
node --experimental-vm-modules scripts/verify-v087.mjs
node --experimental-vm-modules scripts/verify-v088.mjs
node --experimental-vm-modules scripts/verify-v085.mjs
node --experimental-vm-modules scripts/verify-v07.mjs
node --experimental-vm-modules scripts/verify-ui.mjs --offline
node --experimental-vm-modules scripts/verify-standalone.mjs
```

Suite names retain historical versions but load current modules. Windows/v0.8 reports and 0.88 screenshots are historical evidence, not new 0.89 hardware or GPU checks. Current logs use a v089- prefix.

## Results

- 105 counted shortcut binding/modifier cases, plus editing, physical Russian-layout key, Shift+R, Escape and question-mark assertions. Integration tests cover view changes, vectors, camera, battery, report/settings, reset and CAD worker reuse.
- 180 instantaneous power-allocation cases: maximum balance residual 9.095e-13 W. Chemical power equals shafts + motor/ESC/avionics consumption + battery heat + RC storage rate, including negative storage rate during relaxation.
- Fixed-coefficient 120 s RC/thermal fixture agrees between one large step and 1200 small steps within 1e-8. Independent Euler integration agrees within 0.0001 °C and 1e-6 V. Source/output/heat/RC storage energy residual 5.638e-17 Wh. These are mathematical tolerances, not hardware accuracy.
- Additional checks cover forecast final state, finite time limits, temperature consistency of quick endurance, controller cutoff, excessive updraft, graph inputs, geometry cache, nonfinite probes, rotorless lines and malformed STL.
- Existing regressions: 1080 battery circuit cases and 288 coupled preset/chemistry/temperature/SOC/ESC cases; motor heating/wear and units; CFD shear-wave decay, sphere-force direction, actuator thrust/torque, LES, finite fields and uniform flow.
- Actual standalone worker execution: embedded mesh parsing, CAD silhouette, CFD field and streamlines; no runtime script or stylesheet requests. UI harness uses stubbed Canvas/worker transport.
- Cloud Chrome modular-app smoke check: 0.89 label, physical keys 2/4/1, help H/Escape and camera O, graph formula and visible layout. Canvas fallback was active. The only observed console error came from the browser extension metadata sender, not the app. No new browser CAD upload, mobile, real Windows EXE or GPU rendering claim in this release.

All 21 dist JavaScript modules parsed; all 235 HTML IDs are unique. Root and dist standalone copies are byte-identical.

## Integration assumptions

The RC model uses tau=20 s and C=tau/Rp; resistor heat is I²R0+Up²/Rp. Source power minus terminal power is I²R0+IUp, and IUp−Up²/Rp is the RC storage rate. The closed-form step freezes current, OCV, R0 and Rp, but evolves Up and temperature. Forecasts recompute coefficients every step; this remains an approximation for a changing constant-power load. Thermal coefficients and cell curves are illustrative. The older constant-heat test fixture explicitly omits the detailed-loss marker to continue checking its artificial fixed source.

CFD solver core is unchanged from 0.88. Its coarse grid and elevated viscosity remain; real-drone grid convergence and experimental validation are absent. CAD silhouette does not infer Cd, mass, CG or material. Review and passing tests cannot guarantee every bug has been found.

## References

- MDN KeyboardEvent / code / key: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent and https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
- MathWorks one-RC equivalent circuit: https://www.mathworks.com/help/simscape/ug/lithium-battery-cell-one-rc-branch-equivalent-circuit.html
- Earlier aerodynamic/CFD method references: VERIFICATION-0.88.md.

References describe methods, not calibration of this simulator's coefficients.
