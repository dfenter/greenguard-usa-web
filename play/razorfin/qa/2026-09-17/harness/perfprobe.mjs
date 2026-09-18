// Frame time p50/p95 probe. Boots into a run programmatically (fine here,
// this is not the plain-load probe), samples requestAnimationFrame deltas.
import puppeteer from 'puppeteer-core';
import { startServer } from './qaserve.mjs';
const root = process.argv[2];
const throttle = process.argv[3] || null; // e.g. "4" for 4x CPU throttle
const port = 47712;
await startServer(root, port);
const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--mute-audio', '--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errors = [];
p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE-ERROR ' + m.text().slice(0, 300)); });
const client = await p.target().createCDPSession();
async function setLandscape() {
  await client.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { angle: 90, type: 'landscapePrimary' } });
}
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await setLandscape();
if (throttle) await client.send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 3000));
await setLandscape();
await p.evaluate(() => { RF.Game.selectLevel && RF.Game.selectLevel('hawaii'); RF.Game.startRun('reef'); });
await new Promise(r => setTimeout(r, 2000));
await setLandscape();

// Sample frame deltas for 8 seconds
await p.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  function tick(t) { window.__frames.push(t - last); last = t; if (window.__sampling) requestAnimationFrame(tick); }
  window.__sampling = true;
  requestAnimationFrame(tick);
});
await new Promise(r => setTimeout(r, 8000));
const result = await p.evaluate(() => {
  window.__sampling = false;
  const d = window.__frames.slice(5).sort((a, b) => a - b); // drop warmup
  const p50 = d[Math.floor(d.length * 0.5)];
  const p95 = d[Math.floor(d.length * 0.95)];
  return { count: d.length, p50, p95, min: d[0], max: d[d.length - 1] };
});
console.log(JSON.stringify({ throttle: throttle || 'none', result, errors }, null, 2));
await b.close();
process.exit(0);
