(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var W = 800;
  var H = 450;
  var scale = 1;
  var lastFrame = 0;
  var portrait = false;
  var STORAGE_KEY = 'pennant-nine-record-v1';
  var TAU = Math.PI * 2;

  var COLORS = {
    ink: '#071116',
    night: '#0a171e',
    panel: '#11262f',
    panel2: '#18333b',
    line: '#35535a',
    text: '#edf6ee',
    muted: '#9bb1ac',
    lime: '#c9ff62',
    aqua: '#86e4d5',
    coral: '#ff7861',
    gold: '#ffd36b',
    field: '#1a6149',
    fieldDark: '#124536',
    dirt: '#b77b55',
    white: '#fffdf4'
  };

  var TEAMS = [
    { name: 'Northstar Nine', short: 'N9', color: COLORS.lime, style: 'you', lineup: [
      ['Mira Vale', 0.82, 0.67, 0.58], ['Jax Rowan', 0.71, 0.78, 0.48], ['Sola Reed', 0.76, 0.59, 0.81],
      ['Tess Orbit', 0.69, 0.64, 0.75], ['Oren Pike', 0.62, 0.86, 0.42], ['Nia Bloom', 0.79, 0.52, 0.86],
      ['Cal Wren', 0.68, 0.71, 0.61], ['Ivo Finch', 0.74, 0.57, 0.72], ['Rue Atlas', 0.65, 0.75, 0.54],
      ['Pip Sol', 0.61, 0.53, 0.83], ['Koi Mercer', 0.58, 0.69, 0.64]
    ]},
    { name: 'Cinder Owls', short: 'CO', color: '#ff9a68', style: 'contact', lineup: [
      ['Lumen Fox', 0.91, 0.46, 0.54], ['Moss Bell', 0.88, 0.51, 0.48], ['Pax Noon', 0.86, 0.62, 0.42],
      ['Vera Coil', 0.83, 0.57, 0.66], ['Nell Rook', 0.81, 0.49, 0.57], ['Odo Flint', 0.79, 0.67, 0.39],
      ['Kestrel May', 0.78, 0.55, 0.76], ['Ari Soot', 0.77, 0.61, 0.45], ['Bram Glow', 0.74, 0.71, 0.36]
    ]},
    { name: 'Volt Vipers', short: 'VV', color: '#ffdd67', style: 'power', lineup: [
      ['Rex Static', 0.53, 0.94, 0.49], ['Tala Boom', 0.61, 0.92, 0.53], ['Grit Zane', 0.49, 0.96, 0.38],
      ['Juno Arc', 0.68, 0.85, 0.63], ['Bex Torch', 0.57, 0.89, 0.44], ['Dax Volt', 0.66, 0.87, 0.59],
      ['Sia Crash', 0.51, 0.83, 0.41], ['Milo Fuse', 0.63, 0.78, 0.68], ['Qin Spark', 0.59, 0.81, 0.56]
    ]},
    { name: 'Harbor Hares', short: 'HH', color: '#8be8df', style: 'speed', lineup: [
      ['Wick Dash', 0.69, 0.49, 0.96], ['Penny Jet', 0.74, 0.42, 0.94], ['Lio Skim', 0.77, 0.55, 0.91],
      ['Zee Current', 0.66, 0.61, 0.89], ['Mara Fleet', 0.72, 0.47, 0.93], ['Kit Wake', 0.81, 0.52, 0.87],
      ['Bo Slip', 0.68, 0.58, 0.86], ['Uma Wake', 0.75, 0.64, 0.82], ['Rin Ripple', 0.7, 0.45, 0.9]
    ]},
    { name: 'Moss Meteors', short: 'MM', color: '#b5a4ff', style: 'balanced', lineup: [
      ['Aster Ray', 0.73, 0.72, 0.69], ['Nox Garden', 0.71, 0.73, 0.64], ['Vivi Stone', 0.75, 0.75, 0.62],
      ['Clem Star', 0.68, 0.79, 0.71], ['Yara Moss', 0.78, 0.66, 0.77], ['Sol Prism', 0.72, 0.76, 0.68],
      ['Mica Bloom', 0.69, 0.7, 0.74], ['Taro Dust', 0.65, 0.82, 0.55], ['Eli Comet', 0.76, 0.68, 0.7]
    ]}
  ];

  // Nine active bats plus two simple bench options: no gacha, no unlock path.
  TEAMS[0].subs = TEAMS[0].lineup.splice(9, 2);

  var PITCHES = [
    { name: 'GLINT', color: COLORS.gold, speed: 0.9, sway: 0.75, bonus: 0.04 },
    { name: 'HUSH', color: COLORS.aqua, speed: 1.16, sway: 0.46, bonus: 0.08 },
    { name: 'KICK', color: COLORS.coral, speed: 0.74, sway: 1.05, bonus: 0.02 }
  ];

  var audio = { context: null, unlocked: false };
  var timers = new Set();
  var input = {
    pointers: new Map(),
    owners: { play: null, swing: null, pitch0: null, pitch1: null, pitch2: null, stop: null, dive: null, menu: null, menuNext: null, menuRematch: null },
    keys: new Set(),
    queued: []
  };

  var state = {
    screen: 'start',
    phase: 'idle',
    paused: true,
    orientationPaused: false,
    seasonGame: 1,
    inning: 1,
    half: 'away',
    outs: 0,
    bases: [false, false, false],
    score: [0, 0],
    hits: [0, 0],
    opponentIndex: 1,
    playerBat: 0,
    aiBat: 0,
    gameClock: 300,
    pitchProgress: 0,
    preTimer: 0,
    targetTime: 0,
    guessZone: 1,
    pitchZone: 1,
    selectedPitch: 0,
    target: { x: 0.5, y: 0.5 },
    targetStopped: false,
    lastHit: null,
    resultText: '',
    resultSub: '',
    resultColor: COLORS.lime,
    resultTimer: 0,
    pendingTransition: 'next',
    fieldTimer: 0,
    fieldTarget: { x: 0.5, y: 0.5 },
    diveUsed: false,
    shake: 0,
    flash: 0,
    particles: [],
    events: [],
    standings: [],
    gameStartStandings: [],
    record: { pennants: 0, seasons: 0, bestWins: 0, games: 0 },
    seasonFinished: false,
    seasonWon: false,
    hint: 'Drag to guess the pitch zone, then time your swing.'
  };

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand() { return Math.random(); }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  function chance(value) { return rand() < value; }
  function roundedInt(value, fallback) {
    return Number.isFinite(value) ? Math.round(value) : fallback;
  }

  function later(fn, delay) {
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

  function resetInput() {
    input.pointers.clear();
    Object.keys(input.owners).forEach(function (key) { input.owners[key] = null; });
    input.keys.clear();
    input.queued.length = 0;
  }

  function defaultStandings() {
    return TEAMS.map(function (team, index) {
      return { team: index, wins: 0, losses: 0, runsFor: 0, runsAgainst: 0 };
    });
  }

  function safeRecord() {
    var fallback = { pennants: 0, seasons: 0, bestWins: 0, games: 0 };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      return {
        pennants: clamp(roundedInt(parsed.pennants, 0), 0, 9999),
        seasons: clamp(roundedInt(parsed.seasons, 0), 0, 9999),
        bestWins: clamp(roundedInt(parsed.bestWins, 0), 0, 9),
        games: clamp(roundedInt(parsed.games, 0), 0, 9999)
      };
    } catch (error) {
      return fallback;
    }
  }

  function saveRecord() {
    var rec = state.record;
    var safe = {
      pennants: clamp(roundedInt(rec.pennants, 0), 0, 9999),
      seasons: clamp(roundedInt(rec.seasons, 0), 0, 9999),
      bestWins: clamp(roundedInt(rec.bestWins, 0), 0, 9),
      games: clamp(roundedInt(rec.games, 0), 0, 9999)
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch (error) {}
  }

  function unlockAudio() {
    if (audio.unlocked) {
      if (audio.context && audio.context.state === 'suspended') audio.context.resume();
      return;
    }
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audio.context = new AudioContext();
      audio.context.resume();
      audio.unlocked = true;
      tone(392, 0.08, 'sine', 0.022);
    } catch (error) {
      audio.unlocked = false;
    }
  }

  function tone(frequency, duration, type, volume) {
    if (!audio.unlocked || !audio.context) return;
    try {
      var now = audio.context.currentTime;
      var oscillator = audio.context.createOscillator();
      var gain = audio.context.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume || 0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(audio.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch (error) {}
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(320, rect.width || window.innerWidth);
    var cssH = Math.max(240, rect.height || window.innerHeight);
    var dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(cssW, cssH));
    W = cssW;
    H = cssH;
    scale = dpr;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    portrait = H > W;
    state.orientationPaused = portrait;
    resetInput();
    lastFrame = performance.now();
  }

  function resetGameFields() {
    state.phase = 'idle';
    state.inning = 1;
    state.half = 'away';
    state.outs = 0;
    state.bases = [false, false, false];
    state.score = [0, 0];
    state.hits = [0, 0];
    state.playerBat = 0;
    state.aiBat = 0;
    state.gameClock = 300;
    state.pitchProgress = 0;
    state.preTimer = 0;
    state.targetTime = 0;
    state.guessZone = 1;
    state.pitchZone = 1;
    state.selectedPitch = 0;
    state.targetStopped = false;
    state.lastHit = null;
    state.resultText = '';
    state.resultSub = '';
    state.resultTimer = 0;
    state.pendingTransition = 'next';
    state.fieldTimer = 0;
    state.diveUsed = false;
    state.particles.length = 0;
    state.events.length = 0;
    state.shake = 0;
    state.flash = 0;
  }

  function startSeason() {
    cancelTimers();
    resetInput();
    state.record = safeRecord();
    state.standings = defaultStandings();
    state.gameStartStandings = [];
    state.seasonGame = 1;
    state.seasonFinished = false;
    state.seasonWon = false;
    state.screen = 'game';
    state.paused = false;
    startGame(1);
  }

  function startGame(gameNumber) {
    cancelTimers();
    resetInput();
    state.seasonGame = clamp(gameNumber, 1, 9);
    state.opponentIndex = 1 + ((state.seasonGame - 1) % 4);
    state.gameStartStandings = state.standings.map(function (row) {
      return { team: row.team, wins: row.wins, losses: row.losses, runsFor: row.runsFor, runsAgainst: row.runsAgainst };
    });
    resetGameFields();
    state.screen = 'game';
    state.paused = false;
    beginAtBat();
  }

  function rematch() {
    if (state.seasonFinished) {
      startSeason();
      return;
    }
    cancelTimers();
    resetInput();
    state.standings = state.gameStartStandings.map(function (row) {
      return { team: row.team, wins: row.wins, losses: row.losses, runsFor: row.runsFor, runsAgainst: row.runsAgainst };
    });
    resetGameFields();
    state.screen = 'game';
    state.paused = false;
    beginAtBat();
  }

  function beginAtBat() {
    state.diveUsed = false;
    state.lastHit = null;
    if (state.gameClock <= 0) {
      finishGame();
      return;
    }
    if (state.half === 'home') beginBatting();
    else beginPitching();
  }

  function beginBatting() {
    state.phase = 'batPre';
    state.preTimer = 0.78;
    state.pitchProgress = 0;
    state.pitchZone = Math.floor(rand() * 3);
    state.guessZone = 1;
    state.resultText = 'READ THE PITCH';
    state.hint = 'Drag before the pitch to call a zone. Tap SWING at the plate.';
    addEvent('YOU BAT  •  ' + playerName(state.playerBat), COLORS.lime);
  }

  function beginPitching() {
    state.phase = 'userPitchReady';
    state.preTimer = 0.52;
    state.targetTime = 0;
    state.targetStopped = false;
    state.selectedPitch = 0;
    state.target = { x: 0.5, y: 0.5 };
    state.resultText = 'SET YOUR PITCH';
    state.hint = 'Pick a pitch, then tap STOP when the moving target crosses the zone.';
    addEvent('PITCH TO  •  ' + aiName(state.aiBat), TEAMS[state.opponentIndex].color);
  }

  function beginUserPitch() {
    state.phase = 'userPitching';
    state.targetTime = 0;
    state.targetStopped = false;
    state.resultText = 'STOP THE TARGET';
  }

  function playerName(index) {
    return TEAMS[0].lineup[index % TEAMS[0].lineup.length][0];
  }

  function aiName(index) {
    return TEAMS[state.opponentIndex].lineup[index % TEAMS[state.opponentIndex].lineup.length][0];
  }

  function playerHitter() { return TEAMS[0].lineup[state.playerBat % TEAMS[0].lineup.length]; }
  function aiHitter() { return TEAMS[state.opponentIndex].lineup[state.aiBat % TEAMS[state.opponentIndex].lineup.length]; }

  function update(dt) {
    if (state.orientationPaused || document.hidden || state.screen === 'start' || state.screen === 'gameOver' || state.screen === 'seasonComplete') return;
    state.gameClock = Math.max(0, state.gameClock - dt);
    state.shake = Math.max(0, state.shake - dt * 3.8);
    state.flash = Math.max(0, state.flash - dt * 2.4);
    updateParticles(dt);

    if (state.gameClock <= 0 && state.phase !== 'result' && state.phase !== 'fielding') {
      finishGame();
      return;
    }

    if (state.phase === 'batPre') {
      state.preTimer -= dt;
      if (state.preTimer <= 0) {
        state.phase = 'batPitch';
        state.pitchProgress = 0;
        state.resultText = 'SWING!';
        tone(220, 0.045, 'triangle', 0.018);
      }
    } else if (state.phase === 'batPitch') {
      state.pitchProgress = clamp(state.pitchProgress + dt / 0.88, 0, 1.2);
      if (state.pitchProgress >= 1) resolveBatting(false);
    } else if (state.phase === 'userPitchReady') {
      state.preTimer -= dt;
      if (state.preTimer <= 0) beginUserPitch();
    } else if (state.phase === 'userPitching') {
      state.targetTime += dt;
      updateTarget();
      if (state.targetTime > 1.85) resolvePitch(false);
    } else if (state.phase === 'fielding') {
      state.fieldTimer -= dt;
      if (state.fieldTimer <= 0) resolveFielding(false);
    } else if (state.phase === 'result') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) advanceAfterResult();
    }
  }

  function updateTarget() {
    var pitch = PITCHES[state.selectedPitch];
    var t = state.targetTime * (1.6 + pitch.speed);
    state.target.x = 0.5 + Math.sin(t * 2.1) * 0.32 * pitch.sway;
    state.target.y = 0.5 + Math.cos(t * 2.65 + 0.7) * 0.27 * pitch.sway;
  }

  function resolveBatting(swung) {
    if (state.phase !== 'batPitch') return;
    var hitter = playerHitter();
    var progress = state.pitchProgress;
    var timing = clamp(1 - Math.abs(progress - 0.66) / 0.36, 0, 1);
    var zoneBonus = state.guessZone === state.pitchZone ? 0.18 : 0;
    var contact = hitter[1];
    var quality = timing * 0.64 + contact * 0.28 + zoneBonus;
    var hitChance = swung ? clamp(quality - 0.1, 0.03, 0.96) : 0.025;
    var hit = chance(hitChance * 0.76);
    state.playerBat += 1;
    if (hit) {
      var power = hitter[2];
      var outcome = 'SINGLE';
      if (power + timing > 1.45 && chance(0.22)) outcome = 'HOME RUN';
      else if (power + timing > 1.24 && chance(0.22)) outcome = 'DOUBLE';
      else if (hitter[3] > 0.82 && timing > 0.75 && chance(0.11)) outcome = 'TRIPLE';
      recordHit('home', outcome, timing > 0.68 && zoneBonus > 0);
    } else {
      var label = swung && timing > 0.28 ? 'FLY OUT' : 'STRIKEOUT';
      recordOut(label, 'home');
    }
  }

  function resolvePitch(stopped) {
    if (state.phase !== 'userPitching') return;
    state.targetStopped = stopped;
    var pitch = PITCHES[state.selectedPitch];
    var dx = (state.target.x - 0.5) / 0.42;
    var dy = (state.target.y - 0.5) / 0.37;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var accuracy = clamp(1 - distance, 0, 1);
    var inZone = Math.abs(state.target.x - 0.5) < 0.25 && Math.abs(state.target.y - 0.5) < 0.23;
    var hitter = aiHitter();
    var strikePower = accuracy * 0.7 + (inZone ? 0.25 : 0) + pitch.bonus;
    var getsOut = chance(clamp(strikePower - hitter[1] * 0.18 + 0.1, 0.12, 0.96));
    state.aiBat += 1;
    if (getsOut) {
      recordOut(inZone ? 'PAINTED CORNER' : 'CHASED IT', 'away');
    } else {
      var hitChance = clamp((1 - accuracy) * 0.38 + hitter[1] * 0.27 + hitter[2] * 0.13, 0.08, 0.74);
      if (chance(hitChance)) {
        var outcome = hitter[2] > 0.84 && chance(0.2) ? 'HOME RUN' : (hitter[3] > 0.8 && chance(0.18) ? 'TRIPLE' : (chance(0.22) ? 'DOUBLE' : 'SINGLE'));
        state.lastHit = { outcome: outcome, accuracy: accuracy };
        state.fieldTimer = 0.94;
        state.fieldTarget = { x: 0.5 + (rand() - 0.5) * 0.7, y: 0.48 + (rand() - 0.5) * 0.34 };
        state.diveUsed = false;
        state.phase = 'fielding';
        state.resultText = 'BALL IN PLAY';
        state.hint = 'Auto-fielding is active. Tap DIVE as the marker flashes.';
        tone(180, 0.08, 'sawtooth', 0.025);
      } else {
        recordOut('SOFT CONTACT', 'away');
      }
    }
  }

  function resolveFielding(dived) {
    if (state.phase !== 'fielding') return;
    var success = dived && !state.diveUsed;
    state.diveUsed = true;
    if (success) {
      state.lastHit = null;
      recordOut('DIVING STOP', 'away');
      burst(W * state.fieldTarget.x, H * (0.14 + state.fieldTarget.y * 0.52), COLORS.aqua, 18);
      tone(520, 0.12, 'square', 0.03);
    } else {
      recordHit('away', state.lastHit ? state.lastHit.outcome : 'SINGLE', false);
    }
  }

  function recordOut(label, side) {
    state.outs += 1;
    state.bases = state.outs >= 3 ? [false, false, false] : state.bases;
    state.shake = 0.08;
    state.flash = 0.3;
    state.resultColor = side === 'home' ? COLORS.lime : TEAMS[state.opponentIndex].color;
    state.resultText = label;
    state.resultSub = state.outs >= 3 ? 'THREE DOWN  •  SWITCH SIDES' : (state.outs + ' OUT' + (state.outs === 1 ? '' : 'S'));
    state.pendingTransition = state.outs >= 3 ? 'half' : 'next';
    state.phase = 'result';
    state.resultTimer = 0.86;
    addEvent(label + '  •  ' + (side === 'home' ? 'N9' : TEAMS[state.opponentIndex].short), state.resultColor);
    burst(W * 0.5, H * 0.47, COLORS.white, label === 'DIVING STOP' ? 16 : 7);
    tone(label === 'STRIKEOUT' ? 150 : 260, 0.08, 'triangle', 0.022);
  }

  function recordHit(side, outcome, bonus) {
    var sideIndex = side === 'home' ? 1 : 0;
    state.hits[sideIndex] += 1;
    var bases = outcome === 'HOME RUN' ? 4 : (outcome === 'TRIPLE' ? 3 : (outcome === 'DOUBLE' ? 2 : 1));
    var runs = advanceBases(bases, sideIndex);
    if (bonus) {
      state.shake = 0.12;
      state.flash = 0.65;
      burst(W * 0.5, H * 0.42, COLORS.gold, 20);
    } else {
      burst(W * 0.5, H * 0.42, side === 'home' ? COLORS.lime : TEAMS[state.opponentIndex].color, 9);
    }
    state.resultColor = side === 'home' ? COLORS.lime : TEAMS[state.opponentIndex].color;
    state.resultText = outcome;
    state.resultSub = runs > 0 ? (runs + (runs === 1 ? ' RUN' : ' RUNS')) : 'RUNNERS MOVE';
    state.pendingTransition = 'next';
    state.phase = 'result';
    state.resultTimer = 0.92;
    addEvent(outcome + (runs ? '  •  ' + runs + ' RUN' + (runs === 1 ? '' : 'S') : ''), state.resultColor);
    tone(outcome === 'HOME RUN' ? 660 : 420, outcome === 'HOME RUN' ? 0.2 : 0.1, 'sine', 0.03);
  }

  function advanceBases(distance, sideIndex) {
    var scoreRuns = 0;
    var old = state.bases.slice();
    var next = [false, false, false];
    if (distance >= 4) {
      scoreRuns = 1 + (old[0] ? 1 : 0) + (old[1] ? 1 : 0) + (old[2] ? 1 : 0);
      next = [false, false, false];
    } else {
      for (var i = 2; i >= 0; i -= 1) {
        if (old[i]) {
          var dest = i + distance;
          if (dest >= 3) scoreRuns += 1;
          else next[dest] = true;
        }
      }
      var batterDest = distance - 1;
      if (batterDest >= 3) scoreRuns += 1;
      else next[batterDest] = true;
    }
    state.bases = next;
    state.score[sideIndex] += scoreRuns;
    return scoreRuns;
  }

  function advanceAfterResult() {
    if (state.pendingTransition === 'half') {
      state.bases = [false, false, false];
      state.outs = 0;
      if (state.half === 'away') {
        state.half = 'home';
      } else {
        state.inning += 1;
        state.half = 'away';
      }
      if (state.inning > 3) {
        finishGame();
        return;
      }
    }
    beginAtBat();
  }

  function finishGame() {
    if (state.screen !== 'game') return;
    cancelTimers();
    resetInput();
    var player = state.standings[0];
    var opponent = state.standings[state.opponentIndex];
    var playerWon = state.score[1] > state.score[0];
    if (state.score[1] === state.score[0]) playerWon = chance(0.5);
    player.runsFor += state.score[1];
    player.runsAgainst += state.score[0];
    opponent.runsFor += state.score[0];
    opponent.runsAgainst += state.score[1];
    if (playerWon) { player.wins += 1; opponent.losses += 1; }
    else { player.losses += 1; opponent.wins += 1; }
    simulateOtherGames();
    state.record.games += 1;
    state.resultText = playerWon ? 'GAME WON' : 'GAME LOST';
    state.resultSub = state.score[1] + ' — ' + state.score[0] + '  •  ' + TEAMS[state.opponentIndex].name;
    state.resultColor = playerWon ? COLORS.lime : COLORS.coral;
    state.screen = state.seasonFinished ? 'seasonComplete' : 'gameOver';
    state.paused = true;
    state.seasonFinished = state.seasonGame >= 9;
    state.seasonWon = false;
    if (state.seasonFinished) {
      var rank = sortedStandings().findIndex(function (entry) { return entry.team === 0; });
      state.seasonWon = rank === 0;
      state.record.seasons += 1;
      if (state.seasonWon) state.record.pennants += 1;
      state.record.bestWins = Math.max(state.record.bestWins, player.wins);
      saveRecord();
    } else {
      saveRecord();
    }
    addEvent(playerWon ? 'WIN  •  STANDINGS CLIMB' : 'LOSS  •  NEXT GAME', playerWon ? COLORS.lime : COLORS.coral);
    burst(W * 0.5, H * 0.42, playerWon ? COLORS.lime : COLORS.coral, 26);
    tone(playerWon ? 720 : 120, playerWon ? 0.22 : 0.16, playerWon ? 'sine' : 'sawtooth', 0.035);
  }

  function simulateOtherGames() {
    var pairings = [[1, 2], [3, 4]];
    pairings.forEach(function (pair) {
      var first = state.standings[pair[0]];
      var second = state.standings[pair[1]];
      var firstWins = chance(0.5);
      var firstRuns = 1 + Math.floor(rand() * 7);
      var secondRuns = 1 + Math.floor(rand() * 6);
      if (firstWins) firstRuns = Math.max(firstRuns, secondRuns + 1);
      else secondRuns = Math.max(secondRuns, firstRuns + 1);
      first.runsFor += firstRuns; first.runsAgainst += secondRuns;
      second.runsFor += secondRuns; second.runsAgainst += firstRuns;
      if (firstWins) { first.wins += 1; second.losses += 1; }
      else { second.wins += 1; first.losses += 1; }
    });
  }

  function sortedStandings() {
    return state.standings.slice().sort(function (a, b) {
      return b.wins - a.wins || (b.runsFor - b.runsAgainst) - (a.runsFor - a.runsAgainst) || a.team - b.team;
    });
  }

  function spawnParticle(x, y, color, size, life, vx, vy) {
    if (state.particles.length >= 180) state.particles.splice(0, 24);
    state.particles.push({ x: x, y: y, vx: vx, vy: vy, size: size, life: life, max: life, color: color });
  }

  function burst(x, y, color, amount) {
    var count = Math.min(amount, 30);
    for (var i = 0; i < count; i += 1) {
      var angle = rand() * TAU;
      var speed = 24 + rand() * 75;
      spawnParticle(x, y, color, 2 + rand() * 4, 0.42 + rand() * 0.48, Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
  }

  function updateParticles(dt) {
    for (var i = state.particles.length - 1; i >= 0; i -= 1) {
      var p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 34 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function addEvent(text, color) {
    state.events.unshift({ text: text, color: color || COLORS.text, age: 0 });
    if (state.events.length > 18) state.events.length = 18;
  }

  function updateEvents(dt) {
    for (var i = state.events.length - 1; i >= 0; i -= 1) {
      state.events[i].age += dt;
      if (state.events[i].age > 12) state.events.splice(i, 1);
    }
  }

  function roundRect(x, y, w, h, r, fill, stroke, lineWidth) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function text(value, x, y, size, color, align, weight) {
    ctx.font = (weight || 600) + ' ' + size + 'px Arial, Helvetica, sans-serif';
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width || 1; ctx.stroke();
  }

  function circle(x, y, radius, fill, stroke, width) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.night;
    ctx.fillRect(0, 0, W, H);
    drawBackdrop();
    if (state.screen === 'start') drawStart();
    else {
      drawHud();
      drawArena();
      drawBottomBar();
      drawEvents();
      drawParticles();
      if (state.screen === 'gameOver' || state.screen === 'seasonComplete') drawGameOver();
    }
    if (portrait) drawRotateOverlay();
    ctx.restore();
  }

  function drawBackdrop() {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#102a32'); grad.addColorStop(0.56, '#0b1c22'); grad.addColorStop(1, '#071116');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.12;
    for (var i = -H; i < W + H; i += 44) line(i, 0, i + H, H, COLORS.aqua, 1);
    ctx.globalAlpha = 1;
  }

  function drawStart() {
    var cx = W / 2;
    var cy = H * 0.42;
    circle(cx, cy - 68, 38, COLORS.lime);
    line(cx - 16, cy - 84, cx + 16, cy - 52, COLORS.ink, 3);
    line(cx - 21, cy - 67, cx + 9, cy - 96, COLORS.ink, 3);
    text('PENNANT', cx, cy - 10, Math.min(42, W * 0.075), COLORS.text, 'center', 800);
    text('NINE', cx, cy + 35, Math.min(64, W * 0.12), COLORS.lime, 'center', 900);
    text('A tiny pennant, a loud swing.', cx, cy + 78, 15, COLORS.muted, 'center', 500);
    var btn = startButton();
    roundRect(btn.x, btn.y, btn.w, btn.h, 16, COLORS.lime);
    text('TAP TO PLAY', cx, btn.y + btn.h / 2, 18, COLORS.ink, 'center', 900);
    text('free forever  •  9 games  •  no luck boxes', cx, btn.y + btn.h + 30, 11, COLORS.muted, 'center', 600);
    var rec = state.record;
    text('PENNANTS ' + rec.pennants + '   BEST WINS ' + rec.bestWins, cx, H - 30, 11, COLORS.aqua, 'center', 700);
  }

  function drawHud() {
    var opponent = TEAMS[state.opponentIndex];
    ctx.fillStyle = '#08151b'; ctx.fillRect(0, 0, W, 58);
    line(0, 57, W, 57, COLORS.line, 1);
    text('PENNANT NINE', 16, 19, 14, COLORS.lime, 'left', 900);
    text('GAME ' + state.seasonGame + '/9', 16, 40, 11, COLORS.muted, 'left', 700);
    text('N9', W * 0.42, 18, 12, COLORS.lime, 'center', 900);
    text(state.score[1], W * 0.42, 40, 24, COLORS.text, 'center', 900);
    text(opponent.short, W * 0.58, 18, 12, opponent.color, 'center', 900);
    text(state.score[0], W * 0.58, 40, 24, COLORS.text, 'center', 900);
    text('INNING ' + state.inning + (state.half === 'away' ? ' ▲' : ' ▼'), W - 16, 19, 12, COLORS.text, 'right', 800);
    text(formatTime(state.gameClock), W - 16, 40, 13, state.gameClock < 30 ? COLORS.coral : COLORS.aqua, 'right', 800);
  }

  function formatTime(seconds) {
    var total = Math.max(0, Math.ceil(seconds));
    var min = Math.floor(total / 60);
    var sec = total % 60;
    return min + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function arenaRect() {
    return { x: Math.max(154, W * 0.2), y: 75, w: W - Math.max(308, W * 0.4), h: H - 172 };
  }

  function drawArena() {
    var ar = arenaRect();
    var x = ar.x, y = ar.y, w = ar.w, h = ar.h;
    roundRect(x - 10, y - 10, w + 20, h + 20, 18, COLORS.panel, COLORS.line, 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = COLORS.field; ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.12;
    for (var i = -h; i < w + h; i += 34) {
      ctx.fillStyle = COLORS.white;
      ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h * 0.32, y); ctx.lineTo(x + i + h * 0.32 - h, y + h); ctx.lineTo(x + i - h, y + h); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    var homeX = x + w / 2, homeY = y + h * 0.79;
    var moundX = homeX, moundY = y + h * 0.42;
    ctx.fillStyle = COLORS.dirt;
    ctx.beginPath(); ctx.moveTo(homeX, homeY); ctx.lineTo(homeX - w * 0.41, y + h * 0.05); ctx.lineTo(x + w * 0.04, y + h * 0.04); ctx.lineTo(x + w * 0.03, y + h * 0.95); ctx.lineTo(homeX - w * 0.41, y + h * 0.95); ctx.closePath(); ctx.globalAlpha = 0.38; ctx.fill();
    ctx.beginPath(); ctx.moveTo(homeX, homeY); ctx.lineTo(homeX + w * 0.41, y + h * 0.05); ctx.lineTo(x + w * 0.96, y + h * 0.04); ctx.lineTo(x + w * 0.97, y + h * 0.95); ctx.lineTo(homeX + w * 0.41, y + h * 0.95); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    circle(moundX, moundY, 19, COLORS.dirt, '#e3a16d', 2);
    circle(homeX, homeY, 13, COLORS.white);
    ctx.fillStyle = COLORS.white;
    ctx.beginPath(); ctx.moveTo(homeX - 12, homeY - 7); ctx.lineTo(homeX + 12, homeY - 7); ctx.lineTo(homeX + 8, homeY + 10); ctx.lineTo(homeX, homeY + 14); ctx.lineTo(homeX - 8, homeY + 10); ctx.closePath(); ctx.fill();
    drawBaseDiamond(homeX, homeY - 52, 15);
    drawBaseDiamond(homeX - 52, homeY - 1, 15);
    drawBaseDiamond(homeX + 52, homeY - 1, 15);
    drawPitchZone(ar, homeX, homeY);
    drawPlayers(ar, homeX, homeY, moundX, moundY);
    drawPhaseObject(ar, homeX, homeY);
    ctx.restore();
    drawSideCards();
  }

  function drawBaseDiamond(cx, cy, size) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.white; ctx.fillRect(-size * 0.48, -size * 0.48, size * 0.96, size * 0.96); ctx.restore();
  }

  function drawPitchZone(ar, homeX, homeY) {
    var zone = { x: homeX - Math.min(76, ar.w * 0.28), y: ar.y + ar.h * 0.28, w: Math.min(152, ar.w * 0.56), h: Math.min(112, ar.h * 0.46) };
    ctx.setLineDash([5, 5]);
    roundRect(zone.x, zone.y, zone.w, zone.h, 4, null, COLORS.aqua, 2);
    ctx.setLineDash([]);
    if (state.half === 'home' && (state.phase === 'batPre' || state.phase === 'batPitch')) {
      var colW = zone.w / 3;
      for (var i = 0; i < 3; i += 1) {
        if (i === state.guessZone) roundRect(zone.x + i * colW + 3, zone.y + 3, colW - 6, zone.h - 6, 4, 'rgba(201,255,98,.18)', null);
      }
      line(zone.x + colW, zone.y, zone.x + colW, zone.y + zone.h, 'rgba(134,228,213,.45)', 1);
      line(zone.x + colW * 2, zone.y, zone.x + colW * 2, zone.y + zone.h, 'rgba(134,228,213,.45)', 1);
      if (state.phase === 'batPitch') {
        var bx = zone.x + (state.pitchZone + 0.5) * colW;
        var by = zone.y + zone.h * (0.36 + Math.sin(state.pitchProgress * Math.PI) * 0.18);
        circle(bx, by, 10 + state.pitchProgress * 5, COLORS.white);
        circle(bx, by, 4, COLORS.coral);
      }
      text('GUESS', zone.x + zone.w / 2, zone.y - 13, 10, COLORS.aqua, 'center', 800);
    }
    if (state.half === 'away' && (state.phase === 'userPitching' || state.phase === 'userPitchReady')) {
      if (state.phase === 'userPitching') {
        var tx = zone.x + state.target.x * zone.w;
        var ty = zone.y + state.target.y * zone.h;
        circle(tx, ty, 16, 'rgba(255,255,255,.16)', PITCHES[state.selectedPitch].color, 3);
        circle(tx, ty, 4, PITCHES[state.selectedPitch].color);
        line(tx - 23, ty, tx + 23, ty, PITCHES[state.selectedPitch].color, 1);
        line(tx, ty - 23, tx, ty + 23, PITCHES[state.selectedPitch].color, 1);
      }
      text('STRIKE ZONE', zone.x + zone.w / 2, zone.y - 13, 10, COLORS.aqua, 'center', 800);
    }
  }

  function drawPlayers(ar, homeX, homeY, moundX, moundY) {
    var player = state.half === 'home' ? playerHitter() : aiHitter();
    var batterColor = state.half === 'home' ? COLORS.lime : TEAMS[state.opponentIndex].color;
    circle(homeX - 39, homeY - 38, 13, batterColor);
    line(homeX - 35, homeY - 28, homeX - 27, homeY - 8, batterColor, 7);
    line(homeX - 30, homeY - 23, homeX - 52, homeY - 10, batterColor, 5);
    line(homeX - 29, homeY - 8, homeX - 45, homeY + 9, batterColor, 5);
    line(homeX - 27, homeY - 8, homeX - 13, homeY + 10, batterColor, 5);
    if (state.half === 'home' && state.phase === 'batPitch') line(homeX - 49, homeY - 23, homeX - 8, homeY - 52, COLORS.gold, 5);
    circle(moundX, moundY - 19, 11, TEAMS[state.opponentIndex].color);
    line(moundX, moundY - 8, moundX, moundY + 16, TEAMS[state.opponentIndex].color, 6);
    line(moundX, moundY + 1, moundX - 16, moundY + 12, TEAMS[state.opponentIndex].color, 5);
    line(moundX, moundY + 1, moundX + 16, moundY + 12, TEAMS[state.opponentIndex].color, 5);
    text(player[0].split(' ')[0], homeX, ar.y + ar.h - 11, 10, batterColor, 'center', 800);
  }

  function drawPhaseObject(ar, homeX, homeY) {
    if (state.phase === 'fielding') {
      var fx = ar.x + ar.w * state.fieldTarget.x;
      var fy = ar.y + ar.h * (0.2 + state.fieldTarget.y * 0.6);
      ctx.setLineDash([4, 4]);
      line(homeX, homeY, fx, fy, COLORS.gold, 2);
      ctx.setLineDash([]);
      circle(fx, fy, 15 + Math.sin(state.fieldTimer * 18) * 3, 'rgba(255,211,107,.14)', COLORS.gold, 3);
      circle(fx, fy, 4, COLORS.white);
      if (state.fieldTimer < 0.68) {
        roundRect(fx - 40, fy - 45, 80, 25, 8, COLORS.gold);
        text('DIVE', fx, fy - 32, 12, COLORS.ink, 'center', 900);
      }
    }
    if (state.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (state.flash * 0.16) + ')';
      ctx.fillRect(ar.x, ar.y, ar.w, ar.h);
    }
  }

  function drawSideCards() {
    var leftW = Math.max(126, W * 0.17);
    var rightW = leftW;
    var leftX = 14;
    var rightX = W - rightW - 14;
    var top = 78;
    roundRect(leftX, top, leftW, 128, 12, COLORS.panel, COLORS.line, 1);
    text('AT BAT', leftX + 12, top + 17, 10, COLORS.muted, 'left', 800);
    var hitter = state.half === 'home' ? playerHitter() : aiHitter();
    var teamColor = state.half === 'home' ? COLORS.lime : TEAMS[state.opponentIndex].color;
    text(hitter[0].split(' ')[0], leftX + 12, top + 41, 15, teamColor, 'left', 900);
    text(hitter[0].split(' ')[1], leftX + 12, top + 59, 11, COLORS.text, 'left', 600);
    meter(leftX + 12, top + 83, leftW - 24, hitter[1], COLORS.lime, 'CONTACT');
    meter(leftX + 12, top + 105, leftW - 24, hitter[2], COLORS.coral, 'POWER');
    if (state.half === 'home') text('9 ACTIVE  •  2 SUBS', leftX + 12, top + 120, 8, COLORS.aqua, 'left', 800);
    roundRect(rightX, top, rightW, 128, 12, COLORS.panel, COLORS.line, 1);
    text('DIAMOND', rightX + 12, top + 17, 10, COLORS.muted, 'left', 800);
    var baseX = rightX + rightW / 2, baseY = top + 61;
    drawBaseDiamond(baseX, baseY - 18, 13); drawBaseDiamond(baseX - 26, baseY + 8, 13); drawBaseDiamond(baseX + 26, baseY + 8, 13);
    ctx.globalAlpha = 0.28;
    if (state.bases[0]) drawBaseDiamond(baseX, baseY - 18, 13);
    if (state.bases[1]) drawBaseDiamond(baseX - 26, baseY + 8, 13);
    if (state.bases[2]) drawBaseDiamond(baseX + 26, baseY + 8, 13);
    ctx.globalAlpha = 1;
    text(state.outs + ' OUT' + (state.outs === 1 ? '' : 'S'), rightX + 12, top + 103, 12, state.outs === 2 ? COLORS.gold : COLORS.text, 'left', 800);
    text('H ' + state.hits[1] + '  /  ' + state.hits[0], rightX + rightW - 12, top + 103, 11, COLORS.muted, 'right', 700);
  }

  function meter(x, y, w, value, color, label) {
    text(label, x, y, 8, COLORS.muted, 'left', 700);
    roundRect(x + 43, y - 3, w - 43, 6, 3, COLORS.ink, null);
    roundRect(x + 43, y - 3, (w - 43) * value, 6, 3, color, null);
  }

  function drawBottomBar() {
    var y = H - 84;
    ctx.fillStyle = '#08151b'; ctx.fillRect(0, y - 8, W, H - y + 8);
    line(0, y - 8, W, y - 8, COLORS.line, 1);
    if (state.phase === 'fielding') drawFieldControls(y);
    else if (state.half === 'home') drawBatControls(y);
    else drawPitchControls(y);
    var hint = state.hint;
    text(hint, W / 2, y - 19, 11, COLORS.muted, 'center', 600);
  }

  function drawFieldControls(y) {
    var b = diveButton();
    var active = state.fieldTimer < 0.74 && state.fieldTimer > 0.08;
    roundRect(b.x, b.y, b.w, b.h, 13, active ? COLORS.gold : COLORS.panel2, active ? null : COLORS.line, 1);
    text(active ? 'DIVE' : 'TRACKING', b.x + b.w / 2, b.y + b.h / 2 - 1, 15, active ? COLORS.ink : COLORS.muted, 'center', 900);
    text('SPACE', b.x + b.w / 2, b.y + b.h - 13, 9, active ? '#66511a' : COLORS.line, 'center', 800);
  }

  function drawBatControls(y) {
    var b = swingButton();
    var active = state.phase === 'batPitch';
    roundRect(b.x, b.y, b.w, b.h, 13, active ? COLORS.lime : COLORS.panel2, active ? null : COLORS.line, 1);
    text(active ? 'SWING' : (state.phase === 'batPre' ? 'GET READY' : 'SWING'), b.x + b.w / 2, b.y + b.h / 2 - 1, 17, active ? COLORS.ink : COLORS.muted, 'center', 900);
    text('SPACE', b.x + b.w / 2, b.y + b.h - 13, 9, active ? '#44611e' : COLORS.line, 'center', 800);
    var pitchRead = state.phase === 'batPitch' ? Math.round(clamp(state.pitchProgress / 0.88, 0, 1) * 100) + '%' : 'ZONE ' + (state.guessZone + 1);
    text(pitchRead, W - 24, y + 25, 12, state.phase === 'batPitch' ? COLORS.gold : COLORS.aqua, 'right', 800);
  }

  function drawPitchControls(y) {
    var bx = 18;
    for (var i = 0; i < PITCHES.length; i += 1) {
      var rect = pitchButton(i);
      var active = state.selectedPitch === i;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10, active ? PITCHES[i].color : COLORS.panel2, active ? null : COLORS.line, 1);
      text(PITCHES[i].name, rect.x + rect.w / 2, rect.y + rect.h / 2, 11, active ? COLORS.ink : COLORS.text, 'center', 900);
    }
    var stop = stopButton();
    var activeStop = state.phase === 'userPitching';
    roundRect(stop.x, stop.y, stop.w, stop.h, 13, activeStop ? COLORS.lime : COLORS.panel2, activeStop ? null : COLORS.line, 1);
    text(activeStop ? 'STOP' : 'ARM PITCH', stop.x + stop.w / 2, stop.y + stop.h / 2 - 1, 15, activeStop ? COLORS.ink : COLORS.muted, 'center', 900);
    text('SPACE', stop.x + stop.w / 2, stop.y + stop.h - 13, 9, activeStop ? '#44611e' : COLORS.line, 'center', 800);
  }

  function drawEvents() {
    var x = 18;
    var y = H - 112;
    for (var i = 0; i < Math.min(3, state.events.length); i += 1) {
      var e = state.events[i];
      var alpha = clamp(1 - e.age / 12, 0.2, 1);
      ctx.globalAlpha = alpha;
      text(e.text, x, y - i * 16, 10, e.color, 'left', 700);
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (var i = 0; i < state.particles.length; i += 1) {
      var p = state.particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      circle(p.x, p.y, p.size * (0.6 + p.life / p.max), p.color);
    }
    ctx.globalAlpha = 1;
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(3,10,13,.74)'; ctx.fillRect(0, 0, W, H);
    var panelW = Math.min(610, W - 34);
    var panelH = state.seasonFinished ? Math.min(362, H - 36) : Math.min(285, H - 36);
    var x = (W - panelW) / 2, y = (H - panelH) / 2;
    roundRect(x, y, panelW, panelH, 20, COLORS.panel, COLORS.line, 1);
    var title = state.seasonFinished ? (state.seasonWon ? 'PENNANT CLAIMED' : 'SEASON IN THE BOOKS') : state.resultText;
    var accent = state.seasonFinished ? (state.seasonWon ? COLORS.gold : COLORS.aqua) : state.resultColor;
    text(title, W / 2, y + 38, 23, accent, 'center', 900);
    text(state.seasonFinished ? (state.seasonWon ? 'N9 takes the top line.' : 'The next pennant is still yours to chase.') : state.resultSub, W / 2, y + 69, 12, COLORS.muted, 'center', 600);
    if (state.seasonFinished) drawStandings(x + 24, y + 92, panelW - 48, 145);
    else {
      text('N9  ' + state.score[1], W * 0.43, y + 112, 28, COLORS.lime, 'center', 900);
      text('—', W / 2, y + 112, 18, COLORS.muted, 'center', 700);
      text(TEAMS[state.opponentIndex].short + '  ' + state.score[0], W * 0.57, y + 112, 28, TEAMS[state.opponentIndex].color, 'center', 900);
      text('standings: ' + state.standings[0].wins + 'W  ' + state.standings[0].losses + 'L', W / 2, y + 150, 12, COLORS.muted, 'center', 700);
    }
    var a = menuPrimaryButton();
    roundRect(a.x, a.y, a.w, a.h, 12, COLORS.lime);
    text(state.seasonFinished ? 'NEW SEASON' : 'NEXT GAME', a.x + a.w / 2, a.y + a.h / 2, 14, COLORS.ink, 'center', 900);
    var r = menuRematchButton();
    roundRect(r.x, r.y, r.w, r.h, 12, COLORS.panel2, COLORS.line, 1);
    text(state.seasonFinished ? 'NEW RUN' : 'REMATCH', r.x + r.w / 2, r.y + r.h / 2, 12, COLORS.text, 'center', 800);
    text('tap a button  •  R rematches', W / 2, y + panelH - 13, 10, COLORS.muted, 'center', 600);
  }

  function drawStandings(x, y, w, h) {
    text('PENNANT TABLE', x, y, 10, COLORS.muted, 'left', 800);
    var rows = sortedStandings();
    var rowH = Math.min(24, (h - 20) / 5);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i], ry = y + 18 + i * rowH;
      if (row.team === 0) roundRect(x - 8, ry - rowH / 2 + 2, w + 16, rowH - 3, 5, 'rgba(201,255,98,.12)', null);
      text(String(i + 1), x, ry, 10, COLORS.muted, 'left', 800);
      text(TEAMS[row.team].name, x + 23, ry, 11, row.team === 0 ? COLORS.lime : TEAMS[row.team].color, 'left', 800);
      text(row.wins + '—' + row.losses, x + w - 44, ry, 11, COLORS.text, 'right', 800);
    }
  }

  function drawRotateOverlay() {
    ctx.fillStyle = 'rgba(4,11,14,.95)'; ctx.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2;
    roundRect(cx - 54, cy - 61, 108, 70, 12, COLORS.panel2, COLORS.aqua, 2);
    line(cx - 26, cy + 31, cx + 26, cy + 31, COLORS.lime, 4);
    text('ROTATE TO', cx, cy + 69, 16, COLORS.text, 'center', 900);
    text('LANDSCAPE', cx, cy + 91, 16, COLORS.lime, 'center', 900);
    text('game paused', cx, cy + 120, 11, COLORS.muted, 'center', 600);
  }

  function startButton() { return { x: W / 2 - Math.min(145, W * 0.28), y: H * 0.62, w: Math.min(290, W * 0.56), h: 56 }; }
  function swingButton() { return { x: 18, y: H - 68, w: Math.min(190, W * 0.27), h: 54 }; }
  function diveButton() { return { x: 18, y: H - 68, w: Math.min(190, W * 0.27), h: 54 }; }
  function pitchButton(index) { return { x: 18 + index * 72, y: H - 68, w: 64, h: 54 }; }
  function stopButton() { return { x: W - Math.min(190, W * 0.27) - 18, y: H - 68, w: Math.min(190, W * 0.27), h: 54 }; }
  function menuPrimaryButton() { return { x: W / 2 - 135, y: H / 2 + (state.seasonFinished ? 118 : 91), w: 160, h: 50 }; }
  function menuRematchButton() { return { x: W / 2 + 45, y: H / 2 + (state.seasonFinished ? 118 : 91), w: 110, h: 50 }; }

  function pointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: clamp(event.clientX - rect.left, 0, W), y: clamp(event.clientY - rect.top, 0, H) };
  }

  function within(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function controlAt(point) {
    if (state.screen === 'start') return within(point, startButton()) ? 'menu' : null;
    if (state.screen === 'gameOver' || state.screen === 'seasonComplete') {
      if (within(point, menuPrimaryButton())) return 'menuNext';
      if (within(point, menuRematchButton())) return 'menuRematch';
      return null;
    }
    if (state.phase === 'fielding' && within(point, diveButton())) return 'dive';
    if (state.half === 'home') {
      if (within(point, swingButton())) return 'swing';
    } else {
      for (var i = 0; i < PITCHES.length; i += 1) if (within(point, pitchButton(i))) return 'pitch' + i;
      if (within(point, stopButton())) return 'stop';
    }
    return null;
  }

  function claim(role, pointerId, point) {
    if (input.owners[role] !== null) return false;
    input.owners[role] = pointerId;
    input.pointers.set(pointerId, { role: role, x: point.x, y: point.y, moved: false });
    return true;
  }

  function release(pointerId, cancelled) {
    var tracked = input.pointers.get(pointerId);
    if (!tracked) return;
    input.pointers.delete(pointerId);
    if (input.owners[tracked.role] === pointerId) input.owners[tracked.role] = null;
    if (cancelled) return;
    if (tracked.role === 'menu') { startSeason(); return; }
    if (tracked.role === 'menuNext') { nextMenuAction(); return; }
    if (tracked.role === 'menuRematch') { rematch(); return; }
    if (tracked.role === 'swing') { doSwing(); return; }
    if (tracked.role === 'stop') { doStop(); return; }
    if (tracked.role === 'dive') { doDive(); return; }
    if (tracked.role.indexOf('pitch') === 0) {
      var index = Number(tracked.role.slice(5));
      if (Number.isFinite(index)) state.selectedPitch = clamp(index, 0, PITCHES.length - 1);
      return;
    }
    if (tracked.role === 'play' && !tracked.moved) {
      if (state.phase === 'batPitch') doSwing();
      else if (state.phase === 'userPitching') doStop();
      else if (state.phase === 'fielding') doDive();
    }
  }

  function doSwing() {
    if (state.phase === 'batPitch') {
      burst(W * 0.5, H * 0.48, COLORS.gold, 8);
      resolveBatting(true);
    }
  }

  function doStop() {
    if (state.phase === 'userPitching') resolvePitch(true);
  }

  function doDive() {
    if (state.phase === 'fielding' && state.fieldTimer < 0.74 && state.fieldTimer > 0.08) resolveFielding(true);
  }

  function nextMenuAction() {
    if (state.seasonFinished) startSeason();
    else startGame(state.seasonGame + 1);
  }

  function adjustGuess(delta) {
    if (state.half === 'home' && (state.phase === 'batPre' || state.phase === 'batPitch')) state.guessZone = clamp(state.guessZone + delta, 0, 2);
  }

  function handlePointerDown(event) {
    event.preventDefault();
    unlockAudio();
    if (portrait || document.hidden) return;
    try { canvas.setPointerCapture(event.pointerId); } catch (error) {}
    var point = pointFromEvent(event);
    var control = controlAt(point);
    if (control) {
      if (claim(control, event.pointerId, point)) {
        if (control.indexOf('pitch') === 0) state.selectedPitch = Number(control.slice(5));
      }
      return;
    }
    if (state.screen === 'game' && state.phase !== 'result' && state.phase !== 'batPre' && state.phase !== 'userPitchReady') {
      claim('play', event.pointerId, point);
      if (state.phase === 'batPre') setGuessFromPoint(point); 
    } else if (state.screen === 'game' && state.phase === 'batPre') {
      claim('play', event.pointerId, point);
      setGuessFromPoint(point);
    }
  }

  function handlePointerMove(event) {
    event.preventDefault();
    var tracked = input.pointers.get(event.pointerId);
    if (!tracked) return;
    var point = pointFromEvent(event);
    if (Math.abs(point.x - tracked.x) > 10 || Math.abs(point.y - tracked.y) > 10) tracked.moved = true;
    if (tracked.role === 'play' && (state.phase === 'batPre' || state.phase === 'batPitch')) setGuessFromPoint(point);
  }

  function handlePointerUp(event, cancelled) {
    event.preventDefault();
    if (document.hidden || state.orientationPaused) { resetInput(); return; }
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) {}
    release(event.pointerId, cancelled);
  }

  function setGuessFromPoint(point) {
    var ar = arenaRect();
    var zoneX = ar.x + ar.w / 2 - Math.min(76, ar.w * 0.28);
    var zoneW = Math.min(152, ar.w * 0.56);
    state.guessZone = clamp(Math.floor((point.x - zoneX) / (zoneW / 3)), 0, 2);
  }

  function handleKeyDown(event) {
    if (event.code === 'Space' || event.code.indexOf('Arrow') === 0 || event.code === 'KeyR') event.preventDefault();
    if (event.repeat) return;
    if (portrait || document.hidden) { resetInput(); return; }
    input.keys.add(event.code);
    unlockAudio();
    if (portrait) return;
    if (state.screen === 'start' && (event.code === 'Space' || event.code === 'Enter')) { startSeason(); return; }
    if ((state.screen === 'gameOver' || state.screen === 'seasonComplete') && event.code === 'KeyR') { rematch(); return; }
    if (state.screen !== 'game') return;
    if (event.code === 'Space') {
      if (state.phase === 'batPitch') doSwing();
      else if (state.phase === 'userPitching') doStop();
      else if (state.phase === 'fielding') doDive();
    } else if (event.code === 'ArrowLeft') {
      if (state.phase === 'userPitchReady' || state.phase === 'userPitching') state.selectedPitch = (state.selectedPitch + 2) % 3;
      else adjustGuess(-1);
    } else if (event.code === 'ArrowRight') {
      if (state.phase === 'userPitchReady' || state.phase === 'userPitching') state.selectedPitch = (state.selectedPitch + 1) % 3;
      else adjustGuess(1);
    } else if (event.code === 'ArrowUp') adjustGuess(-1);
    else if (event.code === 'ArrowDown') adjustGuess(1);
  }

  function handleKeyUp(event) { input.keys.delete(event.code); }

  function frame(now) {
    var dt = lastFrame ? clamp((now - lastFrame) / 1000, 0, 0.05) : 0;
    lastFrame = now;
    update(dt);
    if (!state.orientationPaused && !document.hidden && state.screen === 'game') updateEvents(dt);
    draw();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  canvas.addEventListener('pointerup', function (event) { handlePointerUp(event, false); }, { passive: false });
  canvas.addEventListener('pointercancel', function (event) { handlePointerUp(event, true); }, { passive: false });
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', handleKeyUp, { passive: false });
  window.addEventListener('blur', resetInput);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () {
    resetInput();
    state.orientationPaused = portrait || document.hidden;
    if (document.hidden) cancelTimers();
    lastFrame = performance.now();
  });

  state.record = safeRecord();
  state.standings = defaultStandings();
  resize();
  requestAnimationFrame(frame);
}());
