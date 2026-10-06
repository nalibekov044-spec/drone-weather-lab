# Changelog

## 0.85.0-beta

Single-file offline HTML and a GitHub Windows launcher build. Both README files start with launch instructions. Pages serves an offline download.

Smagorinsky LES, torque-preserving actuator sources, force convergence, boundary mass flow balance and averaged force diagnostics. CFD disk thrust includes thermal derating. Analytical shear-wave and actuator balance checks are in verification-v085.json.

Detailed motor housings, camera mounts, arm lights, smooth part normals and cached twisted propeller geometry. Blade phase is integrated and preserved when RPM reaches zero.

The numerical grid remains coarse and its base viscosity remains elevated. No experimental drone validation, grid independence or tested Windows executable is claimed.

## 0.8.0

Russian and English interface, including help, warnings, chart labels and diagnostics. Language is saved separately from the unit system.

WebGL model, lit materials, solid animated blades, depth testing and cached geometry. GPU airflow rendering and particles. Canvas fallback retained. Shared built-in body, battery, camera, arms, motors and landing gear geometry. Full imported meshes in WebGL. Default streamline count increased to 360.

Non-equilibrium velocity inlet and density outlet extrapolation. Momentum-exchange force on all solids, mean density deviation and CFD solid-mask overlay. Smaller worker chunks and collision restricted to non-solid cells. Force vectors in Flight and equal-weather A/B comparison.

English and Russian README files, local launch script and Windows launcher. Numerical report for a two-grid sphere case at matched viscosity. Regression and integration checks updated. No experimental drone validation or grid independence claimed.

# История изменений

## 0.7.0 · 2026-09-30

Метрические и имперские единицы для настроек, результатов, графиков и зонда. Переключение не меняет исходные параметры, выбор сохраняется на устройстве.

Точный ввод рядом с каждым ползунком, дроби с точкой или запятой, явная проверка диапазона. Горячие клавиши для паузы, ремонта, перезапуска полёта и переключения видов, без перехвата ввода.

Плотные движущиеся маркеры ветра в полёте, короткий затухающий след, менее яркие диски и огонь. Размеры геометрии сохранены. Обновлены контраст, поля ввода, компоновка и карточки моторов.

Тепловая инерция, накопленная перегрузка, обратимое снижение мощности и необратимый износ. Отложенный учебный эффект возгорания, охлаждение отключённых двигателей. На экране нагрузка выше 500% сокращена, расчётные значения сохранены.

CFD, тяга, батарея, CAD и конструктор сохранены без изменений. Добавлены численные и UI-проверки 0.7. Достоверность CFD и пожарного сценария не подтверждена экспериментом.

## 0.6.0 · 2026-09-18

- Параметрический конструктор: длина, ширина, высота, форма корпуса, лучи, моторы, X/+ и растяжение рамы.
- Общая геометрия для сцены, CFD-маски, центров дисков и физических плеч тяги. Предупреждение о пересечении винтов.
- STL в миллиметрах для CAD, сохранение и проверяемая загрузка JSON-настроек.
- TRT D3Q19 с чётной/нечётной схемой Guo; BGK оставлен для сравнения.
- Продолжение с последнего состояния, три бюджета итераций, график невязки и диагностика сжимаемости.
- Измерительный зонд: локальные скорость, давление и завихрение.
- До 600 линий, RK4 и входные точки с учётом вертикального и обратного ветра. Плавные следы и скорость просмотра.
- Предвычисленный перенос, отмена устаревших расчётов, пауза Worker в скрытой вкладке, устранение перезапусков CFD от каждого порыва.
- Пакетная отрисовка линий, кеширование и однопроходная интерполяция полей.
- Численные и UI-регрессионные тесты. Пределы достоверности остаются явно описаны; это не валидированный высоко-Re CFD.

## 0.5.0 — 2026-09-12

- Импорт STL / OBJ, проверка замкнутости, масштаб / ориентация и CFD по сетке корпуса.
- Кубическая сетка, нормированный источник тяги дисков, схема Guo и невязка.
- До 360 линий, интегрирование в Web Worker, плавные частицы.
- Кеширование сцены и маска глубины для линий за корпусом.
- Фиксированный шаг динамики, редкие обновления интерфейса, экономный / авто режим.
- Плавные переходы ветра и погодные сценарии.
- Измеренные Cₜ/Cₚ, просадка / токоотдача батареи, Мах концов лопастей.
- Пояснения, инженерные показатели и JSON-отчёт.
- Исправлен масштаб дисков; стандартная рама 560 мм исключает перекрытие винтов.
- Воспроизводимые проверки физических зависимостей и CAD-импорта.

## 0.4.0 — 2026-09-09

- добавлен трёхмерный CFD-решатель D3Q19 Lattice Boltzmann;
- исправлено обтекание твёрдой геометрии и добавлены открытые выходные границы потока;
- добавлены поля скорости, давления и завихрения;
- добавлены индивидуальная нагрузка, температура, тепловая деградация, отказ и возгорание моторов;
- повреждение двигателя теперь уменьшает доступные RPM и тягу;
- добавлены дождь, визуальное обледенение и дополнительные CFD-объекты;
- расширены графики и диагностические показатели.
- подготовлена автоматическая публикация каталога `dist` через GitHub Pages.
