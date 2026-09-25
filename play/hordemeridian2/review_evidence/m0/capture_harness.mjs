// hm2 screen capture: drives Phaser scenes directly, dumps text-metric JSON.
import pw from '/Users/lucille/greenguard-usa-web/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs';
const PORT = process.argv[2] || '8791';
const OUT  = process.argv[3] || '/tmp/hm2shots';
const W = parseInt(process.argv[4] || '390', 10);
const H = parseInt(process.argv[5] || '844', 10);
fs.mkdirSync(OUT, { recursive: true });
const URL = `http://localhost:${PORT}/play/hordemeridian2/index.html`;

const SCREENS = [
  ['title',   { scene: 'title' }],
  ['coop',    { scene: 'coop' }],
  ['hangar_mods',  { scene: 'shop', tab: 'modules' }],
  ['hangar_guns',  { scene: 'shop', tab: 'loadout' }],
  ['hangar_codex', { scene: 'shop', tab: 'codex' }],
  ['hangar_style', { scene: 'shop', tab: 'style' }],
  ['hangar_ships', { scene: 'shop', tab: 'ships' }],
  ['missions', { scene: 'missions' }],
  ['pause',    { scene: 'play', pause: true }],
  ['gameover', { scene: 'play', gameover: true }],
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript(({w,h}) => {
  const type = h >= w ? 'portrait-primary' : 'landscape-primary';
  try { Object.defineProperty(screen, 'orientation', { configurable: true, get: () => ({ type, angle: 0, addEventListener(){}, removeEventListener(){} }) }); } catch(e){}
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/orientation/.test(q)) {
      const want = /portrait/.test(q) ? 'portrait-primary' : 'landscape-primary';
      return { matches: want === type, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, onchange: null };
    }
    return mm(q);
  };
}, { w: W, h: H });
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrs.push(m.type()+': '+m.text()); });
page.on('pageerror', e => consoleErrs.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__HORDE && window.__HORDE.game.phaser && window.__HORDE.game.phaser.scene &&
  window.__HORDE.game.phaser.scene.isActive('title'), null, { timeout: 30000 }).catch(()=>{});

const report = { viewport: `${W}x${H}`, screens: {}, console: consoleErrs };

for (const [name, cfg] of SCREENS) {
  try {
    await page.evaluate(async (cfg) => {
      const g = window.__HORDE && window.__HORDE.game.phaser;
      if (!g) throw new Error('no game');
      // stop everything but boot
      g.scene.scenes.forEach(s => { if (s.scene.key !== 'boot' && s.scene.isActive()) g.scene.stop(s.scene.key); });
      if (cfg.tab) window.__HM2_FORCE_TAB = cfg.tab;
      window.__HM2_FORCE_PAUSE = false; window.__HM2_FORCE_GAMEOVER = false;
      if (cfg.pause) window.__HM2_FORCE_PAUSE = true;
      if (cfg.gameover) window.__HM2_FORCE_GAMEOVER = true;
      g.scene.start(cfg.scene);
    }, cfg);
    if (cfg.pause || cfg.gameover) {
      // The force hook waits out the opening banner storm before it can fire,
      // then the menu tweens in. Poll for the real state instead of guessing.
      await page.waitForFunction(() => {
        const sc = window.__HORDE && window.__HORDE.game.phaser.scene.getScene('play');
        return sc && sc._hm2Forced && sc.state !== 'playing' && sc.state !== 'draft';
      }, null, { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1200);
    } else {
      await page.waitForTimeout(cfg.scene === 'play' ? 3500 : 1400);
    }
    await page.screenshot({ path: `${OUT}/${name}_${W}x${H}.png` });
    // measure every Phaser Text object in active scenes
    const m = await page.evaluate(() => {
      const g = window.__HORDE && window.__HORDE.game.phaser; const out = [];
      const walk = (obj, sx, sy) => {
        if (!obj) return;
        const list = obj.list || [];
        for (const c of list) {
          if (c.type === 'Text' && c.visible && c.alpha > 0.05) {
            const b = c.getBounds ? c.getBounds() : null;
            if (b && b.width > 0) out.push({
              t: (c.text||'').slice(0,40),
              x: Math.round(b.x), y: Math.round(b.y),
              w: Math.round(b.width), h: Math.round(b.height),
              size: parseFloat(c.style.fontSize),
              sc: +(c.scaleX * (c.parentContainer ? c.parentContainer.scaleX : 1)).toFixed(3)
            });
          }
          if (c.list) walk(c, 0, 0);
        }
      };
      g.scene.scenes.forEach(s => { if (s.scene.isActive() && s.children) walk(s.children, 0, 0); });
      return out;
    });
    report.screens[name] = { texts: m };
  } catch (e) {
    report.screens[name] = { error: String(e) };
  }
}
fs.writeFileSync(`${OUT}/report_${W}x${H}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ viewport: report.viewport, consoleCount: consoleErrs.length,
  screens: Object.fromEntries(Object.entries(report.screens).map(([k,v])=>[k, v.error ? 'ERR '+v.error.slice(0,80) : v.texts.length+' texts']))}, null, 1));
await b.close();
