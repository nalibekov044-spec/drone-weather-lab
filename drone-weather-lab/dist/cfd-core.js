import { voxelizeMesh } from "./mesh-import.js";
import { containsPart } from "./drone-builder.js";
const CX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const CY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
const CZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
const OPPOSITE = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17];
const WEIGHT = [1 / 3, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18,
  1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36];

const QUALITY = {
  fast: { nx: 31, ny: 17, nz: 25, steps: 100 },
  balanced: { nx: 41, ny: 23, nz: 33, steps: 220 },
  fine: { nx: 51, ny: 29, nz: 41, steps: 360 }
};

const BOUNDS = { xMin: -3, xMax: 3, yMin: -1.6, yMax: 1.6, zMin: -2.4, zMax: 2.4 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function rotorPositions(count, radius = 0.72) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count + (count === 4 ? Math.PI / 4 : 0);
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
}

function segmentDistanceSquared(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const scale = clamp(((px - ax) * dx + (pz - az) * dz) / Math.max(1e-8, dx * dx + dz * dz), 0, 1);
  const x = ax + dx * scale;
  const z = az + dz * scale;
  return (px - x) ** 2 + (pz - z) ** 2;
}

function isSolidPoint(x, y, z, config, rotors) {
  const preset = config.dronePreset;
  let body = false;
  if (preset === "racing") body = (Math.abs(x) <= 0.21 && Math.abs(y - 0.03) <= 0.09 && Math.abs(z) <= 0.29) || (Math.abs(x) <= 0.14 && Math.abs(y - 0.12) <= 0.04 && Math.abs(z + 0.08) <= 0.15);
  else if (preset === "industrialHex") body = x * x + z * z <= 0.31 ** 2 && Math.abs(y - 0.04) <= 0.12;
  else if (preset === "cargoOcto") body = (Math.abs(x) <= 0.29 && Math.abs(y - 0.02) <= 0.11 && Math.abs(z) <= 0.33) || (Math.abs(x) <= 0.25 && Math.abs(y + 0.25) <= 0.16 && Math.abs(z) <= 0.275);
  else if (preset !== "empty") body = Math.abs(x) <= 0.24 && Math.abs(y - 0.03) <= 0.12 && Math.abs(z) <= 0.31;
  if (body) return true;

  for (const rotor of rotors) {
    if (Math.abs(y) < 0.0275 && segmentDistanceSquared(x, z, 0, 0, rotor.x, rotor.z) < 0.0375 ** 2) return true;
    if ((x - rotor.x) ** 2 + (z - rotor.z) ** 2 < 0.095 ** 2 && y > 0 && y < 0.14) return true;
  }

  const size = clamp(config.obstacleSize || 1, 0.5, 2);
  if (config.flowObstacle === "wall") {
    return Math.abs(x - 1.28) <= 0.09 * size && Math.abs(y) <= 0.72 * size && Math.abs(z) <= 0.62 * size;
  }
  if (config.flowObstacle === "sphere") {
    return (x - 1.2) ** 2 + y * y + z * z <= (0.24 * size) ** 2;
  }
  if (config.flowObstacle === "payload") {
    return Math.abs(x) <= 0.3 * size && Math.abs(y + 0.38) <= 0.18 * size && Math.abs(z) <= 0.28 * size;
  }
  return false;
}

function equilibrium(q, density, ux, uy, uz) {
  const cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz;
  const uu = ux * ux + uy * uy + uz * uz;
  return WEIGHT[q] * density * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu);
}

function makeGeometry(config, nx, ny, nz, bounds) {
  const count = nx * ny * nz;
  const solid = config.meshTriangles ? voxelizeMesh(config.meshTriangles, nx, ny, nz, bounds) : new Uint8Array(count);
  const rotors = config.rotorCenters || rotorPositions(Number(config.rotors)).map(r=>({...r,diskY:0.17}));
  const obstacleConfig = { ...config, dronePreset:"empty" };
  const dx = (bounds.xMax - bounds.xMin) / (nx - 1);
  const dy = (bounds.yMax - bounds.yMin) / (ny - 1);
  const dz = (bounds.zMax - bounds.zMin) / (nz - 1);
  let solidCells = 0;
  for (let iy = 0; iy < ny; iy += 1) {
    const y = bounds.yMin + iy * dy;
    for (let iz = 0; iz < nz; iz += 1) {
      const z = bounds.zMin + iz * dz;
      for (let ix = 0; ix < nx; ix += 1) {
        const x = bounds.xMin + ix * dx;
        const index = ix + nx * (iz + nz * iy);
        // Imported geometry replaces the preset, but not an optional obstacle.
        if ((config.geometryParts && !config.meshTriangles && config.geometryParts.some(part=>containsPart(part,x,y,z))) ||
            (!config.meshTriangles && !config.geometryParts && !config.emptyDomain && isSolidPoint(x, y, z, config, rotors)) ||
            (isSolidPoint(x, y, z, obstacleConfig, []))) {
          solid[index] = 1;
        }
        solidCells += solid[index];
      }
    }
  }
  return { solid, solidCells, rotors, dx, dy, dz };
}

export function actuatorForces(config, nx, ny, nz, rotors, referenceSpeed, solid, bounds, spacing) {
  const count = nx * ny * nz;
  const fx = new Float32Array(count);
  const fy = new Float32Array(count);
  const fz = new Float32Array(count);
  const propRadius = config.propRadius || 0.25;
  const rho = config.density || 1.225;
  const velocityScale = referenceSpeed / 0.065;
  let appliedThrust = 0;
  const appliedTorques = new Array(rotors.length).fill(0);
  rotors.forEach((rotor, rotorIndex) => {
    const nodes = [];
    let totalWeight = 0;
    // The actuator injects momentum only near the disk, not along the entire wake.
    for (let iy = 1; iy < ny - 1; iy++) {
      const y = bounds.yMin + iy * spacing;
      if (Math.abs(y - rotor.diskY) > spacing * 1.1) continue;
      for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
        const x = bounds.xMin + ix * spacing, z = bounds.zMin + iz * spacing;
        const radial = Math.hypot(x - rotor.x, z - rotor.z);
        const index = ix + nx * (iz + nz * iy);
        if (solid[index] || radial > propRadius) continue;
        const weight = Math.exp(-2 * (radial / propRadius) ** 2) * Math.exp(-2 * ((y - rotor.diskY) / spacing) ** 2);
        nodes.push({ index, weight, x: x - rotor.x, z: z - rotor.z }); totalWeight += weight;
      }
    }
    const thrust = Math.max(0, config.rotorThrusts?.[rotorIndex] ?? 0);
    if (!totalWeight || !thrust) return;
    appliedThrust += thrust;
    // F_lattice = F_SI / (rho * h_SI² * velocityScale²); weights sum to one.
    const force = thrust / (rho * (spacing * config.worldScale) ** 2 * velocityScale ** 2);
    const centroidX = nodes.reduce((sum, node) => sum + node.weight * node.x, 0) / totalWeight;
    const centroidZ = nodes.reduce((sum, node) => sum + node.weight * node.z, 0) / totalWeight;
    const radialMoment = nodes.reduce((sum, node) => sum + node.weight * ((node.x - centroidX) ** 2 + (node.z - centroidZ) ** 2), 0);
    const torque = Number(config.rotorTorques?.[rotorIndex]) || 0;
    const torqueScale = rho * (spacing * config.worldScale) ** 2 * velocityScale ** 2 * config.worldScale;
    const angularForce = radialMoment > 1e-12 ? torque / (torqueScale * radialMoment) : 0;
    appliedTorques[rotorIndex] = angularForce ? torque : 0;
    for (const node of nodes) {
      const f = -force * node.weight / totalWeight;
      fy[node.index] += f;
      fx[node.index] += angularForce * (node.z - centroidZ) * node.weight;
      fz[node.index] -= angularForce * (node.x - centroidX) * node.weight;
    }
  });
  return { fx, fy, fz, appliedThrust, appliedTorques };
}

function dynamicViscosity(temperatureK) {
  return 1.716e-5 * Math.pow(temperatureK / 273.15, 1.5) * (273.15 + 111) / (temperatureK + 111);
}

// TRT collision with even/odd Guo forcing. Opposite populations are processed together.
export function collideCell(f,index,n,rho,ux,uy,uz,fx,fy,fz,even,odd,out){
  const uu=ux*ux+uy*uy+uz*uz,uf=ux*fx+uy*fy+uz*fz;
  out[index]=f[index]-even*(f[index]-rho/3*(1-1.5*uu))+(1-even/2)*(-uf);
  for(let q=1;q<19;q+=2){
    const opposite=OPPOSITE[q],a=q*n+index,b=opposite*n+index,w=WEIGHT[q];
    const cu=CX[q]*ux+CY[q]*uy+CZ[q]*uz,cf=CX[q]*fx+CY[q]*fy+CZ[q]*fz;
    const symmetric=(f[a]+f[b])*0.5-w*rho*(1+4.5*cu*cu-1.5*uu);
    const antisymmetric=(f[a]-f[b])*0.5-w*rho*3*cu;
    const se=w*(-3*uf+9*cu*cf)*(1-even/2),so=w*3*cf*(1-odd/2);
    out[a]=f[a]-even*symmetric-odd*antisymmetric+se+so;
    out[b]=f[b]-even*symmetric+odd*antisymmetric+se-so;
  }
}

export function smagorinskyTau(baseTau, density, stressSquared, coefficient) {
  if (!coefficient || stressSquared <= 0) return baseTau;
  return 0.5 * (baseTau + Math.sqrt(baseTau * baseTau + 18 * coefficient * coefficient * Math.sqrt(2 * stressSquared) / density));
}

export function boundaryMassFlow(field, referenceDensity, cellSizeM, pressureScale) {
  const { nx, ny, nz, velocityX, velocityY, velocityZ, pressure, solid } = field;
  const dimensions = [nx, ny, nz], velocity = [velocityX, velocityY, velocityZ];
  let incoming = 0, outgoing = 0;
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    for (const side of [0, dimensions[axis] - 1]) {
      const sign = side === 0 ? -1 : 1;
      for (let j = 0; j < dimensions[a]; j++) for (let k = 0; k < dimensions[b]; k++) {
        const position = [0, 0, 0]; position[axis] = side; position[a] = j; position[b] = k;
        const i = position[0] + nx * (position[2] + nz * position[1]);
        if (solid[i]) continue;
        const weight = (j === 0 || j === dimensions[a] - 1 ? 0.5 : 1) * (k === 0 || k === dimensions[b] - 1 ? 0.5 : 1);
        const density = referenceDensity * (1 + pressure[i] / pressureScale);
        const flow = sign * density * velocity[axis][i] * cellSizeM * cellSizeM * weight;
        if (flow < 0) incoming -= flow; else outgoing += flow;
      }
    }
  }
  const net = outgoing - incoming;
  return { incoming, outgoing, net, relativeImbalance: Math.abs(net) / Math.max(1e-12, (incoming + outgoing) * 0.5) };
}

export function* solveCFDGenerator(config, onProgress, resume = null) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const quality = QUALITY[config.quality] || QUALITY.balanced;
  const { nx, ny, nz } = quality;
  const steps = config.maxSteps || Math.round(quality.steps * (config.iterationBudget === "deep" ? 6 : config.iterationBudget === "quick" ? 1 : 2));
  const spacing = 6 / (nx - 1);
  const bounds = { ...BOUNDS, yMin: -(ny - 1) * spacing / 2, yMax: (ny - 1) * spacing / 2, zMin: -(nz - 1) * spacing / 2, zMax: (nz - 1) * spacing / 2 };
  config = { ...config, worldScale: config.worldScale || (config.frameSize || 520) / 1440 };
  const count = nx * ny * nz;
  const { solid, solidCells, rotors, dx, dy, dz } = makeGeometry(config, nx, ny, nz, bounds);
  const windAngle = (config.windDirection || 0) * Math.PI / 180;
  const windX = Math.cos(windAngle) * (config.windSpeed || 0);
  const windY = config.verticalWind || 0;
  const windZ = Math.sin(windAngle) * (config.windSpeed || 0);
  const referenceSpeed = Math.max(1, Math.hypot(windX, windY, windZ), config.downwashSpeed || 0);
  const latticeScale = 0.065 / referenceSpeed;
  const inlet = [windX * latticeScale, windY * latticeScale, windZ * latticeScale];
  const bodyForce = actuatorForces(config, nx, ny, nz, rotors, referenceSpeed, solid, bounds, spacing);
  // Both modes regularize viscosity. TRT decouples viscous and odd kinetic relaxation.
  const trt = config.solverMode !== "bgk";
  const tau = config.kinematicViscosity ? 0.5 + 3 * config.kinematicViscosity / (spacing * config.worldScale * referenceSpeed / 0.065) : trt ? 0.54 : 0.62;
  if (!(tau > 0.501 && tau < 2)) throw new Error("Requested viscosity is outside the supported lattice range.");
  const smagorinsky = clamp(Number(config.smagorinsky) || 0, 0, 0.25);
  const omega = 1 / tau;
  const omegaOdd = trt ? 1 / (0.5 + (3/16) / (tau - 0.5)) : omega;
  let distributions = resume?.distributions || new Float32Array(count * 19);
  let postCollision = new Float32Array(count * 19);
  let next = new Float32Array(count * 19);
  const previousVelocity = resume?.previousVelocity || new Float32Array(count * 3);
  const residualHistory = resume?.residualHistory || [];
  const startIteration = resume?.iterations || 0;
  let residual = Infinity, iterations = 0, clampedCells = 0;
  let simulatedTime = 0;

  for (let q = 0; !resume && q < 19; q += 1) {
    const base = q * count;
    const initial = equilibrium(q, 1, inlet[0], inlet[1], inlet[2]);
    distributions.fill(initial, base, base + count);
  }
  const fluid = [], boundary = [], bounceLinks = [], sources = new Int32Array(count * 19);
  for (let iy=0;iy<ny;iy++) for(let iz=0;iz<nz;iz++) for(let ix=0;ix<nx;ix++) {
    const index=ix+nx*(iz+nz*iy);
    if(ix===0||ix===nx-1||iy===0||iy===ny-1||iz===0||iz===nz-1){
      const inflow=(ix===0&&inlet[0]>1e-7)||(ix===nx-1&&inlet[0]<-1e-7)||(iy===0&&inlet[1]>1e-7)||(iy===ny-1&&inlet[1]<-1e-7)||(iz===0&&inlet[2]>1e-7)||(iz===nz-1&&inlet[2]<-1e-7);
      const inside=clamp(ix,1,nx-2)+nx*(clamp(iz,1,nz-2)+nz*clamp(iy,1,ny-2));
      boundary.push({index,inside,inflow});
    } else if(!solid[index]) {
      fluid.push(index);
      for(let q=0;q<19;q++){
        const source=index-CX[q]-nx*CZ[q]-nx*nz*CY[q];
        sources[q*count+index]=solid[source]?OPPOSITE[q]*count+index:q*count+source;
        if (solid[source] && q) bounceLinks.push({ source: OPPOSITE[q] * count + index, q });
      }
    }
  }
  const collisionCells = [...fluid, ...boundary.filter(face => !solid[face.index]).map(face => face.index)];
  let stableChecks=resume?.stableChecks||0;
  let maxLatticeSpeed=0, maxDensityDeviation=0;
  let meanDensity = 1, densityDrift = 0;
  const boundaryScratch = new Float64Array(4);
  let surfaceForce = [0, 0, 0];
  const forceHistory = resume?.forceHistory || [];
  let forceResidual = Infinity, maxEffectiveTau = tau;

  for (let step = 0; step < steps; step += 1) {
    let deltaSquared = 0, velocitySquared = 0;
    const diagnosticStep = step % 20 === 0;
    for (const index of collisionCells) {
      let density = 0;
      let ux = 0;
      let uy = 0;
      let uz = 0;
      let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
      for (let q = 0; q < 19; q += 1) {
        const value = distributions[q * count + index];
        density += value;
        ux += value * CX[q];
        uy += value * CY[q];
        uz += value * CZ[q];
        if (smagorinsky) {
          xx += value * CX[q] * CX[q]; yy += value * CY[q] * CY[q]; zz += value * CZ[q] * CZ[q];
          xy += value * CX[q] * CY[q]; xz += value * CX[q] * CZ[q]; yz += value * CY[q] * CZ[q];
        }
      }
      if (!Number.isFinite(density) || density < 0.6 || density > 1.4) throw new Error("CFD потерял устойчивость. Выбери BGK, снизь тягу / ветер или увеличь винты.");
      maxDensityDeviation = Math.max(maxDensityDeviation,Math.abs(density-1));
      const forceX = bodyForce.fx[index], forceY = bodyForce.fy[index], forceZ = bodyForce.fz[index];
      ux = (ux + forceX * 0.5) / density;
      uy = (uy + forceY * 0.5) / density;
      uz = (uz + forceZ * 0.5) / density;
      const speedSquared = ux*ux+uy*uy+uz*uz;
      if (!Number.isFinite(speedSquared) || speedSquared > 0.09) throw new Error("Скорость вышла за предел устойчивости LBM. Уменьши нагрузку или выбери BGK.");
      maxLatticeSpeed = Math.max(maxLatticeSpeed,Math.sqrt(speedSquared));
      if (diagnosticStep) {
        const a = index * 3;
        deltaSquared += (ux - previousVelocity[a]) ** 2 + (uy - previousVelocity[a + 1]) ** 2 + (uz - previousVelocity[a + 2]) ** 2;
        velocitySquared += ux * ux + uy * uy + uz * uz;
        previousVelocity[a] = ux; previousVelocity[a + 1] = uy; previousVelocity[a + 2] = uz;
      }
      let localOmega = omega, localOdd = omegaOdd;
      if (smagorinsky) {
        xx -= density * (1 / 3 + ux * ux); xx += ux * forceX;
        yy -= density * (1 / 3 + uy * uy); yy += uy * forceY;
        zz -= density * (1 / 3 + uz * uz); zz += uz * forceZ;
        xy -= density * ux * uy; xy += 0.5 * (ux * forceY + uy * forceX);
        xz -= density * ux * uz; xz += 0.5 * (ux * forceZ + uz * forceX);
        yz -= density * uy * uz; yz += 0.5 * (uy * forceZ + uz * forceY);
        const stressSquared = xx * xx + yy * yy + zz * zz + 2 * (xy * xy + xz * xz + yz * yz);
        const localTau = smagorinskyTau(tau, density, stressSquared, smagorinsky);
        if (!Number.isFinite(localTau) || localTau > 2) throw new Error("LES: локальная вязкость вышла за допустимый диапазон. Уменьши нагрузку.");
        maxEffectiveTau = Math.max(maxEffectiveTau, localTau);
        localOmega = 1 / localTau;
        localOdd = trt ? 1 / (0.5 + (3 / 16) / (localTau - 0.5)) : localOmega;
      }
      collideCell(distributions,index,count,density,ux,uy,uz,forceX,forceY,forceZ,localOmega,localOdd,postCollision);
    }

    for (const face of boundary) {
      boundaryScratch.fill(0);
      for (let q = 0; q < 19; q++) {
        const value = postCollision[q * count + face.inside];
        boundaryScratch[0] += value;
        boundaryScratch[1] += value * CX[q];
        boundaryScratch[2] += value * CY[q];
        boundaryScratch[3] += value * CZ[q];
      }
      const rho = boundaryScratch[0];
      const ux = boundaryScratch[1] / rho, uy = boundaryScratch[2] / rho, uz = boundaryScratch[3] / rho;
      for (let q = 0; q < 19; q++) {
        const neq = postCollision[q * count + face.inside] - equilibrium(q, rho, ux, uy, uz);
        next[q * count + face.index] = equilibrium(q, face.inflow ? rho : 1, face.inflow ? inlet[0] : ux, face.inflow ? inlet[1] : uy, face.inflow ? inlet[2] : uz) + neq;
      }
    }
    for(let q=0;q<19;q++){
      const base=q*count;
      for(const index of fluid) next[base+index]=postCollision[sources[base+index]];
    }
    if (diagnosticStep || step === steps - 1) {
      surfaceForce = [0, 0, 0];
      for (const link of bounceLinks) {
        const exchanged = 2 * postCollision[link.source], q = link.q;
        surfaceForce[0] -= exchanged * CX[q]; surfaceForce[1] -= exchanged * CY[q]; surfaceForce[2] -= exchanged * CZ[q];
      }
    }
    [distributions, next] = [next, distributions];
    iterations = startIteration + step + 1;
    if (diagnosticStep) {
      residual = Math.sqrt(deltaSquared / Math.max(1e-16, velocitySquared));
      residualHistory.push({ iteration: iterations, residual });
      if (onProgress) onProgress((step + 1) / steps);
      const previousForce = forceHistory.at(-1)?.force;
      forceResidual = previousForce ? Math.hypot(...surfaceForce.map((v, i) => v - previousForce[i])) / Math.max(1e-4, Math.hypot(...surfaceForce), Math.hypot(...previousForce)) : Infinity;
      forceHistory.push({ iteration: iterations, force: [...surfaceForce], residual: forceResidual });
      if (forceHistory.length > 120) forceHistory.shift();
      stableChecks = residual < 0.001 && forceResidual < 0.005 ? stableChecks + 1 : 0;
      if (iterations >= 200 && stableChecks >= 3) break;
    }
    if ((step+1)%5===0) yield { progress:(step+1)/steps, iterations, residual };
  }

  const velocityX = new Float32Array(count);
  const velocityY = new Float32Array(count);
  const velocityZ = new Float32Array(count);
  const pressure = new Float32Array(count);
  const physicalVelocityScale = referenceSpeed / 0.065;
  const physicalPressureScale = (config.density ?? 1.225) * physicalVelocityScale ** 2 / 3;
  let maxSpeed = 0, densitySum = 0, densityCells = 0;
  let minPressure = Infinity;
  let maxPressure = -Infinity;
  for (let index = 0; index < count; index += 1) {
    if (solid[index]) continue;
    let density = 0;
    let ux = 0;
    let uy = 0;
    let uz = 0;
    for (let q = 0; q < 19; q += 1) {
      const value = distributions[q * count + index];
      density += value;
      ux += value * CX[q];
      uy += value * CY[q];
      uz += value * CZ[q];
    }
    if (!Number.isFinite(density) || density < 0.6 || density > 1.4) throw new Error("CFD потерял устойчивость на последнем шаге. Выбери BGK или снизь нагрузку.");
    densitySum += density; densityCells++;
    velocityX[index] = (ux + 0.5 * bodyForce.fx[index]) / density * physicalVelocityScale;
    velocityY[index] = (uy + 0.5 * bodyForce.fy[index]) / density * physicalVelocityScale;
    velocityZ[index] = (uz + 0.5 * bodyForce.fz[index]) / density * physicalVelocityScale;
    pressure[index] = (density - 1) * physicalPressureScale;
    maxSpeed = Math.max(maxSpeed, Math.hypot(velocityX[index], velocityY[index], velocityZ[index]));
    minPressure = Math.min(minPressure, pressure[index]);
    maxPressure = Math.max(maxPressure, pressure[index]);
  }

  const vorticity = new Float32Array(count);
  let maxVorticity = 0, divergenceSquared = 0, diagnosticCells = 0;
  const sample = (array, ix, iy, iz) => array[ix + nx * (iz + nz * iy)];
  for (let iy = 1; iy < ny - 1; iy += 1) {
    for (let iz = 1; iz < nz - 1; iz += 1) {
      for (let ix = 1; ix < nx - 1; ix += 1) {
        const index = ix + nx * (iz + nz * iy);
        if (solid[index]) continue;
        const neighbors = [index - 1, index + 1, index - nx, index + nx, index - nx * nz, index + nx * nz];
        if (neighbors.some(n => solid[n])) continue;
        const divergence = ((velocityX[index + 1] - velocityX[index - 1]) / dx +
          (velocityY[index + nx * nz] - velocityY[index - nx * nz]) / dy +
          (velocityZ[index + nx] - velocityZ[index - nx]) / dz) / (2 * config.worldScale);
        divergenceSquared += divergence * divergence; diagnosticCells++;
        const dwdy = (sample(velocityZ, ix, iy + 1, iz) - sample(velocityZ, ix, iy - 1, iz)) / (2 * dy * config.worldScale);
        const dvdz = (sample(velocityY, ix, iy, iz + 1) - sample(velocityY, ix, iy, iz - 1)) / (2 * dz * config.worldScale);
        const dudz = (sample(velocityX, ix, iy, iz + 1) - sample(velocityX, ix, iy, iz - 1)) / (2 * dz * config.worldScale);
        const dwdx = (sample(velocityZ, ix + 1, iy, iz) - sample(velocityZ, ix - 1, iy, iz)) / (2 * dx * config.worldScale);
        const dvdx = (sample(velocityY, ix + 1, iy, iz) - sample(velocityY, ix - 1, iy, iz)) / (2 * dx * config.worldScale);
        const dudy = (sample(velocityX, ix, iy + 1, iz) - sample(velocityX, ix, iy - 1, iz)) / (2 * dy * config.worldScale);
        const curl = Math.hypot(dwdy - dvdz, dudz - dwdx, dvdx - dudy);
        vorticity[index] = curl;
        maxVorticity = Math.max(maxVorticity, curl);
      }
    }
  }

  meanDensity = densitySum / Math.max(1, densityCells); densityDrift = meanDensity - 1;
  const forceScale = (config.density ?? 1.225) * (spacing * config.worldScale) ** 2 * physicalVelocityScale ** 2;
  const temperatureK = (config.temperature ?? 15) + 273.15;
  const viscosity = dynamicViscosity(temperatureK);
  const characteristicLength = Math.max(0.12, (config.frameSize ?? 520) / 1000);
  const reynoldsSpeed = Math.max(0.01, Math.abs(config.windSpeed ?? 0), Math.abs(config.verticalWind ?? 0), Math.abs(config.downwashSpeed ?? 0));
  const reynolds = (config.density ?? 1.225) * reynoldsSpeed * characteristicLength / viscosity;
  const numericalViscosity = (tau - 0.5) / 3 * spacing * config.worldScale * physicalVelocityScale;
  simulatedTime = iterations * spacing * config.worldScale / physicalVelocityScale;
  const massFlow = boundaryMassFlow({ nx, ny, nz, velocityX, velocityY, velocityZ, pressure, solid }, config.density ?? 1.225, spacing * config.worldScale, physicalPressureScale);
  const forceSamples = forceHistory.slice(-10);
  const meanSurfaceForce = [0, 1, 2].map(axis => forceSamples.reduce((sum, sample) => sum + sample.force[axis], 0) * forceScale / Math.max(1, forceSamples.length));
  const finished = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    nx, ny, nz, bounds, velocityX, velocityY, velocityZ, pressure, vorticity, solid,
    stats: {
      cells: count,
      solidCells,
      meanDensity, densityDrift, surfaceForce: surfaceForce.map(v => v * forceScale),
      meanSurfaceForce, forceResidual, forceSamples: forceSamples.length,
      forceHistory: forceHistory.map(sample => ({ iteration: sample.iteration, force: sample.force.map(v => v * forceScale), residual: sample.residual })),
      massFlow, smagorinsky, maxEddyViscosity: (maxEffectiveTau - tau) / 3 * spacing * config.worldScale * physicalVelocityScale,
      boundaryMethod: "non-equilibrium extrapolation, velocity inlet / density outlet",
      iterations,
      residual, residualHistory: residualHistory.slice(-120), converged: iterations>=200&&stableChecks>=3, clampedCells,
      maxLatticeMach:maxLatticeSpeed*Math.sqrt(3), maxDensityDeviation,
      divergenceRms: Math.sqrt(divergenceSquared / Math.max(1, diagnosticCells)),
      spacingM: spacing * config.worldScale, simulatedTime, worldScale: config.worldScale,
      appliedThrust: bodyForce.appliedThrust,
      appliedTorques: bodyForce.appliedTorques,
      effectiveReynolds: reynoldsSpeed * characteristicLength / numericalViscosity,
      numericalViscosity,
      elapsedMs: Math.round(finished - started),
      maxSpeed,
      minPressure: Number.isFinite(minPressure) ? minPressure : 0,
      maxPressure: Number.isFinite(maxPressure) ? maxPressure : 0,
      maxVorticity,
      reynolds,
      method: `${trt ? "D3Q19 TRT" : "D3Q19 BGK"} + Guo${smagorinsky ? " + Smagorinsky LES" : ""}`
    },
    _resume: { distributions,previousVelocity,residualHistory:residualHistory.slice(-120),iterations,stableChecks,forceHistory }
  };
}

export function solveCFD(config,onProgress){
  const iterator=solveCFDGenerator(config,onProgress);let step;
  do {step=iterator.next();}while(!step.done);
  delete step.value._resume;
  return step.value;
}
