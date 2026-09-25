#!/usr/bin/env node
/* hm2_m6_probe.mjs - M6 acceptance probe for Horde Meridian 2 (chase cam +
 * archetype VFX pass). Follows hm2_m5_probe.mjs's structure and puppeteer
 * conventions.
 *
 * Covers:
 *   1) Chase-cam rotation read off the REAL scene.cameras.main.rotation /
 *      scene.chaseCam, classic vs chase, default-is-classic.
 *   2) HUD/radar (uiCam-locked objects) never rotate when chase cam is on.
 *   3) In-run text census: run clock / level / banners only, <=3 words,
 *      no text object with scaleX/scaleY < 1.0.
 *   4) VFX spawn on real events: purge shockwave ring, gem pickup streak,
 *      level-up burst, boss phase change flash + slow-mo.
 *
 * Run: node hm2_m6_probe.mjs [url]
 * Exits 0 on pass, 1 on any failure.
 */
import puppeteer from '/Users/lucille/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://127.0.0.1:8820/play/hordemeridian2/';
const SHOTDIR = '/tmp/hm2_m6_shots';
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
  const rawPush = errs.push.bind(errs);
  errs.push = (msg) => { if (!/scope/.test(msg) && !/Service Worker/i.test(msg)) rawPush(msg); };
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

function bootPlay(page, chase) {
  return page.evaluate((chase) => {
    if (chase) window.localStorage.setItem('hm2_chasecam', '1');
    else window.localStorage.removeItem('hm2_chasecam');
    window.__HORDE.game.pendingLevel = null;
    const g = window.__HORDE.game;
    (g.scene || g.phaser.scene.getScenes(true)[0]).scene.start('play');
  }, chase);
}

// ---- 1 + 2: chase cam rotation + HUD screen-lock, real camera transform ----
{
  // Default (key absent): must be classic.
  const { page: pd, errs: errsD } = await newPage();
  await pd.evaluate(() => window.localStorage.removeItem('hm2_chasecam'));
  await bootPlay(pd, false);
  await wait(900);
  const defState = await pd.evaluate(() => ({
    chaseCam: window.__HORDE.game.scene.chaseCam,
    rot: window.__HORDE.game.scene.cameras.main.rotation
  }));
  await pd.close();
  ok('default (no hm2_chasecam key) is classic: scene.chaseCam falsy',
    !defState.chaseCam, JSON.stringify(defState));
  ok('default (no hm2_chasecam key) camera rotation stays ~0',
    Math.abs(defState.rot) < 0.05, JSON.stringify(defState));
  ok('default-classic page: no console/page errors', errsD.length === 0, errsD.join(' | '));

  // Classic explicit vs chase explicit, with heading fixed via forced input,
  // reading the REAL live scene.cameras.main.rotation / scene.chaseCam and
  // a real uiCam-locked object's rotation (HUD).
  async function trial(chase) {
    const { page, errs } = await newPage();
    await bootPlay(page, chase);
    await wait(900);
    // Force a fixed rightward heading via the stick, then let the player
    // orient, then hold steady long enough for chase cam to converge.
    await page.evaluate(() => {
      const s = window.__HORDE.game.scene;
      // Heading RIGHT (not up): targetRot = -(heading + PI/2) is then ~ -PI/2,
      // clearly nonzero, unlike an up-heading which converges targetRot to
      // ~0 and would make classic vs chase indistinguishable by accident.
      s.stick.active = true; s.stick.dx = 1; s.stick.dy = 0;
    });
    await wait(1800);
    const state = await page.evaluate(() => {
      const s = window.__HORDE.game.scene;
      // Find a real uiCam-locked HUD text object (bannerTitle is screen-locked
      // via scrollFactor 0 and ignored by cam.main / included in uiCam).
      const hud = s.bannerTitle;
      return {
        chaseCam: !!s.chaseCam,
        camRot: s.cameras.main.rotation,
        heading: s.playerHeading,
        hudRot: hud ? hud.rotation : null,
        hudAngle: hud ? hud.angle : null
      };
    });
    await page.screenshot({ path: `${SHOTDIR}/cam_${chase ? 'chase' : 'classic'}.png` });
    await page.close();
    return { state, errs };
  }

  const classic = await trial(false);
  const chase = await trial(true);

  ok('classic mode: scene.chaseCam is falsy (real live scene)', !classic.state.chaseCam, JSON.stringify(classic.state));
  ok('classic mode: scene.cameras.main.rotation stays ~0', Math.abs(classic.state.camRot) < 0.05, JSON.stringify(classic.state));
  ok('chase mode: scene.chaseCam is truthy (real live scene)', !!chase.state.chaseCam, JSON.stringify(chase.state));
  // Chase cam rotates to point ship nose up: targetRot = -(heading + PI/2).
  const expectedRot = -(chase.state.heading + Math.PI / 2);
  const rotDiff = Math.abs(Phaser_wrap(expectedRot - chase.state.camRot));
  function Phaser_wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  ok('chase mode: camera rotation tracks player heading (real transform, not classic 0)',
    Math.abs(chase.state.camRot) > 0.05 && rotDiff < 0.35,
    JSON.stringify(chase.state) + ' expectedRot=' + expectedRot + ' rotDiff=' + rotDiff);
  ok('chase mode vs classic: camera rotations clearly differ',
    Math.abs(chase.state.camRot - classic.state.camRot) > 0.15,
    'classic=' + classic.state.camRot + ' chase=' + chase.state.camRot);

  // HUD/radar must stay screen-locked (rotation 0) in BOTH modes, since
  // uiCam is never touched by the chase-cam rotation code.
  ok('classic mode: HUD banner text object rotation stays 0', Math.abs(classic.state.hudRot || 0) < 0.001, JSON.stringify(classic.state));
  ok('chase mode: HUD banner text object rotation stays 0 even though camera rotates',
    Math.abs(chase.state.hudRot || 0) < 0.001, JSON.stringify(chase.state));

  ok('classic trial page: no console/page errors', classic.errs.length === 0, classic.errs.join(' | '));
  ok('chase trial page: no console/page errors', chase.errs.length === 0, chase.errs.join(' | '));
}

// ---- 3: in-run text census over a 30s run ----
{
  const { page, errs } = await newPage();
  await bootPlay(page, false);
  await wait(1000);
  await page.evaluate(() => {
    // Autopilot bot so a run actually progresses and banners fire.
    window.__gateBot = setInterval(() => {
      const s = window.__HORDE.game.scene;
      if (!s || !s.p) return;
      if (s.state !== 'playing') {
        if (s.pickUpgrade && (s.state === 'draft' || s.state === 'levelup')) s.pickUpgrade(0);
        return;
      }
      s.stick.active = true; s.stick.dx = Math.sin(s.run.time); s.stick.dy = Math.cos(s.run.time);
    }, 200);
  });

  const budgetViolations = [];
  const scaleViolations = [];
  let sampleCount = 0;
  let playingSampleCount = 0;
  for (let i = 0; i < 6; i++) {
    await wait(5000);
    const census = await page.evaluate(() => {
      const s = window.__HORDE.game.scene;
      const issues = { budget: [], scale: [], skipped: false };
      // This assertion is about IN-RUN text (see the header: "run clock /
      // level / banners"). Once the run ends, the scene legitimately shows the
      // run-over summary, whose stats line ("Best N  .  Bank N gems") is a
      // 6-word readout and is not gameplay text at all. Same reasoning the
      // probe already applies to s.draftUI, which is excluded by identity
      // because a modal pause screen is not running gameplay.
      //
      // Before hotfix 1 the bot effectively never died inside this 30s window
      // (weapon fire rate was ~33x too fast and every projectile was absorbed
      // by unplaced terrain, so it out-killed everything). With the real fire
      // rate it now reaches 'over' partway through the window, and the census
      // started walking the summary screen. Measured over the same 30s bot
      // run: baseline f20938cc ends at state 'playing' (148 playing / 1 draft
      // samples, peak combo 262); this tree ends at state 'over' (140 playing
      // / 3 draft / 7 over, peak combo 196).
      //
      // So skip samples taken when the scene is not playing. This does NOT
      // weaken what is checked: the word and scale thresholds are unchanged,
      // nothing new is exempted by identity, and the non-vacuity assertion
      // below now requires that real PLAYING samples were actually taken.
      if (s.state !== 'playing') { issues.skipped = true; return issues; }
      // Scope per the M6 assignment: "run clock, level, and banners of <=3
      // words" is the mid-run text budget under test. Pre-existing HUD/tip
      // elements this lane does not own (nav-beacon distance readout, the
      // one-time tutorial tip overlay, and the upgrade-draft card overlay,
      // which is a modal pause screen, not running gameplay text) are
      // excluded by identity, not by loosening the word/scale thresholds.
      const exemptTextObjs = new Set([s.timeText, s.lvText]);
      if (s.navBeacon && s.navBeacon.dist) exemptTextObjs.add(s.navBeacon.dist);
      if (s.tutTitle) exemptTextObjs.add(s.tutTitle);
      if (s.tutBody) exemptTextObjs.add(s.tutBody);
      function wc(t) { return (t || '').trim().split(/\s+/).filter(Boolean).length; }
      function walk(items, inDraftUI) {
        for (const obj of items) {
          const isDraftCard = inDraftUI || obj === s.draftUI;
          if ((obj.type === 'Text' || obj.type === 'BitmapText') && obj.visible !== false) {
            if (!exemptTextObjs.has(obj) && !isDraftCard) {
              const sx = obj.scaleX != null ? obj.scaleX : 1;
              const sy = obj.scaleY != null ? obj.scaleY : 1;
              if (sx < 1.0 || sy < 1.0) issues.scale.push({ text: (obj.text || '').slice(0, 40), sx, sy });
              const words = wc(obj.text);
              if (words > 3) issues.budget.push({ text: (obj.text || '').slice(0, 60), words });
            }
          }
          if (obj.list && Array.isArray(obj.list)) walk(obj.list, isDraftCard);
        }
      }
      walk(s.children.list, false);
      return issues;
    });
    budgetViolations.push(...census.budget);
    scaleViolations.push(...census.scale);
    sampleCount++;
    if (!census.skipped) playingSampleCount++;
  }
  await page.evaluate(() => { if (window.__gateBot) clearInterval(window.__gateBot); });
  await page.close();

  ok('text census actually sampled the live display list across the run (proves non-vacuity)',
    sampleCount === 6, 'sampleCount=' + sampleCount);
  // Guards the skip above: if the run ended so early that almost nothing was
  // measured while playing, the two assertions below would pass vacuously.
  ok('text census took real in-run samples (guards the not-playing skip against vacuity)',
    playingSampleCount >= 3, 'playingSamples=' + playingSampleCount + '/' + sampleCount);
  ok('in-run text budget: no visible text object exceeds 3 words (excluding run clock/level)',
    budgetViolations.length === 0, JSON.stringify(budgetViolations.slice(0, 10)));
  ok('in-run text census: no text object has scaleX/scaleY < 1.0',
    scaleViolations.length === 0, JSON.stringify(scaleViolations.slice(0, 10)));
  ok('text census page: no console/page errors', errs.length === 0, errs.join(' | '));
}

// ---- 4: VFX spawn on real events, walking the live display list ----
{
  const { page, errs } = await newPage();
  await bootPlay(page, false);
  await wait(900);

  // 4a: purge -> shockwave ring. Force-trigger purgeBoard() and check a
  // real ring object in the pooled `rings` array goes alive/visible.
  const purgeCheck = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    // Kill every ring in the pool first so a fresh acquisition is provable
    // (a long-lived earlier session can otherwise leave the whole 18-slot
    // pool "alive" and mask a purge that spawns zero new rings).
    for (const r of s.rings) { r.alive = false; s.park(r.spr); }
    const aliveBefore = s.rings.filter((r) => r.alive).length;
    s.purgeBoard();
    const aliveAfter = s.rings.filter((r) => r.alive && r.spr.visible).length;
    return { aliveBefore, aliveAfter };
  });
  ok('purge -> a real pooled contactRing goes alive/visible on the display list',
    purgeCheck.aliveBefore === 0 && purgeCheck.aliveAfter > 0, JSON.stringify(purgeCheck));

  await wait(700);

  // 4b: gem pickup -> streak (fx.gem particle emitter actually receives an
  // emit call, proven by forcing a pickup through the real collection path
  // rather than calling the emitter directly).
  const gemCheck = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    if (!s.gems || !s.gems.length) return { error: 'no gem pool' };
    const g = s.gems.find((x) => !x.alive) || s.gems[0];
    g.alive = true; g.value = 5; g.tier = 0; g.vx = 0; g.vy = 0;
    // Land the gem exactly on the player so the real pickup-radius check
    // in stepGems (d2 < (p.r+14)^2) fires the collection branch.
    g.x = s.p.x; g.y = s.p.y;
    const gemSpy = { calls: 0 }, trailSpy = { calls: 0 };
    const origGemEmit = s.fx.gem.emitParticleAt.bind(s.fx.gem);
    const origTrailEmit = s.fx.trail.emitParticleAt.bind(s.fx.trail);
    s.fx.gem.emitParticleAt = function () { gemSpy.calls++; return origGemEmit.apply(this, arguments); };
    s.fx.trail.emitParticleAt = function () { trailSpy.calls++; return origTrailEmit.apply(this, arguments); };
    s.stepGems(0.016);
    s.fx.gem.emitParticleAt = origGemEmit;
    s.fx.trail.emitParticleAt = origTrailEmit;
    return { gemCalls: gemSpy.calls, trailCalls: trailSpy.calls, gAlive: g.alive };
  });
  ok('gem pickup -> fx.gem + fx.trail streak emitters actually fire (real stepGems pickup path)',
    !gemCheck.error && gemCheck.gemCalls > 0 && gemCheck.trailCalls > 0 && gemCheck.gAlive === false,
    JSON.stringify(gemCheck));

  // 4c: level-up -> burst (contactRing + fx.level). Force xp over threshold
  // and call the real level-up entry point.
  const levelCheck = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    for (const r of s.rings) { r.alive = false; s.park(r.spr); }
    const aliveBefore = s.rings.filter((r) => r.alive).length;
    s.run.xp = s.run.xpNext;
    // Ensure no available upgrades path (auto-resolve branch) so the burst
    // fires synchronously without waiting on draft UI input.
    const origAvail = s.availableUpgrades.bind(s);
    s.availableUpgrades = function () { return []; };
    s.checkLevel();
    s.availableUpgrades = origAvail;
    const aliveAfter = s.rings.filter((r) => r.alive).length;
    return { aliveBefore, aliveAfter, level: s.run.level };
  });
  ok('level-up -> a real pooled contactRing goes alive on the display list',
    levelCheck.aliveAfter > levelCheck.aliveBefore, JSON.stringify(levelCheck));

  // 4d: boss phase change -> screen flash + 0.3s slow-mo via the real dt gate.
  const bossCheck = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    // Spawn a minimal fake boss entity and drive the real bossPhaseChange.
    const boss = { x: s.p.x + 100, y: s.p.y, alive: true, boss: true, regionBoss: false, bossKey: 'core' };
    s.bossPhaseChange(boss, 1);
    const fxActive = s.bossPhaseFx.active;
    const fxT = s.bossPhaseFx.t;
    // Real slow-mo gate: this.bossPhaseFx.active && this.bossPhaseFx.t < 0.3
    // applies dt *= 0.3 in the step function. Prove the gate condition is
    // actually true right after the transition (t resets to 0).
    const slowMoGateOpen = fxActive && fxT < 0.3;
    return { fxActive, fxT, slowMoGateOpen, runBossPhase: s.run.bossPhase };
  });
  ok('boss phase change -> bossPhaseFx.active true and slow-mo gate open (t < 0.3) right after transition',
    bossCheck.fxActive && bossCheck.slowMoGateOpen && bossCheck.runBossPhase === 1,
    JSON.stringify(bossCheck));

  await page.screenshot({ path: `${SHOTDIR}/vfx_state.png` });
  await page.close();
  ok('VFX event page: no console/page errors', errs.length === 0, errs.join(' | '));
}

await browser.close();

console.log('');
console.log(cases + ' assertions, ' + failures + ' failed');
process.exit(failures > 0 ? 1 : 0);
