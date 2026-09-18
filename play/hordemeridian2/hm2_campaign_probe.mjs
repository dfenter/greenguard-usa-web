#!/usr/bin/env node
/* hm2_campaign_probe - M4a gate for the Horde Meridian 2 Rev 2 campaign.
 * 1. boots play/hordemeridian2, asserts all 15 levels validate (no dropped level)
 * 2. boots each level and fast-forwards through its arc
 * 3. runs the sector-steering bot (ported from hm_hotstart_gate) on 1,5,10,15
 *    for N trials each and reports survival medians.
 * Usage: node hm2_campaign_probe.mjs [url] [shotdir] [trials]
 */
import puppeteer from '/Users/lucille/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://127.0.0.1:8791/play/hordemeridian2/';
const SHOTDIR = process.argv[3] || '/tmp/hm2_campaign_shots';
const TRIALS = Number(process.argv[4] || 3);
fs.mkdirSync(SHOTDIR, { recursive: true });
const W = 390, H = 844;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
function step(name, ok, detail) {
  log.push({ step: name, ok: !!ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail != null ? '  :: ' + detail : ''));
}

// sector-steering bot, ported verbatim in spirit from hm_hotstart_gate.mjs
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
    // Drive the REAL input path. game.js reads this.stick {active,dx,dy} at the
    // movement integrator; writing s.input.* or p.vx/p.vy directly is inert
    // (the integrator overwrites velocity every frame from the stick), which
    // made the original bot barely steer and die in ~20s on any level.
    s.stick.active = true; s.stick.dx = vx; s.stick.dy = vy;
    if (near140 >= 12 && (s.run.strikeCharges || 0) > 0 && !s.airStrike.active) s.tryCallAirstrike();
  }, 50);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--hide-scrollbars', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${W},${H}`] });

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  const warns = [];
  page.on('console', (m) => {
    const t = m.text().slice(0, 300);
    if (m.type() === 'error') errs.push(t);
    if (m.type() === 'warning' || m.type() === 'warn') warns.push(t);
  });
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
  await wait(2000);
  return { page, errs, warns };
}

// ---- Phase 1: registry ----
const { page, errs, warns } = await newPage();
const boot = await page.evaluate(() => ({
  levels: window.__HM_CAMPAIGN.levels().length,
  ids: window.__HM_CAMPAIGN.levels().map((l) => l.id),
  names: window.__HM_CAMPAIGN.levels().map((l) => l.name),
  durs: window.__HM_CAMPAIGN.levels().map((l) => l.duration),
  regions: window.__HM_CAMPAIGN.levels().map((l) => l.region),
  defined: Object.keys(window.__HM_LEVELS || {}).length,
  hasUI: !!window.__HM_CAMPAIGN_UI,
}));
step('registry: 15 level files defined', boot.defined === 15, boot.defined);
step('registry: 15 levels validate (none dropped)', boot.levels === 15, boot.ids.join(','));
const dropWarns = warns.filter((w) => /\[hm campaign\]/.test(w));
step('registry: no level rejected/missing warning', dropWarns.length === 0, dropWarns.join(' | '));
step('registry: names unique and <= 18 chars',
  new Set(boot.names).size === boot.names.length && boot.names.every((n) => n.length <= 18),
  boot.names.join('/'));
step('registry: durations span the 120..560 range',
  Math.min(...boot.durs) >= 120 && Math.max(...boot.durs) <= 560 && new Set(boot.durs).size >= 10,
  Math.min(...boot.durs) + '..' + Math.max(...boot.durs) + ' uniq=' + new Set(boot.durs).size);
step('registry: campaign UI present', boot.hasUI);
const realErrs = errs.filter((e) => !/scope/.test(e) && !/Service Worker/i.test(e));
step('boot: no console errors (sw scope noise excluded)', realErrs.length === 0, realErrs.join(' | '));
console.log('MISSIONS ' + JSON.stringify(boot.ids.map((id, i) => [id, boot.names[i], boot.regions[i], boot.durs[i]])));

// ---- Phase 2: every level boots and runs its arc ----
await page.evaluate(() => {
  window.__HORDE.profile.campaign.unlocked = 15;
  window.__HORDE.kit.save.set(window.__HORDE.profile);
});
for (let id = 1; id <= 15; id++) {
  const before = errs.length;
  await page.evaluate((lid) => window.__HM_CAMPAIGN.start(lid), id);
  await wait(2200);
  const sa = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    return { state: s.state, level: s.level ? s.level.id : 0, region: window.__hm.state.region, secs: s.activeRunSeconds };
  });
  step(`L${id} boots`, sa.state === 'playing' && sa.level === id, JSON.stringify(sa));
  await page.evaluate(() => { const s = window.__HORDE.game.scene; s.run.time = Math.floor(s.activeRunSeconds * 0.7); });
  await wait(4000);
  const sb = await page.evaluate(() => {
    const s = window.__HORDE.game.scene;
    return { t: Math.round(s.run.time), st: s.state, n: s.enemyCount, boss: !!s.run.bossUp, final: !!s.run.campaignFinalSpawned };
  });
  // 'draft'/'levelup' are healthy states: no bot is driving in this phase, so a
  // pending upgrade card legitimately pauses the sim.
  step(`L${id} mid-run alive`,
    ['playing', 'over', 'draft', 'levelup'].indexOf(sb.st) >= 0, JSON.stringify(sb));
  step(`L${id} no console errors`, errs.length === before, errs.slice(before).join(' | '));
  if (id === 1 || id === 15) await page.screenshot({ path: `${SHOTDIR}/L${id}.png` });
}
await page.close();

// ---- Phase 3: sector bot survival on 1, 5, 10, 15 ----
const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1;
  return b.length % 2 ? b[m] : Math.round((b[m - 1] + b[m]) / 2); };
const results = {};
for (const lid of [1, 5, 10, 15]) {
  const times = [];
  for (let t = 0; t < TRIALS; t++) {
    const { page: bp, errs: be } = await newPage();
    await bp.evaluate((l) => {
      const g = window.__HORDE.game;
      g.pendingLevel = window.__HM_LEVELS[l];
      (g.scene || g.phaser.scene.getScenes(true)[0]).scene.start('play');
    }, lid);
    await wait(600);
    await bp.evaluate(BOT);
    let out = null;
    const cap = Math.ceil(200 / 5);
    for (let i = 0; i < cap; i++) {
      await wait(5000);
      const s = await bp.evaluate(() => {
        const sc = window.__HORDE.game.scene;
        return { hp: Math.round(sc.p.hp), t: Math.round(sc.run.time), st: sc.state, n: sc.enemyCount };
      });
      if (s.hp <= 0 || s.st === 'dead' || s.st === 'gameover' || s.st === 'over' || s.st === 'win') { out = s; break; }
    }
    const final = out || await bp.evaluate(() => ({ t: Math.round(window.__HORDE.game.scene.run.time), st: 'running', hp: 1, n: 0 }));
    // A t=0 result means the page/run never started (flaky tab), not a death.
    // Counting it would poison the median, so retry rather than record it.
    if (final.t > 0) times.push(final.t);
    else t--;
    console.log(`  bot L${lid} trial${t + 1}: t=${final.t}s state=${final.st} hp=${final.hp} errs=${be.length}`);
    await bp.evaluate(() => clearInterval(window.__gateBot));
    await bp.close();
  }
  results[lid] = { trials: times, median: median(times) };
}
console.log('BOT MEDIANS ' + JSON.stringify(results));
step('bot: mission 1 survival median >= 60s (stock ship)', results[1].median >= 60, results[1].median + 's');
step('bot: mission 5 survival median >= 45s', results[5].median >= 45, results[5].median + 's');
step('bot: missions 10 and 15 survive past the opening',
  results[10].median >= 25 && results[15].median >= 25, `L10=${results[10].median}s L15=${results[15].median}s`);

const fails = log.filter((l) => !l.ok).length;
console.log('\n' + (log.length - fails) + '/' + log.length + ' assertions passed; shots in ' + SHOTDIR);
await browser.close();
process.exit(fails ? 1 : 0);
