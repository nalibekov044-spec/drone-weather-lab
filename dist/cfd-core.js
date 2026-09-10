const CX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const CY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
const CZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
const OPPOSITE = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17];
const WEIGHT = [1 / 3, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18,
  1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36];

const QUALITY = {
  fast: { nx: 32, ny: 18, nz: 24, steps: 42 },
  balanced: { nx: 40, ny: 22, nz: 30, steps: 64 },
  fine: { nx: 48, ny: 26, nz: 36, steps: 86 }
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
  if (preset === "racing") body = (x / 0.3) ** 2 + (y / 0.18) ** 2 + (z / 0.38) ** 2 <= 1;
  else if (preset === "industrialHex") body = x * x + z * z <= 0.35 ** 2 && Math.abs(y - 0.03) <= 0.18;
  else if (preset === "cargoOcto") body = Math.abs(x) <= 0.35 && Math.abs(y + 0.09) <= 0.32 && Math.abs(z) <= 0.39;
  else body = (x / 0.34) ** 2 + (y / 0.22) ** 2 + (z / 0.42) ** 2 <= 1;
  if (body) return true;

  for (const rotor of rotors) {
    if (Math.abs(y) < 0.11 && segmentDistanceSquared(x, z, 0, 0, rotor.x, rotor.z) < 0.075 ** 2) return true;
    if ((x - rotor.x) ** 2 + (z - rotor.z) ** 2 < 0.13 ** 2 && y > -0.06 && y < 0.22) return true;
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

function makeGeometry(config, nx, ny, nz) {
  const count = nx * ny * nz;
  const solid = new Uint8Array(count);
  const rotors = rotorPositions(Number(config.rotors));
  const dx = (BOUNDS.xMax - BOUNDS.xMin) / (nx - 1);
  const dy = (BOUNDS.yMax - BOUNDS.yMin) / (ny - 1);
  const dz = (BOUNDS.zMax - BOUNDS.zMin) / (nz - 1);
  let solidCells = 0;
  for (let iy = 0; iy < ny; iy += 1) {
    const y = BOUNDS.yMin + iy * dy;
    for (let iz = 0; iz < nz; iz += 1) {
      const z = BOUNDS.zMin + iz * dz;
      for (let ix = 0; ix < nx; ix += 1) {
        const x = BOUNDS.xMin + ix * dx;
        const index = ix + nx * (iz + nz * iy);
        if (isSolidPoint(x, y, z, config, rotors)) {
          solid[index] = 1;
          solidCells += 1;
        }
      }
    }
  }
  return { solid, solidCells, rotors, dx, dy, dz };
}

function makeBodyForce(config, nx, ny, nz, rotors, referenceSpeed) {
  const count = nx * ny * nz;
  const fx = new Float32Array(count);
  const fy = new Float32Array(count);
  const fz = new Float32Array(count);
  const dx = (BOUNDS.xMax - BOUNDS.xMin) / (nx - 1);
  const dy = (BOUNDS.yMax - BOUNDS.yMin) / (ny - 1);
  const dz = (BOUNDS.zMax - BOUNDS.zMin) / (nz - 1);
  const propRadius = clamp(config.propRadius || 0.25, 0.16, 0.34);
  const downwashRatio = clamp((config.downwashSpeed || 0) / referenceSpeed, 0, 3);
  const turbulence = clamp((config.turbulence || 0) / 100, 0, 1);
  for (let iy = 1; iy < ny - 1; iy += 1) {
    const y = BOUNDS.yMin + iy * dy;
    for (let iz = 1; iz < nz - 1; iz += 1) {
      const z = BOUNDS.zMin + iz * dz;
      for (let ix = 1; ix < nx - 1; ix += 1) {
        const x = BOUNDS.xMin + ix * dx;
        const index = ix + nx * (iz + nz * iy);
        let forceX = turbulence * 0.000035 * Math.sin(y * 5.7 + z * 3.1);
        let forceY = turbulence * 0.000022 * Math.sin(x * 4.3 - z * 3.7);
        let forceZ = turbulence * 0.000035 * Math.cos(x * 3.4 + y * 5.1);
        rotors.forEach((rotor, rotorIndex) => {
          const rx = x - rotor.x;
          const rz = z - rotor.z;
          const radial = Math.exp(-(rx * rx + rz * rz) / Math.max(0.004, propRadius ** 2 * 0.56));
          const disk = Math.exp(-1 * ((y - 0.18) / 0.16) ** 2);
          const column = y < 0.18 ? Math.exp((y - 0.18) * 0.28) : Math.exp(-(y - 0.18) * 3.4);
          const strength = radial * (0.7 * disk + 0.3 * column);
          forceY -= 0.022 * downwashRatio * strength;
          const swirl = (rotorIndex % 2 ? -1 : 1) * 0.00034 * downwashRatio * strength / Math.max(0.08, propRadius);
          forceX -= rz * swirl;
          forceZ += rx * swirl;
        });
        fx[index] = forceX;
        fy[index] = forceY;
        fz[index] = forceZ;
      }
    }
  }
  return { fx, fy, fz };
}

function dynamicViscosity(temperatureK) {
  return 1.716e-5 * Math.pow(temperatureK / 273.15, 1.5) * (273.15 + 111) / (temperatureK + 111);
}

export function solveCFD(config, onProgress) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const quality = QUALITY[config.quality] || QUALITY.balanced;
  const { nx, ny, nz, steps } = quality;
  const count = nx * ny * nz;
  const { solid, solidCells, rotors, dx, dy, dz } = makeGeometry(config, nx, ny, nz);
  const windAngle = (config.windDirection || 0) * Math.PI / 180;
  const windX = Math.cos(windAngle) * (config.windSpeed || 0);
  const windY = config.verticalWind || 0;
  const windZ = Math.sin(windAngle) * (config.windSpeed || 0);
  const referenceSpeed = Math.max(1, Math.hypot(windX, windY, windZ), config.downwashSpeed || 0);
  const latticeScale = 0.065 / referenceSpeed;
  const inlet = [windX * latticeScale, windY * latticeScale, windZ * latticeScale];
  const bodyForce = makeBodyForce(config, nx, ny, nz, rotors, referenceSpeed);
  const tau = 0.61 + (1 - clamp((config.turbulence || 0) / 100, 0, 1)) * 0.055;
  const omega = 1 / tau;
  let distributions = new Float32Array(count * 19);
  let postCollision = new Float32Array(count * 19);
  let next = new Float32Array(count * 19);

  for (let q = 0; q < 19; q += 1) {
    const base = q * count;
    const initial = equilibrium(q, 1, inlet[0], inlet[1], inlet[2]);
    distributions.fill(initial, base, base + count);
  }

  for (let step = 0; step < steps; step += 1) {
    for (let index = 0; index < count; index += 1) {
      if (solid[index]) {
        for (let q = 0; q < 19; q += 1) postCollision[q * count + index] = WEIGHT[q];
        continue;
      }
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
      density = clamp(density, 0.72, 1.28);
      ux = ux / density + bodyForce.fx[index];
      uy = uy / density + bodyForce.fy[index];
      uz = uz / density + bodyForce.fz[index];
      const speed = Math.hypot(ux, uy, uz);
      if (speed > 0.16) {
        const scale = 0.16 / speed;
        ux *= scale; uy *= scale; uz *= scale;
      }
      for (let q = 0; q < 19; q += 1) {
        const address = q * count + index;
        const eq = equilibrium(q, density, ux, uy, uz);
        postCollision[address] = distributions[address] + omega * (eq - distributions[address]);
      }
    }

    for (let iy = 0; iy < ny; iy += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        for (let ix = 0; ix < nx; ix += 1) {
          const index = ix + nx * (iz + nz * iy);
          const boundary = ix === 0 || ix === nx - 1 || iy === 0 || iy === ny - 1 || iz === 0 || iz === nz - 1;
          if (boundary) {
            const inflow = (ix === 0 && inlet[0] > 1e-7) || (ix === nx - 1 && inlet[0] < -1e-7)
              || (iy === 0 && inlet[1] > 1e-7) || (iy === ny - 1 && inlet[1] < -1e-7)
              || (iz === 0 && inlet[2] > 1e-7) || (iz === nz - 1 && inlet[2] < -1e-7);
            if (inflow) {
              for (let q = 0; q < 19; q += 1) next[q * count + index] = equilibrium(q, 1, inlet[0], inlet[1], inlet[2]);
            } else {
              const insideX = ix === 0 ? 1 : ix === nx - 1 ? nx - 2 : ix;
              const insideY = iy === 0 ? 1 : iy === ny - 1 ? ny - 2 : iy;
              const insideZ = iz === 0 ? 1 : iz === nz - 1 ? nz - 2 : iz;
              const inside = insideX + nx * (insideZ + nz * insideY);
              for (let q = 0; q < 19; q += 1) next[q * count + index] = postCollision[q * count + inside];
            }
            continue;
          }
          if (solid[index]) {
            for (let q = 0; q < 19; q += 1) next[q * count + index] = WEIGHT[q];
            continue;
          }
          for (let q = 0; q < 19; q += 1) {
            const sx = ix - CX[q];
            const sy = iy - CY[q];
            const sz = iz - CZ[q];
            const source = sx + nx * (sz + nz * sy);
            next[q * count + index] = solid[source]
              ? postCollision[OPPOSITE[q] * count + index]
              : postCollision[q * count + source];
          }
        }
      }
    }
    [distributions, next] = [next, distributions];
    if (onProgress && (step === Math.floor(steps / 2) || step === steps - 1)) onProgress((step + 1) / steps);
  }

  const velocityX = new Float32Array(count);
  const velocityY = new Float32Array(count);
  const velocityZ = new Float32Array(count);
  const pressure = new Float32Array(count);
  const physicalVelocityScale = referenceSpeed / 0.065;
  const physicalPressureScale = (config.density ?? 1.225) * physicalVelocityScale ** 2 / 3;
  let maxSpeed = 0;
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
    density = Math.max(0.001, density);
    velocityX[index] = ux / density * physicalVelocityScale;
    velocityY[index] = uy / density * physicalVelocityScale;
    velocityZ[index] = uz / density * physicalVelocityScale;
    pressure[index] = (density - 1) * physicalPressureScale;
    maxSpeed = Math.max(maxSpeed, Math.hypot(velocityX[index], velocityY[index], velocityZ[index]));
    minPressure = Math.min(minPressure, pressure[index]);
    maxPressure = Math.max(maxPressure, pressure[index]);
  }

  const vorticity = new Float32Array(count);
  let maxVorticity = 0;
  const sample = (array, ix, iy, iz) => array[ix + nx * (iz + nz * iy)];
  for (let iy = 1; iy < ny - 1; iy += 1) {
    for (let iz = 1; iz < nz - 1; iz += 1) {
      for (let ix = 1; ix < nx - 1; ix += 1) {
        const index = ix + nx * (iz + nz * iy);
        if (solid[index]) continue;
        const dwdy = (sample(velocityZ, ix, iy + 1, iz) - sample(velocityZ, ix, iy - 1, iz)) / (2 * dy);
        const dvdz = (sample(velocityY, ix, iy, iz + 1) - sample(velocityY, ix, iy, iz - 1)) / (2 * dz);
        const dudz = (sample(velocityX, ix, iy, iz + 1) - sample(velocityX, ix, iy, iz - 1)) / (2 * dz);
        const dwdx = (sample(velocityZ, ix + 1, iy, iz) - sample(velocityZ, ix - 1, iy, iz)) / (2 * dx);
        const dvdx = (sample(velocityY, ix + 1, iy, iz) - sample(velocityY, ix - 1, iy, iz)) / (2 * dx);
        const dudy = (sample(velocityX, ix, iy + 1, iz) - sample(velocityX, ix, iy - 1, iz)) / (2 * dy);
        const curl = Math.hypot(dwdy - dvdz, dudz - dwdx, dvdx - dudy);
        vorticity[index] = curl;
        maxVorticity = Math.max(maxVorticity, curl);
      }
    }
  }

  const temperatureK = (config.temperature ?? 15) + 273.15;
  const viscosity = dynamicViscosity(temperatureK);
  const characteristicLength = Math.max(0.12, (config.frameSize ?? 520) / 1000);
  const reynoldsSpeed = Math.max(0.01, Math.abs(config.windSpeed ?? 0), Math.abs(config.verticalWind ?? 0), Math.abs(config.downwashSpeed ?? 0));
  const reynolds = (config.density ?? 1.225) * reynoldsSpeed * characteristicLength / viscosity;
  const finished = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    nx, ny, nz, bounds: BOUNDS, velocityX, velocityY, velocityZ, pressure, vorticity, solid,
    stats: {
      cells: count,
      solidCells,
      iterations: steps,
      elapsedMs: Math.round(finished - started),
      maxSpeed,
      minPressure: Number.isFinite(minPressure) ? minPressure : 0,
      maxPressure: Number.isFinite(maxPressure) ? maxPressure : 0,
      maxVorticity,
      reynolds,
      method: "D3Q19 LBM"
    }
  };
}
