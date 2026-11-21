// 0.94: electrical model of a brushless motor from three datasheet numbers.
// Kv (RPM per volt), winding resistance R (ohm, as datasheets list "internal resistance") and the idle
// current I0 (A, usually measured at 10 V). This is the classic first-order model (M. Drela, "First-Order
// DC Electric Motor Model", MIT 2007):
//   torque constant  Kt = 1 / Kv  (in SI units, N·m/A)
//   current          I = torque / Kt + I0
//   back EMF         E = ω / Kv
//   motor voltage    V = E + I·R
//   losses           copper I²·R  +  iron I0·E
// Temperature: copper resistance rises 0.393% per °C, NdFeB magnets lose about 0.12% of flux per °C,
// so a hot motor needs more current for the same torque. That feedback is how a real motor runs away.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const COPPER_TEMPERATURE_COEFFICIENT = 0.00393;
export const MAGNET_TEMPERATURE_COEFFICIENT = 0.0012;
// Share of the bus voltage an ESC puts across the motor at full throttle (FET and wiring drops, timing).
// 0.86 reproduces the full-throttle speeds of the T-MOTOR MN4014 tables on 22.2 V within 5%.
export const ESC_MODULATION = 0.86;

export function motorSpec(p, health = 1) {
  const damage = 1 - clamp(health, 0, 1);
  const idle = Number(p.motorIdleCurrent);
  return {
    kv: clamp(Number(p.motorKv) || 330, 20, 5000),
    // A damaged winding (shorted turns, burnt insulation) has more resistance and more idle loss.
    resistance: clamp(Number(p.motorResistance) || 0.085, 0.001, 5) * (1 + 2 * damage),
    idleCurrent: clamp(Number.isFinite(idle) ? idle : 1.1, 0, 20) * (1 + damage)
  };
}

export function motorConstants(spec, temperature = 25) {
  const rise = temperature - 25;
  const magnet = clamp(1 - MAGNET_TEMPERATURE_COEFFICIENT * rise, 0.6, 1.06);
  const kvRad = spec.kv * Math.PI / 30 / magnet;
  return {
    kvRad,
    kt: 1 / kvRad,
    resistance: spec.resistance * clamp(1 + COPPER_TEMPERATURE_COEFFICIENT * rise, 0.8, 2.6),
    idleCurrent: spec.idleCurrent,
    magnet
  };
}

// Operating point for a speed and the shaft power the propeller takes at that speed.
export function motorPoint(spec, rpm, shaftPower, temperature = 25) {
  const c = motorConstants(spec, temperature);
  const omega = Math.max(0, rpm) * Math.PI / 30;
  if (omega < 1e-6) return {
    current: 0,
    voltage: 0,
    input: 0,
    loss: 0,
    copperLoss: 0,
    ironLoss: 0,
    efficiency: 0,
    torque: 0,
    magnet: c.magnet
  };
  const torque = Math.max(0, shaftPower) / omega;
  const current = torque / c.kt + c.idleCurrent;
  const emf = omega / c.kvRad;
  const voltage = emf + current * c.resistance;
  const input = voltage * current;
  const copperLoss = current * current * c.resistance;
  const ironLoss = c.idleCurrent * emf;
  return {
    current,
    voltage,
    input,
    loss: copperLoss + ironLoss,
    copperLoss,
    ironLoss,
    efficiency: input > 0 ? Math.max(0, shaftPower) / input : 0,
    torque,
    magnet: c.magnet
  };
}

// Largest speed allowed by two monotonic limits: the motor voltage the ESC can apply and the input power the
// ESC and battery can deliver. shaftAt(rpm) is the propeller load curve. Bisection: both grow with speed.
export function limitedRpm(spec, shaftAt, availableVoltage, inputLimit, temperature = 25, ceiling = Infinity) {
  const fits = rpm => {
    const point = motorPoint(spec, rpm, shaftAt(rpm), temperature);
    return point.voltage <= availableVoltage && point.input <= inputLimit;
  };
  let high = Math.min(ceiling, spec.kv * Math.max(0, availableVoltage) / motorConstants(spec, temperature).magnet);
  if (!(high > 0)) return 0;
  if (fits(high)) return high;
  let low = 0;
  for (let i = 0; i < 48; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

// Efficiency along the propeller load curve, for the efficiency chart.
export function efficiencyCurve(spec, shaftAt, maxRpm, temperature = 25, samples = 40) {
  return Array.from({
    length: samples
  }, (_, i) => {
    const rpm = maxRpm * (i + 1) / samples;
    const point = motorPoint(spec, rpm, shaftAt(rpm), temperature);
    return {
      rpm,
      ...point
    };
  });
}
