import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const html=fs.readFileSync(path.join(root,'Drone-Weather-Lab-0.85-Beta.html'),'utf8');
assert(!/<script[^>]+src=|<link[^>]+stylesheet|import\.meta/.test(html));
const sources=JSON.parse(html.match(/const offlineWorkerSources = (.+);/)[1]);
function worker(name) {
  const messages=[],timers=[];
  const self={postMessage(message){messages.push(message);}};
  const context=vm.createContext({self,performance,TextDecoder,TextEncoder,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:id=>{timers[id-1]=null;}});
  vm.runInContext(sources[name],context);
  return {self,messages,drain(){let count=0;while(timers.length){timers.shift()?.();assert(++count<10000);}}};
}
const mesh=worker('mesh-worker.js');
const obj='v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 3 1 4\n';
mesh.self.onmessage({data:{name:'tetra.obj',buffer:new TextEncoder().encode(obj).buffer}});
assert(mesh.messages[0].mesh?.closed);assert.equal(mesh.messages[0].mesh.triangleCount,4);
const cfd=worker('cfd-worker.js');
const config={windSpeed:3,windDirection:0,verticalWind:0,downwashSpeed:0,quality:'fast',maxSteps:25,density:1.225,worldScale:0.36,frameSize:360,geometryParts:[{kind:'ellipsoid',center:[0,0,0],size:[1,1,1],role:'body'}],rotorThrusts:[0,0,0,0],rotors:4,propRadius:0.2,smagorinsky:0.12};
cfd.self.onmessage({data:{type:'solve',key:'offline',config}});cfd.drain();
const result=cfd.messages.find(message=>message.type==='result');assert(result,JSON.stringify(cfd.messages));
assert(result.field.velocityX.every(Number.isFinite));assert(result.field.stats.cells>10000);
cfd.self.onmessage({data:{type:'trace',key:'offline',trace:{key:'lines',count:360,layer:'volume'}}});
assert(cfd.messages.find(message=>message.type==='lines')?.lines.length>0);
console.log('Standalone workers passed: embedded OBJ import, LES field and streamlines. No runtime script or stylesheet requests.');
