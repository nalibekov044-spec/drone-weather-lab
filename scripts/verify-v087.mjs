import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname,'..'), modules = new Map();
async function load(file) {
  const filename=path.resolve(root,file);
  if (modules.has(filename)) return modules.get(filename);
  const promise=(async()=>{const mod=new vm.SourceTextModule(fs.readFileSync(filename,'utf8'),{identifier:filename});await mod.link((name,parent)=>load(path.resolve(path.dirname(parent.identifier),name)));return mod;})();
  modules.set(filename,promise);return promise;
}
const powerModule=await load('dist/power-system.js');await powerModule.evaluate();
const physicsModule=await load('dist/physics.js');await physicsModule.evaluate();
const {batteryCircuit,initialBattery,stepBattery,stepESC,escAvailability,openCircuitCellVoltage}=powerModule.namespace;
const {baseDefaults,calculate,pressureFromAltitude}=physicsModule.namespace;
const p={...baseDefaults}, state=initialBattery(p);
let cases=0,maximumPowerError=0;
for(const soc of [0,1,10,20,50,100])for(const temperature of [-30,0,20,60,75])for(const health of [10,50,100])for(const resistance of [0,.035,.2])for(const watts of [0,18,500,20000]){
  const trial={...p,batteryHealth:health,batteryResistance:resistance};
  const circuit=batteryCircuit(trial,{...state,soc,temperature},watts);
  for(const key of ['current','terminalVoltage','maximumPower','deliveredPower','heat'])assert(Number.isFinite(circuit[key])&&circuit[key]>=0,key);
  const error=Math.abs(circuit.current*circuit.terminalVoltage-circuit.deliveredPower);
  maximumPowerError=Math.max(maximumPowerError,error);assert(error<1e-8);
  assert(circuit.current<=circuit.currentLimit+1e-8);
  if(circuit.current>0)assert(circuit.terminalVoltage>=circuit.cutoffVoltage-1e-8);
  if(soc===0||temperature>=75)assert.equal(circuit.deliveredPower,0);
  cases++;
}
const warm=batteryCircuit(p,state,600),cold=batteryCircuit(p,{...state,temperature:-20},600);
assert(cold.resistance>warm.resistance);assert(cold.terminalVoltage<warm.terminalVoltage);
const current=4,heat=10;
const fixed={...warm,current,heat,deliveredPower:80,polarizationResistance:.02};
// This fixture specifies constant heat and output power, independently of circuit losses.
delete fixed.ohmicHeat; delete fixed.polarizationHeat;
let step=initialBattery({...p,batteryTemp:15});
for(let i=0;i<3600;i++)step=stepBattery(step,p,fixed,0,1.225,1);
assert(Math.abs(step.soc-60)<1e-9);assert(Math.abs(step.usedAh-4)<1e-10);assert(Math.abs(step.outputWh-80)<1e-9);
const expected=15+heat/.8*(1-Math.exp(-3600*.8/(p.batteryMass*900)));
assert(Math.abs(step.temperature-expected)<1e-9);
const expectedPolarization=current*.02*(1-Math.exp(-3600/20));assert(Math.abs(step.polarization-expectedPolarization)<1e-12);
const coarse=stepBattery(initialBattery({...p,batteryTemp:15}),p,fixed,0,1.225,3600);
assert(Math.abs(coarse.temperature-step.temperature)<1e-9);assert(Math.abs(coarse.soc-step.soc)<1e-9);
const nearlyEmpty=stepBattery({...initialBattery(p),soc:1},p,fixed,0,1.225,3600);
assert.equal(nearlyEmpty.soc,0);assert(Math.abs(nearlyEmpty.usedAh-.1)<1e-12);assert(Math.abs(nearlyEmpty.outputWh-2)<1e-12);
const motorModule=await load('dist/systems.js');await motorModule.evaluate();
const protectedMotors=motorModule.namespace.stepMotorThermals({temperatures:[20],healths:[1],fires:[0]},p,{effectiveRpms:[100],motorLoadPercents:[5000],motorThermalLoadPercents:[1]},0,60);
assert(protectedMotors.temperatures[0]<21);assert.equal(protectedMotors.fires[0],0);
const nominal=calculate(p),lowCurrent=calculate({...p,batteryCRating:1}),lowEsc=calculate({...p,escCurrentLimit:2});
assert(lowCurrent.availableThrust<nominal.availableThrust&&!lowCurrent.batteryFeasible);
assert(lowEsc.availableThrust<nominal.availableThrust&&!lowEsc.thrustFeasible);
const empty=calculate(p,{batteryState:{...state,soc:0}});assert.equal(empty.availableThrust,0);assert(!empty.feasible);
const burntEsc=calculate(p,{escTemps:Array(4).fill(135)});assert.equal(burntEsc.availableThrust,0);
const lostController=calculate({...p,controllerCutoff:18,voltage:7.4});assert.equal(lostController.availableThrust,0);
const healthyShaft=nominal.shaftPowers.reduce((a,b,i)=>a+b/nominal.motorEfficiencies[i],0)/nominal.escEfficiency+nominal.avionicsPower;
assert(healthyShaft<=nominal.battery.maximumPower+1e-6);
assert.equal(escAvailability(95),1);assert.equal(escAvailability(115),.5);assert.equal(escAvailability(135),0);
const hotEsc=stepESC([15],p,[500],25,0,1.225,60)[0];assert(hotEsc>15);
const cooling=stepESC([100],p,[0],25,0,1.225,60)[0];assert(cooling<100);
const mountain=calculate({...p,altitude:5000,temperatureMode:'standard'});
assert(Math.abs(pressureFromAltitude(5000)-54019)<2);assert(Math.abs(mountain.temperatureK-255.65)<1e-9);
assert(mountain.density<nominal.density);assert(mountain.hoverRpm>nominal.hoverRpm);
assert(mountain.propulsionPower>nominal.propulsionPower);
let last=0;for(let soc=0;soc<=100;soc++){const voltage=openCircuitCellVoltage(soc);assert(voltage>=last);last=voltage;}
const report={version:'0.87.0-beta',batteryCases:cases,maximumElectricalPowerBalanceErrorW:maximumPowerError,constantCurrentCheck:{currentA:current,seconds:3600,usedAh:step.usedAh,finalSocPercent:step.soc,outputWh:step.outputWh,temperatureErrorC:Math.abs(step.temperature-expected)},mountain:{altitudeM:5000,pressurePa:mountain.pressure,temperatureC:mountain.temperatureK-273.15,densityKgM3:mountain.density,hoverRpm:mountain.hoverRpm},limits:['Battery curves and thermal constants are illustrative, not cell-specific validation.','CFD solver and grid limits are unchanged from 0.85 Beta.']};
fs.writeFileSync(path.join(root,'verification-v087.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
