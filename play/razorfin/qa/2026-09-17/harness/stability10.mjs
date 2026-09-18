import puppeteer from 'puppeteer-core';
import { startServer } from './qaserve.mjs';
const root = process.argv[2];
const port = 47713;
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
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 3000));
await setLandscape();
await p.evaluate(() => { RF.Game.selectLevel && RF.Game.selectLevel('hawaii'); RF.Game.startRun('reef'); });
await new Promise(r => setTimeout(r, 2000));
await setLandscape();

await p.evaluate(() => {
  window.__samples = [];
  window.__t0 = performance.now();
  window.__memStart = performance.memory ? performance.memory.usedJSHeapSize : null;
  const sampleEvery = 30000; // 30s
  window.__interval = setInterval(() => {
    window.__samples.push({
      t: performance.now() - window.__t0,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null,
      frame: (window.RF && window.RF.Game && window.RF.Game.frameCount) || null,
    });
  }, sampleEvery);
});

// 10 minutes unattended
await new Promise(r => setTimeout(r, 10 * 60 * 1000));

const result = await p.evaluate(() => {
  clearInterval(window.__interval);
  return { samples: window.__samples, memStart: window.__memStart, memEnd: performance.memory ? performance.memory.usedJSHeapSize : null };
});
await setLandscape();
await p.screenshot({ path: `${root}/play/razorfin/qa/2026-09-17/playability/stability_10min_final.png` });
console.log(JSON.stringify({ result, errors }, null, 2));
await b.close();
process.exit(0);
