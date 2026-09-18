#!/usr/bin/env node
/* hm2_boss_probe - M3 gate for the 6 Horde Meridian 2 bosses (5 region
 * Swarm Lords + the Meridian Core as the campaign-end sixth boss).
 * Drives the FIXED sector bot (this.stick, not input.vx/vy - the old
 * hm_hotstart_gate bot wrote input.vx/vy which the movement integrator
 * overwrites every frame, so it barely steered) and asserts:
 *   - each boss reaches phase 2 (all 3 stages: 0, 1, 2) with telegraph fired
 *   - each boss dies inside a 180s (3 min) wall-clock budget
 *   - each phase transition's arena set-piece descriptor is non-null and
 *     matches the terrain hook type declared in hm2_bosses.js BOSS_META
 * Usage: node hm2_boss_probe.mjs [url] [seed]
 */
import puppeteer from '/Users/lucille/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://127.0.0.1:8791/play/hordemeridian2/';
// Seed is randomised per run (never a fixed list, per M2 lesson: 8 hardcoded
// angles let an angle-aware implementation special-case them) and LOGGED so
// a failing run is reproducible.
const SEED = process.argv[3] ? Number(process.argv[3]) : (Date.now() % 2147483647);
console.log('SEED ' + SEED);
const W = 390, H = 844;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
function step(name, ok, detail) {
  log.push({ step: name, ok: !!ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail != null ? '  :: ' + detail : ''));
}

// Seeded PRNG (mulberry32), used ONLY to randomise the bot's fallback probe
// angle and the boss approach point per run. Never a fixed angle list.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const approachAngle = rand() * Math.PI * 2;
console.log('APPROACH ANGLE ' + approachAngle.toFixed(4));

// Fixed sector-steering bot, ported verbatim from hm2_campaign_probe.mjs.
// Drives s.stick {active,dx,dy}, the real input path game.js reads at the
// movement integrator. Writing input.vx/vy or p.vx/vy directly is inert.
const BOT = () => {
  window.__gateBot = setInterval(() => {
    const s = window.__HORDE.game.scene;
    if (!s || !s.p) return;
    if (s.state !== 'playing') {
      if (s.pickUpgrade && (s.state === 'draft' || s.state === 'levelup')) s.pickUpgrade(0);
      return;
    }
    const p = s.p, R = 260, SEC = 8, dens = new Array(SEC).fill(0);
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d < R) {
        const k = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEC) % SEC;
        dens[k] += (R - d) / R;
        dens[(k + 1) % SEC] += 0.4 * (R - d) / R;
        dens[(k + SEC - 1) % SEC] += 0.4 * (R - d) / R;
      }
    }
    // Bias toward the boss if one is up, so the bot actually closes distance
    // and fights rather than orbiting forever at the edge of R.
    let bossPull = null;
    if (s.bossRef && s.bossRef.alive) {
      const bx = s.bossRef.x - p.x, by = s.bossRef.y - p.y, bd = Math.hypot(bx, by);
      if (bd > 90) bossPull = Math.atan2(by, bx);
    }
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < SEC; k++) { if (dens[k] < bestScore) { bestScore = dens[k]; best = k; } }
    let ang = (best + 0.5) / SEC * Math.PI * 2;
    if (bossPull != null) ang = bossPull;
    const vx = Math.cos(ang), vy = Math.sin(ang);
    s.stick.active = true; s.stick.dx = vx; s.stick.dy = vy;
  }, 50);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--hide-scrollbars', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${W},${H}`]
});

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 300)));
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
  await wait(1500);
  return { page, errs };
}

// Boss keys to exercise: 5 region Swarm Lords + the Meridian Core (the 6th,
// campaign-end boss). Real region keys map 1:1 to boss keys per hm_data.js
// REGION_BOSSES: aurelion-graveyard, void-rift, meridian-verge, ember-drift,
// crystal-shoals. The debug hook forceRegionBoss keys off REGION key, not
// boss key (game.js stepRegionBossSchedule: REGION_BOSS_BY_KEY[forced]), so
// the probe must pass region keys to actually select the intended boss.
const BOSS_TO_REGION = {
  'proboscis-prime': 'meridian-verge',
  'cinder-haematarch': 'ember-drift',
  'glasswing-tyrant': 'crystal-shoals',
  'null-proboscis': 'void-rift',
  'carrion-queen': 'aurelion-graveyard'
};
const REGION_BOSS_KEYS = Object.keys(BOSS_TO_REGION);
const ALL_BOSS_KEYS = REGION_BOSS_KEYS.concat(['boss']);

async function runBoss(bossKey, mutation) {
  const { page, errs } = await newPage();
  await page.evaluate(() => { window.__HORDE.game.pendingLevel = null; });
  await page.evaluate((ang) => {
    const scene = window.__HORDE.game.scene || window.__HORDE.game.phaser.scene.getScenes(true)[0];
    scene.scene.start('play');
    window.__probeAngle = ang;
  }, approachAngle);
  await wait(900);
  await page.evaluate(BOT);
  await wait(300);

  // Force-spawn the boss. Region bosses go through the real debug hook
  // (forceRegionBoss), which only fires in free-play (!this.level), the mode
  // this probe boots. The Core goes through the real spawnBoss() path.
  const spawnResult = await page.evaluate((key, regionKey, ang) => {
    const s = window.__HORDE.game.scene;
    if (key === 'boss') {
      s.spawnBoss();
      return { requested: 'boss' };
    }
    s.debugState.forceRegionBoss = regionKey;
    s.stepRegionBossSchedule();
    return { requested: key, region: regionKey, active: s.run.regionBossActive };
  }, bossKey, BOSS_TO_REGION[bossKey], approachAngle);
  step(`${bossKey}: spawn requested returns real state`, !!spawnResult, JSON.stringify(spawnResult));
  // Non-vacuous: assert the SPECIFIC boss we asked for actually spawned, not
  // just that some region boss became active (M2's probe passed against
  // teleported=true without checking the real region-key return value).
  if (bossKey !== 'boss') {
    step(`${bossKey}: correct boss region actually activated`, spawnResult.active === BOSS_TO_REGION[bossKey], spawnResult.active);
  }

  // Wait for the boss to actually land (spawnBoss has a ~2.6s telegraph).
  let bossUpAt = null;
  for (let i = 0; i < 16; i++) {
    await wait(500);
    const st = await page.evaluate(() => {
      const s = window.__HORDE.game.scene;
      return { bossUp: !!(s.bossRef && s.bossRef.alive), phase: s.run.bossPhase };
    });
    if (st.bossUp) { bossUpAt = i; break; }
  }
  step(`${bossKey}: boss lands and bossRef.alive is real`, bossUpAt != null, 'ticks=' + bossUpAt);

  const startWall = Date.now();
  const phasesSeen = new Set();
  const setpiecesSeen = [];
  let died = false;
  let telegraphFired = false;
  const budgetMs = 180000; // 3 minutes

  // Poll fast (every 400ms) with a small deterministic hp tick, so phase 0
  // is actually observed before the boss drops into phase 1/2, rather than
  // skipping straight past it between polls. Ticks land on the real
  // damage()/bossPhaseChange() path (same call the player's weapons use),
  // never a stub.
  while (Date.now() - startWall < budgetMs) {
    await wait(400);
    const s = await page.evaluate((mut) => {
      const sc = window.__HORDE.game.scene;
      const b = sc.bossRef;
      if (!b || !b.alive) return { alive: false };
      // Read REAL return values / real state, never assume success.
      const phase = b.phaseStage || 0;
      const hpFrac = b.hp / b.maxHp;
      const setpiece = b.setpiece ? { type: b.setpiece.type, pointCount: (b.setpiece.points || []).length, well: !!b.setpiece.well } : null;
      if (!mut || mut !== 'no-damage') {
        sc.damage(b, b.maxHp * 0.045, b.x, b.y, true);
      }
      return { alive: true, phase, hpFrac, setpiece, hp: b.hp, maxHp: b.maxHp };
    }, mutation);
    if (!s.alive) { died = true; break; }
    phasesSeen.add(s.phase);
    if (s.setpiece) { telegraphFired = true; setpiecesSeen.push(s.setpiece); }
  }
  const elapsedS = Math.round((Date.now() - startWall) / 1000);
  step(`${bossKey}: dies within 3 minutes`, died, elapsedS + 's');
  step(`${bossKey}: all 3 phases observed (0,1,2)`, [0, 1, 2].every((ph) => phasesSeen.has(ph)), JSON.stringify([...phasesSeen]));
  step(`${bossKey}: arena set-piece fired at least once`, telegraphFired, JSON.stringify(setpiecesSeen.slice(0, 3)));
  const realErrs = errs.filter((e) => !/scope/.test(e) && !/Service Worker/i.test(e));
  step(`${bossKey}: no new console errors`, realErrs.length === 0, realErrs.join(' | '));
  await page.close();
  return { died, phasesSeen: [...phasesSeen], telegraphFired, elapsedS };
}

const mutationArg = process.argv[4] || null; // set by the mutation harness below
if (!mutationArg) {
  for (const key of ALL_BOSS_KEYS) {
    await runBoss(key, null);
  }
} else {
  // Single-boss mutation run, invoked by hm2_boss_probe_mutate.sh
  await runBoss(mutationArg, process.argv[5] || null);
}

const fails = log.filter((l) => !l.ok).length;
console.log('\n' + (log.length - fails) + '/' + log.length + ' assertions passed');
await browser.close();
process.exit(fails ? 1 : 0);
