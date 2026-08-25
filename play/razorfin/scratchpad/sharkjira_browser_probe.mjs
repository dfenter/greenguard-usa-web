import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/lucille/greenguard-usa-web';
const port = 47681;
const server = http.createServer((request, response) => {
  let file = decodeURIComponent(request.url.split('?')[0]);
  if (file.endsWith('/')) file += 'index.html';
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    response.end(data);
  });
});
await new Promise((resolve) => server.listen(port, resolve));
const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') console.log('CONSOLE', message.type(), message.text()); });
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`http://127.0.0.1:${port}/play/razorfin/?unlockall=1`, { waitUntil: 'load' });
await new Promise((resolve) => setTimeout(resolve, 4200));
await page.evaluate(async () => {
  window.RF.Game.startRun('leviathanrex');
  await new Promise((resolve) => setTimeout(resolve, 900));
  const player = window.RF.Game.ctx.player;
  player.x = 3600; player.y = 1200; player.vx = 200; player.vy = 0;
});
await new Promise((resolve) => setTimeout(resolve, 1500));
console.log(JSON.stringify(await page.evaluate(() => {
  const rig = window.RF.Game.ctx.player.rig, group = rig.group, body = rig.parts.body, meshes = [];
  group.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const box = object.geometry.boundingBox;
    meshes.push({ name: object.name, visible: object.visible, frustumCulled: object.frustumCulled, attrs: Object.keys(object.geometry.attributes), box: box ? [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z] : null, materials: materials.map((material) => ({ name: material.name, transparent: material.transparent, opacity: material.opacity, emissive: material.emissive?.getHexString(), emissiveIntensity: material.emissiveIntensity })) });
  });
  const bodyBox = body.geometry.boundingBox;
  return { meshes, bodyBox: bodyBox ? [bodyBox.max.x - bodyBox.min.x, bodyBox.max.y - bodyBox.min.y, bodyBox.max.z - bodyBox.min.z] : null, drawCount: meshes.length, armature: group.userData.rfArmatureScale, measured: group.userData.rfMeasuredLength };
}), null, 2));
await browser.close();
server.close();
