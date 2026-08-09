/* Kinetic Burst - original data: ki types, fighters, ladder. All names original. */
'use strict';

/* Ki triangle: POWER > SPEED > FOCUS > POWER */
var KI = [
  { id: 0, name: 'POWER', short: 'PWR', col: '#ff5c6e', dim: '#5c2430', beats: 1 },
  { id: 1, name: 'SPEED', short: 'SPD', col: '#54d98c', dim: '#1e4a33', beats: 2 },
  { id: 2, name: 'FOCUS', short: 'FCS', col: '#5aa9ff', dim: '#1e3a5c', beats: 0 }
];
var HEART = { id: 3, name: 'HEART', short: 'HRT', col: '#ffd166', dim: '#5c4a1e' };
var ORBS = [KI[0], KI[1], KI[2], HEART];

function kiMult(atkType, defType) {
  if (atkType > 2 || defType > 2) return 1;
  if (KI[atkType].beats === defType) return 1.5;
  if (KI[defType].beats === atkType) return 0.67;
  return 1;
}
function kiLabel(atkType, defType) {
  var m = kiMult(atkType, defType);
  return m > 1 ? 'ADV' : (m < 1 ? 'WEAK' : 'EVEN');
}

/* 9 original fighters. tier 0 = starters. */
var FIGHTERS = [
  { id: 0, name: 'VELL KARO', type: 0, hp: 118, atk: 30, tier: 0, trait: 'Steady bruiser. Balanced ki draw.' },
  { id: 1, name: 'NIX ARAVEL', type: 1, hp: 96, atk: 27, tier: 0, trait: 'Quick charge, thinner guard.' },
  { id: 2, name: 'OVI SANCT', type: 2, hp: 104, atk: 28, tier: 0, trait: 'Reads clashes; wider tap window.' },
  { id: 3, name: 'BRAND MOSSE', type: 0, hp: 132, atk: 27, tier: 1, trait: 'Heavy frame, slow burn.' },
  { id: 4, name: 'SURA LIM', type: 1, hp: 92, atk: 32, tier: 1, trait: 'Glass edge. Highest raw hit.' },
  { id: 5, name: 'TALO WREN', type: 2, hp: 112, atk: 26, tier: 2, trait: 'Converts hearts into extra ki.' },
  { id: 6, name: 'ASHEN MORO', type: 0, hp: 108, atk: 33, tier: 2, trait: 'Overcharge specialist.' },
  { id: 7, name: 'KAIDE RHO', type: 1, hp: 100, atk: 29, tier: 3, trait: 'Charges from any long chain.' },
  { id: 8, name: 'MIRA DELUNE', type: 2, hp: 120, atk: 31, tier: 3, trait: 'Champion focus. No weakness felt.' }
];

/* 8-round ladder, 3 opponents each. */
var LADDER = [
  { name: 'WARD GATE', foes: [['SCRAP TIN', 0], ['DUST PIN', 1], ['LOW EMBER', 2]] },
  { name: 'STONE TIER', foes: [['GRIT HOLLOW', 1], ['MARR VANE', 0], ['PALE OTT', 2]] },
  { name: 'CINDER TIER', foes: [['BOLT KESSA', 1], ['HORN DRIVA', 0], ['SILT MAREN', 2]] },
  { name: 'IRON TIER', foes: [['RASP CULLEN', 2], ['TIDE BARROW', 0], ['FLICK NOMI', 1]] },
  { name: 'STORM TIER', foes: [['VAULT ORREN', 0], ['SHRIKE ADA', 1], ['GLASS PENN', 2]] },
  { name: 'ASH TIER', foes: [['MORROW KAI', 2], ['BRIAR TOL', 0], ['QUILL SEV', 1]] },
  { name: 'CROWN GATE', foes: [['LANCE FERRO', 1], ['OBSID RUNE', 2], ['MAW GALLEN', 0]] },
  { name: 'THE CROWN', foes: [['SEER VOLTAINE', 2], ['REGENT HAAL', 0], ['PRIME ATRAX', 1]] }
];

/* Round scaling - shown to the player in the MATH panel. */
function foeHP(round) { return 66 + round * 34; }
function foeATK(round) { return 8 + round * 3.0; }
function foeSpeed(round) { return round >= 6 ? 2 : 3; }

/* Chain math constants (all surfaced in the MATH panel) */
var M = {
  minRun: 3,
  chargePerOrb: 14,
  chargeBonusPerExtra: 8,
  comboStep: 0.25,
  healPerOrb: 6,
  traceTime: 6.5,
  maxPath: 30,
  fullCharge: 100,
  overcap: 200,
  clashWindow: 1.7,
  clashPerfect: 2.0,
  clashGood: 1.4,
  clashLate: 0.75
};
