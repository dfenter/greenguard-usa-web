/* r15 lane JAW - frame-sequence probe.
 *
 * Drives the real game into a school and records, at 30 fps, the LowerJaw
 * bone's local-X euler in degrees plus every eat event, so the jaw's actual
 * behaviour around a bite can be read off a trace instead of guessed at.
 * Emits <shark>.json (the trace) per row.
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.ROOT || '/Users/lucille/greenguard-usa-web';
const outDir = process.env.OUT || path.join(root, 'play/razorfin/hse/evidence/r15-jaw');
const port = 47811 + (Number(process.env.PORTOFF) || 0);
const SHARKS = (process.env.SHARKS || 'reef,greatwhite,mako,leviathanrex').split(',');
const SECS = Number(process.env.SECS || 14);
const STRIP = process.env.STRIP === '1';

fs.mkdirSync(outDir, { recursive: true });
const server = http.createServer((request, response) => {
  let file = decodeURIComponent(request.url.split('?')[0]);
  if (file.endsWith('/')) file += 'index.html';
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const ext = path.extname(file);
    const type = ext === '.js' || ext === '.mjs' ? 'text/javascript' : ext === '.json' ? 'application/json'
      : ext === '.png' ? 'image/png' : ext === '.glb' ? 'model/gltf-binary' : 'text/html';
    response.writeHead(200, { 'content-type': type });
    response.end(data);
  });
});
await new Promise((r) => server.listen(port, r));

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--mute-audio', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--window-size=844,390', '--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const cdp = await page.target().createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true });
try { await cdp.send('Emulation.setDeviceOrientationOverride', {}); } catch {}
await page.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4500));

const summary = {};
for (const shark of SHARKS) {
  const strips = [];
  await page.evaluate(async (shark) => {
    const RF = window.RF, G = RF.Game;
    G.startRun(shark);
    await new Promise((r) => setTimeout(r, 1200));
  }, shark);

  /* Instrumentation: hook swallow-time feedback by watching the engine's own
   * published state, and read the bone straight off the rig. */
  await page.evaluate(() => {
    const RF = window.RF, G = RF.Game, ctx = G.ctx, p = ctx.player;
    const S = window.__JAWPROBE = { rows: [], eats: [], t0: performance.now(), wall0: performance.now() };
    const rigRoot = p.rig && (p.rig.group || p.rig.model);
    S.group = p.rig && p.rig.group;
    S.jawBone = null;
    if (rigRoot) rigRoot.traverse((o) => { if (!S.jawBone && (o.isBone || o.type === 'Bone') && /LowerJaw|^Jaw$/.test(o.name)) S.jawBone = o; });
    S.lastCombo = ctx.run.combo;
    S.frame = 0;
    S.sample = (stateBag) => {
      const p = S.player || ctx.player;
      const run = S.run || ctx.run;
      S.frame++;
      /* Sim time, not wall time: the fixed step is the clock the jaw cycle
       * actually advances on, and hit-stop deliberately freezes it. */
      const now = S.frame * (RF.Game.STEP || 1 / 60) * 1000;
      /* Re-resolve until found: on a textured row the GLB can still be
       * loading when the first hook lands, and a bone captured as null then
       * would stay null for the whole trace - which is what made greatwhite
       * look like a bake with no jaw when the strip probe found one. */
      if (!S.jawBone && S.group) {
        S.group.traverse((o) => {
          if (!S.jawBone && (o.isBone || o.type === 'Bone') && /LowerJaw|^Jaw$/.test(o.name)) S.jawBone = o;
        });
      }
      const b = S.jawBone;
      let deg = null;
      if (b) {
        const q = b.quaternion;
        /* local-X euler of the bone quaternion */
        const sinr = 2 * (q.w * q.x + q.y * q.z);
        const cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
        deg = Math.atan2(sinr, cosr) * 180 / Math.PI;
      }
      const ud = (S.group && S.group.userData) || {};
      S.rows.push({ t: +now.toFixed(1), deg: deg === null ? null : +deg.toFixed(3),
        gape: typeof ud.rfJawGape === 'number' ? +ud.rfJawGape.toFixed(4) : null,
        jawSnapT: +(p.st.jawSnapT || 0).toFixed(4),
        phase: (p.st.biteCycle && p.st.biteCycle.phase) || null,
        jawOpen: stateBag && typeof stateBag.jawOpen === 'number' ? +stateBag.jawOpen.toFixed(4) : null, preyNear: !!p.st.preyNear, x: +p.x.toFixed(0), y: +p.y.toFixed(0), sp: +Math.hypot(p.vx,p.vy).toFixed(1), nprey: S.nprey|0, bd: S.bd|0,
        chewFxCd: +(p.st.chewFxCd || 0).toFixed(4), combo: run.combo });
      if (run.combo > S.lastCombo) { S.eats.push(+now.toFixed(1)); S.lastCombo = run.combo; }
    };
    /* Sample from the GAME'S OWN fixed step, not rAF.
     *
     * Headless Chrome throttles rAF hard - measured 2.8 fps with gaps up to
     * 1.4 s, which aliases a 60/90 ms bite envelope into a single sample and
     * makes a perfectly good cycle look like a jaw stuck open. The engine
     * drives the rig from stepAnim() on a fixed STEP, so wrapping the rig's
     * animate() gives one sample per simulated frame at the true step rate,
     * independent of how the browser schedules paints. */
    /* Re-resolve ctx and the rig on EVERY re-arm: the player rig is rebuilt on
     * growth and on restart, and a hook bound to a stale ctx silently stops
     * sampling. That is what produced 224-sample traces where the same run had
     * previously given 1040. */
    S.hook = () => {
      const G2 = window.RF.Game;
      const ctx2 = G2 && G2.ctx;
      const rig = ctx2 && ctx2.player && ctx2.player.rig;
      if (!rig || typeof rig.animate !== 'function' || rig.__jawHooked) return;
      S.player = ctx2.player;
      S.run = ctx2.run;
      /* Re-resolve the bone and the userData holder too - they belong to the
       * rig that was just rebuilt, not to the one this probe first saw. */
      S.group = rig.group || rig.model || null;
      S.jawBone = null;
      const root = rig.group || rig.model;
      if (root) root.traverse((o) => {
        if (!S.jawBone && (o.isBone || o.type === 'Bone') && /LowerJaw|^Jaw$/.test(o.name)) S.jawBone = o;
      });
      const inner = rig.animate.bind(rig);
      rig.animate = function (t, st) { try { S.sample(st); } catch (e) {} return inner(t, st); };
      rig.__jawHooked = true;
    };
    S.hook();
  });

  /* Drive: hold forward and steer toward the nearest prey so we actually eat. */
  await page.evaluate((secs) => {
    const RF = window.RF, G = RF.Game, ctx = G.ctx, p = ctx.player, S = window.__JAWPROBE;
    const drive = () => {
      try {
        if (G.kit) G.kit.paused = false;
        if (S && S.hook) S.hook();
        /* Guarantee bites. Chasing a school in a headless run is unreliable
         * (the shark out-turns the fish and skims past), and this probe is
         * about the JAW cycle, not the steering. Every FEED_MS a live, eatable
         * target is placed directly in the mouth so the eat path fires for
         * real - the same swallow() the game uses, not a synthetic call. */
        const now = performance.now();
        /* A DEDICATED IDLE WINDOW at the start of the run.
         *
         * The feeder fires a bite every 900 ms, and a bite cycle is ~430 ms,
         * so a fed run leaves almost no idle frames - reef came back with 8 of
         * 224. That is not enough to characterise the breathing band, and the
         * gate's rest estimate becomes a coin flip on how the samples landed.
         * So the first IDLE_MS of every run is deliberately bite-free: the
         * jaw is left alone to breathe and the band is measured properly. */
        const idleWindow = now - S.wall0 < (window.__IDLE_MS || 4000);
        if (!idleWindow && now - (S.lastFeed || 0) > (window.__FEED_MS || 900)) {
          const m = ctx.mouth;
          const list = RF.World.query ? RF.World.query(p.x, p.y, 2600, null) : null;
          let victim = null;
          if (list) for (const e of list) {
            if (!e || !e.active || e === p) continue;
            if (['pickup','buffpickup','relic','gempickup','player','hazard'].indexOf(e.kind) >= 0) continue;
            if (typeof e.tier === 'number' && e.tier > p.tier) continue;
            victim = e; break;
          }
          if (victim && m) { victim.x = m.x; victim.y = m.y; S.lastFeed = now; }
        }
        const list = RF.World.query ? RF.World.query(p.x, p.y, 1400, null) : null;
        let best = null, bd = 1e9;
        if (list) for (const e of list) {
          if (!e || !e.active || e === p) continue;
          if (['pickup','buffpickup','relic','gempickup','player'].indexOf(e.kind) >= 0) continue;
          if (typeof e.tier === 'number' && e.tier > p.tier) continue;
          const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
          if (d < bd) { bd = d; best = e; }
        }
        S.nprey = list ? list.length : -1; window.__JAWPROBE.bd = best ? Math.sqrt(bd) : -1; window.__JAWPROBE.nprey = list?list.length:-1;
        let tx, ty;
        if (best) {
          /* Lead the prey and aim PAST it, so the mouth sensor actually
           * overlaps rather than the shark parking on the target point. */
          const lx = best.x + (best.vx || 0) * 0.25, ly = best.y + (best.vy || 0) * 0.25;
          const a = Math.atan2(ly - p.y, lx - p.x);
          tx = p.x + Math.cos(a) * 2000; ty = p.y + Math.sin(a) * 2000;
        } else { tx = p.x + Math.cos(p.angle || 0) * 1200; ty = p.y + Math.sin(p.angle || 0) * 1200; }
        p.ctl.active = true; p.ctl.hasTarget = true;
        p.ctl.tx = tx; p.ctl.ty = ty; p.ctl.px = 999; p.ctl.py = 999;
      } catch (e) {}
      if (!window.__DRIVESTOP) requestAnimationFrame(drive);
    };
    requestAnimationFrame(drive);
  }, SECS);

  const frames = [];
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    if (STRIP) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      frames.push(Buffer.from(shot.data, 'base64'));
    }
    await new Promise((r) => setTimeout(r, STRIP ? 33 : 250));
  }

  const data = await page.evaluate(() => {
    const S = window.__JAWPROBE;
    S.stop = true; window.__DRIVESTOP = true;
    return { rows: S.rows, eats: S.eats, hasBone: !!S.jawBone, boneName: S.jawBone && S.jawBone.name };
  });
  fs.writeFileSync(path.join(outDir, `${shark}.json`), JSON.stringify(data, null, 1));
  if (STRIP && frames.length) {
    const sd = path.join(outDir, `strip_${shark}`);
    fs.mkdirSync(sd, { recursive: true });
    frames.forEach((f, i) => fs.writeFileSync(path.join(sd, `f${String(i).padStart(4, '0')}.png`), f));
  }
  const degs = data.rows.map((r) => r.deg).filter((d) => d !== null);
  summary[shark] = { bone: data.boneName, samples: data.rows.length, eats: data.eats.length,
    min: degs.length ? +Math.min(...degs).toFixed(2) : null,
    max: degs.length ? +Math.max(...degs).toFixed(2) : null };
  console.log(shark, JSON.stringify(summary[shark]));
  await page.evaluate(() => { try { RF.Game.endRun && RF.Game.endRun(); } catch (e) {} try { RF.Game.toMenu && RF.Game.toMenu(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 900));
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
console.log('SUMMARY', JSON.stringify(summary, null, 1));
await browser.close(); server.close();
