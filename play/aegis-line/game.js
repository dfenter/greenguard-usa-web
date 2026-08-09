(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d", { alpha: false });
  var W = 390;
  var H = 700;
  var lanes = [205, 335, 465];
  var STORAGE_KEY = "aegis-line-progress-v1";
  var MAX_PARTICLES = 180;
  var MAX_FLOATERS = 28;
  var MAX_SHOTS = 34;
  var MAX_ENEMIES = 30;
  var MAX_POINTERS = 8;
  var roleOrder = ["breaker", "sustain", "burst"];
  var pointers = new Map();
  var keys = new Set();
  var timers = new Set();
  var queuedActions = [];
  var stick = { x: 0, y: 0 };
  var stars = [];
  var view = { ratio: 1, fit: 1, offX: 0, offY: 0 };
  var rotated = false;
  var audio = null;
  var audioReady = false;
  var nextEnemyId = 1;
  var lastFrame = 0;

  var PILOTS = [
    { id: "venn", name: "Venn", role: "breaker", color: "#ff6b57", alt: "#ffb06c", letter: "V" },
    { id: "ossa", name: "Ossa", role: "sustain", color: "#51d6a0", alt: "#8af6c8", letter: "O" },
    { id: "kite", name: "Kite", role: "burst", color: "#ffc857", alt: "#ffe7a0", letter: "K" },
    { id: "rook", name: "Rook", role: "breaker", color: "#6da8ff", alt: "#b2d3ff", letter: "R" },
    { id: "hush", name: "Hush", role: "sustain", color: "#df7bd8", alt: "#f6b9ec", letter: "H" },
    { id: "nova", name: "Nova", role: "burst", color: "#a98bff", alt: "#d8caff", letter: "N" }
  ];
  var PILOT_BY_ID = {};
  PILOTS.forEach(function (pilot) { PILOT_BY_ID[pilot.id] = pilot; });

  function defaults() {
    return { unlocked: ["venn", "ossa", "kite"], active: ["venn", "ossa", "kite"], skins: [], bestScore: 0, bestStage: 1, reached: 1 };
  }

  function validList(value, allowed) {
    if (!Array.isArray(value)) return [];
    var out = [];
    value.forEach(function (item) {
      if (typeof item === "string" && allowed.indexOf(item) !== -1 && out.indexOf(item) === -1) out.push(item);
    });
    return out.slice(0, 12);
  }

  function loadProgress() {
    var base = defaults();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (typeof raw !== "string" || !raw) return base;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
      var ids = PILOTS.map(function (pilot) { return pilot.id; });
      var skinIds = ["aurora", "ember", "chrome"];
      var unlocked = validList(parsed.unlocked, ids);
      base.unlocked.forEach(function (id) { if (unlocked.indexOf(id) === -1) unlocked.push(id); });
      var bestScore = Number(parsed.bestScore);
      var bestStage = Number(parsed.bestStage);
      var reached = Number(parsed.reached);
      var active = validList(parsed.active, ids);
      base.unlocked = unlocked.slice(0, 6);
      if (active.length === 3 && active.every(function (id) { return base.unlocked.indexOf(id) !== -1; })) base.active = active;
      base.skins = validList(parsed.skins, skinIds);
      base.bestScore = Number.isFinite(bestScore) && bestScore >= 0 ? Math.floor(bestScore) : 0;
      base.bestStage = Number.isFinite(bestStage) ? Math.max(1, Math.min(12, Math.floor(bestStage))) : 1;
      base.reached = Number.isFinite(reached) ? Math.max(1, Math.min(12, Math.floor(reached))) : base.bestStage;
      return base;
    } catch (error) {
      return base;
    }
  }

  var progress = loadProgress();

  function saveProgress() {
    try {
      var payload = {
        unlocked: progress.unlocked.filter(function (id, index, all) { return PILOT_BY_ID[id] && all.indexOf(id) === index; }).slice(0, 6),
        active: activeIds.filter(function (id, index, all) { return PILOT_BY_ID[id] && all.indexOf(id) === index; }).slice(0, 3),
        skins: progress.skins.filter(function (id, index, all) { return ["aurora", "ember", "chrome"].indexOf(id) !== -1 && all.indexOf(id) === index; }).slice(0, 3),
        bestScore: Number.isFinite(progress.bestScore) ? Math.max(0, Math.floor(progress.bestScore)) : 0,
        bestStage: Number.isFinite(progress.bestStage) ? Math.max(1, Math.min(12, Math.floor(progress.bestStage))) : 1,
        reached: Number.isFinite(progress.reached) ? Math.max(1, Math.min(12, Math.floor(progress.reached))) : 1
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      /* Private mode and quota failures are harmless to the run. */
    }
  }

  function schedule(fn, delay) {
    var id = setTimeout(function () {
      timers.delete(id);
      fn();
    }, delay);
    timers.add(id);
    return id;
  }

  function cancelTimers() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers.clear();
  }

  function trimPush(list, value, limit) {
    list.push(value);
    if (list.length > limit) list.splice(0, list.length - limit);
  }

  function addParticle(x, y, color, speed, size, life) {
    var angle = Math.random() * Math.PI * 2;
    var velocity = speed * (0.45 + Math.random() * 0.75);
    trimPush(particles, {
      x: x, y: y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      color: color, size: size * (0.5 + Math.random() * 0.9), life: life, maxLife: life,
      drag: 0.94
    }, MAX_PARTICLES);
  }

  function burstParticles(x, y, color, count) {
    var amount = Math.min(24, Math.max(1, count || 8));
    for (var i = 0; i < amount; i++) addParticle(x, y, color, 55 + Math.random() * 100, 2 + Math.random() * 3, 0.25 + Math.random() * 0.35);
  }

  function addFloater(x, y, message, color) {
    trimPush(floaters, { x: x, y: y, message: message, color: color, life: 0.9, maxLife: 0.9 }, MAX_FLOATERS);
  }

  function addShot(x1, y1, x2, y2, color, crit) {
    trimPush(shots, { x1: x1, y1: y1, x2: x2, y2: y2, color: color, crit: !!crit, life: 0.13, maxLife: 0.13 }, MAX_SHOTS);
  }

  function resize() {
    var width = Math.max(1, window.innerWidth);
    var height = Math.max(1, window.innerHeight);
    var dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    var cap = Math.min(1, 960 / Math.max(width * dpr, height * dpr));
    view.ratio = dpr * cap;
    canvas.width = Math.max(1, Math.round(width * view.ratio));
    canvas.height = Math.max(1, Math.round(height * view.ratio));
    view.fit = Math.min(width / W, height / H);
    view.offX = (width - W * view.fit) / 2;
    view.offY = (height - H * view.fit) / 2;
    var nextRotated = width > height;
    if (nextRotated && !rotated) clearInput();
    rotated = nextRotated;
  }

  function logicalPoint(event) {
    var rect = canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left - view.offX) / Math.max(0.001, view.fit);
    var y = (event.clientY - rect.top - view.offY) / Math.max(0.001, view.fit);
    return { x: x, y: y };
  }

  function clearInput() {
    pointers.forEach(function (pointer) {
      try { canvas.releasePointerCapture(pointer.id); } catch (error) { /* no capture */ }
    });
    pointers.clear();
    keys.clear();
    queuedActions.length = 0;
    stick.x = 0;
    stick.y = 0;
  }

  function unlockAudio() {
    if (audioReady) {
      if (audio && audio.state === "suspended") audio.resume().catch(function () {});
      return;
    }
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audio = new AudioContext();
      audioReady = true;
      audio.resume().catch(function () {});
    } catch (error) {
      audio = null;
    }
  }

  function tone(frequency, duration, type, volume) {
    if (!audioReady || !audio) return;
    try {
      var oscillator = audio.createOscillator();
      var gain = audio.createGain();
      oscillator.type = type || "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume || 0.035, audio.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration + 0.02);
    } catch (error) { /* audio is a bonus */ }
  }

  function sound(kind) {
    if (kind === "hit") tone(180, 0.06, "sawtooth", 0.025);
    if (kind === "crit") { tone(560, 0.08, "square", 0.035); schedule(function () { tone(760, 0.08, "square", 0.028); }, 35); }
    if (kind === "burst") tone(330, 0.12, "triangle", 0.04);
    if (kind === "chain") { tone(420, 0.13, "triangle", 0.04); schedule(function () { tone(660, 0.18, "triangle", 0.035); }, 55); }
    if (kind === "down") tone(80, 0.25, "sawtooth", 0.04);
    if (kind === "stage") tone(260, 0.18, "triangle", 0.035);
  }

  function pilotFor(id) { return PILOT_BY_ID[id] || PILOTS[0]; }

  function makeMember(id) {
    var pilot = pilotFor(id);
    return {
      id: id,
      name: pilot.name,
      role: pilot.role,
      color: pilot.color,
      alt: pilot.alt,
      letter: pilot.letter,
      hp: 100,
      maxHp: 100,
      fireTimer: 0.2,
      healTimer: 2.2,
      targetId: 0,
      buff: 0,
      down: false,
      jolt: 0
    };
  }

  var activeIds = progress.active && progress.active.length === 3 ? progress.active.slice(0, 3) : ["venn", "ossa", "kite"];
  var squad = [];
  var enemies = [];
  var particles = [];
  var floaters = [];
  var shots = [];
  var state = "intro";
  var rosterOpen = false;
  var selectedMember = 0;
  var stage = 1;
  var stageGoal = 0;
  var stageSpawned = 0;
  var stageKills = 0;
  var spawnTimer = 0;
  var transition = 0;
  var score = 0;
  var runTime = 0;
  var burstIndex = 0;
  var burstTimer = 0;
  var chainTimer = 0;
  var toast = "";
  var toastColor = "#cfe7ff";
  var toastTimer = 0;
  var shake = 0;

  function setupSquad() {
    squad = activeIds.map(function (id) { return makeMember(id); });
  }

  function enforceUnlocks(targetStage) {
    var milestone = { 3: "rook", 5: "hush", 7: "nova" };
    Object.keys(milestone).forEach(function (key) {
      if (targetStage >= Number(key) && progress.unlocked.indexOf(milestone[key]) === -1) {
        progress.unlocked.push(milestone[key]);
        var pilot = pilotFor(milestone[key]);
        toast = pilot.name + " joins the line";
        toastColor = pilot.color;
        toastTimer = 3;
        burstParticles(195, 300, pilot.color, 22);
      }
    });
    if (targetStage >= 4 && progress.skins.indexOf("aurora") === -1) progress.skins.push("aurora");
    if (targetStage >= 8 && progress.skins.indexOf("ember") === -1) progress.skins.push("ember");
    if (targetStage >= 12 && progress.skins.indexOf("chrome") === -1) progress.skins.push("chrome");
    progress.reached = Math.max(progress.reached, targetStage);
    progress.bestStage = Math.max(progress.bestStage, targetStage);
    saveProgress();
  }

  function goalFor(targetStage) {
    return targetStage % 4 === 0 ? 8 + targetStage : 5 + Math.floor(targetStage * 0.75);
  }

  function beginRun(startStage) {
    cancelTimers();
    clearInput();
    enemies.length = 0;
    particles.length = 0;
    floaters.length = 0;
    shots.length = 0;
    state = "play";
    rosterOpen = false;
    stage = Math.max(1, Math.min(12, Number(startStage) || 1));
    stageGoal = goalFor(stage);
    stageSpawned = 0;
    stageKills = 0;
    spawnTimer = 0.35;
    transition = 0;
    score = 0;
    runTime = 0;
    burstIndex = 0;
    burstTimer = 0;
    chainTimer = 0;
    shake = 0;
    setupSquad();
    enforceUnlocks(stage);
    toast = stage > 1 ? "RE-ENTERING STAGE " + String(stage).padStart(2, "0") : "TAP A MECH TO ASSIGN FIRE";
    toastColor = "#cfe7ff";
    toastTimer = 2.4;
    sound("stage");
  }

  function showState(nextState) {
    state = nextState;
    clearInput();
    cancelTimers();
    progress.bestScore = Math.max(progress.bestScore, Math.floor(score));
    progress.bestStage = Math.max(progress.bestStage, stage);
    saveProgress();
    if (nextState === "fail") { toast = "LINE LOST"; toastColor = "#ff6b57"; sound("down"); }
    if (nextState === "win") { enforceUnlocks(12); toast = "THE LINE HOLDS"; toastColor = "#8af6c8"; sound("chain"); }
  }

  function enterNextStage() {
    if (stage >= 12) {
      showState("win");
      return;
    }
    stage += 1;
    stageGoal = goalFor(stage);
    stageSpawned = 0;
    stageKills = 0;
    spawnTimer = 0.45;
    transition = 0;
    enforceUnlocks(stage);
    toast = "STAGE " + String(stage).padStart(2, "0") + " // ADVANCE";
    toastColor = "#cfe7ff";
    toastTimer = 2.1;
    sound("stage");
  }

  function randomKind() {
    var roll = Math.random();
    if (stage % 4 === 0 && stageSpawned === stageGoal - 1) return "warden";
    if (stage >= 7 && roll > 0.7) return "charger";
    if (stage >= 3 && roll > 0.45) return "brute";
    return "drone";
  }

  function spawnEnemy() {
    if (enemies.length >= MAX_ENEMIES) return;
    var kind = randomKind();
    var boss = kind === "warden";
    var lane = (stageSpawned + Math.floor(Math.random() * 2)) % 3;
    var hp = boss ? 150 + stage * 22 : kind === "brute" ? 52 + stage * 6 : kind === "charger" ? 38 + stage * 5 : 26 + stage * 4;
    var enemy = {
      id: nextEnemyId++, kind: kind, boss: boss, x: 425 + Math.random() * 26, y: lanes[lane], lane: lane,
      hp: hp, maxHp: hp, armor: boss ? 4 : kind === "brute" ? 2 : 1,
      weakTimer: Math.random() * 2.4, speed: boss ? 10 : kind === "charger" ? 40 + stage * 2 : kind === "brute" ? 20 : 28 + stage,
      attackTimer: 1.1 + Math.random() * 0.8, flash: 0, jolt: 0, dead: false
    };
    trimPush(enemies, enemy, MAX_ENEMIES);
    stageSpawned += 1;
  }

  function weakOpen(enemy) {
    return enemy.armor <= 0 || enemy.weakTimer > 1.32;
  }

  function weakPoint(enemy) {
    return { x: enemy.x + (enemy.boss ? 22 : 12), y: enemy.y - (enemy.boss ? 11 : 8) };
  }

  function enemyRadius(enemy) {
    return enemy.boss ? 48 : enemy.kind === "brute" ? 31 : 24;
  }

  function nearestEnemy() {
    var best = null;
    var distance = Infinity;
    enemies.forEach(function (enemy) {
      if (enemy.dead) return;
      var d = Math.abs(enemy.x - 150) + enemy.lane * 7;
      if (d < distance) { distance = d; best = enemy; }
    });
    return best;
  }

  function findEnemy(id) {
    for (var i = 0; i < enemies.length; i++) if (enemies[i].id === id && !enemies[i].dead) return enemies[i];
    return null;
  }

  function assignTarget(memberIndex, enemy) {
    if (!squad[memberIndex] || !enemy || enemy.dead) return;
    squad[memberIndex].targetId = enemy.id;
    selectedMember = memberIndex;
    toast = squad[memberIndex].name.toUpperCase() + " // TARGET LOCK";
    toastColor = squad[memberIndex].color;
    toastTimer = 1.1;
    burstParticles(enemy.x, enemy.y, squad[memberIndex].color, 5);
    sound("hit");
  }

  function pickTarget(member) {
    var current = findEnemy(member.targetId);
    if (current) return current;
    var target = nearestEnemy();
    if (target) member.targetId = target.id;
    return target;
  }

  function damageEnemy(enemy, amount, critical, sourceColor) {
    if (!enemy || enemy.dead) return;
    var value = amount;
    if (critical) {
      if (enemy.armor > 0) enemy.armor -= 1;
      value *= enemy.boss ? 1.8 : 2.5;
      score += 8;
      addFloater(enemy.x, enemy.y - enemyRadius(enemy) - 12, "CRIT", "#ffe7a0");
      burstParticles(enemy.x, enemy.y, "#ffe7a0", 14);
      sound("crit");
      shake = Math.max(shake, 3.5);
    } else {
      value *= enemy.armor > 0 ? 0.58 : 1;
    }
    enemy.hp -= value;
    enemy.flash = 0.12;
    enemy.jolt = critical ? 0.16 : 0.08;
    if (!critical) burstParticles(enemy.x, enemy.y, sourceColor || "#cfe7ff", 3);
    if (enemy.hp <= 0) {
      enemy.dead = true;
      stageKills += 1;
      score += enemy.boss ? 500 : enemy.kind === "brute" ? 90 : 45;
      burstParticles(enemy.x, enemy.y, enemy.boss ? "#ffe7a0" : (sourceColor || "#cfe7ff"), enemy.boss ? 34 : 14);
      addFloater(enemy.x, enemy.y - 45, enemy.boss ? "WARDEN DOWN" : "+" + (enemy.kind === "brute" ? 90 : 45), enemy.boss ? "#ffe7a0" : "#8af6c8");
      if (enemy.boss) {
        if (stage >= 4 && progress.skins.indexOf("aurora") === -1) progress.skins.push("aurora");
        if (stage >= 8 && progress.skins.indexOf("ember") === -1) progress.skins.push("ember");
        if (stage >= 12 && progress.skins.indexOf("chrome") === -1) progress.skins.push("chrome");
        saveProgress();
        shake = Math.max(shake, 9);
      }
    }
  }

  function damageMember(member, amount) {
    if (!member || member.down) return;
    member.hp = Math.max(0, member.hp - amount);
    member.jolt = 0.2;
    addFloater(75, lanes[squad.indexOf(member)] - 42, "-" + Math.ceil(amount), "#ff6b57");
    burstParticles(75, lanes[squad.indexOf(member)], "#ff6b57", 7);
    shake = Math.max(shake, 5);
    if (member.hp <= 0) {
      member.down = true;
      addFloater(75, lanes[squad.indexOf(member)] - 60, member.name.toUpperCase() + " DOWN", "#ff6b57");
      sound("down");
    } else sound("hit");
    if (squad.every(function (item) { return item.down; })) showState("fail");
  }

  function fireMember(member, index) {
    var target = pickTarget(member);
    if (!target) return;
    var damage = member.role === "breaker" ? 9 : member.role === "sustain" ? 5.5 : 7;
    if (member.buff > 0) damage *= 1.5;
    addShot(91, lanes[index], target.x, target.y, member.color, false);
    damageEnemy(target, damage, false, member.color);
    if (member.role === "sustain") {
      member.healTimer -= 0.45;
      if (member.healTimer <= 0) {
        member.healTimer = 2.3;
        squad.forEach(function (ally) { if (!ally.down) ally.hp = Math.min(ally.maxHp, ally.hp + 2.5); });
        burstParticles(76, lanes[index], member.color, 4);
      }
    }
  }

  function applyBurst(member, index) {
    if (!member || member.down) return;
    member.buff = Math.max(member.buff, member.role === "breaker" ? 4 : 3.5);
    if (member.role === "breaker") {
      enemies.forEach(function (enemy) { if (!enemy.dead) { enemy.armor = Math.max(0, enemy.armor - 1); damageEnemy(enemy, 8, false, member.color); } });
      addFloater(195, lanes[index] - 46, "ARMOR BREAK", member.color);
    } else if (member.role === "sustain") {
      squad.forEach(function (ally) { if (!ally.down) ally.hp = Math.min(ally.maxHp, ally.hp + 23); });
      addFloater(195, lanes[index] - 46, "REPAIR PULSE", member.color);
    } else {
      enemies.forEach(function (enemy) { if (!enemy.dead) damageEnemy(enemy, 17, false, member.color); });
      addFloater(195, lanes[index] - 46, "ARC SALVO", member.color);
    }
    burstParticles(91, lanes[index], member.color, 18);
    sound("burst");
  }

  function triggerBurst(index) {
    if (state !== "play") return;
    if (rosterOpen) {
      if (key.toLowerCase() === "r" || key === "Escape") { rosterOpen = false; clearInput(); }
      return;
    }
    var member = squad[index];
    if (!member || member.down) return;
    var role = member.role;
    var expected = roleOrder[burstIndex];
    if (burstTimer > 0 && role === expected) burstIndex += 1;
    else burstIndex = role === "breaker" ? 1 : 0;
    burstTimer = 2.7;
    applyBurst(member, index);
    if (burstIndex >= roleOrder.length) {
      burstIndex = 0;
      chainTimer = 5.5;
      score += 180;
      squad.forEach(function (ally) { if (!ally.down) ally.buff = Math.max(ally.buff, 5.5); });
      toast = "CHAIN // LINEBREAK PROTOCOL";
      toastColor = "#ffe7a0";
      toastTimer = 2.3;
      burstParticles(195, 335, "#ffe7a0", 28);
      sound("chain");
    } else {
      toast = "BURST " + (burstIndex === 0 ? "RESET" : (burstIndex + 1) + "/3");
      toastColor = member.color;
      toastTimer = 1.2;
    }
  }

  function cycleTarget(direction) {
    var live = enemies.filter(function (enemy) { return !enemy.dead; }).sort(function (a, b) { return a.x - b.x; });
    if (!live.length || !squad[selectedMember]) return;
    var current = live.findIndex(function (enemy) { return enemy.id === squad[selectedMember].targetId; });
    var next = (current + direction + live.length) % live.length;
    assignTarget(selectedMember, live[next]);
  }

  function update(dt) {
    if (rotated || document.hidden || rosterOpen) return;
    updateEffects(dt);
    if (toastTimer > 0) toastTimer -= dt;
    if (state !== "play") return;
    runTime += dt;
    if (burstTimer > 0) burstTimer -= dt;
    if (burstTimer <= 0) burstIndex = 0;
    if (chainTimer > 0) chainTimer -= dt;
    shake = Math.max(0, shake - dt * 12);
    squad.forEach(function (member, index) {
      member.buff = Math.max(0, member.buff - dt);
      member.jolt = Math.max(0, member.jolt - dt);
      if (member.down) return;
      member.fireTimer -= dt;
      if (member.fireTimer <= 0) {
        member.fireTimer = member.role === "breaker" ? 0.72 : member.role === "sustain" ? 0.94 : 0.82;
        fireMember(member, index);
      }
    });
    enemies.forEach(function (enemy) {
      if (enemy.dead) return;
      enemy.weakTimer = (enemy.weakTimer + dt) % 2.4;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.jolt = Math.max(0, enemy.jolt - dt);
      if (enemy.x > 116) enemy.x -= enemy.speed * dt;
      else {
        enemy.x = 116;
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          var target = squad[enemy.lane];
          if (!target || target.down) target = squad.find(function (member) { return !member.down; });
          if (target) damageMember(target, enemy.boss ? 17 : enemy.kind === "brute" ? 10 : 7);
          enemy.attackTimer = enemy.boss ? 1.05 : 1.65;
        }
      }
    });
    for (var i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
    if (transition > 0) {
      transition -= dt;
      if (transition <= 0) enterNextStage();
      return;
    }
    if (stageSpawned < stageGoal && spawnTimer <= 0 && enemies.length < MAX_ENEMIES - 2) {
      spawnEnemy();
      spawnTimer = Math.max(0.45, 1.08 - stage * 0.035);
    } else spawnTimer -= dt;
    if (stageSpawned >= stageGoal && enemies.length === 0) {
      transition = 1.15;
      progress.bestStage = Math.max(progress.bestStage, stage);
      saveProgress();
    }
  }

  function updateEffects(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy = p.vy * Math.pow(p.drag, dt * 60) + 12 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var j = floaters.length - 1; j >= 0; j--) {
      floaters[j].life -= dt;
      floaters[j].y -= 24 * dt;
      if (floaters[j].life <= 0) floaters.splice(j, 1);
    }
    for (var k = shots.length - 1; k >= 0; k--) {
      shots[k].life -= dt;
      if (shots[k].life <= 0) shots.splice(k, 1);
    }
  }

  function rr(x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function label(message, x, y, size, color, align, weight) {
    ctx.font = (weight || "700") + " " + size + "px Arial, Helvetica, sans-serif";
    ctx.fillStyle = color || "#d9efff";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(message, x, y);
  }

  function laneY(index) { return lanes[Math.max(0, Math.min(2, index))]; }

  function drawBackground() {
    ctx.fillStyle = "#08111d";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0b1725";
    ctx.fillRect(0, 102, W, 468);
    stars.forEach(function (star) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = star.color;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(113,175,215,0.11)";
    ctx.lineWidth = 1;
    for (var x = 0; x <= W; x += 26) { ctx.beginPath(); ctx.moveTo(x, 102); ctx.lineTo(x, 570); ctx.stroke(); }
    lanes.forEach(function (y) {
      ctx.strokeStyle = "rgba(113,175,215,0.21)";
      ctx.beginPath(); ctx.moveTo(0, y + 32); ctx.lineTo(W, y + 32); ctx.stroke();
      ctx.strokeStyle = "rgba(113,175,215,0.08)";
      ctx.beginPath(); ctx.moveTo(0, y - 40); ctx.lineTo(W, y - 40); ctx.stroke();
    });
  }

  function drawTop() {
    ctx.fillStyle = "#07101b";
    ctx.fillRect(0, 0, W, 102);
    ctx.strokeStyle = "#1f3a51";
    ctx.beginPath(); ctx.moveTo(0, 101); ctx.lineTo(W, 101); ctx.stroke();
    label("AEGIS LINE", 16, 19, 11, "#83b9d5", "left", "700");
    label("STAGE " + String(stage).padStart(2, "0") + "/12", 16, 42, 22, "#e9f7ff", "left", "800");
    label("SCORE " + String(Math.floor(score)).padStart(5, "0"), 16, 72, 11, "#8daabd", "left", "700");
    label(formatTime(runTime), 192, 27, 16, "#cfe7ff", "center", "800");
    label(stage % 4 === 0 ? "WARDEN STAGE" : "ADVANCE", 192, 48, 10, stage % 4 === 0 ? "#ffe7a0" : "#63869e", "center", "700");
    var rosterColor = progress.unlocked.length >= 6 ? "#8af6c8" : "#cfe7ff";
    rr(286, 10, 88, 49, 10, "#102335", "#2d5069");
    label("ROSTER", 330, 22, 9, "#7399ad", "center", "800");
    label(progress.unlocked.length + "/6", 330, 43, 16, rosterColor, "center", "800");
    var filled = stageKills / Math.max(1, stageGoal);
    ctx.fillStyle = "#182d40"; rr(113, 76, 154, 8, 4, "#182d40");
    ctx.fillStyle = stage % 4 === 0 ? "#ffc857" : "#5bb9e7";
    rr(113, 76, 154 * Math.min(1, filled), 8, 4, stage % 4 === 0 ? "#ffc857" : "#5bb9e7");
    label(stageKills + "/" + stageGoal, 276, 80, 9, "#8daabd", "left", "700");
  }

  function drawCover() {
    lanes.forEach(function (y, index) {
      ctx.fillStyle = "#12283a";
      rr(36, y - 37, 42, 74, 8, "#12283a", "#34617b");
      ctx.fillStyle = "#1e4255";
      ctx.fillRect(42, y - 25, 28, 7);
      ctx.fillRect(42, y + 18, 28, 7);
      ctx.strokeStyle = index === selectedMember ? "#cfe7ff" : "#47748a";
      ctx.lineWidth = index === selectedMember ? 2 : 1;
      ctx.strokeRect(45, y - 14, 22, 28);
      ctx.fillStyle = "#07101b";
      ctx.fillRect(67, y - 12, 9, 24);
    });
  }

  function drawMember(member, index) {
    var y = laneY(index) + (member.jolt ? Math.sin(member.jolt * 80) * 2 : 0);
    if (member.down) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#536b79";
      rr(82, y - 13, 25, 26, 5, "#536b79");
      ctx.globalAlpha = 1;
      label("X", 94, y, 13, "#ff6b57", "center", "900");
      return;
    }
    ctx.fillStyle = member.color;
    rr(80, y - 17, 25, 34, 6, member.color, "#e6f7ff");
    ctx.fillStyle = "#07101b";
    ctx.fillRect(86, y - 10, 13, 7);
    ctx.fillRect(86, y + 4, 5, 7);
    ctx.fillRect(94, y + 4, 5, 7);
    ctx.fillStyle = member.alt;
    ctx.fillRect(104, y - 2, 12, 4);
    if (member.buff > 0 || chainTimer > 0) {
      ctx.strokeStyle = chainTimer > 0 ? "#ffe7a0" : member.alt;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(93, y, 23 + Math.sin(runTime * 10) * 2, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawTargetLines() {
    squad.forEach(function (member, index) {
      var target = findEnemy(member.targetId);
      if (!target || member.down) return;
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = member.color;
      ctx.globalAlpha = 0.27;
      ctx.beginPath(); ctx.moveTo(111, laneY(index)); ctx.lineTo(target.x - enemyRadius(target), target.y); ctx.stroke();
      ctx.restore();
    });
  }

  function drawEnemy(enemy) {
    var y = enemy.y + (enemy.jolt ? Math.sin(enemy.jolt * 90) * 2 : 0);
    var r = enemyRadius(enemy);
    var base = enemy.boss ? "#8f5a48" : enemy.kind === "brute" ? "#7a6970" : enemy.kind === "charger" ? "#6f5890" : "#426a7b";
    var edge = enemy.flash > 0 ? "#fff1c1" : enemy.boss ? "#ffc857" : "#9dd4e8";
    ctx.fillStyle = base;
    if (enemy.boss) {
      ctx.beginPath();
      ctx.moveTo(enemy.x - r, y + 22); ctx.lineTo(enemy.x - 34, y - 34); ctx.lineTo(enemy.x - 9, y - 49);
      ctx.lineTo(enemy.x + 28, y - 37); ctx.lineTo(enemy.x + r, y + 11); ctx.lineTo(enemy.x + 16, y + r);
      ctx.lineTo(enemy.x - 26, y + r); ctx.closePath(); ctx.fill();
    } else if (enemy.kind === "charger") {
      ctx.beginPath(); ctx.moveTo(enemy.x - r, y); ctx.lineTo(enemy.x - 6, y - r); ctx.lineTo(enemy.x + r, y); ctx.lineTo(enemy.x - 6, y + r); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(enemy.x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = enemy.boss ? 3 : 2;
    ctx.stroke();
    ctx.fillStyle = "#0a1621";
    ctx.fillRect(enemy.x - r * 0.45, y - 5, r * 0.9, 10);
    ctx.fillStyle = enemy.boss ? "#ff916e" : "#a9e9f6";
    ctx.fillRect(enemy.x - r * 0.3, y - 2, r * 0.6, 4);
    if (weakOpen(enemy)) {
      var weak = weakPoint(enemy);
      var pulse = 11 + Math.sin(runTime * 9 + enemy.id) * 3;
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#ffe7a0";
      ctx.beginPath(); ctx.arc(weak.x, weak.y, pulse + 8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffe7a0";
      ctx.beginPath(); ctx.arc(weak.x, weak.y, pulse * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff7d1";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(weak.x, weak.y, pulse * 0.8, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.strokeStyle = "#7593a1";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(enemy.x + 11, y - 8, 6, 0, Math.PI * 2); ctx.stroke();
    }
    var barWidth = enemy.boss ? 84 : 46;
    ctx.fillStyle = "#1a2935"; rr(enemy.x - barWidth / 2, y - r - 15, barWidth, 5, 3, "#1a2935");
    rr(enemy.x - barWidth / 2, y - r - 15, barWidth * Math.max(0, enemy.hp / enemy.maxHp), 5, 3, enemy.boss ? "#ff916e" : "#7ce0d1");
    if (enemy.armor > 0) label("ARM " + enemy.armor, enemy.x, y + r + 13, 8, "#9eb6c1", "center", "800");
    if (enemy.boss) label("WARDEN", enemy.x, y - r - 25, 9, "#ffe7a0", "center", "900");
  }

  function drawEffects() {
    shots.forEach(function (shot) {
      ctx.globalAlpha = Math.max(0, shot.life / shot.maxLife);
      ctx.strokeStyle = shot.color;
      ctx.lineWidth = shot.crit ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(shot.x1, shot.y1); ctx.lineTo(shot.x2, shot.y2); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    particles.forEach(function (particle) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
    floaters.forEach(function (floater) {
      ctx.globalAlpha = Math.max(0, floater.life / floater.maxLife);
      label(floater.message, floater.x, floater.y, 11, floater.color, "center", "900");
    });
    ctx.globalAlpha = 1;
  }

  function drawBottom() {
    ctx.fillStyle = "#07101b";
    ctx.fillRect(0, 570, W, 130);
    ctx.strokeStyle = "#1f3a51";
    ctx.beginPath(); ctx.moveTo(0, 570); ctx.lineTo(W, 570); ctx.stroke();
    label("BURST ORDER", 16, 582, 9, "#7399ad", "left", "800");
    label(burstTimer > 0 ? "CHAIN WINDOW " + burstIndex + "/3" : "TAP 1 → 2 → 3", 374, 582, 9, burstTimer > 0 ? "#ffe7a0" : "#7399ad", "right", "800");
    squad.forEach(function (member, index) {
      var x = 10 + index * 123;
      var border = index === selectedMember ? "#cfe7ff" : "#2d5069";
      if (burstTimer > 0 && member.role === roleOrder[burstIndex]) border = member.color;
      rr(x, 591, 115, 98, 10, member.down ? "#111c26" : "#102335", border);
      ctx.fillStyle = member.down ? "#536b79" : member.color;
      rr(x + 8, 601, 42, 42, 8, member.down ? "#536b79" : member.color);
      label(member.letter, x + 29, 622, 19, "#07101b", "center", "900");
      label(String(index + 1), x + 100, 603, 11, "#8daabd", "center", "900");
      label(member.name.toUpperCase(), x + 57, 606, 10, member.down ? "#73828c" : "#e9f7ff", "left", "900");
      label(member.role.toUpperCase(), x + 57, 621, 8, member.color, "left", "800");
      ctx.fillStyle = "#1a2d3b"; rr(x + 57, 632, 49, 6, 3, "#1a2d3b");
      rr(x + 57, 632, 49 * Math.max(0, member.hp / member.maxHp), 6, 3, member.down ? "#536b79" : member.color);
      label(member.down ? "DOWN" : Math.ceil(member.hp) + "%", x + 57, 649, 9, member.down ? "#ff6b57" : "#9eb6c1", "left", "700");
      label(member.buff > 0 ? "BOOST " + Math.ceil(member.buff) : "BURST READY", x + 57, 674, 8, member.buff > 0 ? "#ffe7a0" : "#7399ad", "left", "800");
    });
  }

  function drawToast() {
    if (toastTimer <= 0 || !toast) return;
    ctx.globalAlpha = Math.min(1, toastTimer * 2);
    rr(52, 116, 286, 29, 8, "rgba(5,13,22,0.88)", toastColor);
    label(toast, 195, 130, 10, toastColor, "center", "900");
    ctx.globalAlpha = 1;
  }

  function drawOverlay(title, subtitle, button, color) {
    ctx.fillStyle = "rgba(3,8,14,0.78)";
    ctx.fillRect(0, 0, W, H);
    rr(24, 170, 342, 300, 18, "#0d1d2c", color);
    ctx.strokeStyle = "rgba(207,231,255,0.22)";
    ctx.strokeRect(37, 183, 316, 274);
    label(title, 195, 235, 28, color, "center", "900");
    label(subtitle, 195, 276, 12, "#c1d8e5", "center", "700");
    label(state === "win" ? "BEST " + String(progress.bestScore).padStart(5, "0") : "STAGE " + String(stage).padStart(2, "0") + " // SCORE " + Math.floor(score), 195, 310, 11, "#7fa4b8", "center", "800");
    label(state === "win" ? "12 sectors cleared // line stabilized" : "squad down // cover failed", 195, 342, 10, "#7fa4b8", "center", "700");
    rr(96, 372, 198, 56, 12, color, color);
    label(button, 195, 400, 14, "#07101b", "center", "900");
    label("ENTER / TAP", 195, 446, 9, "#7399ad", "center", "800");
  }

  function drawIntro() {
    ctx.fillStyle = "rgba(3,8,14,0.18)";
    ctx.fillRect(0, 0, W, H);
    label("AEGIS LINE", 195, 175, 39, "#e9f7ff", "center", "900");
    label("AUTO-COVER SQUAD SHOOTER", 195, 210, 10, "#7fc3df", "center", "800");
    ctx.strokeStyle = "#2d5069";
    ctx.beginPath(); ctx.moveTo(74, 230); ctx.lineTo(316, 230); ctx.stroke();
    [0, 1, 2].forEach(function (index) {
      var member = makeMember(activeIds[index]);
      var x = 104 + index * 91;
      ctx.fillStyle = member.color;
      rr(x - 23, 260, 46, 54, 10, member.color, "#e9f7ff");
      label(member.letter, x, 287, 22, "#07101b", "center", "900");
      label(member.name.toUpperCase(), x, 335, 10, "#e9f7ff", "center", "900");
      label(member.role.toUpperCase(), x, 351, 8, member.color, "center", "800");
    });
    label("12 advancing stages  •  weak-point armor  •  wardens every 4", 195, 395, 10, "#a2bfce", "center", "700");
    rr(83, 442, 224, 62, 13, "#cfe7ff", "#ffffff");
    label("TAP TO DEPLOY", 195, 473, 15, "#07101b", "center", "900");
    label("audio unlock + instant start", 195, 530, 9, "#7399ad", "center", "700");
    label("Tap a glowing node for CRIT • swipe from portraits to assign", 195, 620, 9, "#cfe7ff", "center", "700");
    label("1 → 2 → 3 bursts = chain buff", 195, 643, 9, "#ffe7a0", "center", "800");
  }

  function drawRoster() {
    ctx.fillStyle = "rgba(2,8,13,0.84)";
    ctx.fillRect(0, 0, W, H);
    rr(16, 70, 358, 556, 16, "#0d1d2c", "#4c7f98");
    label("PILOT ROSTER", 34, 98, 20, "#e9f7ff", "left", "900");
    label("SLOT " + (selectedMember + 1) + " // TAP A PILOT TO ASSIGN", 34, 123, 9, "#8daabd", "left", "800");
    rr(320, 79, 42, 42, 10, "#17334a", "#6a96ad");
    label("×", 341, 100, 23, "#cfe7ff", "center", "700");
    PILOTS.forEach(function (pilot, index) {
      var x = 29 + (index % 2) * 169;
      var y = 145 + Math.floor(index / 2) * 89;
      var open = progress.unlocked.indexOf(pilot.id) !== -1;
      var active = squad[selectedMember] && squad[selectedMember].id === pilot.id;
      rr(x, y, 158, 72, 10, open ? "#10283a" : "#101a24", active ? pilot.color : "#28485d");
      ctx.fillStyle = open ? pilot.color : "#536b79";
      rr(x + 9, y + 13, 44, 44, 9, open ? pilot.color : "#536b79");
      label(open ? pilot.letter : "?", x + 31, y + 35, 19, "#07101b", "center", "900");
      label(open ? pilot.name.toUpperCase() : "LOCKED", x + 63, y + 24, 11, open ? "#e9f7ff" : "#73828c", "left", "900");
      label(open ? pilot.role.toUpperCase() : "MILESTONE", x + 63, y + 41, 8, open ? pilot.color : "#73828c", "left", "800");
      if (open && active) label("ACTIVE", x + 63, y + 58, 8, "#8af6c8", "left", "900");
      else if (!open) label(index < 3 ? "DEPLOYED" : "STAGE " + (index === 3 ? "03" : index === 4 ? "05" : "07"), x + 63, y + 58, 8, "#607f91", "left", "800");
    });
    label("SKINS EARNED  " + progress.skins.length + "/3  •  no shop", 195, 451, 10, "#ffe7a0", "center", "800");
    ["aurora", "ember", "chrome"].forEach(function (skin, index) {
      var unlocked = progress.skins.indexOf(skin) !== -1;
      rr(67 + index * 88, 470, 72, 34, 8, unlocked ? "#243b4a" : "#111c26", unlocked ? "#ffe7a0" : "#2b4558");
      label(unlocked ? skin.toUpperCase() : "LOCKED", 103 + index * 88, 487, 8, unlocked ? "#ffe7a0" : "#607f91", "center", "900");
    });
    label("R / tap × to close", 195, 590, 9, "#7399ad", "center", "800");
  }

  function drawRotate() {
    ctx.fillStyle = "rgba(2,7,12,0.96)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#6da8ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(80, 210, 230, 144);
    ctx.save();
    ctx.translate(195, 282);
    ctx.rotate(-0.28);
    ctx.strokeStyle = "#cfe7ff";
    ctx.strokeRect(-70, -40, 140, 80);
    ctx.restore();
    label("PORTRAIT LOCK", 195, 407, 20, "#e9f7ff", "center", "900");
    label("rotate your device to resume", 195, 435, 11, "#8daabd", "center", "700");
    label("simulation paused", 195, 462, 9, "#6da8ff", "center", "800");
  }

  function formatTime(seconds) {
    var total = Math.max(0, Math.floor(seconds));
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#02070c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.ratio * view.fit, 0, 0, view.ratio * view.fit, view.offX * view.ratio, view.offY * view.ratio);
    drawBackground();
    if (state === "intro") {
      drawIntro();
    } else {
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      drawCover();
      drawTargetLines();
      enemies.forEach(drawEnemy);
      squad.forEach(drawMember);
      drawEffects();
      ctx.restore();
      drawTop();
      drawBottom();
      drawToast();
      if (transition > 0) {
        ctx.globalAlpha = Math.min(0.9, (1.15 - transition) * 1.8);
        rr(76, 267, 238, 86, 15, "#10283a", "#6da8ff");
        label("SECTOR CLEARED", 195, 292, 16, "#e9f7ff", "center", "900");
        label("next stage loading", 195, 321, 10, "#8daabd", "center", "700");
        ctx.globalAlpha = 1;
      }
      if (state === "fail") drawOverlay("LINE LOST", "The squad is down.", "RETRY STAGE", "#ff6b57");
      if (state === "win") drawOverlay("LINE SECURED", "The Aegis Line holds.", "RUN IT AGAIN", "#8af6c8");
      if (rosterOpen) drawRoster();
    }
    if (rotated) drawRotate();
  }

  function enemyAt(x, y) {
    var result = null;
    var best = Infinity;
    enemies.forEach(function (enemy) {
      if (enemy.dead) return;
      var distance = Math.hypot(x - enemy.x, y - enemy.y);
      if (distance <= enemyRadius(enemy) + 24 && distance < best) { best = distance; result = enemy; }
    });
    return result;
  }

  function arenaTap(x, y) {
    var enemy = enemyAt(x, y);
    if (!enemy) return;
    var point = weakPoint(enemy);
    if (weakOpen(enemy) && Math.hypot(x - point.x, y - point.y) <= 28) {
      damageEnemy(enemy, enemy.boss ? 16 : 14, true, "#ffe7a0");
      toast = "WEAK POINT // CRITICAL";
      toastColor = "#ffe7a0";
      toastTimer = 1.1;
    } else assignTarget(selectedMember, enemy);
  }

  function rosterTap(x, y) {
    if (x >= 310 && y >= 70 && y <= 130) { rosterOpen = false; return; }
    PILOTS.forEach(function (pilot, index) {
      var cardX = 29 + (index % 2) * 169;
      var cardY = 145 + Math.floor(index / 2) * 89;
      if (x >= cardX && x <= cardX + 158 && y >= cardY && y <= cardY + 72 && progress.unlocked.indexOf(pilot.id) !== -1) {
        activeIds[selectedMember] = pilot.id;
        squad[selectedMember] = makeMember(pilot.id);
        rosterOpen = false;
        toast = pilot.name.toUpperCase() + " ASSIGNED TO SLOT " + (selectedMember + 1);
        toastColor = pilot.color;
        toastTimer = 1.7;
        sound("burst");
      }
    });
  }

  function pointerDown(event) {
    event.preventDefault();
    unlockAudio();
    if (pointers.size >= MAX_POINTERS) return;
    var point = logicalPoint(event);
    if (rotated || document.hidden) return;
    if (state === "intro") { beginRun(1); return; }
    if (state === "fail" || state === "win") {
      if (point.x >= 75 && point.x <= 315 && point.y >= 350 && point.y <= 445) beginRun(state === "fail" ? stage : 1);
      return;
    }
    if (rosterOpen) { rosterTap(point.x, point.y); return; }
    if (point.x >= 282 && point.x <= 386 && point.y <= 70) { rosterOpen = true; clearInput(); return; }
    var portrait = portraitAt(point.x, point.y);
    var pointer = { id: event.pointerId, control: portrait >= 0 ? "portrait" : "arena", member: portrait, startX: point.x, startY: point.y, x: point.x, y: point.y };
    pointers.set(event.pointerId, pointer);
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* unsupported */ }
    if (portrait < 0) arenaTap(point.x, point.y);
  }

  function pointerMove(event) {
    var pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    var point = logicalPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    stick.x = point.x - pointer.startX;
    stick.y = point.y - pointer.startY;
  }

  function pointerUp(event, cancelled) {
    var pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    var point = logicalPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    if (!cancelled && pointer.control === "portrait") {
      if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 24) {
        var target = enemyAt(pointer.x, pointer.y);
        if (target) assignTarget(pointer.member, target);
      } else triggerBurst(pointer.member);
    }
    pointers.delete(event.pointerId);
    if (!pointers.size) { stick.x = 0; stick.y = 0; }
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* unsupported */ }
  }

  function portraitAt(x, y) {
    if (y < 588 || y > 700) return -1;
    for (var i = 0; i < 3; i++) {
      var left = 10 + i * 123;
      if (x >= left && x <= left + 115) return i;
    }
    return -1;
  }

  canvas.addEventListener("pointerdown", pointerDown, { passive: false });
  canvas.addEventListener("pointermove", pointerMove, { passive: false });
  canvas.addEventListener("pointerup", function (event) { pointerUp(event, false); }, { passive: false });
  canvas.addEventListener("pointercancel", function (event) { pointerUp(event, true); }, { passive: false });
  window.addEventListener("pointerup", function (event) { if (pointers.has(event.pointerId)) pointerUp(event, false); }, { passive: false });
  window.addEventListener("blur", clearInput);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearInput(); cancelTimers(); }
    lastFrame = 0;
  });
  window.addEventListener("keydown", function (event) {
    var key = event.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter"].indexOf(key) !== -1) event.preventDefault();
    if (rotated || document.hidden) { clearInput(); return; }
    unlockAudio();
    if (keys.has(key)) return;
    keys.add(key);
    if (state === "intro" && (key === "Enter" || key === " ")) { beginRun(1); return; }
    if ((state === "fail" || state === "win") && (key.toLowerCase() === "r" || key === "Enter" || key === " ")) { beginRun(state === "fail" ? stage : 1); return; }
    if (state !== "play" || rosterOpen) return;
    if (key === "1" || key === "2" || key === "3") triggerBurst(Number(key) - 1);
    if (key === "ArrowUp") selectedMember = (selectedMember + 2) % 3;
    if (key === "ArrowDown") selectedMember = (selectedMember + 1) % 3;
    if (key === "ArrowLeft") cycleTarget(-1);
    if (key === "ArrowRight") cycleTarget(1);
    if (key.toLowerCase() === "r") { rosterOpen = true; clearInput(); }
  });
  window.addEventListener("keyup", function (event) { keys.delete(event.key); });

  for (var s = 0; s < 64; s++) stars.push({ x: Math.random() * W, y: 108 + Math.random() * 450, size: Math.random() < 0.85 ? 1 : 2, alpha: 0.12 + Math.random() * 0.4, color: Math.random() < 0.65 ? "#79b9d3" : "#c8d9f8" });
  setupSquad();
  resize();

  function frame(now) {
    var dt = lastFrame ? Math.min(0.033, Math.max(0, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}());
