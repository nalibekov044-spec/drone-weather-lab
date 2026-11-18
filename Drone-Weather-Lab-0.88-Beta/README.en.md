# Drone Weather Lab 0.88 Beta

Based on the attached **0.87 Beta source release**.

Extract the ZIP and open **Drone-Weather-Lab-0.88-Beta.html**. Scripts, styles and both workers are embedded. No installation or Internet connection is required. If local workers are blocked, use a different browser or run `python scripts/start.py`. For static hosting, publish `dist/`, with `index.html` at the hosting root. This package does not deploy automatically. A Windows executable is not included; launcher source and build scripts remain available.

## Three changes

1. **Power and endurance.** Select an integer 1S–16S pack or infer the integer series count from nominal voltage and chemistry. ESC power limits now solve shared loaded bus voltage iteratively. The main endurance tile integrates SOC, thermal response and RC polarization to reserve, cutoff or a power/temperature limit, at constant demand for the configured peak wind. It uses a two-second step and a six-hour horizon. Parameter sweeps retain their fast initial-current estimate. Battery thermal mass is not added to vehicle mass again.
2. **Aerodynamics and CFD checks.** Flight drag uses air velocity relative to the moving vehicle, including vertical motion. The tilt-area iteration is refined, and an arbitrary 8% water-vapour pressure cap is removed. CFD convergence now also requires mass-flow balance and mean-density drift below 1%, together with velocity residual below 0.1% and force residual below 0.5%, for three checks after at least 200 iterations. Missing loaded rotor disks and CAD touching the outer boundary are rejected; under-resolved disks are flagged. CFD surface force is not fed into flight motion.
3. **CAD import.** Source bounds and units, independent X width / Y height / Z length before yaw, aspect lock, continuous yaw, final bounds and reset. Source units must be selected manually. Optional drag area comes from the union silhouette rasterized at 96 × 96, sampled every 10 degrees and interpolated for wind direction. Cd, mass and motor positions remain manual. Planar concave OBJ faces use ear clipping; invalid/non-planar or overly large polygons are rejected. Files remain local. Closed geometry is required for mesh CFD.

Example: `examples/box-100x40x200-mm-Y-up.obj`; choose millimetres and Y up to obtain 100/40/200 mm along X/Y/Z.

## Verification

Run `node --experimental-vm-modules scripts/verify-v088.mjs`. Results: `verification-v088.json`; verification notes: `docs/VERIFICATION-0.88.md`. The previous electrical suite covers 1080 cases; the new pack/ESC sweep covers 288 cases. Earlier shear-wave, sphere-force, momentum/torque and UI checks also run on this code. Offline worker tests include the new CAD projection task. A real browser loaded an OBJ, applied 100 × 40 × 300 mm dimensions, enabled projected drag and completed a mesh-CFD solve.

These are numerical checks, not experimental drone validation. CFD uses coarse grids and elevated numerical viscosity; physical and solver Reynolds numbers differ, and real-drone grid convergence is not established. Blades and boundary layers are unresolved. Battery curves and thermal constants remain illustrative. No real-device endurance claim is made.

Build offline HTML with `node scripts/build-standalone.mjs`.
