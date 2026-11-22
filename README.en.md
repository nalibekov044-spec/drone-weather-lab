# Drone Weather Lab 0.95 Beta

[Русский](README.md) · [Español](README.es.md)

[![Tests](https://github.com/nalibekov044-spec/drone-weather-lab/actions/workflows/tests.yml/badge.svg)](https://github.com/nalibekov044-spec/drone-weather-lab/actions/workflows/tests.yml)

The simulator shows how wind, altitude, propellers, motors and the battery affect a multicopter. In 0.95 the interface was redesigned for the third time. The scene and the main numbers are visible right away.

## Run it

Unzip the archive and open **Drone-Weather-Lab-0.95-Beta.html**, or `Start.cmd` on Windows. Nothing needs to be installed.

## What is new

- **Third redesign.** The top of the page takes half the space. The flight scene starts at 322 px instead of 667. Only the main settings are shown by default; the rest of the 90 open with one button.
- **Weather by place.** Almaty, Shymbulak, Big Almaty Lake, Medeu, Astana or your own coordinates. An Open-Meteo forecast fills in temperature, wind, gusts, pressure, rain and altitude.
- **Battery recalculated.** The LiFePO4 curve is fixed. Battery and drone mass follow the capacity. A new chart on the Batteries tab shows which capacity flies longest.
- **Motors recalculated.** The racer now has a three-blade propeller fitted to a bench table, with a thrust-to-weight of 7.7 instead of 3.2. The hexacopter speed limit is checked against a T-MOTOR table.
- **Your own CAD.** 3MF is supported. Files up to 64 MB; large meshes are simplified automatically. Drop a file on the scene. Units and the up axis are guessed, and the part mass follows the material and infill.
- **Faster.** On-screen text is rewritten only when it changes.

Details: `docs/CHANGES-0.95.md` (in Russian).

## Limits

The model is checked against bench tables, not against a real flight. Thermal values are illustrative. The weather forecast needs the internet; everything else works offline.

## Checks

`node scripts/verify-all.mjs` runs all 16 checks. Results are in `docs/VERIFICATION-0.95.md`. All checks pass. That does not prove there are no bugs.
