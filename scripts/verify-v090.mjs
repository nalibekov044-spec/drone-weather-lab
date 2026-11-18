import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),mods=new Map();
async function load(name){const f=path.resolve(root,'dist',name+'.js');if(mods.has(f))return mods.get(f);const pending=(async()=>{const m=new vm.SourceTextModule(fs.readFileSync(f,'utf8'));await m.link(s=>load(s.replace('./','').replace('.js','')));return m;})();mods.set(f,pending);return pending;}
async function ns(name){const m=await load(name);if(m.status!=='evaluated')await m.evaluate();return m.namespace;}
const e=await ns('engineering'),power=await ns('power-system'),p=(await ns('physics')).baseDefaults,physics=await ns('physics'),builder=await ns('drone-builder'),i18n=await ns('i18n'),es=(await ns('i18n-es')).spanish;
const near=(a,b,t=1e-9)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
let packs=0,circuits=0,maxError=0;
for(const chemistry of Object.keys(e.cellTypes))for(const series of [1,4,6,8,16])for(const parallel of [1,2,3]){
 const cell={name:'test',chemistry,series,parallel,cellMah:2000,cellOhm:.01,cellMass:.05,cRating:20},pack=e.buildPack(cell);
 near(pack.capacity,2000*parallel);near(pack.resistance,.01*series/parallel);near(pack.mass,.05*series*parallel);near(pack.voltage,series*e.cellTypes[chemistry].nominal);
 const q={...p,...pack.parameters};for(const soc of [0,20,50,100])for(const watts of [0,100,1000]){
  const c=power.batteryCircuit(q,{...power.initialBattery(q),soc},watts);assert(c.current>=0&&c.deliveredPower>=0&&Number.isFinite(c.terminalVoltage));const err=Math.abs(c.current*c.terminalVoltage-c.deliveredPower);maxError=Math.max(maxError,err);assert(err<1e-8);circuits++;
 }
 const curve=power.curves[chemistry].points;for(let i=1;i<curve.length;i++)assert(curve[i][1]>=curve[i-1][1]);packs++;
}
for(const data of [{...e.packExamples[0],series:1.5},{...e.packExamples[0],parallel:0},{...e.packExamples[0],cellOhm:NaN},{...e.packExamples[0],chemistry:'unknown'},{...e.packExamples[0],cellMass:1,series:16}])assert.throws(()=>e.buildPack(data));
const ledger=e.componentBalance([{mass:1,position:[-100,0,0]},{mass:3,position:[100,0,0]}]);near(ledger.mass,4);near(ledger.cg[0],.05);near(ledger.inertia[1],.03);near(ledger.inertia[2],.03);
assert.throws(()=>e.componentBalance([{mass:-1,position:[0,0,0]}]));
const cgResult=physics.calculate({...p,customCG:[.03,0,.02]}),zero=physics.calculate(p);near(cgResult.rollMoment-zero.rollMoment,p.mass*9.80665*.02,1e-8);near(cgResult.pitchMoment-zero.pitchMoment,-p.mass*9.80665*.03,1e-8);
const ct=.09,cp=.05,rpm=5000,d=.3,rho=1.2,n=rpm/60,coeff=e.calibrateProp(ct*rho*n*n*d**4,cp*rho*n**3*d**5,rpm,d,rho);near(coeff.ct,ct);near(coeff.cp,cp);assert.throws(()=>e.calibrateProp(1,2,0,d,rho));
const stage={name:'hover',minutes:1,speed:0,altitude:500,wind:3},one=e.missionForecast(p,[{...stage,minutes:2}]),two=e.missionForecast(p,[stage,stage]);assert(one.complete&&two.complete);near(one.soc,two.soc,1e-9);near(one.wh,two.wh,1e-9);
const low=e.missionForecast({...p,stateOfCharge:p.reserveCharge},[stage]);assert(!low.complete&&low.seconds===0);assert.equal(low.rows[0].reason,'reserve');
assert.throws(()=>e.missionForecast(p,[{...stage,minutes:Infinity}]));assert.throws(()=>e.missionForecast(p,[]));
const sweep=e.scenarioSweep(p);assert.equal(sweep.length,5);assert(sweep.at(-1).watts>sweep[0].watts);
const csv=e.csvText([['name','value'],['=formula',2],['a,b\n"c',-3]]);assert(csv.includes("'="));assert(csv.includes('""c'));assert(csv.startsWith('\ufeff'));
let translated=0;for(const lang of ['en','es']){i18n.setLanguage(lang);for(const key of Object.keys(i18n.dictionary)){if(key==='Русский')continue;assert(!/[А-Яа-яЁё]/.test(i18n.t(key)),`Missing ${lang}: ${key}`);if(lang==='es'){assert(es[key],`No Spanish entry: ${key}`);translated++;}}const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');for(const m of html.matchAll(/>([^<>]+)</g)){if(m[1].trim()==='Русский')continue;assert(!/[А-Яа-яЁё]/.test(i18n.t(m[1].trim())),`HTML ${lang}: ${m[1]}`);}}
const g=builder.geometryFor(p),normal=builder.displayParts(p,g),exploded=builder.displayParts(p,g,true);assert(normal.some(x=>x.role==='canopy'));assert(normal.some(x=>x.role==='panel'));assert(exploded.some((x,i)=>x.center[1]!==normal[i].center[1]));assert.deepEqual(builder.geometryFor(p).parts,g.parts);
const count=fs.readdirSync(path.join(root,'dist')).filter(n=>n.endsWith('.js'));for(const f of count)new vm.SourceTextModule(fs.readFileSync(path.join(root,'dist',f),'utf8'));
const report={version:'0.91.0-beta',packConfigurations:packs,electricalCases:circuits,maxElectricalErrorW:maxError,spanishEntries:translated,parsedModules:count.length,missionSplitEnergyErrorWh:Math.abs(one.wh-two.wh),checks:['pack S/P scaling and four voltage curves','component CG and point-mass inertia','CG moments in flight model','propeller coefficient round trip','sequential mission continuity and reserve','CSV escaping and formula-neutral text','English/Spanish dictionary and static HTML coverage','display-only housing explosion preserves physical geometry'],limits:['See 0.91 tests for CFD grid/domain/continuation changes; no real-drone experimental validation','Battery curves and thermal coefficients are illustrative','Mission uses steady horizontal headwind segments; no climb energy or acceleration','UI browser checks are documented separately']};
fs.writeFileSync(path.join(root,'verification-v090.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
