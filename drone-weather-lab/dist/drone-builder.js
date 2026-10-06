// One geometry definition for rendering, collision masks, rotor locations and CAD export.
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const builderDefaults = {
  bodyLength: 230, bodyWidth: 150, bodyHeight: 80, armLength: 280,
  armThickness: 22, frameStretch: 1, motorDiameter: 38, motorHeight: 32,
  bodyShape: "ellipsoid", rotorLayout: "x"
};
export function designGeometry(p) {
  const d = { ...builderDefaults, ...p };
  const stretch = clamp(Number(d.frameStretch), 0.6, 1.6);
  const radius = Number(d.armLength) / 1000;
  const scale = Math.max(radius * Math.max(1,stretch) * 2, d.bodyLength/1000, d.bodyWidth/1000, d.bodyHeight/1000, 0.12) / 1.44;
  const mm = v => Number(v) / 1000 / scale;
  const width=mm(d.bodyWidth), height=mm(d.bodyHeight), depth=mm(d.bodyLength);
  const parts=[{ kind:d.bodyShape === "box" ? "box":"ellipsoid",center:[0,0,0],size:[width,height,depth],rotation:0,role:"body" }];
  const count = [4,6,8].includes(Number(d.rotors)) ? Number(d.rotors) : 4;
  const motors=[];
  for(let i=0;i<count;i++){
    const angle=i*Math.PI*2/count+(d.rotorLayout==="x" ? Math.PI/count : 0);
    const x=Math.cos(angle)*radius/scale, z=Math.sin(angle)*radius*stretch/scale;
    const length=Math.hypot(x,z), yaw=Math.atan2(z,x), thick=mm(d.armThickness);
    // Embed beam roots in the body without coincident center edges in CAD export.
    const root=Math.min(length*0.2,width*0.2,depth*0.2),centerScale=(length+root)/(2*length);
    parts.push({kind:"box",center:[x*centerScale,0,z*centerScale],size:[length-root,thick,thick],rotation:yaw,role:"arm"});
    const motorY=thick/2+mm(d.motorHeight)/2;
    parts.push({kind:"cylinder",center:[x,motorY,z],size:[mm(d.motorDiameter),mm(d.motorHeight),mm(d.motorDiameter)],rotation:0,role:"motor"});
    motors.push({x,y:z,z,diskY:motorY+mm(d.motorHeight)/2+0.015,angle});
  }
  let clearance=Infinity;
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)clearance=Math.min(clearance,Math.hypot(motors[i].x-motors[j].x,motors[i].z-motors[j].z)*scale-Number(d.diameter)*0.0254);
  const volume = d.bodyLength*d.bodyWidth*d.bodyHeight/1e9*(d.bodyShape==="box"?1:Math.PI/6);
  return { parts,rotors:motors,worldScale:scale,clearance,bodyVolume:volume,frameSize:radius*2*Math.max(1,stretch)*1000 };
}

export function containsPart(part,x,y,z){
  x-=part.center[0];y-=part.center[1];z-=part.center[2];
  const c=Math.cos(part.rotation||0),s=Math.sin(part.rotation||0);
  const a=(x*c+z*s)/(part.size[0]/2), b=y/(part.size[1]/2), e=(-x*s+z*c)/(part.size[2]/2);
  return part.kind==="ellipsoid" ? a*a+b*b+e*e<=1 : part.kind==="cylinder" ? a*a+e*e<=1&&Math.abs(b)<=1 : Math.max(Math.abs(a),Math.abs(b),Math.abs(e))<=1;
}

export function triangulateParts(parts){
  const faces=[];
  for(const part of parts){
    const transform=p=>{
      const x=p[0]*part.size[0]/2,y=p[1]*part.size[1]/2,z=p[2]*part.size[2]/2;
      const c=Math.cos(part.rotation||0),s=Math.sin(part.rotation||0);
      return [x*c-z*s+part.center[0],y+part.center[1],x*s+z*c+part.center[2]];
    };
    const triangle=(a,b,c)=>faces.push({points:[a,b,c].map(transform),role:part.role,part});
    if(part.kind==="box"){
      const v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
      for(const [a,b,c,d]of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]]){triangle(v[a],v[b],v[c]);triangle(v[a],v[c],v[d]);}
    }else if(part.kind==="cylinder"){
      for(let i=0;i<32;i++){
        const a=i*Math.PI/16,b=(i+1)*Math.PI/16;
        const p=[Math.cos(a),-1,Math.sin(a)],q=[Math.cos(b),-1,Math.sin(b)],r=[q[0],1,q[2]],s=[p[0],1,p[2]];
        triangle(p,s,r);triangle(p,r,q);triangle([0,1,0],r,s);triangle([0,-1,0],p,q);
      }
    }else{
      const point=(i,j)=>{const phi=-Math.PI/2+i*Math.PI/16,theta=j*Math.PI/16;return [Math.cos(phi)*Math.cos(theta),Math.sin(phi),Math.cos(phi)*Math.sin(theta)];};
      for(let i=0;i<16;i++)for(let j=0;j<32;j++){
        if(i>0)triangle(point(i,j),point(i+1,j),point(i,j+1));
        if(i<15)triangle(point(i,j+1),point(i+1,j),point(i+1,j+1));
      }
    }
  }
  return faces;
}

export function exportDesignSTL(p){
  const g=designGeometry(p), faces=triangulateParts(g.parts), output=["solid drone_weather_lab"];
  for(const face of faces){
    const [a,b,c]=face.points.map(v=>v.map(x=>x*g.worldScale*1000));
    const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]], norm=Math.hypot(...n)||1;
    output.push(`facet normal ${n.map(x=>x/norm).join(" ")}`,"outer loop",... [a,b,c].map(v=>`vertex ${v.join(" ")}`),"endloop","endfacet");
  }
  output.push("endsolid drone_weather_lab");return output.join("\n");
}

export function visualDetails(p, geometry) {
  const parts = [], body = geometry.parts.find(part => part.role === "body");
  const add = (kind, center, size, role, rotation = 0) => parts.push({ kind, center, size, role, rotation });
  const racing = p.dronePreset === "racing";
  for (let i = 0; i < geometry.rotors.length; i++) {
    const rotor = geometry.rotors[i], motor = geometry.parts.filter(part => part.role === "motor")[i];
    if (!motor) continue;
    const diameter = motor.size[0], height = motor.size[1], top = motor.center[1] + height / 2;
    add("cylinder", [rotor.x, top - height * 0.08, rotor.z], [diameter * 1.03, height * 0.12, diameter * 1.03], "motorRing");
    add("cylinder", [rotor.x, rotor.diskY, rotor.z], [diameter * 0.34, height * 0.27, diameter * 0.34], "hub");
    for (let n = 0; n < 8; n++) {
      const angle = n * Math.PI / 4, radius = diameter * 0.45;
      add("box", [rotor.x + Math.cos(angle) * radius, motor.center[1], rotor.z + Math.sin(angle) * radius], [diameter * 0.13, height * 0.53, diameter * 0.06], "vent", angle);
    }
    const arm = geometry.parts.filter(part => part.role === "arm")[i];
    if (arm) add("box", [arm.center[0], arm.center[1] + arm.size[1] * 0.52, arm.center[2]], [arm.size[0] * 0.72, arm.size[1] * 0.07, arm.size[2] * 0.22], i % 2 ? "rearLight" : "frontLight", arm.rotation);
  }
  const battery = geometry.parts.find(part => part.role === "battery");
  if (battery) for (const position of [-0.25, 0.25]) add("box", [battery.center[0], battery.center[1] + battery.size[1] * 0.52, battery.center[2] + battery.size[2] * position], [battery.size[0] * 1.1, 0.014, battery.size[2] * 0.08], "strap");
  if (!body) return parts;
  const [width, height, depth] = body.size;
  const [x, y, z] = body.center;
  for (const side of [-1, 1]) {
    add("box", [x + side * width * 0.41, y + height * 0.2, z], [width * 0.035, height * 0.11, depth * 0.6], "trim");
    for (let n = 0; n < 5; n++) add("box", [x + side * width * 0.4, y, z + (n - 2) * depth * 0.06], [width * 0.07, height * 0.15, depth * 0.024], "vent");
  }
  if (p.dronePreset !== "custom") {
    const camera = geometry.parts.find(part => part.role === "camera");
    if (camera) {
      add("ellipsoid", [camera.center[0], camera.center[1], camera.center[2] - camera.size[2] * 0.45], [0.09, 0.09, 0.055], "lens");
      for (const side of [-1, 1]) add("box", [side * 0.077, camera.center[1] + 0.035, camera.center[2]], [0.024, 0.13, 0.026], "cameraMount");
    }
    add("cylinder", [0, y + height * 0.6, depth * 0.28], [0.13, 0.045, 0.13], "gps");
    add("cylinder", [width * 0.3, y + height * 0.95, depth * 0.32], [0.014, height * 0.75, 0.014], "antenna");
  }
  if (racing) add("box", [0, y - height * 0.48, 0], [width * 1.15, height * 0.08, depth * 1.06], "carbon");
  return parts;
}

export function geometryFor(p) {
  if (p.dronePreset === "custom") return designGeometry(p);
  const rotors = Array.from({ length: p.rotors }, (_, i) => {
    const angle = i * 2 * Math.PI / p.rotors + (p.rotors === 4 ? Math.PI / 4 : 0);
    return { x: Math.cos(angle) * 0.72, z: Math.sin(angle) * 0.72, y: Math.sin(angle) * 0.72, diskY: 0.17, angle };
  });
  const racing = p.dronePreset === "racing", cargo = p.dronePreset === "cargoOcto", hex = p.dronePreset === "industrialHex";
  const parts = [{ kind: hex ? "cylinder" : racing ? "box" : "ellipsoid", center: [0, 0.03, 0], size: cargo ? [0.58, 0.24, 0.66] : racing ? [0.34, 0.12, 0.52] : [0.48, 0.24, 0.62], role: "body" }];
  for (const r of rotors) {
    parts.push({ kind: "box", center: [r.x * 0.55, 0, r.z * 0.55], size: [0.65, racing ? 0.036 : 0.06, racing ? 0.05 : 0.075], rotation: r.angle, role: "arm" });
    parts.push({ kind: "cylinder", center: [r.x, 0.07, r.z], size: [0.13, 0.14, 0.13], role: "motor" });
  }
  parts.push({ kind: "box", center: [0, racing ? 0.14 : 0.2, 0.04], size: [0.2, 0.1, 0.34], role: "battery" });
  parts.push({ kind: "cylinder", center: [0, -0.18, -0.22], size: [0.12, 0.14, 0.12], role: "camera" });
  if (cargo) parts.push({ kind: "box", center: [0, -0.27, 0], size: [0.48, 0.32, 0.54], role: "payload" });
  if (!racing) for (const x of [-0.28, 0.28]) {
    for (const z of [-0.16, 0.2]) parts.push({ kind: "box", center: [x, -0.32, z], size: [0.035, 0.47, 0.035], role: "landing" });
    parts.push({ kind: "box", center: [x, -0.55, 0.02], size: [0.05, 0.04, 0.56], role: "landing" });
  }
  return { rotors, worldScale: p.frameSize / 1440, parts };
}
