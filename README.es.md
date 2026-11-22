# Drone Weather Lab 0.95 Beta

[Русский](README.md) · [English](README.en.md)

El simulador muestra cómo el viento, la altitud, las hélices, los motores y la batería afectan a un multicóptero. En la 0.95 la interfaz se rediseñó por tercera vez.

## Cómo abrirlo

Descomprime el archivo y abre **Drone-Weather-Lab-0.95-Beta.html** o `Start.cmd`.

## Novedades

- Tercer rediseño: la escena empieza en 322 px en lugar de 667. Por defecto solo se ven los ajustes principales.
- Tiempo por lugar: pronóstico de Open-Meteo para Almaty, Shymbulak, Big Almaty Lake, Medeu, Astana o tus coordenadas.
- Batería recalculada: curva LiFePO4 corregida, la masa sigue a la capacidad y un gráfico muestra la capacidad que vuela más tiempo.
- Motores recalculados: hélice de tres palas para el dron de carreras y límite de RPM del hexacóptero comparado con T-MOTOR.
- CAD propio: 3MF, archivos de hasta 64 MB, arrastrar a la escena, unidades y eje adivinados, masa de la pieza.

## Límites

El modelo no se ha comparado con un vuelo real. Las pruebas están en `docs/VERIFICATION-0.95.md`.
