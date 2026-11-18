# Changelog

## 0.93 Beta

The motor model was rebuilt.

- Rated motor power is now a continuous rating, not a hard ceiling. The ESC current, the battery and the maximum RPM are the real limits. A motor can run above its rating, and then it heats up.
- Hot magnets lower efficiency, so an overloaded motor heats faster. Smoke, fire and motor failure can now actually happen.
- A test stand mode runs every motor at the RPM command while the drone stays fixed.
- The RPM readout shows the real speed, the command and the limit. Motor cards show the real load.
- The component table limits each motor to the thrust it has and shows what stays unbalanced. A failed motor counts as zero.
- The flight log counts energy only since the last battery change.
- In A/B, raw thrust gets no verdict, and power and current are not judged when the take-off mass differs.

## 0.92 Beta

Six updates.

- Flight log: a real chart with axes, eight channels, a value under the mouse and a summary with Wh and mAh used.
- Mission plan: a charge chart by stage, the distance of each stage and the time left after the plan.
- Altitude ceiling: the highest altitude where the drone can still hover, and what limits it.
- A/B comparison: better or worse for each value, percentages, thrust to weight and a list of changed settings.
- Centre of gravity: thrust and weight moments now have opposite signs. The component table shows how much thrust each motor needs.
- Display fixes: propeller clearance no longer shows ":", presets get a clearance, and My drone follows the language and units.

## 0.91 Beta

- Three calculation modes: visible tab, focus only and background allowed. Coming back does not fast forward the flight.
- The battery forecast uses midpoint coefficients. Small packs, blade tip speed, rotor torque and manual pressure in missions were fixed.
- CFD uses the same physical bounds on every grid, with an optional shared base viscosity. The force table marks results that have not settled.
- Four tone buttons and 21 smaller fixes, listed in docs/CHANGES-0.91.md.

## 0.9 Beta

A new workspace with four themes. The interface now has Spanish next to Russian and English.

- My drone: a separate calculation for your own design. A component table gives the total mass and the centre of gravity.
- Batteries: build a pack from cells in series and in parallel. LiPo, Li-ion, LiHV and LiFePO4 are available, and you can save your own profiles.
- Graphs: fix one curve as a reference and compare it with a new one. The data is shown as a table and exports to CSV.
- Airflow: flow slices and a manual start for CFD. An outdated field is marked as outdated.
- 3D: a redrawn body and an exploded view.
- New tabs: mission plan, flight log, projects, wind scenarios and Ct/Cp fitting from bench data.

Formula labels now separate bus power from shaft power. Imported projects are checked before they are applied. The CFD solver core did not change. The full list is in docs/FEATURES-0.9.md.

## 0.89 Beta

- More keyboard shortcuts. They follow physical key positions, so a Russian layout works too. They do nothing while you type in a field.
- A new card shows where battery power goes.
- The energy and heat of the battery RC branch are integrated exactly inside each step.
- The quick flight time estimate no longer lowers cold capacity twice.
- Strong updrafts, graph limits and paused power data are fixed.
- CAD geometry is not recalculated when nothing changed. Broken ASCII STL vertices are rejected.

The CFD core is the same as in 0.88.

## 0.88 Beta

Three updates.

1. Power. The battery uses a whole number of cells, from 1S to 16S. ESC limits follow the voltage drop under load. Flight time is integrated until the reserve or the first power limit.
2. Air and CFD. Drag uses the air speed relative to the moving drone. CFD stops only when velocity, force, mass flow and density have all settled.
3. CAD. You choose the file units, set each size, lock proportions and rotate the model. Drag area can come from the body silhouette.

A test box with known dimensions was added to examples.

## 0.87 Beta

The battery now discharges live. Its voltage depends on charge, it heats up, wears and keeps a reserve. Battery and ESC limits reduce the power that motors get. Motor heating follows the power they really receive. ESC heating, controller supply limits and sensor delay were added.

Also new: standard atmosphere, a 5000 m weather preset and live power data. The Windows launcher can be built from source. CFD did not change since 0.85.

## 0.85 Beta

A single offline HTML file and a Windows launcher build. CFD gained LES turbulence, actuator disks that keep torque, force convergence and mass flow checks. The 3D model got motor housings, camera mounts and twisted propellers.

The CFD grid is still coarse. The model has not been checked against a real drone.
