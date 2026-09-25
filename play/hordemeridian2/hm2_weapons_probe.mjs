/*
 * hm2_weapons_probe.mjs - weapon and evolution reachability probe.
 *
 * Drives the REAL game code (openDraft / pickUpgrade / nextWeaponDrop /
 * activateWeaponDrop / retryEvolutions in game.js) across ship classes and
 * missions with a seeded Math.random, and asserts:
 *   1. every base weapon is offered in a level-up draft with nonzero frequency
 *   2. every base weapon is obtained with nonzero frequency
 *   3. every evolution is obtained through its recipe (base weapon level 5 +
 *      hangar module rank 1) with nonzero frequency
 *   4. invariant: no carried base weapon ever sits at max draft rank with its
 *      recipe module owned and still un-evolved (the stranded-evolution bug)
 *
 * Run (serve the repo root on 8680 first):
 *   cd <repo> && python3 -m http.server 8680 --bind 127.0.0.1 &
 *   node play/hordemeridian2/hm2_weapons_probe.mjs [url]
 * Mutations (each must FAIL):
 *   HM2_WEAPONS_MUTATE=pool   removes weapon_mortar from the draft pool
 *   HM2_WEAPONS_MUTATE=recipe points flak.evolvesTo at a missing key
 * Exits 1 on any failure.
 */
import puppeteer from '/Users/lucille/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://127.0.0.1:8680/play/hordemeridian2/';
const MUTATE = process.env.HM2_WEAPONS_MUTATE || '';
const RUNS = Number(process.env.HM2_WEAPONS_RUNS || 6);
const LEVELUPS = 40;
const CLASSES = ['warden', 'recon', 'vector'];
const MISSIONS = [0, 1, 5, 10, 15];   // 0 = endless sector run
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0, cases = 0;
function ok(name, cond, detail) {
  cases++;
  if (cond) console.log('PASS ' + name);
  else { failures++; console.log('FAIL ' + name + (detail != null ? '  :: ' + detail : '')); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=390,844']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.stack || e).slice(0, 500)));
await page.evaluateOnNewDocument(() => {
  window.addEventListener('error', (ev) => { console.log('HM2WP_ERR ' + (ev.error && ev.error.stack || ev.message)); });
});
page.on('console', (m) => { if (m.text().indexOf('HM2WP_ERR') === 0) console.log(m.text().slice(0, 900)); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__HORDE_READY === true, { timeout: 45000 });
await wait(1500);

const tables = await page.evaluate(() => {
  const D = window.__HM_DATA;
  const base = D.WEAPONS.filter((w) => (w.tier || 'base') !== 'evolution').map((w) => w.key);
  const evo = D.WEAPONS.filter((w) => w.tier === 'evolution').map((w) => w.key);
  return { base, evo, levels: Object.keys(window.__HM_LEVELS || {}) };
});
ok('weapon table has 12 base weapons', tables.base.length === 12, tables.base.join(','));
ok('weapon table has 12 evolutions', tables.evo.length === 12, tables.evo.join(','));

if (MUTATE) {
  await page.evaluate((m) => {
    const D = window.__HM_DATA;
    if (m === 'pool') {
      const i = D.UPGRADES.findIndex((u) => u.key === 'weapon_mortar');
      if (i >= 0) D.UPGRADES.splice(i, 1);
    } else if (m === 'recipe') {
      D.WEAPON_BY_KEY.flak.evolvesTo = 'nova-curtian';
    }
  }, MUTATE);
  console.log('MUTATION ACTIVE: ' + MUTATE);
}

const offered = {}, obtained = {}, evolved = {};
const stranded = [];
let totalDrafts = 0, totalRuns = 0;

for (const cls of CLASSES) {
  for (const mission of MISSIONS) {
    // Boot the play scene for this class + mission with the real loop
    // running, then drive every run synchronously inside one evaluate
    // (resetRun + drafts), so no animation frame can interleave with it.
    await page.evaluate((cls, mission) => {
      const H = window.__HORDE;
      const h = H.profile.hangar;
      h.shipTiers = { warden: 1, recon: 1, vector: 1 };
      h.shipClass = cls;
      // every recipe module owned at rank 1 (gunDeck 1 also opens slot 2)
      ['hull', 'reactor', 'thrusters', 'magnet', 'wingBay', 'fortune', 'gunDeck'].forEach((k) => {
        h.tiers[k] = 1;
      });
      H.kit.save.set(H.profile);
      H.game.pendingLevel = mission ? window.__HM_LEVELS[mission] : null;
      window.__hm2wpBoot = H.game.scene;
      const mgr = H.game.phaser.scene;
      const active = H.game.scene || mgr.getScenes(true)[0];
      if (active && active.scene) active.scene.start('play'); else mgr.start('play');
    }, cls, mission);
    let booted = false, st = '';
    for (let t = 0; t < 120 && !booted; t++) {
      await wait(250);
      st = await page.evaluate(() => {
        const g = window.__HORDE.game, s = g.scene;
        return JSON.stringify({ key: s && s.sys && s.sys.settings.key, run: !!(s && s.run && s.p), st: s && s.state });
      });
      booted = JSON.parse(st).key === 'play' && JSON.parse(st).run;
    }
    if (!booted) throw new Error('play scene did not boot: ' + st + ' errs=' + errs.slice(0, 3).join(' | '));
    await wait(300);
    for (let run = 0; run < RUNS; run++) {
      const seed = (CLASSES.indexOf(cls) + 1) * 100000 + mission * 1000 + run + 1;
      const res = await page.evaluate((seed, LEVELUPS) => {
        let a = seed >>> 0;
        const rng = () => {
          a |= 0; a = (a + 0x6D2B79F5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const realRandom = Math.random;
        Math.random = rng;
        const s = window.__HORDE.game.scene;
        const D = window.__HM_DATA;
        window.__HORDE.game.pendingLevel = s.level || null;
        s.resetRun();
        const out = { offered: {}, obtained: {}, evolved: {}, stranded: [], drafts: 0, err: '' };
        const hold = (k) => s.run.arsenal.indexOf(k) >= 0 || s.run.weaponSlots.indexOf(k) >= 0;
        try {
          if (s.run.level !== 1 || s.run.time > 1) throw new Error('resetRun did not start fresh');
          if (s.draftHold) { clearTimeout(s.draftHold); s.draftHold = null; }
          s.closeOverlay && s.overlay && s.closeOverlay();
          s.state = 'playing';
          for (let i = 0; i < LEVELUPS; i++) {
            // field pickup: the guaranteed 25s cadence makes these common
            if (rng() < 0.4) {
              s.state = 'playing';
              const key = s.nextWeaponDrop(null, 'base');
              if (key) s.activateWeaponDrop(key);
            }
            s.state = 'playing';
            if (!s.availableUpgrades().length) continue;
            s.openDraft();
            out.drafts++;
            const cards = s.draftCards || [];
            let pick = -1;
            for (let c = 0; c < cards.length; c++) {
              if (cards[c].type === 'weapon') out.offered[cards[c].weapon] = (out.offered[cards[c].weapon] || 0) + 1;
            }
            // focused player: usually levels the most-advanced weapon it
            // already carries among the offered cards
            if (rng() < 0.8) {
              let best = -1;
              for (let c = 0; c < cards.length; c++) {
                if (cards[c].type !== 'weapon' || !hold(cards[c].weapon)) continue;
                const rk = s.p.ranks[cards[c].key] || 0;
                if (rk > best) { best = rk; pick = c; }
              }
            }
            if (pick < 0) pick = Math.floor(rng() * cards.length);
            s.pickUpgrade(pick);
            if (s.draftHold) { clearTimeout(s.draftHold); s.draftHold = null; }
          }
          const carried = s.run.arsenal.concat(s.run.weaponSlots).filter(Boolean);
          carried.forEach((k) => {
            const w = D.WEAPON_BY_KEY[k];
            if (!w) return;
            if (w.tier === 'evolution') out.evolved[k] = 1;
            else out.obtained[k] = 1;
          });
          Object.keys(out.evolved).forEach((k) => {
            const baseKey = Object.keys(D.WEAPON_BY_KEY).find((b) => D.WEAPON_BY_KEY[b].evolvesTo === k);
            if (baseKey) out.obtained[baseKey] = 1;
          });
          // stranded: base weapon at max draft rank, module owned, not evolved
          carried.forEach((k) => {
            const w = D.WEAPON_BY_KEY[k];
            if (!w || w.tier === 'evolution' || !w.evolvesTo) return;
            const u = D.UPGRADES.find((x) => x.weapon === k);
            const to = D.WEAPON_BY_KEY[w.evolvesTo];
            const mod = to && to.recipeModule;
            const owned = mod && (window.__HORDE.profile.hangar.tiers[mod] || 0) >= 1;
            if (u && (s.p.ranks[u.key] || 0) >= u.max && owned) out.stranded.push(k + '@L' + (s.run.weaponLevel[k] || 0));
          });
        } catch (e) { out.err = String(e && e.stack || e).slice(0, 400); }
        Math.random = realRandom;
        return out;
      }, seed, LEVELUPS);
      totalRuns++;
      totalDrafts += res.drafts;
      if (res.err) { ok('run ' + cls + '/L' + mission + '/' + run + ' no exception', false, res.err); }
      for (const k in res.offered) offered[k] = (offered[k] || 0) + res.offered[k];
      for (const k in res.obtained) obtained[k] = (obtained[k] || 0) + 1;
      for (const k in res.evolved) evolved[k] = (evolved[k] || 0) + 1;
      for (const k of res.stranded) stranded.push(cls + '/L' + mission + '/' + run + ':' + k);
    }
  }
}

console.log('runs=' + totalRuns + ' drafts=' + totalDrafts);
console.log('key                offered  obtainedRuns');
for (const k of tables.base) console.log(k.padEnd(18) + String(offered[k] || 0).padStart(8) + String(obtained[k] || 0).padStart(14));
console.log('evolution          evolvedRuns');
for (const k of tables.evo) console.log(k.padEnd(18) + String(evolved[k] || 0).padStart(12));

for (const k of tables.base) ok('base weapon offered in drafts: ' + k, (offered[k] || 0) > 0, 'offered=' + (offered[k] || 0));
for (const k of tables.base) ok('base weapon obtained: ' + k, (obtained[k] || 0) > 0, 'runs=' + (obtained[k] || 0));
for (const k of tables.evo) ok('evolution obtained via recipe: ' + k, (evolved[k] || 0) > 0, 'runs=' + (evolved[k] || 0));
ok('no stranded max-rank weapon with its module owned', stranded.length === 0,
  stranded.length + ' e.g. ' + stranded.slice(0, 6).join(' '));
ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

// browser.close() can hang on a loaded host; bound it, then kill Chrome
await Promise.race([browser.close(), wait(5000)]);
try { const bp = browser.process(); if (bp && bp.exitCode == null) bp.kill('SIGKILL'); } catch (e) { /* already gone */ }
console.log((failures ? 'FAIL' : 'PASS') + ' ' + (cases - failures) + '/' + cases);
process.exit(failures ? 1 : 0);
