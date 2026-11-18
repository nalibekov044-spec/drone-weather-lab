# Drone Weather Lab 0.9 Beta

[Русский](README.md) · [English](README.en.md)

El simulador muestra cómo el viento, la altitud, las hélices y la batería afectan a un multicóptero. En la 0.9 casi todo el espacio de trabajo es nuevo.

## Cómo abrirlo

Descomprime el archivo y abre **Drone-Weather-Lab-0.9-Beta.html**. En Windows también puedes abrir `Start.cmd`. No hace falta instalar nada ni tener internet.

Si el navegador bloquea los cálculos en un archivo local, ejecuta `python scripts/start.py`.

## Novedades

- Nuevo espacio de trabajo con cuatro temas. Ahora también en español.
- Mi dron: un cálculo aparte para tu diseño. La tabla de componentes da la masa total y el centro de gravedad.
- Baterías: arma un pack con celdas en serie (S) y en paralelo (P). Hay LiPo, Li-ion, LiHV y LiFePO4.
- Gráficos con curva de referencia, tabla y exportación a CSV.
- Cortes del flujo y CFD manual.
- Plan de misión, registro de vuelo, proyectos, escenarios de viento y ajuste de Ct/Cp con datos de banco.

La lista completa está en `docs/FEATURES-0.9.md`.

## Límites

Es un modelo para aprender. El CFD usa una malla gruesa. El modelo no se ha comparado con un dron real. El plan de misión no cuenta la energía para subir ni para acelerar.

Las pruebas están en `docs/VERIFICATION-0.9.md`.
