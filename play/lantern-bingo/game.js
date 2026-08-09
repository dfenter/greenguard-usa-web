(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var orientationCover = document.getElementById("orientation");
  var TAU = Math.PI * 2;
  var STORE_KEY = "lantern-bingo-save-v1";
  var BOT_NAMES = ["Mica", "Pax", "Orrin", "Tavi", "Juno", "Kite", "Rune"];
  var COLUMN_NAMES = ["L", "I", "G", "H", "T"];
  var POWER_NAMES = ["AUTO", "DOUBLE", "PEEK"];
  var THEMES = [
    { name: "Cinder Porch", goal: "LINE RUSH", cards: 2, interval: 2.25, bg: "#101b28", glow: "#f4b94e", hot: "#ff8d5c", cool: "#5dc6c9" },
    { name: "Moth Garden", goal: "CORNER CLASH", cards: 3, interval: 1.82, bg: "#101827", glow: "#d6a6ff", hot: "#ff73b0", cool: "#76d1b7" },
    { name: "Blueglass Walk", goal: "TWO-LINE TANGLE", cards: 4, interval: 1.48, bg: "#0e1d2b", glow: "#73d9e8", hot: "#788eff", cool: "#b5efab" },
    { name: "Thunder Hall", goal: "BLACKOUT CROWN", cards: 4, interval: 1.16, bg: "#171827", glow: "#ffd66d", hot: "#f5777f", cool: "#8da7ff" }
  ];

  var layout = { cards: [], cells: [], chips: [], bot: null, start: null, end: null };
  var pointerMap = new Map();
  var heldKeys = new Set();
  var queuedActions = [];
  var pendingTimeouts = new Set();
  var audioContext = null;
  var width = 390;
  var height = 700;
  var lastFrame = 0;
  var save = loadSave();
  var state = {
    roomIndex: clampInt(save.unlockedRoom, 0, THEMES.length - 1),
    started: false,
    ended: false,
    result: "",
    resultReason: "",
    cards: [],
    bots: [],
    sequence: [],
    callCursor: 0,
    callSerial: 0,
    currentCall: null,
    callElapsed: 0,
    callInterval: 2.25,
    callLive: true,
    daubedThisCall: 0,
    streak: 0,
    charge: 0,
    powerCounts: [0, 0, 0],
    powerTurn: 0,
    doubleTimer: 0,
    peekTimer: 0,
    peekNumbers: [],
    score: 0,
    timer: 0,
    recentCalls: [],
    feedback: "Tap a glowing number before it fades.",
    feedbackTimer: 0,
    particles: [],
    flash: 0,
    shake: 0,
    orientationLocked: false,
    botView: false
  };

  function defaultSave() {
    return { unlockedRoom: 0, crowns: [false, false, false, false], best: [0, 0, 0, 0] };
  }

  function loadSave() {
    var fresh = defaultSave();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (typeof raw !== "string" || raw.length > 20000) return fresh;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fresh;
      var unlocked = Number(parsed.unlockedRoom);
      fresh.unlockedRoom = Number.isFinite(unlocked) ? clampInt(unlocked, 0, 3) : 0;
      if (Array.isArray(parsed.crowns)) {
        for (var i = 0; i < 4; i++) fresh.crowns[i] = parsed.crowns[i] === true;
      }
      if (Array.isArray(parsed.best)) {
        for (var j = 0; j < 4; j++) {
          var score = Number(parsed.best[j]);
          fresh.best[j] = Number.isFinite(score) && score >= 0 ? Math.min(99999999, Math.floor(score)) : 0;
        }
      }
    } catch (error) {
      return defaultSave();
    }
    return fresh;
  }

  function persistSave() {
    try {
      var safe = {
        unlockedRoom: clampInt(Number(save.unlockedRoom), 0, 3),
        crowns: [0, 1, 2, 3].map(function (i) { return save.crowns[i] === true; }),
        best: [0, 1, 2, 3].map(function (i) {
          var n = Number(save.best[i]);
          return Number.isFinite(n) && n >= 0 ? Math.min(99999999, Math.floor(n)) : 0;
        })
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(safe));
    } catch (error) {
      /* Storage is an optional scorecard, never a requirement to play. */
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function shuffled(values) {
    var result = values.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  function makeCard() {
    var cells = [];
    for (var column = 0; column < 5; column++) {
      var start = column * 15 + 1;
      var values = shuffled(Array.from({ length: 15 }, function (_, i) { return start + i; })).slice(0, 5).sort(function (a, b) { return a - b; });
      for (var row = 0; row < 5; row++) {
        var free = row === 2 && column === 2;
        cells.push({ value: free ? 0 : values[row], marked: free, free: free });
      }
    }
    return { cells: cells };
  }

  function makeBot(index) {
    var card = makeCard();
    var delay = 0.15 + index * 0.075 + Math.random() * 0.15;
    return { name: BOT_NAMES[index], card: card, delay: delay, lastCall: -1, finished: false };
  }

  function resetRun(index) {
    var theme = THEMES[clampInt(index, 0, THEMES.length - 1)];
    state.roomIndex = clampInt(index, 0, THEMES.length - 1);
    state.ended = false;
    state.result = "";
    state.resultReason = "";
    state.cards = Array.from({ length: theme.cards }, makeCard);
    state.bots = BOT_NAMES.map(function (_, i) { return makeBot(i); });
    state.sequence = shuffled(Array.from({ length: 75 }, function (_, i) { return i + 1; }));
    state.callCursor = 0;
    state.callSerial = 0;
    state.currentCall = null;
    state.callElapsed = 0;
    state.callInterval = theme.interval;
    state.callLive = true;
    state.daubedThisCall = 0;
    state.streak = 0;
    state.charge = 0;
    state.powerCounts = [0, 0, 0];
    state.powerTurn = 0;
    state.doubleTimer = 0;
    state.peekTimer = 0;
    state.peekNumbers = [];
    state.score = 0;
    state.timer = 0;
    state.recentCalls = [];
    state.feedback = "Tap a glowing number before it fades.";
    state.feedbackTimer = 0;
    state.particles.length = 0;
    state.flash = 0;
    state.shake = 0;
    state.botView = false;
    nextCall();
  }

  function beginRun(index) {
    clearInput();
    unlockAudio();
    resetRun(index);
    state.started = true;
    lastFrame = performance.now();
    tone(440, 0.09, "triangle", 0.035);
  }

  function nextCall() {
    if (state.currentCall !== null && state.daubedThisCall === 0) {
      state.streak = 0;
    }
    if (state.callCursor >= state.sequence.length) {
      finish("fail", "The last lantern faded before the room was cleared.");
      return;
    }
    state.currentCall = state.sequence[state.callCursor++];
    state.callSerial++;
    state.callElapsed = 0;
    state.callLive = true;
    state.daubedThisCall = 0;
    state.recentCalls.unshift(state.currentCall);
    if (state.recentCalls.length > 8) state.recentCalls.length = 8;
    tone(270 + state.currentCall * 2, 0.055, "sine", 0.022);
  }

  function finish(result, reason) {
    if (state.ended) return;
    state.ended = true;
    state.result = result;
    state.resultReason = reason;
    var room = state.roomIndex;
    if (result === "win") {
      save.unlockedRoom = Math.max(clampInt(save.unlockedRoom, 0, 3), Math.min(3, room + 1));
      if (room === 3) save.crowns[3] = true;
      state.powerCounts = [1, 1, 1];
      burst(width * 0.5, height * 0.43, THEMES[room].glow, 52);
      tone(520, 0.12, "triangle", 0.05);
      later(function () { tone(780, 0.2, "sine", 0.035); }, 100);
    } else {
      tone(130, 0.18, "sawtooth", 0.026);
    }
    var priorBest = Number(save.best[room]);
    if (result === "win" && state.score > priorBest) save.best[room] = Math.min(99999999, Math.floor(state.score));
    persistSave();
  }

  function goalName() {
    return THEMES[state.roomIndex].goal;
  }

  function cardHasLine(card) {
    for (var row = 0; row < 5; row++) {
      var completeRow = true;
      for (var col = 0; col < 5; col++) if (!card.cells[col * 5 + row].marked) completeRow = false;
      if (completeRow) return true;
    }
    for (var column = 0; column < 5; column++) {
      var completeColumn = true;
      for (var row2 = 0; row2 < 5; row2++) if (!card.cells[column * 5 + row2].marked) completeColumn = false;
      if (completeColumn) return true;
    }
    return false;
  }

  function lineCount(card) {
    var count = 0;
    for (var row = 0; row < 5; row++) {
      var rowDone = true;
      for (var col = 0; col < 5; col++) if (!card.cells[col * 5 + row].marked) rowDone = false;
      if (rowDone) count++;
    }
    for (var column = 0; column < 5; column++) {
      var columnDone = true;
      for (var row2 = 0; row2 < 5; row2++) if (!card.cells[column * 5 + row2].marked) columnDone = false;
      if (columnDone) count++;
    }
    return count;
  }

  function cardHasCorners(card) {
    return card.cells[0].marked && card.cells[4].marked && card.cells[20].marked && card.cells[24].marked;
  }

  function cardBlackout(card) {
    for (var i = 0; i < card.cells.length; i++) if (!card.cells[i].marked) return false;
    return true;
  }

  function cardProgress(card) {
    var marked = 0;
    for (var i = 0; i < card.cells.length; i++) if (card.cells[i].marked) marked++;
    return marked;
  }

  function cardGoal(card) {
    if (state.roomIndex === 0) return cardHasLine(card);
    if (state.roomIndex === 1) return cardHasCorners(card);
    if (state.roomIndex === 2) return lineCount(card) >= 2;
    return cardBlackout(card);
  }

  function playerWon() {
    return state.cards.some(cardGoal);
  }

  function botWon(bot) {
    return cardGoal(bot.card);
  }

  function playerProgress() {
    var best = 0;
    state.cards.forEach(function (card) {
      if (state.roomIndex === 0) best = Math.max(best, cardHasLine(card) ? 5 : cardProgress(card));
      else if (state.roomIndex === 1) best = Math.max(best, [0, 4].filter(function (i) { return card.cells[i].marked; }).length + [20, 24].filter(function (i) { return card.cells[i].marked; }).length);
      else if (state.roomIndex === 2) best = Math.max(best, lineCount(card));
      else best = Math.max(best, cardProgress(card));
    });
    return best;
  }

  function botProgress(bot) {
    var card = bot.card;
    if (state.roomIndex === 0) return cardHasLine(card) ? 5 : cardProgress(card);
    if (state.roomIndex === 1) return [0, 4, 20, 24].filter(function (i) { return card.cells[i].marked; }).length;
    if (state.roomIndex === 2) return lineCount(card);
    return cardProgress(card);
  }

  function markPlayerCell(cardIndex, cellIndex) {
    if (!state.started || state.ended || !state.callLive) {
      setFeedback("That glow is gone. Watch the next call.");
      return;
    }
    var card = state.cards[cardIndex];
    var cell = card && card.cells[cellIndex];
    if (!cell || cell.free || cell.marked) return;
    if (cell.value !== state.currentCall) {
      setFeedback("Not this flare — keep your eyes on the caller.");
      tone(110, 0.04, "square", 0.012);
      return;
    }
    cell.marked = true;
    state.daubedThisCall++;
    var firstForCall = state.daubedThisCall === 1;
    if (firstForCall) {
      state.streak++;
      state.charge++;
      if (state.charge >= 3) {
        state.charge -= 3;
        state.powerCounts[state.powerTurn] = Math.min(3, state.powerCounts[state.powerTurn] + 1);
        state.powerTurn = (state.powerTurn + 1) % 3;
        setFeedback(POWER_NAMES[(state.powerTurn + 2) % 3] + " chip charged.");
      }
    }
    var multiplier = state.doubleTimer > 0 ? 2 : 1;
    state.score += (100 + Math.min(300, state.streak * 25)) * multiplier;
    state.flash = Math.max(state.flash, 0.18);
    state.shake = Math.max(state.shake, 3.5);
    burst(cellCenterX(cardIndex, cellIndex), cellCenterY(cardIndex, cellIndex), THEMES[state.roomIndex].glow, 8);
    tone(420 + state.streak * 25, 0.06, "triangle", 0.03);
    if (playerWon()) finish("win", "Your lantern pattern reached the room goal.");
  }

  function autoDaub() {
    if (!state.callLive || state.currentCall === null) {
      setFeedback("Auto waits for the next live flare.");
      return;
    }
    var hits = 0;
    state.cards.forEach(function (card, cardIndex) {
      card.cells.forEach(function (cell, cellIndex) {
        if (!cell.free && !cell.marked && cell.value === state.currentCall) {
          markPlayerCell(cardIndex, cellIndex);
          hits++;
        }
      });
    });
    setFeedback(hits ? "Auto-daub caught " + hits + " glow" + (hits === 1 ? "" : "s") + "." : "Auto-daub found no matching glow.");
  }

  function usePower(index) {
    if (!state.started || state.ended || state.powerCounts[index] <= 0) return;
    state.powerCounts[index]--;
    if (index === 0) autoDaub();
    if (index === 1) {
      state.doubleTimer = 8;
      setFeedback("Double score: eight seconds of bright work.");
      tone(650, 0.12, "sine", 0.04);
    }
    if (index === 2) {
      state.peekTimer = 4.5;
      state.peekNumbers = state.sequence.slice(state.callCursor, state.callCursor + 3);
      setFeedback("Peeked at the next three flares.");
      tone(720, 0.1, "sine", 0.035);
    }
  }

  function updateBots() {
    if (!state.callLive || state.currentCall === null) return;
    state.bots.forEach(function (bot) {
      if (bot.lastCall === state.callSerial || state.callElapsed < bot.delay) return;
      bot.lastCall = state.callSerial;
      bot.card.cells.forEach(function (cell) {
        if (!cell.free && !cell.marked && cell.value === state.currentCall) cell.marked = true;
      });
      if (botWon(bot)) bot.finished = true;
    });
    if (state.bots.some(function (bot) { return bot.finished; })) finish("fail", "A bot lantern solved the room first.");
  }

  function update(dt) {
    if (state.orientationLocked || document.hidden || !state.started || state.ended) {
      lastFrame = performance.now();
      return;
    }
    state.timer += dt;
    state.callElapsed += dt;
    if (state.callElapsed >= state.callInterval) nextCall();
    else if (state.callElapsed >= state.callInterval * 0.78) state.callLive = false;
    state.doubleTimer = Math.max(0, state.doubleTimer - dt);
    state.peekTimer = Math.max(0, state.peekTimer - dt);
    state.feedbackTimer = Math.max(0, state.feedbackTimer - dt);
    state.flash = Math.max(0, state.flash - dt * 0.9);
    state.shake = Math.max(0, state.shake - dt * 10);
    updateBots();
    for (var i = state.particles.length - 1; i >= 0; i--) {
      var particle = state.particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 28 * dt;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    processQueuedActions();
  }

  function processQueuedActions() {
    var count = Math.min(queuedActions.length, 12);
    for (var i = 0; i < count; i++) {
      var action = queuedActions.shift();
      if (action.type === "card" && action.card < state.cards.length) {
        var match = -1;
        state.cards[action.card].cells.some(function (cell, index) {
          if (!cell.free && !cell.marked && cell.value === state.currentCall) { match = index; return true; }
          return false;
        });
        if (match >= 0) markPlayerCell(action.card, match);
        else setFeedback("That card has no live match for this flare.");
      }
    }
    if (queuedActions.length > 32) queuedActions.splice(0, queuedActions.length - 32);
  }

  function setFeedback(message) {
    state.feedback = String(message).slice(0, 80);
    state.feedbackTimer = 2.4;
  }

  function burst(x, y, color, amount) {
    var cap = 120;
    var room = cap - state.particles.length;
    var count = Math.min(amount, Math.max(0, room));
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * TAU;
      var speed = 20 + Math.random() * 95;
      state.particles.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18, life: 0.45 + Math.random() * 0.55, size: 2 + Math.random() * 3, color: color });
    }
  }

  function later(callback, delay) {
    if (pendingTimeouts.size >= 16) {
      pendingTimeouts.forEach(function (timer) { clearTimeout(timer); });
      pendingTimeouts.clear();
    }
    var timer = setTimeout(function () {
      pendingTimeouts.delete(timer);
      callback();
    }, delay);
    pendingTimeouts.add(timer);
    return timer;
  }

  function clearInput() {
    pointerMap.clear();
    heldKeys.clear();
    queuedActions.length = 0;
    pendingTimeouts.forEach(function (timer) { clearTimeout(timer); });
    pendingTimeouts.clear();
  }

  function unlockAudio() {
    try {
      if (!audioContext) {
        var AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) audioContext = new AudioCtor();
      }
      if (audioContext && audioContext.state === "suspended") audioContext.resume();
    } catch (error) {
      audioContext = null;
    }
  }

  function tone(frequency, duration, type, volume) {
    if (!audioContext) return;
    try {
      var now = audioContext.currentTime;
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume || 0.025), now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch (error) {
      /* Audio is decorative and can be unavailable in a locked-down browser. */
    }
  }

  function rounded(x, y, w, h, radius) {
    var r = Math.min(radius, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillRound(x, y, w, h, radius, color) {
    rounded(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeRound(x, y, w, h, radius, color, lineWidth) {
    rounded(x, y, w, h, radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 1;
    ctx.stroke();
  }

  function label(text, x, y, size, color, align, weight) {
    ctx.fillStyle = color || "#f6f8fb";
    ctx.font = (weight || 600) + " " + size + "px system-ui, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function resize() {
    width = Math.max(1, window.innerWidth || 390);
    height = Math.max(1, window.innerHeight || 700);
    var longAxis = Math.max(width, height);
    var dpr = Math.min(2, window.devicePixelRatio || 1, 960 / longAxis);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var locked = width > height;
    if (locked !== state.orientationLocked) {
      state.orientationLocked = locked;
      if (locked) clearInput();
      lastFrame = performance.now();
    }
    orientationCover.hidden = !locked;
  }

  function computeLayout() {
    layout.cards = [];
    layout.cells = [];
    layout.chips = [];
    layout.bot = { x: width - 104, y: 8, w: 92, h: 48 };
    var cardSize = Math.min(190, Math.floor((width - 32) / 2));
    var rows = Math.ceil(state.cards.length / 2);
    var cardY = Math.min(270, height - rows * cardSize - 42);
    cardY = Math.max(232, cardY);
    var gap = 8;
    var gridInset = 6;
    var gridTop = 24;
    for (var i = 0; i < state.cards.length; i++) {
      var x = 12 + (i % 2) * (cardSize + gap);
      var y = cardY + Math.floor(i / 2) * (cardSize + gap);
      var rect = { x: x, y: y, w: cardSize, h: cardSize, gridX: x + gridInset, gridY: y + gridTop, cell: (cardSize - gridInset * 2) / 5, index: i };
      layout.cards.push(rect);
      for (var cell = 0; cell < 25; cell++) {
        var col = Math.floor(cell / 5);
        var row = cell % 5;
        layout.cells.push({ x: rect.gridX + col * rect.cell, y: rect.gridY + row * rect.cell, w: rect.cell, h: rect.cell, cx: rect.gridX + (col + .5) * rect.cell, cy: rect.gridY + (row + .5) * rect.cell, card: i, index: cell });
      }
    }
    var chipWidth = (width - 40) / 3;
    for (var chip = 0; chip < 3; chip++) layout.chips.push({ x: 12 + chip * (chipWidth + 8), y: 164, w: chipWidth, h: 48, index: chip });
    layout.start = { x: 20, y: height * 0.5 - 92, w: width - 40, h: 184 };
    layout.end = { x: 28, y: height * 0.5 + 54, w: width - 56, h: 56 };
  }

  function cellCenter(cardIndex, cellIndex) {
    var rect = layout.cells.find(function (entry) { return entry.card === cardIndex && entry.index === cellIndex; });
    return rect ? { x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.5 } : { x: width * 0.5, y: height * 0.5 };
  }

  function drawBackground() {
    var theme = THEMES[state.roomIndex];
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.14;
    for (var i = 0; i < 7; i++) {
      var x = (i * 71 + 28) % (width + 80) - 40;
      var y = 38 + (i * 97) % Math.max(100, height - 80);
      ctx.fillStyle = i % 2 ? theme.cool : theme.glow;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.fillRect(0, 0, width, 58);
  }

  function drawHeader() {
    var theme = THEMES[state.roomIndex];
    label("LANTERN", 14, 17, 12, theme.glow, "left", 800);
    label("BINGO", 14, 35, 17, "#f7fbff", "left", 800);
    label("ROOM " + (state.roomIndex + 1) + "/4", 126, 18, 10, "#91a1b5", "left", 700);
    label(theme.name, 126, 37, 12, "#e6ebf3", "left", 700);
    fillRound(layout.bot.x, layout.bot.y, layout.bot.w, layout.bot.h, 13, "#182639");
    strokeRound(layout.bot.x, layout.bot.y, layout.bot.w, layout.bot.h, 13, "#40536b", 1);
    label("BOT SCOUT", layout.bot.x + layout.bot.w / 2, layout.bot.y + 24, 10, "#d4e1ed", "center", 800);
    label("SPARKS ∞", 14, 61, 10, "#718197", "left", 700);
    label("BEST " + (save.best[state.roomIndex] || 0), width - 14, 61, 10, "#718197", "right", 700);
  }

  function drawCaller() {
    var theme = THEMES[state.roomIndex];
    fillRound(12, 70, width - 24, 84, 18, "rgba(11,18,29,.78)");
    strokeRound(12, 70, width - 24, 84, 18, "#2d4057", 1);
    var cx = 60;
    var cy = 112;
    var pulse = state.currentCall !== null && state.callLive ? Math.sin(state.callElapsed * 9) * 2 : 0;
    ctx.fillStyle = state.callLive ? theme.glow : "#556375";
    ctx.globalAlpha = 0.16;
    ctx.beginPath(); ctx.arc(cx, cy, 35 + pulse, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = state.callLive ? theme.glow : "#2d3a4b";
    ctx.beginPath(); ctx.arc(cx, cy, 27, 0, TAU); ctx.fill();
    label(state.currentCall === null ? "—" : String(state.currentCall), cx, cy + 1, 22, "#101722", "center", 900);
    label("LIVE FLARE", 98, 88, 10, theme.glow, "left", 800);
    label(state.callLive ? "Catch it on your cards" : "That number is gone", 98, 108, 14, "#f4f7fb", "left", 700);
    var left = Math.max(0, state.callInterval - state.callElapsed);
    label(state.started && !state.ended ? left.toFixed(1) + "s to next" : "room ready", 98, 133, 11, "#9eacc0", "left", 600);
    if (state.peekTimer > 0 && state.peekNumbers.length) {
      label("NEXT", width - 18, 91, 9, theme.cool, "right", 800);
      label(state.peekNumbers.join("  ·  "), width - 18, 111, 13, "#e8f4f1", "right", 800);
      label(state.peekTimer.toFixed(1) + "s", width - 18, 133, 10, "#9eacc0", "right", 600);
    } else {
      label("CALL " + state.callCursor + "/75", width - 18, 111, 12, "#b2bed0", "right", 700);
      label(state.recentCalls.slice(1, 4).join(" · ") || "watch the glow", width - 18, 133, 10, "#718197", "right", 600);
    }
  }

  function drawChip(rect, index) {
    var theme = THEMES[state.roomIndex];
    var count = state.powerCounts[index];
    var active = index === 1 && state.doubleTimer > 0;
    var color = index === 0 ? theme.glow : index === 1 ? theme.hot : theme.cool;
    fillRound(rect.x, rect.y, rect.w, rect.h, 13, count || active ? "#1d2c3c" : "#121d2b");
    strokeRound(rect.x, rect.y, rect.w, rect.h, 13, count || active ? color : "#304052", count || active ? 1.5 : 1);
    label(POWER_NAMES[index], rect.x + 10, rect.y + 16, 10, color, "left", 900);
    var sub = index === 0 ? "one flare" : index === 1 ? (active ? state.doubleTimer.toFixed(1) + "s" : "score x2") : "3 calls";
    label(sub, rect.x + 10, rect.y + 34, 10, "#b0bdcc", "left", 600);
    fillRound(rect.x + rect.w - 32, rect.y + 8, 24, 30, 9, count ? color : "#273548");
    label(String(count), rect.x + rect.w - 20, rect.y + 23, 13, count ? "#101722" : "#8595a8", "center", 900);
  }

  function drawStatus() {
    var theme = THEMES[state.roomIndex];
    var y = layout.cards.length ? layout.cards[0].y - 31 : 230;
    label(goalName(), 14, y, 10, theme.cool, "left", 900);
    label("PROGRESS " + playerProgress(), width - 14, y, 10, "#aab7c8", "right", 700);
    var barY = y + 11;
    var barW = width - 28;
    var ratio = state.roomIndex === 0 ? clamp(playerProgress() / 5, 0, 1) : state.roomIndex === 1 ? clamp(playerProgress() / 4, 0, 1) : state.roomIndex === 2 ? clamp(playerProgress() / 2, 0, 1) : clamp(playerProgress() / 25, 0, 1);
    fillRound(14, barY, barW, 5, 3, "#253448");
    fillRound(14, barY, barW * ratio, 5, 3, theme.glow);
    label("STREAK " + state.streak + "   CHARGE " + state.charge + "/3", 14, barY + 18, 10, "#8797ab", "left", 700);
    label("SCORE " + state.score + "   " + formatTime(state.timer), width - 14, barY + 18, 10, state.doubleTimer > 0 ? theme.hot : "#8797ab", "right", 700);
  }

  function drawCards() {
    var theme = THEMES[state.roomIndex];
    state.cards.forEach(function (card, cardIndex) {
      var rect = layout.cards[cardIndex];
      fillRound(rect.x, rect.y, rect.w, rect.h, 15, "rgba(17,27,41,.94)");
      strokeRound(rect.x, rect.y, rect.w, rect.h, 15, "#344860", 1);
      label("LANTERN " + String.fromCharCode(65 + cardIndex), rect.x + 9, rect.y + 13, 10, "#b3c1d1", "left", 800);
      label("tap the flare", rect.x + rect.w - 9, rect.y + 13, 9, "#6f8298", "right", 600);
      for (var i = 0; i < 25; i++) {
        var cellRect = layout.cells.find(function (entry) { return entry.card === cardIndex && entry.index === i; });
        var cell = card.cells[i];
        var live = !cell.free && !cell.marked && state.callLive && cell.value === state.currentCall;
        var color = cell.free ? "#2c5660" : cell.marked ? theme.glow : live ? "#4f4f32" : "#1d2b3d";
        fillRound(cellRect.x + 1, cellRect.y + 1, cellRect.w - 2, cellRect.h - 2, 6, color);
        if (live) {
          strokeRound(cellRect.x + 1, cellRect.y + 1, cellRect.w - 2, cellRect.h - 2, 6, "#fff0a8", 2);
          ctx.globalAlpha = 0.18 + (Math.sin(state.callElapsed * 11) + 1) * 0.08;
          fillRound(cellRect.x - 1, cellRect.y - 1, cellRect.w + 2, cellRect.h + 2, 7, theme.glow);
          ctx.globalAlpha = 1;
        }
        if (cell.marked && !cell.free) {
          ctx.globalAlpha = 0.23;
          fillRound(cellRect.x, cellRect.y, cellRect.w, cellRect.h, 7, "#fff4b5");
          ctx.globalAlpha = 1;
        }
        label(cell.free ? "✦" : String(cell.value), cellRect.x + cellRect.w / 2, cellRect.y + cellRect.h / 2 + 1, Math.max(11, Math.min(16, cellRect.w * 0.43)), cell.free ? "#d4f0e4" : cell.marked ? "#111923" : live ? "#fff0ad" : "#d8e1ed", "center", 800);
      }
    });
    var hintY = Math.min(height - 17, layout.cards.length ? layout.cards[layout.cards.length - 1].y + layout.cards[layout.cards.length - 1].h + 22 : height - 17);
    label(state.feedbackTimer > 0 ? state.feedback : "Tap the called number • keys 1–4 daub cards", width / 2, hintY, 10, state.feedbackTimer > 0 ? theme.glow : "#7e8fa5", "center", 700);
  }

  function drawParticles() {
    state.particles.forEach(function (particle) {
      ctx.globalAlpha = clamp(particle.life, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
  }

  function formatTime(seconds) {
    var whole = Math.max(0, Math.floor(seconds));
    var mins = Math.floor(whole / 60);
    var secs = String(whole % 60).padStart(2, "0");
    return mins + ":" + secs;
  }

  function drawStartOverlay() {
    var theme = THEMES[state.roomIndex];
    var box = layout.start;
    ctx.fillStyle = "rgba(4,8,14,.68)";
    ctx.fillRect(0, 0, width, height);
    fillRound(box.x, box.y, box.w, box.h, 22, "#142237");
    strokeRound(box.x, box.y, box.w, box.h, 22, theme.glow, 1.5);
    label("ROOM " + (state.roomIndex + 1) + "  ·  " + theme.name.toUpperCase(), width / 2, box.y + 29, 11, theme.glow, "center", 900);
    label("Catch the live flares", width / 2, box.y + 67, 23, "#f8fbff", "center", 850);
    label("Your cards stay visible. Miss a call and it fades.", width / 2, box.y + 99, 12, "#adbbcc", "center", 600);
    fillRound(box.x + 28, box.y + 122, box.w - 56, 48, 14, theme.glow);
    label("TAP TO LIGHT THE ROOM", width / 2, box.y + 146, 12, "#101722", "center", 900);
  }

  function drawEndOverlay() {
    var theme = THEMES[state.roomIndex];
    var boxY = height * 0.5 - 145;
    var boxH = 322;
    ctx.fillStyle = "rgba(4,8,14,.72)";
    ctx.fillRect(0, 0, width, height);
    fillRound(20, boxY, width - 40, boxH, 24, "#121e2e");
    strokeRound(20, boxY, width - 40, boxH, 24, state.result === "win" ? theme.glow : "#718198", 1.5);
    label(state.result === "win" ? "ROOM LIT" : "ROOM LOST", width / 2, boxY + 42, 28, state.result === "win" ? theme.glow : "#f28b82", "center", 900);
    label(state.resultReason, width / 2, boxY + 82, 12, "#bdc8d6", "center", 600);
    label("SCORE  " + state.score, width / 2, boxY + 126, 16, "#f6f8fb", "center", 800);
    label("BEST   " + save.best[state.roomIndex], width / 2, boxY + 151, 11, "#8799af", "center", 700);
    if (state.result === "win" && state.roomIndex === 3) {
      label("✦ BLACKOUT CROWN SAVED ✦", width / 2, boxY + 184, 12, theme.glow, "center", 900);
    } else if (state.result === "win") {
      label("Next room unlocked", width / 2, boxY + 184, 12, theme.cool, "center", 800);
    } else {
      label("The room keeps its pattern. Try again.", width / 2, boxY + 184, 11, "#8799af", "center", 600);
    }
    var button = layout.end;
    button.y = boxY + 230;
    button.h = 56;
    layout.end = button;
    fillRound(button.x, button.y, button.w, button.h, 15, state.result === "win" ? theme.glow : "#304259");
    label(state.result === "win" && state.roomIndex < 3 ? "NEXT ROOM" : "REPLAY ROOM", width / 2, button.y + 28, 13, state.result === "win" ? "#101722" : "#f4f7fb", "center", 900);
  }

  function drawBotView() {
    var theme = THEMES[state.roomIndex];
    var x = 10;
    var y = 66;
    var w = width - 20;
    var h = height - 78;
    fillRound(x, y, w, h, 20, "#0e1724");
    strokeRound(x, y, w, h, 20, "#52677f", 1.5);
    label("BOT ROOM", x + 16, y + 22, 16, theme.glow, "left", 900);
    label("honest cards · live marks", x + 16, y + 44, 10, "#93a3b7", "left", 600);
    fillRound(x + w - 70, y + 10, 56, 42, 12, "#26374d");
    label("CLOSE", x + w - 42, y + 31, 10, "#e5edf6", "center", 800);
    var rowStart = y + 62;
    var rowH = Math.max(52, Math.min(76, (h - 74) / 7));
    var mini = Math.max(38, Math.min(64, rowH - 10));
    state.bots.forEach(function (bot, index) {
      var rowY = rowStart + index * rowH;
      if (rowY + rowH > y + h - 4) return;
      if (index % 2 === 0) fillRound(x + 8, rowY, w - 16, rowH - 3, 10, "rgba(25,39,56,.7)");
      label(bot.name.toUpperCase(), x + 18, rowY + 17, 10, bot.finished ? theme.hot : "#d5dfeb", "left", 900);
      label(bot.finished ? "SOLVED" : "" + botProgress(bot) + (state.roomIndex === 3 ? "/25" : state.roomIndex === 1 ? "/4" : state.roomIndex === 2 ? "/2" : "/5"), x + 18, rowY + 36, 10, bot.finished ? theme.hot : "#7f93aa", "left", 700);
      var barW = Math.max(45, w - mini - 112);
      fillRound(x + 73, rowY + rowH - 18, barW, 5, 3, "#27374a");
      var max = state.roomIndex === 3 ? 25 : state.roomIndex === 1 ? 4 : state.roomIndex === 2 ? 2 : 5;
      fillRound(x + 73, rowY + rowH - 18, barW * clamp(botProgress(bot) / max, 0, 1), 5, 3, bot.finished ? theme.hot : theme.cool);
      drawMiniCard(bot.card, width - 18 - mini, rowY + (rowH - mini) / 2, mini, theme);
    });
    label("Your view does not pause the race.", width / 2, height - 13, 10, "#718399", "center", 600);
  }

  function drawMiniCard(card, x, y, size, theme) {
    var cell = size / 5;
    strokeRound(x, y, size, size, 5, "#435970", 1);
    for (var i = 0; i < 25; i++) {
      var col = Math.floor(i / 5);
      var row = i % 5;
      var entry = card.cells[i];
      ctx.fillStyle = entry.marked ? theme.glow : "#1c2b3d";
      ctx.fillRect(x + col * cell + 1, y + row * cell + 1, cell - 2, cell - 2);
    }
  }

  function draw() {
    computeLayout();
    drawBackground();
    ctx.save();
    if (state.shake > 0 && !state.orientationLocked) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    drawHeader();
    drawCaller();
    state.chips = layout.chips;
    layout.chips.forEach(function (rect, index) { drawChip(rect, index); });
    drawStatus();
    drawCards();
    drawParticles();
    if (state.flash > 0) {
      ctx.globalAlpha = state.flash;
      ctx.fillStyle = THEMES[state.roomIndex].glow;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (state.botView) drawBotView();
    else if (!state.started) drawStartOverlay();
    else if (state.ended) drawEndOverlay();
  }

  function inside(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function toLocal(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (width / rect.width), y: (event.clientY - rect.top) * (height / rect.height) };
  }

  function hitTest(point) {
    if (state.orientationLocked || document.hidden) return null;
    if (state.botView) {
      var close = { x: width - 80, y: 72, w: 66, h: 58 };
      return inside(point, close) ? { kind: "closeBots" } : null;
    }
    if (!state.started) return inside(point, layout.start) ? { kind: "start" } : null;
    if (state.ended) return inside(point, layout.end) ? { kind: "end" } : null;
    if (inside(point, layout.bot)) return { kind: "bots" };
    for (var i = 0; i < layout.chips.length; i++) if (inside(point, layout.chips[i])) return { kind: "chip", index: i };
    var nearest = null, nearestDistance = Infinity;
    for (var c = 0; c < layout.cells.length; c++) {
      var cell = layout.cells[c];
      var distance = Math.hypot(point.x - cell.cx, point.y - cell.cy);
      if (distance <= 24 && distance < nearestDistance) { nearest = cell; nearestDistance = distance; }
    }
    return nearest ? { kind: "cell", card: nearest.card, index: nearest.index } : null;
  }

  function sameHit(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === "cell") return a.card === b.card && a.index === b.index;
    if (a.kind === "chip") return a.index === b.index;
    return true;
  }

  function invokeHit(hit) {
    if (!hit) return;
    if (hit.kind === "start") beginRun(state.roomIndex);
    if (hit.kind === "end") {
      var next = state.result === "win" && state.roomIndex < 3 ? state.roomIndex + 1 : state.roomIndex;
      beginRun(next);
    }
    if (hit.kind === "bots") state.botView = true;
    if (hit.kind === "closeBots") state.botView = false;
    if (hit.kind === "chip") usePower(hit.index);
    if (hit.kind === "cell") markPlayerCell(hit.card, hit.index);
  }

  function onPointerDown(event) {
    event.preventDefault();
    unlockAudio();
    if (state.orientationLocked || document.hidden) return;
    var id = event.pointerId;
    var point = toLocal(event);
    var hit = hitTest(point);
    if (hit) {
      if (pointerMap.size >= 16) pointerMap.clear();
      pointerMap.set(id, hit);
    }
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(id); } catch (error) { /* pointer may already be gone */ }
    }
  }

  function onPointerUp(event) {
    event.preventDefault();
    var id = event.pointerId;
    var down = pointerMap.get(id);
    pointerMap.delete(id);
    if (!down || state.orientationLocked || document.hidden) return;
    var up = hitTest(toLocal(event));
    if (sameHit(down, up)) invokeHit(down);
  }

  function onPointerCancel(event) {
    event.preventDefault();
    pointerMap.delete(event.pointerId);
  }

  function onKeyDown(event) {
    if (state.orientationLocked || document.hidden) { clearInput(); return; }
    unlockAudio();
    if (heldKeys.has(event.key)) return;
    if (heldKeys.size >= 64) heldKeys.clear();
    heldKeys.add(event.key);
    var key = event.key.toLowerCase();
    if (key === " " || key === "enter") {
      event.preventDefault();
      if (!state.started) beginRun(state.roomIndex);
      else if (state.ended) invokeHit({ kind: "end" });
    } else if (key === "v") {
      event.preventDefault();
      state.botView = !state.botView;
    } else if (key === "escape" && state.botView) {
      event.preventDefault();
      state.botView = false;
    } else if (key === "r") {
      event.preventDefault();
      if (state.started) beginRun(state.roomIndex);
    } else if (state.started && !state.ended && /^[1-4]$/.test(event.key)) {
      event.preventDefault();
      queuedActions.push({ type: "card", card: Number(event.key) - 1 });
      if (queuedActions.length > 32) queuedActions.shift();
    }
  }

  function onKeyUp(event) {
    heldKeys.delete(event.key);
  }

  function loop(now) {
    var dt = lastFrame ? Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerCancel, { passive: false });
  canvas.addEventListener("touchstart", function (event) { event.preventDefault(); }, { passive: false });
  canvas.addEventListener("touchmove", function (event) { event.preventDefault(); }, { passive: false });
  canvas.addEventListener("touchend", function (event) { event.preventDefault(); }, { passive: false });
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", function () { clearInput(); lastFrame = performance.now(); });
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("orientationchange", resize, { passive: true });

  resetRun(state.roomIndex);
  state.started = false;
  resize();
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}());
