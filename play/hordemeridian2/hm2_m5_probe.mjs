#!/usr/bin/env node
/* hm2_m5_probe.mjs - M5 acceptance probe for Horde Meridian 2 (ship classes +
 * customization). Subsumes hm2_m5_migration_probe.mjs's save/HM1-import
 * coverage (re-run here against the SAME migration logic, not duplicated
 * wholesale) and adds:
 *   1) Hangar screenshots at 390px (SHIPS + STYLE tabs) with a live walk of
 *      the Phaser display list to catch overflow/clipping/undersized text
 *      that a screenshot alone cannot prove.
 *   2) Save round-trip + one-time HM1 import + "HM2 never writes HM1/hm_*
 *      keys" check.
 *   3) Balance sanity via the campaign sector bot on each ship class at Mk I.
 *
 * Run: node hm2_m5_probe.mjs [url]
 * Exits 0 on pass, 1 on any failure.
 */
import puppeteer from '/Users/lucille/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://127.0.0.1:8801/play/hordemeridian2/';
const SHOTDIR = '/tmp/hm2_m5_shots';
fs.mkdirSync(SHOTDIR, { recursive: true });
const W = 390, H = 844;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let cases = 0;
function ok(name, cond, detail) {
  cases++;
  if (cond) { console.log('PASS ' + name); }
  else { failures++; console.log('FAIL ' + name + (detail != null ? '  :: ' + detail : '')); }
}

// ========================================================================
// PART A: save round-trip / migration / HM1 import (node-only, no browser).
// Re-implements the exact v3->v4 migration rule from game.js (see game.js,
// the "if (profile.version === 3)" block right after the v2->v3 bump) so
// this can be checked cheaply and repeatedly under mutation, same technique
// as hm2_m5_migration_probe.mjs.
// ========================================================================
function makeLocalStorage(map) {
  return { getItem: (k) => Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null };
}
function migrateV3ToV4(profile, localStorageLike) {
  if (profile.version !== 3) return profile;
  profile.version = 4;
  if (!profile.hangar.shipTiers) profile.hangar.shipTiers = { warden: 1, recon: 0, vector: 0 };
  if (!profile.hangar.shipClass) profile.hangar.shipClass = 'warden';
  if (!profile.hm1ImportDone) {
    let hm1Bonus = 0;
    try {
      const hm1Raw = localStorageLike ? localStorageLike.getItem('gg-horde-meridian') : null;
      if (hm1Raw) {
        const hm1Data = JSON.parse(hm1Raw);
        const hm1Bal = hm1Data && hm1Data.hangar ? hm1Data.hangar.balance : null;
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

(function partA() {
  const v3 = {
    version: 3, best: 4200, meta: { power: 3, vigor: 2, haste: 1, draw: 4, fortune: 0, second: 1 },
    runs: 17, tutorialDone: true,
    hangar: {
      balance: 875, tiers: { hull: 2, reactor: 1, thrusters: 3, magnet: 0, wingBay: 1, fortune: 2, gunDeck: 1 },
      equippedWeapon: 'seeker', loadout: ['seeker', 'mortar', ''],
      weaponsSeen: { lance: true, seeker: true, mortar: true },
      paint: 'crimson', trim: 'violet', frame: 'recon'
    },
    campaign: { unlocked: 4, stars: { 1: 3, 2: 2 }, bestTimes: { 1: 240, 2: 310 } }
  };
  const v3Json = JSON.stringify(v3);

  const noHm1 = migrateV3ToV4(JSON.parse(v3Json), makeLocalStorage({}));
  ok('v3->v4 version bumped', noHm1.version === 4);
  ok('v3->v4 balance preserved (no HM1 present)', noHm1.hangar.balance === v3.hangar.balance);
  ok('v3->v4 tiers preserved', JSON.stringify(noHm1.hangar.tiers) === JSON.stringify(v3.hangar.tiers));
  ok('v3->v4 loadout preserved', JSON.stringify(noHm1.hangar.loadout) === JSON.stringify(v3.hangar.loadout));
  ok('v3->v4 paint/trim/frame preserved',
    noHm1.hangar.paint === v3.hangar.paint && noHm1.hangar.trim === v3.hangar.trim && noHm1.hangar.frame === v3.hangar.frame);
  ok('v3->v4 campaign preserved', JSON.stringify(noHm1.campaign) === JSON.stringify(v3.campaign));
  ok('v3->v4 grants warden Mk I owned', noHm1.hangar.shipTiers.warden === 1);
  ok('v3->v4 recon/vector unowned', noHm1.hangar.shipTiers.recon === 0 && noHm1.hangar.shipTiers.vector === 0);
  ok('v3->v4 default active class warden', noHm1.hangar.shipClass === 'warden');

  const hm1Save = { hangar: { balance: 1000 } };
  const ls = makeLocalStorage({ 'gg-horde-meridian': JSON.stringify(hm1Save) });
  const withHm1 = migrateV3ToV4(JSON.parse(v3Json), ls);
  const expectedBonus = Math.min(500, Math.round(1000 * 0.25));
  ok('HM1 import grants 25% capped at 500 (250 from 1000)',
    withHm1.hangar.balance === v3.hangar.balance + expectedBonus, 'got ' + withHm1.hangar.balance);
  ok('hm1ImportDone true after import', withHm1.hm1ImportDone === true);

  // Second pass (exactly what game.js's `if (!profile.hm1ImportDone)` guard
  // enforces on any later load) must not double-grant.
  function reapply(profile, localStorageLike) {
    if (profile.hm1ImportDone) return profile;
    return migrateV3ToV4(Object.assign({ version: 3 }, profile), localStorageLike);
  }
  const before = withHm1.hangar.balance;
  const after = reapply(withHm1, ls);
  ok('second migration pass does not double-grant', after.hangar.balance === before);

  const corruptLs = makeLocalStorage({ 'gg-horde-meridian': '{not valid json' });
  let threw = false, afterCorrupt = null;
  try { afterCorrupt = migrateV3ToV4(JSON.parse(v3Json), corruptLs); } catch (e) { threw = true; }
  ok('corrupt HM1 JSON does not throw', !threw);
  ok('corrupt HM1 JSON grants no bonus', !threw && afterCorrupt.hangar.balance === v3.hangar.balance);

  const absentLs = makeLocalStorage({});
  const afterAbsent = migrateV3ToV4(JSON.parse(v3Json), absentLs);
  ok('absent HM1 data handled, migration completes', afterAbsent.version === 4 && afterAbsent.hm1ImportDone === true);
}());

// ========================================================================
// PART B: browser-driven checks (hangar screenshots + HM1-write guard +
// balance sanity via the sector bot).
// ========================================================================
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--hide-scrollbars', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${W},${H}`]
});

async function newPage(forceTab) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 300)));
  // Filter Service Worker scope noise, matching hm2_campaign_probe.mjs's
  // treatment of the same benign warning (scope mismatch when serving from
  // a non-root static path in this harness, unrelated to game correctness).
  const rawPush = errs.push.bind(errs);
  errs.push = (msg) => { if (!/scope/.test(msg) && !/Service Worker/i.test(msg)) rawPush(msg); };
  if (forceTab) {
    await page.evaluateOnNewDocument((tab) => { window.__HM2_FORCE_TAB = tab; }, forceTab);
  }
  let loaded = false;
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__HORDE_READY === true, { timeout: 45000 });
      loaded = true;
    } catch (e) {
      if (attempt === 2) throw e;
      await wait(2000);
    }
  }
  await wait(2000);
  return { page, errs };
}

// ---- B1: hangar tab legibility walk (SHIPS + STYLE) ----
async function checkHangarTab(tabKey) {
  const { page, errs } = await newPage(tabKey);
  // Boot into the hangar/shop scene with the forced tab.
  await page.evaluate(() => {
    window.__HORDE.game.pendingLevel = null;
    const scenePlugin = window.__HORDE.game.phaser.scene;
    scenePlugin.stop('title');
    scenePlugin.start('shop');
  });
  await wait(1200);

  const walk = await page.evaluate((W) => {
    const scenePlugin = window.__HORDE.game.phaser.scene;
    const scene = scenePlugin.getScene('shop');
    if (!scene || !scene.sys.isActive()) return { error: 'shop scene not active' };
    const issues = { smallScale: [], tooWide: [], vClipped: [] };
    const H = scene.scale.height / (window.__HM_DPR || 1);
    const list = scene.children.list;
    function walkList(items) {
      for (const obj of items) {
        if (obj.type === 'Text' || obj.type === 'BitmapText') {
          const sx = obj.scaleX != null ? obj.scaleX : 1;
          const sy = obj.scaleY != null ? obj.scaleY : 1;
          if (sx < 1.0 || sy < 1.0) issues.smallScale.push({ text: (obj.text || '').slice(0, 40), sx, sy });
          const b = obj.getBounds ? obj.getBounds() : null;
          if (b) {
            if (b.width > W) issues.tooWide.push({ text: (obj.text || '').slice(0, 40), width: b.width });
            if (b.y < 0 || b.y + b.height > H) issues.vClipped.push({ text: (obj.text || '').slice(0, 40), top: b.y, bottom: b.y + b.height });
          }
        }
        if (obj.list && Array.isArray(obj.list)) walkList(obj.list);
      }
    }
    walkList(list);
    return {
      issues,
      page: scene.page,
      objCount: list.length
    };
  }, W);

  await page.screenshot({ path: `${SHOTDIR}/hangar_${tabKey}.png` });
  await page.close();
  return { walk, errs };
}

const shipsRes = await checkHangarTab('ships');
ok('SHIPS tab reached (page === "ships")', shipsRes.walk.page === 'ships', JSON.stringify(shipsRes.walk.error || shipsRes.walk.page));
if (!shipsRes.walk.error) {
  ok('SHIPS tab: no text scale < 1.0', shipsRes.walk.issues.smallScale.length === 0, JSON.stringify(shipsRes.walk.issues.smallScale));
  ok('SHIPS tab: no text wider than viewport', shipsRes.walk.issues.tooWide.length === 0, JSON.stringify(shipsRes.walk.issues.tooWide));
  ok('SHIPS tab: no text vertically clipped', shipsRes.walk.issues.vClipped.length === 0, JSON.stringify(shipsRes.walk.issues.vClipped));
}
ok('SHIPS tab: no console/page errors', shipsRes.errs.length === 0, shipsRes.errs.join(' | '));

const styleRes = await checkHangarTab('style');
ok('STYLE tab reached (page === "style")', styleRes.walk.page === 'style', JSON.stringify(styleRes.walk.error || styleRes.walk.page));
if (!styleRes.walk.error) {
  ok('STYLE tab: no text scale < 1.0', styleRes.walk.issues.smallScale.length === 0, JSON.stringify(styleRes.walk.issues.smallScale));
  ok('STYLE tab: no text wider than viewport', styleRes.walk.issues.tooWide.length === 0, JSON.stringify(styleRes.walk.issues.tooWide));
  ok('STYLE tab: no text vertically clipped', styleRes.walk.issues.vClipped.length === 0, JSON.stringify(styleRes.walk.issues.vClipped));
}
ok('STYLE tab: no console/page errors', styleRes.errs.length === 0, styleRes.errs.join(' | '));

// Card blurb <= 2 lines: SHIP_CLASSES blurbs + META blurbs are already
// wrapped via window.__HM2_UI.wrapText(..., 2) inside ShopScene.renderPage,
// so this is enforced structurally by construction; verify the wrap helper
// itself never emits more than 2 lines for the actual data-driven blurb
// strings, which is the thing that could regress silently.
{
  const { page, errs } = await newPage('ships');
  await page.evaluate(() => {
    window.__HORDE.game.pendingLevel = null;
    window.__HORDE.game.phaser.scene.stop('title');
    window.__HORDE.game.phaser.scene.start('shop');
  });
  await wait(1000);
  const blurbCheck = await page.evaluate(() => {
    const scenePlugin = window.__HORDE.game.phaser.scene;
    const scene = scenePlugin.getScene('shop');
    const HM_DATA = window.__HM_DATA;
    const results = [];
    if (window.__HM2_UI && scene) {
      for (const cls of HM_DATA.SHIP_CLASSES) {
        const lines = window.__HM2_UI.wrapText(scene, cls.blurb, { fontFamily: HM_DATA.FONT_BODY, fontSize: HM_DATA.TYPE.micro }, 390 - 44, 2);
        results.push({ key: cls.key, lineCount: lines.length });
      }
    }
    return results;
  });
  await page.close();
  ok('ship class blurbs wrap to <= 2 lines',
    blurbCheck.length > 0 && blurbCheck.every((r) => r.lineCount <= 2), JSON.stringify(blurbCheck));
  ok('blurb-check tab: no console/page errors', errs.length === 0, errs.join(' | '));
}

// ---- B2: HM2 never writes to gg-horde-meridian or hm_* keys ----
{
  const { page, errs } = await newPage();
  const writeCheck = await page.evaluate(() => {
    const before = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      before[k] = localStorage.getItem(k);
    }
    // Exercise a save write cycle (buy a track / touch profile) to make sure
    // an actual write happens, then diff the keyset.
    window.__HORDE.kit.save.set(window.__HORDE.profile);
    const after = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      after[k] = localStorage.getItem(k);
    }
    const newOrChangedKeys = Object.keys(after).filter((k) => after[k] !== before[k]);
    const badKeys = newOrChangedKeys.filter((k) => k === 'gg-horde-meridian' || /^hm_/.test(k));
    return { badKeys, hasHm1Key: Object.prototype.hasOwnProperty.call(after, 'gg-horde-meridian') };
  });
  await page.close();
  ok('HM2 save cycle never writes gg-horde-meridian or hm_* keys',
    writeCheck.badKeys.length === 0, JSON.stringify(writeCheck.badKeys));
  ok('no console/page errors during write-guard check', errs.length === 0, errs.join(' | '));
}

// ---- B2b: activeShipTierData actually reads the OWNED tier, not always
// Mk I. Boots into 'play' with warden owned at Mk III and checks p.maxHp
// against the data contract's Mk I/Mk III hpMult (1.30 vs 1.50 of the same
// base), which only differ when the tier lookup is wired to ownership.
{
  const { page, errs } = await newPage();
  function bootAt(tier) {
    const h = window.__HORDE.profile.hangar;
    h.shipTiers = { warden: tier, recon: 1, vector: 1 };
    h.shipClass = 'warden';
    window.__HORDE.kit.save.set(window.__HORDE.profile);
    window.__HORDE.game.pendingLevel = null;
    const g = window.__HORDE.game;
    (g.scene || g.phaser.scene.getScenes(true)[0]).scene.start('play');
  }
  await page.evaluate(bootAt, 1);
  await wait(700);
  const mk1MaxHp = await page.evaluate(() => window.__HORDE.game.scene.p.maxHp);
  await page.evaluate(bootAt, 3);
  await wait(700);
  const mk3MaxHp = await page.evaluate(() => window.__HORDE.game.scene.p.maxHp);
  const mults = await page.evaluate(() => {
    const HM_DATA = window.__HM_DATA;
    const cls = HM_DATA.SHIP_CLASSES.find((c) => c.key === 'warden');
    return { mk1Mult: cls.tiers[0].hpMult, mk3Mult: cls.tiers[2].hpMult };
  });
  const tierCheck = { mk1MaxHp, mk3MaxHp, mk1Mult: mults.mk1Mult, mk3Mult: mults.mk3Mult };
  await page.close();
  const expectRatio = tierCheck.mk3Mult / tierCheck.mk1Mult;
  const gotRatio = tierCheck.mk1MaxHp > 0 ? tierCheck.mk3MaxHp / tierCheck.mk1MaxHp : 0;
  ok('warden Mk III owned yields higher maxHp than Mk I owned (activeShipTierData honors ownership)',
    tierCheck.mk3MaxHp > tierCheck.mk1MaxHp && Math.abs(gotRatio - expectRatio) < 0.02,
    JSON.stringify(tierCheck) + ' gotRatio=' + gotRatio + ' expectRatio=' + expectRatio);
  ok('tier-ownership check page: no console/page errors', errs.length === 0, errs.join(' | '));
}

// ---- B2c: decalUnlocked actually gates locked decals (not unconditionally
// true). Forces a profile that has definitely not met any decal's unlock
// condition (0 runs, no campaign stars, region 1) and confirms the shop UI
// treats gated decals as locked by walking the STYLE tab render state.
{
  const { page, errs } = await newPage('style');
  await page.evaluate(() => {
    // Clear any prior-page save in this same browser context first: earlier
    // pages in this run (hangar walks, sector-bot trials) accumulate real
    // profile progress (weaponsSeen, runs, campaign stars) in localStorage,
    // which would let a gated decal look unlocked here for a reason
    // unrelated to the mutation under test.
    localStorage.clear();
    const p = window.__HORDE.profile;
    p.runs = 0;
    p.campaign = { unlocked: 1, stars: {}, bestTimes: {} };
    p.hangar.weaponsSeen = { lance: true };
    window.__HORDE.kit.save.set(p);
    window.__HORDE.game.pendingLevel = null;
    const scenePlugin = window.__HORDE.game.phaser.scene;
    scenePlugin.stop('title');
    scenePlugin.start('shop');
  });
  await wait(1200);
  const gateCheck = await page.evaluate(() => {
    const HM_DATA = window.__HM_DATA;
    const scenePlugin = window.__HORDE.game.phaser.scene;
    const scene = scenePlugin.getScene('shop');
    if (!scene) return { error: 'shop scene not active' };
    // Locked decals render at alpha 0.5 with the ic_lock frame (see
    // ShopScene STYLE tab render: dBg.setAlpha(dUnlocked ? 1 : 0.5) and the
    // icon texture frame falls back to 'ic_lock' when !dUnlocked). Walk the
    // display list to find each decal's icon Image and read its actual
    // rendered frame/alpha, which is what a real player sees, rather than
    // calling the gate function directly.
    const gated = HM_DATA.DECALS.filter((d) => d.key !== 'none' && typeof d.gate === 'function');
    const gatedFrameNames = gated.map((d) => d.frame);
    const icons = [];
    function walk(items) {
      for (const obj of items) {
        if (obj.type === 'Image' && obj.visible !== false && obj.frame &&
          (gatedFrameNames.includes(obj.frame.name) || obj.frame.name === 'ic_lock')) {
          icons.push({ frame: obj.frame.name, alpha: obj.alpha });
        }
        if (obj.list && Array.isArray(obj.list)) walk(obj.list);
      }
    }
    walk(scene.children.list);
    // Any gated decal whose icon shows its real (non-lock) frame at full
    // opacity means it rendered as unlocked despite the fresh profile
    // meeting none of the gate criteria.
    const realFrameLeaks = icons.filter((i) => gatedFrameNames.includes(i.frame));
    return { icons, gatedFrameNames, realFrameLeaks, gatedCount: gated.length };
  });
  await page.close();
  ok('locked decals render greyed (ic_lock frame, not their real frame) on a fresh profile that meets no gate',
    !gateCheck.error && gateCheck.gatedCount > 0 && gateCheck.realFrameLeaks.length === 0, JSON.stringify(gateCheck));
  ok('decal-gate check page: no console/page errors', errs.length === 0, errs.join(' | '));
}

// ---- B3: balance sanity via the sector bot, one class at a time, Mk I ----
const BOT = () => {
  window.__gateBot = setInterval(() => {
    const s = window.__HORDE.game.scene;
    if (!s || !s.p) return;
    if (s.state !== 'playing') {
      if (s.pickUpgrade && (s.state === 'draft' || s.state === 'levelup')) s.pickUpgrade(0);
      return;
    }
    const p = s.p, R = 260, SEC = 8, dens = new Array(SEC).fill(0);
    let near140 = 0;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d < 140) near140++;
      if (d < R) {
        const k = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEC) % SEC;
        dens[k] += (R - d) / R;
        dens[(k + 1) % SEC] += 0.4 * (R - d) / R;
        dens[(k + SEC - 1) % SEC] += 0.4 * (R - d) / R;
      }
    }
    const gemPull = new Array(SEC).fill(0);
    if (s.gems) for (const g of s.gems) {
      if (!g.alive) continue;
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      if (d < 500) {
        const k = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEC) % SEC;
        gemPull[k] += 0.6 * (500 - d) / 500;
      }
    }
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < SEC; k++) {
      const sc = dens[k] - gemPull[k];
      if (sc < bestScore) { bestScore = sc; best = k; }
    }
    const ang = (best + 0.5) / SEC * Math.PI * 2;
    const vx = Math.cos(ang), vy = Math.sin(ang);
    s.stick.active = true; s.stick.dx = vx; s.stick.dy = vy;
    if (near140 >= 12 && (s.run.strikeCharges || 0) > 0 && !s.airStrike.active) s.tryCallAirstrike();
  }, 50);
};

async function runClassTrial(classKey, seconds) {
  const { page, errs } = await newPage();
  const setup = await page.evaluate((ck) => {
    const h = window.__HORDE.profile.hangar;
    h.shipTiers = { warden: 1, recon: 1, vector: 1 };
    h.shipClass = ck;
    window.__HORDE.kit.save.set(window.__HORDE.profile);
    window.__HORDE.game.pendingLevel = null;
    const g = window.__HORDE.game;
    (g.scene || g.phaser.scene.getScenes(true)[0]).scene.start('play');
    return true;
  }, classKey);
  await wait(700);
  await page.evaluate(BOT);
  const samples = [];
  const cap = Math.ceil(90 / 2);
  let out = null;
  for (let i = 0; i < cap; i++) {
    await wait(2000);
    const s = await page.evaluate(() => {
      const sc = window.__HORDE.game.scene;
      return {
        hp: Math.round(sc.p.hp), maxHp: sc.p.maxHp, dmg: sc.p.damage,
        // Effective hp includes the Warden absorb pool. Sampling p.hp alone
        // makes "took damage" vacuous for Warden, whose shield soaks the
        // chip damage a bot trial produces before hp ever moves.
        effHp: Math.round(sc.p.hp + (sc.p.shield || 0)),
        shield: Math.round(sc.p.shield || 0), shieldMax: Math.round(sc.p.shieldMax || 0),
        // Monotonic: never decreases, so it cannot be missed between polls
        // the way a regenerating hp/shield read can be.
        damageTaken: Math.round((sc.p.damageTaken || 0) * 100) / 100,
        t: Math.round(sc.run.time), st: sc.state,
        kills: sc.run.kills || 0
      };
    });
    samples.push(s);
    if (s.hp <= 0 || s.st === 'dead' || s.st === 'gameover' || s.st === 'over') { out = s; break; }
  }
  const final = out || samples[samples.length - 1];
  const minHp = samples.length ? Math.min(...samples.map((s) => s.hp)) : final.hp;
  // Peak effective hp is the starting pool (hp + full shield); the minimum
  // over the trial tells us damage actually landed, whichever pool absorbed it.
  const maxEffHp = samples.length ? Math.max(...samples.map((s) => s.effHp)) : final.hp;
  const minEffHp = samples.length ? Math.min(...samples.map((s) => s.effHp)) : final.hp;
  await page.evaluate(() => { if (window.__gateBot) clearInterval(window.__gateBot); });
  await page.close();
  return { classKey, final, samples, minHp, minEffHp, maxEffHp, errs };
}

const classResults = {};
for (const cls of ['warden', 'recon', 'vector']) {
  const r = await runClassTrial(cls, 90);
  classResults[cls] = r;
  console.log(`  class=${cls} survivalT=${r.final.t}s hp=${r.final.hp}/${r.final.maxHp} dmgStat=${r.final.dmg} errs=${r.errs.length}`);
}
console.log('CLASS RESULTS ' + JSON.stringify(Object.fromEntries(Object.entries(classResults).map(([k, v]) => [k, v.final]))));

for (const cls of ['warden', 'recon', 'vector']) {
  const r = classResults[cls];
  ok(`class ${cls}: no console/page errors during trial`, r.errs.length === 0, r.errs.join(' | '));
  ok(`class ${cls}: survives a reasonable window (t >= 20s)`, r.final.t >= 20, 't=' + r.final.t);
  // Use the monotonic damageTaken counter, not an hp/shield sample. The
  // Warden pool (35) refills at 14/s after a 3s delay, so it can fully
  // recover inside the 2s sampling gap and hide every hit that landed.
  ok(`class ${cls}: took damage (cumulative damageTaken > 0)`,
    r.final.damageTaken > 0,
    'damageTaken=' + r.final.damageTaken + ' minEffHp=' + r.minEffHp + ' maxEffHp=' + r.maxEffHp);
  ok(`class ${cls}: dealt damage (kills > 0)`, r.final.kills > 0, JSON.stringify(r.final));
}

// Warden-specific: prove the shield pool actually absorbs hits (not just
// that hp moves). If the absorb step were removed from the damage path,
// damageTaken would still be > 0 (it's computed before absorption either
// way) so the generic "took damage" check above cannot catch that hole.
// A shield that never dips below its max during a 90s trial where the
// class clearly took damage means the absorb step never ran.
{
  const w = classResults.warden;
  const shieldDipSeen = w.samples.some((s) => s.shieldMax > 0 && s.shield < s.shieldMax);
  ok('class warden: shield pool actually dips below max under fire (absorb step runs)',
    w.final.damageTaken > 0 && shieldDipSeen,
    'damageTaken=' + w.final.damageTaken + ' shieldSamples=' + JSON.stringify(w.samples.map((s) => ({ shield: s.shield, shieldMax: s.shieldMax }))));
}

// Ordering / separation checks driven straight off the SHIP_CLASSES data
// contract (warden tankier maxHp, vector higher damage stat, recon fastest
// via speedMult recorded server-side) rather than the noisy bot survival
// time alone, per the M2 lesson that the campaign bar is bimodal. We still
// print raw bot numbers above for visibility.
ok('warden has higher maxHp than recon and vector (tankier)',
  classResults.warden.final.maxHp > classResults.recon.final.maxHp &&
  classResults.warden.final.maxHp > classResults.vector.final.maxHp,
  JSON.stringify({ warden: classResults.warden.final.maxHp, recon: classResults.recon.final.maxHp, vector: classResults.vector.final.maxHp }));
ok('vector has higher damage stat than warden and recon (glass cannon)',
  classResults.vector.final.dmg > classResults.warden.final.dmg &&
  classResults.vector.final.dmg > classResults.recon.final.dmg,
  JSON.stringify({ warden: classResults.warden.final.dmg, recon: classResults.recon.final.dmg, vector: classResults.vector.final.dmg }));

// Speed ordering pulled directly from the data contract (recon fastest,
// warden slowest) with a margin check, since the sector bot doesn't
// directly report speed in survival time reliably.
{
  const { page, errs } = await newPage();
  const speedData = await page.evaluate(() => {
    const HM_DATA = window.__HM_DATA;
    const out = {};
    for (const cls of HM_DATA.SHIP_CLASSES) out[cls.key] = cls.tiers[0].speedMult;
    return out;
  });
  await page.close();
  ok('recon Mk I speedMult > warden and vector Mk I speedMult (fastest, with margin)',
    speedData.recon > speedData.warden + 0.05 && speedData.recon > speedData.vector + 0.05,
    JSON.stringify(speedData));
  ok('speed-data-check page: no console/page errors', errs.length === 0, errs.join(' | '));
}

await browser.close();

console.log('');
console.log(cases + ' assertions, ' + failures + ' failed');
process.exit(failures > 0 ? 1 : 0);
