// Rev 15 MAZE lane evidence: per-level top-down maze map + tunnel/choke shots.
//
//   node hse/probe_maze_map.mjs maps      -> one top-down PNG per level
//   node hse/probe_maze_map.mjs shots     -> in-tunnel + choke-point in-game shots
//   node hse/probe_maze_map.mjs bfs       -> BFS connectivity report, all levels
//
// Boots the real page (the game boots to shark-select, so selectLevel then
// startRun), bypasses the service worker, and forces landscapePrimary --
// the shared arcade kit gates on screen.orientation.type and headless Chrome
// reports portrait (see NOTES-rev15-water.md "Probe gotchas").
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = '/Users/lucille/greenguard-usa-web';
const outDir = path.join(root, 'play/razorfin/hse/evidence/r15-maze');
fs.mkdirSync(outDir, { recursive: true });
const mode = process.argv[2] || 'maps';
const port = Number(process.env.PORT || 47733);
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  let f = decodeURIComponent(rq.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(path.join(root, f), (e, d) => { if (e) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); rs.end(d); });
});
await new Promise((r) => server.listen(port, r));

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
const cdp = await page.target().createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
  screenOrientation: { type: 'landscapePrimary', angle: 90 },
});
await page.evaluateOnNewDocument(() => {
  // bypass the service worker so we always test the working tree
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('sw off'));
});
await page.goto(`http://127.0.0.1:${port}/play/razorfin/index.html?unlockall=1`, { waitUntil: 'load' });
await page.waitForFunction('window.RF && RF.Game && RF.World && window.RFD', { timeout: 60000 });

const levels = await page.evaluate(() => RFD.LEVELS.map((l) => l.id));

async function startLevel(id) {
  await page.evaluate((lid) => {
    RF.Game.selectLevel(lid);
    RF.Game.startRun('reef');
  }, id);
  await page.waitForFunction('RF.World && RF.World.terrainSDF && RF.World.__mazeDebug', { timeout: 20000 });
}

if (mode === 'bfs' || mode === 'maps') {
  const report = [];
  for (const id of levels) {
    await startLevel(id);
    const info = await page.evaluate(() => RF.World.__mazeDebug());
    report.push({ level: id, ...info.summary });

    if (mode === 'maps') {
      // Top-down maze map: sample the SDF on a coarse grid and paint rock vs
      // water, then overlay the BFS-reachable set at tier-12 clearance.
      const png = await page.evaluate(() => {
        const W = RF.World, d = W.__mazeDebug();
        const sw = d.w, sh = d.h;
        const SC = 6; // world px per map px
        const cw = Math.round(sw / SC), ch = Math.round(sh / SC);
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const g = cv.getContext('2d');
        const img = g.createImageData(cw, ch);
        for (let py = 0; py < ch; py++) {
          for (let px = 0; px < cw; px++) {
            const wx = px * SC, wy = py * SC;
            const sd = W.terrainSDF(wx, wy);
            const i = (py * cw + px) * 4;
            let r, gg, b;
            if (sd <= 0) { r = 26; gg = 38; b = 46; }              // rock: dark teal
            else if (sd < 60) { r = 40; gg = 68; b = 78; }          // near wall
            else { r = 14; gg = 96; b = 124; }                      // open water
            const reach = d.reachT12 && d.reachT12[py * cw + px];
            if (reach) { r = Math.min(255, r + 10); gg = Math.min(255, gg + 90); b = Math.min(255, b + 40); }
            img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        // choke points
        g.strokeStyle = '#ffcc44'; g.lineWidth = 1;
        (d.chokes || []).forEach((c) => {
          g.beginPath(); g.arc(c.x / SC, c.y / SC, Math.max(2, c.hw / SC), 0, 6.3); g.stroke();
        });
        // spawn
        g.fillStyle = '#ff3366';
        g.beginPath(); g.arc((d.w * 0.5) / SC, 260 / SC, 4, 0, 6.3); g.fill();
        g.fillStyle = '#fff'; g.font = '12px sans-serif';
        g.fillText(d.level + '  [' + d.archetype + ']  masses ' + d.summary.masses +
          '  corridors ' + d.summary.corridors + '  chokes ' + d.summary.chokes, 8, 16);
        return cv.toDataURL('image/png');
      });
      fs.writeFileSync(path.join(outDir, `map-${id}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  fs.writeFileSync(path.join(outDir, 'bfs-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (mode === 'shots') {
  // In-game shots: put the camera inside a tunnel and at a choke point.
  const shots = [];
  for (const id of levels) {
    await startLevel(id);
    const pts = await page.evaluate(() => {
      const d = RF.World.__mazeDebug();
      return { tunnel: d.tunnelPoint, choke: d.chokePoint };
    });
    for (const [kind, p] of Object.entries(pts)) {
      if (!p) continue;
      // Step the player toward the point rather than teleporting: teleports
      // break the streaming world (draw calls collapse to 11).
      await page.evaluate(async (pt) => {
        const c = RF.Game.ctx;
        const pl = c && c.player;
        if (!pl) return;
        const steps = 40;
        const x0 = pl.x, y0 = pl.y;
        for (let i = 1; i <= steps; i++) {
          pl.x = x0 + (pt.x - x0) * (i / steps);
          pl.y = y0 + (pt.y - y0) * (i / steps);
          await new Promise((r) => requestAnimationFrame(r));
        }
      }, p);
      await new Promise((r) => setTimeout(r, 400));
      const f = path.join(outDir, `shot-${id}-${kind}.png`);
      fs.writeFileSync(f, await page.screenshot({ encoding: 'binary' }));
      shots.push({ level: id, kind, x: Math.round(p.x), y: Math.round(p.y) });
    }
  }
  console.log(JSON.stringify(shots, null, 2));
}

console.log(JSON.stringify({ logs: logs.slice(0, 10) }));
await browser.close(); server.close(); process.exit(0);
