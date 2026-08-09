/* Silkwind - the eight masters. All names & titles original. */
'use strict';
/* seq tokens: H high strike, L low strike, T thrust, G grab, P parry,
   B burst art, R retreat, S stance shift. */
var MASTERS = [
  { name: 'REED WARDEN', title: 'Keeper of the First Gate', hp: 78,
    tell: 980, gap: 760, loose: 0.00, stanceMode: 'fix', stance: 1, guardMode: 'alt', hue: '#8fb7a6',
    seq: ['H', 'L', 'H', 'L', 'G'],
    tip: 'Plain high-low rhythm. Learn the parry beat.' },

  { name: 'IRON BELL', title: 'Warden of the Still Court', hp: 96,
    tell: 900, gap: 700, loose: 0.05, stanceMode: 'fix', stance: 2, guardMode: 'fix', hue: '#b9a06a',
    seq: ['H', 'H', 'G', 'L', 'G', 'H'],
    tip: 'Guards high forever and grabs turtles. Strike LOW.' },

  { name: 'TWIN WILLOW', title: 'Two Blades, One Breath', hp: 90,
    tell: 700, gap: 470, loose: 0.10, stanceMode: 'cycle', stance: 0, guardMode: 'alt', hue: '#9ad1e0',
    seq: ['H', 'H', 'L', 'T', 'L', 'L', 'S'],
    tip: 'Doubles every strike. Never parry only once.' },

  { name: 'ASH SPARROW', title: 'Rider of the Long Step', hp: 88,
    tell: 690, gap: 500, loose: 0.12, stanceMode: 'cycle', stance: 2, guardMode: 'rand', hue: '#cf9fd6',
    seq: ['R', 'H', 'R', 'L', 'S', 'T', 'R', 'G'],
    tip: 'Flees the range. Spend breath to dash in.' },

  { name: 'QUIET LANTERN', title: 'She Who Waits', hp: 90,
    tell: 780, gap: 540, loose: 0.14, stanceMode: 'counter', stance: 1, guardMode: 'alt', hue: '#e0d29a',
    seq: ['P', 'H', 'P', 'G', 'L', 'P', 'T'],
    tip: 'Eats greedy strikes. Bait the parry, then grab.' },

  { name: 'NINE COIL', title: 'Master of the Turning Form', hp: 94,
    tell: 640, gap: 500, loose: 0.16, stanceMode: 'counter', stance: 2, guardMode: 'alt', hue: '#7fe0b0',
    seq: ['H', 'S', 'L', 'S', 'T', 'G', 'S', 'H'],
    tip: 'Shifts to counter your stance. Swap late.' },

  { name: 'STORM HERON', title: 'Bearer of the Ninth Art', hp: 100,
    tell: 620, gap: 460, loose: 0.18, stanceMode: 'cycle', stance: 1, guardMode: 'rand', hue: '#7f9dff',
    seq: ['H', 'B', 'L', 'R', 'T', 'B', 'G', 'H'],
    tip: 'Burst arts cannot be parried. Evade them.' },

  { name: 'THE SILKWIND', title: 'Nameless Grandmaster', hp: 116,
    tell: 545, gap: 400, loose: 0.22, stanceMode: 'counter', stance: 0, guardMode: 'alt', hue: '#ff9fb0',
    seq: ['H', 'L', 'P', 'G', 'T', 'B', 'R', 'H', 'S', 'L', 'G', 'B'],
    tip: 'Every form at once. Read, do not guess.' }
];
