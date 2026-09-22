// Non-browser integration smoke test. Canvas is a stub; this does not verify appearance.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
class Element {
  constructor(id = "", tag = "div") {
    this.id=id; this.tag=tag; this.value=""; this.checked=false; this.disabled=false; this.hidden=false; this.dataset={}; this.children=[]; this.listeners={}; this.style={}; this.width=800; this.height=520;
    this.classList={ add(){},remove(){},toggle(){} };
  }
  addEventListener(type,callback){ (this.listeners[type] ||= []).push(callback); }
  fire(type,event={}){ for(const f of this.listeners[type]||[]) f({target:this,...event}); }
  append(...children){ this.children.push(...children); }
  replaceChildren(){ this.children=[]; }
  setAttribute(){} closest(){return new Element();}
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
  if(m[1]==="select"){
    const content=html.slice(m.index).split("</select>")[0];
    const options=[...content.matchAll(/<option[^>]*value="([^"]+)"[^>]*>/g)];
    e.value=(options.find(o=>o[0].includes("selected"))||options[0])[1];
  }
  elements.set(e.id,e);
}
const tabs=["flightTab","graphTab","airflowTab"].map((id,i)=>{const e=elements.get(id);e.dataset.view=["flight","graph","airflow"][i];return e;});
const panels=["flightView","graphView","airflowView"].map(id=>elements.get(id));
const weather=["calm","gust","rain"].map(key=>{const e=new Element();e.dataset.weather=key;return e;});
let raf=null; const timers=[]; let solve,trace,parse;
class WorkerStub{
  constructor(url){this.url=String(url);this.listeners={};}
  addEventListener(type,callback){this.listeners[type]=callback;}
  terminate(){}
  postMessage(request){
    if(this.url.includes("mesh-worker")) {this.onmessage({data:{mesh:parse(request.buffer,request.name)}});return;}
    if(request.type==="trace") {this.listeners.message({data:{type:"lines",key:request.key,traceKey:request.trace.key,lines:trace(this.field,this.config,request.trace.count,request.trace.layer)}});return;}
    this.config=request.config;this.field=solve(request.config);
    this.listeners.message({data:{type:"result",key:request.key,field:this.field}});
  }
}
const document={ getElementById:id=>elements.get(id)||null, documentElement:new Element(), hidden:false,
  createElement:tag=>new Element("",tag), addEventListener(){}, querySelectorAll:selector=>selector===".mode-tab"?tabs:selector===".view-panel"?panels:selector==="[data-weather]"?weather:[] };
const context=vm.createContext({document,window:{devicePixelRatio:1,addEventListener(){}},performance,console,URL,Blob,TextDecoder,TextEncoder,Worker:WorkerStub,requestAnimationFrame:callback=>{raf=callback;},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout:id=>{timers[id-1]=null;},getComputedStyle:()=>({getPropertyValue:()=>"#75f3c8"})});
const modules=new Map();
async function load(filename){
  const absolute=path.resolve(root,filename);if(modules.has(absolute))return modules.get(absolute);
  const mod=new vm.SourceTextModule(fs.readFileSync(absolute,"utf8"),{identifier:absolute,context,initializeImportMeta:meta=>{meta.url=`file://${absolute}`;}});modules.set(absolute,mod);
  await mod.link((specifier,parent)=>load(path.relative(root,path.resolve(path.dirname(parent.identifier),specifier))));return mod;
}
for(const [name,assign] of [["cfd-core",m=>solve=m.solveCFD],["flow-lines",m=>trace=m.traceLines],["mesh-import",m=>parse=m.parseMesh]]){const m=await load(`dist/${name}.js`);await m.evaluate();assign(m.namespace);}
const app=await load("dist/app.js");await app.evaluate();
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
elements.get("resetSimulation").fire("click");tick();assert.equal(elements.get("streamlineCount").value,"144");
console.log("UI integration passed: initialization, flight, graph, CFD worker messages, weather, coefficients, JSON export and reset. Visual appearance not tested.");
