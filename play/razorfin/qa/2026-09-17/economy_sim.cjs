// Deterministic economy simulation for the 2026-09-17 QA wave, ranked fix 8.
// SIMULATION against real constants read from data.js and the real step
// formulas transcribed from game.js (stepHunger, swallow, comboMult). This
// is NOT a live headless browser measurement. See economy.md for why, and
// for the full "honest play" definition and limitations.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../data.js'), 'utf8');
global.window = {};
const indirectEval = eval;
indirectEval(src.replace(/^var /gm, 'global.'));
const SHARKS = global.SHARKS, CREATURES = global.CREATURES, FRENZY = global.FRENZY;

const STEP = 1 / 60;

function comboMultFor(combo) {
  const steps = FRENZY.steps, mults = FRENZY.mults;
  let m = mults[0] || 1;
  for (let i = 0; i < steps.length; i++) if (combo >= steps[i]) m = mults[i + 1] || m;
  return m;
}

const EAT_INTERVAL_S = 2.2; // seconds between swallows; documented assumption

function representativeShark(tier) {
  const cand = SHARKS.filter(s => s.tier === tier).sort((a, b) => a.cost - b.cost);
  return cand[0];
}

function preyPoolFor(tier) {
  return CREATURES.filter(c => c.tier <= tier && c.tier >= Math.max(0, tier - 4));
}

function simulateRun(tier, seed) {
  const shark = representativeShark(tier);
  const pool = preyPoolFor(tier);
  let hp = shark.stats.hp, maxHp = shark.stats.hp;
  const metab = shark.stats.metab;
  let coins = 0, combo = 0, comboT = 0, goldRushT = 0, frenzyMeter = 0;
  let rng = seed;
  function rand() { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; }

  let steps = 0;
  // IMPORTANT FINDING: with eat-interval 2.2s, the HP refill per eat
  // (6 + preyTier*3.2, uncapped by pressure tripling since we stay in the
  // player's own zone) outpaces hunger drain at every tier tested. The
  // simulated shark does not starve; it runs until the safety cap below.
  // A real run instead ends by predator kill, mine, or the player quitting,
  // none of which this simulation models. MAX_STEPS therefore doubles as
  // the session-length assumption: 5 minutes of continuous honest hunting,
  // chosen as a plausible mobile play-session length, NOT a measured value.
  const MAX_STEPS = 5 * 60 * 60; // 5 minutes at 60Hz
  while (hp > 0 && steps < MAX_STEPS) {
    const ticksToEat = Math.round(EAT_INTERVAL_S / STEP);
    for (let i = 0; i < ticksToEat && hp > 0; i++) {
      hp -= metab * STEP;
      if (comboT > 0) { comboT -= STEP; if (comboT <= 0) { comboT = 0; combo = 0; } }
      if (goldRushT > 0) { goldRushT -= STEP; if (goldRushT <= 0) goldRushT = 0; }
      steps++;
    }
    if (hp <= 0) break;

    const prey = pool[Math.floor(rand() * pool.length)] || pool[0];
    const packSize = prey.packMin + Math.floor(rand() * (prey.packMax - prey.packMin + 1));
    for (let k = 0; k < packSize && hp > 0; k++) {
      combo++;
      comboT = FRENZY.comboWindow;
      const mult = comboMultFor(combo);
      const coinMult = goldRushT > 0 ? FRENZY.goldRushCoinMult : 1;
      coins += Math.round(prey.coins * mult * coinMult);
      hp = Math.min(maxHp, hp + 6 + prey.tier * 3.2);
      frenzyMeter += FRENZY.meterPerEat;
      if (frenzyMeter >= 1 && goldRushT <= 0) { goldRushT = FRENZY.goldRushDur; frenzyMeter = 0; }
    }
  }
  return { coins, seconds: steps * STEP, sharkId: shark.id, cost: shark.cost };
}

const results = {};
for (const tier of [1, 4, 8]) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(simulateRun(tier, 1000 + tier * 97 + i * 13));
  const coinsArr = runs.map(r => r.coins);
  const mean = coinsArr.reduce((a, b) => a + b, 0) / coinsArr.length;
  results[tier] = { sharkId: runs[0].sharkId, runs, coinsArr, mean, min: Math.min(...coinsArr), max: Math.max(...coinsArr) };
}

console.log(JSON.stringify(results, null, 2));
