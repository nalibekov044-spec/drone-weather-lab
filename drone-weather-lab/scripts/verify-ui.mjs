// Non-browser integration smoke test. Canvas is a stub; this does not verify appearance.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const offline = process.argv.includes("--offline");
const html = fs.readFileSync(path.join(root, offline ? "Drone-Weather-Lab-0.85-Beta.html" : "dist/index.html"), "utf8");
class Element {
  constructor(id = "", tag = "div") {
    this.id=id; this.tag=tag; this.value=""; this.checked=false; this.disabled=false; this.hidden=false; this.dataset={}; this.children=[]; this.listeners={}; this.style={}; this.width=800; this.height=520;
    this.classList={ add(){},remove(){},toggle(){},contains(){return false;} };
    this.type=""; this.tagName=tag.toUpperCase(); this.validationMessage="";
  }
  addEventListener(type,callback){ (this.listeners[type] ||= []).push(callback); }
  fire(type,event={}){ for(const f of this.listeners[type]||[]) f({target:this,...event}); }
  append(...children){ this.children.push(...children); children.forEach(c=>{c.parent=this;if(c.id)elements.set(c.id,c);}); }
  replaceChildren(...children){ this.children=[]; this.append(...children); }
  createTHead(){ const n=new Element("","thead"); this.append(n); return n; }
  createTBody(){ const n=new Element("","tbody"); this.append(n); return n; }
  insertRow(){ const n=new Element("","tr"); this.append(n); return n; }
  insertCell(){ const n=new Element("","td"); this.append(n); return n; }
  setAttribute(name,value){(this.attributes ||= {})[name]=value;} getAttribute(name){return this.attributes?.[name] ?? null;}
  closest(selector){return selector==="label" ? (this.parent || new Element()) : /input|textarea|select|button/.test(this.tag) ? this : null;}
  dispatchEvent(event){this.fire(event.type,event);}
  setCustomValidity(message){this.validationMessage=message;}
  checkValidity(){return !this.validationMessage;}
  reportValidity(){return this.checkValidity();}
  blur(){document.activeElement=null;}
  get validity(){return {rangeOverflow:Number(this.value)>Number(this.max||Infinity),rangeUnderflow:Number(this.value)<Number(this.min||0)};}
  querySelectorAll(type){return this.children.flatMap(n=>[...(n.tag===type?[n]:[]),...n.querySelectorAll(type)]);}
  getBoundingClientRect(){return {width:800,height:520,left:0,top:0};}
  setPointerCapture(){} hasPointerCapture(){return false;}
  getContext(){return context2d;}
  click(){this.fire("click");}
}
const context2d = new Proxy({}, {get:(target,key)=>key==="createRadialGradient"||key==="createLinearGradient" ? ()=>({addColorStop(){}}) : key==="measureText" ? ()=>({width:40}) : target[key] || (()=>{}), set:(target,key,value)=>(target[key]=value,true)});
const elements=new Map();
for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){
  const e=new Element(m[2],m[1]);
  e.value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||"";
  e.checked=/\bchecked\b/.test(m[0]); e.disabled=/\bdisabled\b/.test(m[0]);
  e.hidden=/\bhidden\b/.test(m[0]); e.attributes=Object.fromEntries([...m[0].matchAll(/(min|max)="([^"]*)"/g)].map(a=>[a[1],a[2]]));
  e.type=m[0].match(/\btype="([^"]*)"/)?.[1]||"";
  if(m[1]==="select"){
    const content=html.slice(m.index).split("</select>")[0];
    const options=[...content.matchAll(/<option[^>]*value="([^"]+)"[^>]*>/g)];
    e.value=(options.find(o=>o[0].includes("selected"))||options[0])[1];
    e.options=options.map(o=>({value:o[1]}));
  }
  elements.set(e.id,e);
}
const tabs=["flightTab","graphTab","airflowTab","compareTab"].map((id,i)=>{const e=elements.get(id);e.dataset.view=["flight","graph","airflow","compare"][i];return e;});
const panels=["flightView","graphView","airflowView","compareView"].map(id=>elements.get(id));
const weather=["calm","gust","rain"].map(key=>{const e=new Element();e.dataset.weather=key;return e;});
let raf=null; const timers=[]; let solve,trace,parse;
class WorkerStub{
  constructor(url){this.url=String(url);this.listeners={};}
  addEventListener(type,callback){this.listeners[type]=callback;}
  terminate(){}
  postMessage(request){
    if(["cancel","pause","resume"].includes(request.type))return;
    if(this.url.includes("mesh-worker")) {this.onmessage({data:{mesh:parse(request.buffer,request.name)}});return;}
    if(request.type==="trace") {this.listeners.message({data:{type:"lines",key:request.key,traceKey:request.trace.key,lines:trace(this.field,this.config,request.trace.count,request.trace.layer)}});return;}
    this.config=request.config;this.field=solve({...request.config,quality:"fast",maxSteps:50});
    this.listeners.message({data:{type:"result",key:request.key,field:this.field}});
  }
}
const documentListeners={};
const document={ getElementById:id=>elements.get(id)||null, documentElement:new Element(), hidden:false, activeElement:null,
  createElement:tag=>new Element("",tag), addEventListener(type,fn){(documentListeners[type] ||= []).push(fn);}, querySelectorAll:selector=>selector===".mode-tab"?tabs:selector===".view-panel"?panels:selector==="[data-weather]"?weather:selector==='input[type="range"]'?[...elements.values()].filter(e=>e.type==="range"):[] };
const preferences=new Map();
const workerURLs = new Map(); let objectIndex = 0;
class TestBlob extends Blob { constructor(parts, options) { super(parts, options); this.parts = parts; } }
class TestURL extends URL {
  static createObjectURL(blob) {
    const code = blob.parts?.join('') || '';
    const name = code.includes('const mesh = parseMesh') ? 'mesh-worker' : code.includes('solveCFDGenerator') ? 'cfd-worker' : 'download';
    const url = `blob:${name}/${++objectIndex}`; workerURLs.set(url, code); return url;
  }
  static revokeObjectURL(url) { workerURLs.delete(url); }
}
const context=vm.createContext({document,localStorage:{getItem:key=>preferences.get(key),setItem:(key,value)=>preferences.set(key,value)},Event:class{constructor(type){this.type=type;}},window:{devicePixelRatio:1,addEventListener(){}},performance,console,URL:TestURL,Blob:TestBlob,TextDecoder,TextEncoder,Worker:WorkerStub,requestAnimationFrame:callback=>{raf=callback;},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout:id=>{timers[id-1]=null;},getComputedStyle:()=>({getPropertyValue:()=>"#75f3c8"})});
const modules=new Map();
async function load(filename) {
  const absolute = path.resolve(root, filename); if (modules.has(absolute)) return modules.get(absolute);
  const promise = (async () => {
    const mod = new vm.SourceTextModule(fs.readFileSync(absolute, "utf8"), { identifier: absolute, context, initializeImportMeta: meta => { meta.url = `file://${absolute}`; } });
    await mod.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier))); return mod;
  })();
  modules.set(absolute, promise); return promise;
}
for(const [name,assign] of [["cfd-core",m=>solve=m.solveCFD],["flow-lines",m=>trace=m.traceLines],["mesh-import",m=>parse=m.parseMesh]]){const m=await load(`dist/${name}.js`);await m.evaluate();assign(m.namespace);}
if (offline) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
} else {
  const app=await load("dist/app.js");await app.evaluate();
}
let now=performance.now();const tick=()=>{now+=20;raf(now);};
for(let i=0;i<15;i++)tick();
assert(elements.get("batteryCurrent").textContent?.includes("А"));
elements.get("individualMotors").checked=true;elements.get("individualMotors").fire("change");
assert(elements.get("motorGrid").children.length===4);
elements.get("individualMotors").checked=false;elements.get("individualMotors").fire("change");
tabs[1].fire("click");tick();assert(elements.get("graphFormula").textContent);
tabs[2].fire("click");tick();
for(const callback of timers.splice(0))callback?.();tick();tick();
assert(elements.get("cfdStatus").textContent.includes("мс"));
weather[0].fire("click");for(let i=0;i<15;i++)tick();
elements.get("calibratedProps").checked=true;elements.get("calibratedProps").fire("change");assert(!elements.get("ct").disabled);
const cube="v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 4 8 7 3\nf 1 5 8 4\nf 2 3 7 6\n";
elements.get("modelSpan").value="300";
elements.get("modelFile").files=[{name:"cube.obj",size:cube.length,arrayBuffer:async()=>new TextEncoder().encode(cube).buffer}];
await elements.get("modelFile").listeners.change[0]({target:elements.get("modelFile")});
assert(!elements.get("meshCFD").disabled);
elements.get("meshCFD").checked=true;elements.get("meshCFD").fire("change");tick();
assert(elements.get("modelStatus").textContent.includes("замкнутая"));
elements.get("removeModel").fire("click");assert(elements.get("meshCFD").disabled);
elements.get("exportReport").fire("click");
elements.get("resetSimulation").fire("click");tick();assert.equal(elements.get("streamlineCount").value,"360");
elements.get("dronePreset").value="custom";elements.get("dronePreset").fire("change");tick();
assert(!elements.get("builderPanel").hidden && elements.get("frameSize").disabled);
elements.get("bodyHeight").value="180";elements.get("bodyHeight").fire("input");tick();
assert(elements.get("bodyHeightValue").textContent.includes("180"));
elements.get("exportDesign").fire("click");elements.get("saveDesign").fire("click");
for(const callback of timers.splice(0))callback?.();tick();tick();
assert(elements.get("cfdStatus").textContent.includes("мс"));
assert(!elements.get("continueCFD").disabled);elements.get("continueCFD").fire("click");tick();
elements.get("probeX").fire("input");assert(elements.get("probeReading").textContent.includes("м"));
const parameters=Object.fromEntries([...elements].filter(([id,e])=>e.tag==="input"&&e.attributes?.min!==undefined).map(([id,e])=>[id,Number(e.value)]));
for(const id of ["rotors","dronePreset","pressureMode","icing","flowObstacle","bodyShape","rotorLayout"])parameters[id]=id==="rotors"?4:elements.get(id).value;
parameters.bodyHeight=110;
elements.get("loadDesign").files=[{size:2000,text:async()=>JSON.stringify({format:"drone-weather-lab-design",version:1,parameters})}];
await elements.get("loadDesign").listeners.change[0]({target:elements.get("loadDesign")});
assert.equal(elements.get("bodyHeight").value,"110",elements.get("designStatus").textContent);
parameters.bodyHeight=-100;
await elements.get("loadDesign").listeners.change[0]({target:elements.get("loadDesign")});
assert.equal(elements.get("bodyHeight").value,"110");assert(elements.get("designStatus").textContent.includes("диапазона"));
console.log("v0.6 UI: generator, STL export, valid/invalid JSON import, continuation and probe passed.");
// Exercise the same exact input and unit event paths used by the real UI.
tabs[0].fire("click");
const exact = elements.get("massExact"); document.activeElement=exact;
exact.value="1,2375"; exact.fire("input"); assert.equal(elements.get("mass").value,"1.2375");
exact.value="999"; exact.fire("input"); assert(exact.validationMessage); assert.equal(elements.get("mass").value,"1.2375");
exact.value="1.2375"; exact.fire("input"); assert.equal(exact.validationMessage,"");
exact.blur();
elements.get("unitSystem").value="imperial"; elements.get("unitSystem").fire("change");
assert.equal(elements.get("mass").value,"1.2375"); assert(Number(exact.value)>2.7);
assert(elements.get("massValue").textContent.includes("lb"));
assert.equal(preferences.get("drone-lab-units"),"imperial");
document.activeElement=exact; exact.value="3"; exact.fire("input");
assert(Math.abs(Number(elements.get("mass").value)-3/2.20462262185)<1e-9); exact.blur();
const massBefore = elements.get("mass").value;
elements.get("unitSystem").value="metric"; elements.get("unitSystem").fire("change");
assert.equal(elements.get("mass").value,massBefore);
const key = (key,target=new Element()) => documentListeners.keydown.forEach(fn=>fn({key,target,preventDefault(){}}));
elements.get("windSpeed").value="12.345"; elements.get("windSpeed").fire("input");
key("R"); assert.equal(elements.get("windSpeed").value,"12.345");
const toggleBefore=elements.get("toggleSimulation").textContent;
key(" ",elements.get("massExact")); assert.equal(elements.get("toggleSimulation").textContent,toggleBefore);
key("F"); key("G"); tick(); assert(!elements.get("graphView").hidden);
key("?"); assert(!elements.get("shortcutHelp").hidden);
key("1"); for(let i=0;i<15;i++)tick(); assert.equal(elements.get("motorCards").children.length,4);
assert(elements.get("motorCards").children[0].innerHTML.includes("Ресурс"));
console.log("v0.7 UI: exact decimal edits, rejected range overflow, unit preference, canonical preservation, hotkeys and motor cards passed.");
console.log("UI integration passed: initialization, flight, graph, CFD worker messages, weather, coefficients, JSON export and reset. Visual appearance not tested.");

elements.get("captureA").fire("click"); assert(!elements.get("captureB").disabled);
elements.get("payload").value="1.2"; elements.get("payload").fire("input"); elements.get("captureB").fire("click");
assert.equal(elements.get("comparisonResult").children[0].children[1].children.length, 7);
tabs[3].fire("click"); tick(); assert(!elements.get("compareView").hidden);
elements.get("clearComparison").fire("click"); assert(elements.get("captureB").disabled);
const gpuCalls = [], gpu = new Proxy({ createShader:()=>({}), getShaderParameter:()=>true, getProgramParameter:()=>true, createProgram:()=>({}), createBuffer:()=>({}), getUniformLocation:(_,name)=>name, getAttribLocation:(_,name)=>({position:0,normal:1,color:2})[name], TRIANGLES:4, LINES:1, POINTS:0 }, { get:(o,k)=>k in o?o[k]:(...args)=>{gpuCalls.push({name:k,args});} });
const oldContext=Element.prototype.getContext;
Element.prototype.getContext=function(type){return type==="webgl"?gpu:context2d;};
Element.prototype.insertBefore=function(child){this.append(child);};
const hud=new Element("","canvas"), parent=new Element();parent.append(hud);hud.parentNode=parent;
const rendererModule=await load("dist/gpu-scene.js");if(rendererModule.status!=="evaluated")await rendererModule.evaluate();
const renderer=new rendererModule.namespace.GPUScene(hud);
const physicsModule=await load("dist/physics.js");if(physicsModule.status!=="evaluated")await physicsModule.evaluate();
const p={...JSON.parse(JSON.stringify(physicsModule.namespace.baseDefaults))};
const calc=(await load("dist/physics.js")).namespace.calculate(p);
const basis={position:[0,2,6],right:[1,0,0],up:[0,1,0],forward:[0,0,-1],focal:500};
renderer.begin(basis,800,520,1);renderer.model(p,{mode:"flight",modelRevision:0}, {position:[0,0,0]},calc,0);
const firstUploads=gpuCalls.filter(x=>x.name==="bufferData").length;
renderer.begin(basis,800,520,1);renderer.model(p,{mode:"flight",modelRevision:0}, {position:[0,0,0]},calc,1);
assert.equal(gpuCalls.filter(x=>x.name==="bufferData").length,firstUploads,"Model buffers reused on subsequent frames");
for(const call of gpuCalls.filter(x=>x.name==="bufferData"||x.name==="bufferSubData"))assert(call.args[call.name==="bufferData"?1:2].every(Number.isFinite));
assert(gpuCalls.some(x=>x.name==="drawArrays"));
Element.prototype.getContext=oldContext;
console.log("v0.8 UI: A/B capture, compare tab, clear comparison, finite GPU buffers and model buffer reuse passed. WebGL calls stubbed; shader compilation tested separately.");

if (offline) {
  assert([...workerURLs.keys()].some(url => url.includes('cfd-worker')));
  assert([...workerURLs.keys()].some(url => url.includes('mesh-worker')));
  console.log('Standalone UI integration passed. Browser file permissions are not simulated.');
}
