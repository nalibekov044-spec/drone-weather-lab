# Drone Weather Lab 0.96.0 Beta

[Русский](README.md) · [English](README.en.md)

El simulador muestra cómo el viento, la altitud, las hélices, los motores y la batería afectan a un multicóptero. La 0.96.0 lleva el viento del pronóstico a la altura de vuelo.

## Cómo abrirlo

Descomprime el archivo y abre **Drone-Weather-Lab-0.96.0-Beta.html** o `Start.cmd`.

## Novedades de la 0.96.0

- Viento a la altura de vuelo: niveles del pronóstico a 10, 80, 120 y 180 m, ley potencial por debajo de 10 m, presión y temperatura a esa altura.
- La presión sigue a la altitud después de cargar un pronóstico.

## Lo que trajo la 0.95

- Tercer rediseño: la escena empieza en 322 px en lugar de 667. Por defecto solo se ven los ajustes principales.
- Tiempo por lugar: pronóstico de Open-Meteo para Almaty, Shymbulak, Big Almaty Lake, Medeu, Astana o tus coordenadas.
- Batería recalculada: curva LiFePO4 corregida, la masa sigue a la capacidad y un gráfico muestra la capacidad que vuela más tiempo.
- Motores recalculados: hélice de tres palas para el dron de carreras y límite de RPM del hexacóptero comparado con T-MOTOR.
- CAD propio: 3MF, archivos de hasta 64 MB, arrastrar a la escena, unidades y eje adivinados, masa de la pieza.

## Límites

El modelo no se ha comparado con un vuelo real. Las pruebas están en `docs/VERIFICATION-0.96.0.md`.
