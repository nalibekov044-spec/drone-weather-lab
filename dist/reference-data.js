// 0.94: published static bench data used to check the model. Values are copied from the manufacturer's
// load-test tables; the power column is the electrical input (supply voltage × current), so it includes the ESC.
// Air density in the tests is not stated; the comparison assumes 20 °C at sea level (1.204 kg/m³).
export const benchReferences = [{
  id: 'mn4014-330-15x5',
  label: 'T-MOTOR MN4014 KV330 · 15 × 5 CF · 22,2 V',
  source: 'T-MOTOR, MN4014 test report MN.00026 (store.tmotor.com)',
  blades: 2,
  diameter: 15,
  pitch: 5,
  voltage: 22.2,
  motor: {
    motorKv: 330,
    motorResistance: 0.085,
    motorIdleCurrent: 1.1
  },
  rows: [
    [50, 3900, 830, 3.6, 79.92],
    [65, 4600, 1150, 5.9, 130.98],
    [75, 5100, 1430, 7.8, 173.16],
    [85, 5600, 1690, 10.1, 224.22],
    [100, 6000, 1920, 11.9, 264.18]
  ]
}, {
  id: 'mn4014-400-15x5',
  label: 'T-MOTOR MN4014 KV400 · 15 × 5 CF · 22,2 V',
  source: 'T-MOTOR, MN4014 test report MN.00025 (store.tmotor.com)',
  blades: 2,
  diameter: 15,
  pitch: 5,
  voltage: 22.2,
  motor: {
    motorKv: 400,
    motorResistance: 0.067,
    motorIdleCurrent: 1.3
  },
  rows: [
    [50, 4500, 1250, 5.7, 126.54],
    [65, 5200, 1630, 9.1, 202.02],
    [75, 5800, 1950, 12.0, 266.40],
    [85, 6400, 2370, 15.8, 350.76],
    [100, 6700, 2620, 18.7, 415.14]
  ]
}, {
  id: 'f60prov-1750-5147',
  label: 'T-MOTOR F60 PRO V 1750KV · T5147 (3 blades) · 25,2 V',
  source: 'T-MOTOR, F60 PRO V product page (store.tmotor.com)',
  blades: 3,
  diameter: 5.1,
  pitch: 4.7,
  voltage: 25.2,
  motor: null,
  rows: [
    [20, 11132, 227.0, 2.1, 53.6],
    [40, 16928, 558.6, 6.6, 165.2]
  ]
}].map(set => ({
  ...set,
  rows: set.rows.map(([throttle, rpm, thrustG, current, power]) => ({
    throttle,
    rpm,
    thrustN: thrustG / 1000 * 9.80665,
    current,
    voltage: set.voltage,
    electricalPower: power,
    shaftPower: null
  }))
}));
