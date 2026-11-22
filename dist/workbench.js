import {
  gridIdentity,
  compareGridResults
} from "./cfd-diagnostics.js";
import {
  inputNumber,
  validateMissionStages
} from "./calculation-tools.js";
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
  altitudeEnvelope,
  cgMotorLoads,
  cgAllocation,
  csvText
} from './engineering.js';
import {
  calculate,
  rotorPlanPositions
} from './physics.js';
import {
  drawLineChart,
  stepDigits
} from './lab-chart.js';
import {
  toDisplay,
  unitSpec
} from './units.js';
import {
  geometryFor
} from './drone-builder.js';
import {
  sampleField
} from './flow-lines.js';
import {
  labText
} from './workbench-language.js';
import {
  installLab094
} from './lab-094.js';
import {
  installLab095
} from './lab-095.js';
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
    activityLoop,
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
  // 0.92: values follow the selected unit system and language; plain electrical units are translated.
  const units = () => api.getUnitSystem?.() || 'metric';
  const qty = (value, kind, digits = 2) =>
    `${fmt(toDisplay(value, kind, units()), digits)} ${unitSpec(kind, units()).label}`;
  const unitLabel = kind => unitSpec(kind, units()).label;
  const clock = seconds => {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
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
    tab.tabIndex = -1;
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
  document.querySelector('.simulation-actions').insertAdjacentHTML('afterbegin',
    `<label class="unit-control">${k('Calculation activity')}<select id="activityMode"><option value="visible">${L('Visible tab')}</option><option value="focused">${L('Site has focus')}</option><option value="background">${L('Allow background')}</option></select></label>`
    );
  function renderActivity(){
    const phase=activityLoop.getState();
    $('activityState').textContent=L(phase.reason==='waiting'||phase.reason==='frozen'?'Waiting for activity':phase.reason==='background'?'Calculating in background':'Calculations active');
    $('activityState').dataset.phase=phase.reason;
  }
  $('activityMode').value = activityLoop.getState().mode;
  $('activityMode').addEventListener('change', () => activityLoop.setMode($('activityMode').value));
  document.querySelector('.mode-tabs').insertAdjacentHTML('afterend',
    `<div class="activity-strip"><output id="activityState" role="status"></output><span>${k('Background work can be throttled or frozen by your browser. Returning does not fast-forward the flight.')}</span></div>`
    );
  document.querySelector('.release-notice').innerHTML =
    `<div><span class="version-orbit">.95</span><div>${k('Active configuration')}<small>${k('Geometry, power and airflow')}</small></div></div><div class="release-tags">CAD · ENERGY · CFD</div>`;
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
    document.querySelectorAll('[data-tone]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset
      .tone === value)));
    state.graphDirty = true;
    scenes.forEach(s => {
      s.refreshPalette();
    });
  };
  // Scene palette is refreshed by the renderers on a theme change.
  try {
    theme(localStorage.getItem('dwl-theme') || 'graphite');
  } catch {}
  $('labTheme').insertAdjacentHTML('afterend',
    `<div class="tone-chips" role="group" aria-label="${L('Theme')}">${['graphite','polar','sand','rose'].map(v=>`<button type="button" data-tone="${v}" aria-pressed="${String(v===document.documentElement.dataset.theme)}" title="${v}" aria-label="${v}"><i></i></button>`).join('')}</div>`
    );
  document.querySelectorAll('[data-tone]').forEach(b => b.addEventListener('click', () => theme(b.dataset
    .tone)));
  $('labTheme').addEventListener('change', e => theme(e.target.value));
  let searchStates = null;
  $('controlSearch').addEventListener('input', () => {
    const q = $('controlSearch').value.toLocaleLowerCase().trim(),
      groups = [...document.querySelectorAll('.control-group')];
    if (q && !searchStates) searchStates = groups.map(g => g.open);
    groups.forEach((g, i) => {
      g.hidden = !!q && !g.textContent.toLocaleLowerCase().includes(q);
      if (q && !g.hidden) g.open = true;
      else if (!q && searchStates) g.open = searchStates[i];
    });
    if (!q) searchStates = null;
  });
  $('collapseControls').addEventListener('click', () => {
    const groups = [...document.querySelectorAll('.control-group')].filter(g => !g.hidden),
      expand = groups.every(g => !g.open);
    groups.forEach(g => g.open = expand);
    $('collapseControls').innerHTML = k(expand ? 'Collapse panels' : 'Expand panels');
  });

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
    series: inputNumber($('packSeries').value),
    parallel: inputNumber($('packParallel').value),
    cellMah: inputNumber($('packMah').value),
    cellOhm: inputNumber($('packR').value) / 1000,
    cellMass: inputNumber($('packMass').value) / 1000,
    cRating: inputNumber($('packC').value)
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
  const listPacks = (name = ([...packExamples, ...packs][+$('packLibrary').value])?.name) => {
    $('packLibrary').replaceChildren();
    const draft = document.createElement('option');
    draft.value = '';
    draft.textContent = L('Custom draft');
    $('packLibrary').append(draft);
    [...packExamples, ...packs].forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = p.name;
      $('packLibrary').append(o);
    });
    const index = [...packExamples, ...packs].findIndex(p => p.name === name);
    $('packLibrary').value = index >= 0 ? String(index) : '';
  };
  listPacks();
  populatePack(packExamples[0]);
  $('packLibrary').addEventListener('change', () => {
    if ($('packLibrary').value !== '') populatePack([...packExamples, ...packs][+$('packLibrary').value]);
  });
  for (const id of ['packName', 'packChem', 'packSeries', 'packParallel', 'packMah', 'packR', 'packMass',
      'packC'
    ]) $(id).addEventListener('input', () => {
    $('packLibrary').value = '';
    previewPack();
  });
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
      listPacks(p.name);
      toast('Saved on this device');
    } else toast('Storage unavailable');
  });
  $('deletePack').addEventListener('click', () => {
    const i = inputNumber($('packLibrary').value) - packExamples.length;
    if (!Number.isInteger(i) || i < 0 || i >= packs.length) return toast('Select a saved profile');
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
      $('packLibrary').value = '';
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
    `<header class="lab-heading"><span class="panel-label">01 / ENGINEERING</span><h2>${k('Your geometry. Your numbers.')}</h2><p>${k('CAD supplies dimensions and a silhouette. Enter mass and Cd from your design or measurements.')}</p></header><div class="lab-card"><h3>${k('Component ledger')}</h3><p>${k('Positions are X / Y / Z in mm, Y up. Include the battery once. Applying this ledger sets payload to zero.')}</p><div id="componentRows"></div><div class="lab-actions">${button('addComponent','Add component')}${button('ledgerBattery','Use installed battery mass')}${button('applyComponents','Apply mass and centre of gravity')}</div><output id="componentSummary" class="result-ribbon"></output><div id="componentLoads" class="cg-loads" aria-live="polite"></div><p class="lab-note">${k('Inertia uses point masses about the centre of gravity; component shape inertia and attitude control are not solved.')} ${k('Motor shares solve the mixer for this centre of gravity: total thrust equals weight, roll and pitch moments cancel, yaw torque stays zero. They use the selected RPM and current wind.')}</p></div><div class="lab-card"><h3>${k('Independent design calculation')}</h3><div id="customCalculation"></div><div class="lab-actions">${button('recalculateCustom','Calculate design')}${button('useCustom','Open frame builder')}${button('jumpCAD','Open CAD controls')}</div><p>${k('Uses configured initial charge and healthy motors, separately from the live flight. Enable CAD projected area in the CAD controls to use the measured silhouette.')}</p></div><div class="lab-card"><h3>${k('Propeller bench data')}</h3><div class="lab-form">${number('benchThrust','Thrust per motor · N',8,.01,1000,.1)}${number('benchPower','Shaft power per motor · W',100,.1,10000,.1)}${number('benchRpm','Measured RPM',4800,1,28000,10)}</div>${button('calibrateProp','Calculate Ct / Cp')}<output id="benchResult" class="result-ribbon"></output><p class="lab-note">${k('Use shaft power, not electrical input. Coefficients apply to this operating point; they do not fit a full propeller map.')}</p></div>`;

  function renderComponents() {
    // 0.92: column headings and the mass share of each part.
    $('componentRows').innerHTML =
      `<div class="component-head" aria-hidden="true">${['Name', 'Mass · kg', 'X · mm', 'Y · mm (up)', 'Z · mm', 'Share'].map(k).join('')}<span></span></div>` +
      components.map((c, i) =>
      `<div class="component-row"><input aria-label="${L('Name')}" data-component="${i}" data-field="name" value="${escape(c.name)}" maxlength="50"><input aria-label="${L('Mass · kg')}" type="number" data-component="${i}" data-field="mass" value="${c.mass}" min=".001" max="30" step=".01">${c.position.map((v,j)=>`<input aria-label="${['X','Y','Z'][j]} mm" type="number" data-component="${i}" data-field="${j}" value="${v}" min="-2000" max="2000" step="1">`).join('')}<output class="component-share" data-share="${i}"></output><button type="button" class="button" data-remove="${i}" aria-label="${L('Remove')}">×</button></div>`
    ).join('');
    $('componentRows').querySelectorAll('input').forEach(el => el.addEventListener('input', () => {
      const c = components[+el.dataset.component],
        f = el.dataset.field;
      if (f === 'name') c.name = el.value;
      else if (f === 'mass') c.mass = inputNumber(el.value);
      else c.position[+f] = inputNumber(el.value);
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
    let b;
    try {
      b = componentBalance(components);
    } catch {
      $('componentSummary').textContent = L('Check component values');
      $('componentLoads').replaceChildren();
      $('componentRows').querySelectorAll('[data-share]').forEach(o => o.textContent = '');
      return null;
    }
    $('componentSummary').textContent =
      `${qty(b.mass, 'kg')} · ${L('CG')} ${b.cg.map(v=>fmt(toDisplay(v*1000, 'mm', units()),1)).join(' / ')} ${unitLabel('mm')} · Ixx/Iyy/Izz ${b.inertia.map(v=>fmt(v,5)).join(' / ')} ${L('kg·m²')}`;
    $('componentRows').querySelectorAll('[data-share]').forEach(o => {
      o.textContent = `${fmt(components[+o.dataset.share].mass / b.mass * 100, 1)}%`;
    });
    renderLoads(b);
    return b;
  }

  // 0.92: what the centre of gravity offset means for each motor.
  function renderLoads(b) {
    const box = $('componentLoads');
    try {
      const p = getParameters(),
        q = {
          ...p,
          mass: b.mass,
          payload: 0,
          customCG: b.cg
        },
        positions = rotorPlanPositions(q),
        // 0.93.1: the motors as they are now (damage and temperature), so a failed motor counts as failed.
        live = positions.length === state.motorHealths.length ? {
          motorHealths: state.motorHealths,
          motorTemps: state.motorTemps
        } : {},
        r = calculate(q, live),
        loads = cgMotorLoads([b.cg[0], b.cg[2]], positions),
        average = r.requiredThrust / positions.length,
        needs = loads.shares.map(s => average * s),
        worstIndex = needs.reduce((best, need, i) => need / Math.max(1e-9, r.thrusts[i]) > needs[best] / Math.max(
          1e-9, r.thrusts[best]) ? i : best, 0),
        maxIndex = loads.shares.indexOf(loads.max),
        minIndex = loads.shares.indexOf(loads.min);
      const percent = v => Math.abs(v) < .05 ? '0%' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v), 1)}%`;
      let tone = 'ok',
        message = L('Every motor stays within the thrust available at the selected RPM.');
      if (loads.min < 0) {
        tone = 'danger';
        message = L('The centre of gravity is outside the motor footprint: one motor would need negative thrust.');
      } else if (needs[worstIndex] > r.thrusts[worstIndex]) {
        tone = 'danger';
        message =
          `${L('Not enough thrust')}: M${worstIndex + 1} ${L('needs')} ${qty(needs[worstIndex], 'force')} ${L('of')} ${qty(r.thrusts[worstIndex], 'force')} ${L('available at the selected RPM')}.`;
      }
      const even = loads.max - loads.min < 5e-4;
      // 0.93.1: when a motor would need more than it has (or negative thrust), clamp it and show what is left over.
      const caps = r.thrusts.map((t, i) => (live.motorHealths?.[i] ?? 1) < .18 ? 0 : t / Math.max(1e-9, average)),
        limited = caps.some((cap, i) => loads.shares[i] > cap + 1e-9) || loads.min < 0;
      let limitedHtml = '';
      if (limited) {
        const a = cgAllocation([b.cg[0], b.cg[2]], positions, caps, r.requiredThrust),
          balanced = a.momentResidual < 5e-3 && a.thrustError > -.01;
        limitedHtml =
          `<p class="cg-status" data-tone="${balanced ? 'ok' : 'danger'}">${escape(L('With motor limits'))}: ${a.saturated.map(i => `M${i + 1} ${a.shares[i] <= 1e-9 ? '= 0' : escape(L('at its limit'))}`).join(', ') || escape(L('no motor at a limit'))} · ${escape(L('lift'))} ${fmt(100 + a.thrustError * 100, 1)}% ${escape(L('of weight'))} · ${escape(L('unbalanced moment'))} ${fmt(a.momentResidual, 3)} ${escape(L('N·m'))}${Math.abs(a.yawError) > .01 ? ` · ${escape(L('yaw not held'))}` : ''}. ${escape(L(balanced ? 'Balance is still reached.' : 'The drone cannot hold this attitude: it will tilt, sink or spin.'))}</p>`;
      }
      box.innerHTML =
        `<p class="cg-line">${escape(L('CG offset in the rotor plane'))}: <strong>${escape(qty(loads.offset * 1000, 'mm', 1))}</strong> · ${even ? escape(L('all motors carry the same thrust')) : `${escape(L('most loaded'))} M${maxIndex + 1}: <strong>${escape(percent((loads.max - 1) * 100))}</strong> · ${escape(L('least loaded'))} M${minIndex + 1}: <strong>${escape(percent((loads.min - 1) * 100))}</strong> ${escape(L('of average thrust'))}`}</p>` +
        `<div class="cg-bars">${loads.shares.map((s, i) => `<span title="M${i + 1}"><i style="height:${Math.round(Math.max(2, Math.min(64, s / Math.max(1.5, loads.max) * 64)))}px"></i><b>M${i + 1}</b><small>${escape(fmt(s * 100, 0))}%</small></span>`).join('')}</div>` +
        `<p class="cg-status" data-tone="${tone}">${escape(message)}</p>` + limitedHtml;
    } catch {
      box.replaceChildren();
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
    // 0.92: built-in presets also get a clearance: gap between neighbouring propeller tips on the frame circle.
    const clearance = Number.isFinite(g.clearance) ? g.clearance : p.frameSize / 1000 * Math.sin(Math.PI / p
      .rotors) - p.diameter * .0254;
    $('customCalculation').innerHTML = table(['Quantity', 'Value'], [
      ['CAD', state.model?.name || L('Built-in geometry')],
      [L('Projected area'), `${qty(r.projectedArea, 'area', 4)} · Cd ${fmt(p.dragCoefficient)}`],
      [L('Mass'), qty(r.mass, 'kg')],
      [L('Required thrust'), qty(r.requiredThrust, 'force')],
      [L('Available thrust'), qty(r.availableThrust, 'force')],
      [L('Power'), `${fmt(r.electricalPower,0)} ${L('W')}`],
      [L('Initial current'), `${fmt(r.current)} ${L('A')}`],
      [L('Quick endurance'), r.feasible ? `${fmt(r.flightMinutes)} ${L('min')}` : '—'],
      [L('Propeller clearance'), Number.isFinite(clearance) ?
        `${qty(clearance * 1000, 'mm', 1)}${clearance < 0 ? ' · ' + L('propellers overlap') : ''}` : '—'],
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
        c = calibrateProp(inputNumber($('benchThrust').value), inputNumber($('benchPower').value),
          inputNumber($('benchRpm').value), p
          .diameter * .0254, r.density);
      $('benchResult').textContent = `Ct ${fmt(c.ct,5)} · Cp ${fmt(c.cp,5)}`;
      if (c.ct < .02 || c.ct > .2 || c.cp < .01 || c.cp > .15) return toast(
        'Coefficients outside supported range');
      applyParameters({
        ...c,
        propEfficiency: 100
      });
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
    `<header class="lab-heading"><span class="panel-label">03 / PLANNING</span><h2>${k('Plan before take-off')}</h2><p>${k('Sequential constant-demand stages. Airspeed is speed + headwind; climb energy, acceleration and route direction changes are not modelled.')}</p></header><div class="lab-card"><div id="missionRows"></div><div class="lab-actions">${button('addStage','Add stage')}${button('runMission','Calculate mission')}${button('exportMission','Export mission CSV')}</div><div id="missionResult"></div><canvas id="missionCanvas" class="lab-chart" hidden aria-label="${L('Charge during the mission')}"></canvas></div><div class="lab-card"><h3>${k('Wind envelope')}</h3>${button('runEnvelope','Compare five wind conditions')}<div id="envelopeResult"></div></div><div class="lab-card"><h3>${k('Altitude ceiling')}</h3><p>${k('Finds the highest altitude where the drone can still hover with the current mass, battery, selected RPM and wind. Air pressure follows the barometric formula.')}</p><div class="lab-form"><label>${k('Air temperature')}<select id="ceilingTemperature"><option value="standard">${L('Standard atmosphere · −6.5 °C per km')}</option><option value="settings">${L('As in the settings')}</option></select></label>${number('ceilingMargin','Required thrust reserve · %',30,0,200,5)}${number('ceilingMax','Search up to · m',6000,1000,8000,500)}</div>${button('runCeiling','Find ceiling','class="button-primary"')}<output id="ceilingResult" class="result-ribbon" hidden></output><canvas id="ceilingCanvas" class="lab-chart" hidden aria-label="${L('Thrust reserve versus altitude')}"></canvas><div id="ceilingTable"></div><p class="lab-note">${k('A higher RPM command can raise the ceiling while motor power allows. Battery temperature stays as configured; climb energy and icing at altitude are not modelled.')}</p></div>`;
  const renderStages = () => {
    $('missionRows').innerHTML =
      `<div class="stage-head">${['Name','Minutes','Speed · m/s','Altitude · m','Headwind · m/s'].map(k).join('')}<span></span></div>` +
      stages.map((s, i) =>
        `<div class="stage-row"><input aria-label="${L('Name')}" data-stage="${i}" data-field="name" maxlength="60" value="${escape(s.name)}">${['minutes','speed','altitude','wind'].map((f,j)=>`<input aria-label="${L(['Minutes','Speed · m/s','Altitude · m','Headwind · m/s'][j])}" type="number" data-stage="${i}" data-field="${f}" value="${s[f]}" min="${f==='minutes'?.1:0}" max="${f==='minutes'?120:f==='altitude'?5000:40}" step=".1">`).join('')}<button type="button" class="button" data-delete-stage="${i}" aria-label="${L('Remove')}">×</button></div>`
      ).join('');
    if (!lastMission) staleMission();
    $('missionRows').querySelectorAll('input').forEach(e => e.addEventListener('input', () => {
      stages[+e.dataset.stage][e.dataset.field] = e.dataset.field === 'name' ? e.value : inputNumber(e
        .value);
      lastMission = null;
      staleMission();
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

  // 0.92: readable stop reasons; the CSV keeps the codes.
  const reasonLabel = code => L({
    complete: 'complete',
    reserve: 'charge reserve reached',
    'flight-limit': 'flight limit',
    'power-limit': 'power limit'
  } [code] || code);

  function staleMission() {
    $('missionResult').textContent = L('Recalculate after changes');
    $('missionCanvas').hidden = true;
  }

  function renderMission() {
    if (!lastMission) return;
    const m = lastMission,
      reserve = missionReserve;
    // 0.92: what is left after the plan, or where the plan stops.
    let verdict;
    if (m.complete && m.margin) {
      const capped = m.margin.reason === 'complete';
      verdict =
        `${L('After the plan')}: ${fmt(m.soc, 1)}% · ${L('remaining in last-stage conditions until the reserve')} ${fmt(reserve, 0)}%: ${capped ? L('more than') + ' ' : '≈ '}${fmt(m.margin.seconds / 60, 1)} ${L('min')}` +
        (m.margin.reason === 'reserve' || capped ? '' : ` (${L('then')}: ${reasonLabel(m.margin.reason)} ${L('at')} ${fmt(m.margin.soc, 1)}%)`);
    } else {
      const stop = m.rows.at(-1);
      verdict =
        `${L('The plan stops in stage')} «${stop?.name || ''}» ${L('after')} ${fmt((stop?.seconds || 0) / 60, 1)} ${L('min')}: ${reasonLabel(stop?.reason || 'flight-limit')}`;
    }
    $('missionResult').innerHTML =
      `<p class="result-ribbon">${escape(L(m.complete?'Within model limits':'Stopped at a model limit'))} · ${fmt(m.seconds/60)} ${escape(L('min'))} · ${escape(qty(m.distanceM, 'm', 0))} · ${fmt(m.wh)} ${escape(L('Wh'))} · ${fmt(m.soc)}%</p>` +
      `<p class="mission-verdict" data-tone="${m.complete ? 'ok' : 'danger'}">${escape(verdict)}</p>` +
      (m.motorLoad > 100 ?
        `<p class="mission-verdict" data-tone="danger">${escape(L('Motors run above their rating'))} (${escape(L('up to'))} ${fmt(m.motorLoad, 0)}%): ${escape(L('a long flight will overheat them. Check the test stand or use stronger motors.'))}</p>` :
        '') +
      table(['Stage', 'Minutes', 'Distance', 'Energy · Wh', 'Charge · %', 'Temperature', 'Motors · % of rating',
        'Result'
      ], m.rows.map(r => [r.name, fmt(r.seconds / 60), qty(r.distanceM, 'm', 0), fmt(r.wh), fmt(r.soc), qty(r
        .temperature, 'temperature', 1), fmt(r.motorLoad, 0), reasonLabel(r.reason)]));
    drawMission();
  }

  function drawMission() {
    const m = lastMission,
      canvas = $('missionCanvas');
    if (!m || state.activeView !== 'mission') return;
    canvas.hidden = false;
    let end = 0;
    const boundaries = m.rows.map(r => ({
      x: (end += r.seconds) / 60,
      label: ''
    }));
    boundaries.forEach((b, i) => b.label = String(m.rows[i].name || i + 1).slice(0, 14));
    const plan = m.trace.map(p => ({
        x: p.seconds / 60,
        y: p.soc
      })),
      extra = m.margin?.trace?.length ? [plan.at(-1), ...m.margin.trace.map(p => ({
        x: p.seconds / 60,
        y: p.soc
      }))] : [];
    drawLineChart(canvas, {
      series: [{
        points: plan
      }, {
        points: extra,
        dashed: true,
        tone: 'blue'
      }],
      yMin: 0,
      yMax: 100,
      yLabel: L('Charge · %'),
      xLabel: `${L('time')} · ${L('min')}`,
      xFormat: v => fmt(v, 1),
      yFormat: v => fmt(v, 0),
      hLines: [{
        y: missionReserve,
        label: `${L('reserve')} ${fmt(missionReserve, 0)}%`,
        align: 'left'
      }],
      vLines: [{
        x: 0,
        label: String(m.rows[0]?.name || '').slice(0, 14)
      }, ...boundaries.slice(0, -1).map((b, i) => ({
        x: b.x,
        label: String(m.rows[i + 1]?.name || '').slice(0, 14)
      }))],
      empty: L('Calculate first')
    });
  }
  let missionReserve = 15;
  $('runMission').addEventListener('click', () => {
    try {
      lastMission = missionForecast(getParameters(), stages);
      missionReserve = getParameters().reserveCharge ?? 15;
      missionKey = JSON.stringify(getParameters());
      renderMission();
    } catch {
      toast('Check stage values');
    }
  });
  $('exportMission').addEventListener('click', () => {
    if (!lastMission) return toast('Calculate first');
    download('dwl-mission.csv', csvText([
      ['stage', 'seconds', 'distance_m', 'Wh', 'SOC_percent', 'temperature_C', 'motor_load_percent_of_rating',
        'result'
      ], ...lastMission.rows.map(
        r => [r.name, r.seconds, r.distanceM, r.wh, r.soc, r.temperature, r.motorLoad, r.reason]),
      ...(lastMission.margin ? [
        ['after plan, last stage conditions', lastMission.margin.seconds, '', '', lastMission.margin.soc, '', '',
          lastMission.margin.reason
        ]
      ] : [])
    ]), 'text/csv');
  });

  // 0.92: altitude ceiling.
  let lastCeiling = null;
  const limitText = {
    thrust: 'not enough thrust at the selected RPM',
    power: 'motor power or maximum RPM',
    tilt: 'tilt limit in this wind',
    battery: 'battery current or voltage',
    controller: 'controller supply voltage',
    updraft: 'updraft larger than weight',
    margin: 'thrust reserve below the required margin',
    other: 'model limit',
    none: 'Within model limits'
  };
  function renderCeiling() {
    const e = lastCeiling;
    if (!e) return;
    const describe = c => c.above ? `${L('above')} ${qty(e.maxAltitude, 'm', 0)} (${L('checked range')})` : c.below ?
      `${L('not even at')} ${qty(0, 'm', 0)} (${L(limitText[c.limit] || c.limit)})` :
      `${qty(c.altitude, 'm', 0)} (${L('limit')}: ${L(limitText[c.limit] || c.limit)})`;
    $('ceilingResult').hidden = false;
    $('ceilingResult').innerHTML =
      `<strong>${escape(L('Hover ceiling'))}:</strong> ${escape(describe(e.hover))}<br><strong>${escape(L('With thrust reserve'))} ≥ ${fmt(e.reserveMargin, 0)}%:</strong> ${escape(describe(e.margin))}` +
      // 0.93.1: the settings the result belongs to, so it can be reproduced.
      `<br><small>${escape(L('Altitude above sea level. Settings used'))}: ${escape(qty(e.settings.mass, 'kg'))} + ${escape(qty(e.settings.payload, 'kg'))} · ${fmt(e.settings.voltage, 1)} ${escape(L('V'))} ${fmt(e.settings.capacity, 0)} ${escape(L('mAh'))} · ${escape(L('propeller'))} ${fmt(e.settings.diameter, 1)}″ · ${fmt(e.settings.rpm, 0)} RPM · ${escape(L('wind'))} ${escape(qty(e.settings.windSpeed, 'speed', 1))} · ${escape(L(e.temperature === 'standard' ? 'Standard atmosphere · −6.5 °C per km' : 'As in the settings'))}</small>`;
    const tableStep = e.maxAltitude <= 3000 ? 250 : 500;
    $('ceilingTable').innerHTML = table(['Altitude', 'Air temperature', 'Density', 'Power · W',
      'Thrust reserve · %', 'Quick endurance', 'Result'
    ], e.rows.filter(r => Math.abs(r.altitude / tableStep - Math.round(r.altitude / tableStep)) < 1e-9 || r
      .altitude === e.maxAltitude).map(r => [qty(r.altitude, 'm', 0), qty(r.temperature, 'temperature', 1),
      qty(r.density, 'density', 3), fmt(r.watts, 0), fmt(r.reserve, 1),
      r.feasible ? `${fmt(r.minutes, 1)} ${L('min')}` : '—',
      L(limitText[r.limit] || r.limit) + (r.feasible && r.overload ? ` · ${L('motors above rating')} (${fmt(r.motorLoad, 0)}%)` : '')
    ]));
    drawCeiling();
  }

  function drawCeiling() {
    const e = lastCeiling;
    if (!e || state.activeView !== 'mission') return;
    $('ceilingCanvas').hidden = false;
    const x = h => toDisplay(h, 'm', units());
    const marks = [e.hover, e.margin].filter(c => !c.above && !c.below);
    drawLineChart($('ceilingCanvas'), {
      series: [{
        points: e.rows.map(r => ({
          x: x(r.altitude),
          y: r.reserve
        }))
      }],
      bands: e.rows.slice(1).filter(r => !r.feasible).map((r, i) => ({
        x0: x(e.rows[e.rows.indexOf(r) - 1].altitude),
        x1: x(r.altitude)
      })),
      hLines: [{
        y: e.reserveMargin,
        label: `${fmt(e.reserveMargin, 0)}%`
      }, {
        y: 0,
        tone: 'danger'
      }],
      vLines: marks.map(c => ({
        x: x(c.altitude),
        label: qty(c.altitude, 'm', 0)
      })),
      yLabel: L('Thrust reserve · %'),
      xLabel: `${L('Altitude')} · ${unitLabel('m')}`,
      xFormat: v => fmt(v, 0),
      yFormat: v => fmt(v, 0)
    });
  }
  let ceilingKey = '';
  const staleCeiling = () => {
    lastCeiling = null;
    $('ceilingResult').hidden = false;
    $('ceilingResult').textContent = L('Recalculate after changes');
    $('ceilingCanvas').hidden = true;
    $('ceilingTable').replaceChildren();
  };
  for (const id of ['ceilingTemperature', 'ceilingMargin', 'ceilingMax']) $(id).addEventListener('input', () => {
    if (lastCeiling) staleCeiling();
  });
  $('runCeiling').addEventListener('click', () => {
    try {
      ceilingKey = JSON.stringify(getParameters());
      const used = getParameters();
      lastCeiling = altitudeEnvelope(used, {
        temperature: $('ceilingTemperature').value,
        reserveMargin: inputNumber($('ceilingMargin').value),
        maxAltitude: inputNumber($('ceilingMax').value),
        step: 100
      });
      lastCeiling.settings = {
        mass: used.mass,
        payload: used.payload,
        voltage: used.voltage,
        capacity: used.capacity,
        diameter: used.diameter,
        rpm: used.rpm,
        windSpeed: used.windSpeed
      };
      renderCeiling();
    } catch {
      toast('Check ceiling values');
    }
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
    `<header class="lab-heading"><span class="panel-label">04 / RECORDS</span><h2>${k('Keep the useful runs')}</h2><p>${k('The flight log is held in this tab, one sample per simulated second, up to 1800 samples. Project slots store settings, components and mission stages on this device; CAD files stay separate.')}</p></header><div class="lab-card"><div class="lab-form"><label>${k('Project name')}<input id="projectName" maxlength="60" value="My drone"></label><label>${k('Saved projects')}<select id="projectSlots"></select></label></div><div class="lab-actions">${button('saveProject','Save project')}${button('loadProject','Load project')}${button('deleteProject','Delete project')}${button('exportProject','Export project')}<label class="button file-button">${k('Import project')}<input id="importProject" type="file" accept=".json"></label></div><p class="lab-note">${k('Export a file for backup; browser storage can be cleared.')}</p></div><div class="lab-card"><h3>${k('Flight log')}</h3><div class="lab-form telemetry-form"><label>${k('Show')}<select id="telemetryChannel"></select></label></div><canvas id="telemetryCanvas" class="lab-chart" aria-label="${L('Flight log chart')}"></canvas><output id="telemetryReadout" class="telemetry-readout" aria-live="off"></output><div class="lab-actions">${button('downloadTelemetry','Download flight CSV')}${button('clearTelemetry','Clear log')}</div><output id="telemetryCount" class="telemetry-summary"></output></div>`;
  // 0.92: the log keeps several channels; the chart shows one with axes, hover readout and a summary.
  const telemetryChannels = {
    soc: {
      label: 'Charge',
      value: r => r[1],
      unit: () => '%',
      digits: 1
    },
    voltage: {
      label: 'Voltage under load',
      value: r => r[2],
      unit: () => L('V'),
      digits: 2
    },
    current: {
      label: 'Battery current',
      value: r => r[3],
      unit: () => L('A'),
      digits: 1
    },
    power: {
      label: 'Battery power',
      value: r => r[5],
      unit: () => L('W'),
      digits: 0
    },
    batteryTemp: {
      label: 'Battery temperature',
      value: r => r[4],
      kind: 'temperature',
      digits: 1
    },
    motorTemp: {
      label: 'Hottest motor',
      value: r => r[9],
      kind: 'temperature',
      digits: 1
    },
    wind: {
      label: 'Wind now',
      value: r => r[8],
      kind: 'speed',
      digits: 1
    },
    displacement: {
      label: 'Drift from hold point',
      value: r => Math.hypot(r[6], r[7]),
      kind: 'm',
      digits: 2
    }
  };
  const fillChannels = () => {
    const select = $('telemetryChannel'),
      current = select.value || 'soc';
    select.replaceChildren(...Object.entries(telemetryChannels).map(([value, c]) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = L(c.label);
      return o;
    }));
    select.value = current;
  };
  fillChannels();
  let telemetryHover = null;
  const projectData = () => ({
    format: 'dwl-project',
    version: 1,
    name: $('projectName').value.trim().slice(0, 60),
    parameters: {
      ...Object.fromEntries(Object.entries(getParameters()).filter(([key]) => key !== 'cadAerodynamics'))
    },
    components: components.map(c => ({
      ...c,
      position: [...c.position]
    })),
    stages: stages.map(s => ({
      ...s
    }))
  });

  function projectList(selectedName = projects[+$('projectSlots').value]?.name) {
    $('projectSlots').replaceChildren();
    projects.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = p.name || 'Project';
      $('projectSlots').append(o);
    });
    const index = projects.findIndex(p => p.name === selectedName);
    if (index >= 0) $('projectSlots').value = String(index);
  }
  projectList();

  function restoreProject(p) {
    if (!p || p.format !== 'dwl-project' || p.version !== 1 || !p.parameters || !Array.isArray(p.stages))
      throw Error();
    // 0.94: projects saved before the datasheet motor model get its defaults (the simple model stays selected).
    p = {
      ...p,
      parameters: {
        motorModel: 'rated',
        motorKv: 330,
        motorResistance: 0.085,
        motorIdleCurrent: 1.1,
        ...p.parameters
      }
    };
    applyParameters(p.parameters, {
      complete: true,
      validateOnly: true
    });
    componentBalance(p.components);
    validateMissionStages(p.stages);
    applyParameters(p.parameters, {
      battery: true,
      resetFlight: true,
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
    const p = projectData();
    if (!p.name) return toast('Enter a name');
    const i = projects.findIndex(x => x.name === p.name);
    if (i >= 0) projects[i] = p;
    else if (projects.length < 12) projects.push(p);
    else return toast('Library is full');
    if (save('dwl-projects', projects)) {
      projectList(p.name);
      toast('Saved on this device');
    } else toast('Storage unavailable');
  });
  $('loadProject').addEventListener('click', () => {
    try {
      restoreProject(projects[inputNumber($('projectSlots').value)]);
    } catch {
      toast('Invalid file');
    }
  });
  $('deleteProject').addEventListener('click', () => {
    const index = inputNumber($('projectSlots').value);
    if (!Number.isInteger(index) || index < 0 || index >= projects.length) return;
    projects.splice(index, 1);
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
    ['time_s', 'SOC_percent', 'voltage_V', 'current_A', 'temperature_C', 'power_W', 'x_m', 'z_m', 'wind_m_s',
      'motor_temp_max_C'
    ], ...telemetry
  ]), 'text/csv'));
  $('clearTelemetry').addEventListener('click', () => {
    telemetry = [];
    lastSample = -Infinity;
    telemetryHover = null;
    drawTelemetry();
  });
  $('telemetryChannel').addEventListener('change', () => drawTelemetry());
  $('telemetryCanvas').addEventListener('mousemove', e => {
    if (!telemetryLayout || telemetry.length < 2) return;
    const t = telemetryLayout.toX(e.offsetX) + telemetry[0][0];
    let best = 0;
    for (let i = 1; i < telemetry.length; i++)
      if (Math.abs(telemetry[i][0] - t) < Math.abs(telemetry[best][0] - t)) best = i;
    telemetryHover = best;
    drawTelemetry();
  });
  $('telemetryCanvas').addEventListener('mouseleave', () => {
    telemetryHover = null;
    drawTelemetry();
  });
  let telemetryLayout = null;

  // 0.93.1: a battery change shows as a rise in charge (the model only discharges). Energy and charge used are
  // integrated from the last change only, so two packs are never added together.
  const batterySwaps = () => telemetry.reduce((list, r, i) => i && r[1] > telemetry[i - 1][1] + .5 ? [...list, i] :
    list, []);
  // Trapezoid rule over the samples (about one simulated second apart). Pauses add no samples, because model
  // time stops; power gives Wh, current gives mAh.
  const integrate = (column, from = 0) => telemetry.slice(from + 1).reduce((sum, r, k) => {
    const previous = telemetry[from + k];
    return sum + (r[column] + previous[column]) / 2 * (r[0] - previous[0]);
  }, 0);

  function drawTelemetry() {
    if (state.activeView !== 'history') return;
    const channel = telemetryChannels[$('telemetryChannel').value] || telemetryChannels.soc,
      unit = channel.kind ? unitLabel(channel.kind) : channel.unit(),
      show = v => channel.kind ? toDisplay(v, channel.kind, units()) : v,
      start = telemetry[0]?.[0] || 0,
      points = telemetry.map(r => ({
        x: r[0] - start,
        y: show(channel.value(r))
      })).filter(p => Number.isFinite(p.y));
    const span = points.at(-1)?.x || 0,
      step = [5, 10, 15, 30, 60, 120, 300, 600].find(s => span / s <= 6) || 600,
      xTicks = Array.from({
        length: Math.floor(span / step) + 1
      }, (_, i) => i * step);
    if (telemetryHover !== null && !telemetry[telemetryHover]) telemetryHover = null;
    const hover = telemetryHover === null ? null : {
      x: telemetry[telemetryHover][0] - start,
      y: show(channel.value(telemetry[telemetryHover]))
    };
    const swaps = batterySwaps();
    telemetryLayout = drawLineChart($('telemetryCanvas'), {
      series: [{
        points
      }],
      vLines: swaps.map(i => ({
        x: telemetry[i][0] - start,
        label: L('battery changed')
      })),
      xTicks,
      xFormat: clock,
      yFormat: (v, step) => fmt(v, stepDigits(step)),
      yLabel: `${L(channel.label)} · ${unit}`,
      xLabel: L('flight time'),
      yMin: channel === telemetryChannels.soc ? 0 : undefined,
      yMax: channel === telemetryChannels.soc ? 100 : undefined,
      hover,
      empty: L('No samples yet: the log records one point per simulated second while the flight runs.')
    });
    $('telemetryReadout').textContent = hover ?
      `${clock(hover.x)} · ${L(channel.label)}: ${fmt(hover.y, channel.digits)} ${unit}` : (points.length ? L(
        'Point at the chart to read a value.') : '');
    if (points.length) {
      const values = points.map(p => p.y),
        mean = values.reduce((s, v) => s + v, 0) / values.length;
      $('telemetryCount').textContent =
        `${telemetry.length} / 1800 · ${clock(span)} · ${L('min.')} ${fmt(Math.min(...values), channel.digits)} · ${L('mean')} ${fmt(mean, channel.digits)} · ${L('max.')} ${fmt(Math.max(...values), channel.digits)} ${unit}` +
        (telemetry.length > 1 ? ` · ${L('used')}${swaps.length ? ' ' + L('since the last battery change') : ''} ${fmt(integrate(5, swaps.at(-1) || 0) / 3600, 2)} ${L('Wh')} / ${fmt(integrate(3, swaps.at(-1) || 0) / 3.6, 0)} ${L('mAh')}` : '');
    } else $('telemetryCount').textContent = `0 / 1800`;
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
      const panel = $(name + 'View');
      if (panel.classList.contains('focus-scene')) {
        panel.classList.remove('focus-scene');
        return;
      }
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else {
          await panel.requestFullscreen();
          if (!document.fullscreenElement) panel.classList.add('focus-scene');
        }
      } catch {
        panel.classList.add('focus-scene');
      }
    });
    $(name + 'Image').addEventListener('click', () => {
      scene.captureNextFrame = () => {
        const source = $(name + 'Canvas'),
          output = document.createElement('canvas');
        output.width = source.width;
        output.height = source.height;
        const ctx = output.getContext('2d');
        if (scene.gpu && !scene.gpu.lost) ctx.drawImage(scene.gpu.canvas, 0, 0, output.width, output
          .height);
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
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.focus-scene').forEach(panel => panel.classList
      .remove('focus-scene'));
  });

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
    api.ensureGraph();
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
    api.ensureGraph();
    const rows = graphRenderer.layout?.points || [];
    download('dwl-graph.csv', csvText([
      [$('graphVariable').value + ' (' + api.graphUnit($('graphVariable').value, false) + ')', $(
          'graphMetric').value + ' (' + api.graphUnit($('graphMetric').value, true) + ')',
        'hover_feasible'
      ], ...rows.map(p => [p.x, p.y, p.result.feasible])
    ]), 'text/csv');
  });
  $('graphCanvas').addEventListener('click', e => {
    api.ensureGraph();
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
    const a = inputNumber($('graphFrom').value),
      b = inputNumber($('graphTo').value),
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
    `<div class="lab-actions flow-run"><label><input id="flowAuto" type="checkbox" checked>${k('Auto calculate')}</label>${button('flowRun','Calculate flow')}<label><input id="matchViscosity" type="checkbox" checked>${k('Match numerical viscosity across grids')}</label>${button('flowCancel','Cancel calculation')}${button('flowProbeCSV','Export probe grid')}<label>${k('Slice')}<select id="slicePlane"><option value="xz">XZ</option><option value="xy">XY</option><option value="yz">YZ</option></select></label>${number('sliceOffset','Slice offset · m',0,-2,2,.02)}${button('drawSlice','Update slice')}</div><canvas id="sliceCanvas" width="480" height="240" class="slice-canvas" hidden aria-label="Flow speed slice"></canvas><output id="sliceStatus" class="lab-note"></output>`
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

  $('matchViscosity').addEventListener('change', () => {
    scenes[1].cfd.desiredKey = '';
  });
  $('sliceStatus').insertAdjacentHTML('afterend',
    `<details class="grid-study lab-card"><summary>${k('Grid comparison')}</summary><p>${k('Compare forces with the same viscosity and settings. A small residual or a small difference between two grids does not prove accuracy.')}</p><div id="gridResults"></div></details>`
    );
  let gridRows = [],
    gridKey = '';

  function renderGridRows() {
    const rows = compareGridResults(gridRows);
    $('gridResults').innerHTML = (rows.some(r=>!r.converged)?`<p class="warning-text">${L('Not converged: force differences also include iteration error.')}</p>`:'')+table(['Grid', 'Cell · mm', 'Viscosity · m²/s', 'Force XYZ · N',
      'Change · N', 'Convergence'
    ], rows.map(r => [r.quality, fmt(r.spacingM * 1000, 2), fmt(r.viscosity, 6), r.force.map(v => fmt(v,
      4)).join(' / '), r.changeN === null ? '—' : fmt(r.changeN, 4), L(r.converged ? 'Converged' :
      'Not converged')]));
  }

  function acceptCFD(stats, config) {
    if (!config) return;
    const key = gridIdentity(config)+':nu='+Number(stats.numericalViscosity).toPrecision(12);
    if (gridKey !== key) {
      gridKey = key;
      gridRows = [];
    }
    const row = {
      quality: config.quality,
      spacingM: stats.spacingM,
      viscosity: stats.numericalViscosity,
      force: stats.meanSurfaceForce,
      converged: stats.converged
    };
    gridRows = gridRows.filter(r => r.quality !== row.quality);
    gridRows.push(row);
    renderGridRows();
  }
  let sliceKey = '';
  const currentSliceKey = () => JSON.stringify([scenes[1].cfd.desiredKey, scenes[1].cfd.fieldKey, $(
    'slicePlane').value, $('sliceOffset').value]);

  function sliceSamples() {
    const f = scenes[1].cfd.field;
    if (!f || scenes[1].cfd.fieldKey !== scenes[1].cfd.desiredKey) throw Error();
    const scale = f.stats.worldScale,
      plane = $('slicePlane').value,
      offset = inputNumber($('sliceOffset').value);
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
      sliceKey = currentSliceKey();
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
    document.querySelector('.tone-chips').setAttribute('aria-label', L('Theme'));
    $('packLibrary').options[0].textContent = L('Custom draft');
    for (const o of $('activityMode').options) o.textContent = L({
      visible: 'Visible tab',
      focused: 'Site has focus',
      background: 'Allow background'
    } [o.value]);
    document.querySelectorAll('[data-tone]').forEach(b => {
      const name = L({
        graphite: 'Graphite',
        polar: 'Polar',
        sand: 'Sand',
        rose: 'Rose'
      } [b.dataset.tone]);
      b.title = name;
      b.setAttribute('aria-label', name);
    });
    $('controlSearch').setAttribute('aria-label', L('Find a parameter'));
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
    renderActivity();
    renderCustom();
    renderMission();
    fillChannels();
    for (const o of $('ceilingTemperature').options) o.textContent = L(o.value === 'standard' ?
      'Standard atmosphere · −6.5 °C per km' : 'As in the settings');
    $('telemetryCanvas').setAttribute('aria-label', L('Flight log chart'));
    $('missionCanvas').setAttribute('aria-label', L('Charge during the mission'));
    $('ceilingCanvas').setAttribute('aria-label', L('Thrust reserve versus altitude'));
    if (lastCeiling) renderCeiling();
    else if (!$('ceilingResult').hidden) $('ceilingResult').textContent = L('Recalculate after changes');
    drawTelemetry();
    if ($('envelopeResult').textContent) $('runEnvelope').click();
    $('sliceStatus').textContent = '';
    renderGridRows();
    $('labToast').hidden = true;
    previewPack();
    projectList();
    if (!$('graphTable').hidden) updateGraphTable();
  }
  // 0.94: validation tab, temperatures, overload tests and motor failure.
  const lab = installLab094(api, {
    L,
    k,
    button,
    fmt,
    toast,
    escape
  });
  // 0.95: weather by place and the best battery size.
  const lab95 = installLab095(api, {
    L,
    k,
    fmt,
    toast,
    escape
  });
  document.addEventListener('languagechange', () => {
    refreshLanguage();
    lab.refreshLanguage();
    lab95.refreshLanguage();
  });
  refreshLanguage();
  let lastUI = -Infinity,
    shownView = '';
  return {
    tick(now, render = true) {
      lab.tick(now, render);
      if (render) lab95.tick(now, state);
      if (state.t < lastSample) {
        telemetry = [];
        lastSample = -Infinity;
      }
      if (state.t - lastSample >= 1 && state.batteryActual) {
        const c = state.batteryActual;
        telemetry.push([state.t, state.battery.soc, c.terminalVoltage, c.current, state.battery.temperature, c
          .deliveredPower, state.x, state.y, state.windNow || 0, Math.max(...(state.motorTemps.length ? state
            .motorTemps : [state.battery.temperature]))
        ]);
        if (telemetry.length > 1800) telemetry.shift();
        lastSample = state.t;
        if (render && state.activeView === 'history') drawTelemetry();
      }
      if (!render) return;
      // 0.92: charts in hidden tabs have no size; draw them as soon as their tab opens.
      if (state.activeView !== shownView) {
        shownView = state.activeView;
        if (shownView === 'history') drawTelemetry();
        if (shownView === 'mission') {
          drawMission();
          drawCeiling();
        }
      }
      if (!$('sliceCanvas').hidden && sliceKey !== currentSliceKey()) {
        $('sliceCanvas').hidden = true;
        $('sliceStatus').textContent = L('Slice is outdated');
      }
      if (now - lastUI > 1000) {
        $('activityState').textContent = L(activityLoop.getState().reason === 'waiting' ?
          'Waiting for activity' : activityLoop.getState().reason === 'background' ?
          'Calculating in background' : 'Calculations active');
        lastUI = now;
        const parameterKey = JSON.stringify(getParameters());
        if (lastMission && missionKey !== parameterKey) {
          lastMission = null;
          staleMission();
        }
        if (lastCeiling && ceilingKey !== parameterKey) staleCeiling();
        if (state.activeView === 'mission') {
          drawMission();
          drawCeiling();
        }
        if (render && state.activeView === 'history') drawTelemetry();
        if (state.activeView === 'engineering') {
          renderCustom();
          ledgerPreview();
        }
        if (state.activeView === 'graph' && !$('graphTable').hidden) updateGraphTable();
      }
    },
    refreshLanguage, activityChanged:renderActivity,
    // 0.92: results shown in display units are re-rendered after a unit switch.
    unitsChanged() {
      lab.unitsChanged();
      renderCustom();
      ledgerPreview();
      renderMission();
      if (lastCeiling) renderCeiling();
      drawTelemetry();
    },
    acceptCFD
  };
}
