// cars.js — Rally Dust car roster and handling data.
//
// Six rally liveries remain the simulation and save-data roster. GGRacer owns
// their visible vehicle representation, so this module has no renderer code.

// `unlock` is the number of stage gold medals required.
export const CARS = [
  {
    id: 'burrow', file: 'SportsCar', name: 'Burrow 210 Works',
    blurb: 'The service-park hatch everyone learns on. Honest and light.',
    unlock: 0, body: 0xd8402c, trim: 0x1d2530, accentTrim: 0xf4f6fa,
    topSpeed: 1.00, accel: 1.00, grip: 1.00, number: 7, stripe: 'chevron',
  },
  {
    id: 'ochre', file: 'SportsCar', name: 'Burrow 210 Ochre',
    blurb: 'Desert livery. Longer gearing for the open basin roads.',
    unlock: 2, body: 0xe2892c, trim: 0x2b2118, accentTrim: 0xffd76a,
    topSpeed: 1.05, accel: 0.98, grip: 0.98, number: 12, stripe: 'band',
  },
  {
    id: 'thistle', file: 'NormalCar2', name: 'Thistle RS',
    blurb: 'Longer wheelbase saloon. Settles fast after a slide.',
    unlock: 4, body: 0x2f7f5c, trim: 0x14281f, accentTrim: 0xf2f7ea,
    topSpeed: 0.97, accel: 1.01, grip: 1.12, number: 21, stripe: 'twin',
  },
  {
    id: 'cobalt', file: 'NormalCar2', name: 'Thistle Cobalt',
    blurb: 'Night-stage build with a full roof pod. Sharp on tarmac.',
    unlock: 7, body: 0x2557c4, trim: 0x101a2c, accentTrim: 0x7de4eb,
    topSpeed: 1.03, accel: 1.05, grip: 1.05, number: 4, stripe: 'chevron',
  },
  {
    id: 'quarry', file: 'SUV', name: 'Quarry XT',
    blurb: 'Raid truck. Heavy, stubborn, and unbothered by ruts.',
    unlock: 10, body: 0x8f5fd6, trim: 0x241d33, accentTrim: 0xffe17c,
    topSpeed: 0.95, accel: 0.93, grip: 1.20, number: 33, stripe: 'band',
  },
  {
    id: 'ember', file: 'SUV', name: 'Quarry Ember',
    blurb: 'The one they only hand over once you have earned it.',
    unlock: 14, body: 0xffb02e, trim: 0x1c1512, accentTrim: 0xff5a2a,
    topSpeed: 1.08, accel: 1.07, grip: 1.10, number: 1, stripe: 'twin',
  },
];

export function carById(id) { return CARS.find((c) => c.id === id) || null; }
