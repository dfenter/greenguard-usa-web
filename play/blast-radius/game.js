(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const wrap = document.getElementById('game-wrap');
  const bombButton = document.getElementById('bomb-button');
  const screen = document.getElementById('screen');
  const screenTitle = document.getElementById('screen-title');
  const screenCopy = document.getElementById('screen-copy');
  const restart = document.getElementById('restart');

  const COLS = 11;
  const ROWS = 15;
  const DIRS = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  const POWERUPS = ['radius', 'extra', 'speed', 'kick'];
  const COLORS = { radius: '#ffca5f', extra: '#68e0d1', speed: '#ff769c', kick: '#b38cff' };

  let width = 390;
  let height = 700;
  let pixelRatio = 1;
  let tile = 30;
  let boardX = 30;
  let boardY = 112;
  let boardW = COLS * tile;
  let boardH = ROWS * tile;
  let random = () => Math.random();
  let grid = [];
  let powerups = [];
  let bombs = [];
  let blasts = [];
  let particles = [];
  let enemies = [];
  let player = null;
  let level = 1;
  let score = 0;
  let best = readBest();
  let lives = 3;
  let state = 'playing';
  let stateTimer = 0;
  let banner = '';
  let bannerTimer = 0;
  let shake = 0;
  let lastTime = performance.now();
  let audio = null;
  const input = { active: false, held: false, dir: null, x: 0, y: 0, lastRepeat: 0 };

  function readBest() {
    try { return Number(localStorage.getItem('blast-radius-best')) || 0; } catch (_) { return 0; }
  }

  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('blast-radius-best', String(best)); } catch (_) {}
  }

  function makeRandom(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    width = Math.max(280, rect.width || window.innerWidth);
    height = Math.max(560, rect.height || window.innerHeight);
    pixelRatio = Math.min(2, window.devicePixelRatio || 1, 960 / Math.max(width, height));
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const usableHeight = Math.max(380, height - 190);
    tile = Math.max(22, Math.min((width - 28) / COLS, usableHeight / ROWS));
    boardW = COLS * tile;
    boardH = ROWS * tile;
    boardX = (width - boardW) / 2;
    boardY = Math.max(98, (height - boardH) * 0.39);
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function center(x, y) {
    return { x: boardX + (x + 0.5) * tile, y: boardY + (y + 0.5) * tile };
  }

  function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

  function bombAt(x, y) {
    for (let i = 0; i < bombs.length; i += 1) {
      if (bombs[i].x === x && bombs[i].y === y && !bombs[i].exploded) return bombs[i];
    }
    return null;
  }

  function blocked(x, y, withBombs = true) {
    return !inBounds(x, y) || grid[y][x] !== 0 || (withBombs && bombAt(x, y));
  }

  function showBanner(text, time = 1.1) {
    banner = text;
    bannerTimer = time;
  }

  function newGame() {
    level = 1;
    score = 0;
    lives = 3;
    state = 'playing';
    stateTimer = 0;
    banner = '';
    bannerTimer = 0;
    shake = 0;
    input.active = false; input.held = false; input.dir = null; input.x = 0; input.y = 0; input.lastRepeat = 0;
    blasts = [];
    particles = [];
    screen.hidden = true;
    buildLevel();
    ensureAudio();
  }

  function buildLevel() {
    random = makeRandom((0xB17A5E + level * 0x9E3779B9) >>> 0);
    grid = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) return 2;
      if (x % 2 === 0 && y % 2 === 0) return 2;
      return random() < Math.min(0.72, 0.51 + level * 0.022) ? 1 : 0;
    }));
    const safe = [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3]];
    safe.forEach(([x, y]) => { if (inBounds(x, y) && grid[y][x] !== 2) grid[y][x] = 0; });
    powerups = [];
    for (let y = 1; y < ROWS - 1; y += 1) {
      for (let x = 1; x < COLS - 1; x += 1) {
        if (grid[y][x] === 1 && random() < 0.19) powerups.push({ x, y, type: POWERUPS[Math.floor(random() * POWERUPS.length)], visible: false });
      }
    }
    bombs = [];
    enemies = [];
    player = { x: 1, y: 1, fromX: 1, fromY: 1, toX: 1, toY: 1, moveT: 1, moveDur: 0.12, nextDir: null, radius: 2, bombsMax: 1, speed: 1, kick: false, invuln: 0 };
    const candidates = [];
    for (let y = 1; y < ROWS - 1; y += 1) {
      for (let x = 1; x < COLS - 1; x += 1) {
        if (grid[y][x] === 0 && Math.abs(x - 1) + Math.abs(y - 1) > 7) candidates.push({ x, y });
      }
    }
    const enemyCount = Math.min(5, 3 + Math.floor((level - 1) / 2));
    const enemyTypes = ['wanderer', 'hunter', 'bomber', 'hunter', 'bomber'];
    for (let i = 0; i < enemyCount && candidates.length; i += 1) {
      const index = Math.floor(random() * candidates.length);
      const spot = candidates.splice(index, 1)[0];
      enemies.push({ x: spot.x, y: spot.y, type: enemyTypes[i], timer: random() * 0.3, cooldown: 0, bombTimer: 2 + random() * 2, dir: DIRS[Math.floor(random() * DIRS.length)] });
    }
    showBanner('SECTOR ' + String(level).padStart(2, '0'), 1.3);
  }

  function requestMove(dx, dy) {
    if (state !== 'playing' || !player) return;
    player.nextDir = { dx, dy };
    tryPlayerStep();
  }

  function tryPlayerStep() {
    if (!player || player.moveT < 1 || !player.nextDir || state !== 'playing') return;
    const dir = player.nextDir;
    player.nextDir = null;
    const x = player.x + dir.dx;
    const y = player.y + dir.dy;
    const bomb = bombAt(x, y);
    if (bomb) {
      if (player.kick && kickBomb(bomb, dir.dx, dir.dy)) {
        startPlayerMove(x, y);
      } else {
        burstAt(x, y, '#ffca5f', 2);
      }
      return;
    }
    if (blocked(x, y, false)) {
      burstAt(player.x + dir.dx * 0.35, player.y + dir.dy * 0.35, '#53747b', 1);
      return;
    }
    startPlayerMove(x, y);
  }

  function startPlayerMove(x, y) {
    player.fromX = player.x;
    player.fromY = player.y;
    player.toX = x;
    player.toY = y;
    player.moveT = 0;
    player.moveDur = Math.max(0.055, 0.14 / player.speed);
  }

  function kickBomb(bomb, dx, dy) {
    let x = bomb.x + dx;
    let y = bomb.y + dy;
    if (blocked(x, y)) return false;
    bomb.x = x;
    bomb.y = y;
    bomb.slide = { dx, dy, time: 0.12 };
    burstAt(x, y, '#b38cff', 4);
    beep(280, 0.06, 'triangle');
    return true;
  }

  function placeBomb() {
    ensureAudio();
    if (state !== 'playing' || !player || player.moveT < 1) return;
    if (bombs.filter((bomb) => bomb.owner === 'player' && !bomb.exploded).length >= player.bombsMax) {
      burstAt(player.x, player.y, '#ff769c', 2);
      return;
    }
    if (bombAt(player.x, player.y)) return;
    bombs.push({ x: player.x, y: player.y, fuse: Math.max(0.92, 1.32 - level * 0.015), radius: player.radius, owner: 'player', exploded: false, phase: random() * Math.PI * 2 });
    burstAt(player.x, player.y, '#ffca5f', 5);
    beep(160, 0.07, 'sine');
  }

  function placeEnemyBomb(enemy) {
    if (bombAt(enemy.x, enemy.y)) return;
    bombs.push({ x: enemy.x, y: enemy.y, fuse: 1.65, radius: Math.min(3, 1 + Math.floor(level / 3)), owner: 'enemy', exploded: false, phase: random() * Math.PI * 2 });
    burstAt(enemy.x, enemy.y, '#ff6d67', 4);
    beep(110, 0.045, 'square');
  }

  function detonateBomb(bomb) {
    if (!bomb || bomb.exploded) return;
    bomb.exploded = true;
    bombs = bombs.filter((item) => item !== bomb);
    const cells = [{ x: bomb.x, y: bomb.y }];
    for (const dir of DIRS) {
      for (let distance = 1; distance <= bomb.radius; distance += 1) {
        const x = bomb.x + dir.dx * distance;
        const y = bomb.y + dir.dy * distance;
        if (!inBounds(x, y) || grid[y][x] === 2) break;
        cells.push({ x, y });
        if (grid[y][x] === 1) break;
      }
    }
    for (const cell of cells) {
      if (grid[cell.y][cell.x] === 1) {
        grid[cell.y][cell.x] = 0;
        score += 10;
        const boost = powerups.find((item) => item.x === cell.x && item.y === cell.y);
        if (boost) boost.visible = true;
        burstAt(cell.x, cell.y, '#d7a46c', 8);
      }
      const next = bombAt(cell.x, cell.y);
      if (next) detonateBomb(next);
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        if (enemies[i].x === cell.x && enemies[i].y === cell.y) defeatEnemy(i);
      }
      if (player && player.x === cell.x && player.y === cell.y) harmPlayer();
    }
    blasts.push({ cells, life: 0.38, max: 0.38, owner: bomb.owner });
    shake = Math.max(shake, bomb.owner === 'player' ? 6 : 4);
    beep(bomb.owner === 'player' ? 70 : 55, 0.1, 'sawtooth');
    checkClear();
  }

  function defeatEnemy(index) {
    const enemy = enemies[index];
    if (!enemy) return;
    score += 100;
    burstAt(enemy.x, enemy.y, enemy.type === 'bomber' ? '#ff6d67' : '#68e0d1', 16);
    enemies.splice(index, 1);
    beep(420 + enemies.length * 25, 0.09, 'triangle');
  }

  function harmPlayer() {
    if (!player || player.invuln > 0 || state !== 'playing') return;
    lives -= 1;
    saveBest();
    player.invuln = 1.1;
    state = lives > 0 ? 'lifeLost' : 'gameover';
    stateTimer = lives > 0 ? 0.85 : 0;
    shake = 12;
    burstAt(player.x, player.y, '#ff769c', 22);
    beep(75, 0.2, 'sawtooth');
    if (state === 'gameover') openScreen();
  }

  function collectPowerup() {
    const boost = powerups.find((item) => item.visible && item.x === player.x && item.y === player.y);
    if (!boost) return;
    boost.visible = false;
    score += 35;
    if (boost.type === 'radius') player.radius = Math.min(5, player.radius + 1);
    if (boost.type === 'extra') player.bombsMax = Math.min(3, player.bombsMax + 1);
    if (boost.type === 'speed') player.speed = Math.min(1.8, player.speed + 0.25);
    if (boost.type === 'kick') player.kick = true;
    showBanner(boost.type.toUpperCase() + ' BOOST', 0.9);
    burstAt(player.x, player.y, COLORS[boost.type], 14);
    beep(650, 0.12, 'sine');
  }

  function updatePlayer(dt) {
    if (player.invuln > 0) player.invuln -= dt;
    if (player.moveT < 1) {
      player.moveT = Math.min(1, player.moveT + dt / player.moveDur);
      if (player.moveT >= 1) {
        player.x = player.toX;
        player.y = player.toY;
        collectPowerup();
        checkContact();
        tryPlayerStep();
      }
    } else if (input.held && input.dir && performance.now() - input.lastRepeat > 145) {
      input.lastRepeat = performance.now();
      requestMove(input.dir.dx, input.dir.dy);
    }
  }

  function getPlayerDrawPosition() {
    if (!player || player.moveT >= 1) return { x: player.x, y: player.y };
    const t = player.moveT * player.moveT * (3 - 2 * player.moveT);
    return { x: player.fromX + (player.toX - player.fromX) * t, y: player.fromY + (player.toY - player.fromY) * t };
  }

  function enemyStep(enemy, dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    const x = enemy.x + dx;
    const y = enemy.y + dy;
    if (blocked(x, y) || enemies.some((other) => other !== enemy && other.x === x && other.y === y)) return false;
    enemy.x = x;
    enemy.y = y;
    enemy.dir = { dx, dy };
    return true;
  }

  function nextStepToward(startX, startY, targetX, targetY) {
    const queue = [{ x: startX, y: startY }];
    const seen = new Set([startX + ',' + startY]);
    const parent = new Map();
    while (queue.length) {
      const current = queue.shift();
      if (current.x === targetX && current.y === targetY) break;
      for (const dir of DIRS) {
        const x = current.x + dir.dx;
        const y = current.y + dir.dy;
        const key = x + ',' + y;
        if (seen.has(key) || blocked(x, y) || enemies.some((other) => other.x === x && other.y === y)) continue;
        seen.add(key);
        parent.set(key, { x: current.x, y: current.y });
        queue.push({ x, y });
      }
    }
    let key = targetX + ',' + targetY;
    if (!seen.has(key)) return null;
    while (parent.has(key)) {
      const parentCell = parent.get(key);
      if (parentCell.x === startX && parentCell.y === startY) break;
      key = parentCell.x + ',' + parentCell.y;
    }
    const step = key.split(',').map(Number);
    return { dx: step[0] - startX, dy: step[1] - startY };
  }

  function updateEnemies(dt) {
    for (const enemy of enemies.slice()) {
      enemy.timer -= dt;
      enemy.cooldown -= dt;
      enemy.bombTimer -= dt;
      if (enemy.timer > 0 || state !== 'playing') continue;
      enemy.timer = Math.max(0.21, 0.46 - level * 0.012) + random() * 0.12;
      if (enemy.type === 'bomber' && enemy.bombTimer <= 0 && !bombAt(enemy.x, enemy.y)) {
        enemy.bombTimer = Math.max(1.1, 2.4 - level * 0.08);
        placeEnemyBomb(enemy);
      }
      let step = null;
      if (enemy.type === 'wanderer') {
        if (random() < 0.55 && !blocked(enemy.x + enemy.dir.dx, enemy.y + enemy.dir.dy)) step = enemy.dir;
        else step = DIRS[Math.floor(random() * DIRS.length)];
      } else {
        step = nextStepToward(enemy.x, enemy.y, player.x, player.y) || DIRS[Math.floor(random() * DIRS.length)];
        if (enemy.type === 'bomber' && Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y) > 6 && random() < 0.3) step = DIRS[Math.floor(random() * DIRS.length)];
      }
      enemyStep(enemy, step.dx, step.dy);
      checkContact();
    }
  }

  function checkContact() {
    if (!player || state !== 'playing' || player.invuln > 0) return;
    const p = getPlayerDrawPosition();
    if (enemies.some((enemy) => Math.abs(enemy.x - p.x) < 0.55 && Math.abs(enemy.y - p.y) < 0.55)) harmPlayer();
    for (const blast of blasts) {
      if (blast.life <= 0) continue;
      if (blast.cells.some((cell) => cell.x === player.x && cell.y === player.y)) { harmPlayer(); break; }
    }
  }

  function checkClear() {
    if (state === 'playing' && enemies.length === 0) {
      score += 300;
      saveBest();
      state = 'levelclear';
      stateTimer = 1.15;
      showBanner('ARENA CLEARED  +300', 1.15);
      beep(520, 0.16, 'triangle');
    }
  }

  function update(dt) {
    const safeDt = Math.min(0.05, dt);
    shake = Math.max(0, shake - safeDt * 22);
    bannerTimer = Math.max(0, bannerTimer - safeDt);
    for (const particle of particles) {
      particle.life -= safeDt;
      particle.x += particle.vx * safeDt;
      particle.y += particle.vy * safeDt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
    }
    particles = particles.filter((particle) => particle.life > 0);
    for (const blast of blasts) blast.life -= safeDt;
    blasts = blasts.filter((blast) => blast.life > 0);

    if (state === 'playing') {
      updatePlayer(safeDt);
      for (const bomb of bombs.slice()) {
        bomb.fuse -= safeDt;
        if (bomb.slide) bomb.slide.time -= safeDt;
        if (bomb.fuse <= 0) detonateBomb(bomb);
      }
      updateEnemies(safeDt);
      checkContact();
      checkClear();
    } else if (state === 'lifeLost') {
      stateTimer -= safeDt;
      if (stateTimer <= 0) { state = 'playing'; buildLevel(); }
    } else if (state === 'levelclear') {
      stateTimer -= safeDt;
      if (stateTimer <= 0) { level += 1; state = 'playing'; buildLevel(); }
    }
  }

  function burstAt(x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) {
      const angle = random() * Math.PI * 2;
      const speed = 0.45 + random() * 1.6;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, size: 1.5 + random() * 2.8, life: 0.34 + random() * 0.48, max: 0.82 });
    }
    if (particles.length > 320) particles.splice(0, particles.length - 320);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0a1a24');
    gradient.addColorStop(0.55, '#07131c');
    gradient.addColorStop(1, '#050d14');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#68e0d1';
    for (let i = 0; i < 16; i += 1) {
      const x = (i * 97 + 38) % width;
      const y = (i * 61 + 18) % height;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawHeader() {
    ctx.fillStyle = '#8ba9ae';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.letterSpacing = '0.18em';
    ctx.fillText('BLAST', 18, 27);
    ctx.fillStyle = '#68e0d1';
    ctx.fillText('RADIUS', 67, 27);
    ctx.letterSpacing = 'normal';
    ctx.fillStyle = '#47636b';
    ctx.fillRect(18, 37, width - 36, 1);
    ctx.fillStyle = '#d4e5e2';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(String(score).padStart(5, '0'), 18, 63);
    ctx.fillStyle = '#78969b';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText('SCORE', 20, 78);
    ctx.fillStyle = '#d4e5e2';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText('A' + String(level).padStart(2, '0'), width / 2 - 14, 58);
    ctx.fillStyle = '#78969b';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText('ARENA', width / 2 - 15, 74);
    ctx.fillStyle = '#78969b';
    ctx.fillText('BEST ' + String(best).padStart(5, '0'), width - 80, 25);
    ctx.fillStyle = '#ff769c';
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = i < lives ? 1 : 0.18;
      ctx.beginPath();
      ctx.arc(width - 28 - i * 16, 56, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawArena() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.shadowColor = '#000b';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#050d13';
    roundRect(boardX - 8, boardY - 8, boardW + 16, boardH + 16, 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const px = boardX + x * tile;
        const py = boardY + y * tile;
        const value = grid[y][x];
        ctx.fillStyle = value === 2 ? '#18323c' : '#0d222b';
        ctx.fillRect(px + 1, py + 1, tile - 2, tile - 2);
        if (value === 0) {
          ctx.fillStyle = (x + y) % 2 ? '#102730' : '#0e242d';
          ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
          ctx.fillStyle = '#21404a';
          ctx.globalAlpha = 0.28;
          ctx.fillRect(px + tile * 0.22, py + tile * 0.22, 2, 2);
          ctx.globalAlpha = 1;
        } else if (value === 1) {
          const soft = ctx.createLinearGradient(px, py, px + tile, py + tile);
          soft.addColorStop(0, '#52616a');
          soft.addColorStop(0.45, '#344850');
          soft.addColorStop(1, '#243940');
          ctx.fillStyle = soft;
          roundRect(px + 3, py + 3, tile - 6, tile - 6, 5);
          ctx.fill();
          ctx.fillStyle = '#77878b';
          ctx.globalAlpha = 0.35;
          ctx.fillRect(px + tile * 0.25, py + tile * 0.29, tile * 0.48, 2);
          ctx.fillRect(px + tile * 0.25, py + tile * 0.43, tile * 0.3, 2);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = '#294b56';
          ctx.fillRect(px + 4, py + 4, tile - 8, tile - 8);
          ctx.fillStyle = '#4f7a80';
          ctx.globalAlpha = 0.55;
          ctx.fillRect(px + 7, py + 7, tile - 14, 2);
          ctx.fillRect(px + 7, py + 7, 2, tile - 14);
          ctx.globalAlpha = 1;
        }
      }
    }
    for (const boost of powerups) if (boost.visible && grid[boost.y][boost.x] === 0) drawPowerup(boost);
    for (const bomb of bombs) drawBomb(bomb);
    for (const blast of blasts) drawBlast(blast);
    for (const enemy of enemies) drawEnemy(enemy);
    drawPlayer();
    for (const particle of particles) drawParticle(particle);
    ctx.restore();
  }

  function drawPowerup(boost) {
    const p = center(boost.x, boost.y);
    const pulse = 1 + Math.sin(performance.now() / 180 + boost.x) * 0.08;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = COLORS[boost.type];
    ctx.shadowBlur = 14;
    ctx.fillStyle = COLORS[boost.type];
    ctx.beginPath();
    ctx.moveTo(0, -tile * 0.27);
    ctx.lineTo(tile * 0.23, 0);
    ctx.lineTo(0, tile * 0.27);
    ctx.lineTo(-tile * 0.23, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b1b23';
    ctx.font = '900 ' + Math.max(9, tile * 0.25) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(boost.type === 'radius' ? '+' : boost.type === 'extra' ? '·' : boost.type === 'speed' ? '»' : '↗', 0, 0);
    ctx.restore();
  }

  function drawBomb(bomb) {
    const p = center(bomb.x, bomb.y);
    const pulse = 1 + Math.sin(performance.now() / 110 + bomb.phase) * 0.08;
    const color = bomb.owner === 'player' ? '#ffca5f' : '#ff6d67';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#08141b';
    ctx.beginPath();
    ctx.arc(0, 2, tile * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, tile * 0.07);
    ctx.stroke();
    ctx.strokeStyle = '#f7e1a4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, -tile * 0.2);
    ctx.quadraticCurveTo(tile * 0.18, -tile * 0.39, tile * 0.13, -tile * 0.18);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 2, tile * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBlast(blast) {
    const alpha = Math.min(1, blast.life / 0.12, (blast.max - blast.life) / 0.07 + 0.35);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    for (const cell of blast.cells) {
      const px = boardX + cell.x * tile;
      const py = boardY + cell.y * tile;
      const gradient = ctx.createRadialGradient(px + tile / 2, py + tile / 2, 1, px + tile / 2, py + tile / 2, tile * 0.7);
      gradient.addColorStop(0, '#fff6c0');
      gradient.addColorStop(0.28, blast.owner === 'enemy' ? '#ff6d67' : '#ffca5f');
      gradient.addColorStop(1, '#ff704000');
      ctx.fillStyle = gradient;
      ctx.fillRect(px - 2, py - 2, tile + 4, tile + 4);
      ctx.fillStyle = '#fff5b0';
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(px + tile * 0.38, py + tile * 0.08, tile * 0.24, tile * 0.84);
      ctx.globalAlpha /= 0.55;
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const p = center(enemy.x, enemy.y);
    const color = enemy.type === 'wanderer' ? '#b38cff' : enemy.type === 'hunter' ? '#68e0d1' : '#ff6d67';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (enemy.type === 'hunter') {
      ctx.moveTo(0, -tile * 0.3); ctx.lineTo(tile * 0.27, 0); ctx.lineTo(0, tile * 0.3); ctx.lineTo(-tile * 0.27, 0);
    } else if (enemy.type === 'bomber') {
      ctx.arc(0, 0, tile * 0.28, 0, Math.PI * 2);
    } else {
      ctx.rect(-tile * 0.24, -tile * 0.24, tile * 0.48, tile * 0.48);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#09202a';
    ctx.beginPath(); ctx.arc(-tile * 0.09, -tile * 0.04, tile * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(tile * 0.09, -tile * 0.04, tile * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9ffff';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-tile * 0.12, tile * 0.13, tile * 0.24, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawPlayer() {
    if (!player) return;
    const p = getPlayerDrawPosition();
    const point = center(p.x, p.y);
    if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) return;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.shadowColor = '#68e0d1';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#68e0d1';
    ctx.beginPath();
    ctx.moveTo(0, -tile * 0.34);
    ctx.lineTo(tile * 0.28, tile * 0.25);
    ctx.lineTo(0, tile * 0.16);
    ctx.lineTo(-tile * 0.28, tile * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a242c';
    ctx.beginPath(); ctx.arc(-tile * 0.08, -tile * 0.02, tile * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(tile * 0.08, -tile * 0.02, tile * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c6fff1';
    ctx.fillRect(-tile * 0.1, tile * 0.13, tile * 0.2, 2);
    ctx.restore();
  }

  function drawParticle(particle) {
    const p = center(particle.x, particle.y);
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, particle.size * Math.max(0.4, particle.life / particle.max), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    if (!bannerTimer) return;
    const alpha = Math.min(1, bannerTimer * 3, 1.1 - bannerTimer + 0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = '#c5e8e4';
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.16em';
    ctx.fillText(banner, width / 2, boardY - 21);
    ctx.restore();
  }

  function drawStateMessage() {
    if (state === 'lifeLost') {
      ctx.save();
      ctx.fillStyle = '#ff769c';
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SIGNAL LOST', width / 2, boardY + boardH + 30);
      ctx.restore();
    } else if (state === 'levelclear') {
      ctx.save();
      ctx.fillStyle = '#68e0d1';
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT ARENA LOADING', width / 2, boardY + boardH + 30);
      ctx.restore();
    }
  }

  function draw() {
    drawBackground();
    drawHeader();
    drawArena();
    drawBanner();
    drawStateMessage();
  }

  function frame(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function openScreen() {
    screenTitle.textContent = 'RUN ENDED';
    screenCopy.textContent = 'Score ' + score + ' · Best ' + best + ' · Arena ' + level;
    screen.hidden = false;
  }

  function ensureAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
  }

  function beep(frequency, duration, type) {
    if (!audio) return;
    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, audio.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration + 0.02);
    } catch (_) {}
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches ? event.touches[0] || event.changedTouches[0] : event;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  }

  function buttonHit(point) {
    return point.x > width - 112 && point.y > height - 125;
  }

  function handleDown(event) {
    event.preventDefault();
    ensureAudio();
    const point = pointFromEvent(event);
    if (buttonHit(point)) { placeBomb(); return; }
    input.active = true;
    input.held = true;
    input.dir = null;
    input.x = point.x;
    input.y = point.y;
  }

  function handleMove(event) {
    if (!input.active) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const dx = point.x - input.x;
    const dy = point.y - input.y;
    if (Math.abs(dx) + Math.abs(dy) < 12) return;
    input.dir = Math.abs(dx) > Math.abs(dy) ? { dx: dx > 0 ? 1 : -1, dy: 0 } : { dx: 0, dy: dy > 0 ? 1 : -1 };
    input.lastRepeat = performance.now();
    input.x = point.x;
    input.y = point.y;
    requestMove(input.dir.dx, input.dir.dy);
  }

  function handleUp(event) {
    if (event) event.preventDefault();
    input.active = false;
    input.held = false;
    input.dir = null;
    input.x = 0;
    input.y = 0;
    input.lastRepeat = 0;
  }

  function handleKey(event) {
    ensureAudio();
    const key = event.key.toLowerCase();
    if (key === ' ' || key === 'enter') { event.preventDefault(); if (state === 'gameover') newGame(); else placeBomb(); return; }
    const directions = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    if (directions[key]) { event.preventDefault(); requestMove(directions[key][0], directions[key][1]); }
  }

  bombButton.addEventListener('click', (event) => { event.preventDefault(); placeBomb(); });
  restart.addEventListener('click', newGame);
  canvas.addEventListener('touchstart', handleDown, { passive: false });
  canvas.addEventListener('touchmove', handleMove, { passive: false });
  canvas.addEventListener('touchend', handleUp, { passive: false });
  canvas.addEventListener('touchcancel', handleUp, { passive: false });
  canvas.addEventListener('mousedown', handleDown);
  canvas.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleUp);
  window.addEventListener('blur', handleUp);
  window.addEventListener('keydown', handleKey);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  resize();
  newGame();
  requestAnimationFrame(frame);
})();
