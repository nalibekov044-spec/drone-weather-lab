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
    const triangle=(a,b,c)=>faces.push({points:[a,b,c].map(transform),role:part.role});
    if(part.kind==="box"){
      const v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
      for(const [a,b,c,d]of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]]){triangle(v[a],v[b],v[c]);triangle(v[a],v[c],v[d]);}
    }else if(part.kind==="cylinder"){
      for(let i=0;i<20;i++){
        const a=i*Math.PI/10,b=(i+1)*Math.PI/10;
        const p=[Math.cos(a),-1,Math.sin(a)],q=[Math.cos(b),-1,Math.sin(b)],r=[q[0],1,q[2]],s=[p[0],1,p[2]];
        triangle(p,s,r);triangle(p,r,q);triangle([0,1,0],r,s);triangle([0,-1,0],p,q);
      }
    }else{
      const point=(i,j)=>{const phi=-Math.PI/2+i*Math.PI/10,theta=j*Math.PI/10;return [Math.cos(phi)*Math.cos(theta),Math.sin(phi),Math.cos(phi)*Math.sin(theta)];};
      for(let i=0;i<10;i++)for(let j=0;j<20;j++){
        if(i>0)triangle(point(i,j),point(i+1,j),point(i,j+1));
        if(i<9)triangle(point(i,j+1),point(i+1,j),point(i+1,j+1));
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

export function geometryFor(p){
  if(p.dronePreset==="custom")return designGeometry(p);
  const rotors=Array.from({length:p.rotors},(_,i)=>{const angle=i*2*Math.PI/p.rotors+(p.rotors===4?Math.PI/4:0);return {x:Math.cos(angle)*0.72,z:Math.sin(angle)*0.72,y:Math.sin(angle)*0.72,diskY:0.17,angle};});
  return {rotors,worldScale:p.frameSize/1440,parts:null};
}
