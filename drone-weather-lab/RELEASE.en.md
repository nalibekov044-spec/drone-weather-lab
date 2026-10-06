# Drone Weather Lab 0.85 Beta

The simulator can be downloaded as one HTML file and opened without a local server. Python and Node.js are not needed to use it. A GitHub Actions workflow also builds a Windows launcher containing the same simulator.

Drone models have more detailed motors, camera mounts, lights and solid twisted propellers. Blade geometry is cached, and stopped motors retain their blade angle.

CFD now includes optional Smagorinsky eddy viscosity and torque sources in the rotor disks. Diagnostics report velocity and force residuals, boundary mass flow balance, averaged surface force and added viscosity. Thermal motor limits affect the available disk thrust.

Numerical checks include analytical shear-wave decay and source force/torque balance. This remains an experimental engineering project. Coarse grids, elevated numerical viscosity and the lack of real-drone validation limit its accuracy.

Use the HTML download for the simplest launch. The Windows executable is built by the release workflow and opens the default browser; it is not a separate flight simulator engine.
