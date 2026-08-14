'use strict';

const fs = require('fs');
const path = require('path');
const root = __dirname;
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const checks = [
  ['boot calls an implemented state hydrator', /this\.applyState\(\);/u.test(game) && /\n    applyState\(\) \{/u.test(game)],
  ['saved shard collection is authoritative', /saveData\.shards/u.test(game) && /countBits\(this\.saveData\.shards\)/u.test(game)],
  ['locked shrines cannot become checkpoints', /this\.saveData\.shrines & \(1 << shrine\.id\)/u.test(game)],
  ['portal progression has a persisted gate', /checkPortal\(\)/u.test(game) && /saveData\.portal/u.test(game) && /PORTAL AWAKENED/u.test(game)],
  ['gamepad input has edge and disconnect handling', /navigator\.getGamepads/u.test(game) && /gamepaddisconnected/u.test(game)],
  ['portrait controls stay readable', /orientation: 'any'/u.test(game) && /#ui \{ opacity: 1; \}/u.test(html)],
  ['victory exposes restart through GGKit', /restart-button/u.test(html) && /kit\.restart\(\)/u.test(game)],
  ['new audio assets are precached', ['footstep', 'gate', 'portal-open', 'secret', 'meadow-ambient', 'lake-ambient', 'ruin-ambient', 'peak-ambient'].every((name) => serviceWorker.includes(`/assets/${name}.mp3`))]
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`Smoke checks failed: ${failed.join(', ')}`);
console.log(`Skyshard Vale smoke checks passed: ${checks.length}`);
