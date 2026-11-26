// 0.96.0: wind at the flight height and the air at that height.
// The forecast gives wind at 10, 80, 120 and 180 m above the ground. Between levels the speed is interpolated
// on a logarithmic height scale; below the first level and when only the 10 m wind is known, the Hellmann power
// law v = v10 · (z / 10)^a is used. Above the top level the exponent comes from the two highest levels.
// Hellmann exponents for neutral air (Wikipedia, "Wind gradient", Hellmann exponent table).
export const hellmannExponents = {
  water: 0.10,
  open: 0.16,
  built: 0.34
};

export const forecastLevels = [10, 80, 120, 180];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rad = Math.PI / 180;

// Levels with a finite speed and direction, lowest first. Models without upper levels give only the 10 m wind.
export function forecastProfile(data, index) {
  const h = data?.hourly || {};
  return forecastLevels.map(height => ({
    height,
    speed: Number(h[`wind_speed_${height}m`]?.[index]),
    direction: Number(h[`wind_direction_${height}m`]?.[index])
  })).filter(l => Number.isFinite(l.speed) && l.speed >= 0 && Number.isFinite(l.direction) && h[
    `wind_speed_${l.height}m`]?.[index] !== null);
}

export function windAtHeight(profile, height, exponent = hellmannExponents.open) {
  const levels = (profile || []).filter(l => Number.isFinite(l.height) && l.height > 0 && Number.isFinite(l.speed) && l
    .speed >= 0 && Number.isFinite(l.direction)).sort((a, b) => a.height - b.height);
  if (!levels.length || !Number.isFinite(height)) throw Error('wind-profile');
  const z = Math.max(1, height),
    first = levels[0],
    last = levels.at(-1),
    direction = d => (d % 360 + 360) % 360;
  if (z <= first.height) return {
    speed: first.speed * (z / first.height) ** exponent,
    direction: direction(first.direction),
    method: levels.length > 1 && z === first.height ? 'forecast' : 'power'
  };
  if (z >= last.height) {
    let a = exponent;
    if (levels.length > 1) {
      const below = levels.at(-2);
      if (below.speed > 0.1 && last.speed > 0.1) a = clamp(Math.log(last.speed / below.speed) / Math.log(last
        .height / below.height), 0, 0.6);
    }
    return {
      speed: last.speed * (z / last.height) ** a,
      direction: direction(last.direction),
      method: levels.length > 1 ? (z === last.height ? 'forecast' : 'extrapolated') : 'power'
    };
  }
  const j = levels.findIndex((l, i) => l.height <= z && levels[i + 1].height > z),
    lo = levels[j],
    hi = levels[j + 1];
  const t = Math.log(z / lo.height) / Math.log(hi.height / lo.height);
  // Direction through the wind vector, so 350° and 10° average to 0°, not 180°.
  const x = (1 - t) * Math.sin(lo.direction * rad) + t * Math.sin(hi.direction * rad),
    y = (1 - t) * Math.cos(lo.direction * rad) + t * Math.cos(hi.direction * rad);
  return {
    speed: lo.speed + (hi.speed - lo.speed) * t,
    direction: direction(Math.atan2(x, y) / rad),
    method: 'forecast'
  };
}

// Pressure and temperature a height dz above a point, with the standard lapse rate of 6.5 K per km.
export function airAbove(pressureHpa, temperatureC, dz) {
  const t0 = temperatureC + 273.15;
  return {
    pressureHpa: pressureHpa * Math.max(0.05, 1 - 0.0065 * dz / t0) ** 5.25588,
    temperature: temperatureC - 0.0065 * dz
  };
}

// The forecast hour at the flight height: wind from the profile, air pressure and temperature lifted from the
// ground (temperature is given at 2 m), altitude = ground + flight height. `surface` is weatherFromOpenMeteo's result.
export function liftToFlightHeight(surface, profile, height = 30, terrain = 'open') {
  const v = surface.values,
    levels = profile?.length ? profile : [{
      height: 10,
      speed: v.windSpeed,
      direction: v.windDirection
    }];
  const exponent = hellmannExponents[terrain] ?? hellmannExponents.open;
  const wind = windAtHeight(levels, height, exponent);
  const air = airAbove(v.pressureHpa, v.temperature, height - 2);
  const ground = v.altitude;
  return {
    ...surface,
    ground,
    height,
    wind10: v.windSpeed,
    profile: levels,
    method: wind.method,
    values: {
      ...v,
      windSpeed: wind.speed,
      windDirection: wind.direction,
      altitude: ground + Math.max(0, height),
      pressureHpa: air.pressureHpa,
      temperature: air.temperature
    }
  };
}
