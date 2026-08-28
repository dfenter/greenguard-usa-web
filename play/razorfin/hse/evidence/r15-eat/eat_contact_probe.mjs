import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.ROOT || '/Users/lucille/greenguard-usa-web';
const port = 47699 + (Number(process.env.PORTOFF) || 0);
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

const LEVELS = (process.env.LEVELS || 'hawaii,maldives,azores').split(',');
const RUNS = Number(process.env.RUNS || 3);
const SECONDS = Number(process.env.SECS || 60);

const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--mute-audio', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-size=844,390'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const cdp = await page.target().createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true });
try { await cdp.send('Emulation.setDeviceOrientationOverride', {}); } catch {}
await page.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4500));

const KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
const results = [];

for (const level of LEVELS) {
  for (let run = 0; run < RUNS; run++) {
    // start run + install instrumentation
    await page.evaluate(async (level) => {
      const RF = window.RF, G = RF.Game;
      if (G.selectLevel) G.selectLevel(level);
      G.startRun('reef');
      await new Promise((r) => setTimeout(r, 800));
      if (G.selectLevel) G.selectLevel(level);
      const ctx = G.ctx, p = ctx.player, World = RF.World;
      const S = window.__EATPROBE = { seen: new Map(), lastHp: p.hp, level, order: [], done: new Set(), lastTooBig: 0 };
      S.origKill = World.kill;
      World.kill = function (e) { const r = S.seen.get(e); if (r && !r.resolved) r.resolved = 'eaten'; S.done.add(e); return S.origKill.apply(this, arguments); };
      S.tick = () => {
        const m = ctx.mouth; if (!m) return;
        const list = World.query ? World.query(m.x, m.y, (m.r / 1.6) * 1.2, null) : null;
        const now = performance.now();
        if (list) for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!e || !e.active || e === p) continue;
          if (['pickup','buffpickup','relic','gempickup','player'].indexOf(e.kind) >= 0) continue;
          if (!S.seen.has(e)) { const rec = { resolved: null, defId: e.defId, tier: e.tier, kind: e.kind, t: now, first: now }; S.seen.set(e, rec); S.order.push(rec); }
          else { const r0 = S.seen.get(e); r0.t = now; if (now - r0.first > 1200) S.done.add(e); }
        }
        // Sting = the engine's OWN player-hit bus (ent/dmg/sting records
        // world3d pushes for jelly stings, puffer spines, mines and predator
        // bites). hp alone is useless here: metabolism drains it every step.
        const hits = World.playerHits;
        if (hits && hits.length) for (let hi = 0; hi < hits.length; hi++) {
          const h = hits[hi]; if (!h || !h.ent) continue;
          const r = S.seen.get(h.ent);
          if (r && !r.resolved) { r.resolved = 'stung'; S.done.add(h.ent); }
          else if (!r) { const nr = { resolved: 'stung', defId: h.ent.defId, tier: h.ent.tier, kind: h.ent.kind, t: now, first: now }; S.seen.set(h.ent, nr); S.order.push(nr); S.done.add(h.ent); }
        }
        // TOO BIG cue: tooBigCd is re-armed to TOO_BIG_CD (0.6) the frame
        // the cue fires, so a rising edge near the top of that window marks
        // whichever over-tier target is in the mouth right now.
        const tb = p.st ? p.st.tooBigCd : 0;
        if (tb > S.lastTooBig + 0.001) for (const r of S.order) { if (!r.resolved && now - r.t < 300) { r.resolved = 'tooBig'; } }
        S.lastTooBig = tb;
      };
      // Steering: pick the nearest real creature and hand the shark's own
      // pursuit law that world point as its live finger target. This is the
      // SAME ctl.tx/ty the pointer path writes -- no velocity/position
      // backdoor: turn rate, accel, and the eat pipeline are all untouched.
      S.drive = () => {
        const ents = World.entities || [];
        let best = null, bd = 1e18;
        for (let i = 0; i < ents.length; i++) {
          const e = ents[i];
          if (!e || !e.active || e === p) continue;
          // Steering target: PREY only. Hazards are excluded from the chase
          // (they are supposed to sting), but they are still recorded by
          // S.tick if the shark happens to touch one in transit.
          if (e.kind !== 'prey' && e.kind !== 'predator') continue;
          if (S.done && S.done.has(e)) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = dx*dx + dy*dy;
          if (d < bd) { bd = d; best = e; }
        }
        S.nearestD = Math.round(Math.sqrt(bd)); if (!best) return;
        // Project the target world point back to CSS and write it as the
        // live finger position -- the engine then unprojects it itself
        // through cssToWorld, exactly as a real drag does.
        const G2 = RF.Game, cam = G2.camera, ren = G2.renderer, THREE = G2.three;
        if (!cam || !ren || !THREE) return;
        const v = new THREE.Vector3(best.x, -best.y, 0).project(cam);
        const sz = ren.getSize(new THREE.Vector2());
        const w = sz.x || window.innerWidth, h = sz.y || window.innerHeight;
        const ctl = p.ctl;
        ctl.active = true; ctl.stick = false;
        ctl.px = (v.x * 0.5 + 0.5) * w;
        ctl.py = (-v.y * 0.5 + 0.5) * h;
      };
      S.iv = setInterval(function(){ try{ if(RF.Game.kit) RF.Game.kit.paused=false; }catch(e){} S.drive(); S.tick(); }, 16);
    }, level);

    await new Promise((r) => setTimeout(r, SECONDS * 1000));

    const out = await page.evaluate(() => {
      const S = window.__EATPROBE, RF = window.RF;
      clearInterval(S.iv); RF.World.kill = S.origKill;
      const log = { level: S.level, contacts: 0, eaten: 0, stung: 0, tooBig: 0, nothing: 0, nothingIds: {}, tooBigIds: {} };
      for (const r of S.order) {
        log.contacts++;
        const k = r.defId + '(t' + r.tier + ')';
        const v = r.resolved || 'nothing';
        if (v === 'eaten') log.eaten++;
        else if (v === 'stung') log.stung++;
        else if (v === 'tooBig') { log.tooBig++; log.tooBigIds[k] = (log.tooBigIds[k]||0)+1; }
        else { log.nothing++; log.nothingIds[k] = (log.nothingIds[k]||0)+1; }
      }
      const _p=RF.Game.ctx.player; log.dbg={drive:_p.ctl.drive,mag:_p.ctl.mag,active:_p.ctl.active,px:Math.round(_p.ctl.px),py:Math.round(_p.ctl.py),tx:Math.round(_p.ctl.tx),ty:Math.round(_p.ctl.ty),speed:Math.round(Math.hypot(_p.vx,_p.vy)),nearest:S.nearestD}; log.playerTier = RF.Game.ctx.player.tier; log.endPos=[Math.round(RF.Game.ctx.player.x),Math.round(RF.Game.ctx.player.y)]; log.entCount=(RF.World.entities||[]).length; log.roster={}; for(const e of (RF.World.entities||[])){ if(!e||!e.active)continue; const k=e.defId+':'+e.kind+':t'+e.tier; log.roster[k]=(log.roster[k]||0)+1; }
      return log;
    });
    console.log(JSON.stringify(out));
    results.push(out);
  }
}
fs.writeFileSync(process.env.OUT || '/tmp/eatprobe.json', JSON.stringify(results, null, 2));
await browser.close();
server.close();
