# Drone Weather Lab 0.94 Beta

[Русский](README.md) · [English](README.en.md)

El simulador muestra cómo el viento, la altitud, las hélices, los motores y la batería afectan a un multicóptero. En la 0.94 el modelo se comparó con datos de banco publicados.

## Cómo abrirlo

Descomprime el archivo y abre **Drone-Weather-Lab-0.94-Beta.html** o `Start.cmd`.

## Novedades

- La potencia de la hélice era unas 2,5 veces demasiado alta. Ahora coincide con las tablas de T-MOTOR.
- Motor de hoja de datos: Kv, resistencia del devanado y corriente en vacío.
- Pestaña Validación (tecla 9): compara el modelo con tablas de banco y con tu CSV.
- Temperaturas: qué se sobrecalienta primero y tres pruebas de sobrecarga.
- Fallo de motor en vuelo: un cuadricóptero gira, un hexacóptero mantiene el rumbo.

## Límites

El modelo no se ha comparado con un vuelo real. Las pruebas están en `docs/VERIFICATION-0.94.md`.
