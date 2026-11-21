// 0.94: texts of the validation tab, the temperature panel and the overload tests. English → [Russian, Spanish].
export const v094LabText = {
  's': ['с', 's'],
  'Validation': ['Проверка', 'Validación'],
  'Does the model match measurements?': ['Совпадает ли модель с измерениями?', '¿Coincide el modelo con las mediciones?'],
  'Published bench tables and your own measurements, compared with the model at the same speeds. A model is only as good as its check against real data.': [
    'Опубликованные стендовые таблицы и твои измерения сравниваются с моделью на тех же оборотах. Модель стоит столько, сколько её проверка на реальных данных.',
    'Tablas de banco publicadas y tus propias mediciones, comparadas con el modelo a las mismas revoluciones. Un modelo vale lo que su comprobación con datos reales.'
  ],
  'Published bench data': ['Опубликованные стендовые данные', 'Datos de banco publicados'],
  'Data set': ['Набор данных', 'Conjunto de datos'],
  'Thrust: measured and model': ['Тяга: замер и модель', 'Empuje: medición y modelo'],
  'Electrical power: measured and model': ['Электрическая мощность: замер и модель', 'Potencia eléctrica: medición y modelo'],
  'g': ['г', 'g'],
  'N': ['Н', 'N'],
  'thrust, model': ['тяга, модель', 'empuje, modelo'],
  'thrust, measured': ['тяга, замер', 'empuje, medido'],
  'power, model': ['мощность, модель', 'potencia, modelo'],
  'power, measured': ['мощность, замер', 'potencia, medida'],
  'The tests do not state the air density, so 20 °C at sea level is assumed. Power is the electrical input from the supply, so the ESC is included. The model uses its default propeller fit; the three-blade propeller is outside that fit, which the large error shows. Use your own data and the fit below for such propellers.': [
    'Плотность воздуха в тестах не указана, поэтому взяты 20 °C на уровне моря. Мощность здесь электрическая, от источника питания, поэтому ESC в неё входит. Модель использует свою обычную подгонку винтов. Трёхлопастный винт в неё не входит, и большая ошибка это показывает. Для таких винтов загрузи свои данные и подбери коэффициенты ниже.',
    'Las pruebas no indican la densidad del aire, así que se asume 20 °C al nivel del mar. La potencia es la entrada eléctrica de la fuente, por lo que incluye el ESC. El modelo usa su ajuste de hélices por defecto; la hélice tripala queda fuera de ese ajuste, como muestra el gran error. Para esas hélices usa tus datos y el ajuste de abajo.'
  ],
  'Your measurements · CSV': ['Твои измерения · CSV', 'Tus mediciones · CSV'],
  'Bench table: RPM and thrust, plus voltage and current or electrical power. Flight log: time, voltage and current (Betaflight and ArduPilot exports work). Separator: comma, semicolon or tab.': [
    'Стендовая таблица: обороты и тяга, а также напряжение и ток или электрическая мощность. Журнал полёта: время, напряжение и ток (подходят выгрузки Betaflight и ArduPilot). Разделитель: запятая, точка с запятой или табуляция.',
    'Tabla de banco: RPM y empuje, más tensión y corriente o potencia eléctrica. Registro de vuelo: tiempo, tensión y corriente (sirven las exportaciones de Betaflight y ArduPilot). Separador: coma, punto y coma o tabulador.'
  ],
  'Open CSV': ['Открыть CSV', 'Abrir CSV'],
  'Measurements · CSV': ['Измерения · CSV', 'Mediciones · CSV'],
  'Your measurements and the model': ['Твои измерения и модель', 'Tus mediciones y el modelo'],
  'The check uses the propeller, motor and air of the current settings. Set the temperature and altitude of your test first. A flight log is compared with the hover power of the current drone and weather.': [
    'Проверка берёт винт, мотор и воздух из текущих настроек. Сначала поставь температуру и высоту своего теста. Журнал полёта сравнивается с мощностью висения текущего дрона в текущей погоде.',
    'La comprobación usa la hélice, el motor y el aire de la configuración actual. Ajusta primero la temperatura y la altitud de tu prueba. Un registro de vuelo se compara con la potencia en estacionario del dron y el tiempo actuales.'
  ],
  'Motor efficiency along the propeller curve': ['КПД мотора вдоль кривой винта', 'Rendimiento del motor a lo largo de la curva de la hélice'],
  'Motor efficiency and current versus RPM': ['КПД и ток мотора по оборотам', 'Rendimiento y corriente del motor según RPM'],
  'efficiency, %': ['КПД, %', 'rendimiento, %'],
  'current, A': ['ток, А', 'corriente, A'],
  'hover': ['висение', 'estacionario'],
  'Datasheet model: current = torque / Kt + I0, voltage = speed / Kv + current × R. Losses are copper I²R plus iron I0 × back EMF. Efficiency is low at small loads, where the idle loss dominates, and falls again at high current, where copper losses grow with the square of the current.': [
    'Модель по даташиту: ток = момент / Kt + I0, напряжение = обороты / Kv + ток × R. Потери складываются из меди I²R и железа I0 × ЭДС. На малой нагрузке КПД низкий, там главные потери холостого хода. На большом токе он снова падает, потому что потери в меди растут как квадрат тока.',
    'Modelo de hoja de datos: corriente = par / Kt + I0, tensión = velocidad / Kv + corriente × R. Las pérdidas son cobre I²R más hierro I0 × fuerza contraelectromotriz. El rendimiento es bajo con poca carga, donde domina la pérdida en vacío, y vuelve a caer con mucha corriente, donde las pérdidas de cobre crecen con el cuadrado de la corriente.'
  ],
  'Thrust': ['Тяга', 'Empuje'],
  'mean error': ['средняя ошибка', 'error medio'],
  'Electrical power': ['Электрическая мощность', 'Potencia eléctrica'],
  'datasheet motor model': ['модель мотора по даташиту', 'modelo de motor de hoja de datos'],
  'simple motor model, 80% efficiency': ['простая модель мотора, КПД 80%', 'modelo de motor simple, rendimiento 80%'],
  'thrust': ['тяга', 'empuje'],
  'power': ['мощность', 'potencia'],
  'Source': ['Источник', 'Fuente'],
  'blades': ['лопасти', 'palas'],
  'Throttle': ['Газ', 'Acelerador'],
  'Thrust · g': ['Тяга · г', 'Empuje · g'],
  'Model · g': ['Модель · г', 'Modelo · g'],
  'Thrust · N': ['Тяга · Н', 'Empuje · N'],
  'Model · N': ['Модель · Н', 'Modelo · N'],
  'Error': ['Ошибка', 'Error'],
  'Power · W': ['Мощность · Вт', 'Potencia · W'],
  'Model · W': ['Модель · Вт', 'Modelo · W'],
  'Bench table': ['Стендовая таблица', 'Tabla de banco'],
  'rows': ['строк', 'filas'],
  'Flight log': ['Журнал полёта', 'Registro de vuelo'],
  'average power': ['средняя мощность', 'potencia media'],
  'model hover': ['модель, висение', 'modelo, estacionario'],
  'A flight log includes climbs, turns and wind, so it is usually above the hover power. A log of a calm hover is the fairest check.': [
    'В журнале полёта есть подъёмы, повороты и ветер, поэтому средняя мощность обычно выше мощности висения. Честнее всего сравнивать журнал спокойного висения.',
    'Un registro de vuelo incluye subidas, giros y viento, así que suele quedar por encima de la potencia en estacionario. Lo más justo es comparar un estacionario en calma.'
  ],
  'figure of merit': ['коэффициент качества FM', 'figura de mérito'],
  'shaft power estimated from the electrical power and the motor model': ['мощность на валу оценена по электрической мощности и модели мотора', 'potencia en el eje estimada a partir de la potencia eléctrica y el modelo del motor'],
  'Cp needs power in the table': ['для Cp в таблице нужна мощность', 'para Cp la tabla necesita potencia'],
  'Peak efficiency': ['Наибольший КПД', 'Rendimiento máximo'],
  'losses': ['потери', 'pérdidas'],
  'per motor': ['на мотор', 'por motor'],
  'top speed at this voltage': ['предел оборотов при этом напряжении', 'velocidad máxima con esta tensión'],
  'minus the winding drop': ['минус падение на обмотке', 'menos la caída en el devanado'],
  'The simple model keeps the efficiency fixed. Choose the datasheet motor model in Motors and RPM to see how it changes with load.': [
    'В простой модели КПД постоянный. Выбери модель мотора по даташиту в разделе «Двигатели и RPM», чтобы увидеть, как он меняется с нагрузкой.',
    'En el modelo simple el rendimiento es fijo. Elige el modelo de motor de hoja de datos en Motores y RPM para ver cómo cambia con la carga.'
  ],
  'TEMPERATURES': ['ТЕМПЕРАТУРЫ', 'TEMPERATURAS'],
  'What overheats first': ['Что перегреется первым', 'Qué se sobrecalienta primero'],
  'Temperatures of motors, ESC and battery': ['Температуры моторов, ESC и батареи', 'Temperaturas de motores, ESC y batería'],
  'hottest motor': ['самый горячий мотор', 'motor más caliente'],
  'hottest ESC': ['самый горячий ESC', 'ESC más caliente'],
  'battery': ['батарея', 'batería'],
  'Battery': ['Батарея', 'Batería'],
  'OVERLOAD TESTS': ['ОПЫТЫ С ПЕРЕГРУЗКОЙ', 'PRUEBAS DE SOBRECARGA'],
  'MOTOR FAILURE IN FLIGHT': ['ОТКАЗ МОТОРА В ПОЛЁТЕ', 'FALLO DE MOTOR EN VUELO'],
  'RECORD': ['ЗАПИСЬ', 'REGISTRO'],
  'Export temperatures · CSV': ['Температуры в CSV', 'Exportar temperaturas · CSV'],
  'Back to the default drone': ['Вернуть обычный дрон', 'Volver al dron por defecto'],
  'Battery at 75 °C: power cut': ['Батарея 75 °C: питание отключено', 'Batería a 75 °C: alimentación cortada'],
  'fire': ['огонь', 'fuego'],
  'failed after overheating': ['отказ после перегрева', 'fallo tras sobrecalentamiento'],
  'No part reaches its limit at this load': ['При этой нагрузке ничто не доходит до предела', 'Con esta carga ninguna pieza llega a su límite'],
  'First': ['Первым', 'Primero'],
  'in': ['через', 'en'],
  'motor fire 175 °C': ['огонь мотора 175 °C', 'fuego del motor 175 °C'],
  'battery cut 75 °C': ['отключение батареи 75 °C', 'corte de batería 75 °C'],
  'Waiting for the flight': ['Ждём полёта', 'Esperando el vuelo'],
  'Check': ['Проверить', 'Comprobar'],
  'Bench template': ['Шаблон стенда', 'Plantilla de banco'],
  'Log template': ['Шаблон журнала', 'Plantilla de registro'],
  'Fit Ct and Cp': ['Подобрать Ct и Cp', 'Ajustar Ct y Cp'],
  'Apply to my drone': ['Применить к моему дрону', 'Aplicar a mi dron'],
  'The file is empty.': ['Файл пустой.', 'El archivo está vacío.'],
  'Columns not found: a bench table needs RPM and thrust, a log needs time, voltage and current.': [
    'Не найдены столбцы: стендовой таблице нужны обороты и тяга, журналу нужны время, напряжение и ток.',
    'No se encontraron columnas: una tabla de banco necesita RPM y empuje, un registro necesita tiempo, tensión y corriente.'
  ],
  'Too few rows with numbers.': ['Слишком мало строк с числами.', 'Muy pocas filas con números.'],
  'The log has no samples with current above 0.5 A.': ['В журнале нет точек с током больше 0,5 А.', 'El registro no tiene muestras con más de 0,5 A.'],
  'The time column does not grow.': ['Время в журнале не растёт.', 'La columna de tiempo no aumenta.'],
  'smoke at 145 °C': ['дым при 145 °C', 'humo a 145 °C'],
  'fire at 175 °C': ['огонь при 175 °C', 'fuego a 175 °C'],
  'power limit at 95 °C': ['ограничение мощности при 95 °C', 'límite de potencia a 95 °C'],
  'cut at 135 °C': ['отключение при 135 °C', 'corte a 135 °C'],
  'power cut at 75 °C': ['отключение питания при 75 °C', 'corte de alimentación a 75 °C'],
  'A quadcopter with three motors can balance roll and pitch only by nearly stopping the opposite motor, so it loses the torque balance and spins. Restore the motors with F.': [
    'Квадрокоптер на трёх моторах может удержать крен и тангаж, только почти остановив противоположный мотор. Баланс моментов теряется, и дрон начинает вращаться. Моторы восстанавливаются клавишей F.',
    'Un cuadricóptero con tres motores solo equilibra alabeo y cabeceo casi parando el motor opuesto, así que pierde el equilibrio de par y gira. Restaura los motores con F.'
  ],
  'With six or eight motors the controller shares the lost thrust among the others and keeps the heading. The working motors carry more and heat more. Restore them with F.': [
    'С шестью или восемью моторами контроллер делит потерянную тягу между остальными и держит курс. Рабочие моторы несут больше и греются сильнее. Моторы восстанавливаются клавишей F.',
    'Con seis u ocho motores el controlador reparte el empuje perdido entre los demás y mantiene el rumbo. Los motores que funcionan cargan más y se calientan más. Restáuralos con F.'
  ],
  'Too big a propeller': ['Слишком большой винт', 'Hélice demasiado grande'],
  '8S battery on a 6S motor': ['Батарея 8S на моторе для 6S', 'Batería 8S en un motor de 6S'],
  'Weak motors and a heavy payload': ['Слабые моторы и тяжёлый груз', 'Motores débiles y carga pesada'],
  'An 18 × 6.1 propeller on the 15-inch motor: the motor tries to turn it at full voltage, the current and the copper losses grow, and the hot winding resists even more.': [
    'Винт 18 × 6,1 на моторе для 15 дюймов. Мотор пытается крутить его на полном напряжении, ток и потери в меди растут, а горячая обмотка сопротивляется ещё сильнее.',
    'Una hélice de 18 × 6,1 en el motor de 15 pulgadas: el motor intenta girarla a plena tensión, la corriente y las pérdidas de cobre crecen y el devanado caliente resiste todavía más.'
  ],
  'The same 15-inch propeller with a third more voltage: the motor spins faster, propeller power grows with the cube of speed and the losses follow.': [
    'Тот же винт на 15 дюймов, но напряжение на треть больше. Мотор крутится быстрее, мощность винта растёт как куб оборотов, а за ней растут и потери.',
    'La misma hélice de 15 pulgadas con un tercio más de tensión: el motor gira más rápido, la potencia de la hélice crece con el cubo de la velocidad y las pérdidas la siguen.'
  ],
  'In flight the motors give only the hover thrust, but with 3.5 kg of payload that is twice the rating of 90 W motors.': [
    'В полёте моторы дают только тягу висения. Но с грузом 3,5 кг это вдвое больше номинала моторов на 90 Вт.',
    'En vuelo los motores solo dan el empuje de estacionario, pero con 3,5 kg de carga eso es el doble de la potencia nominal de motores de 90 W.'
  ],
  'File is too large': ['Файл слишком большой', 'El archivo es demasiado grande'],
  'Overload test started': ['Опыт с перегрузкой запущен', 'Prueba de sobrecarga iniciada'],
  'No samples yet': ['Записей пока нет', 'Aún no hay muestras']
};
