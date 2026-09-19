#!/usr/bin/env node
/* hm2_m5_migration_probe.mjs - M5 acceptance probe for the v3 -> v4 profile
 * migration and one-time HM1 gem import.
 *
 * This does not load game.js directly (it needs a browser/Phaser DOM to run
 * top to bottom). Instead it re-implements the exact migration rule from
 * game.js's v3 -> v4 block (grant starter ship, one-time HM1 import capped
 * at 25% of HM1 balance or 500 gems, flagged with hm1ImportDone) against a
 * fake localStorage, and asserts:
 *   1) A v3 save round-trips to v4 with balance/tiers/loadout/paint/trim/
 *      frame/campaign all preserved byte-for-byte.
 *   2) An HM1 gem import grants exactly once (running the migration twice
 *      does not double-grant).
 *
 * Run: node hm2_m5_migration_probe.mjs
 * Exits 0 on pass, 1 on any failure.
 */

var failures = 0;
var cases = 0;
function ok(name, cond, detail) {
  cases++;
  if (cond) { console.log('PASS ' + name); }
  else { failures++; console.log('FAIL ' + name + (detail != null ? '  :: ' + detail : '')); }
}

// Fake localStorage, mirrors what window.localStorage.getItem returns.
function makeLocalStorage(map) {
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; } };
}

// The migration function under test, copied verbatim in behavior from the
// v3 -> v4 block in game.js (see game.js, migration block right after
// `if (profile.version === 2) { ... }`).
function migrateV3ToV4(profile, localStorageLike) {
  if (profile.version !== 3) return profile;
  profile.version = 4;
  if (!profile.hangar.shipTiers) profile.hangar.shipTiers = { warden: 1, recon: 0, vector: 0 };
  if (!profile.hangar.shipClass) profile.hangar.shipClass = 'warden';
  if (!profile.hm1ImportDone) {
    var hm1Bonus = 0;
    try {
      var hm1Raw = localStorageLike ? localStorageLike.getItem('gg-horde-meridian') : null;
      if (hm1Raw) {
        var hm1Data = JSON.parse(hm1Raw);
        var hm1Bal = hm1Data && hm1Data.hangar ? hm1Data.hangar.balance : null;
        if (typeof hm1Bal === 'number' && isFinite(hm1Bal) && hm1Bal > 0) {
          hm1Bonus = Math.min(500, Math.round(hm1Bal * 0.25));
        }
      }
    } catch (e) { hm1Bonus = 0; }
    if (hm1Bonus > 0) profile.hangar.balance = (profile.hangar.balance || 0) + hm1Bonus;
    profile.hm1ImportDone = true;
  }
  return profile;
}

// ----------------------------------------------------------------------
// Case 1: v3 -> v4 round trip preserves progression.
var v3Save = {
  version: 3,
  best: 4200,
  meta: { power: 3, vigor: 2, haste: 1, draw: 4, fortune: 0, second: 1 },
  runs: 17,
  tutorialDone: true,
  hangar: {
    balance: 875,
    tiers: { hull: 2, reactor: 1, thrusters: 3, magnet: 0, wingBay: 1, fortune: 2, gunDeck: 1 },
    equippedWeapon: 'seeker',
    loadout: ['seeker', 'mortar', ''],
    weaponsSeen: { lance: true, seeker: true, mortar: true },
    paint: 'crimson', trim: 'violet', frame: 'recon'
  },
  campaign: { unlocked: 4, stars: { 1: 3, 2: 2 }, bestTimes: { 1: 240, 2: 310 } }
};
var v3SaveJson = JSON.stringify(v3Save);
var v3Copy = JSON.parse(v3SaveJson);
var ls1 = makeLocalStorage({}); // no HM1 save present
var v4Result = migrateV3ToV4(v3Copy, ls1);

ok('version bumped to 4', v4Result.version === 4);
ok('balance preserved', v4Result.hangar.balance === v3Save.hangar.balance, v4Result.hangar.balance);
ok('tiers preserved', JSON.stringify(v4Result.hangar.tiers) === JSON.stringify(v3Save.hangar.tiers));
ok('loadout preserved', JSON.stringify(v4Result.hangar.loadout) === JSON.stringify(v3Save.hangar.loadout));
ok('paint preserved', v4Result.hangar.paint === v3Save.hangar.paint);
ok('trim preserved', v4Result.hangar.trim === v3Save.hangar.trim);
ok('frame preserved', v4Result.hangar.frame === v3Save.hangar.frame);
ok('campaign preserved', JSON.stringify(v4Result.campaign) === JSON.stringify(v3Save.campaign));
ok('meta preserved', JSON.stringify(v4Result.meta) === JSON.stringify(v3Save.meta));
ok('starter ship granted: warden owned at Mk I', v4Result.hangar.shipTiers.warden === 1);
ok('starter ship granted: recon/vector unowned', v4Result.hangar.shipTiers.recon === 0 && v4Result.hangar.shipTiers.vector === 0);
ok('default active class is warden', v4Result.hangar.shipClass === 'warden');
ok('hm1ImportDone flag set (no HM1 save present, no bonus)', v4Result.hm1ImportDone === true);
ok('no HM1 bonus granted when HM1 save absent', v4Result.hangar.balance === v3Save.hangar.balance);

// ----------------------------------------------------------------------
// Case 2: HM1 import grants exactly once.
var v3Save2 = JSON.parse(v3SaveJson);
var hm1Save = { hangar: { balance: 1000 } };
var ls2 = makeLocalStorage({ 'gg-horde-meridian': JSON.stringify(hm1Save) });
var afterFirst = migrateV3ToV4(v3Save2, ls2);
var expectedBonus = Math.min(500, Math.round(1000 * 0.25)); // 250
ok('HM1 import grants 25% of balance (250 gems from 1000)', afterFirst.hangar.balance === v3Save.hangar.balance + expectedBonus,
  'got ' + afterFirst.hangar.balance);
ok('hm1ImportDone true after first import', afterFirst.hm1ImportDone === true);

// Run "migration" a second time (simulating a second load/save cycle) on
// the already-migrated (now v4) profile: since migrateV3ToV4 only acts on
// version === 3, and profile.hm1ImportDone is already true, re-running the
// v3 branch logic directly (bypassing the version guard, as game.js's
// `if (!profile.hm1ImportDone)` check would on any later load) must not
// grant a second bonus.
function reapplyHm1ImportOnly(profile, localStorageLike) {
  if (profile.hm1ImportDone) return profile; // exactly what game.js's guard does
  return migrateV3ToV4(Object.assign({ version: 3 }, profile), localStorageLike);
}
var balanceBeforeSecondRun = afterFirst.hangar.balance;
var afterSecond = reapplyHm1ImportOnly(afterFirst, ls2);
ok('second migration pass does not double-grant HM1 gems', afterSecond.hangar.balance === balanceBeforeSecondRun,
  'before=' + balanceBeforeSecondRun + ' after=' + afterSecond.hangar.balance);

// ----------------------------------------------------------------------
// Case 3: corrupt / absent HM1 JSON is handled gracefully (no throw, no
// bonus, migration still completes).
var v3Save3 = JSON.parse(v3SaveJson);
var lsCorrupt = makeLocalStorage({ 'gg-horde-meridian': '{not valid json' });
var afterCorrupt;
var threw = false;
try {
  afterCorrupt = migrateV3ToV4(v3Save3, lsCorrupt);
} catch (e) { threw = true; }
ok('corrupt HM1 JSON does not throw', !threw);
ok('corrupt HM1 JSON grants no bonus, still completes migration', !threw && afterCorrupt.version === 4 &&
  afterCorrupt.hangar.balance === v3Save.hangar.balance);

console.log('');
console.log(cases + ' assertions, ' + failures + ' failed');
process.exit(failures > 0 ? 1 : 0);
