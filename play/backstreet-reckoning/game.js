'use strict';
/* Backstreet Reckoning - belt-scroll brawler with lane depth */
(function () {
  const { clamp, lerp, sign, makeRng, Audio, Input, FX } = window.BR;

  /* ================= canvas / metrics ================= */
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  const rotateEl = document.getElementById('rotate');

  let W = 960, H = 540, PX = 1; // PX = backing px per css px
  let HZ = 0, GB = 0, BH = 0;

  function resize() {
    const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let bw = cw * dpr, bh = ch * dpr;
    const long = Math.max(bw, bh);
    if (long > 960) { const f = 960 / long; bw *= f; bh *= f; }
    W = Math.max(240, Math.round(bw)); H = Math.max(180, Math.round(bh));
    canvas.width = W; canvas.height = H;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    PX = W / cw;
    HZ = H * 0.455; GB = H * 0.905; BH = H * 0.285;
    rotateEl.style.display = (ch > cw * 1.02) ? 'flex' : 'none';
    if (ch > cw * 1.02) Input.clear();
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  resize();

  /* UI layout for input hit-testing */
  function layout() {
    const r = Math.max(48 * PX * 0.62, H * 0.135);
    return {
      w: W, h: H,
      punch: { x: W - r * 1.15, y: H - r * 1.15, r: r },
      jump: { x: W - r * 3.05, y: H - r * 0.86, r: r * 0.86 },
      stickR: H * 0.155,
      swipeMin: 26 * PX
    };
  }
  Input.bind(canvas, layout);

  /* ================= depth helpers ================= */
  const groundY = (z) => HZ + (GB - HZ) * z;
  const dscale = (z) => 0.80 + 0.30 * z;
  const LANES = [0.16, 0.50, 0.84];
  const LANE_TOL = 0.15;

  /* ================= tuning ================= */
  const SEGS = 4;
  const MAX_ACTIVE = 4;
  let L = 2400;              // segment length (world px), recomputed on resize use
  const segLen = () => W * 2.05;
  const GRAV = 2000;

  const FOE = {
    rusher: { name: 'Scrapper', hp: 34, spd: 0.64, dmg: 8, col: '#e4643c', col2: '#8d3320', w: 0.30, atkR: 0.62, cd: [0.45, 0.9], score: 120 },
    tosser: { name: 'Flicker', hp: 26, spd: 0.44, dmg: 8, col: '#63c9a8', col2: '#2b7a63', w: 0.28, atkR: 0.55, cd: [1.3, 2.2], score: 150 },
    heavy: { name: 'Hauler', hp: 74, spd: 0.34, dmg: 18, col: '#c9a13f', col2: '#7a5f18', w: 0.44, atkR: 0.72, cd: [1.1, 1.9], score: 260 },
    acro: { name: 'Vault Twin', hp: 24, spd: 0.86, dmg: 8, col: '#a97ae8', col2: '#5c3d94', w: 0.26, atkR: 0.58, cd: [0.4, 0.75], score: 140 },
    boss: { name: 'Boss', hp: 240, spd: 0.46, dmg: 20, col: '#d8425f', col2: '#79162b', w: 0.52, atkR: 0.80, cd: [0.8, 1.4], score: 900 }
  };
  const BOSS_NAMES = ['MARLO STEEL', 'CROW VANCE', 'DUTCH RAMONE', 'SABLE KURTZ', 'BIG MERIDIAN', 'OTTO GRIST'];
  const BLOCK_NAMES = ['LOWER WHARF', 'TIN ROW', 'SODIUM MILE', 'GLASS YARD', 'CINDER WALK', 'NINTH CUT'];

  /* ================= state ================= */
  let G = null;

  function newGame() {
    Input.clear();
    G = {
      stage: 1, seed: 1337,
      score: 0, lives: 3,
      best: (() => { try { const n = Number(localStorage.getItem('br_best')); return Number.isFinite(n) && n >= 0 ? n : 0; } catch (_) { return 0; } })(),
      mode: 'play',          // play | over | stageclear
      t: 0, hintT: 7,
      banner: null, bannerT: 0,
      seg: 0, camX: 0, camLock: null, goT: 0,
      foes: [], items: [], props: [], shots: [], waves: [], pending: [],
      player: null, boss: null, bossName: '',
      flash: 0, slowT: 0
    };
    buildStage(1);
    G.player = makePlayer();
    FX.clear();
  }

  function makePlayer() {
    return {
      kind: 'player', x: G.camX + W * 0.28, z: 0.55, y: 0, vx: 0, vz: 0, vy: 0,
      face: 1, hp: 120, maxhp: 120, w: 0.32,
      state: 'idle', st: 0, inv: 1.0, hurtT: 0,
      atk: null, atkT: 0, hasHit: false, combo: 0, comboT: 0,
      weapon: null, carry: null, downT: 0, anim: 0, jumpKick: false
    };
  }

  /* ================= stage generation ================= */
  function buildStage(n) {
    L = segLen();
    const rng = makeRng(G.seed + n * 7919);
    G.stage = n;
    G.seg = 0; G.camX = 0; G.camLock = null; G.goT = 0;
    G.foes = []; G.items = []; G.props = []; G.shots = []; G.pending = []; G.boss = null;
    G.bossName = BOSS_NAMES[(n - 1) % BOSS_NAMES.length];
    G.blockName = BLOCK_NAMES[(n - 1) % BLOCK_NAMES.length];
    G.waves = [];
    const diff = 1 + (n - 1) * 0.28;

    for (let s = 0; s < SEGS; s++) {
      const start = s * L;
      // props & items
      const nProps = rng.int(3, 6);
      for (let i = 0; i < nProps; i++) {
        G.props.push({
          x: start + rng.range(W * 0.4, L - W * 0.3),
          z: rng.pick(LANES) + rng.range(-0.06, 0.06),
          kind: rng.pick(['bin', 'barrel', 'bin']),
          hp: 2, hitT: 0
        });
      }
      if (s < SEGS - 1 && rng() < 0.85) {
        G.items.push(mkItem('pipe', start + rng.range(W * 0.5, L - W * 0.4), rng.pick(LANES)));
      }
      if (rng() < 0.7) {
        G.items.push(mkItem('crate', start + rng.range(W * 0.5, L - W * 0.4), rng.pick(LANES)));
      }
      // waves
      if (s < SEGS - 1) {
        const wCount = s === 0 ? 2 : (rng() < 0.5 ? 2 : 3);
        for (let w = 0; w < wCount; w++) {
          const list = [];
          const size = Math.min(6, 2 + Math.round(rng.range(0, 1.4) + s * 0.6 + diff * 0.7));
          for (let k = 0; k < size; k++) {
            let t = 'rusher';
            const r = rng();
            if (r < 0.30) t = 'rusher';
            else if (r < 0.52) t = 'tosser';
            else if (r < 0.72) t = 'acro';
            else if (r < 0.88) t = 'rusher';
            else t = 'heavy';
            if (s === 0 && w === 0 && (t === 'heavy')) t = 'rusher';
            list.push(t);
            if (t === 'acro') list.push('acro'); // twins
          }
          G.waves.push({ seg: s, f: wCount === 2 ? (w === 0 ? 0.18 : 0.96) : (w * 0.42 + 0.14), list: list, done: false });
        }
      } else {
        G.waves.push({ seg: s, f: 0.20, list: ['rusher', 'rusher', 'tosser'], done: false });
        G.waves.push({ seg: s, f: 0.92, list: ['BOSS'], done: false });
      }
    }
    buildSky();
    banner('STAGE ' + n + ' — ' + G.blockName, 2.0);
  }

  function mkItem(kind, x, z) {
    return { kind: kind, x: x, z: z, y: 0, vy: 0, vx: 0, life: 0, dur: kind === 'pipe' ? 12 : 1 };
  }

  function banner(text, t) { G.banner = text; G.bannerT = t; }

  /* ================= spawning ================= */
  function spawnFoe(type, side) {
    const c = FOE[type === 'BOSS' ? 'boss' : type];
    const isBoss = type === 'BOSS';
    const diff = 1 + (G.stage - 1) * 0.22;
    const x = side > 0 ? G.camX + W + 40 + Math.random() * 120 : G.camX - 40 - Math.random() * 120;
    const f = {
      kind: 'foe', type: isBoss ? 'boss' : type, x: x,
      z: clamp(LANES[Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 0.08, 0.05, 0.95),
      y: 0, vx: 0, vz: 0, vy: 0, face: side > 0 ? -1 : 1,
      maxhp: Math.round(c.hp * (isBoss ? 1 + (G.stage - 1) * 0.35 : diff)),
      spd: c.spd, dmg: Math.round(c.dmg * (isBoss ? 1 + (G.stage - 1) * 0.16 : Math.min(2, diff))),
      w: c.w, col: c.col, col2: c.col2, score: c.score,
      state: 'idle', st: 0, inv: 0, hurtT: 0, downT: 0,
      atk: null, atkT: 0, hasHit: false, think: Math.random() * 0.5,
      cd: 0.6 + Math.random(), anim: Math.random() * 6, tx: 0, tz: 0,
      armorFlash: 0, phase2: false, hitStack: 0, hitStackT: 0
    };
    f.hp = f.maxhp;
    if (isBoss) { f.name = G.bossName; G.boss = f; }
    G.foes.push(f);
    return f;
  }

  function checkWaves() {
    const segStart = G.seg * L;
    const prog = (G.camX - segStart) / Math.max(1, L - W);
    let pending = false;
    for (const w of G.waves) {
      if (w.done || w.seg !== G.seg) { if (!w.done && w.seg === G.seg) pending = true; continue; }
      if (prog >= w.f - 0.001) {
        w.done = true;
        for (let i = 0; i < w.list.length; i++) G.pending.push(w.list[i]);
        G.camLock = G.camX;
      } else pending = true;
    }
    // trickle-spawn: never more than MAX_ACTIVE brawlers on screen at once
    let side = G.spawnSide || 1;
    while (G.pending.length && G.foes.length < MAX_ACTIVE) {
      const t = G.pending.shift();
      spawnFoe(t, side);
      side = -side;
      if (t === 'BOSS') { banner(G.bossName, 2.0); Audio.tone(90, 0.6, 'sawtooth', 0.25, 55); }
    }
    G.spawnSide = side;

    const alive = G.foes.length > 0 || G.pending.length > 0;
    if (alive) { if (G.camLock === null) G.camLock = G.camX; }
    else if (!pending) { G.camLock = null; G.goT = 1; }
    else if (!alive) { G.camLock = null; }
  }

  /* ================= combat helpers ================= */
  function inLane(a, b, tol) { return Math.abs(a.z - b.z) <= (tol || LANE_TOL); }

  function hitReach(a, b, reach) {
    const dx = b.x - a.x;
    if (a.face > 0 ? (dx < -b.w * BH * 0.4) : (dx > b.w * BH * 0.4)) return false;
    return Math.abs(dx) <= reach + b.w * BH * 0.45;
  }

  function damageFoe(f, dmg, kd, dir, kind) {
    if (f.inv > 0 || f.state === 'dying' || f.state === 'carried') return false;
    let stagger = true;
    if (f.type === 'heavy' && !kd && dmg < 15) {
      // armors through jabs
      f.hitStack++; f.hitStackT = 1.1;
      dmg = Math.round(dmg * 0.5);
      f.armorFlash = 0.18;
      stagger = false;
      if (f.hitStack >= 5) { f.hitStack = 0; stagger = true; kd = true; }
    }
    if (f.type === 'boss' && !kd && dmg < 15) {
      f.hitStack++; f.hitStackT = 1.2;
      if (f.hitStack < 4) { stagger = false; f.armorFlash = 0.15; }
      else f.hitStack = 0;
    }
    f.hp -= dmg;
    FX.burst(f.x, -BH * 0.55, f.z, stagger ? 8 : 4, stagger ? '#ffd76b' : '#cfd6e0', 190, { up: 60, life: 0.35 });
    if (f.hp <= 0) {
      f.hp = 0; f.state = 'down'; f.downT = 1e9; f.vy = -480; f.vx = dir * 320; f.dying = true;
      G.score += f.score;
      FX.text(f.x, -BH * 0.9, f.z, '+' + f.score, '#ffe27a');
      FX.burst(f.x, -BH * 0.5, f.z, 16, f.col, 260, { up: 120 });
      Audio.ko(); FX.shake(6 * (W / 960), 0.25);
    } else if (kd) {
      f.state = 'down'; f.downT = 0; f.vy = -430; f.vx = dir * 300; f.inv = 0.05;
      Audio.heavy(); FX.shake(5 * (W / 960), 0.2);
    } else if (stagger) {
      f.state = 'hurt'; f.hurtT = 0.24; f.vx = dir * 130;
      Audio.hit();
    } else {
      Audio.noise(0.08, 0.2, 1800, 2);
      f.vx = dir * 40;
    }
    if (kind === 'combo') FX.shake(3 * (W / 960), 0.12);
    return true;
  }

  function damagePlayer(p, dmg, kd, dir) {
    if (p.inv > 0 || p.state === 'down' || G.mode !== 'play') return;
    p.hp -= dmg;
    if (p.carry) dropCarry(p, true);
    FX.burst(p.x, -BH * 0.55, p.z, 8, '#ff6a6a', 200, { up: 60 });
    G.flash = 0.18;
    if (p.hp <= 0) {
      p.hp = 0; p.state = 'down'; p.downT = 0; p.vy = -480; p.vx = dir * 300; p.ko = true;
      Audio.ko(); FX.shake(9 * (W / 960), 0.35);
    } else if (kd) {
      p.state = 'down'; p.downT = 0; p.vy = -420; p.vx = dir * 280;
      Audio.hurt(); FX.shake(6 * (W / 960), 0.22);
    } else {
      p.state = 'hurt'; p.hurtT = 0.26; p.vx = dir * 120; p.inv = 0.3;
      Audio.hurt(); FX.shake(4 * (W / 960), 0.15);
    }
    p.atk = null; p.atkT = 0;
  }

  function smashProp(pr, dir) {
    pr.hp--; pr.hitT = 0.12;
    if (pr.hp > 0) { Audio.noise(0.1, 0.25, 700, 1); return; }
    Audio.noise(0.25, 0.4, 500, 0.7); Audio.tone(150, 0.15, 'square', 0.12, 70);
    FX.burst(pr.x, -BH * 0.25, pr.z, 14, pr.kind === 'bin' ? '#7f8b99' : '#9a6b3a', 240, { up: 140 });
    FX.shake(3 * (W / 960), 0.12);
    G.score += 15;
    const r = Math.random();
    if (r < 0.46) G.items.push(mkItem('food', pr.x, pr.z));
    else if (r < 0.56) G.items.push(mkItem('pipe', pr.x, pr.z));
    const i = G.props.indexOf(pr); if (i >= 0) G.props.splice(i, 1);
  }

  /* ================= player ================= */
  const ATTACKS = {
    jab: { dur: 0.30, strike: 0.09, reach: BHf(0.58), dmg: 9, kd: false, knock: 1 },
    jab2: { dur: 0.30, strike: 0.09, reach: BHf(0.60), dmg: 10, kd: false, knock: 1 },
    finish: { dur: 0.44, strike: 0.14, reach: BHf(0.68), dmg: 16, kd: true, knock: 1 },
    pipe: { dur: 0.40, strike: 0.13, reach: BHf(1.00), dmg: 20, kd: true, knock: 1 },
    kick: { dur: 0.40, strike: 0.06, reach: BHf(0.72), dmg: 15, kd: true, knock: 1 }
  };
  function BHf(k) { return k; } // reach stored as multiple of BH, resolved at use

  function reachOf(a) { return a.reach * BH; }

  function updatePlayer(p, dt) {
    p.anim += dt * 8;
    if (p.inv > 0) p.inv -= dt;
    if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }

    /* --- input vector --- */
    let ix = 0, iz = 0;
    if (Input.stick.active && Input.stick.mag > 0.22) { ix = Input.stick.dx; iz = Input.stick.dy; }
    if (Input.key('a', 'arrowleft')) ix -= 1;
    if (Input.key('d', 'arrowright')) ix += 1;
    if (Input.key('w', 'arrowup')) iz -= 1;
    if (Input.key('s', 'arrowdown')) iz += 1;
    const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }

    const punchDown = Input.tap.punch || Input.hit('j', 'x');
    const jumpDown = Input.tap.jump || Input.hit('k', ' ', 'z');
    let swipe = Input.swipes.length ? Input.swipes[0] : null;
    if (!swipe && (Input.hit('l') || (p.carry && punchDown))) swipe = { dx: p.face * 100, dy: 0 };

    /* --- downed --- */
    if (p.state === 'down') {
      p.downT += dt;
      p.y += p.vy * dt; p.vy += GRAV * dt; p.x += p.vx * dt; p.vx *= 0.92;
      if (p.y >= 0) { p.y = 0; if (p.vy > 0) p.vy = 0; p.vx *= 0.4; }
      if (p.downT > 1.0) {
        if (p.ko) { loseLife(); return; }
        p.state = 'getup'; p.st = 0.4; p.inv = 0.9;
      }
      clampPlayer(p); return;
    }
    if (p.state === 'getup') { p.st -= dt; if (p.st <= 0) p.state = 'idle'; clampPlayer(p); return; }
    if (p.state === 'hurt') {
      p.hurtT -= dt; p.x += p.vx * dt; p.vx *= 0.86;
      if (p.hurtT <= 0) p.state = 'idle';
      clampPlayer(p); return;
    }

    /* --- jump physics --- */
    const airborne = p.y < -0.001 || p.vy < 0;
    if (airborne) {
      p.y += p.vy * dt; p.vy += GRAV * dt;
      if (p.y >= 0) { p.y = 0; p.vy = 0; p.jumpKick = false; if (p.state === 'jump') p.state = 'idle'; FX.burst(p.x, 0, p.z, 5, '#6c7480', 120, { up: 30, life: 0.25 }); }
    } else if (jumpDown && p.state !== 'atk') {
      p.vy = -760; p.y = -0.01; p.state = 'jump'; p.jumpKick = false;
      Audio.tone(420, 0.12, 'triangle', 0.13, 620);
    }

    /* --- attack in progress --- */
    if (p.atk) {
      p.atkT += dt;
      const a = p.atk;
      if (!p.hasHit && p.atkT >= a.strike) {
        p.hasHit = true;
        doPlayerStrike(p, a);
      }
      if (p.atkT >= a.dur) { p.atk = null; if (p.state === 'atk') p.state = 'idle'; }
      if (!airborne) { p.x += p.vx * dt; p.vx *= 0.8; clampPlayer(p); return; }
    }

    /* --- throwing carried --- */
    if (p.carry && swipe) {
      throwCarry(p, swipe);
    } else if (punchDown && !p.atk) {
      handlePunch(p, airborne);
    }

    /* --- movement --- */
    if (!p.atk) {
      const spd = BH * (p.carry ? 1.55 : 1.95) * (p.weapon ? 0.95 : 1);
      p.vx = ix * spd;
      p.vz = iz * (p.carry ? 0.48 : 0.62);
      if (Math.abs(ix) > 0.15) p.face = sign(ix);
      p.state = (m > 0.1 && !airborne) ? 'walk' : (airborne ? 'jump' : 'idle');
    }
    p.x += p.vx * dt;
    if (!airborne) p.z = clamp(p.z + p.vz * dt, 0.03, 0.97);
    clampPlayer(p);

    /* --- pickups by walking over food --- */
    for (let i = G.items.length - 1; i >= 0; i--) {
      const it = G.items[i];
      if (it.kind !== 'food' || it.held) continue;
      if (Math.abs(it.x - p.x) < BH * 0.4 && Math.abs(it.z - p.z) < 0.14 && p.y > -BH * 0.4) {
        p.hp = Math.min(p.maxhp, p.hp + 40);
        G.score += 25; Audio.heal();
        FX.text(p.x, -BH, p.z, '+40 HP', '#7dffa8');
        FX.burst(p.x, -BH * 0.4, p.z, 10, '#7dffa8', 180, { up: 90 });
        G.items.splice(i, 1);
      }
    }
  }

  function clampPlayer(p) {
    p.x = clamp(p.x, G.camX + BH * 0.22, G.camX + W - BH * 0.22);
  }

  function handlePunch(p, airborne) {
    // air kick
    if (airborne) {
      if (!p.jumpKick) { p.jumpKick = true; startAtk(p, ATTACKS.kick); }
      return;
    }
    // pick up ground item
    for (let i = 0; i < G.items.length; i++) {
      const it = G.items[i];
      if (it.kind === 'food' || it.held) continue;
      if (Math.abs(it.x - p.x) < BH * 0.62 && Math.abs(it.z - p.z) < 0.16) {
        if (it.kind === 'pipe') {
          p.weapon = { kind: 'pipe', dur: 12 };
          FX.text(p.x, -BH, p.z, 'PIPE', '#cfd6e0');
        } else {
          p.carry = { kind: 'crate' };
          FX.text(p.x, -BH, p.z, 'CRATE', '#d8a05a');
        }
        G.items.splice(i, 1); Audio.pickup();
        return;
      }
    }
    // grab downed foe
    for (const f of G.foes) {
      if (f.state !== 'down' || f.dying) continue;
      if (Math.abs(f.x - p.x) < BH * 0.75 && Math.abs(f.z - p.z) < 0.2) {
        f.state = 'carried'; f.inv = 0;
        p.carry = { kind: 'foe', foe: f };
        Audio.pickup(); FX.text(p.x, -BH * 1.2, p.z, 'GRAB!', '#ffe27a');
        return;
      }
    }
    // attack
    if (p.weapon) { startAtk(p, ATTACKS.pipe); return; }
    p.combo = (p.combo + 1) % 3; p.comboT = 0.75;
    startAtk(p, p.combo === 1 ? ATTACKS.jab : p.combo === 2 ? ATTACKS.jab2 : ATTACKS.finish);
  }

  function startAtk(p, a) {
    p.atk = a; p.atkT = 0; p.hasHit = false; p.state = 'atk';
    p.vx = p.face * BH * 0.5;
    Audio.whiff();
  }

  function doPlayerStrike(p, a) {
    const reach = reachOf(a);
    let hitAny = false;
    for (const f of G.foes) {
      if (f.state === 'carried' || f.dying) continue;
      if (!inLane(p, f)) continue;
      if (Math.abs(f.y - p.y) > BH * 0.55) continue;
      if (!hitReach(p, f, reach)) continue;
      const kd = a.kd || (p.weapon != null);
      if (damageFoe(f, a.dmg, kd, p.face, p.combo === 0 ? 'combo' : null)) {
        hitAny = true;
        G.score += 10;
        FX.burst(p.x + p.face * reach * 0.7, -BH * 0.55 + p.y, p.z, 6, '#fff2b0', 220);
      }
    }
    for (let i = G.props.length - 1; i >= 0; i--) {
      const pr = G.props[i];
      if (Math.abs(pr.z - p.z) > LANE_TOL) continue;
      if (Math.abs(pr.x - p.x) > reach + BH * 0.25) continue;
      if ((p.face > 0 && pr.x < p.x - BH * 0.2) || (p.face < 0 && pr.x > p.x + BH * 0.2)) continue;
      smashProp(pr, p.face); hitAny = true;
    }
    if (hitAny && p.weapon) {
      p.weapon.dur--;
      if (p.weapon.dur <= 0) {
        FX.burst(p.x + p.face * reach * 0.6, -BH * 0.5, p.z, 12, '#cfd6e0', 240, { up: 80 });
        p.weapon = null; FX.text(p.x, -BH, p.z, 'BROKE', '#cfd6e0');
      }
    }
  }

  function dropCarry(p, forced) {
    if (!p.carry) return;
    if (p.carry.kind === 'foe') {
      const f = p.carry.foe;
      f.state = 'down'; f.downT = 0; f.inv = 0; f.y = 0; f.vy = -160; f.x = p.x + p.face * BH * 0.3; f.z = p.z;
    } else {
      G.items.push(mkItem('crate', p.x + p.face * BH * 0.3, p.z));
    }
    p.carry = null;
  }

  function throwCarry(p, swipe) {
    const mag = Math.hypot(swipe.dx, swipe.dy) || 1;
    let dx = swipe.dx / mag, dy = swipe.dy / mag;
    if (Math.abs(dx) < 0.2) dx = p.face * 0.2;
    const dir = sign(dx) || p.face;
    p.face = dir;
    const proj = {
      kind: p.carry.kind, foe: p.carry.foe || null,
      x: p.x + dir * BH * 0.25, z: p.z, y: -BH * 0.7,
      vx: dir * BH * 5.2, vz: dy * 0.55, vy: -260, hits: []
    };
    if (proj.foe) { proj.foe.state = 'thrown'; proj.foe.inv = 0; proj.foe.entered = true; }
    G.shots.push({ type: 'thrown', o: proj });
    p.carry = null;
    Audio.tone(300, 0.16, 'square', 0.16, 900);
    FX.shake(3 * (W / 960), 0.1);
  }

  function loseLife() {
    G.lives--;
    const p = G.player;
    if (G.lives <= 0) {
      G.mode = 'over';
      if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('br_best', String(G.best)); } catch (e) { } }
      Audio.dead();
      return;
    }
    if (p.carry) dropCarry(p, true);
    p.hp = p.maxhp; p.state = 'getup'; p.st = 0.5; p.inv = 2.0; p.ko = false;
    p.y = 0; p.vy = 0; p.vx = 0; p.weapon = null; p.carry = null;
    p.x = G.camX + W * 0.22; p.z = 0.55;
    banner('LIFE LOST — ' + G.lives + ' LEFT', 1.4);
  }

  /* ================= foe AI ================= */
  function updateFoe(f, dt, p) {
    f.anim += dt * 7;
    if (f.inv > 0 && f.state !== 'carried') f.inv -= dt;
    if (f.armorFlash > 0) f.armorFlash -= dt;
    if (f.hitStackT > 0) { f.hitStackT -= dt; if (f.hitStackT <= 0) f.hitStack = 0; }

    if (f.state === 'carried') {
      f.x = p.x + p.face * BH * 0.1; f.z = p.z; f.y = -BH * 1.25;
      return;
    }
    if (f.state === 'thrown') { return; } // driven by projectile

    // keep foes reachable: once on screen they may never leave it
    if (!f.entered && f.x > G.camX + BH * 0.3 && f.x < G.camX + W - BH * 0.3) f.entered = true;
    if (f.entered) f.x = clamp(f.x, G.camX + BH * 0.25, G.camX + W - BH * 0.25);
    else f.x = clamp(f.x, G.camX - W * 0.3, G.camX + W * 1.3);

    if (f.state === 'down') {
      f.y += f.vy * dt; f.vy += GRAV * dt; f.x += f.vx * dt; f.vx *= 0.9;
      if (f.y >= 0) {
        f.y = 0; if (f.vy > 0) f.vy = 0; f.vx *= 0.3;
        if (f.dying) { f.state = 'dying'; f.st = 0.5; return; }
        f.downT += dt;
      }
      if (!f.dying && f.downT > 0.85 + Math.random() * 0.35) {
        f.state = 'getup'; f.st = 0.42; f.inv = 0.55;
        f.wakeSwing = Math.random() < 0.4;
      }
      return;
    }
    if (f.state === 'dying') {
      f.st -= dt;
      if (f.st <= 0) { const i = G.foes.indexOf(f); if (i >= 0) G.foes.splice(i, 1); if (G.boss === f) G.boss = null; }
      return;
    }
    if (f.state === 'getup') {
      f.st -= dt;
      if (f.st <= 0) {
        f.state = 'idle';
        if (f.wakeSwing) { f.face = sign(p.x - f.x) || f.face; startFoeAtk(f, p, true); }
        f.wakeSwing = false;
      }
      return;
    }
    if (f.state === 'hurt') {
      f.hurtT -= dt; f.x += f.vx * dt; f.vx *= 0.85;
      if (f.hurtT <= 0) f.state = 'idle';
      return;
    }
    if (f.state === 'atk' || f.state === 'wind') {
      f.atkT += dt;
      const a = f.atk;
      if (f.state === 'wind' && f.atkT >= a.wind) { f.state = 'atk'; }
      if (!f.hasHit && f.atkT >= a.wind + a.strike) {
        f.hasHit = true;
        foeStrike(f, a, p);
      }
      if (a.lunge && f.atkT < a.wind + a.strike + 0.1 && f.atkT > a.wind) f.x += f.face * a.lunge * BH * dt;
      if (f.hop) {
        f.y += f.vy * dt; f.vy += GRAV * dt;
        if (f.y >= 0) { f.y = 0; f.vy = 0; f.hop = false; }
      }
      if (f.atkT >= a.wind + a.dur) { f.state = 'idle'; f.atk = null; f.cd = f.cdRange ? f.cdRange[0] + Math.random() * (f.cdRange[1] - f.cdRange[0]) : 1; }
      return;
    }

    /* --- decide --- */
    f.cd -= dt;
    const pz = p.z, px = p.x;
    const dx = px - f.x, dz = pz - f.z;
    const dist = Math.abs(dx);
    const cfg = FOE[f.type];
    f.cdRange = cfg.cd;
    const playerDown = p.state === 'down' || p.state === 'getup';

    if (f.think > 0) f.think -= dt;

    let tgtX, tgtZ = pz, engage = true;
    if (f.type === 'tosser') {
      const want = G.foes.length <= 2 ? BH * 1.15 : BH * 2.0;
      if (dist < want * 0.7) tgtX = px - sign(dx) * want;
      else if (dist > want * 1.5) tgtX = px - sign(dx) * want;
      else { tgtX = f.x; }
      if (f.cd <= 0 && Math.abs(f.z - pz) < 0.10 && dist > BH * 0.9 && !playerDown) {
        f.face = sign(dx) || f.face;
        throwKnife(f, p); f.cd = cfg.cd[0] + Math.random() * (cfg.cd[1] - cfg.cd[0]);
        return;
      }
    } else if (f.type === 'acro') {
      tgtX = px - (f.side || (f.side = Math.random() < 0.5 ? 1 : -1)) * BH * cfg.atkR * 0.85;
      tgtZ = pz + (f.side * 0.02);
    } else {
      tgtX = px - (sign(dx) || 1) * BH * cfg.atkR * 0.8;
    }
    if (playerDown && f.type !== 'boss') { tgtX = px - (sign(dx) || 1) * BH * 1.6; engage = false; }

    // boss special
    if (f.type === 'boss') {
      if (!f.phase2 && f.hp < f.maxhp * 0.5) {
        f.phase2 = true;
        banner('HE CALLS FOR BACKUP', 1.2);
        spawnFoe('rusher', 1); spawnFoe('rusher', -1);
      }
      if (f.cd <= 0 && dist < BH * 3.2 && Math.abs(dz) < 0.5 && Math.random() < 0.35) {
        // ground pound: full-lane shock
        startFoeAtk(f, p, false, 'pound');
        return;
      }
    }

    const spd = BH * f.spd * (f.type === 'acro' ? (1 + 0.3 * Math.sin(f.anim * 0.4)) : 1);
    const mvx = tgtX - f.x, mvz = tgtZ - f.z;
    const mm = Math.hypot(mvx, mvz * (GB - HZ));
    if (mm > 4) {
      const nx = mvx / mm, nz = (mvz * (GB - HZ)) / mm;
      f.x += nx * spd * dt;
      f.z = clamp(f.z + (nz * spd * dt) / (GB - HZ), 0.04, 0.96);
      f.state = 'walk';
    } else f.state = 'idle';
    if (Math.abs(dx) > 4) f.face = sign(dx);

    // separation
    for (const o of G.foes) {
      if (o === f || o.state === 'down' || o.state === 'carried' || o.state === 'thrown') continue;
      const ddx = o.x - f.x, ddz = (o.z - f.z) * (GB - HZ);
      const d = Math.hypot(ddx, ddz);
      const minD = BH * 0.5;
      if (d < minD && d > 0.01) {
        f.x -= (ddx / d) * (minD - d) * 0.6 * dt * 8;
        f.z = clamp(f.z - (ddz / d) * (minD - d) * 0.6 * dt * 8 / (GB - HZ), 0.04, 0.96);
      }
    }

    if (engage && f.cd <= 0 && f.type !== 'tosser' &&
      Math.abs(p.z - f.z) < 0.13 && Math.abs(p.x - f.x) < BH * cfg.atkR * 1.25 && p.y > -BH * 0.5) {
      f.face = sign(p.x - f.x) || f.face;
      startFoeAtk(f, p, false);
    }
  }

  function startFoeAtk(f, p, wake, special) {
    const cfg = FOE[f.type];
    let a;
    if (special === 'pound') {
      a = { wind: 0.45, strike: 0.05, dur: 0.6, reach: 1.6, dmg: f.dmg + 4, kd: true, pound: true };
    } else if (f.type === 'heavy') {
      a = { wind: 0.42, strike: 0.06, dur: 0.5, reach: cfg.atkR * 1.15, dmg: f.dmg, kd: true, lunge: 1.2 };
    } else if (f.type === 'acro') {
      a = { wind: 0.16, strike: 0.06, dur: 0.34, reach: cfg.atkR * 1.1, dmg: f.dmg, kd: false, lunge: 3.4 };
      f.hop = true; f.vy = -430;
    } else if (f.type === 'boss') {
      a = { wind: 0.28, strike: 0.06, dur: 0.42, reach: cfg.atkR * 1.15, dmg: f.dmg, kd: Math.random() < 0.5, lunge: 1.6 };
    } else {
      a = { wind: 0.24, strike: 0.05, dur: 0.34, reach: cfg.atkR * 1.05, dmg: f.dmg, kd: false, lunge: 1.4 };
    }
    if (wake) { a = Object.assign({}, a, { wind: Math.max(0.1, a.wind * 0.5), kd: true }); }
    f.atk = a; f.atkT = 0; f.hasHit = false; f.state = 'wind';
  }

  function foeStrike(f, a, p) {
    const reach = a.reach * BH;
    if (a.pound) {
      FX.shake(10 * (W / 960), 0.35);
      Audio.heavy();
      for (let i = 0; i < 22; i++) FX.burst(f.x + (Math.random() - 0.5) * reach * 2, 0, f.z, 1, '#e6b45a', 260, { up: 160 });
      if (Math.abs(p.x - f.x) < reach && Math.abs(p.z - f.z) < 0.5 && p.y > -BH * 0.4) damagePlayer(p, a.dmg, true, sign(p.x - f.x) || f.face);
      return;
    }
    Audio.whiff();
    if (!inLane(f, p, 0.14)) return;
    if (Math.abs(p.y - f.y) > BH * 0.55) return;
    if (!hitReach(f, p, reach)) return;
    damagePlayer(p, a.dmg, a.kd, f.face);
  }

  function throwKnife(f, p) {
    G.shots.push({
      type: 'knife', x: f.x + f.face * BH * 0.3, z: f.z, y: -BH * 0.62,
      vx: f.face * BH * 3.6, life: 3, spin: 0
    });
    Audio.knife();
    f.state = 'wind'; f.atk = { wind: 0.18, strike: 0.02, dur: 0.2, reach: 0, dmg: 0, kd: false }; f.atkT = 0; f.hasHit = true;
  }

  /* ================= projectiles ================= */
  function updateShots(dt, p) {
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const s = G.shots[i];
      if (s.type === 'knife') {
        s.x += s.vx * dt; s.life -= dt; s.spin += dt * 22;
        if (s.life <= 0 || s.x < G.camX - 60 || s.x > G.camX + W + 60) { G.shots.splice(i, 1); continue; }
        if (Math.abs(s.x - p.x) < BH * 0.3 && Math.abs(s.z - p.z) < 0.11 && p.y > -BH * 0.55 && p.state !== 'down') {
          damagePlayer(p, 9, false, sign(s.vx));
          FX.burst(s.x, s.y, s.z, 6, '#ff8b6a', 180);
          G.shots.splice(i, 1);
        }
        continue;
      }
      // thrown crate / foe
      const o = s.o;
      o.x += o.vx * dt; o.y += o.vy * dt; o.vy += GRAV * 0.8 * dt;
      o.z = clamp(o.z + o.vz * dt, 0.04, 0.96);
      if (o.foe) { o.foe.x = o.x; o.foe.y = o.y; o.foe.z = o.z; }
      FX.burst(o.x, o.y, o.z, 1, '#ffd76b', 40, { life: 0.2, g: 0 });
      // collide with foes
      for (const f of G.foes) {
        if (f === o.foe || f.state === 'dying' || f.state === 'carried') continue;
        if (o.hits.indexOf(f) >= 0) continue;
        if (Math.abs(f.x - o.x) < BH * 0.45 && Math.abs(f.z - o.z) < 0.16 && Math.abs(f.y - o.y) < BH * 0.8) {
          o.hits.push(f);
          damageFoe(f, 24, true, sign(o.vx) || 1);
          G.score += 30;
          o.vx *= 0.55;
        }
      }
      if (o.y >= 0) {
        o.y = 0;
        FX.shake(5 * (W / 960), 0.2);
        if (o.foe) {
          const f = o.foe;
          f.state = 'down'; f.downT = 0; f.y = 0; f.vy = 0; f.vx = 0; f.inv = 0;
          damageFoe(f, 26, true, sign(o.vx) || 1);
          if (f.state !== 'dying') { f.state = 'down'; f.downT = 0; }
        } else {
          FX.burst(o.x, 0, o.z, 16, '#d8a05a', 260, { up: 130 });
          Audio.noise(0.2, 0.35, 500, 0.8);
        }
        G.shots.splice(i, 1);
        continue;
      }
      if (o.x < G.camX - 120 || o.x > G.camX + W + 120) { if (o.foe) { o.foe.state = 'down'; o.foe.downT = 0; o.foe.y = 0; } G.shots.splice(i, 1); }
    }
  }

  /* ================= camera / progress ================= */
  function updateCamera(dt, p) {
    const segStart = G.seg * L;
    const maxCam = G.seg * L + (L - W);
    const minCam = Math.max(0, segStart - W);
    let target = p.x - W * 0.42;
    target = clamp(target, minCam, maxCam);
    if (G.camLock !== null) target = Math.min(target, G.camLock);
    G.camX = lerp(G.camX, target, Math.min(1, dt * 5));
    G.camX = clamp(G.camX, minCam, maxCam);

    checkWaves();

    if (G.camLock === null && G.camX >= maxCam - 2) {
      if (G.seg < SEGS - 1) {
        G.seg++;
        G.goT = 0;
        banner('BLOCK ' + (G.seg + 1) + (G.seg === SEGS - 1 ? ' — BOSS ALLEY' : ''), 1.4);
        G.score += 200;
        Audio.clear();
      }
    }
    if (G.goT > 0) G.goT -= dt * 0;
  }

  /* ================= main update ================= */
  function update(dt) {
    if (window.innerHeight > window.innerWidth * 1.02) return;
    G.t += dt;
    if (G.hintT > 0 && Input.anyInput) G.hintT -= dt;
    if (G.bannerT > 0) { G.bannerT -= dt; if (G.bannerT <= 0) G.banner = null; }
    if (G.flash > 0) G.flash -= dt;

    if (G.mode === 'over') {
      if (Input.tap.punch || Input.tap.jump || Input.hit('enter', ' ', 'j', 'k', 'r')) { newGame(); }
      FX.update(dt);
      return;
    }
    if (G.mode === 'stageclear') {
      G.st -= dt;
      FX.update(dt);
      if (G.st <= 0) {
        const p = G.player;
        buildStage(G.stage + 1);
        p.x = W * 0.25; p.z = 0.55; p.hp = Math.min(p.maxhp, p.hp + 45); p.carry = null; p.weapon = null;
        p.state = 'idle'; p.inv = 1.2; p.y = 0; p.vy = 0;
        G.mode = 'play';
      }
      return;
    }

    const p = G.player;
    updatePlayer(p, dt);
    for (let i = G.foes.length - 1; i >= 0; i--) updateFoe(G.foes[i], dt, p);
    updateShots(dt, p);

    // items physics
    for (const it of G.items) { if (it.y < 0) { it.y += it.vy * dt; it.vy += GRAV * dt; if (it.y > 0) { it.y = 0; it.vy = 0; } } }

    updateCamera(dt, p);
    FX.update(dt);

    // boss defeat -> stage clear
    if (G.seg === SEGS - 1 && G.waves[G.waves.length - 1].done && !G.boss && G.foes.length === 0 && G.pending.length === 0) {
      G.mode = 'stageclear'; G.st = 2.6;
      G.score += 1000 + G.stage * 250;
      banner('STAGE ' + G.stage + ' CLEAR  +' + (1000 + G.stage * 250), 2.4);
      Audio.clear();
      if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('br_best', String(G.best)); } catch (e) { } }
    }
  }

  /* ================= rendering ================= */
  let SKY = [];
  function buildSky() {
    const layers = [
      { par: 0.14, wMul: 0.30, hMin: 0.35, hMax: 0.85, col: '#1d2033', win: 'rgba(255,214,120,0.13)' },
      { par: 0.32, wMul: 0.24, hMin: 0.25, hMax: 0.62, col: '#282b42', win: 'rgba(255,200,110,0.16)' }
    ];
    SKY = [];
    for (let li = 0; li < layers.length; li++) {
      const cfg = layers[li];
      const rng = makeRng(G.seed + G.stage * 7717 + li * 331);
      const arr = [];
      for (let i = 0; i < 24; i++) {
        const rows = 5, wins = [];
        for (let c = 0; c < 3; c++) for (let r = 1; r < rows; r++) if (rng() < 0.42) wins.push([c, r]);
        arr.push({ hf: cfg.hMin + rng() * (cfg.hMax - cfg.hMin), rows: rows, wins: wins });
      }
      SKY.push({ cfg: cfg, arr: arr });
    }
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, HZ);
    g.addColorStop(0, '#141826'); g.addColorStop(0.6, '#26243c'); g.addColorStop(1, '#4a3350');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HZ + 1);

    // far skyline (precomputed per stage; tiled + parallax)
    for (let li = 0; li < SKY.length; li++) {
      const layer = SKY[li], cfg = layer.cfg, arr = layer.arr;
      const bw = W * cfg.wMul;
      const off = G.camX * cfg.par;
      const first = Math.floor(off / bw) - 1;
      const count = Math.ceil(W / bw) + 3;
      for (let i = first; i < first + count; i++) {
        const b = arr[((i % arr.length) + arr.length) % arr.length];
        const bh2 = HZ * b.hf;
        const x = i * bw - off;
        if (x > W || x + bw * 0.86 < 0) continue;
        ctx.fillStyle = cfg.col;
        ctx.fillRect(x, HZ + 2 - bh2, bw * 0.86, bh2);
        ctx.fillStyle = cfg.win;
        const rh = bh2 / b.rows;
        for (let k = 0; k < b.wins.length; k++) {
          const wn = b.wins[k];
          ctx.fillRect(x + bw * (0.12 + wn[0] * 0.26), HZ + 2 - bh2 + H * 0.015 + wn[1] * rh, bw * 0.13, rh * 0.42);
        }
      }
    }

    // street
    const gr = ctx.createLinearGradient(0, HZ, 0, H);
    gr.addColorStop(0, '#3a3345'); gr.addColorStop(0.25, '#2c2a35'); gr.addColorStop(1, '#1b1a22');
    ctx.fillStyle = gr; ctx.fillRect(0, HZ, W, H - HZ);

    // sidewalk band at top of ground
    ctx.fillStyle = '#3f3b4c';
    ctx.fillRect(0, HZ, W, (GB - HZ) * 0.10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, HZ + (GB - HZ) * 0.10, W, 2);

    // lane guide stripes (subtle, readability for lane-honest hits)
    for (let i = 0; i < LANES.length; i++) {
      const y = groundY(LANES[i]);
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = Math.max(1, H * 0.004);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // road dashes
    const dashOff = -(G.camX * 1.0) % (W * 0.16);
    ctx.fillStyle = 'rgba(240,220,140,0.10)';
    for (let x = dashOff - W * 0.16; x < W + W * 0.16; x += W * 0.16) {
      ctx.fillRect(x, groundY(0.5) - H * 0.006, W * 0.075, H * 0.012);
    }
    // bottom vignette
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, GB + (H - GB) * 0.3, W, H);
  }

  function shadow(x, y, z, w) {
    const s = dscale(z);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(x, groundY(z), w * BH * 0.5 * s, w * BH * 0.16 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function limb(x1, y1, x2, y2, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function drawFighter(e, opts) {
    const sx = e.x - G.camX;
    if (sx < -BH * 2 || sx > W + BH * 2) return;
    const s = dscale(e.z);
    const gy = groundY(e.z);
    const by = gy + e.y * s;              // body base y
    const h = BH * s;
    const bw = e.w * BH * s;
    const col = opts.col, col2 = opts.col2, skin = opts.skin || '#e8c39a';

    shadow(sx, 0, e.z, e.w * (e.y < -2 ? 0.75 : 1));

    const down = e.state === 'down' || e.state === 'dying';
    const getup = e.state === 'getup';
    ctx.save();
    ctx.translate(sx, by);
    if (down) {
      const t = e.state === 'dying' ? clamp(1 - e.st / 0.5, 0, 1) : 1;
      ctx.rotate(e.face * Math.PI * 0.5 * clamp(e.y < -2 ? 0.5 : 1, 0, 1));
      ctx.globalAlpha = e.state === 'dying' ? 1 - t * 0.85 : 1;
    } else if (getup) {
      ctx.rotate(e.face * (Math.PI * 0.5) * (e.st / 0.42));
    }

    const flash = (e.inv > 0 && Math.floor(e.inv * 20) % 2 === 0) || (e.armorFlash > 0);
    const bodyCol = flash ? '#ffffff' : col;
    const darkCol = flash ? '#dddddd' : col2;

    // legs
    const walkP = (e.state === 'walk') ? Math.sin(e.anim) : 0;
    const legW = Math.max(2, bw * 0.30);
    limb(-bw * 0.20, -h * 0.42, -bw * 0.22 + walkP * bw * 0.35, 0, legW, darkCol);
    limb(bw * 0.20, -h * 0.42, bw * 0.22 - walkP * bw * 0.35, 0, legW, darkCol);

    // torso
    ctx.fillStyle = bodyCol;
    roundRect(-bw * 0.44, -h * 0.80, bw * 0.88, h * 0.42, bw * 0.18);
    ctx.fill();
    // belt
    ctx.fillStyle = darkCol; ctx.fillRect(-bw * 0.44, -h * 0.44, bw * 0.88, h * 0.05);

    // arms
    const armW = Math.max(2, bw * 0.24);
    let punchExt = 0;
    if (e.state === 'atk' && e.atk) {
      const a = e.atk;
      const t0 = e.kind === 'player' ? e.atkT / a.dur : (e.atkT - a.wind) / Math.max(0.001, a.dur);
      punchExt = Math.sin(clamp(t0, 0, 1) * Math.PI) * (opts.reach || 0.9);
    } else if (e.state === 'wind') {
      punchExt = -0.25 * (e.atkT / Math.max(0.001, e.atk ? e.atk.wind : 0.2));
    }
    const ax = e.face * (bw * 0.42 + punchExt * h * 0.60);
    limb(-e.face * bw * 0.30, -h * 0.70, -e.face * bw * 0.42, -h * 0.46, armW, bodyCol);
    limb(e.face * bw * 0.30, -h * 0.70, ax, -h * 0.62 - punchExt * h * 0.04, armW, bodyCol);

    // held stuff
    if (opts.weapon === 'pipe') {
      ctx.save(); ctx.translate(ax, -h * 0.62);
      ctx.rotate(e.face * (punchExt > 0 ? -0.2 : -1.1));
      ctx.fillStyle = '#c9d2dc'; ctx.fillRect(0, -h * 0.03, e.face * h * 0.52, h * 0.06);
      ctx.fillStyle = '#8b96a3'; ctx.fillRect(0, -h * 0.03, e.face * h * 0.10, h * 0.06);
      ctx.restore();
    }
    if (opts.knife) {
      ctx.fillStyle = '#dfe7ef';
      ctx.fillRect(ax, -h * 0.66, e.face * h * 0.16, h * 0.035);
    }

    // head
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(e.face * bw * 0.06, -h * 0.90, bw * 0.30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = darkCol;
    ctx.beginPath();
    ctx.arc(e.face * bw * 0.06, -h * 0.95, bw * 0.31, Math.PI * 1.05, Math.PI * 2.05); ctx.fill();
    // face marker (direction)
    ctx.fillStyle = 'rgba(20,15,25,0.75)';
    ctx.fillRect(e.face * bw * 0.16, -h * 0.93, e.face * bw * 0.16, bw * 0.09);

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawProp(pr) {
    const sx = pr.x - G.camX;
    if (sx < -100 || sx > W + 100) return;
    const s = dscale(pr.z), gy = groundY(pr.z);
    const h = BH * (pr.kind === 'bin' ? 0.46 : 0.52) * s;
    const w = BH * 0.42 * s;
    shadow(sx, 0, pr.z, 0.42);
    ctx.save(); ctx.translate(sx, gy);
    if (pr.hitT > 0) { ctx.translate((Math.random() - 0.5) * 6, 0); pr.hitT -= 0.016; }
    if (pr.kind === 'bin') {
      ctx.fillStyle = '#5c6674'; roundRect(-w / 2, -h, w, h, w * 0.12); ctx.fill();
      ctx.fillStyle = '#78848f'; ctx.fillRect(-w / 2, -h, w, h * 0.14);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-w * 0.1, -h * 0.86, w * 0.06, h * 0.7);
    } else {
      ctx.fillStyle = '#8a5f33'; roundRect(-w / 2, -h, w, h, w * 0.16); ctx.fill();
      ctx.fillStyle = '#a5763f'; ctx.fillRect(-w / 2, -h * 0.72, w, h * 0.12);
      ctx.fillStyle = '#a5763f'; ctx.fillRect(-w / 2, -h * 0.34, w, h * 0.12);
    }
    ctx.restore();
  }

  function drawItem(it) {
    const sx = it.x - G.camX;
    if (sx < -80 || sx > W + 80) return;
    const s = dscale(it.z), gy = groundY(it.z) + it.y * s;
    shadow(sx, 0, it.z, 0.34);
    const pulse = 1 + Math.sin(G.t * 6 + it.x) * 0.06;
    ctx.save(); ctx.translate(sx, gy);
    if (it.kind === 'pipe') {
      ctx.fillStyle = '#c9d2dc'; ctx.fillRect(-BH * 0.26 * s, -BH * 0.05 * s, BH * 0.52 * s, BH * 0.06 * s);
      ctx.fillStyle = '#8b96a3'; ctx.fillRect(-BH * 0.26 * s, -BH * 0.05 * s, BH * 0.12 * s, BH * 0.06 * s);
    } else if (it.kind === 'crate') {
      const w = BH * 0.34 * s;
      ctx.fillStyle = '#a5763f'; roundRect(-w / 2, -w, w, w, w * 0.1); ctx.fill();
      ctx.strokeStyle = '#6f4c25'; ctx.lineWidth = Math.max(1, w * 0.08);
      ctx.beginPath(); ctx.moveTo(-w / 2, -w); ctx.lineTo(w / 2, 0); ctx.moveTo(w / 2, -w); ctx.lineTo(-w / 2, 0); ctx.stroke();
    } else {
      const r = BH * 0.13 * s * pulse;
      ctx.fillStyle = '#2fbf6b'; ctx.beginPath(); ctx.arc(0, -r, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eafff0';
      ctx.fillRect(-r * 0.5, -r * 1.16, r, r * 0.32);
      ctx.fillRect(-r * 0.16, -r * 1.5, r * 0.32, r);
    }
    ctx.restore();
  }

  function drawShot(s) {
    if (s.type === 'knife') {
      const sx = s.x - G.camX, sy = groundY(s.z) + s.y * dscale(s.z);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.spin);
      ctx.fillStyle = '#e6eef7'; ctx.fillRect(-BH * 0.11, -BH * 0.02, BH * 0.22, BH * 0.04);
      ctx.fillStyle = '#8d97a3'; ctx.fillRect(-BH * 0.11, -BH * 0.02, BH * 0.07, BH * 0.04);
      ctx.restore();
    } else {
      const o = s.o;
      if (!o.foe) {
        const sx = o.x - G.camX, sy = groundY(o.z) + o.y * dscale(o.z);
        const w = BH * 0.34 * dscale(o.z);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(G.t * 9);
        ctx.fillStyle = '#a5763f'; roundRect(-w / 2, -w / 2, w, w, w * 0.1); ctx.fill();
        ctx.restore();
      }
    }
  }

  const drawList = [];
  const FOE_OPT = { col: '#e4643c', col2: '#8d3320', skin: '#d8b48c', knife: false, reach: 0.9 };
  const PL_OPT = { col: '#3f8ee0', col2: '#1f4f88', skin: '#f0c9a0', weapon: null, reach: 1.0 };
  const byZ = (a, b) => a.z - b.z;

  function drawScene() {
    drawBackground();

    drawList.length = 0;
    for (let i = 0; i < G.props.length; i++) drawList.push({ z: G.props[i].z, t: 0, o: G.props[i] });
    for (let i = 0; i < G.items.length; i++) drawList.push({ z: G.items[i].z, t: 1, o: G.items[i] });
    for (let i = 0; i < G.shots.length; i++) {
      const s = G.shots[i];
      if (s.type === 'knife') drawList.push({ z: s.z, t: 2, o: s });
      else if (!s.o.foe) drawList.push({ z: s.o.z, t: 2, o: s });
    }
    for (let i = 0; i < G.foes.length; i++) drawList.push({ z: G.foes[i].z, t: 3, o: G.foes[i] });
    const p = G.player;
    drawList.push({ z: p.z, t: 4, o: p });

    drawList.sort(byZ);
    for (let i = 0; i < drawList.length; i++) {
      const e = drawList[i];
      switch (e.t) {
        case 0: drawProp(e.o); break;
        case 1: drawItem(e.o); break;
        case 2: drawShot(e.o); break;
        case 3: {
          const f = e.o;
          FOE_OPT.col = f.col; FOE_OPT.col2 = f.col2;
          FOE_OPT.knife = f.type === 'tosser';
          FOE_OPT.reach = f.type === 'heavy' ? 1.1 : 0.9;
          drawFighter(f, FOE_OPT); drawFoeBar(f);
          break;
        }
        case 4:
          PL_OPT.weapon = p.weapon ? 'pipe' : null;
          PL_OPT.reach = p.weapon ? 1.3 : 1.0;
          drawFighter(p, PL_OPT);
          if (p.carry) drawCarried(p);
          break;
      }
    }
    for (let i = 0; i < FX.parts.length; i++) drawPart(FX.parts[i]);

    for (const t of FX.texts) {
      const sx = t.x - G.camX, sy = groundY(t.z) + t.y * dscale(t.z);
      ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
      ctx.fillStyle = t.c;
      ctx.font = 'bold ' + Math.round(H * 0.045) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.s, sx, sy);
      ctx.globalAlpha = 1;
    }
  }

  function drawPart(q) {
    const s = dscale(q.z);
    ctx.fillStyle = q.c;
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillRect(q.x - G.camX - q.r * s * 0.5, groundY(q.z) + q.y * s - q.r * s * 0.5, q.r * s, q.r * s);
    ctx.globalAlpha = 1;
  }

  function drawCarried(p) {
    const sx = p.x - G.camX, s = dscale(p.z);
    const y = groundY(p.z) + p.y * s - BH * s * 1.25;
    if (p.carry.kind === 'crate') {
      const w = BH * 0.36 * s;
      ctx.fillStyle = '#a5763f'; roundRect(sx - w / 2, y - w * 0.5, w, w, w * 0.1); ctx.fill();
      ctx.strokeStyle = '#6f4c25'; ctx.lineWidth = Math.max(1, w * 0.08);
      ctx.beginPath(); ctx.moveTo(sx - w / 2, y - w * 0.5); ctx.lineTo(sx + w / 2, y + w * 0.5); ctx.stroke();
    }
  }

  function drawFoeBar(f) {
    if (f.state === 'dying' || f.type === 'boss') return;
    if (f.hp >= f.maxhp) return;
    const s = dscale(f.z), sx = f.x - G.camX;
    const y = groundY(f.z) + f.y * s - BH * s * 1.18;
    const w = BH * 0.5 * s, h = Math.max(2, H * 0.009);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx - w / 2, y, w, h);
    ctx.fillStyle = f.hp / f.maxhp > 0.35 ? '#ffcf5c' : '#ff6a6a';
    ctx.fillRect(sx - w / 2, y, w * (f.hp / f.maxhp), h);
  }

  /* ================= HUD ================= */
  function drawHUD() {
    const p = G.player;
    const pad = H * 0.03;
    const bw = W * 0.30, bh = H * 0.042;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(pad, pad, bw, bh, bh * 0.3); ctx.fill();
    const hp = clamp(p.hp / p.maxhp, 0, 1);
    const hg = ctx.createLinearGradient(pad, 0, pad + bw, 0);
    hg.addColorStop(0, hp > 0.3 ? '#4de08a' : '#ff5f5f'); hg.addColorStop(1, hp > 0.3 ? '#a8f06a' : '#ff9c5f');
    ctx.fillStyle = hg;
    ctx.fillRect(pad + 2, pad + 2, (bw - 4) * hp, bh - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, H * 0.003);
    roundRect(pad, pad, bw, bh, bh * 0.3); ctx.stroke();

    ctx.font = 'bold ' + Math.round(H * 0.032) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText('YOU', pad + bw * 0.03, pad + bh * 0.74);

    // lives
    for (let i = 0; i < G.lives; i++) {
      ctx.fillStyle = '#3f8ee0';
      ctx.beginPath(); ctx.arc(pad + bw + H * 0.05 + i * H * 0.05, pad + bh * 0.5, H * 0.016, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, H * 0.004); ctx.stroke();
    }

    // score
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(H * 0.042) + 'px system-ui, sans-serif';
    ctx.fillText(String(G.score).padStart(6, '0'), W - pad, pad + bh * 0.72);
    ctx.font = 'bold ' + Math.round(H * 0.028) + 'px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('BEST ' + G.best + '   STAGE ' + G.stage + '-' + (G.seg + 1), W - pad, pad + bh * 1.6);

    // weapon indicator
    if (G.player.weapon) {
      ctx.textAlign = 'left'; ctx.fillStyle = '#cfd6e0';
      ctx.font = 'bold ' + Math.round(H * 0.028) + 'px system-ui, sans-serif';
      ctx.fillText('PIPE x' + G.player.weapon.dur, pad, pad + bh * 1.7);
    } else if (G.player.carry) {
      ctx.textAlign = 'left'; ctx.fillStyle = '#ffe27a';
      ctx.font = 'bold ' + Math.round(H * 0.028) + 'px system-ui, sans-serif';
      ctx.fillText('SWIPE TO THROW', pad, pad + bh * 1.7);
    }

    // boss bar
    if (G.boss && G.boss.state !== 'dying') {
      const b = G.boss;
      const w2 = W * 0.5, x2 = (W - w2) / 2, y2 = pad;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(x2, y2, w2, bh * 0.8, bh * 0.25); ctx.fill();
      ctx.fillStyle = '#d8425f';
      ctx.fillRect(x2 + 2, y2 + 2, (w2 - 4) * clamp(b.hp / b.maxhp, 0, 1), bh * 0.8 - 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; roundRect(x2, y2, w2, bh * 0.8, bh * 0.25); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(H * 0.028) + 'px system-ui, sans-serif';
      ctx.fillText(b.name, W / 2, y2 + bh * 1.45);
    }

    // GO arrow
    if (G.camLock === null && G.foes.length === 0 && G.mode === 'play' && G.seg < SEGS - 1) {
      const a = 0.55 + Math.sin(G.t * 7) * 0.35;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffe27a';
      ctx.textAlign = 'right';
      ctx.font = 'bold ' + Math.round(H * 0.075) + 'px system-ui, sans-serif';
      ctx.fillText('GO →', W - W * 0.03, H * 0.42);
      ctx.globalAlpha = 1;
    }

    // banner
    if (G.banner) {
      const a = clamp(G.bannerT * 2, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H * 0.30, W, H * 0.11);
      ctx.fillStyle = '#ffe27a';
      ctx.font = 'bold ' + Math.round(H * 0.062) + 'px system-ui, sans-serif';
      ctx.fillText(G.banner, W / 2, H * 0.385);
      ctx.globalAlpha = 1;
    }

    // one-line hint
    if (G.hintT > 0) {
      ctx.globalAlpha = clamp(G.hintT, 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold ' + Math.round(H * 0.034) + 'px system-ui, sans-serif';
      ctx.fillText('Drag left to move · PUNCH to fight, grab & swipe to throw · JUMP to hop', W / 2, H * 0.20);
      ctx.globalAlpha = 1;
    }
  }

  function drawControls() {
    const Lo = layout();
    // stick
    const s = Input.stick;
    const bx = s.active ? s.ox : W * 0.16, by = s.active ? s.oy : H * 0.74;
    ctx.globalAlpha = s.active ? 0.5 : 0.22;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, H * 0.008);
    ctx.beginPath(); ctx.arc(bx, by, Lo.stickR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(bx, by, Lo.stickR, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = s.active ? 0.85 : 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx + s.dx * Lo.stickR, by + s.dy * Lo.stickR, Lo.stickR * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    const btn = (b, label, col, on) => {
      ctx.globalAlpha = on ? 0.85 : 0.42;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (on ? 0.94 : 1), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(2, H * 0.006);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(b.r * 0.42) + 'px system-ui, sans-serif';
      ctx.fillText(label, b.x, b.y + b.r * 0.15);
      ctx.globalAlpha = 1;
    };
    btn(Lo.jump, 'JUMP', '#2f7bbf', Input.btn.jump);
    btn(Lo.punch, G.player && G.player.carry ? 'THROW' : 'PUNCH', '#c2402f', Input.btn.punch);
  }

  function drawOverlays() {
    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(255,60,60,' + (G.flash * 1.6) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (G.mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff6a6a';
      ctx.font = 'bold ' + Math.round(H * 0.13) + 'px system-ui, sans-serif';
      ctx.fillText('DOWN FOR GOOD', W / 2, H * 0.40);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(H * 0.055) + 'px system-ui, sans-serif';
      ctx.fillText('SCORE ' + G.score + '   BEST ' + G.best, W / 2, H * 0.55);
      ctx.fillStyle = '#ffe27a';
      ctx.font = 'bold ' + Math.round(H * 0.05) + 'px system-ui, sans-serif';
      ctx.fillText('TAP / PRESS ENTER TO RUN IT BACK', W / 2, H * 0.70);
    }
    if (G.mode === 'stageclear') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe27a';
      ctx.font = 'bold ' + Math.round(H * 0.10) + 'px system-ui, sans-serif';
      ctx.fillText('BLOCK IS OURS', W / 2, H * 0.46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(H * 0.05) + 'px system-ui, sans-serif';
      ctx.fillText('NEXT STAGE...', W / 2, H * 0.58);
    }
  }

  /* ================= loop ================= */
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    update(dt);

    const sh = FX.offset();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sh.x, sh.y);
    drawScene();
    ctx.restore();
    drawHUD();
    drawControls();
    drawOverlays();

    Input.endFrame();
    requestAnimationFrame(frame);
  }

  newGame();
  requestAnimationFrame(frame);
})();
