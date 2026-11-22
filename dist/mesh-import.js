// Local-only CAD mesh ingestion; no file is sent to a server.
export const MAX_TRIANGLES = 40000;
// 0.95: files up to 64 MB and up to 2 million triangles are read; meshes above 40 000 triangles are
// simplified by vertex clustering, so a detailed export from Fusion 360 no longer has to be redone.
export const MAX_SOURCE_TRIANGLES = 2000000;
export const LIMIT_BYTES = 64 * 1024 * 1024;

export function parseMesh(buffer, name) {
  if (Object.prototype.toString.call(buffer) !== "[object ArrayBuffer]") throw new Error("Нужен бинарный буфер файла.");
  if (buffer.byteLength > LIMIT_BYTES) throw new Error("Файл больше 64 МБ. Экспортируй облегчённую сетку из CAD.");
  const triangles = [];
  const push = values => {
    if (triangles.length >= MAX_SOURCE_TRIANGLES * 9) throw new Error("Больше 2 миллионов треугольников. Уменьши детализацию экспорта.");
    if (values.length !== 9 || values.some(v => !Number.isFinite(v) || Math.abs(v) > 1e10)) throw new Error("Некорректные координаты модели.");
    triangles.push(...values);
  };
  if (/\.stl$/i.test(name)) {
    const view = new DataView(buffer);
    const count = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0;
    if (count > 0 && 84 + count * 50 === buffer.byteLength) {
      if (count > MAX_SOURCE_TRIANGLES) throw new Error("Больше 2 миллионов треугольников. Уменьши детализацию экспорта.");
      for (let i = 0; i < count; i++) {
        const values = [];
        for (let j = 0; j < 9; j++) values.push(view.getFloat32(84 + i * 50 + 12 + j * 4, true));
        push(values);
      }
    } else {
      const text = new TextDecoder().decode(buffer);
      const vertices = [...text.matchAll(/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/gi)].map(m => m.slice(1).map(Number));
      if ((text.match(/\bvertex\b/gi) || []).length !== vertices.length || vertices.length % 3) throw new Error("Повреждённая STL-сетка.");
      for (let i = 0; i < vertices.length; i += 3) push(vertices.slice(i, i + 3).flat());
    }
  } else if (/\.obj$/i.test(name)) {
    const vertices = [];
    for (const raw of new TextDecoder().decode(buffer).split(/\r?\n/)) {
      const parts = raw.replace(/^\uFEFF/, "").split("#")[0].trim().split(/\s+/);
      if (parts[0] === "v") {
        const v = parts.slice(1, 4).map(Number);
        if (v.length !== 3 || v.some(x => !Number.isFinite(x) || Math.abs(x) > 1e10)) throw new Error("Некорректная вершина OBJ.");
        vertices.push(v);
      }
      if (vertices.length > 6000000) throw new Error("Слишком много вершин.");
      if (parts[0] !== "f") continue;
      const face = parts.slice(1).filter(p => !p.startsWith("#")).map(p => {
        const n = Number(p.split("/")[0]);
        const index = n < 0 ? vertices.length + n : n - 1;
        if (!Number.isInteger(n) || !vertices[index]) throw new Error("Некорректные индексы OBJ.");
        return vertices[index];
      });
      for (const triangle of triangulateFace(face)) push(triangle.flat());
    }
  } else if (/\.3mf$/i.test(name) && Array.isArray(buffer.meshTriangles)) {
    for (const t of buffer.meshTriangles) push(t);
  } else throw new Error("Поддерживаются STL, OBJ и 3MF. Из STEP / CAD сначала экспортируй сетку.");
  return finishMesh(triangles, name);
}

// Shared by STL, OBJ and 3MF: centre and normalize, simplify large meshes, check closure, measure.
function finishMesh(input, name) {
  let triangles = input;
  if (!triangles.length) throw new Error("В файле нет треугольной геометрии.");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < triangles.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], triangles[i]); max[axis] = Math.max(max[axis], triangles[i]);
  }
  const span = Math.max(...max.map((v, i) => v - min[i]));
  if (!(span > 1e-9)) throw new Error("Модель имеет нулевой размер.");
  const center = min.map((v, i) => (v + max[i]) / 2);
  const sourceCount = triangles.length / 9;
  let normalized = Float32Array.from(triangles, (v, i) => (v - center[i % 3]) / span);
  if (sourceCount > MAX_TRIANGLES) normalized = simplifyMesh(normalized, MAX_TRIANGLES);
  const edges = new Map();
  let degenerate = 0;
  const key = offset => [0, 1, 2].map(a => Math.round(normalized[offset + a] * 1e6)).join(",");
  for (let i = 0; i < normalized.length; i += 9) {
    const keys = [key(i), key(i + 3), key(i + 6)];
    const ab = [0,1,2].map(a => normalized[i+3+a]-normalized[i+a]), ac = [0,1,2].map(a => normalized[i+6+a]-normalized[i+a]);
    const area2 = Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
    if (new Set(keys).size < 3 || area2 < 1e-12) degenerate++;
    for (let j = 0; j < 3; j++) {
      const a = keys[j], b = keys[(j + 1) % 3], edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  const badEdges = [...edges.values()].filter(n => n !== 2).length;
  const sourceDimensions = max.map((v, i) => v - min[i]);
  const measures = meshMeasures(normalized);
  return { name, sourceBounds: { min, max }, sourceDimensions, sourceSpan: span, triangles: normalized, preview: makePreview(normalized), triangleCount: normalized.length / 9, sourceTriangleCount: sourceCount, simplified: sourceCount > MAX_TRIANGLES, closed: badEdges === 0 && degenerate === 0, badEdges, degenerate,
    // Volume and area in source units (the mesh is stored divided by its span).
    sourceVolume: measures.volume * span ** 3, sourceArea: measures.area * span ** 2,
    unitGuess: guessUnits(span), upGuess: guessUp(sourceDimensions) };
}

// Vertex clustering: snap vertices to a grid and drop collapsed or repeated faces, coarsening until the
// count fits. Shape and outline are kept; small details merge.
export function simplifyMesh(triangles, limit) {
  let fallback = null, tries = 0;
  for (let resolution = 512; resolution >= 8; resolution = Math.floor(resolution * 0.85)) {
    const out = [], seen = new Set();
    for (let i = 0; i < triangles.length; i += 9) {
      const points = [0, 3, 6].map(o => [0, 1, 2].map(a => Math.round(triangles[i + o + a] * resolution)));
      const keys = points.map(p => p.join(","));
      if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) continue;
      const sorted = [...keys].sort().join("|");
      if (seen.has(sorted)) continue;
      seen.add(sorted);
      for (const p of points) out.push(p[0] / resolution, p[1] / resolution, p[2] / resolution);
      if (out.length / 9 > limit) break;
    }
    if (!(out.length / 9 <= limit && out.length)) continue;
    const result = Float32Array.from(out);
    // Clustering can pinch thin parts; a slightly coarser grid often closes the surface again.
    if (openEdges(result) === 0) return result;
    fallback ??= result;
    if (++tries >= 6) break;
  }
  if (fallback) return fallback;
  throw new Error("Не удалось упростить сетку. Уменьши детализацию экспорта.");
}

function openEdges(t) {
  const edges = new Map(), key = o => `${t[o]},${t[o + 1]},${t[o + 2]}`;
  for (let i = 0; i < t.length; i += 9) {
    const k = [key(i), key(i + 3), key(i + 6)];
    for (let j = 0; j < 3; j++) {
      const a = k[j], b = k[(j + 1) % 3], e = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  let bad = 0;
  for (const n of edges.values()) if (n !== 2) bad++;
  return bad;
}

// Enclosed volume by the divergence theorem (exact for a closed mesh) and surface area.
export function meshMeasures(t) {
  let volume = 0, area = 0;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return { volume: Math.abs(volume), area };
}

// A drone body is usually 6 cm to 1.5 m across. The unit that puts the largest size in that range is the guess.
export function guessUnits(span) {
  const fits = [["mm", 1], ["cm", 10], ["m", 1000], ["in", 25.4]].filter(([, f]) => span * f >= 60 && span * f <= 1500);
  if (fits.length === 0) return null;
  // Millimetres first: STL from CAD is millimetres in almost all cases.
  return fits[0][0];
}

// The thinnest axis of a flat frame is usually the vertical one.
export function guessUp(dimensions) {
  const order = [0, 1, 2].sort((a, b) => dimensions[a] - dimensions[b]);
  if (dimensions[order[0]] > 0.8 * dimensions[order[1]]) return null;
  return ["x", "y", "z"][order[0]];
}

// 3MF (Fusion 360, PrusaSlicer, Bambu Studio): a ZIP with an XML mesh. Read with the browser's own inflater.
export async function read3mf(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("Повреждённый 3MF: это не ZIP-архив.");
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const triangles = [];
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Повреждённый 3MF.");
    const method = view.getUint16(offset + 10, true), compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const entryName = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!/\.model$/i.test(entryName)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    let xml;
    if (method === 0) xml = new TextDecoder().decode(data);
    else if (method === 8) xml = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    else throw new Error("Этот способ сжатия 3MF не поддерживается.");
    parse3mfModel(xml, triangles);
  }
  if (!triangles.length) throw new Error("В 3MF нет сетки.");
  return triangles;
}

function parse3mfModel(xml, out) {
  // Objects with their own vertices and triangles; build items and components are placed as exported.
  for (const mesh of xml.matchAll(/<(?:\w+:)?mesh\b[\s\S]*?<\/(?:\w+:)?mesh>/g)) {
    const vertices = [...mesh[0].matchAll(/<(?:\w+:)?vertex\b([^>]*)\/?>/g)].map(m => ["x", "y", "z"].map(a => Number((m[1].match(new RegExp(`\\b${a}="([^"]+)"`)) || [])[1])));
    for (const m of mesh[0].matchAll(/<(?:\w+:)?triangle\b([^>]*)\/?>/g)) {
      const idx = ["v1", "v2", "v3"].map(a => Number((m[1].match(new RegExp(`\\b${a}="(\\d+)"`)) || [])[1]));
      if (idx.some(i => !vertices[i] || vertices[i].some(v => !Number.isFinite(v)))) throw new Error("Некорректные индексы 3MF.");
      out.push(idx.flatMap(i => vertices[i]));
    }
  }
}

export async function parseMeshAsync(buffer, name) {
  if (/\.3mf$/i.test(name)) {
    if (buffer.byteLength > LIMIT_BYTES) throw new Error("Файл больше 64 МБ. Экспортируй облегчённую сетку из CAD.");
    const triangles = await read3mf(buffer);
    if (triangles.length > MAX_SOURCE_TRIANGLES) throw new Error("Больше 2 миллионов треугольников. Уменьши детализацию экспорта.");
    return finishMesh(triangles.flat(), name);
  }
  return parseMesh(buffer, name);
}

function makePreview(triangles) {
  if (triangles.length / 9 <= 3000) return triangles.slice();
  // Shared vertex clustering gives a coherent coarse surface instead of dropping random faces.
  for (const resolution of [48, 32, 24, 16, 12, 8, 6, 4, 2]) {
    const result = [], seen = new Set();
    for (let i = 0; i < triangles.length; i += 9) {
      const points = [0,3,6].map(o => [0,1,2].map(a => Math.round(triangles[i+o+a] * resolution)));
      const keys = points.map(p => p.join(","));
      if (new Set(keys).size < 3) continue;
      const key = [...keys].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key); result.push(...points.flat().map(v => v / resolution));
    }
    if (result.length / 9 <= 3000 && result.length) return Float32Array.from(result);
  }
  return triangles.slice();
}

export function transformMesh(mesh, spanWorld, upAxis = "y", yawDegrees = 0) {
  const data = new Float32Array(mesh.triangles.length);
  const angle = yawDegrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < data.length; i += 3) {
    let x = mesh.triangles[i], y = mesh.triangles[i + 1], z = mesh.triangles[i + 2];
    if (upAxis === "z") [y, z] = [z, -y];
    if (upAxis === "x") [x, y] = [-y, x];
    data[i] = (x * c - z * s) * spanWorld;
    data[i + 1] = y * spanWorld;
    data[i + 2] = (x * s + z * c) * spanWorld;
  }
  return data;
}

// Column ray casting. Only watertight meshes are eligible for an interior mask.
export function voxelizeMesh(triangles, nx, ny, nz, bounds) {
  const columns = Array.from({ length: nx * nz }, () => []);
  const dx = (bounds.xMax - bounds.xMin) / (nx - 1), dy = (bounds.yMax - bounds.yMin) / (ny - 1), dz = (bounds.zMax - bounds.zMin) / (nz - 1);
  for (let i = 0; i < triangles.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(i, i + 9);
    const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(determinant) < 1e-12) continue;
    const x0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - bounds.xMin) / dx));
    const x1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - bounds.xMin) / dx));
    const z0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - bounds.zMin) / dz));
    const z1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - bounds.zMin) / dz));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      // Tiny deterministic jitter avoids double hits exactly along shared edges.
      const x = bounds.xMin + ix * dx + dx * 1e-7, z = bounds.zMin + iz * dz + dz * 1.7e-7;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant;
      if (u >= 0 && v >= 0 && u + v <= 1) columns[ix + nx * iz].push(u * ay + v * by + (1 - u - v) * cy);
    }
  }
  const solid = new Uint8Array(nx * ny * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const hits = columns[ix + nx * iz].sort((a, b) => a - b).filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > dy * 1e-5);
    for (let j = 0; j + 1 < hits.length; j += 2) {
      const from = Math.max(1, Math.ceil((hits[j] - bounds.yMin) / dy)), to = Math.min(ny - 2, Math.floor((hits[j + 1] - bounds.yMin) / dy));
      for (let iy = from; iy <= to; iy++) solid[ix + nx * (iz + nz * iy)] = 1;
    }
  }
  return solid;
}

// Ear clipping preserves concave OBJ outlines; a triangle fan can fill their cut-outs.
function triangulateFace(face) {
  if (face.length > 512) throw new Error("В грани больше 512 вершин. Экспортируй OBJ с триангуляцией.");
  if (face.length < 3) throw new Error("В грани OBJ меньше трёх вершин.");
  if (face.length === 3) return [face];
  const origin = face[0];
  face = face.map(v=>v.map((x,i)=>x-origin[i]));
  const normal = [0,0,0];
  for (let i=0;i<face.length;i++) {
    const a=face[i], b=face[(i+1)%face.length];
    normal[0]+=(a[1]-b[1])*(a[2]+b[2]); normal[1]+=(a[2]-b[2])*(a[0]+b[0]); normal[2]+=(a[0]-b[0])*(a[1]+b[1]);
  }
  const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  if (Math.hypot(...normal) < 1e-14) throw new Error("Вырожденная грань OBJ.");
  const scale = Math.max(...face.flat().map(Math.abs),1), tolerance = scale * 1e-7;
  const n = Math.hypot(...normal);
  if (face.some(v => Math.abs(v.reduce((sum,x,i)=>sum+(x-face[0][i])*normal[i],0))/n > tolerance))
    throw new Error("Неплоская грань OBJ: экспортируй с триангуляцией.");
  const axis = [0,1,2].filter(i=>i!==drop), points=face.map(v=>axis.map(i=>v[i]));
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  const sign=Math.sign(area), remaining=points.map((_,i)=>i), result=[];
  const eps=Math.max(1e-20,Math.abs(area)*1e-12);
  while (remaining.length>3) {
    let found=false;
    for (let i=0;i<remaining.length;i++) {
      const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
      if (cross(points[a],points[b],points[c])*sign<=eps) continue;
      if (remaining.some(j=>j!==a&&j!==b&&j!==c&&cross(points[a],points[b],points[j])*sign>=-eps&&cross(points[b],points[c],points[j])*sign>=-eps&&cross(points[c],points[a],points[j])*sign>=-eps)) continue;
      result.push([face[a],face[b],face[c]]);remaining.splice(i,1);found=true;break;
    }
    if (!found) throw new Error("Самопересечение или повторные вершины OBJ. Экспортируй треугольники.");
  }
  result.push(remaining.map(i=>face[i]));return result.map(triangle=>triangle.map(v=>v.map((x,i)=>x+origin[i])));
}

export function meshBounds(triangles) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for (let i=0;i<triangles.length;i++) {const a=i%3;min[a]=Math.min(min[a],triangles[i]);max[a]=Math.max(max[a],triangles[i]);}
  return { min, max, dimensions: max.map((v,i)=>v-min[i]) };
}

export function orientedDimensions(mesh, up = "y") {
  const dims=mesh.sourceDimensions && mesh.sourceSpan ? mesh.sourceDimensions.map(v=>v/mesh.sourceSpan) : meshBounds(mesh.triangles).dimensions;
  if (up==="z") return [dims[0],dims[2],dims[1]];
  if (up==="x") return [dims[1],dims[0],dims[2]];
  return dims;
}

// Target dimensions are [X width, Y height, Z length], before yaw, in caller units.
export function fitMesh(mesh, dimensions, up = "y", yaw = 0) {
  const oriented=orientedDimensions(mesh,up);
  if (!Number.isFinite(yaw) || dimensions.length!==3 || dimensions.some(v=>!Number.isFinite(v)||v<0)) throw new Error("Некорректные размеры CAD.");
  if (oriented.some((v,i)=>v<1e-12&&dimensions[i]>1e-9)) throw new Error("Нельзя растянуть нулевую ось сетки. Исправь толщину в CAD.");
  if (oriented.some((v,i)=>v>1e-12&&dimensions[i]<=0)) throw new Error("Размер объёмной оси должен быть больше нуля.");
  const data=transformMesh(mesh,1,up,0),a=yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  for (let i=0;i<data.length;i+=3) {
    const x=data[i]*(oriented[0]>1e-12?dimensions[0]/oriented[0]:0), y=data[i+1]*(oriented[1]>1e-12?dimensions[1]/oriented[1]:0), z=data[i+2]*(oriented[2]>1e-12?dimensions[2]/oriented[2]:0);
    data[i]=x*c-z*s;data[i+1]=y;data[i+2]=x*s+z*c;
  }
  return data;
}

// Rasterized union, not sum of triangles: back/front faces must not double the area.
export function projectedMeshArea(triangles, u, v, resolution = 96) {
  const projected=new Float64Array(triangles.length/3*2);
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for (let i=0;i<triangles.length;i+=3) {
    const x=triangles[i]*u[0]+triangles[i+1]*u[1]+triangles[i+2]*u[2],y=triangles[i]*v[0]+triangles[i+1]*v[1]+triangles[i+2]*v[2];
    const j=i/3*2;projected[j]=x;projected[j+1]=y;xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
  }
  const width=xmax-xmin,height=ymax-ymin;
  if (width<1e-12||height<1e-12) return 0;
  const occupied=new Uint8Array(resolution*resolution),dx=width/resolution,dy=height/resolution;
  const clamp=(x)=>Math.max(0,Math.min(resolution-1,x));
  for (let i=0;i<projected.length;i+=6) {
    const [ax,ay,bx,by,cx,cy]=projected.subarray(i,i+6),det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
    if (Math.abs(det)<width*height*1e-14) continue;
    const x0=clamp(Math.ceil((Math.min(ax,bx,cx)-xmin)/dx-0.5)),x1=clamp(Math.floor((Math.max(ax,bx,cx)-xmin)/dx-0.5));
    const y0=clamp(Math.ceil((Math.min(ay,by,cy)-ymin)/dy-0.5)),y1=clamp(Math.floor((Math.max(ay,by,cy)-ymin)/dy-0.5));
    for (let iy=y0;iy<=y1;iy++) for (let ix=x0;ix<=x1;ix++) {
      const index=ix+resolution*iy;if(occupied[index])continue;
      const x=xmin+(ix+0.5)*dx,y=ymin+(iy+0.5)*dy;
      const a=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det,b=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det;
      if (a>=-1e-10&&b>=-1e-10&&a+b<=1+1e-10)occupied[index]=1;
    }
  }
  return occupied.reduce((sum,x)=>sum+x,0)*dx*dy;
}

export function meshAerodynamics(triangles) {
  const horizontal=Array.from({length:18},(_,i)=>{const a=i*Math.PI/18;return projectedMeshArea(triangles,[-Math.sin(a),0,Math.cos(a)],[0,1,0]);});
  return { horizontal, top:projectedMeshArea(triangles,[1,0,0],[0,0,1]), resolution:96, angleStep:10 };
}
