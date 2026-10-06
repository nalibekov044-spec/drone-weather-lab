import { additionalTranslations } from "./i18n-extra.js";
const pairs = `
Единицы|Units
Метрические|Metric
Имперские|Imperial
Клавиши|Shortcuts
Пауза|Pause
Продолжить|Resume
Сбросить|Reset all
Отчёт ↓|Export report
Пробел|Space
Восстановить моторы|Restore motors
Начать полёт заново|Restart flight
Графики|Charts
Обтекание|Airflow
Полёт|Flight
Клавиши не срабатывают во время ввода. R сохраняет настройки и состояние моторов. Кнопка «Сбросить» возвращает исходные настройки.|Shortcuts are disabled while typing. R keeps your settings and motor condition. Reset all restores the defaults.
Запас тяги|Thrust reserve
Наклон|Tilt
для удержания точки|to hold position
Время полёта|Flight time
Ток батареи|Battery current
Предел ветра|Wind limit
при выбранных RPM|at selected RPM
ПОЛЁТ В ВЕТРЕ|FLIGHT IN WIND
Положение и реакция контроллера|Position hold and controller response
Мышью вращай сцену, колесом меняй масштаб. Штрихи показывают направление ветра, не CFD.|Drag to orbit, scroll to zoom. Streaks show ambient wind direction. See Airflow for the calculated field.
Стабильно|Stable
Ваш браузер не поддерживает Canvas.|Canvas is unavailable on this device.
Смещение|Displacement
Плотность линий|Line count
Плотность|Density
Пиковый ветер|Peak wind
Баланс|Balance
Моторы|Motors
График функции|Parameter sweep
Меняем|Vary
Скорость ветра|Wind speed
Обороты винтов|Propeller RPM
Масса дрона|Drone mass
Полезная нагрузка|Payload
Диаметр винта|Propeller diameter
Мощность мотора|Motor power
Высота|Altitude
Температура|Temperature
Интенсивность дождя|Rainfall
Смотрим|Measure
Мощность|Power
Загрузка моторов|Motor load
Доступный RPM|Available RPM
Доступная тяга|Available thrust
Сила ветра|Wind force
Тяга / вес|Thrust / weight
Нагрузка на диск|Disk loading
Мах конца лопасти|Blade tip Mach
Число Маха конца лопасти|Blade tip Mach number
Напряжение под нагрузкой|Loaded voltage
От|From
До|To
Численное поле потока вокруг дрона|Calculated flow around the drone
Тяни мышью: вращение · колесо: масштаб|Drag to orbit · scroll to zoom
Начало линий|Seed plane
Объёмное распределение|3D volume
Горизонтальная плоскость|Horizontal plane
Вертикальная плоскость|Vertical plane
Линии|Lines
Масштаб|Zoom
Скорость потока|Flow speed
ожидание|waiting
Сетка|Grid
скорость|speed
Решатель|Solver
TRT · две релаксации|TRT · two relaxation times
BGK · более вязкий|BGK · higher viscosity
Расчёт|Calculation
Эскиз|Quick
Стандарт|Standard
Длинный|Extended
Скорость частиц|Particle speed
Реальное время|Real time
Считать дальше|Continue calculation
Сходимость и диагностика CFD|CFD convergence and diagnostics
Расчёт в фоне. Частицы движутся в поле среднего ветра, а не имитируют CFD каждого порыва.|Calculation runs in the background. Particles follow the mean flow. Gusts are simulated in Flight.
Измерительный зонд в потоке|Flow probe
Перемещай точку в расчётном объёме. X и Z горизонтальные, Y вверх. Координаты относительно центра дрона, единицы указаны рядом с числом.|Move the probe within the domain. X and Z are horizontal; Y points up. Coordinates are relative to the drone centre, in the units shown next to each value.
Дождись расчёта текущей конфигурации|Wait for the current configuration to finish
Дождись расчёта|Waiting for calculation
Дрон и геометрия|Drone and geometry
Тип дрона|Drone type
Камерный квадрокоптер|Camera quadcopter
Свой дрон · конструктор|Custom drone · builder
Гоночный FPV|Racing FPV
Промышленный гексакоптер|Industrial hexacopter
Грузовой октокоптер|Cargo octocopter
Одна геометрия для 3D и CFD. Массу, лобовую площадь и характеристики моторов укажи отдельно ниже.|One geometry is used for the 3D model and CFD. Set mass, frontal area and motor specifications separately below.
Длина корпуса|Body length
Ширина корпуса|Body width
Высота корпуса|Body height
Центр → мотор|Centre to motor
Толщина луча|Arm thickness
Растяжение вдоль корпуса|Frame stretch
Диаметр мотора|Motor diameter
Высота мотора|Motor height
Форма корпуса|Body shape
Эллипсоид|Ellipsoid
Прямоугольный|Box
Схема лучей|Arm layout
X · повёрнутая|X layout
+ · осевая|+ layout
Экспорт геометрии STL ↓|Export STL geometry
STL в миллиметрах, Y вверх, без лопастей. Детали пересекаются: перед производством объедини их в CAD. Это эскиз, не готовая конструкция.|STL uses millimetres and Y up, without blades. Parts overlap. Join and inspect them in CAD before manufacturing. This is a concept model.
Сохранить настройки ↓|Save settings
Загрузить настройки|Load settings
Масса корпуса|Body mass
Диагональ рамы|Frame span
Количество винтов|Rotor count
Шаг винта|Propeller pitch
Лобовая площадь|Frontal area
Коэф. сопротивления|Drag coefficient
Состояние винтов|Propeller condition
Коэффициенты винтов по измерениям|Use measured propeller coefficients
Cₜ: тяга|Cₜ: thrust
Cₚ: мощность|Cₚ: power
Двигатели и RPM|Motors and RPM
Команда / доступные обороты|Commanded / available RPM
Предел двигателя|Motor RPM limit
КПД мотор + ESC|Motor and ESC efficiency
Настраивать RPM каждого двигателя отдельно|Set each motor RPM separately
Как моторы теряют мощность?|How do motors lose power?
Нагрев накапливается и уходит постепенно. После 95 °C доступная мощность снижается и возвращается при охлаждении. Долгая перегрузка и высокая температура расходуют ресурс, который сам не восстанавливается. Дым и огонь появляются только после накопленного тяжёлого перегрева. Это учебная модель без паспортных тепловых данных, а не прогноз пожара.|Heat builds up and dissipates gradually. Above 95 °C, available power decreases and returns after cooling. Sustained overload at high temperature causes permanent damage. Smoke and fire require accumulated severe overheating. The thermal model is illustrative and does not predict a real fire.
Погода и атмосфера|Weather and atmosphere
Средний ветер|Mean wind
Плавность изменения ветра|Wind transition time
Штиль|Calm
Порывы|Gusts
Дождь|Rain
Направление|Direction
Амплитуда порывов|Gust amplitude
Частота порывов|Gust frequency
Турбулентность|Turbulence
Вертикальный поток|Vertical wind
Влажность|Humidity
Давление|Pressure
По высоте|From altitude
Задать вручную|Set manually
Обледенение|Icing
Нет|None
Слабое|Trace
Умеренное|Moderate
Батарея|Battery
Напряжение|Voltage
Ёмкость|Capacity
Заряд|Charge
Температура батареи|Battery temperature
Сопротивление пакета|Pack resistance
Токоотдача|Discharge rating
Баланс и управление|Balance and control
Смещение груза X|Payload offset X
Смещение груза Y|Payload offset Y
Время реакции контроллера|Controller response time
Предел наклона|Tilt limit
CFD и визуализация|CFD and display
Качество сетки|Grid quality
Быстрое · 13 тыс.|Fast · 13k cells
Среднее · 31 тыс.|Balanced · 31k cells
Детальнее · 61 тыс.|Fine · 61k cells
Производительность|Rendering
Авто · 30–60 FPS|Auto · 30 to 60 FPS
Экономный · 30 FPS|Eco · 30 FPS
Полное · 60 FPS|High · 60 FPS
Окраска потока|Flow colour
Скорость|Speed
Завихрение|Vorticity
Дополнительный объект|Additional object
Сфера справа|Sphere on the right
Вертикальная стенка|Vertical wall
Груз под корпусом|Payload below body
Размер объекта|Object size
Своя 3D-модель / CAD|Import 3D model / CAD
STL или OBJ · до 16 МБ / 40 тыс. треугольников|STL or OBJ · up to 16 MB / 40k triangles
Файл остаётся на твоём устройстве. Экспортируй из CAD корпус и раму без винтов: они моделируются отдельно.|Your file stays on your device. Export the body and frame without propellers, which are modelled separately.
Наибольший размер|Maximum dimension
Вертикальная ось файла|File up axis
Z · обычно CAD|Z · common in CAD
Поворот модели|Model rotation
Использовать сетку корпуса в CFD|Use imported body mesh in CFD
Вернуться к встроенному дрону|Restore built-in drone
Как перенести модель из CAD?|How do I import from CAD?
В Fusion, SolidWorks, FreeCAD или Blender экспортируй STL / OBJ. STEP и IGES напрямую не читаются. Укажи реальный размер и ось вверх. Для CFD нужна замкнутая сетка без дыр; очень тонкие детали могут исчезнуть на грубой сетке. Центры винтов пока задаёт выбранная типовая рама; масса, C𝒹 и характеристики моторов задаются вручную.|Export STL or OBJ from Fusion, SolidWorks, FreeCAD or Blender. STEP and IGES are not supported directly. Set the real size and up axis. CFD needs a closed mesh without holes. Thin details may disappear on a coarse grid. Rotor centres follow the selected frame; mass, drag coefficient and motor specifications are entered manually.
Точность и ограничения модели|Accuracy and limitations
Основы модели|Model references
теория диска винта: NASA|Actuator disk theory: NASA
сила сопротивления: NASA|Drag equation: NASA
Инженерные показатели|Engineering values
Что это значит?|What does this mean?
Невязка|Residual
Размер ячейки|Cell size
Re решателя|Solver Reynolds number
Сила дисков|Actuator force
Итерации|Iterations
установился|converged
приближение|estimate
достигнута|reached
не достигнута, поле ещё меняется|not reached; the field is still changing
ошибка расчёта|calculation error
Расчёт не завершён.|Calculation did not finish.
Внутри твёрдого тела или за границей области|Inside a solid or outside the domain
Относительное изменение скорости за 20 итераций. Цель < 0,1%;|Relative velocity change over 20 iterations. Target < 0.1%;
Детали меньше двух или трёх ячеек не разрешаются надёжно.|Details smaller than two or three cells are not resolved reliably.
С повышенной численной вязкостью. Не равен физическому Re|Uses higher numerical viscosity. Different from the physical Re
Интеграл источника импульса в воздухе, связан с вертикальной тягой.|Integrated momentum source in the air, corresponding to vertical thrust.
Остаточная сжимаемость / дискретизация вдали от стенок; в идеале ноль.|Compressibility and discretisation error away from walls; ideally zero.
Численное время установления, не время полёта.|Simulated settling time, not flight time.
Число Маха сетки|Lattice Mach number
отклонение плотности до|maximum density deviation
Высокая сжимаемость: результат требует осторожности.|High compressibility: interpret this field cautiously.
Корпус плохо разрешён: увеличь сетку или размер модели.|Body is poorly resolved: increase grid quality or model size.
Лучи тоньше двух ячеек: их обтекание не разрешено.|Arms are thinner than two cells: their flow is unresolved.
Сеточная сходимость и сравнение с экспериментом не выполнены. CFD использует средний ветер; ресурс моторов округлён до 10%. Давление относительно входа.|Grid independence and experimental validation have not been established. CFD uses mean wind and motor health rounded to 10%. Pressure is relative to the reference density.
Невязка · логарифмическая шкала · цель 0,1%|Residual · logarithmic scale · target 0.1%
итераций|iterations
Мышь: вращение · Колесо: масштаб|Drag to orbit · scroll to zoom
Габарит рамы по осям|Frame span
объём корпуса|body volume
зазор винтов|propeller clearance
ВНИМАНИЕ: винты пересекаются. Увеличь лучи или уменьши диаметр.|WARNING: propellers overlap. Extend the arms or reduce diameter.
Возгорание мотора / ESC|Motor / ESC fire
Моторы повреждены|Motors damaged
Недостаточно тяги|Insufficient thrust
Превышен наклон|Tilt limit exceeded
Перегрузка моторов|Motor overload
Потеря удержания|Position hold lost
Нестабильно|Unstable
Восстановлен|Restored
Отказ|Failed
Горит|On fire
Повреждён|Damaged
Перегрев|Overheated
Нагрев|Heating
Исправен|Healthy
Ресурс|Health
нагрузка|load
Тепловой лимит|Thermal limit
команда|command
полёт|flight
Точное значение|Exact value
Укажи|Enter
целое|integer
число от|a number from
до|to
Последнее верное значение сохранено.|The last valid value is preserved.
Обороты двигателя|Motor RPM
Обороты от 0 до 28000.|RPM must be between 0 and 28000.
Температура · ресурс · нагрузка|Temperature · health · load
Укажи размер от 20 до 2000 мм.|Set a dimension between 20 and 2000 mm.
Не удалось прочитать модель. Попробуй облегчённый STL / OBJ.|Could not read the model. Try a smaller STL or OBJ.
Не удалось открыть файл модели.|Could not open the model file.
Встроенная модель. Загрузи STL / OBJ из CAD, чтобы заменить корпус.|Built-in model. Import STL or OBJ from CAD to replace the body.
Нет допустимых значений|No valid values
Web Worker недоступен|Web Worker unavailable
CFD потерял устойчивость. Выбери BGK, снизь тягу / ветер или увеличь винты.|CFD became unstable. Try BGK, reduce thrust or wind, or increase propeller diameter.
Скорость вышла за предел устойчивости LBM. Уменьши нагрузку или выбери BGK.|LBM velocity exceeded the stability limit. Reduce loading or try BGK.
CFD потерял устойчивость на последнем шаге. Выбери BGK или снизь нагрузку.|CFD became unstable on the final step. Try BGK or reduce loading.
Сравнение|Compare
Сохранить A|Capture A
Сохранить B|Capture B
Сбросить сравнение|Clear comparison
Сохрани A, измени дрон и сохрани B. Погода для обоих вариантов берётся из A. Моторы считаются исправными.|Capture A, adjust the drone and capture B. Both use A's weather and healthy motors.
Сначала сохрани A|Capture A first
Векторы сил|Force vectors
Расчётная геометрия|CFD geometry
Вес|Weight
Тяга|Thrust
Сила на всех твёрдых телах|Force on all solids
По обмену импульсом. Мгновенный результат решателя, без связи с полётом.|From momentum exchange. Instantaneous solver result, not used by Flight.
Средняя плотность|Mean density
Отклонение средней плотности от входной.|Mean density deviation from the inlet reference.
Язык|Language
давление|pressure
завихрение|vorticity
предельные|limited
предел|limit
ячеек|cells
линий|lines
мс|ms
мин|min
об/мин|RPM
мА·ч|mAh
мОм|mΩ
мм/ч|mm/h
кг/м³|kg/m³
м/с|m/s
Н/м²|N/m²
см|cm
мм|mm
кг|kg
гПа|hPa
Па|Pa
Гц|Hz
Вт|W
Н|N
В|V
м²|m²
л|L
м|m
с⁻¹|s⁻¹
с|s
`;
export const dictionary = { ...Object.fromEntries(pairs.trim().split('\n').map(line => line.split('|'))), ...additionalTranslations };
let language = 'ru';
try { language = localStorage.getItem('drone-lab-language') || (typeof navigator !== 'undefined' && !navigator.language.startsWith('ru') ? 'en' : 'ru'); } catch {}
const cache = new Map();
let matcher;
export function rebuildDictionary() {
  const keys = Object.keys(dictionary).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  matcher = new RegExp('(?<![А-Яа-яЁё])(?:' + keys.join('|') + ')(?![А-Яа-яЁё])', 'gu');
  cache.clear();
}
rebuildDictionary();
export function getLanguage() { return language; }
export function t(value) {
  const text = String(value);
  if (language !== 'en') return text.replaceAll('\u2014', ':');
  if (!/[А-Яа-яЁё]/.test(text)) return text.replaceAll('\u2014', ':');
  if (cache.has(text)) return cache.get(text);
  const out = (dictionary[text] || text.replace(matcher, match => dictionary[match])).replaceAll('\u2014', ':');
  if (cache.size > 1500) cache.clear();
  cache.set(text, out); return out;
}
const originals = new WeakMap(), attributes = new WeakMap();
let observer;
function translateNode(node) {
  if (node.nodeType === 3) {
    const old = originals.get(node), source = old && node.nodeValue === old.output ? old.source : node.nodeValue;
    const output = t(source);
    originals.set(node, { source, output });
    if (output !== node.nodeValue) node.nodeValue = output;
  } else if (node.nodeType === 1) {
    if (/^(SCRIPT|STYLE)$/.test(node.tagName)) return;
    const saved = attributes.get(node) || {};
    for (const name of ['title', 'aria-label', 'placeholder']) {
      const value = node.getAttribute(name); if (value === null) continue;
      const old = saved[name], source = old && old.output === value ? old.source : value;
      const output = t(source); saved[name] = { source, output };
      if (output !== value) node.setAttribute(name, output);
    }
    attributes.set(node, saved);
    for (const child of node.childNodes) translateNode(child);
  }
}
function connect() { observer?.observe(document.body, { childList: true, characterData: true, subtree: true }); }
export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'ru'; cache.clear();
  try { localStorage.setItem('drone-lab-language', language); } catch {}
  if (typeof document === 'undefined' || !document.body) return;
  observer?.disconnect(); document.documentElement.lang = language;
  const description = document.querySelector?.('meta[name="description"]');
  if (description) description.content = t("Интерактивная модель влияния погоды, массы, винтов и двигателей на мультикоптер.");
  translateNode(document.body); connect();
  document.dispatchEvent(new Event('languagechange'));
}
export function installLanguage() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  observer = new MutationObserver(records => {
    observer.disconnect();
    const roots = new Set();
    for (const r of records) if (r.type === 'characterData') roots.add(r.target); else for (const node of r.addedNodes) roots.add(node);
    for (const root of roots) translateNode(root);
    connect();
  });
  setLanguage(language);
}
