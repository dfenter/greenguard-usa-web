// Plain-load probe: NO scene.start/startRun calls. Load the page, wait, tap
// only real on-screen buttons via elementFromPoint/click coordinates, verify
// the menu appears and a tap advances state. Per project_razorfin.md lesson
// from the 2026-08-20 boot-menu regression.
import puppeteer from 'puppeteer-core';
import { startServer } from './qaserve.mjs';
const root = process.argv[2] || '/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca21896-c003-474c-ae2d-28610a6a27d6/scratchpad/razorfin-qa';
const port = 47711;
await startServer(root, port);
const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--mute-audio', '--use-gl=angle', '--enable-unsafe-swiftshare', '--enable-unsafe-swiftshader'] });
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
await p.goto(`http://127.0.0.1:${port}/play/razorfin/`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4000));
await setLandscape();

const state1 = await p.evaluate(() => ({
  bodyText: document.body.innerText.slice(0, 200),
  canvasCount: document.querySelectorAll('canvas').length,
  hasRF: !!window.RF,
}));

// Screenshot menu state (re-send orientation override per rule)
await setLandscape();
await p.screenshot({ path: `${root}/play/razorfin/qa/2026-09-17/playability/plainload_menu.png` });
await setLandscape();

// Find a clickable button-like element near the center-bottom (typical Play button)
const clickTarget = await p.evaluate(() => {
  const els = [...document.querySelectorAll('button, [role="button"], .btn, [onclick], canvas')];
  // just report canvas bounding box center for a raw tap fallback
  const c = document.querySelector('canvas');
  const r = c ? c.getBoundingClientRect() : null;
  return { count: els.length, canvasRect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null };
});

// Tap center of canvas (Play button typically rendered there in HSE-style menus)
if (clickTarget.canvasRect) {
  const cx = clickTarget.canvasRect.x + clickTarget.canvasRect.w / 2;
  const cy = clickTarget.canvasRect.y + clickTarget.canvasRect.h / 2;
  await p.mouse.click(cx, cy);
  await new Promise(r => setTimeout(r, 1500));
}

await setLandscape();
const state2 = await p.evaluate(() => {
  const frame = window.RF && window.RF.Game && typeof window.RF.Game.frameCount !== 'undefined' ? window.RF.Game.frameCount : (window.RF && window.RF.Game && window.RF.Game.__frame) || null;
  return {
    bodyText: document.body.innerText.slice(0, 200),
    hasGameCtx: !!(window.RF && window.RF.Game && window.RF.Game.ctx),
    uiState: window.RF && window.RF.UI && window.RF.UI.__state ? window.RF.UI.__state() : null,
  };
});
await p.screenshot({ path: `${root}/play/razorfin/qa/2026-09-17/playability/plainload_after_tap.png` });
await setLandscape();

console.log(JSON.stringify({ state1, clickTarget, state2, errors }, null, 2));
await b.close();
process.exit(0);
