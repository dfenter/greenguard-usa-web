import puppeteer from '/Users/lucille/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = '/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca21896-c003-474c-ae2d-28610a6a27d6/scratchpad/razorfin-qa/play';
const PORT = 8934;
const OUT = '/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca21896-c003-474c-ae2d-28610a6a27d6/scratchpad/razorfin-qa/play/razorfin/qa/2026-09-17/fun';

const mime = { '.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.glb':'model/gltf-binary', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(ROOT, p);
  if (fp.endsWith('/')) fp = path.join(fp, 'index.html');
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(fp);
    const headers = { 'Content-Type': mime[ext] || 'application/octet-stream' };
    if (p.startsWith('/razorfin/')) headers['Service-Worker-Allowed'] = '/play/';
    res.writeHead(200, headers);
    res.end(data);
  });
});

await new Promise(r => server.listen(PORT, r));
console.log('serving on', PORT);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--window-size=926,428', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage();
await page.setViewport({ width: 926, height: 428 });
const client = await page.createCDPSession();
async function orient() {
  await client.send('Emulation.setDeviceMetricsOverride', { width: 926, height: 428, deviceScaleFactor: 3, mobile: true, screenOrientation: { angle: 90, type: 'landscapePrimary' } });
}
await orient();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

try {
  await page.goto(`http://localhost:${PORT}/razorfin/?unlockall=1`, { waitUntil: 'load', timeout: 20000 });
  await orient();
  await new Promise(r => setTimeout(r, 4000));
  await orient();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('BODY TEXT:', bodyText);
  await page.screenshot({ path: `${OUT}/01-menu.png` });
  console.log('menu shot done, errors so far:', errors.length);
} catch (e) {
  console.log('NAV ERROR:', e.message);
}

console.log('ERRORS:', JSON.stringify(errors.slice(0,20)));
await browser.close();
server.close();
