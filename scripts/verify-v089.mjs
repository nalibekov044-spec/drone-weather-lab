import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),modules=new Map();
async function load(file){
 const filename=path.resolve(root,file);
 if(modules.has(filename))return modules.get(filename);
 const promise=(async()=>{const m=new vm.SourceTextModule(fs.readFileSync(filename,'utf8'),{identifier:filename});await m.link((name,parent)=>load(path.resolve(path.dirname(parent.identifier),name)));return m;})();
 modules.set(filename,promise);return promise;
}
async function ns(name){const m=await load('dist/'+name+'.js');if(m.status!=='evaluated')await m.evaluate();return m.namespace;}
const power=await ns('power-system'), physics=await ns('physics'), mesh=await ns('mesh-import'),cfd=await ns('cfd-core');
const {baseDefaults:p,calculate,relativeAirflow,graphSeries}=physics;
const i18n=await ns('i18n'); i18n.setLanguage('en');
assert.equal(i18n.t(physics.graphMetrics.flightMinutes.formula),'t ≈ 60 · Qto reserve / Iinitial'); i18n.setLanguage('ru');
const u=await ns('units'),builder=await ns('drone-builder'),flow=await ns('flow-lines');
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,`${a} vs ${b}`);
let keyCases=0;
for(const [code,action]of Object.entries(u.shortcutBindings)){
 const event={code,key:'ф',target:{closest:()=>null}};
 assert.equal(u.shortcutAction(event),action);keyCases++;
 for(const gate of ['repeat','ctrlKey','metaKey','altKey','isComposing','defaultPrevented']){assert.equal(u.shortcutAction({...event,[gate]:true}),null);keyCases++;}
 assert.equal(u.shortcutAction({...event,target:{isContentEditable:true}}),null);
 assert.equal(u.shortcutAction({...event,target:{closest:()=>({})}}),null);
}
assert.equal(u.shortcutAction({key:'?',code:'Slash',shiftKey:true}),'help');
assert.equal(u.shortcutAction({key:'К',code:'KeyR',shiftKey:true}),'resetAll');
assert.equal(u.shortcutAction({key:'Escape'}),'closeHelp');
assert.equal(u.shortcutAction({key:'e',ctrlKey:true}),null);
assert.equal(u.shortcutAction({key:'é',code:'KeyE'}),'report');
// Freeze I, OCV, R and the ambient temperature; compare exact RC/thermal propagation across timesteps.
const q={...p,temperature:20,batteryTemp:20,stateOfCharge:100};
const start=power.initialBattery(q),raw=power.batteryCircuit(q,start,100);
const amps=8, rp=raw.polarizationResistance, r0=raw.resistance,dt=120;
const circuit={...raw,current:amps,ohmicHeat:amps*amps*r0,heat:amps*amps*r0,deliveredPower:amps*(raw.openVoltage-amps*r0)};
const coarse=power.stepBattery(start,q,circuit,0,1.225,dt);
let fine={...start};for(let i=0;i<1200;i++)fine=power.stepBattery(fine,q,circuit,0,1.225,.1);
for(const k of ['temperature','polarization','outputWh','heatWh','sourceWh','soc'])near(coarse[k],fine[k],1e-8);
const storedWh=20/rp*coarse.polarization**2/2/3600;
const energyError=Math.abs(coarse.sourceWh-coarse.outputWh-coarse.heatWh-storedWh);assert(energyError<1e-10);
// Independent small-step Euler integration of dUp/dt and dT/dt.
let v=0,temp=20;const h=.001,C=q.batteryMass*900,G=.8;
for(let t=0;t<dt;t+=h){const heat=amps*amps*r0+v*v/rp;temp+=(heat-G*(temp-q.temperature))/C*h;v+=(amps*rp-v)/20*h;}
near(temp,coarse.temperature,.0001);near(v,coarse.polarization,1e-6);
const rest=power.stepBattery(coarse,q,{...circuit,current:0,deliveredPower:0,ohmicHeat:0,heat:coarse.polarization**2/rp},0,1.225,60);
const restStored=20/rp*rest.polarization**2/2/3600;
near(rest.heatWh-coarse.heatWh,storedWh-restStored,1e-10);near(rest.outputWh,coarse.outputWh);assert(rest.polarization<coarse.polarization);
let budgets=0,maxBudgetError=0;
for(const soc of [0,1,10,50,100])for(const temperature of [-30,20,70])for(const polarization of [0,.4,2])for(const watts of [0,18,600,50000]){
 const c=power.batteryCircuit(p,{...start,soc,temperature,polarization},watts);
 const demand=Math.max(0,(watts-18)*.97/4);
 const budget=power.powerBudget(c,[demand,demand,demand,demand],[.88,.88,.88,.88],.97,18);
 maxBudgetError=Math.max(maxBudgetError,Math.abs(budget.balanceError));assert(Math.abs(budget.balanceError)<1e-8);
 for(const k of ['chemical','delivered','shaft','motorHeat','esc','avionics','batteryHeat'])assert(Number.isFinite(budget[k])&&budget[k]>=0,k);
 budgets++;
}
for(const temperature of [-20,0,20,50]){
 const q={...p,batteryTemp:temperature},r=calculate(q),expected=Math.max(0,r.batteryState.soc-q.reserveCharge)/100*r.battery.capacityAh/Math.max(.001,r.current)*60;
 if(r.feasible)near(r.flightMinutes,expected);
}
const forecast=power.forecastBattery(p,start,500,4,1.225),fresh=power.batteryCircuit(p,forecast.finalState,500);
near(forecast.circuit.terminalVoltage,fresh.terminalVoltage);near(forecast.circuit.current,fresh.current);
assert.throws(()=>power.forecastBattery(p,start,500,0,1.225,{dt:Infinity}));
assert.throws(()=>power.forecastBattery(p,start,500,0,1.225,{maximumSeconds:Infinity}));
assert.throws(()=>power.stepBattery(start,p,raw,0,1.225,NaN));
const standard=calculate(p),highCutoff=calculate({...p,controllerCutoff:24.9});assert(highCutoff.availableThrust<standard.availableThrust);
const up=calculate({...p,mass:.2,payload:0,dragArea:1,verticalWind:10,windSpeed:0});assert(up.verticalDemand<0&&!up.feasible);assert(Number.isFinite(up.reserve));
assert.throws(()=>graphSeries(p,'mass','electricalPower',0,20,1));
assert.throws(()=>graphSeries(p,'mass','electricalPower',NaN,20,100));
const a=builder.geometryFor(p),b=builder.geometryFor({...p,temperature:50});assert.equal(a,b);
assert.notEqual(a,builder.geometryFor({...p,frameSize:p.frameSize+10}));
assert.equal(flow.sampleField([NaN,0,0],{}),null);
assert.equal(flow.traceLines({bounds:{}},{windSpeed:0,rotors:0,propRadius:.5},10,'volume').length,0);
assert.throws(()=>mesh.parseMesh(new TextEncoder().encode('solid bad\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nvertex broken 2 2\nendsolid').buffer,'bad.stl'));
const report={version:'0.89.0-beta',baseRelease:'0.88 Beta',hotkeyCases:keyCases,powerBudgetCases:budgets,maxPowerBudgetErrorW:maxBudgetError,rcEnergyBalanceErrorWh:energyError,rcStep120Seconds:{temperature:coarse.temperature,polarization:coarse.polarization,outputWh:coarse.outputWh,heatWh:coarse.heatWh,storedWh},forecastMinutes:forecast.minutes,limits:['All checks are numerical; real drone hardware is not calibrated.','CFD is coarse-grid and regularized, with no real-drone experimental validation.','A reviewed module and passing test suite do not prove absence of every bug.']};
fs.writeFileSync(path.join(root,'verification-v089.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
