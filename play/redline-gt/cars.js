// cars.js — Redline GT simulation roster.
//
// GGRacer owns vehicle geometry, transforms, wheels, lights, and shadows.
// These values are the title's progression and handling data and remain
// deliberately separate from the shared renderer.
export const CARS = [
  {
    id: 'harrier', name: 'GG Harrier',
    blurb: 'Balanced starter coupe. Forgiving on the brakes.',
    unlock: 0, body: 0xe0552f, accent: 0xffc45f, trim: 0x2a2f38,
    topSpeed: 1.00, accel: 1.00, grip: 1.00, wheelRadius: 0.35,
  },
  {
    id: 'vesper', name: 'Vesper 12',
    blurb: 'Higher top end, twitchier under load.',
    unlock: 1, body: 0x2f8fe0, accent: 0x7de4eb, trim: 0x1c2430,
    topSpeed: 1.07, accel: 0.97, grip: 0.95, wheelRadius: 0.35,
  },
  {
    id: 'meridian', name: 'Meridian GS',
    blurb: 'Planted touring build. Grip over glamour.',
    unlock: 3, body: 0x4fbf7a, accent: 0xf2e69a, trim: 0x243028,
    topSpeed: 0.96, accel: 1.00, grip: 1.11, wheelRadius: 0.35,
  },
  {
    id: 'kestrel', name: 'Kestrel RS',
    blurb: 'Sharp launch, short gearing, restless tail.',
    unlock: 5, body: 0xf2c53d, accent: 0xf5674f, trim: 0x33291a,
    topSpeed: 1.02, accel: 1.09, grip: 0.97, wheelRadius: 0.35,
  },
  {
    id: 'bastion', name: 'Bastion XT',
    blurb: 'Heavy and stubborn. Shrugs off contact.',
    unlock: 7, body: 0x8f5fd6, accent: 0x7de4eb, trim: 0x2a2338,
    topSpeed: 0.94, accel: 0.92, grip: 1.16, mass: 1.35, wheelRadius: 0.35,
  },
  {
    id: 'checker', name: 'Checker Ace',
    blurb: 'The gold-plated joke that is somehow quickest.',
    unlock: 10, body: 0xffd24a, accent: 0xe84747, trim: 0x1d1d1d,
    topSpeed: 1.10, accel: 1.06, grip: 1.05, wheelRadius: 0.35,
  },
];
