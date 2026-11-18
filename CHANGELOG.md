# Changelog

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
