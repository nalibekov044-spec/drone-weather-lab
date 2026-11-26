// 0.95: weather for a real place and time (Open-Meteo, free, no key) and the battery size that flies longest.
import {
  calculate,
  baseDefaults
} from './physics.js';
import {
  packEnergyWh,
  packSpecificEnergy
} from './power-system.js';
import {
  drawLineChart
} from './lab-chart.js';
import {
  labText
} from './workbench-language.js';
import {
  v095LabText
} from './lab-095-language.js';
import {
  v096LabText
} from './lab-096-language.js';
import {
  forecastProfile,
  liftToFlightHeight,
  airAbove
} from './wind-profile.js';

for (const [key, value] of Object.entries({
    ...v095LabText,
    ...v096LabText
  }))
  if (!(key in labText)) labText[key] = value;

const $ = id => document.getElementById(id);

export const weatherPlaces = [
  ['almaty', 'Almaty', 43.238, 76.946],
  ['shymbulak', 'Shymbulak', 43.128, 77.081],
  ['bao', 'Big Almaty Lake', 43.051, 76.986],
  ['medeu', 'Medeu', 43.157, 77.059],
  ['astana', 'Astana', 51.169, 71.449]
];

export function openMeteoUrl(latitude, longitude) {
  // 0.96.0: wind at 80, 120 and 180 m too, for the wind at the flight height.
  const fields = 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_80m,wind_direction_120m,wind_direction_180m';
  return `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&hourly=${fields}&wind_speed_unit=ms&timezone=auto&forecast_days=3`;
}

// Picks the hour and turns it into simulator weather. Gusts are a percentage of the mean wind here.
export function weatherFromOpenMeteo(data, hourIndex) {
  const h = data?.hourly;
  if (!h?.time?.length) throw Error('weather-format');
  const i = Math.max(0, Math.min(h.time.length - 1, hourIndex));
  const wind = Number(h.wind_speed_10m[i]),
    gust = Number(h.wind_gusts_10m[i]);
  const values = {
    temperatureMode: 'manual',
    temperature: Number(h.temperature_2m[i]),
    humidity: Number(h.relative_humidity_2m[i]),
    pressureMode: 'manual',
    pressureHpa: Number(h.surface_pressure[i]),
    altitude: Math.max(0, Number(data.elevation) || 0),
    windSpeed: wind,
    windDirection: (Number(h.wind_direction_10m[i]) % 360 + 360) % 360,
    gusts: wind > 0.3 ? Math.max(0, Math.min(100, (gust - wind) / wind * 100)) : 0,
    rainRate: Math.max(0, Number(h.precipitation[i]) || 0)
  };
  if (Object.values(values).some(v => typeof v === 'number' && !Number.isFinite(v))) throw Error('weather-format');
  return {
    values,
    time: h.time[i],
    gust
  };
}

// The hour index nearest to a moment, in the place's own time zone (Open-Meteo gives local times).
export function hourIndexFor(data, offsetHours, nowMs = Date.now()) {
  const shift = (data.utc_offset_seconds || 0) * 1000;
  const target = nowMs + offsetHours * 3600e3 + shift;
  let best = 0,
    bestGap = Infinity;
  data.hourly.time.forEach((t, i) => {
    const gap = Math.abs(Date.parse(t + 'Z') - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}

// Flight time against battery capacity when the battery mass follows its energy (the pack's own Wh/kg).
export function batterySizeCurve(parameters, factors = Array.from({
  length: 23
}, (_, i) => 0.25 + i * 0.125)) {
  const p = {
    ...baseDefaults,
    ...parameters
  };
  const wh = packEnergyWh(p),
    perKg = wh / Math.max(0.005, p.batteryMass) || packSpecificEnergy[p.batteryChemistry] || 165;
  const frame = p.mass - p.batteryMass;
  return factors.map(f => {
    const capacity = p.capacity * f,
      batteryMass = wh * f / perKg;
    // Full throttle available: the RPM command is a pilot setting, not part of the design.
    const r = calculate({
      ...p,
      rpm: p.maxRpm,
      capacity,
      batteryMass,
      mass: frame + batteryMass
    });
    const thrustToWeight = r.hardwareMaxThrust / Math.max(1e-9, (frame + batteryMass + p.payload) * 9.81);
    return {
      factor: f,
      capacity,
      batteryMass,
      mass: frame + batteryMass,
      minutes: r.feasible ? r.flightMinutes : 0,
      feasible: r.feasible,
      thrustToWeight,
      // A common design rule: at full throttle the drone lifts at least twice its weight.
      usable: r.feasible && thrustToWeight >= 2
    };
  });
}

export function installLab095(api, h) {
  const {
    getParameters,
    applyParameters
  } = api;
  const {
    L,
    k,
    fmt,
    toast,
    escape
  } = h;

  // Compact first screen: the run state sits in the tab row, the scene switches in the scene header.
  const tabs = document.querySelector('.mode-tabs'), strip = document.querySelector('.activity-strip');
  if (tabs && strip) tabs.append(strip);
  const header = document.querySelector('#flightView > .visual-header'), sceneControls = document.querySelector('#flightView > .scene-controls');
  if (header && sceneControls) header.insertBefore(sceneControls, document.getElementById('flightStatus'));

  // ---------- Essential settings ----------
  const panel = document.querySelector('.controls-panel');
  const essentialIds = ['dronePreset', 'payload', 'mass', 'windSpeed', 'windDirection', 'gusts', 'temperature', 'altitude',
    'rainRate', 'batteryChemistry', 'batteryCells', 'voltage', 'capacity', 'stateOfCharge', 'batteryMassAuto', 'rpm',
    'standTest', 'motorModel', 'motorMaxPower', 'modelFile'
  ];
  for (const id of essentialIds) {
    const label = $(id)?.closest('.control, .check-control');
    label?.classList.add('essential');
    label?.closest('.control-group')?.classList.add('has-essential');
  }
  $('modelStatus')?.classList.add('essential');
  const allCount = panel ? panel.querySelectorAll('.control, .check-control').length : 0;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'button essentials-toggle';
  toggle.id = 'v95Essentials';
  document.querySelector('.controls-tools')?.append(toggle);
  let essentials = true;
  try {
    essentials = localStorage.getItem('dwl-essentials') !== '0';
  } catch {}
  function setEssentials(on, remember = true) {
    essentials = on;
    panel?.classList.toggle('essentials', on);
    toggle.innerHTML = on ? `${k('Show all settings')} (${allCount})` : k('Only the main settings');
    toggle.setAttribute('aria-pressed', String(on));
    if (remember) try {
      localStorage.setItem('dwl-essentials', on ? '1' : '0');
    } catch {}
  }
  setEssentials(essentials, false);
  toggle.addEventListener('click', () => setEssentials(!essentials));
  // Searching looks through every setting, not only the main ones.
  $('controlSearch')?.addEventListener('input', () => panel?.classList.toggle('essentials', essentials && !$(
    'controlSearch').value.trim()));

  // ---------- Weather by place ----------
  const weatherGroup = [...document.querySelectorAll('.controls-panel details')].find(d => d.querySelector('#windSpeed'));
  const body = weatherGroup?.querySelector('.control-body');
  if (body) {
    const box = document.createElement('div');
    box.className = 'weather-fetch wide';
    box.innerHTML =
      `<span class="panel-label">${k('WEATHER BY PLACE')}</span><div class="weather-row"><select id="v95Place" aria-label="${escape(L('Place'))}">${weatherPlaces.map(([id, name]) => `<option value="${id}">${k(name)}</option>`).join('')}<option value="custom">${k('Coordinates')}</option></select><select id="v95When" aria-label="${escape(L('Time'))}"><option value="0">${k('Now')}</option><option value="3">${k('In 3 hours')}</option><option value="24">${k('Tomorrow, same time')}</option><option value="48">${k('In 2 days')}</option></select></div><div class="weather-row" id="v95Coords" hidden><input id="v95Lat" type="number" step="0.0001" min="-90" max="90" value="43.2380" aria-label="${escape(L('Latitude'))}"><input id="v95Lon" type="number" step="0.0001" min="-180" max="180" value="76.9460" aria-label="${escape(L('Longitude'))}"></div><div class="weather-row"><label class="weather-field"><span>${k('Flight height above the ground, m')}</span><input id="v96Height" type="number" min="2" max="500" step="1" value="30"></label><label class="weather-field"><span>${k('Ground')}</span><select id="v96Terrain"><option value="water">${k('Water or ice')}</option><option value="open" selected>${k('Open ground')}</option><option value="built">${k('Town or forest')}</option></select></label></div><button type="button" class="button" id="v95Fetch">${k('Get the forecast')}</button><p class="control-hint essential" id="v95WeatherStatus">${k('Forecast from Open-Meteo: free, no account. Needs internet; the rest of the simulator works offline.')}</p>`;
    body.prepend(box);
    $('v95Place').addEventListener('change', () => $('v95Coords').hidden = $('v95Place').value !== 'custom');
    // Inputs are clamped to their own limits before they are applied (a 7 000 m peak still fits the 6 000 m slider).
    const fit = (id, v) => Math.min(Number($(id).max), Math.max(Number($(id).min), v));
    let forecast = null,
      pressureRef = null,
      applyingForecast = false;
    function applyForecast() {
      const height = Math.min(500, Math.max(2, Number($('v96Height').value) || 30));
      const surface = weatherFromOpenMeteo(forecast.data, forecast.index);
      const lifted = liftToFlightHeight(surface, forecastProfile(forecast.data, forecast.index), height, $('v96Terrain')
        .value);
      const v = lifted.values;
      const values = {
        ...v,
        altitude: fit('altitude', Math.round(v.altitude)),
        pressureHpa: fit('pressureHpa', v.pressureHpa),
        windSpeed: fit('windSpeed', v.windSpeed),
        temperature: fit('temperature', v.temperature),
        humidity: fit('humidity', v.humidity),
        rainRate: fit('rainRate', v.rainRate),
        gusts: fit('gusts', v.gusts)
      };
      applyingForecast = true;
      applyParameters(values);
      applyingForecast = false;
      api.invalidate();
      // The pressure now belongs to this altitude: if the altitude is moved by hand, the pressure follows it.
      const now = getParameters();
      pressureRef = {
        altitude: now.altitude,
        pressureHpa: values.pressureHpa,
        temperature: values.temperature,
        shown: now.pressureHpa
      };
      const method = {
        forecast: L('from the forecast levels'),
        extrapolated: L('above 180 m, extended from the forecast levels'),
        power: L('by the power law from 10 m')
      } [lifted.method];
      $('v95WeatherStatus').textContent =
        `${L(forecast.placeName)} · ${lifted.time.replace('T', ' ')} · ${fmt(values.temperature, 1)} °C · ${L('wind at 10 m')} ${fmt(lifted.wind10, 1)} ${L('m/s')}, ${L('at flight height')} (${fmt(height, 0)} ${L('m')}) ${fmt(v.windSpeed, 1)} ${L('m/s')}, ${method} · ${L('gusts to')} ${fmt(lifted.gust, 1)} ${L('m/s')} ${L('at 10 m')} · ${fmt(values.pressureHpa, 0)} ${L('hPa')} · ${L('ground')} ${fmt(lifted.ground, 0)} ${L('m')}, ${L('flight')} ${fmt(values.altitude, 0)} ${L('m')}.`;
    }
    $('v95Fetch').addEventListener('click', async () => {
      const place = weatherPlaces.find(p => p[0] === $('v95Place').value);
      const lat = place ? place[2] : Number($('v95Lat').value),
        lon = place ? place[3] : Number($('v95Lon').value);
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return toast('Check the coordinates');
      const status = $('v95WeatherStatus');
      status.textContent = L('Loading the forecast…');
      $('v95Fetch').disabled = true;
      try {
        const response = await fetch(openMeteoUrl(lat, lon));
        if (!response.ok) throw Error('weather-http');
        const data = await response.json();
        forecast = {
          data,
          index: hourIndexFor(data, Number($('v95When').value)),
          placeName: place ? place[1] : 'Coordinates'
        };
        applyForecast();
      } catch {
        forecast = null;
        status.textContent = L('Could not load the forecast. Check the internet connection and try again.');
      } finally {
        $('v95Fetch').disabled = false;
      }
    });
    for (const id of ['v96Height', 'v96Terrain']) $(id).addEventListener('change', () => {
      if (!forecast) return;
      try {
        applyForecast();
      } catch {
        $('v95WeatherStatus').textContent = L('Check the flight height: from 2 to 500 m.');
      }
    });
    // Moving the altitude by hand after a forecast: the pressure follows (standard lapse rate), unless the
    // pressure itself was edited or switched back to automatic.
    $('altitude')?.addEventListener('input', () => {
      const p = getParameters();
      if (applyingForecast || !pressureRef || p.pressureMode !== 'manual' || Math.abs(p.pressureHpa - pressureRef.shown) >
        0.51) return;
      const air = airAbove(pressureRef.pressureHpa, pressureRef.temperature, p.altitude - pressureRef.altitude);
      applyingForecast = true;
      applyParameters({
        pressureHpa: fit('pressureHpa', air.pressureHpa)
      });
      applyingForecast = false;
      pressureRef.shown = getParameters().pressureHpa;
      api.invalidate();
      $('v95WeatherStatus').textContent =
        `${L('Pressure moved with the altitude:')} ${fmt(p.altitude, 0)} ${L('m')} → ${fmt(pressureRef.shown, 0)} ${L('hPa')}.`;
    });
    for (const id of ['pressureHpa', 'pressureMode']) $(id)?.addEventListener('input', () => {
      if (!applyingForecast) pressureRef = null;
    });
    $('pressureMode')?.addEventListener('change', () => {
      if (!applyingForecast) pressureRef = null;
    });
  }

  // ---------- Battery size ----------
  const batteries = $('batteriesView');
  const card = document.createElement('div');
  card.className = 'lab-card';
  card.innerHTML =
    `<h3>${k('Which battery flies longest')}</h3><p>${k('A bigger battery holds more energy but weighs more, and the extra weight costs power. The battery mass follows its energy at the Wh/kg of the current pack.')}</p><canvas id="v95BatteryCanvas" class="lab-chart" aria-label="${escape(L('Flight time against battery capacity'))}"></canvas><output id="v95BatteryNote" class="result-ribbon"></output><div class="lab-actions"><button type="button" class="button" id="v95ApplyBest">${k('Use the best capacity')}</button></div>`;
  batteries?.append(card);
  let best = null;

  function renderBattery() {
    const p = getParameters();
    const curve = batterySizeCurve(p);
    const usable = curve.filter(c => c.usable);
    best = (usable.length ? usable : curve).reduce((a, b) => b.minutes > a.minutes ? b : a, curve[0]);
    const now = curve.find(c => Math.abs(c.factor - 1) < 1e-9) || curve[6];
    drawLineChart($('v95BatteryCanvas'), {
      series: [{
        points: curve.filter(c => c.feasible).map(c => ({
          x: c.capacity / 1000,
          y: c.minutes
        })),
        tone: 'muted',
        dashed: true
      }, {
        points: curve.filter(c => c.usable).map(c => ({
          x: c.capacity / 1000,
          y: c.minutes
        }))
      }],
      vLines: [{
        x: p.capacity / 1000,
        label: L('now')
      }, {
        x: best.capacity / 1000,
        label: L('best')
      }],
      yMin: 0,
      xLabel: `${L('capacity')} · ${L('Ah')}`,
      yLabel: L('min'),
      xFormat: v => fmt(v, 1),
      yFormat: v => fmt(v, 0)
    });
    const gain = best.minutes - now.minutes;
    $('v95BatteryNote').textContent =
      `${L('Now')}: ${fmt(p.capacity, 0)} ${L('mAh')}, ${fmt(now.minutes, 1)} ${L('min')}. ${L('Longest')}: ${fmt(best.capacity, 0)} ${L('mAh')}, ${L('battery')} ${fmt(best.batteryMass, 2)} ${L('kg')}, ${fmt(best.minutes, 1)} ${L('min')}` +
      (gain > 0.2 ? ` (+${fmt(gain, 1)} ${L('min')}).` : `. ${L('The current battery is already close to the best.')}`) +
      ` ${L('Hover time; only batteries that keep a thrust-to-weight of at least 2 at full throttle count.')}`;
  }
  $('v95ApplyBest').addEventListener('click', () => {
    if (!best) return;
    const range = (id, v) => Math.min(Number($(id).max), Math.max(Number($(id).min), v));
    applyParameters({
      capacity: range('capacity', Math.round(best.capacity / 100) * 100),
      batteryMass: range('batteryMass', Math.round(best.batteryMass * 1000) / 1000),
      mass: range('mass', Math.round(best.mass * 1000) / 1000)
    });
    api.invalidate();
    toast('Design updated');
    renderBattery();
  });

  let shown = '',
    lastRender = 0;
  return {
    tick(now, state) {
      if (state.activeView !== 'batteries') {
        shown = '';
        return;
      }
      if (shown === 'batteries' && now - lastRender < 1500) return;
      shown = 'batteries';
      lastRender = now;
      renderBattery();
    },
    refreshLanguage() {
      shown = '';
      setEssentials(essentials, false);
    }
  };
}
