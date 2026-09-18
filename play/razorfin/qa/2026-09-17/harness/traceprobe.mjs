// CDP trace probe for the 4x-throttle frame stall investigation (QA-REPORT
// finding 2, ranked fix 5). Captures a real Tracing.* trace alongside the
// same rAF sampling perfprobe.mjs does, then attributes long tasks to
// GC / V8.compile / shader-related / spawn events.
//
// Usage: node traceprobe.mjs <worktree-root> <throttle>
// Must be served from the WORKTREE ROOT and requested at /play/razorfin/
// with the trailing slash (base tag gotcha, see harness/README.md).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { startServer } from './qaserve.mjs';

const root = process.argv[2];
const throttle = process.argv[3] || '4';
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
if (throttle) await client.send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });
await p.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 3000));
await setLandscape();
await p.evaluate(() => { RF.Game.selectLevel && RF.Game.selectLevel('hawaii'); RF.Game.startRun('reef'); });
await new Promise(r => setTimeout(r, 2000));
await setLandscape();

// Mark frame deltas in-page so we can correlate trace timestamps to stalls.
await p.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  function tick(t) { window.__frames.push({ t, dt: t - last }); last = t; if (window.__sampling) requestAnimationFrame(tick); }
  window.__sampling = true;
  requestAnimationFrame(tick);
});

const categories = [
  'devtools.timeline', 'v8', 'disabled-by-default-v8.gc',
  'disabled-by-default-devtools.timeline', 'blink.user_timing',
  'disabled-by-default-v8.compile'
];
await client.send('Tracing.start', { categories: categories.join(','), options: 'sampling-frequency=1000' });
await new Promise(r => setTimeout(r, 8000));

const traceEvents = [];
client.on('Tracing.dataCollected', ev => traceEvents.push(...ev.value));
const tracingDone = new Promise(res => client.once('Tracing.tracingComplete', res));
await client.send('Tracing.end');
await tracingDone;

const result = await p.evaluate(() => {
  window.__sampling = false;
  return window.__frames.slice(5);
});
await setLandscape();

// Attribute: bucket trace events by category near each stall frame.
const stalls = result.filter(f => f.dt > 33); // >2x budget
const gcEvents = traceEvents.filter(e => /GC|MinorGC|MajorGC|GCEvent/i.test(e.name));
const compileEvents = traceEvents.filter(e => /Compile|Parse|V8\.Compile/i.test(e.name));
const paintEvents = traceEvents.filter(e => /Paint|Rasteriz|CompositeLayers|ImageDecode|DecodeImage|GPUTask/i.test(e.name));
const scriptEvents = traceEvents.filter(e => e.name === 'RunTask' || e.name === 'FunctionCall' || e.name === 'EvaluateScript');

function nearestFollowing(ts, events, windowUs) {
  return events.filter(e => e.ts >= ts * 1000 - windowUs && e.ts <= ts * 1000 + windowUs);
}

const attribution = stalls.slice(0, 20).map(s => {
  const win = 20000; // 20ms window in microseconds around the stall frame
  return {
    frameT: s.t, dt: s.dt,
    gcNear: nearestFollowing(s.t, gcEvents, win).length,
    compileNear: nearestFollowing(s.t, compileEvents, win).length,
    paintNear: nearestFollowing(s.t, paintEvents, win).length,
  };
});

const out = {
  throttle,
  frameCount: result.length,
  stallCount: stalls.length,
  stallDts: stalls.map(s => Math.round(s.dt * 10) / 10),
  totalGcEvents: gcEvents.length,
  totalCompileEvents: compileEvents.length,
  totalPaintEvents: paintEvents.length,
  totalScriptEvents: scriptEvents.length,
  gcEventNames: [...new Set(gcEvents.map(e => e.name))],
  compileEventNames: [...new Set(compileEvents.map(e => e.name))],
  attribution,
  errors,
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync('/tmp/razorfin_trace_raw.json', JSON.stringify(traceEvents));
await b.close();
process.exit(0);
