import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..'), modules = new Map();
async function load(file) {
  file = path.resolve(root, file); if (modules.has(file)) return modules.get(file);
  const promise = (async () => {
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file });
    await mod.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier))); return mod;
  })();
  modules.set(file, promise); return promise;
}
const languageModule = await load('dist/i18n.js'); await languageModule.evaluate();
languageModule.namespace.setLanguage('en');
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
for (const match of html.matchAll(/>([^<>]+)</g)) {
  const text = match[1].trim(); if (text === 'Русский') continue;
  assert(!/[А-Яа-яЁё]/.test(languageModule.namespace.t(text)), `Untranslated HTML: ${text}`);
}
languageModule.namespace.setLanguage('ru');
const mod = await load('dist/cfd-core.js'); await mod.evaluate();
const { collideCell, smagorinskyTau, boundaryMassFlow, actuatorForces, solveCFD } = mod.namespace;
const cx = [0,1,-1,0,0,0,0,1,-1,1,-1,1,-1,1,-1,0,0,0,0];
const cy = [0,0,0,1,-1,0,0,1,-1,-1,1,0,0,0,0,1,-1,1,-1];
const cz = [0,0,0,0,0,1,-1,0,0,0,0,1,-1,-1,1,1,-1,-1,1];
const weights = [1/3,...Array(6).fill(1/18),...Array(12).fill(1/36)];
const baseTau = 0.7, rho = 1.1, tensorSquared = 0.0003, coefficient = 0.12;
const tau = smagorinskyTau(baseTau, rho, tensorSquared, coefficient);
assert(tau > baseTau);
assert.equal(smagorinskyTau(baseTau, rho, tensorSquared, 0), baseTau);
assert.equal(smagorinskyTau(baseTau, rho, 0, coefficient), baseTau);
assert(Math.abs(tau * tau - baseTau * tau - 4.5 * coefficient ** 2 * Math.sqrt(2 * tensorSquared) / rho) < 1e-14);
function shearDecay(n, steps, tau, trt) {
  let f = new Float64Array(n * 19), next = new Float64Array(n * 19), post = new Float64Array(n * 19);
  const amplitude = 0.005, k = 2 * Math.PI / n;
  for (let y = 0; y < n; y++) for (let q = 0; q < 19; q++) {
    const u = amplitude * Math.sin(k * y), cu = cx[q] * u;
    f[q * n + y] = weights[q] * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * u * u);
  }
  for (let step = 0; step < steps; step++) {
    for (let y = 0; y < n; y++) {
      let density = 0, ux = 0, uy = 0, uz = 0;
      for (let q = 0; q < 19; q++) { const value = f[q * n + y]; density += value; ux += value * cx[q]; uy += value * cy[q]; uz += value * cz[q]; }
      collideCell(f,y,n,density,ux/density,uy/density,uz/density,0,0,0,1/tau,trt ? 1/(0.5+0.1875/(tau-0.5)) : 1/tau,post);
    }
    for (let q = 0; q < 19; q++) for (let y = 0; y < n; y++) next[q*n+y] = post[q*n+(y-cy[q]+n)%n];
    [f,next] = [next,f];
  }
  let measured = 0, mass = 0;
  for (let y = 0; y < n; y++) {
    let ux = 0, density = 0;
    for (let q = 0; q < 19; q++) { ux += f[q*n+y]*cx[q]; density += f[q*n+y]; }
    mass += density; measured += ux / density * Math.sin(k*y) * 2/n;
  }
  const expected = amplitude * Math.exp(-(tau-0.5)/3*k*k*steps);
  const error = Math.abs(measured / expected - 1);
  assert(error < 0.015, `Shear wave ${trt?'TRT':'BGK'} error ${error}`);
  assert(Math.abs(mass / n - 1) < 1e-12);
  return { mode:trt?'TRT':'BGK', n, steps, latticeViscosity:(tau-0.5)/3, measured, expected, relativeError:error };
}
const shear = [shearDecay(32,200,0.8,false),shearDecay(32,200,0.8,true)];
const field = {nx:5,ny:5,nz:5,velocityX:new Float32Array(125).fill(3),velocityY:new Float32Array(125).fill(-2),velocityZ:new Float32Array(125).fill(1),pressure:new Float32Array(125),solid:new Uint8Array(125)};
const balance = boundaryMassFlow(field,1.2,0.25,100);
assert(Math.abs(balance.incoming-7.2)<1e-6); assert(balance.relativeImbalance < 1e-12);
const nx=31,ny=17,nz=25,h=0.2,scale=0.36,velocityScale=6/0.065;
const bounds={xMin:-3,yMin:-1.6,zMin:-2.4};
const config={density:1.225,worldScale:scale,propRadius:0.48,rotorThrusts:[4],rotorTorques:[0.06]};
const rotor={x:0.21,z:-0.17,diskY:0.17};
const forces=actuatorForces(config,nx,ny,nz,[rotor],6,new Uint8Array(nx*ny*nz),bounds,h);
let forceX=0,forceY=0,forceZ=0,torqueY=0;
const forceScale=config.density*(h*scale)**2*velocityScale**2;
for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  const i=x+nx*(z+nz*y),px=(bounds.xMin+x*h-rotor.x)*scale,pz=(bounds.zMin+z*h-rotor.z)*scale;
  forceX+=forces.fx[i]*forceScale;forceY+=forces.fy[i]*forceScale;forceZ+=forces.fz[i]*forceScale;
  torqueY+=(pz*forces.fx[i]-px*forces.fz[i])*forceScale;
}
assert(Math.abs(forceY+4)<1e-6);assert(Math.abs(forceX)<1e-7&&Math.abs(forceZ)<1e-7);assert(Math.abs(torqueY-0.06)<1e-8);
const uniform=solveCFD({emptyDomain:true,rotors:0,geometryParts:[],windSpeed:3,windDirection:23,verticalWind:0.4,quality:'fast',maxSteps:50,smagorinsky:0.12});
assert(uniform.stats.maxEddyViscosity<1e-6);
assert(uniform.stats.massFlow.relativeImbalance<1e-5);
const sphere={kind:'ellipsoid',center:[0,0,0],size:[1,1,1],role:'body'};
const sphereConfig={windSpeed:3,windDirection:0,verticalWind:0,downwashSpeed:0,quality:'fast',maxSteps:800,density:1.225,worldScale:0.36,frameSize:360,kinematicViscosity:0.035,geometryParts:[sphere],rotorThrusts:[0,0,0,0],rotors:4,propRadius:0.2,smagorinsky:0.12};
const positive=solveCFD(sphereConfig),negative=solveCFD({...sphereConfig,windDirection:180});
assert(positive.stats.surfaceForce[0]>0&&negative.stats.surfaceForce[0]<0);
assert(Math.abs(positive.stats.surfaceForce[0]+negative.stats.surfaceForce[0])<1e-4);
assert(positive.stats.maxEddyViscosity>0);
assert(positive.stats.forceHistory.length>3);
assert(positive.stats.meanSurfaceForce.every(Number.isFinite));
const builderModule=await load('dist/drone-builder.js');await builderModule.evaluate();
const physical=await load('dist/physics.js');await physical.evaluate();
const drone={...physical.namespace.baseDefaults};
const geometry=builderModule.namespace.geometryFor(drone),result=physical.namespace.calculate(drone);
const fraction=result.rotorThrusts.map((thrust,i)=>thrust/result.thrusts[i]);
const torques=result.shaftPowers.map((power,i)=>(i%2?-1:1)*power*fraction[i]/(result.effectiveRpms[i]*Math.PI/30));
const droneField=solveCFD({...drone,rotors:4,quality:'fast',maxSteps:200,worldScale:geometry.worldScale,geometryParts:geometry.parts,rotorCenters:geometry.rotors,density:result.density,downwashSpeed:result.downwashSpeed,rotorThrusts:result.rotorThrusts,rotorTorques:torques,propRadius:drone.diameter*0.0254/(2*geometry.worldScale),smagorinsky:0.12});
assert(droneField.velocityX.every(Number.isFinite));assert(droneField.stats.appliedTorques.filter(Number.isFinite).length===4);
const report={version:'0.85.0-beta',purpose:'Numerical checks, not experimental drone validation',shearWave:shear,uniformMassImbalance:uniform.stats.massFlow.relativeImbalance,actuator:{forceN:[forceX,forceY,forceZ],torqueNm:torqueY},sphere:{...positive.stats,residualHistory:undefined,forceHistory:undefined},drone:{...droneField.stats,residualHistory:undefined,forceHistory:undefined}};
fs.writeFileSync(path.join(root,'verification-v085.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
