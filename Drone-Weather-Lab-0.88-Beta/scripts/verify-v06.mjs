// Numerical regression tests, not aerodynamic validation of a real aircraft.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const modules=new Map();
async function load(name){
  const file=path.resolve(root,name);if(modules.has(file))return modules.get(file);
  const m=new vm.SourceTextModule(fs.readFileSync(file,"utf8"),{identifier:file});modules.set(file,m);
  await m.link((s,p)=>load(path.relative(root,path.resolve(path.dirname(p.identifier),s))));return m;
}
const cfd=await load("dist/cfd-core.js");await cfd.evaluate();
const builder=await load("dist/drone-builder.js");await builder.evaluate();
const physics=await load("dist/physics.js");await physics.evaluate();
const mesh=await load("dist/mesh-import.js");await mesh.evaluate();
const {solveCFD,solveCFDGenerator,collideCell}=cfd.namespace;
const {baseDefaults,calculate}=physics.namespace;
const {designGeometry,containsPart,triangulateParts,exportDesignSTL}=builder.namespace;
const cx=[0,1,-1,0,0,0,0,1,-1,1,-1,1,-1,1,-1,0,0,0,0];
const cy=[0,0,0,1,-1,0,0,1,-1,-1,1,0,0,0,0,1,-1,1,-1];
const cz=[0,0,0,0,0,1,-1,0,0,0,0,1,-1,-1,1,1,-1,-1,1];
const weights=[1/3,...Array(6).fill(1/18),...Array(12).fill(1/36)];
const f=Float64Array.from(weights,(w,q)=>w*(1+0.008*Math.sin(q*2.19)));
const rho=f.reduce((s,x)=>s+x,0),momentum=[cx,cy,cz].map(c=>f.reduce((s,x,q)=>s+x*c[q],0));
const force=[0.0002,-0.0003,0.0001],u=momentum.map((m,i)=>(m+force[i]*0.5)/rho);
for(const [even,odd] of [[1/.54,1/(.5+.1875/.04)],[1/.62,1/.62]]){
  const out=new Float64Array(19);collideCell(f,0,1,rho,...u,...force,even,odd,out);
  assert(Math.abs(out.reduce((s,x)=>s+x,0)-rho)<1e-12,"Collision mass conservation");
  for(let axis=0;axis<3;axis++)assert(Math.abs(out.reduce((s,x,q)=>s+x*[cx,cy,cz][axis][q],0)-momentum[axis]-force[axis])<1e-12,"Guo full momentum increment");
}
const base={...baseDefaults,quality:"fast",maxSteps:80,density:1.2,rotorThrusts:[0,0,0,0],downwashSpeed:0,emptyDomain:true,flowObstacle:"none"};
for(const mode of ["trt","bgk"]){
  for(const [speed,angle,vertical] of [[0,0,0],[7,0,0],[5,137,-2]]){
    const field=solveCFD({...base,solverMode:mode,windSpeed:speed,windDirection:angle,verticalWind:vertical});
    const expected=[speed*Math.cos(angle*Math.PI/180),vertical,speed*Math.sin(angle*Math.PI/180)];
    let maxError=0;
    for(let i=0;i<field.solid.length;i++)for(let a=0;a<3;a++)maxError=Math.max(maxError,Math.abs(field[["velocityX","velocityY","velocityZ"][a]][i]-expected[a]));
    assert(maxError<0.0001,`${mode} uniform-flow error ${maxError}`);
    assert(field.stats.solidCells===0);
    console.log(JSON.stringify({test:"uniform flow",mode,speed,angle,vertical,maxError}));
  }
}
const p={...baseDefaults,dronePreset:"custom"},g=designGeometry(p),r=calculate(p);
assert(containsPart(g.parts[0],0,0,0));assert(!containsPart(g.parts[0],2,2,2));
assert(g.rotors.length===4&&g.clearance>0);
assert(designGeometry({...p,bodyHeight:160}).bodyVolume===g.bodyVolume*2);
assert(designGeometry({...p,armLength:100}).clearance<0);
for(const shape of ["ellipsoid","box"]){
  const geometry=designGeometry({...p,bodyShape:shape});
  for(const part of geometry.parts){
    const faces=triangulateParts([part]);
    for(const {points:[a,b,c]}of faces){
      const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert(n.reduce((s,v,i)=>s+v*((a[i]+b[i]+c[i])/3-part.center[i]),0)>-1e-12,"Outward STL normal");
    }
  }
  const stl=exportDesignSTL({...p,bodyShape:shape});
  const parsed=mesh.namespace.parseMesh(new TextEncoder().encode(stl).buffer,"generated.stl");
  assert(parsed.closed,"Each STL component has a closed boundary (not boolean-unioned)");
}
const config={...base,emptyDomain:false,maxSteps:80,geometryParts:g.parts,rotorCenters:g.rotors,worldScale:g.worldScale,propRadius:p.diameter*.0254/(2*g.worldScale),rotorThrusts:r.rotorThrusts,downwashSpeed:r.downwashSpeed};
const drain=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
const first=drain(solveCFDGenerator(config)),continued=drain(solveCFDGenerator(config,null,first._resume)),full=solveCFD({...config,maxSteps:160});
assert(continued.stats.iterations===160);
for(const key of ["velocityX","velocityY","velocityZ","pressure"]){
  let error=0;for(let i=0;i<full[key].length;i++)error=Math.max(error,Math.abs(full[key][i]-continued[key][i]));
  assert(error<1e-6,`Continuation mismatch ${key}: ${error}`);
}
const tall=designGeometry({...p,bodyHeight:240});
const tallField=solveCFD({...config,maxSteps:20,geometryParts:tall.parts});
assert(tallField.stats.solidCells>first.stats.solidCells,"Designer height changes CFD obstacle");
const hover=solveCFD({...config,windSpeed:0,verticalWind:0,maxSteps:200});
let symmetryError=0;
for(let y=0;y<hover.ny;y++)for(let z=0;z<hover.nz;z++)for(let x=0;x<hover.nx;x++){
  const a=x+hover.nx*(z+hover.nz*y),b=(hover.nx-1-x)+hover.nx*(z+hover.nz*y);
  symmetryError=Math.max(symmetryError,Math.abs(hover.velocityY[a]-hover.velocityY[b]));
}
assert(symmetryError<0.0001,`Hover mirror symmetry ${symmetryError}`);
assert(Math.abs(hover.stats.appliedThrust-r.requiredVertical)<1e-6);
console.log(JSON.stringify({test:"designer, continuation, hover",symmetryError,solidCells:first.stats.solidCells,tallSolidCells:tallField.stats.solidCells,method:hover.stats.method}));
const deep=solveCFD({...config,maxSteps:600});
assert(deep.velocityY.every(Number.isFinite));
console.log(JSON.stringify({test:"600-step designer",residual:deep.stats.residual,mach:deep.stats.maxLatticeMach,elapsedMs:deep.stats.elapsedMs}));
// Exercise the actual browser worker's chunk scheduler, not a synchronous stub.
const messages=[];let waiter=null;
globalThis.self={postMessage:m=>{messages.push(m);waiter?.();}};
const worker=await load("dist/cfd-worker.js");await worker.evaluate();
const send=data=>self.onmessage({data});
const until=predicate=>new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{waiter=null;reject(new Error("Worker timeout"));},15000);
  waiter=()=>{const failure=messages.find(m=>m.type==="error");if(failure){clearTimeout(timeout);waiter=null;reject(new Error(failure.message));}else if(predicate()){clearTimeout(timeout);waiter=null;resolve();}};waiter();
});
send({key:"A",config});send({type:"pause"});const pausedLength=messages.length;
await new Promise(resolve=>setTimeout(resolve,15));assert.equal(messages.length,pausedLength,"Paused worker must not compute more chunks");
send({type:"resume"});await until(()=>messages.some(m=>m.key==="A"&&m.type==="result"));
send({key:"A",config,type:"continue"});await until(()=>messages.filter(m=>m.key==="A"&&m.type==="result").length===2);
assert.equal(messages.filter(m=>m.key==="A"&&m.type==="result").at(-1).field.stats.iterations,160);
send({key:"cancel-me",config});send({type:"cancel"});send({key:"B",config:{...config,windSpeed:10}});
await until(()=>messages.some(m=>m.key==="B"&&m.type==="result"));
assert(!messages.some(m=>m.key==="cancel-me"&&m.type==="result"));
send({type:"trace",key:"B",trace:{key:"dense",count:600,layer:"volume"}});
assert(messages.some(m=>m.type==="lines"&&m.lines.length>400));
delete globalThis.self;
console.log("Actual worker: pause/resume, warm continuation, stale cancellation and 600-line tracing passed.");
console.log("v0.6 numerical regression passed. No grid-convergence or experimental validation claimed.");
