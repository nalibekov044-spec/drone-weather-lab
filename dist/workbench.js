import {
  getLanguage
} from './i18n.js';
import {
  buildPack,
  packExamples,
  componentBalance,
  calibrateProp,
  missionForecast,
  scenarioSweep,
  csvText
} from './engineering.js';
import {
  calculate
} from './physics.js';
import {
  geometryFor
} from './drone-builder.js';
import {
  sampleField
} from './flow-lines.js';
import {
  labText
} from './workbench-language.js';
const $ = id => document.getElementById(id);
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const L = s => getLanguage() === 'en' ? s : (labText[s]?.[getLanguage() === 'es' ? 1 : 0] || s);
const k = s => `<span data-lab-text="${escape(s)}">${escape(L(s))}</span>`;
const button = (id, s, extra = '') =>
  `<button type="button" class="button" id="${id}" ${extra}>${k(s)}</button>`;
const number = (id, s, value, min, max, step = 1) =>
  `<label>${k(s)}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
const fmt = (v, n = 2) => Number(v).toLocaleString(getLanguage() === 'es' ? 'es-ES' : getLanguage() === 'ru' ?
  'ru-RU' : 'en-US', {
    maximumFractionDigits: n
  });
const save = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

function table(headers, rows) {
  return `<div class="table-scroll"><table class="lab-table"><thead><tr>${headers.map(s=>`<th>${escape(L(s))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function installWorkbench(api) {
  if (!document.body?.insertAdjacentHTML) return null;
  const {
    state,
    getParameters,
    applyParameters,
    setView,
    scenes,
    download,
    graphRenderer,
    graphRangeFor,
    invalidate,
    setCG
  } = api;
  const sections = {
    engineering: 'My drone',
    batteries: 'Batteries',
    mission: 'Mission',
    history: 'Flight log'
  };
  for (const [id, name] of Object.entries(sections)) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = id + 'Tab';
    tab.className = 'mode-tab';
    tab.dataset.view = id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', id + 'View');
    tab.setAttribute('aria-selected', 'false');
    tab.innerHTML = k(name);
    tab.addEventListener('click', () => setView(id));
    document.querySelector('.mode-tabs').append(tab);
    const panel = document.createElement('section');
    panel.id = id + 'View';
    panel.className = 'view-panel lab-view';
    panel.hidden = true;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', id + 'Tab');
    document.querySelector('.visual-panel').append(panel);
  }
  document.querySelector('.simulation-actions').insertAdjacentHTML('afterbegin',
    `<label class="unit-control">${k('Theme')}<select id="labTheme"><option value="graphite">Graphite</option><option value="polar">Polar</option><option value="sand">Sand</option><option value="rose">Rose</option></select></label>`
  );
  document.querySelector('.release-notice').innerHTML =
    `<div><span class="version-orbit">09</span><div>${k('A flight starts with a design.')}<small>${k('Shape. Power. Air. One workspace.')}</small></div></div><div class="release-tags">CAD · ENERGY · CFD</div>`;
  document.querySelector('.controls-panel').insertAdjacentHTML('afterbegin',
    `<div class="controls-tools"><input id="controlSearch" type="search" placeholder="${L('Find a parameter')}" aria-label="${L('Find a parameter')}">${button('collapseControls','Collapse panels')}</div>`
  );
  document.body.insertAdjacentHTML('beforeend',
    '<div id="labToast" class="lab-toast" role="status" aria-live="polite" hidden></div>');
  let toastTimer;
  const toast = s => {
    $('labToast').textContent = L(s);
    $('labToast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('labToast').hidden = true, 3000);
  };
  const theme = value => {
    document.documentElement.dataset.theme = ['graphite', 'polar', 'sand', 'rose'].includes(value) ? value :
      'graphite';
    $('labTheme').value = document.documentElement.dataset.theme;
    try {
      localStorage.setItem('dwl-theme', value);
    } catch {}
    state.graphDirty = true;
    scenes.forEach(s => {
      s.refreshPalette();
    });
  };
  // Scene palette is refreshed by the renderers on a theme change.
  try {
    theme(localStorage.getItem('dwl-theme') || 'graphite');
  } catch {}
  $('labTheme').addEventListener('change', e => theme(e.target.value));
  $('controlSearch').addEventListener('input', () => {
    const q = $('controlSearch').value.toLocaleLowerCase();
    document.querySelectorAll('.control-group').forEach(g => {
      g.hidden = q && !g.textContent.toLocaleLowerCase().includes(q);
      if (q && !g.hidden) g.open = true;
    });
  });
  $('collapseControls').addEventListener('click', () => document.querySelectorAll('.control-group').forEach(
    g => g.open = false));

  // Battery editing is cell-based; application always installs a fresh pack.
  let packs = read('dwl-packs', []);
  if (!Array.isArray(packs)) packs = [];
  packs = packs.slice(0, 20).filter(p => {
    try {
      buildPack(p);
      return true;
    } catch {
      return false;
    }
  });
  $('batteriesView').innerHTML =
    `<header class="lab-heading"><span class="panel-label">02 / ENERGY</span><h2>${k('Build your battery')}</h2><p>${k('Cell data becomes pack voltage, capacity, resistance and mass. Example cells are illustrative, not manufacturer ratings.')}</p></header><div class="lab-card"><label>${k('Battery library')}<select id="packLibrary"></select></label><div class="lab-form"><label>${k('Name')}<input id="packName" maxlength="60" value="My pack"></label><label>${k('Chemistry')}<select id="packChem"><option value="lipo">LiPo</option><option value="lion">Li-ion</option><option value="lihv">LiHV</option><option value="lifepo4">LiFePO₄</option></select></label>${number('packSeries','Series cells',6,1,16)}${number('packParallel','Parallel cells',1,1,12)}${number('packMah','Cell capacity · mAh',5000,100,30000,50)}${number('packR','Cell resistance · mΩ',5,0,200,.1)}${number('packMass','Cell mass · g',130,5,1000,1)}${number('packC','Discharge rating · C',35,1,100)}</div><output id="packPreview" class="result-ribbon"></output><div class="lab-actions">${button('applyPack','Install battery','class="button-primary"')}${button('savePack','Save profile')}${button('deletePack','Delete saved profile')}${button('exportPack','Export battery')}<label class="button file-button">${k('Import battery')}<input id="importPack" type="file" accept=".json"></label></div><p class="lab-note">${k('Installing changes battery settings and charge. Drone mass stays unchanged; use the component ledger to include the battery exactly once.')}</p></div>`;
  const packData = () => ({
    name: $('packName').value,
    chemistry: $('packChem').value,
    series: +$('packSeries').value,
    parallel: +$('packParallel').value,
    cellMah: +$('packMah').value,
    cellOhm: +$('packR').value / 1000,
    cellMass: +$('packMass').value / 1000,
    cRating: +$('packC').value
  });
  const previewPack = () => {
    try {
      const p = buildPack(packData());
      $('packPreview').textContent =
        `${p.series}S${p.parallel}P · ${fmt(p.voltage)} V · ${fmt(p.capacity,0)} mAh · ${fmt(p.energyWh)} Wh · ${fmt(p.mass)} kg · ${fmt(p.resistance*1000)} mΩ · ${fmt(p.currentLimit)} A`;
      $('applyPack').disabled = false;
      return p;
    } catch {
      $('packPreview').textContent = L('Check cell values and pack limits.');
      $('applyPack').disabled = true;
      return null;
    }
  };
  const populatePack = p => {
    const fields = {
      packName: p.name,
      packChem: p.chemistry,
      packSeries: p.series,
      packParallel: p.parallel,
      packMah: p.cellMah,
      packR: p.cellOhm * 1000,
      packMass: p.cellMass * 1000,
      packC: p.cRating
    };
    for (const [id, v] of Object.entries(fields)) $(id).value = v;
    previewPack();
  };
  const listPacks = () => {
    $('packLibrary').replaceChildren();
    [...packExamples, ...packs].forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = p.name;
      $('packLibrary').append(o);
    });
  };
  listPacks();
  populatePack(packExamples[0]);
  $('packLibrary').addEventListener('change', () => populatePack([...packExamples, ...packs][+$('packLibrary')
    .value
  ]));
  for (const id of ['packName', 'packChem', 'packSeries', 'packParallel', 'packMah', 'packR', 'packMass',
      'packC'
    ]) $(id).addEventListener('input', previewPack);
  $('applyPack').addEventListener('click', () => {
    const p = previewPack();
    if (!p) return;
    try {
      applyParameters(p.parameters, {
        battery: true
      });
      toast('Battery installed');
    } catch {
      toast('Check cell values and pack limits.');
    }
  });
  $('savePack').addEventListener('click', () => {
    if (!previewPack()) return;
    const p = packData();
    if (!p.name.trim()) return;
    const i = packs.findIndex(x => x.name === p.name);
    if (i >= 0) packs[i] = p;
    else if (packs.length < 20) packs.push(p);
    else return toast('Library is full');
    if (save('dwl-packs', packs)) {
      listPacks();
      toast('Saved on this device');
    } else toast('Storage unavailable');
  });
  $('deletePack').addEventListener('click', () => {
    const i = +$('packLibrary').value - packExamples.length;
    if (i < 0) return toast('Select a saved profile');
    packs.splice(i, 1);
    save('dwl-packs', packs);
    listPacks();
    populatePack(packExamples[0]);
  });
  $('exportPack').addEventListener('click', () => {
    if (previewPack()) download('dwl-battery.json', JSON.stringify({
      format: 'dwl-battery',
      version: 1,
      cell: packData()
    }, null, 2), 'application/json');
  });
  $('importPack').addEventListener('change', async e => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 20000) throw Error();
      const d = JSON.parse(await f.text());
      if (d.format !== 'dwl-battery' || d.version !== 1) throw Error();
      buildPack(d.cell);
      populatePack(d.cell);
      toast('Imported');
    } catch {
      toast('Invalid file');
    }
    e.target.value = '';
  });

  let components = [{
    name: 'Frame + electronics',
    mass: 1.2,
    position: [0, 0, 0]
  }, {
    name: 'Motors + propellers',
    mass: .4,
    position: [0, 20, 0]
  }, {
    name: 'Battery',
    kind: 'battery',
    mass: getParameters().batteryMass,
    position: [0, 60, 0]
  }];
  $('engineeringView').innerHTML =
    `<header class="lab-heading"><span class="panel-label">01 / ENGINEERING</span><h2>${k('Your geometry. Your numbers.')}</h2><p>${k('CAD supplies dimensions and a silhouette. Enter mass and Cd from your design or measurements.')}</p></header><div class="lab-card"><h3>${k('Component ledger')}</h3><p>${k('Positions are X / Y / Z in mm, Y up. Include the battery once. Applying this ledger sets payload to zero.')}</p><div id="componentRows"></div><div class="lab-actions">${button('addComponent','Add component')}${button('ledgerBattery','Use installed battery mass')}${button('applyComponents','Apply mass and centre of gravity')}</div><output id="componentSummary" class="result-ribbon"></output><p class="lab-note">${k('Inertia uses point masses about the centre of gravity; component shape inertia and attitude control are not solved.')}</p></div><div class="lab-card"><h3>${k('Independent design calculation')}</h3><div id="customCalculation"></div><div class="lab-actions">${button('recalculateCustom','Calculate design')}${button('useCustom','Open frame builder')}${button('jumpCAD','Open CAD controls')}</div><p>${k('Uses configured initial charge and healthy motors, separately from the live flight. Enable CAD projected area in the CAD controls to use the measured silhouette.')}</p></div><div class="lab-card"><h3>${k('Propeller bench data')}</h3><div class="lab-form">${number('benchThrust','Thrust per motor · N',8,.01,1000,.1)}${number('benchPower','Shaft power per motor · W',100,.1,10000,.1)}${number('benchRpm','Measured RPM',4800,1,28000,10)}</div>${button('calibrateProp','Calculate Ct / Cp')}<output id="benchResult" class="result-ribbon"></output><p class="lab-note">${k('Use shaft power, not electrical input. Coefficients apply to this operating point; they do not fit a full propeller map.')}</p></div>`;

  function renderComponents() {
    $('componentRows').innerHTML = components.map((c, i) =>
      `<div class="component-row"><input aria-label="${L('Name')}" data-component="${i}" data-field="name" value="${escape(c.name)}" maxlength="50"><input aria-label="kg" type="number" data-component="${i}" data-field="mass" value="${c.mass}" min=".001" max="30" step=".01">${c.position.map((v,j)=>`<input aria-label="${['X','Y','Z'][j]} mm" type="number" data-component="${i}" data-field="${j}" value="${v}" min="-2000" max="2000" step="1">`).join('')}<button type="button" class="button" data-remove="${i}" aria-label="${L('Remove')}">×</button></div>`
    ).join('');
    $('componentRows').querySelectorAll('input').forEach(el => el.addEventListener('input', () => {
      const c = components[+el.dataset.component],
        f = el.dataset.field;
      if (f === 'name') c.name = el.value;
      else if (f === 'mass') c.mass = +el.value;
      else c.position[+f] = +el.value;
      ledgerPreview();
    }));
    $('componentRows').querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', () => {
      if (components.length > 1) {
        components.splice(+el.dataset.remove, 1);
        renderComponents();
      }
    }));
    ledgerPreview();
  }

  function ledgerPreview() {
    try {
      const b = componentBalance(components);
      $('componentSummary').textContent =
        `${fmt(b.mass)} kg · CG ${b.cg.map(v=>fmt(v*1000,1)).join(' / ')} mm · Ixx/Iyy/Izz ${b.inertia.map(v=>fmt(v,5)).join(' / ')} kg·m²`;
      return b;
    } catch {
      $('componentSummary').textContent = L('Check component values');
      return null;
    }
  }
  renderComponents();
  $('addComponent').addEventListener('click', () => {
    if (components.length < 40) {
      components.push({
        name: 'Component',
        mass: .1,
        position: [0, 0, 0]
      });
      renderComponents();
    }
  });
  $('ledgerBattery').addEventListener('click', () => {
    const battery = components.find(c => c.kind === 'battery');
    if (battery) battery.mass = getParameters().batteryMass;
    else components.push({
      name: 'Battery',
      kind: 'battery',
      mass: getParameters().batteryMass,
      position: [0, 0, 0]
    });
    renderComponents();
  });
  $('applyComponents').addEventListener('click', () => {
    const b = ledgerPreview();
    if (!b) return;
    try {
      applyParameters({
        mass: b.mass,
        payload: 0
      });
      setCG(b.cg);
      renderCustom();
      toast('Design updated');
    } catch {
      toast('Check component values');
    }
  });

  function renderCustom() {
    const p = getParameters(),
      r = calculate(p),
      g = geometryFor(p);
    $('customCalculation').innerHTML = table(['Quantity', 'Value'], [
      ['CAD', state.model?.name || L('Built-in geometry')],
      [L('Projected area'), `${fmt(r.projectedArea,4)} m² · Cd ${fmt(p.dragCoefficient)}`],
      [L('Mass'), `${fmt(r.mass)} kg`],
      [L('Required thrust'), `${fmt(r.requiredThrust)} N`],
      [L('Available thrust'), `${fmt(r.availableThrust)} N`],
      [L('Power'), `${fmt(r.electricalPower,0)} W`],
      [L('Initial current'), `${fmt(r.current)} A`],
      [L('Quick endurance'), `${fmt(r.flightMinutes)} min`],
      [L('Propeller clearance'), g.clearance === undefined ? '—' : `${fmt(g.clearance*1000,1)} mm`],
      [L('Hover status'), L(r.feasible ? 'Within model limits' : 'Outside model limits')]
    ]);
  }
  $('recalculateCustom').addEventListener('click', renderCustom);
  $('useCustom').addEventListener('click', () => {
    applyParameters({
      dronePreset: 'custom'
    });
    $('builderPanel').hidden = false;
    setView('flight');
  });
  $('jumpCAD').addEventListener('click', () => {
    setView('flight');
    const group = $('modelFile').closest('details');
    group.open = true;
    group.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
  $('calibrateProp').addEventListener('click', () => {
    try {
      const p = getParameters(),
        r = calculate(p),
        c = calibrateProp(+$('benchThrust').value, +$('benchPower').value, +$('benchRpm').value, p
          .diameter * .0254, r.density);
      $('benchResult').textContent = `Ct ${fmt(c.ct,5)} · Cp ${fmt(c.cp,5)}`;
      if (c.ct < .02 || c.ct > .2 || c.cp < .01 || c.cp > .15) return toast(
        'Coefficients outside supported range');
      applyParameters(c);
      $('calibratedProps').checked = true;
      invalidate();
      toast('Design updated');
    } catch {
      toast('Check measurements');
    }
  });

  let missionKey = '';
  let stages = [{
      name: 'Departure',
      minutes: 2,
      speed: 3,
      altitude: 500,
      wind: 3
    }, {
      name: 'Survey',
      minutes: 8,
      speed: 0,
      altitude: 500,
      wind: 6
    }, {
      name: 'Return',
      minutes: 2,
      speed: 5,
      altitude: 500,
      wind: 6
    }],
    lastMission = null;
  $('missionView').innerHTML =
    `<header class="lab-heading"><span class="panel-label">03 / PLANNING</span><h2>${k('Plan before take-off')}</h2><p>${k('Sequential constant-demand stages. Airspeed is speed + headwind; climb energy, acceleration and route direction changes are not modelled.')}</p></header><div class="lab-card"><div id="missionRows"></div><div class="lab-actions">${button('addStage','Add stage')}${button('runMission','Calculate mission')}${button('exportMission','Export mission CSV')}</div><div id="missionResult"></div></div><div class="lab-card"><h3>${k('Wind envelope')}</h3>${button('runEnvelope','Compare five wind conditions')}<div id="envelopeResult"></div></div>`;
  const renderStages = () => {
    $('missionRows').innerHTML =
      `<div class="stage-head">${['Name','Minutes','Speed · m/s','Altitude · m','Headwind · m/s'].map(k).join('')}<span></span></div>` +
      stages.map((s, i) =>
        `<div class="stage-row"><input aria-label="${L('Name')}" data-stage="${i}" data-field="name" maxlength="60" value="${escape(s.name)}">${['minutes','speed','altitude','wind'].map((f,j)=>`<input aria-label="${L(['Minutes','Speed · m/s','Altitude · m','Headwind · m/s'][j])}" type="number" data-stage="${i}" data-field="${f}" value="${s[f]}" min="${f==='minutes'?.1:0}" max="${f==='minutes'?120:f==='altitude'?5000:40}" step=".1">`).join('')}<button type="button" class="button" data-delete-stage="${i}" aria-label="${L('Remove')}">×</button></div>`
      ).join('');
    if (!lastMission) $('missionResult').textContent = L('Recalculate after changes');
    $('missionRows').querySelectorAll('input').forEach(e => e.addEventListener('input', () => {
      stages[+e.dataset.stage][e.dataset.field] = e.dataset.field === 'name' ? e.value : +e.value;
      lastMission = null;
      $('missionResult').textContent = L('Recalculate after changes');
    }));
    $('missionRows').querySelectorAll('[data-delete-stage]').forEach(e => e.addEventListener('click',
      () => {
        if (stages.length > 1) {
          stages.splice(+e.dataset.deleteStage, 1);
          lastMission = null;
          renderStages();
        }
      }));
  };
  renderStages();
  $('addStage').addEventListener('click', () => {
    if (stages.length < 8) {
      stages.push({
        name: 'Stage',
        minutes: 1,
        speed: 0,
        altitude: getParameters().altitude,
        wind: getParameters().windSpeed
      });
      lastMission = null;
      renderStages();
    }
  });

  function renderMission() {
    if (!lastMission) return;
    $('missionResult').innerHTML =
      `<p class="result-ribbon">${L(lastMission.complete?'Within model limits':'Stopped at a model limit')} · ${fmt(lastMission.seconds/60)} min · ${fmt(lastMission.wh)} Wh · ${fmt(lastMission.soc)}%</p>` +
      table(['Stage', 'Minutes', 'Energy · Wh', 'Charge · %', 'Temperature · °C', 'Result'], lastMission
        .rows.map(r => [r.name, fmt(r.seconds / 60), fmt(r.wh), fmt(r.soc), fmt(r.temperature), L(r
          .reason)]));
  }
  $('runMission').addEventListener('click', () => {
    try {
      lastMission = missionForecast(getParameters(), stages);
      missionKey = JSON.stringify(getParameters());
      renderMission();
    } catch {
      toast('Check stage values');
    }
  });
  $('exportMission').addEventListener('click', () => {
    if (!lastMission) return toast('Calculate first');
    download('dwl-mission.csv', csvText([
      ['stage', 'seconds', 'Wh', 'SOC_percent', 'temperature_C', 'result'], ...lastMission.rows.map(
        r => [r.name, r.seconds, r.wh, r.soc, r.temperature, r.reason])
    ]), 'text/csv');
  });
  $('runEnvelope').addEventListener('click', () => {
    $('envelopeResult').innerHTML = table(['Wind · m/s', 'Power · W', 'Reserve · %', 'Quick endurance',
      'Result'
    ], scenarioSweep(getParameters()).map(r => [r.wind, fmt(r.watts), fmt(r.reserve), fmt(r.minutes) +
      ' min', L(r.feasible ? 'Within model limits' : 'Outside model limits')
    ]));
  });

  // Local projects keep user input; imported CAD meshes are deliberately not duplicated.
  let projects = read('dwl-projects', []);
  if (!Array.isArray(projects)) projects = [];
  projects = projects.slice(0, 12);
  let telemetry = [],
    lastSample = -Infinity;
  $('historyView').innerHTML =
    `<header class="lab-heading"><span class="panel-label">04 / RECORDS</span><h2>${k('Keep the useful runs')}</h2><p>${k('The flight log is held in this tab, one sample per simulated second, up to 1800 samples. Project slots store settings, components and mission stages on this device; CAD files stay separate.')}</p></header><div class="lab-card"><div class="lab-form"><label>${k('Project name')}<input id="projectName" maxlength="60" value="My drone"></label><label>${k('Saved projects')}<select id="projectSlots"></select></label></div><div class="lab-actions">${button('saveProject','Save project')}${button('loadProject','Load project')}${button('deleteProject','Delete project')}${button('exportProject','Export project')}<label class="button file-button">${k('Import project')}<input id="importProject" type="file" accept=".json"></label></div><p class="lab-note">${k('Export a file for backup; browser storage can be cleared.')}</p></div><div class="lab-card"><h3>${k('Flight log')}</h3><canvas id="telemetryCanvas" height="160" aria-label="Battery charge history"></canvas><div class="lab-actions">${button('downloadTelemetry','Download flight CSV')}${button('clearTelemetry','Clear log')}</div><output id="telemetryCount"></output></div>`;
  const projectData = () => ({
    format: 'dwl-project',
    version: 1,
    name: $('projectName').value.trim().slice(0, 60),
    parameters: {
      ...getParameters()
    },
    components: components.map(c => ({
      ...c,
      position: [...c.position]
    })),
    stages: stages.map(s => ({
      ...s
    }))
  });

  function projectList() {
    $('projectSlots').replaceChildren();
    projects.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = p.name || 'Project';
      $('projectSlots').append(o);
    });
  }
  projectList();

  function restoreProject(p) {
    if (!p || p.format !== 'dwl-project' || p.version !== 1 || !p.parameters || !Array.isArray(p.stages))
      throw Error();
    applyParameters(p.parameters, {
      complete: true,
      validateOnly: true
    });
    componentBalance(p.components);
    missionForecast(p.parameters, p.stages);
    applyParameters(p.parameters, {
      battery: true,
      complete: true
    });
    setCG(Array.isArray(p.parameters.customCG) ? p.parameters.customCG : null);
    $('removeModel').click();
    lastMission = null;
    components = p.components.map(c => ({
      ...c,
      position: [...c.position]
    }));
    stages = p.stages.map(s => ({
      ...s
    }));
    renderComponents();
    renderStages();
    renderCustom();
    toast('Project loaded');
  }
  $('saveProject').addEventListener('click', () => {
    const p = projectData(),
      i = projects.findIndex(x => x.name === p.name);
    if (i >= 0) projects[i] = p;
    else if (projects.length < 12) projects.push(p);
    else return toast('Library is full');
    if (save('dwl-projects', projects)) {
      projectList();
      toast('Saved on this device');
    } else toast('Storage unavailable');
  });
  $('loadProject').addEventListener('click', () => {
    try {
      restoreProject(projects[+$('projectSlots').value]);
    } catch {
      toast('Invalid file');
    }
  });
  $('deleteProject').addEventListener('click', () => {
    projects.splice(+$('projectSlots').value, 1);
    save('dwl-projects', projects);
    projectList();
  });
  $('exportProject').addEventListener('click', () => download('dwl-project.json', JSON.stringify(
    projectData(), null, 2), 'application/json'));
  $('importProject').addEventListener('change', async e => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 100000) throw Error();
      restoreProject(JSON.parse(await f.text()));
    } catch {
      toast('Invalid file');
    }
    e.target.value = '';
  });
  $('downloadTelemetry').addEventListener('click', () => download('dwl-flight.csv', csvText([
    ['time_s', 'SOC_percent', 'voltage_V', 'current_A', 'temperature_C', 'power_W', 'x_m', 'z_m'], ...
    telemetry
  ]), 'text/csv'));
  $('clearTelemetry').addEventListener('click', () => {
    telemetry = [];
    lastSample = -Infinity;
    drawTelemetry();
  });

  function drawTelemetry() {
    const c = $('telemetryCanvas'),
      ctx = c.getContext('2d');
    c.width = 800;
    c.height = 160;
    ctx.clearRect(0, 0, 800, 160);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    telemetry.forEach((r, i) => {
      const x = i / Math.max(1, telemetry.length - 1) * 780 + 10,
        y = 145 - r[1] * 1.3;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    $('telemetryCount').textContent = `${telemetry.length} / 1800 · SOC %`;
  }

  // Scene tools are shared between the canvas fallback and WebGL renderer.
  for (const [name, scene] of [
      ['flight', scenes[0]],
      ['airflow', scenes[1]]
    ]) {
    $(name + 'Canvas').insertAdjacentHTML('beforebegin',
      `<div class="lab-actions scene-tools"><label>${k('Camera')}<select id="${name}Camera"><option value="orbit">${L('Orbit')}</option><option value="top">${L('Top')}</option><option value="front">${L('Front')}</option><option value="side">${L('Side')}</option></select></label>${button(name+'Full','Full screen')}${button(name+'Image','Save image')}${name==='flight'?`<label><input id="explodedModel" type="checkbox">${k('Exploded housing')}</label>`:''}</div>`
    );
    $(name + 'Camera').addEventListener('change', e => {
      scene.resetCamera();
      const c = scene.camera;
      if (e.target.value === 'top') {
        c.pitch = 1.56;
        c.yaw = 0;
      }
      if (e.target.value === 'front') {
        c.pitch = .12;
        c.yaw = 0;
      }
      if (e.target.value === 'side') {
        c.pitch = .12;
        c.yaw = Math.PI / 2;
      }
      scene.staticKey = '';
    });
    $(name + 'Full').addEventListener('click', async () => {
      const panel=$(name+'View');
      if(panel.classList.contains('focus-scene')) {panel.classList.remove('focus-scene');return;}
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else {await panel.requestFullscreen();if(!document.fullscreenElement)panel.classList.add('focus-scene');}
      } catch {
        panel.classList.add('focus-scene');
      }
    });
    $(name + 'Image').addEventListener('click', () => {
      scene.captureNextFrame = () => {
        const source = $(name + 'Canvas'), output = document.createElement('canvas');
        output.width = source.width; output.height = source.height;
        const ctx = output.getContext('2d');
        if (scene.gpu && !scene.gpu.lost) ctx.drawImage(scene.gpu.canvas, 0, 0, output.width, output.height);
        ctx.drawImage(source, 0, 0);
        output.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = 'dwl-' + name + '.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      };
    });
  }
  $('explodedModel').addEventListener('change', () => {
    scenes[0].exploded = $('explodedModel').checked;
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.focus-scene').forEach(panel=>panel.classList.remove('focus-scene'));});

  // Export the sampled graph in its displayed units, with feasibility preserved.
  $('graphFormula').insertAdjacentHTML('beforebegin',
    `<div class="lab-actions">${button('graphReset','Reset range')}${button('graphBaseline','Pin baseline')}${button('clearBaseline','Clear baseline')}${button('graphCSV','Export graph CSV')}<label><input id="graphTableToggle" type="checkbox">${k('Data table')}</label></div><div id="graphTable" hidden></div><p class="lab-note">${k('Red shading marks samples outside hover limits. The dashed line is a frozen baseline. Click the plot to apply its X value; use the table for exact samples.')}</p>`
  );
  let graphKey = '';
  const updateGraphTable = () => {
    const a = graphRenderer.layout?.points || [];
    $('graphTable').innerHTML = table(['X', 'Y', 'Result'], a.map(p => [fmt(p.x, 3), fmt(p.y, 3), L(p.result
      .feasible ? 'Within model limits' : 'Outside model limits')]));
  };
  $('graphReset').addEventListener('click', () => {
    graphRangeFor($('graphVariable').value);
    state.graphDirty = true;
  });
  $('graphBaseline').addEventListener('click', () => {
    graphRenderer.baseline = graphRenderer.layout?.points.map(p => ({
      ...p
    })) || [];
    graphKey = $('graphVariable').value + '|' + $('graphMetric').value;
    state.graphDirty = true;
    toast('Baseline pinned');
  });
  $('clearBaseline').addEventListener('click', () => {
    graphRenderer.baseline = null;
    state.graphDirty = true;
  });
  for (const id of ['graphVariable', 'graphMetric']) $(id).addEventListener('change', () => {
    graphRenderer.baseline = null;
  });
  $('graphTableToggle').addEventListener('change', () => {
    $('graphTable').hidden = !$('graphTableToggle').checked;
    updateGraphTable();
  });
  $('graphCSV').addEventListener('click', () => {
    const rows = graphRenderer.layout?.points || [];
    download('dwl-graph.csv', csvText([
      [$('graphVariable').value + ' (' + api.graphUnit($('graphVariable').value, false) + ')', $(
          'graphMetric').value + ' (' + api.graphUnit($('graphMetric').value, true) + ')',
        'hover_feasible'
      ], ...rows.map(p => [p.x, p.y, p.result.feasible])
    ]), 'text/csv');
  });
  $('graphCanvas').addEventListener('click', e => {
    const n = graphRenderer.nearest(e.clientX);
    if (!n) return;
    const id = $('graphVariable').value;
    try {
      applyParameters({
        [id]: api.fromGraph(n.point.x, id)
      });
      toast('Design updated');
    } catch {
      toast('Value outside control range');
    }
  });
  $('graphCanvas').addEventListener('wheel', e => {
    e.preventDefault();
    const a = +$('graphFrom').value,
      b = +$('graphTo').value,
      m = (a + b) / 2,
      f = e.deltaY > 0 ? 1.2 : .8;
    $('graphFrom').value = m + (a - m) * f;
    $('graphTo').value = m + (b - m) * f;
    state.graphDirty = true;
  }, {
    passive: false
  });

  // Flow controls: auto update can be disabled without discarding a completed field.
  $('airflowCanvas').insertAdjacentHTML('beforebegin',
    `<div class="lab-actions flow-run"><label><input id="flowAuto" type="checkbox" checked>${k('Auto calculate')}</label>${button('flowRun','Calculate flow')}${button('flowCancel','Cancel calculation')}${button('flowProbeCSV','Export probe grid')}<label>${k('Slice')}<select id="slicePlane"><option value="xz">XZ</option><option value="xy">XY</option><option value="yz">YZ</option></select></label>${number('sliceOffset','Slice offset · m',0,-2,2,.02)}${button('drawSlice','Update slice')}</div><canvas id="sliceCanvas" width="480" height="240" class="slice-canvas" hidden aria-label="Flow speed slice"></canvas><output id="sliceStatus" class="lab-note"></output>`
  );
  $('flowAuto').addEventListener('change', () => {
    scenes[1].manualCFD = !$('flowAuto').checked;
    if ($('flowAuto').checked) scenes[1].cfd.desiredKey = '';
  });
  $('flowRun').addEventListener('click', () => {
    setView('airflow');
    if (scenes[1].cfd.fieldKey === scenes[1].cfd.desiredKey && scenes[1].pendingCFD) {
      scenes[1].continueCFD();
    } else {
      scenes[1].requestedSolve = true;
      scenes[1].cfd.desiredKey = '';
    }
  });
  $('flowCancel').addEventListener('click', () => {
    $('flowAuto').checked = false;
    scenes[1].manualCFD = true;
    scenes[1].cancelCFD();
    toast('Calculation cancelled');
  });

  function sliceSamples() {
    const f = scenes[1].cfd.field;
    if (!f || scenes[1].cfd.fieldKey !== scenes[1].cfd.desiredKey) throw Error();
    const scale = f.stats.worldScale,
      plane = $('slicePlane').value,
      offset = +$('sliceOffset').value;
    if (!Number.isFinite(offset) || Math.abs(offset) > 2) throw Error();
    const points = [];
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 48; x++) {
        const u = (x / 47 - .5) * 2,
          v = (.5 - y / 23) * 1;
        const pos = plane === 'xz' ? [u, offset, v] : plane === 'xy' ? [u, v, offset] : [offset, v, u];
        const s = sampleField(pos.map(v => v / scale), f);
        points.push({
          x,
          y,
          pos,
          s
        });
      }
    return points;
  }
  $('drawSlice').addEventListener('click', () => {
    try {
      const samples = sliceSamples(),
        c = $('sliceCanvas'),
        ctx = c.getContext('2d'),
        max = Math.max(1, ...samples.map(p => p.s?.speed || 0));
      c.hidden = false;
      samples.forEach(p => {
        ctx.fillStyle = p.s ? `hsl(${225-225*p.s.speed/max} 78% 53%)` : '#15202a';
        ctx.fillRect(p.x * 10, p.y * 10, 10, 10);
      });
      $('sliceStatus').textContent =
        `${L('Speed slice')} · 0…${fmt(max)} m/s · ${L('Dark cells: solid or outside domain')}`;
    } catch {
      toast('Calculate current flow first');
    }
  });
  $('flowProbeCSV').addEventListener('click', () => {
    try {
      const samples = sliceSamples();
      download('dwl-flow-probes.csv', csvText([
        ['x_m', 'y_m', 'z_m', 'speed_m_s', 'pressure_Pa', 'vorticity_s-1'], ...samples.map(p => [...
          p.pos, p.s?.speed ?? '', p.s?.pressure ?? '', p.s?.vorticity ?? ''
        ])
      ]), 'text/csv');
    } catch {
      toast('Calculate current flow first');
    }
  });

  function refreshLanguage() {
    $('controlSearch').setAttribute('aria-label', L('Find a parameter'));
    $('telemetryCanvas').setAttribute('aria-label', L('Battery charge history'));
    $('sliceCanvas').setAttribute('aria-label', L('Flow speed slice'));
    renderComponents();
    renderStages();
    for (const id of ['labTheme', 'flightCamera', 'airflowCamera'])
      for (const o of $(id).options) {
        const key = o.dataset.label || o.textContent;
        o.dataset.label = key;
        const original = ['graphite', 'polar', 'sand', 'rose'].includes(o.value) ? ({
          graphite: 'Graphite',
          polar: 'Polar',
          sand: 'Sand',
          rose: 'Rose'
        })[o.value] : ({
          orbit: 'Orbit',
          top: 'Top',
          front: 'Front',
          side: 'Side'
        })[o.value];
        o.textContent = L(original || key);
      }
    document.querySelectorAll('[data-lab-text]').forEach(el => el.textContent = L(el.dataset.labText));
    $('controlSearch').placeholder = L('Find a parameter');
    renderCustom();
    renderMission();
    if ($('envelopeResult').textContent) $('runEnvelope').click();
    $('sliceStatus').textContent = '';
    $('labToast').hidden = true;
    previewPack();
    projectList();
    if (!$('graphTable').hidden) updateGraphTable();
  }
  document.addEventListener('languagechange', refreshLanguage);
  refreshLanguage();
  let lastUI = -Infinity;
  return {
    tick(now) {
      if (state.t < lastSample) {
        telemetry = [];
        lastSample = -Infinity;
      }
      if (state.t - lastSample >= 1 && state.batteryActual) {
        const c = state.batteryActual;
        telemetry.push([state.t, state.battery.soc, c.terminalVoltage, c.current, state.battery.temperature, c
          .deliveredPower, state.x, state.y
        ]);
        if (telemetry.length > 1800) telemetry.shift();
        lastSample = state.t;
        if (state.activeView === 'history') drawTelemetry();
      }
      if (now - lastUI > 1000) {
        lastUI = now;
        if (lastMission && missionKey !== JSON.stringify(getParameters())) {
          lastMission = null;
          $('missionResult').textContent = L('Recalculate after changes');
        }
        if (state.activeView === 'history') drawTelemetry();
        if (state.activeView === 'engineering') renderCustom();
        if (state.activeView === 'graph' && !$('graphTable').hidden) updateGraphTable();
      }
    },
    refreshLanguage
  };
}
