# Drone Weather Lab 0.91 Beta

[Русский](README.md) · [English](README.en.md)

El simulador muestra cómo el viento, la altitud, las hélices y la batería afectan a un multicóptero. La versión 0.91 permite elegir cuándo se hacen los cálculos. También mejora la batería, las hélices y el CFD, con 21 correcciones pequeñas.

## Cómo abrirlo

Descomprime el archivo y abre **Drone-Weather-Lab-0.91-Beta.html** o `Start.cmd`. No hace falta instalar nada. Si el navegador bloquea los cálculos locales, ejecuta `python scripts/start.py`.

## Modos de cálculo

Hay tres modos: pestaña visible, solo con foco y permitir segundo plano. En segundo plano el vuelo sigue sin dibujar. Aun así, el navegador puede frenar o congelar la pestaña. Al volver, el vuelo no salta hacia adelante.

## Cambios

- El pronóstico de batería usa coeficientes a mitad de cada paso.
- Se corrigieron la velocidad de punta de pala y el par de reacción.
- El plan de misión conserva la presión manual.
- El CFD usa los mismos límites físicos en todas las mallas.
- Cuatro botones de tono junto al tema. La lista de 21 cambios está en `docs/CHANGES-0.91.md`.

## Límites

El modelo no se ha comparado con un dron real. El CFD usa una malla gruesa. Las pruebas están en `docs/VERIFICATION-0.91.md`.
