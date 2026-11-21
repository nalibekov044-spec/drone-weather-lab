// 0.94: model check against measurements, live temperatures with a forecast, overload demonstrations
// and motor failure in flight. Installed by the workbench, which supplies its helpers and the app API.
import {
  benchReferences
} from './reference-data.js';
import {
  parseMeasurementCSV,
  compareBench,
  fitPropeller,
  compareFlightLog
} from './validation.js';
import {
  thermalForecast,
  overloadScenarios,
  THERMAL_LIMITS
} from './thermal-lab.js';
import {
  efficiencyCurve,
  motorSpec,
  motorPoint,
  ESC_MODULATION
} from './motor-model.js';
import {
  calculate,
  baseDefaults
} from './physics.js';
import {
  drawLineChart
} from './lab-chart.js';
import {
  labText
} from './workbench-language.js';
import {
  v094LabText
} from './lab-094-language.js';

for (const [key, value] of Object.entries(v094LabText))
  if (!(key in labText)) labText[key] = value;

const $ = id => document.getElementById(id);
const G = 9.80665;

// Air of the manufacturer tests is not stated: 20 °C at sea level.
const referenceAir = {
  temperature: 20,
  altitude: 0,
  pressureMode: 'auto',
  temperatureMode: 'manual',
  humidity: 50
};

export function installLab094(api, h) {
  const {
    state,
    getParameters,
    applyParameters,
    setView,
    download
  } = api;
  const {
    L,
    k,
    button,
    fmt,
    toast,
    escape
  } = h;
  const table = (headers, rows) =>
    `<div class="table-scroll"><table class="lab-table"><thead><tr>${headers.map(s => `<th>${k(s)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const signed = v => v === null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${fmt(v, 1)}%`;
  const seconds = s => s < 60 ? `${fmt(s, 0)} ${L('s')}` : `${fmt(s / 60, 1)} ${L('min')}`;
  const u = unit => L(unit);

  // ---------- Validation tab ----------
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.id = 'validationTab';
  tab.className = 'mode-tab';
  tab.dataset.view = 'validation';
  tab.setAttribute('role', 'tab');
  tab.tabIndex = -1;
  tab.setAttribute('aria-controls', 'validationView');
  tab.setAttribute('aria-selected', 'false');
  tab.innerHTML = k('Validation');
  tab.addEventListener('click', () => setView('validation'));
  document.querySelector('.mode-tabs').append(tab);
  const panel = document.createElement('section');
  panel.id = 'validationView';
  panel.className = 'view-panel lab-view';
  panel.hidden = true;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'validationTab');
  document.querySelector('.visual-panel').append(panel);
  panel.innerHTML =
    `<header class="lab-heading"><span class="panel-label">09 / VALIDATION</span><h2>${k('Does the model match measurements?')}</h2><p>${k('Published bench tables and your own measurements, compared with the model at the same speeds. A model is only as good as its check against real data.')}</p></header>` +
    `<div class="lab-card"><h3>${k('Published bench data')}</h3><label>${k('Data set')}<select id="v94Set">${benchReferences.map(s => `<option value="${s.id}">${escape(s.label)}</option>`).join('')}</select></label><output id="v94SetSummary" class="result-ribbon"></output><div class="v94-charts"><canvas id="v94SetCanvas" class="lab-chart" aria-label="${escape(L('Thrust: measured and model'))}"></canvas><canvas id="v94SetPowerCanvas" class="lab-chart" aria-label="${escape(L('Electrical power: measured and model'))}"></canvas></div><div class="v94-legend"><span class="v94-key accent"></span>${k('thrust, model')}<span class="v94-key accent dot"></span>${k('thrust, measured')}<span class="v94-key blue"></span>${k('power, model')}<span class="v94-key blue dot"></span>${k('power, measured')}</div><div id="v94SetTable"></div><p class="lab-note" id="v94SetSource"></p><p class="lab-note">${k('The tests do not state the air density, so 20 °C at sea level is assumed. Power is the electrical input from the supply, so the ESC is included. The model uses its default propeller fit; the three-blade propeller is outside that fit, which the large error shows. Use your own data and the fit below for such propellers.')}</p></div>` +
    `<div class="lab-card"><h3>${k('Your measurements · CSV')}</h3><p>${k('Bench table: RPM and thrust, plus voltage and current or electrical power. Flight log: time, voltage and current (Betaflight and ArduPilot exports work). Separator: comma, semicolon or tab.')}</p><div class="lab-actions"><label class="button file-button">${k('Open CSV')}<input id="v94File" type="file" accept=".csv,.txt,text/csv"></label>${button('v94Check', 'Check')}${button('v94BenchTemplate', 'Bench template')}${button('v94LogTemplate', 'Log template')}</div><textarea id="v94Text" class="v94-text" rows="6" spellcheck="false" aria-label="${escape(L('Measurements · CSV'))}" placeholder="RPM,Thrust (g),Voltage (V),Current (A)"></textarea><output id="v94Result" class="result-ribbon" hidden></output><canvas id="v94Canvas" class="lab-chart" hidden aria-label="${escape(L('Your measurements and the model'))}"></canvas><div id="v94Table"></div><div class="lab-actions" id="v94FitActions" hidden>${button('v94Fit', 'Fit Ct and Cp')}${button('v94Apply', 'Apply to my drone', 'disabled')}</div><output id="v94FitResult" class="result-ribbon" hidden></output><p class="lab-note">${k('The check uses the propeller, motor and air of the current settings. Set the temperature and altitude of your test first. A flight log is compared with the hover power of the current drone and weather.')}</p></div>` +
    `<div class="lab-card"><h3>${k('Motor efficiency along the propeller curve')}</h3><canvas id="v94EffCanvas" class="lab-chart" aria-label="${escape(L('Motor efficiency and current versus RPM'))}"></canvas><div class="v94-legend"><span class="v94-key accent"></span>${k('efficiency, %')}<span class="v94-key blue"></span>${k('current, A')}</div><output id="v94EffNote" class="result-ribbon"></output><p class="lab-note">${k('Datasheet model: current = torque / Kt + I0, voltage = speed / Kv + current × R. Losses are copper I²R plus iron I0 × back EMF. Efficiency is low at small loads, where the idle loss dominates, and falls again at high current, where copper losses grow with the square of the current.')}</p></div>`;

  function benchSetup(set) {
    return {
      ...referenceAir,
      diameter: set.diameter,
      pitch: set.pitch,
      voltage: set.voltage,
      propEfficiency: 86,
      calibratedProps: false,
      escEfficiency: 97,
      ...(set.motor ? {
        motorModel: 'datasheet',
        ...set.motor
      } : {
        motorModel: 'rated',
        motorEfficiency: 80
      })
    };
  }

  function renderSet() {
    const set = benchReferences.find(s => s.id === $('v94Set').value) || benchReferences[0];
    const setup = benchSetup(set);
    const result = compareBench(baseDefaults, set.rows, setup);
    const top = Math.max(...set.rows.map(r => r.rpm)) * 1.05;
    const xs = Array.from({
      length: 30
    }, (_, i) => top * (i + 1) / 30);
    const curve = compareBench(baseDefaults, xs.map(rpm => ({
      rpm,
      thrustN: 1,
      electricalPower: 1
    })), setup).rows;
    $('v94SetSummary').textContent =
      `${L('Thrust')}: ${L('mean error')} ${fmt(result.thrustMAE, 1)}% · ${L('Electrical power')}: ${L('mean error')} ${fmt(result.powerMAE, 1)}% · ${L(result.motorModel === 'datasheet' ? 'datasheet motor model' : 'simple motor model, 80% efficiency')}`;
    drawLineChart($('v94SetCanvas'), {
      series: [{
        points: curve.map(r => ({
          x: r.rpm,
          y: r.modelThrustN / G * 1000
        }))
      }, {
        points: result.rows.map(r => ({
          x: r.rpm,
          y: r.thrustN / G * 1000,
          dot: true
        })),
        width: 0.01
      }],
      yMin: 0,
      xLabel: 'RPM',
      yLabel: `${L('thrust')} · ${u('g')}`,
      xFormat: v => fmt(v, 0),
      yFormat: v => fmt(v, 0)
    });
    drawLineChart($('v94SetPowerCanvas'), {
      series: [{
        points: curve.map(r => ({
          x: r.rpm,
          y: r.modelElectricalPower
        })),
        tone: 'blue'
      }, {
        points: result.rows.map(r => ({
          x: r.rpm,
          y: r.electricalPower,
          dot: true
        })),
        tone: 'blue',
        width: 0.01
      }],
      yMin: 0,
      xLabel: 'RPM',
      yLabel: `${L('power')} · ${u('W')}`,
      xFormat: v => fmt(v, 0),
      yFormat: v => fmt(v, 0)
    });
    $('v94SetTable').innerHTML = table(['Throttle', 'RPM', 'Thrust · g', 'Model · g', 'Error', 'Power · W',
      'Model · W', 'Error'
    ], result.rows.map(r => [`${r.throttle}%`, fmt(r.rpm, 0), fmt(r.thrustN / G * 1000, 0), fmt(r.modelThrustN /
      G * 1000, 0), signed(r.thrustError), fmt(r.electricalPower, 1), fmt(r.modelElectricalPower, 1), signed(r
      .powerError)]));
    $('v94SetSource').textContent = `${L('Source')}: ${set.source}. ${set.blades} ${L('blades')}.`;
  }
  $('v94Set').addEventListener('change', renderSet);

  let measured = null,
    lastFit = null;
  const csvError = e => L(({
    'csv-empty': 'The file is empty.',
    'csv-columns': 'Columns not found: a bench table needs RPM and thrust, a log needs time, voltage and current.',
    'csv-rows': 'Too few rows with numbers.',
    'log-idle': 'The log has no samples with current above 0.5 A.',
    'log-time': 'The time column does not grow.'
  })[e?.message] || 'Check measurements');

  function checkMeasurements() {
    $('v94FitActions').hidden = true;
    $('v94FitResult').hidden = true;
    $('v94Apply').disabled = true;
    lastFit = null;
    try {
      measured = parseMeasurementCSV($('v94Text').value);
    } catch (e) {
      measured = null;
      $('v94Result').hidden = false;
      $('v94Result').textContent = csvError(e);
      $('v94Canvas').hidden = true;
      $('v94Table').innerHTML = '';
      return;
    }
    const p = getParameters();
    $('v94Result').hidden = false;
    $('v94Canvas').hidden = false;
    if (measured.kind === 'bench') {
      const result = compareBench(p, measured.rows);
      $('v94Result').textContent =
        `${L('Bench table')} · ${measured.rows.length} ${L('rows')} · ${L('Thrust')}: ${L('mean error')} ${fmt(result.thrustMAE, 1)}%` +
        (result.powerMAE === null ? '' : ` · ${L('Electrical power')}: ${L('mean error')} ${fmt(result.powerMAE, 1)}%`);
      drawLineChart($('v94Canvas'), {
        series: [{
          points: result.rows.map(r => ({
            x: r.rpm,
            y: r.modelThrustN
          }))
        }, {
          points: result.rows.map(r => ({
            x: r.rpm,
            y: r.thrustN,
            dot: true
          })),
          width: 0.01
        }],
        yMin: 0,
        xLabel: 'RPM',
        yLabel: `${L('thrust')} · ${u('N')}`,
        xFormat: v => fmt(v, 0),
        yFormat: v => fmt(v, 1)
      });
      $('v94Table').innerHTML = table(['RPM', 'Thrust · N', 'Model · N', 'Error', 'Power · W', 'Model · W',
        'Error'
      ], result.rows.map(r => [fmt(r.rpm, 0), fmt(r.thrustN, 2), fmt(r.modelThrustN, 2), signed(r.thrustError),
        r.electricalPower === null ? '—' : fmt(r.electricalPower, 1), fmt(r.modelElectricalPower, 1), signed(r
          .powerError)
      ]));
      $('v94FitActions').hidden = false;
    } else {
      const log = compareFlightLog(p, measured.rows);
      $('v94Result').textContent =
        `${L('Flight log')} · ${seconds(log.duration)} · ${L('average power')} ${fmt(log.averagePower, 0)} ${u('W')} · ${fmt(log.energyWh, 1)} ${u('Wh')} · ${fmt(log.chargeAh * 1000, 0)} ${u('mAh')} · ${L('model hover')} ${fmt(log.modelPower, 0)} ${u('W')} (${signed(log.difference)})`;
      drawLineChart($('v94Canvas'), {
        series: [{
          points: log.series.map(r => ({
            x: r.time,
            y: r.power
          })),
          tone: 'blue'
        }],
        yMin: 0,
        hLines: [{
          y: log.modelPower,
          label: L('model hover'),
          tone: 'accent'
        }],
        xLabel: `${L('time')} · ${L('s')}`,
        yLabel: `${L('power')} · ${u('W')}`,
        xFormat: v => fmt(v, 0),
        yFormat: v => fmt(v, 0)
      });
      $('v94Table').innerHTML = `<p class="lab-note">${k('A flight log includes climbs, turns and wind, so it is usually above the hover power. A log of a calm hover is the fairest check.')}</p>`;
    }
  }
  $('v94Check').addEventListener('click', checkMeasurements);
  $('v94File').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20e6) return toast('File is too large');
    $('v94Text').value = await file.text();
    event.target.value = '';
    checkMeasurements();
  });
  const benchTemplate =
    'RPM,Thrust (g),Voltage (V),Current (A)\n3900,830,22.2,3.6\n4600,1150,22.2,5.9\n5100,1430,22.2,7.8\n5600,1690,22.2,10.1\n6000,1920,22.2,11.9\n';
  const logTemplate = 'time (s),voltage (V),current (A)\n0,25.1,0.4\n1,24.6,12.8\n2,24.5,13.1\n3,24.5,12.9\n4,24.4,13.4\n5,24.4,13.0\n';
  $('v94BenchTemplate').addEventListener('click', () => download('drone-weather-lab-bench-template.csv', benchTemplate,
    'text/csv'));
  $('v94LogTemplate').addEventListener('click', () => download('drone-weather-lab-log-template.csv', logTemplate,
    'text/csv'));
  $('v94Fit').addEventListener('click', () => {
    if (measured?.kind !== 'bench') return;
    lastFit = fitPropeller(getParameters(), measured.rows);
    $('v94FitResult').hidden = false;
    $('v94FitResult').textContent = lastFit.cp ?
      `Ct ${fmt(lastFit.ct, 4)} · Cp ${fmt(lastFit.cp, 4)} · ${L('figure of merit')} ${fmt(lastFit.figureOfMerit, 2)} · R² ${fmt(lastFit.thrustR2, 3)} / ${fmt(lastFit.powerR2, 3)}${lastFit.shaftMeasured ? '' : ` · ${L('shaft power estimated from the electrical power and the motor model')}`}` :
      `Ct ${fmt(lastFit.ct, 4)} · R² ${fmt(lastFit.thrustR2, 3)} · ${L('Cp needs power in the table')}`;
    $('v94Apply').disabled = !(lastFit.cp && lastFit.ct >= 0.02 && lastFit.ct <= 0.2 && lastFit.cp >= 0.005 && lastFit
      .cp <= 0.15);
  });
  $('v94Apply').addEventListener('click', () => {
    if (!lastFit?.cp) return;
    try {
      applyParameters({
        ct: Math.round(lastFit.ct * 1e4) / 1e4,
        cp: Math.round(lastFit.cp * 1e4) / 1e4,
        propEfficiency: 100,
        calibratedProps: true
      });
      api.invalidate();
      toast('Design updated');
    } catch {
      toast('Coefficients outside supported range');
    }
  });

  function renderEfficiency() {
    const p = getParameters(),
      r = calculate(p);
    const D = p.diameter * 0.0254;
    const shaftAt = rpm => r.powerCoefficient * r.density * (rpm / 60) ** 3 * D ** 5;
    const datasheet = p.motorModel === 'datasheet';
    const spec = motorSpec(p);
    const top = datasheet ? Math.max(r.rpmPowerLimit, r.hoverRpm * 1.2) : Math.max(p.maxRpm, r.hoverRpm * 1.2);
    const curve = datasheet ? efficiencyCurve(spec, shaftAt, top, p.temperature, 48) : Array.from({
      length: 48
    }, (_, i) => {
      const rpm = top * (i + 1) / 48;
      return {
        rpm,
        efficiency: p.motorEfficiency / 100,
        current: shaftAt(rpm) / (p.motorEfficiency / 100) / Math.max(1, r.terminalVoltage)
      };
    });
    const hover = datasheet ? motorPoint(spec, r.hoverRpm, r.hoverShaftPower / p.rotors, p.temperature) : null;
    drawLineChart($('v94EffCanvas'), {
      series: [{
        points: curve.map(c => ({
          x: c.rpm,
          y: c.efficiency * 100
        }))
      }, {
        points: curve.map(c => ({
          x: c.rpm,
          y: c.current
        })),
        tone: 'blue',
        dashed: true
      }],
      yMin: 0,
      vLines: [{
        x: r.hoverRpm,
        label: L('hover')
      }],
      xLabel: 'RPM',
      yLabel: `${L('efficiency, %')} / ${L('current, A')}`,
      xFormat: v => fmt(v, 0),
      yFormat: v => fmt(v, 0)
    });
    if (datasheet) {
      const best = curve.reduce((a, b) => b.efficiency > a.efficiency ? b : a, curve[0]);
      $('v94EffNote').textContent =
        `${L('Peak efficiency')} ${fmt(best.efficiency * 100, 1)}% ${L('at')} ${fmt(best.rpm, 0)} RPM · ${L('hover')} ${fmt(hover.efficiency * 100, 1)}%, ${fmt(hover.current, 1)} ${u('A')}, ${L('losses')} ${fmt(hover.loss, 0)} ${u('W')} ${L('per motor')} · ${L('top speed at this voltage')} ${fmt(r.rpmPowerLimit, 0)} RPM (Kv ${fmt(p.motorKv, 0)} × ${fmt(r.terminalVoltage * ESC_MODULATION, 1)} ${u('V')} ${L('minus the winding drop')})`;
    } else $('v94EffNote').textContent = L(
      'The simple model keeps the efficiency fixed. Choose the datasheet motor model in Motors and RPM to see how it changes with load.'
    );
  }

  // ---------- Thermal panel in the flight view ----------
  const flight = $('flightView');
  const thermal = document.createElement('section');
  thermal.className = 'thermal-panel';
  thermal.id = 'thermalPanel';
  thermal.innerHTML =
    `<header><div><span class="panel-label">${k('TEMPERATURES')}</span><h3>${k('What overheats first')}</h3></div><output id="v94Forecast" class="v94-forecast" role="status" aria-live="polite"></output></header><canvas id="v94ThermalCanvas" class="lab-chart thermal-chart" aria-label="${escape(L('Temperatures of motors, ESC and battery'))}"></canvas><div class="v94-legend"><span class="v94-key danger"></span>${k('hottest motor')}<span class="v94-key warning"></span>${k('hottest ESC')}<span class="v94-key blue"></span>${k('battery')}</div><div class="thermal-actions"><div><span class="panel-label">${k('OVERLOAD TESTS')}</span><div class="lab-actions" id="v94Scenarios">${overloadScenarios.map(s => `<button type="button" class="button" data-scenario="${s.id}" title="${escape(L(s.text))}">${k(s.title)}</button>`).join('')}${button('v94Reset', 'Back to the default drone')}</div></div><div><span class="panel-label">${k('MOTOR FAILURE IN FLIGHT')}</span><div class="lab-actions" id="v94Failures"></div></div><div><span class="panel-label">${k('RECORD')}</span><div class="lab-actions">${button('v94ThermalCSV', 'Export temperatures · CSV')}</div></div></div><p class="lab-note" id="v94ScenarioNote"></p>`;
  flight.append(thermal);
  let samples = [],
    lastSample = -Infinity,
    lastTick = 0,
    lastForecast = null;

  function failureButtons() {
    const n = getParameters().rotors;
    const box = $('v94Failures');
    if (box.children.length === n) return;
    box.innerHTML = Array.from({
      length: n
    }, (_, i) => `<button type="button" class="button" data-fail="${i}">M${i + 1}</button>`).join('');
  }
  failureButtons();
  $('v94Failures').addEventListener('click', event => {
    const b = event.target.closest('[data-fail]');
    if (!b) return;
    const i = Number(b.dataset.fail);
    if ($('standTest').checked) {
      $('standTest').checked = false;
      $('standTest').dispatchEvent(new Event('change', {
        bubbles: true
      }));
    }
    state.motorHealths[i] = 0;
    state.motorFire[i] = 0;
    $('v94ScenarioNote').textContent = L(getParameters().rotors === 4 ?
      'A quadcopter with three motors can balance roll and pitch only by nearly stopping the opposite motor, so it loses the torque balance and spins. Restore the motors with F.' :
      'With six or eight motors the controller shares the lost thrust among the others and keeps the heading. The working motors carry more and heat more. Restore them with F.');
  });
  $('v94Scenarios').addEventListener('click', event => {
    const b = event.target.closest('[data-scenario]');
    const scenario = overloadScenarios.find(s => s.id === b?.dataset.scenario);
    if (!scenario) return;
    $('dronePreset').value = 'survey';
    $('dronePreset').dispatchEvent(new Event('change'));
    applyParameters(scenario.parameters, {
      resetFlight: true
    });
    $('standTest').checked = scenario.stand;
    $('standTest').dispatchEvent(new Event('change', {
      bubbles: true
    }));
    samples = [];
    lastSample = -Infinity;
    $('v94ScenarioNote').textContent = `${L(scenario.title)}: ${L(scenario.text)}`;
    api.invalidate();
    toast('Overload test started');
  });
  $('v94Reset').addEventListener('click', () => {
    $('resetSimulation').click();
    samples = [];
    lastSample = -Infinity;
    $('v94ScenarioNote').textContent = '';
  });
  $('v94ThermalCSV').addEventListener('click', () => {
    if (!samples.length) return toast('No samples yet');
    const header = ['time_s', ...samples[0].motors.map((_, i) => `motor${i + 1}_c`), 'esc_max_c', 'battery_c'];
    download('drone-weather-lab-temperatures.csv', [header.join(','), ...samples.map(s => [fmt0(s.t), ...s.motors.map(
      fmt0), fmt0(s.esc), fmt0(s.battery)].join(','))].join('\n') + '\n', 'text/csv');
  });
  const fmt0 = v => (Math.round(v * 10) / 10).toFixed(1);

  function forecastText() {
    const p = getParameters();
    const draws = state.motorDraws || [];
    const f = thermalForecast(p, {
      motorTemps: state.motorTemps,
      loads: state.motorLoads,
      draws,
      fires: state.motorFire,
      healths: state.motorHealths,
      rpms: state.motorActualRpms,
      escTemps: state.escTemps,
      motorInputs: draws.map(d => d.input),
      batteryTemp: state.battery?.temperature,
      batteryHeat: state.batteryActual?.heat,
      wind: state.windNow,
      density: calculate(p).density
    });
    lastForecast = f;
    const burning = state.motorFire.findIndex(v => v > 0.06),
      failed = state.motorHealths.findIndex(v => v < 0.18);
    if (state.battery?.temperature >= THERMAL_LIMITS.batteryCut) return [L('Battery at 75 °C: power cut'), 'critical'];
    if (burning >= 0) return [`M${burning + 1}: ${L('fire')}`, 'critical'];
    if (failed >= 0 && state.motorHealths[failed] > 0 && state.motorTemps[failed] > 60) return [`M${failed + 1}: ${L('failed after overheating')}`, 'critical'];
    if (!f.first) return [L('No part reaches its limit at this load'), 'ok'];
    const name = f.first.part === 'motor' ? `M${f.first.index + 1}` : f.first.part === 'esc' ? `ESC ${f.first.index + 1}` :
      L('Battery');
    const event = L(({
      smoke: 'smoke at 145 °C',
      fire: 'fire at 175 °C',
      derate: 'power limit at 95 °C',
      cut: f.first.part === 'battery' ? 'power cut at 75 °C' : 'cut at 135 °C'
    })[f.first.event]);
    return [`${L('First')}: ${name}, ${event} ${L('in')} ${seconds(f.first.seconds)}`, f.first.seconds < 60 ? 'critical' :
      'warm'
    ];
  }

  function drawThermal() {
    const t0 = samples.length ? samples.at(-1).t - 120 : 0;
    const recent = samples.filter(s => s.t >= t0);
    drawLineChart($('v94ThermalCanvas'), {
      series: [{
        points: recent.map(s => ({
          x: s.t,
          y: Math.max(...s.motors)
        })),
        tone: 'danger'
      }, {
        points: recent.map(s => ({
          x: s.t,
          y: s.esc
        })),
        tone: 'warning'
      }, {
        points: recent.map(s => ({
          x: s.t,
          y: s.battery
        })),
        tone: 'blue'
      }],
      yMin: Math.min(0, ...recent.map(s => s.battery)),
      hLines: [{
        y: THERMAL_LIMITS.motorFire,
        label: L('motor fire 175 °C'),
        tone: 'danger'
      }, {
        y: THERMAL_LIMITS.batteryCut,
        label: L('battery cut 75 °C'),
        tone: 'blue'
      }],
      xLabel: `${L('time')} · ${L('s')}`,
      yLabel: '°C',
      xFormat: v => fmt(v, 0),
      yFormat: v => fmt(v, 0),
      empty: L('Waiting for the flight')
    });
  }

  let shownView = '';
  return {
    tick(now, render = true) {
      if (state.t < lastSample) {
        samples = [];
        lastSample = -Infinity;
      }
      if (state.t - lastSample >= 0.5 && state.motorTemps?.length && state.escTemps?.length && state.battery) {
        lastSample = state.t;
        samples.push({
          t: state.t,
          motors: state.motorTemps.slice(),
          esc: Math.max(...state.escTemps),
          battery: state.battery.temperature
        });
        if (samples.length > 2400) samples.splice(0, samples.length - 2400);
      }
      if (!render || now - lastTick < 250) return;
      lastTick = now;
      failureButtons();
      if (state.activeView === 'flight') {
        const [text, tone] = forecastText();
        $('v94Forecast').textContent = text;
        $('v94Forecast').dataset.tone = tone;
        drawThermal();
      }
      if (state.activeView === 'validation' && shownView !== 'validation') {
        renderSet();
        renderEfficiency();
      }
      shownView = state.activeView;
    },
    refreshLanguage() {
      tab.setAttribute('aria-label', L('Validation'));
      if (state.activeView === 'validation') {
        renderSet();
        renderEfficiency();
        if (measured) checkMeasurements();
      }
      shownView = '';
    },
    unitsChanged() {
      shownView = '';
    },
    // For tests: the last forecast and the recorded samples.
    debug: () => ({
      forecast: lastForecast,
      samples: samples.length
    })
  };
}
