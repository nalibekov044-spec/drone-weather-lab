# Drone Weather Lab 0.93 Beta

[Русский](README.md) · [Español](README.es.md)

The simulator shows how wind, altitude, propellers and the battery affect a multicopter. In 0.93 the motor model was rebuilt. Motors can now overheat and burn, like real ones.

## Run it

Unzip the archive and open **Drone-Weather-Lab-0.93-Beta.html**, or `Start.cmd` on Windows. Nothing needs to be installed.

## Motors

- **The rating is not a ceiling.** Motor power is the continuous rating. The ESC current, the battery and the maximum RPM are the hard limits. Above the rating a motor still runs, and it heats up.
- **Hot magnets.** Above 95 °C efficiency drops, so an overloaded motor heats even faster.
- **Stages.** Above 110 °C the motor wears out, above 145 °C it smokes, above 175 °C it can catch fire. Then it fails and stops.
- **Test stand.** A new checkbox in Motors and RPM. The drone stays fixed while every motor spins at the command.
- **Readouts.** The RPM line shows real speed, command and limit. Motor cards show the real load.

Try it: turn on the test stand, set 7200 RPM and about 260 W motor power. The motor catches fire in about half a minute. Press F to repair the motors.

## Other fixes

The component table now limits each motor to the thrust it has. The flight log counts energy since the last battery change. A/B no longer judges raw thrust, or power and current across different masses.

## Limits

Thermal values are illustrative. Time to fire is for illustration, not a prediction. The model has not been checked against a real drone.

## Checks

Commands and results are in `docs/VERIFICATION-0.93.md`. All checks pass. That does not prove there are no bugs.
