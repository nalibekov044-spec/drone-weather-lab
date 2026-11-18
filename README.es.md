# Drone Weather Lab 0.93 Beta

[Русский](README.md) · [English](README.en.md)

El simulador muestra cómo el viento, la altitud, las hélices y la batería afectan a un multicóptero. En la 0.93 el modelo de los motores es nuevo. Ahora pueden sobrecalentarse y quemarse.

## Cómo abrirlo

Descomprime el archivo y abre **Drone-Weather-Lab-0.93-Beta.html** o `Start.cmd`.

## Motores

- La potencia nominal ya no es un techo. Los límites reales son el ESC, la batería y las RPM máximas.
- Con imanes calientes la eficiencia baja y el motor se calienta más rápido.
- Por encima de 175 °C el motor puede arder y luego falla.
- Nuevo banco de pruebas: el dron queda fijo y los motores giran a las RPM ordenadas.

## Límites

Los valores térmicos son didácticos. El modelo no se ha comparado con un dron real. Las pruebas están en `docs/VERIFICATION-0.93.md`.
