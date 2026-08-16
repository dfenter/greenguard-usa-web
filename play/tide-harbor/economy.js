/* Tide Harbor - economy.js
 * The simulation half of the game: a stock-driven trade economy you can really
 * arbitrage, moving weather fronts that force route decisions, a three-track
 * ship upgrade ladder bought with profit, open-sea encounters, and a twenty
 * contract career gated by harbourmaster rank.
 *
 * Pure data + maths. Nothing here touches THREE or the DOM, so it can be
 * stepped deterministically from the fixed simulation tick.
 */

export const GOODS = [
  { id: 'moonkelp', name: 'Moonkelp', short: 'KELP', base: 24, color: 0x62d5b7, bulk: 1, legal: true },
  { id: 'sunspice', name: 'Sunspice', short: 'SPICE', base: 40, color: 0xf2bd63, bulk: 1, legal: true },
  { id: 'brineglass', name: 'Brineglass', short: 'GLASS', base: 62, color: 0x8ec9f4, bulk: 1, legal: true },
  { id: 'emberroot', name: 'Emberroot', short: 'EMBER', base: 88, color: 0xee8270, bulk: 1, legal: true },
  { id: 'tidesilk', name: 'Tidesilk', short: 'SILK', base: 140, color: 0xc48bd8, bulk: 1, legal: false },
];

/* Ports. bias > 1 means the port is short of that good and pays well for it. */
export const PORTS = [
  {
    id: 'lumen', name: 'LUMEN COAST', short: 'LUMEN', region: 'lumen', rank: 0,
    x: -790, z: -470, blurb: 'Harbour town under the lighthouse.',
    produces: 0, consumes: 3, bias: [0.62, 1.30, 0.92, 1.44, 1.02], size: 1.0,
  },
  {
    id: 'gale', name: 'GALE STRAITS', short: 'GALE', region: 'gale', rank: 0,
    x: -170, z: -800, blurb: 'Storm-lashed pilot station.',
    produces: 3, consumes: 0, bias: [1.42, 0.86, 0.72, 0.60, 1.16], size: 0.8,
  },
  {
    id: 'sunken', name: 'SUNKEN ARCHIPELAGO', short: 'SUNKEN', region: 'sunken', rank: 1,
    x: 520, z: -140, blurb: 'Floating market over drowned reefs.',
    produces: 2, consumes: 1, bias: [1.16, 1.46, 0.58, 0.96, 0.90], size: 0.9,
  },
  {
    id: 'bluewater', name: 'BLUEWATER LANE', short: 'BLUE', region: 'bluewater', rank: 1,
    x: 660, z: 560, blurb: 'Deep-water trade beacon.',
    produces: 1, consumes: 2, bias: [0.94, 0.64, 1.42, 1.12, 1.24], size: 1.0,
  },
  {
    id: 'ember', name: 'EMBER REACH', short: 'EMBER', region: 'ember', rank: 2,
    x: -760, z: 620, blurb: 'Black-sand kilns on a live caldera.',
    produces: 3, consumes: 4, bias: [1.05, 1.18, 1.30, 0.52, 1.55], size: 0.85,
  },
  {
    id: 'quill', name: 'QUILLROCK FREEPORT', short: 'QUILL', region: 'quill', rank: 3,
    x: 120, z: 900, blurb: 'A freeport that asks no questions.',
    produces: 4, consumes: 3, bias: [1.10, 1.05, 1.14, 1.30, 0.48], size: 0.75,
  },
];

/* Three upgrade tracks. Level 0 is the starting fit. */
export const UPGRADES = {
  hull: {
    name: 'HULL', icon: '⚓',
    levels: [
      { name: 'CUTTER', cost: 0, rank: 0, integrity: 100, reef: 1.00, blurb: 'Open cutter. Fast to build, easy to hole.' },
      { name: 'SLOOP', cost: 700, rank: 1, integrity: 150, reef: 0.78, blurb: 'Doubled frames. Reef strikes bite less.' },
      { name: 'BRIGANTINE', cost: 2100, rank: 3, integrity: 220, reef: 0.58, blurb: 'Copper sheathing and a proper stem.' },
      { name: 'FLAGSHIP', cost: 5200, rank: 5, integrity: 320, reef: 0.40, blurb: 'Ironbound flagship. Shrugs off a squall.' },
    ],
  },
  sails: {
    name: 'SAILS', icon: '⛵',
    levels: [
      { name: 'WORKING', cost: 0, rank: 0, speed: 1.00, point: 0.50, blurb: 'Heavy working canvas.' },
      { name: 'LAPPED', cost: 560, rank: 0, speed: 1.14, point: 0.44, blurb: 'Lapped panels hold shape upwind.' },
      { name: 'RACING', cost: 1750, rank: 2, speed: 1.28, point: 0.38, blurb: 'Light racing suit with a full roach.' },
      { name: 'STORMWEAVE', cost: 4400, rank: 4, speed: 1.44, point: 0.32, blurb: 'Stormweave. Points high, never blows out.' },
    ],
  },
  hold: {
    name: 'HOLD', icon: '▤',
    levels: [
      { name: 'OPEN', cost: 0, rank: 0, capacity: 12, blurb: 'Twelve crates under a tarpaulin.' },
      { name: 'DECKED', cost: 620, rank: 0, capacity: 20, blurb: 'Decked over. Twenty crates, dry.' },
      { name: 'TIERED', cost: 1900, rank: 2, capacity: 30, blurb: 'Tiered stowage and a proper hatch.' },
      { name: 'BONDED', cost: 4800, rank: 4, capacity: 44, blurb: 'Bonded hold. Forty-four, and a hidden bay.' },
    ],
  },
};

export const RANKS = [
  { name: 'DECKHAND', xp: 0, unlock: 'Lumen Coast and Gale Straits' },
  { name: 'MATE', xp: 260, unlock: 'Sunken Archipelago and Bluewater Lane' },
  { name: 'PILOT', xp: 700, unlock: 'Ember Reach, racing sails, tiered hold' },
  { name: 'MASTER', xp: 1500, unlock: 'Quillrock Freeport and the brigantine' },
  { name: 'CAPTAIN', xp: 2900, unlock: 'Stormweave sails and the bonded hold' },
  { name: 'COMMODORE', xp: 5000, unlock: 'The flagship hull' },
  { name: 'HARBOURMASTER', xp: 8200, unlock: 'The harbour is yours' },
];

/* Weather front types. Each one changes how you want to route. */
export const FRONTS = {
  squall: { name: 'SQUALL', color: 0x6a7fb5, wind: 1.55, wave: 1.9, spill: 0.34, damage: 5.5, visibility: 0.6, boost: 1.35 },
  gale: { name: 'GALE', color: 0x4b6a8f, wind: 1.85, wave: 2.6, spill: 0.20, damage: 9.0, visibility: 0.8, boost: 1.5 },
  fog: { name: 'FOG BANK', color: 0xa9b7b9, wind: 0.72, wave: 0.55, spill: 0, damage: 0, visibility: 0.16, boost: 1.0 },
  calm: { name: 'DOLDRUMS', color: 0x9fd0c4, wind: 0.24, wave: 0.30, spill: 0, damage: 0, visibility: 1.0, boost: 1.0 },
};
const FRONT_KEYS = ['squall', 'gale', 'fog', 'calm'];

/* Twenty-contract career. Each entry is gated by rank and by the previous one. */
export const CAREER = [
  { id: 'c01', name: 'FIRST CONSIGNMENT', rank: 0, type: 'deliver', good: 0, qty: 4, port: 'gale', gold: 180, xp: 60, copy: 'Carry 4 Moonkelp to Gale Straits.' },
  { id: 'c02', name: 'SHORT TURN', rank: 0, type: 'profit', amount: 260, gold: 220, xp: 70, copy: 'Bank 260g of trading profit.' },
  { id: 'c03', name: 'PILOT PAPERS', rank: 0, type: 'visit', ports: ['lumen', 'gale'], gold: 200, xp: 80, copy: 'Log a call at Lumen Coast and Gale Straits.' },
  { id: 'c04', name: 'SPICE RUN', rank: 0, type: 'deliver', good: 1, qty: 6, port: 'lumen', gold: 320, xp: 110, copy: 'Land 6 Sunspice at Lumen Coast.' },
  { id: 'c05', name: 'WEATHER EYE', rank: 1, type: 'front', front: 'squall', count: 2, gold: 340, xp: 130, copy: 'Ride out 2 squalls without losing the hold.' },
  { id: 'c06', name: 'REEF PILOT', rank: 1, type: 'visit', ports: ['sunken'], gold: 300, xp: 120, copy: 'Make the Sunken Archipelago.' },
  { id: 'c07', name: 'GLASSWORK', rank: 1, type: 'deliver', good: 2, qty: 8, port: 'bluewater', gold: 520, xp: 170, copy: 'Deliver 8 Brineglass to Bluewater Lane.' },
  { id: 'c08', name: 'MARGIN CALL', rank: 1, type: 'arbitrage', amount: 240, gold: 480, xp: 170, copy: 'Clear 240g profit on a single cargo.' },
  { id: 'c09', name: 'CONVOY DUTY', rank: 2, type: 'escort', count: 1, gold: 560, xp: 200, copy: 'See one escort safely into port.' },
  { id: 'c10', name: 'SALVAGE RIGHTS', rank: 2, type: 'salvage', count: 2, gold: 600, xp: 210, copy: 'Strip 2 derelicts.' },
  { id: 'c11', name: 'CALDERA RUN', rank: 2, type: 'visit', ports: ['ember'], gold: 540, xp: 220, copy: 'Reach Ember Reach.' },
  { id: 'c12', name: 'EMBER CHARTER', rank: 2, type: 'deliver', good: 3, qty: 10, port: 'gale', gold: 880, xp: 280, copy: 'Run 10 Emberroot up to Gale Straits.' },
  { id: 'c13', name: 'DEAD RECKONING', rank: 3, type: 'front', front: 'fog', count: 3, gold: 700, xp: 260, copy: 'Navigate 3 fog banks.' },
  { id: 'c14', name: 'CLEAN SHEET', rank: 3, type: 'profit', amount: 2400, gold: 900, xp: 320, copy: 'Bank 2,400g of trading profit.' },
  { id: 'c15', name: 'FREEPORT PAPERS', rank: 3, type: 'visit', ports: ['quill'], gold: 820, xp: 340, copy: 'Find Quillrock Freeport.' },
  { id: 'c16', name: 'QUIET CARGO', rank: 3, type: 'deliver', good: 4, qty: 6, port: 'quill', gold: 1500, xp: 420, copy: 'Move 6 Tidesilk into Quillrock. Ask nothing.' },
  { id: 'c17', name: 'RUNNING THE GALE', rank: 4, type: 'front', front: 'gale', count: 2, gold: 1200, xp: 420, copy: 'Cross 2 full gales and keep the rig.' },
  { id: 'c18', name: 'FLEET ESCORT', rank: 4, type: 'escort', count: 3, gold: 1600, xp: 520, copy: 'Deliver 3 escorts.' },
  { id: 'c19', name: 'THE LONG CIRCUIT', rank: 5, type: 'visit', ports: ['lumen', 'gale', 'sunken', 'bluewater', 'ember', 'quill'], gold: 2400, xp: 700, copy: 'Call at all six ports in one career.' },
  { id: 'c20', name: 'HARBOURMASTER', rank: 5, type: 'profit', amount: 12000, gold: 4000, xp: 1400, copy: 'Bank 12,000g of lifetime trading profit.' },
];

/* Standing orders: the repeatable charter board that survived from round 1. */
export const STANDING = [
  { id: 'sales', name: 'HARBOUR LEDGER', copy: 'Sell 12 cargo units.', target: 12, reward: 300 },
  { id: 'caches', name: 'CACHE CARTOGRAPHER', copy: 'Recover 6 gold caches.', target: 6, reward: 420 },
  { id: 'fronts', name: 'SQUALL RUNNER', copy: 'Enter 5 weather fronts.', target: 5, reward: 520 },
  { id: 'glides', name: 'MASTER OF THE TIDE', copy: 'Earn 6 clean glide dockings.', target: 6, reward: 620 },
  { id: 'career', name: 'CHARTED WATERS', copy: 'Clear 5 career contracts.', target: 5, reward: 780 },
  { id: 'upgrades', name: 'SHIPWRIGHT PARTNER', copy: 'Fit 4 refits of any track.', target: 4, reward: 900 },
];

/* ------------------------------------------------------------------ utils */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function portById(id) { return PORTS.find((p) => p.id === id) || PORTS[0]; }
export function portIndex(id) { const i = PORTS.findIndex((p) => p.id === id); return i < 0 ? 0 : i; }
export function careerById(id) { return CAREER.find((c) => c.id === id) || null; }
export function rankFor(xp) {
  let rank = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) rank = i;
  return rank;
}

/* --------------------------------------------------------- market model */

const EQUILIBRIUM = 26;

/* Stock target. Production and consumption alone set it; the port's demand
 * bias is applied to the PRICE only. Letting bias drive both compounds into a
 * ten-to-one arbitrage that makes the whole economy trivial. */
function stockTarget(port, goodIdx) {
  return EQUILIBRIUM * (port.produces === goodIdx ? 1.8 : port.consumes === goodIdx ? 0.55 : 1);
}

/** Fresh per-port stock ledger. Stock drives price; price drives arbitrage. */
export function freshMarkets() {
  return PORTS.map((port) => ({
    stock: GOODS.map((good, gi) => stockTarget(port, gi)),
    shock: GOODS.map(() => 0),
    seen: null,
  }));
}

/**
 * Advance every port ledger. Production, consumption, mean reversion and a
 * seeded random shock walk. Deterministic given the sim RNG.
 */
export function stepMarkets(markets, dt, random) {
  for (let p = 0; p < PORTS.length; p++) {
    const port = PORTS[p];
    const ledger = markets[p];
    for (let g = 0; g < GOODS.length; g++) {
      const target = stockTarget(port, g);
      let stock = ledger.stock[g];
      stock += (target - stock) * 0.055 * dt;
      if (port.produces === g) stock += 0.42 * dt * port.size;
      if (port.consumes === g) stock -= 0.34 * dt * port.size;
      /* shocks: harvest gluts and shortages that persist long enough to trade */
      let shock = ledger.shock[g];
      shock += (random() - 0.5) * 0.9 * dt;
      shock -= shock * 0.09 * dt;
      shock = clamp(shock, -0.85, 0.85);
      ledger.shock[g] = shock;
      ledger.stock[g] = clamp(stock * (1 - shock * 0.02 * dt) + shock * 0.5 * dt, 3, 130);
    }
  }
}

/** Unit price at a port. buy = the ask; otherwise the bid. */
export function priceAt(markets, portIdx, goodIdx, buy) {
  const port = PORTS[portIdx];
  const good = GOODS[goodIdx];
  const ledger = markets[portIdx];
  const stock = Math.max(3, ledger.stock[goodIdx]);
  const scarcity = Math.pow(EQUILIBRIUM / stock, 0.5);
  let raw = good.base * (port.bias[goodIdx] || 1) * scarcity * (1 + ledger.shock[goodIdx] * 0.22);
  /* Hard rails: a good never trades below a quarter or above three times base,
   * so no single run can break the career economy. */
  raw = clamp(raw, good.base * 0.25, good.base * 3.1);
  const spread = buy ? 1.07 : 0.90;
  return Math.max(4, Math.round(raw * spread));
}

/** Buying and selling really move the ledger, so you cannot farm one port. */
export function applyTrade(markets, portIdx, goodIdx, units) {
  const ledger = markets[portIdx];
  const impact = units * (1.35 / (PORTS[portIdx].size || 1));
  ledger.stock[goodIdx] = clamp(ledger.stock[goodIdx] - impact, 3, 130);
}

/** Snapshot what the captain has actually seen, for the chart and the HUD. */
export function recordSighting(markets, portIdx, simTime) {
  const ledger = markets[portIdx];
  ledger.seen = { at: simTime, buy: GOODS.map((g, i) => priceAt(markets, portIdx, i, true)), sell: GOODS.map((g, i) => priceAt(markets, portIdx, i, false)) };
}

/** The best known arbitrage leg from a port, using only remembered prices. */
export function bestKnownLeg(markets, fromIdx) {
  let best = null;
  const from = markets[fromIdx];
  if (!from.seen) return null;
  for (let p = 0; p < PORTS.length; p++) {
    if (p === fromIdx || !markets[p].seen) continue;
    for (let g = 0; g < GOODS.length; g++) {
      const margin = markets[p].seen.sell[g] - from.seen.buy[g];
      if (!best || margin > best.margin) best = { to: p, good: g, margin };
    }
  }
  return best && best.margin > 0 ? best : null;
}

/* -------------------------------------------------------- weather fronts */

export function freshFronts(random) {
  const list = [];
  for (let i = 0; i < 5; i++) list.push(spawnFront(random, i));
  return list;
}

export function spawnFront(random, index) {
  const kind = FRONT_KEYS[Math.floor(random() * FRONT_KEYS.length)];
  const heading = random() * Math.PI * 2;
  return {
    kind,
    x: (random() - 0.5) * 2400,
    z: (random() - 0.5) * 2400,
    r: 190 + random() * 190,
    vx: Math.cos(heading) * (7 + random() * 9),
    vz: Math.sin(heading) * (7 + random() * 9),
    strength: 0.55 + random() * 0.45,
    life: 90 + random() * 150,
    seed: index * 3.1 + random() * 6,
    hitTimer: 3 + random() * 3,
  };
}

export function stepFronts(fronts, dt, random, bounds) {
  for (let i = 0; i < fronts.length; i++) {
    const f = fronts[i];
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    f.life -= dt;
    f.hitTimer -= dt;
    /* slow curve so tracks are readable but never perfectly straight */
    const turn = (random() - 0.5) * 0.16 * dt;
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const vx = f.vx * cos - f.vz * sin;
    f.vz = f.vx * sin + f.vz * cos;
    f.vx = vx;
    if (f.life <= 0 || Math.abs(f.x) > bounds || Math.abs(f.z) > bounds) fronts[i] = spawnFront(random, i);
  }
}

/** Where a front will be in `ahead` seconds. Drives the forecast overlay. */
export function forecast(front, ahead) {
  return { x: front.x + front.vx * ahead, z: front.z + front.vz * ahead, r: front.r };
}

/** The strongest front the vessel is inside, or null. */
export function frontAt(fronts, x, z) {
  let found = null;
  let bestDepth = 0;
  for (let i = 0; i < fronts.length; i++) {
    const f = fronts[i];
    const d = Math.hypot(x - f.x, z - f.z);
    if (d > f.r) continue;
    const depth = (1 - d / f.r) * f.strength;
    if (depth > bestDepth) { bestDepth = depth; found = f; }
  }
  return found ? { front: found, depth: bestDepth, spec: FRONTS[found.kind] } : null;
}

/* ------------------------------------------------------------ encounters */

export const ENCOUNTERS = {
  smuggler: {
    name: 'SMUGGLER CUTTER', tone: 'bad', rank: 0,
    copy: 'A black cutter luffs across your bow and demands a toll.',
    a: { label: 'PAY TOLL', hint: 'Lose gold, keep the hold.' },
    b: { label: 'RUN FOR IT', hint: 'Outsail them or lose cargo.' },
  },
  patrol: {
    name: 'REVENUE PATROL', tone: 'bad', rank: 0,
    copy: 'A revenue cutter signals you to heave to for inspection.',
    a: { label: 'HEAVE TO', hint: 'Contraband is confiscated.' },
    b: { label: 'CROWD SAIL', hint: 'Run, and risk a heavy fine.' },
  },
  escort: {
    name: 'ESCORT REQUEST', tone: 'good', rank: 1,
    copy: 'A laden merchant asks you to see her into the next port.',
    a: { label: 'TAKE THE JOB', hint: 'Escort pays on arrival.' },
    b: { label: 'DECLINE', hint: 'Sail on alone.' },
  },
  derelict: {
    name: 'DERELICT HULK', tone: 'good', rank: 0,
    copy: 'A dismasted hulk wallows on the swell, hatches open.',
    a: { label: 'BOARD HER', hint: 'Salvage cargo. Some risk.' },
    b: { label: 'STAND OFF', hint: 'Leave her to the sea.' },
  },
  race: {
    name: 'RIVAL TRADER', tone: 'neutral', rank: 2,
    copy: 'A rival matches your course and wagers she is faster.',
    a: { label: 'TAKE THE WAGER', hint: 'Beat her to port for gold.' },
    b: { label: 'WAVE HER ON', hint: 'No wager, no risk.' },
  },
  pilot: {
    name: 'HARBOUR PILOT', tone: 'good', rank: 1,
    copy: 'A pilot boat offers current prices from the port ahead.',
    a: { label: 'BUY THE NEWS', hint: 'Pay 90g for fresh prices.' },
    b: { label: 'NO THANK YOU', hint: 'Trust your own charts.' },
  },
};
const ENCOUNTER_KEYS = Object.keys(ENCOUNTERS);

/** Weighted pick respecting rank, cargo and the current weather. */
export function pickEncounter(random, ctx) {
  const pool = [];
  ENCOUNTER_KEYS.forEach((key) => {
    const spec = ENCOUNTERS[key];
    if (ctx.rank < spec.rank) return;
    let weight = 1;
    if (key === 'patrol') weight = ctx.contraband > 0 ? 2.6 : 0.35;
    if (key === 'smuggler') weight = ctx.cargo > 0 ? 1.5 : 0.5;
    if (key === 'derelict') weight = ctx.inFront ? 1.8 : 1;
    if (key === 'escort') weight = ctx.cargoRoom > 0 ? 1.3 : 0.6;
    if (key === 'pilot') weight = 0.9;
    pool.push({ key, weight });
  });
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= pool[i].weight;
    if (roll <= 0) return pool[i].key;
  }
  return pool.length ? pool[pool.length - 1].key : 'derelict';
}

/* --------------------------------------------------------------- career */

export function freshCareer() {
  return { index: 0, cleared: [], progress: 0, visited: [], lifetimeProfit: 0, bestSingleTrade: 0, escorts: 0, salvage: 0, fronts: {} };
}

/** The active contract, or null when the whole career is cleared. */
export function activeContract(career, rank) {
  if (career.index >= CAREER.length) return null;
  const contract = CAREER[career.index];
  if (rank < contract.rank) return { ...contract, locked: true };
  return contract;
}

/** Human-readable progress for the active contract. */
export function contractProgress(contract, career, ctx) {
  if (!contract) return { done: 0, need: 1, text: 'CAREER COMPLETE' };
  switch (contract.type) {
    case 'deliver': {
      const done = career.progress;
      return { done, need: contract.qty, text: done + ' / ' + contract.qty + ' ' + GOODS[contract.good].short + ' to ' + portById(contract.port).short };
    }
    case 'profit':
      return { done: Math.floor(career.lifetimeProfit), need: contract.amount, text: Math.floor(career.lifetimeProfit) + ' / ' + contract.amount + 'g profit' };
    case 'arbitrage':
      return { done: Math.floor(career.bestSingleTrade), need: contract.amount, text: 'best leg ' + Math.floor(career.bestSingleTrade) + ' / ' + contract.amount + 'g' };
    case 'visit': {
      const done = contract.ports.filter((id) => career.visited.indexOf(id) >= 0).length;
      return { done, need: contract.ports.length, text: done + ' / ' + contract.ports.length + ' ports called' };
    }
    case 'front': {
      const done = career.fronts[contract.front] || 0;
      return { done, need: contract.count, text: done + ' / ' + contract.count + ' ' + FRONTS[contract.front].name.toLowerCase() };
    }
    case 'escort':
      return { done: career.escorts, need: contract.count, text: career.escorts + ' / ' + contract.count + ' escorts landed' };
    case 'salvage':
      return { done: career.salvage, need: contract.count, text: career.salvage + ' / ' + contract.count + ' derelicts stripped' };
    default:
      return { done: 0, need: 1, text: '' };
  }
}

export function contractSatisfied(contract, career) {
  if (!contract || contract.locked) return false;
  const p = contractProgress(contract, career);
  return p.done >= p.need;
}

/* ------------------------------------------------------------ upgrades */

export function upgradeLevel(state, track) { return clamp(Math.floor(state.upgrades[track] || 0), 0, UPGRADES[track].levels.length - 1); }
export function upgradeStats(state) {
  return {
    hull: UPGRADES.hull.levels[upgradeLevel(state, 'hull')],
    sails: UPGRADES.sails.levels[upgradeLevel(state, 'sails')],
    hold: UPGRADES.hold.levels[upgradeLevel(state, 'hold')],
  };
}
export function nextUpgrade(state, track) {
  const level = upgradeLevel(state, track);
  const levels = UPGRADES[track].levels;
  return level + 1 < levels.length ? levels[level + 1] : null;
}

/* ------------------------------------------------------------ migration */

export const SAVE_VERSION = 4;

/**
 * Bring any older save shape forward. A save that cannot be repaired returns
 * null and the caller starts a fresh profile rather than throwing.
 */
export function migrateSave(save) {
  if (!save || typeof save !== 'object') return null;
  const version = Number(save.v) || 0;
  if (version === SAVE_VERSION) return save;
  if (version < 1 || version > SAVE_VERSION) return null;
  const out = {
    v: SAVE_VERSION,
    gold: Math.max(0, Math.floor(Number(save.gold) || 240)),
    bestGold: Math.max(0, Math.floor(Number(save.bestGold) || Number(save.gold) || 240)),
    simTime: Math.max(0, Math.min(1e7, Number(save.simTime) || 0)),
    rng: Number.isSafeInteger(save.rng) ? save.rng >>> 0 : 0x7f4a7c15,
    tutorialStage: clamp(Math.floor(Number(save.tutorialStage) || 0), 0, 5),
    victory: save.victory === true,
    tod: 0.34,
  };
  /* v3 carried a single hull ladder. Map it across the three new tracks so an
   * existing captain keeps roughly the ship they paid for. */
  const oldHull = clamp(Math.floor(Number(save.hull) || 0), 0, 3);
  out.upgrades = { hull: oldHull, sails: clamp(oldHull, 0, 3), hold: clamp(oldHull, 0, 3) };
  out.integrity = UPGRADES.hull.levels[oldHull].integrity;
  /* v3 had four goods; the fifth defaults to empty. */
  const oldCargo = Array.isArray(save.cargo) ? save.cargo : [];
  out.cargo = GOODS.map((good, i) => clamp(Math.floor(Number(oldCargo[i]) || 0), 0, 44));
  out.markets = null; /* regenerated fresh: the old model had no stock ledger */
  out.career = freshCareer();
  /* Credit prior play: old route medals and contracts become rank experience. */
  let xp = 0;
  if (save.routeMedals && typeof save.routeMedals === 'object') {
    Object.keys(save.routeMedals).forEach((key) => { xp += clamp(Math.floor(Number(save.routeMedals[key]) || 0), 0, 3) * 120; });
  }
  if (save.contracts && typeof save.contracts === 'object') {
    Object.keys(save.contracts).forEach((key) => {
      const entry = save.contracts[key];
      if (entry && entry.claimed) xp += 90;
    });
  }
  xp += oldHull * 220;
  out.rankXp = clamp(xp, 0, 8199);
  out.standing = {};
  STANDING.forEach((entry) => { out.standing[entry.id] = { progress: 0, claimed: false }; });
  const region = typeof save.region === 'string' ? save.region : 'lumen';
  out.port = PORTS.some((p) => p.id === region) ? region : 'lumen';
  const vessel = save.vessel && typeof save.vessel === 'object' ? save.vessel : {};
  out.vessel = {
    x: clamp(Number(vessel.x) || -820, -1400, 1400),
    z: clamp(Number(vessel.z) || -360, -1400, 1400),
    heading: Number.isFinite(vessel.heading) ? vessel.heading : 0.3,
    trim: clamp(Number(vessel.trim) || 0.22, -1.45, 1.45),
  };
  out.caches = Array.isArray(save.caches) ? save.caches.map((v) => !!v) : [];
  out.migratedFrom = version;
  return out;
}

export { clamp };
