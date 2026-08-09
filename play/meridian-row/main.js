/* Meridian Row - canvas, input, render, loop */
'use strict';

var LW = 390, LH = 700;
var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d', { alpha: false });

var BX = 12, BY = 84, BS = 366, TS = BS / 7;
var CX = BX + TS + 4, CY = BY + TS + 4, CW = BS - 2 * TS - 8;

var parts = new Particles();
var floats = new Floaters();
var shakeT = 0, shakeMag = 0;
var flashT = 0, flashCol = '#fff';
var paused = false, rotate = false;
var started = false;

var UI = { buttons: [], focus: 0, kb: false, pointers: Object.create(null), album: false, tab: 0, press: null };

function shake(m) { shakeMag = Math.max(shakeMag, m); shakeT = 0.28; }
function flash(c) { flashCol = c; flashT = 0.18; }

function tileCenter(i) {
  var t = TILES[i];
  return { x: BX + t.col * TS + TS / 2, y: BY + t.row * TS + TS / 2 };
}
function fxAt(p, text, col) {
  var c = tileCenter(p.pos);
  floats.add(c.x, c.y - 10, text, col);
  parts.burst(c.x, c.y, col, 10, 130, 0.55);
  flash(col);
}

/* ---------------- resize ---------------- */
var cssRect = { l: 0, t: 0, w: LW, h: LH };
function resize() {
  var vw = window.innerWidth, vh = window.innerHeight;
  var s = Math.min(vw / LW, vh / LH);
  var cw = Math.max(1, Math.floor(LW * s)), ch = Math.max(1, Math.floor(LH * s));
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (LH * dpr > 960) dpr = 960 / LH;
  canvas.width = Math.round(LW * dpr);
  canvas.height = Math.round(LH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var wasRotate = rotate;
  rotate = (vw > vh) && (vh < 560);
  if (rotate && !wasRotate) resetInput();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

/* ---------------- UI build ---------------- */
function btn(id, x, y, w, h, label, sub, col, ok, act) {
  UI.buttons.push({ id: id, x: x, y: y, w: w, h: h, label: label, sub: sub || '', col: col || '#3a4a66', ok: ok !== false, act: act });
}
function buildUI() {
  UI.buttons.length = 0;
  if (!started) { btn('start', 0, 0, LW, LH, '', '', '#000', true, doStart); return; }
  if (rotate) return;
  if (UI.album) {
    for (var i = 0; i < 4; i++) {
      btn('tab' + i, 12 + i * 92, 96, 88, 48, DISTRICTS[i].name, '', DISTRICTS[i].col, true,
        (function (n) { return function () { UI.tab = n; Snd.play('tap'); }; })(i));
    }
    btn('close', 100, 630, 190, 54, 'CLOSE', '', '#3a4a66', true, function () { UI.album = false; Snd.play('tap'); });
    return;
  }
  if (G.state === 'over') {
    var won = G.winner === 0;
    btn('again', 20, 560, 350, 62, won ? 'NEXT BOARD' : 'RETRY BOARD', '', won ? '#4fd08a' : '#ff9c5d', true, function () {
      startBoard(won ? G.level + 1 : G.level);
    });
    btn('album', 20, 630, 168, 54, 'ALBUMS', '', '#c58cff', true, openAlbum);
    btn('restart', 202, 630, 168, 54, 'BOARD 1', '', '#3a4a66', true, function () { startBoard(1); });
    return;
  }
  if (G.state === 'choice' && G.choices) {
    for (var k = 0; k < G.choices.length; k++) {
      var c = G.choices[k];
      btn('card' + k, 16, 536 + k * 54, 358, 50, c.t, c.s, c.c, c.ok,
        (function (n) { return function () { takeChoice(n); }; })(k));
    }
    return;
  }
  if (G.state === 'idle') {
    btn('roll', 16, 532, 238, 152, 'ROLL', '', '#4aa3ff', true, function () { Snd.play('tap'); doRoll(); });
    btn('album', 262, 532, 112, 72, 'ALBUMS', '', '#c58cff', true, openAlbum);
    btn('restart', 262, 612, 112, 72, 'RESTART', '', '#3a4a66', true, function () { startBoard(G.level); });
  }
}
function openAlbum() {
  if (G.players.length) UI.album = true;
  UI.tab = 0; UI.focus = 0; Snd.play('tap');
}
function doStart() {
  Snd.unlock();
  var st = Store.read();
  G.boardsWon = st.boardsWon; G.bestTurns = st.bestTurns;
  started = true;
  startBoard(st.level);
  Snd.play('coin');
}

/* ---------------- input (hardening #2, #3) ---------------- */
function resetInput() {
  UI.pointers = Object.create(null);
  UI.press = null;
  UI.focus = 0;
  UI.album = false;
  keys = Object.create(null);
}
var keys = Object.create(null);

function toLocal(e) {
  var r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / Math.max(1, r.width) * LW,
    y: (e.clientY - r.top) / Math.max(1, r.height) * LH
  };
}
function hit(p) {
  for (var i = UI.buttons.length - 1; i >= 0; i--) {
    var b = UI.buttons[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
  }
  return null;
}
function onDown(e) {
  e.preventDefault();
  Snd.unlock();
  if (rotate || document.hidden) return;
  var p = toLocal(e), b = hit(p);
  UI.pointers[e.pointerId] = b ? b.id : null;
  if (Object.keys(UI.pointers).length > 8) delete UI.pointers[Object.keys(UI.pointers)[0]];
  if (b) { UI.press = b.id; UI.kb = false; }
}
function onMove(e) {
  if (!(e.pointerId in UI.pointers)) return;
  e.preventDefault();
  var id = UI.pointers[e.pointerId];
  if (!id) return;
  var p = toLocal(e), b = hit(p);
  UI.press = (b && b.id === id) ? id : null;
}
function onUp(e) {
  if (!(e.pointerId in UI.pointers)) return;
  e.preventDefault();
  var id = UI.pointers[e.pointerId];
  delete UI.pointers[e.pointerId];
  UI.press = null;
  if (!id || rotate || document.hidden) return;
  var p = toLocal(e), b = hit(p);
  if (b && b.id === id) {
    if (b.ok && b.act) b.act();
    else Snd.play('block');
  }
}
function onCancel(e) {
  if (e.pointerId in UI.pointers) delete UI.pointers[e.pointerId];
  UI.press = null;
}
canvas.addEventListener('pointerdown', onDown, { passive: false });
canvas.addEventListener('pointermove', onMove, { passive: false });
canvas.addEventListener('pointerup', onUp, { passive: false });
canvas.addEventListener('pointercancel', onCancel, { passive: false });
canvas.addEventListener('pointerleave', onCancel, { passive: false });
canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
window.addEventListener('blur', function () {
  UI.pointers = Object.create(null); UI.press = null; keys = Object.create(null);
});
document.addEventListener('visibilitychange', function () { resetInput(); paused = rotate || document.hidden; last = 0; });

window.addEventListener('keydown', function (e) {
  var k = e.key;
  if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') e.preventDefault();
  if (keys[k]) return;
  keys[k] = 1;
  Snd.unlock();
  if (!started) { doStart(); return; }
  if (rotate || document.hidden) return;
  if (k === 'Escape') { if (UI.album) { UI.album = false; Snd.play('tap'); } return; }
  if (k === 'a' || k === 'A') { if (!UI.album && G.state !== 'over') openAlbum(); else UI.album = false; return; }
  if (k === 'r' || k === 'R') { startBoard(G.level); return; }
  var bs = UI.buttons;
  if (!bs.length) return;
  if (k === 'ArrowLeft' || k === 'ArrowUp') { UI.kb = true; UI.focus = (UI.focus - 1 + bs.length) % bs.length; Snd.play('step'); return; }
  if (k === 'ArrowRight' || k === 'ArrowDown') { UI.kb = true; UI.focus = (UI.focus + 1) % bs.length; Snd.play('step'); return; }
  if (k === ' ' || k === 'Enter') {
    var b = bs[clamp(UI.focus, 0, bs.length - 1)];
    if (b && b.ok && b.act) b.act(); else Snd.play('block');
  }
  if (k >= '1' && k <= '3' && G.state === 'choice') takeChoice((+k) - 1);
});
window.addEventListener('keyup', function (e) { delete keys[e.key]; });

/* ---------------- drawing ---------------- */
function drawHUD() {
  ctx.fillStyle = '#131926';
  ctx.fillRect(0, 0, LW, 78);
  ctx.fillStyle = '#243049';
  ctx.fillRect(0, 77, LW, 1);

  ctx.textAlign = 'left'; fnt(ctx, '800', 17);
  ctx.fillStyle = '#eaf3ff';
  ctx.fillText('MERIDIAN', 14, 27);
  ctx.fillStyle = '#4aa3ff';
  ctx.fillText('ROW', 122, 27);

  ctx.textAlign = 'right'; fnt(ctx, '600', 12);
  ctx.fillStyle = '#8fa3c0';
  ctx.fillText('BOARD ' + G.level + '   WON ' + G.boardsWon + (G.bestTurns ? '   BEST ' + G.bestTurns + 'T' : ''), 376, 26);

  var p = G.players[0];
  if (!p) return;
  // coins
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath(); ctx.arc(24, 55, 9, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#131926'; fnt(ctx, '800', 11); ctx.textAlign = 'center';
  ctx.fillText('C', 24, 59);
  ctx.textAlign = 'left'; fnt(ctx, '800', 19); ctx.fillStyle = '#ffd24a';
  ctx.fillText(String(p.coins), 38, 62);
  // shields
  var sx = 120;
  ctx.fillStyle = '#58e0c8';
  ctx.beginPath(); ctx.moveTo(sx, 45); ctx.lineTo(sx + 9, 49); ctx.lineTo(sx + 9, 58);
  ctx.lineTo(sx, 65); ctx.lineTo(sx - 9, 58); ctx.lineTo(sx - 9, 49); ctx.closePath(); ctx.fill();
  fnt(ctx, '800', 19); ctx.fillStyle = '#58e0c8';
  ctx.fillText(String(p.shields), sx + 15, 62);
  // turn + time
  ctx.textAlign = 'right'; fnt(ctx, '700', 13); ctx.fillStyle = '#8fa3c0';
  var t = Math.floor(G.elapsed), mm = Math.floor(t / 60), ss = t % 60;
  ctx.fillText('TURN ' + G.turns + '    ' + mm + ':' + (ss < 10 ? '0' : '') + ss, 376, 61);
}

function drawTile(t) {
  var x = BX + t.col * TS, y = BY + t.row * TS;
  var pad = 1.5, w = TS - pad * 2, h = TS - pad * 2;
  var base = '#1a2334', edge = '#2c3a54';
  if (t.kind === 'gate') base = '#3a2f18';
  if (t.kind === 'corner') base = '#22293c';
  if (t.kind === 'event') base = '#241f38';
  ctx.fillStyle = base;
  rrect(ctx, x + pad, y + pad, w, h, 5); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();

  ctx.textAlign = 'center';
  if (t.kind === 'land') {
    var d = DISTRICTS[t.d];
    ctx.fillStyle = d.col;
    ctx.fillRect(x + pad + 3, y + pad + 3, w - 6, 8);
    // tier ticks show YOUR progress in that district
    var me = G.players[0];
    if (me) {
      for (var i = 0; i < 3; i++) {
        ctx.fillStyle = (me.dist[t.d] > i) ? d.col : '#2c3a54';
        ctx.fillRect(x + pad + 5 + i * 12, y + h - 12, 9, 7);
      }
    }
    fnt(ctx, '800', 9); ctx.fillStyle = '#c8d6ea';
    ctx.fillText(d.name.slice(0, 5).toUpperCase(), x + TS / 2, y + TS / 2 + 3);
  } else if (t.kind === 'event') {
    ctx.fillStyle = '#c58cff';
    ctx.beginPath();
    ctx.moveTo(x + TS / 2, y + 14); ctx.lineTo(x + TS - 15, y + TS / 2);
    ctx.lineTo(x + TS / 2, y + TS - 14); ctx.lineTo(x + 15, y + TS / 2);
    ctx.closePath(); ctx.fill();
    fnt(ctx, '800', 9); ctx.fillStyle = '#1a1430';
    ctx.fillText('?', x + TS / 2, y + TS / 2 + 4);
  } else if (t.kind === 'gate') {
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(x + 10, y + 12, TS - 20, 5);
    fnt(ctx, '800', 9); ctx.fillStyle = '#ffd24a';
    ctx.fillText('GATE', x + TS / 2, y + TS / 2 + 2);
    fnt(ctx, '700', 8); ctx.fillStyle = '#8a7a4a';
    ctx.fillText('+20', x + TS / 2, y + TS / 2 + 13);
  } else {
    var own = G.corners[t.i];
    ctx.fillStyle = own >= 0 ? PCOL[own] : '#3a4a66';
    ctx.fillRect(x + 9, y + 11, TS - 18, 6);
    fnt(ctx, '800', 8); ctx.fillStyle = '#c8d6ea';
    var nm = CORNERNAME[t.i].split(' ');
    ctx.fillText(nm[0].toUpperCase(), x + TS / 2, y + TS / 2 + 1);
    fnt(ctx, '700', 8); ctx.fillStyle = own >= 0 ? PCOL[own] : '#5d6f8c';
    ctx.fillText(own >= 0 ? PNAME[own].split(' ')[0].toUpperCase() : 'OPEN', x + TS / 2, y + TS / 2 + 12);
  }
}

function drawTokens() {
  var slots = [[-9, -9], [9, -9], [-9, 9], [9, 9]];
  for (var i = 3; i >= 0; i--) {
    var p = G.players[i]; if (!p) continue;
    var c = tileCenter(p.pos);
    var lift = 0;
    if (G.state === 'moving' && G.cur === i) lift = -Math.abs(Math.sin(G.hopT / 0.12 * Math.PI)) * 7;
    var x = c.x + slots[i][0], y = c.y + slots[i][1] + lift;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(x, c.y + slots[i][1] + 6, 8, 3.4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(x, y, G.cur === i ? 9 : 7.5, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#0b0f18'; ctx.lineWidth = 1.6; ctx.stroke();
    if (G.cur === i && G.winner < 0) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(G.elapsed * 6) * 1.5, 0, 6.283); ctx.stroke();
    }
    ctx.fillStyle = '#0b0f18'; fnt(ctx, '800', 9); ctx.textAlign = 'center';
    ctx.fillText(i === 0 ? 'Y' : String(i), x, y + 3);
  }
}

function drawDie(x, y, s, v) {
  ctx.fillStyle = '#eef4ff';
  rrect(ctx, x, y, s, s, 7); ctx.fill();
  ctx.strokeStyle = '#93a6c4'; ctx.lineWidth = 1; ctx.stroke();
  var pip = [[], [[.5, .5]], [[.28, .28], [.72, .72]],
    [[.26, .26], [.5, .5], [.74, .74]],
    [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
    [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]]][v] || [];
  ctx.fillStyle = '#16203a';
  for (var i = 0; i < pip.length; i++) {
    ctx.beginPath(); ctx.arc(x + pip[i][0] * s, y + pip[i][1] * s, s * 0.075, 0, 6.283); ctx.fill();
  }
}

function drawCenter() {
  ctx.fillStyle = '#0f1522';
  rrect(ctx, CX, CY, CW, CW, 8); ctx.fill();
  ctx.strokeStyle = '#22304a'; ctx.lineWidth = 1; ctx.stroke();

  var me = G.players[0]; if (!me) return;
  ctx.textAlign = 'left'; fnt(ctx, '800', 11); ctx.fillStyle = '#6c80a0';
  ctx.fillText('YOUR DISTRICTS', CX + 10, CY + 18);
  ctx.textAlign = 'right'; fnt(ctx, '700', 11); ctx.fillStyle = '#6c80a0';
  ctx.fillText('INCOME ' + income(me), CX + CW - 10, CY + 18);

  for (var d = 0; d < 4; d++) {
    var y = CY + 28 + d * 27;
    fnt(ctx, '700', 11); ctx.textAlign = 'left'; ctx.fillStyle = '#c8d6ea';
    ctx.fillText(DISTRICTS[d].name, CX + 10, y + 15);
    for (var t = 0; t < 3; t++) {
      var bx = CX + CW - 12 - (3 - t) * 24;
      ctx.fillStyle = me.dist[d] > t ? DISTRICTS[d].col : '#1d2a40';
      rrect(ctx, bx, y + 4, 20, 13, 3); ctx.fill();
      if (me.albums[d] && t === 2) { ctx.strokeStyle = '#c58cff'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
  }

  var dy = CY + 144;
  var v0 = G.diceSpin > 0 ? 1 + rint(6) : G.dice[0];
  var v1 = G.diceSpin > 0 ? 1 + rint(6) : G.dice[1];
  drawDie(CX + CW / 2 - 42, dy, 38, v0);
  drawDie(CX + CW / 2 + 4, dy, 38, v1);
  ctx.textAlign = 'center'; fnt(ctx, '800', 13);
  ctx.fillStyle = G.players[G.cur] ? G.players[G.cur].col : '#fff';
  ctx.fillText(G.state === 'rolling' ? '...' : String(G.dice[0] + G.dice[1]), CX + CW / 2, dy + 56);

  ctx.textAlign = 'center'; fnt(ctx, '600', 10); ctx.fillStyle = '#7d8ea9';
  var n = G.log.length;
  for (var i = 0; i < 2; i++) {
    var line = G.log[n - 2 + i];
    if (line) ctx.fillText(fitText(ctx, line, CW - 14), CX + CW / 2, CY + CW - 26 + i * 13);
  }
}

function drawPlayers() {
  var y = 458, h = 46, w = 89;
  for (var i = 0; i < 4; i++) {
    var p = G.players[i]; if (!p) continue;
    var x = 8 + i * (w + 6);
    ctx.fillStyle = G.cur === i ? '#1d2740' : '#151c2c';
    rrect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = G.cur === i ? p.col : '#232e45'; ctx.lineWidth = G.cur === i ? 1.8 : 1; ctx.stroke();

    ctx.textAlign = 'left'; fnt(ctx, '800', 10); ctx.fillStyle = p.col;
    ctx.fillText(fitText(ctx, i === 0 ? 'YOU' : p.name.toUpperCase(), w - 10), x + 6, y + 14);
    fnt(ctx, '800', 13); ctx.fillStyle = '#ffd24a';
    ctx.fillText(String(p.coins), x + 6, y + 29);
    fnt(ctx, '700', 10); ctx.fillStyle = '#58e0c8';
    ctx.fillText('S' + p.shields, x + w - 24, y + 29);
    for (var d = 0; d < 4; d++) {
      var bw = (w - 14) / 4;
      ctx.fillStyle = '#212c42';
      ctx.fillRect(x + 6 + d * bw, y + 34, bw - 2, 7);
      ctx.fillStyle = DISTRICTS[d].col;
      ctx.fillRect(x + 6 + d * bw, y + 34, (bw - 2) * (p.dist[d] / 3), 7);
    }
  }
}

function drawButton(b, i) {
  var pressed = UI.press === b.id;
  var focused = UI.kb && UI.focus === i;
  var y = b.y + (pressed ? 2 : 0);
  ctx.fillStyle = b.ok ? '#182033' : '#141a26';
  rrect(ctx, b.x, y, b.w, b.h, 10); ctx.fill();
  ctx.strokeStyle = b.ok ? b.col : '#2a3346';
  ctx.lineWidth = pressed ? 3 : 2;
  ctx.stroke();
  if (b.ok) {
    ctx.globalAlpha = pressed ? 0.28 : 0.14;
    ctx.fillStyle = b.col; rrect(ctx, b.x, y, b.w, b.h, 10); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (focused) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    rrect(ctx, b.x - 3, y - 3, b.w + 6, b.h + 6, 12); ctx.stroke();
  }
  ctx.textAlign = 'center';
  var big = b.h > 100;
  if (b.sub) {
    fnt(ctx, '800', 13); ctx.fillStyle = b.ok ? '#eaf3ff' : '#5d6b82';
    ctx.fillText(fitText(ctx, b.label, b.w - 20), b.x + b.w / 2, y + b.h / 2 - 2);
    fnt(ctx, '600', 11); ctx.fillStyle = b.ok ? b.col : '#4e5b70';
    ctx.fillText(fitText(ctx, b.sub, b.w - 20), b.x + b.w / 2, y + b.h / 2 + 15);
  } else {
    fnt(ctx, '800', big ? 34 : 14); ctx.fillStyle = b.ok ? '#eaf3ff' : '#5d6b82';
    ctx.fillText(fitText(ctx, b.label, b.w - 16), b.x + b.w / 2, y + b.h / 2 + (big ? 12 : 5));
    if (big) {
      fnt(ctx, '700', 11); ctx.fillStyle = '#8fa3c0';
      ctx.fillText('SPACE', b.x + b.w / 2, y + b.h - 16);
    }
  }
}

function drawActionArea() {
  ctx.textAlign = 'center';
  if (G.state === 'choice') {
    fnt(ctx, '800', 13); ctx.fillStyle = '#eaf3ff';
    ctx.fillText(fitText(ctx, G.choiceTitle, 360), LW / 2, 518);
    if (G.choiceNote) {
      fnt(ctx, '600', 10); ctx.fillStyle = '#7d8ea9';
      ctx.fillText(fitText(ctx, G.choiceNote, 370), LW / 2, 531);
    }
  } else if (G.state === 'idle') {
    fnt(ctx, '600', 11); ctx.fillStyle = '#8fa3c0';
    ctx.fillText('Tap ROLL - land on landmark slots to build all 4 districts before the rivals.', LW / 2, 522);
  } else if (G.state === 'rolling' || G.state === 'moving' || G.state === 'rival' || G.state === 'wait') {
    var p = G.players[G.cur];
    fnt(ctx, '800', 16); ctx.fillStyle = p ? p.col : '#fff';
    ctx.fillText(p ? (p.ai ? p.name + ' is taking a turn' : 'Your move') : '', LW / 2, 580);
    fnt(ctx, '600', 11); ctx.fillStyle = '#6c80a0';
    ctx.fillText('No energy meters here. Rivals are the only clock.', LW / 2, 604);
  }
}

/* ------- sticker art (procedural greybox tile-art) ------- */
function drawStickerArt(x, y, s, id, owned) {
  var a = (id / 6) | 0, v = id % 6, col = DISTRICTS[a].col;
  ctx.fillStyle = owned ? '#131c2e' : '#0f1420';
  rrect(ctx, x, y, s, s, 7); ctx.fill();
  ctx.strokeStyle = owned ? col : '#232e45'; ctx.lineWidth = owned ? 1.6 : 1; ctx.stroke();
  ctx.save();
  ctx.beginPath(); rrect(ctx, x + 2, y + 2, s - 4, s - 4, 6); ctx.clip();
  ctx.globalAlpha = owned ? 1 : 0.16;
  ctx.fillStyle = owned ? col : '#5d6b82';
  var cx = x + s / 2, cy = y + s / 2, u = s * 0.3;
  if (v === 0) { ctx.fillRect(cx - u, cy - u, u * 2, u * 0.5); ctx.fillRect(cx - u * 0.2, cy - u, u * 0.4, u * 2); }
  else if (v === 1) { ctx.beginPath(); ctx.arc(cx, cy, u, 0, 6.283); ctx.fill(); ctx.fillStyle = owned ? '#0f1420' : '#0f1420'; ctx.beginPath(); ctx.arc(cx, cy, u * 0.45, 0, 6.283); ctx.fill(); }
  else if (v === 2) { ctx.beginPath(); ctx.moveTo(cx, cy - u); ctx.lineTo(cx + u, cy + u); ctx.lineTo(cx - u, cy + u); ctx.closePath(); ctx.fill(); }
  else if (v === 3) { for (var i = 0; i < 3; i++) ctx.fillRect(cx - u, cy - u + i * u * 0.8, u * 2 - i * u * 0.5, u * 0.5); }
  else if (v === 4) { ctx.fillRect(cx - u * 0.35, cy - u, u * 0.7, u * 2); ctx.beginPath(); ctx.arc(cx, cy - u, u * 0.7, 0, 6.283); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(cx - u, cy + u); ctx.lineTo(cx - u * 0.3, cy - u); ctx.lineTo(cx + u * 0.4, cy + u * 0.2); ctx.lineTo(cx + u, cy - u * 0.6); ctx.lineTo(cx + u, cy + u); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawAlbum() {
  ctx.fillStyle = 'rgba(6,9,16,.95)';
  ctx.fillRect(0, 0, LW, LH);
  ctx.textAlign = 'center'; fnt(ctx, '800', 20); ctx.fillStyle = '#eaf3ff';
  ctx.fillText('STICKER ALBUMS', LW / 2, 46);
  fnt(ctx, '600', 11); ctx.fillStyle = '#8fa3c0';
  ctx.fillText('Posted odds: every draw is 1 of 24, equal 4.2% each. Dupes pay +6.', LW / 2, 68);
  ctx.fillText('Lap the Gate or take a grant to earn draws. Full album: +40 and a free tier.', LW / 2, 84);

  var me = G.players[0]; if (!me) return;
  var a = clamp(UI.tab, 0, 3);
  var have = 0;
  for (var i = 0; i < 6; i++) if (me.stick[a * 6 + i]) have++;
  fnt(ctx, '800', 14); ctx.fillStyle = DISTRICTS[a].col;
  ctx.fillText(DISTRICTS[a].name + '  ' + have + '/6' + (me.albums[a] ? '  COMPLETE' : ''), LW / 2, 176);

  for (var k = 0; k < 6; k++) {
    var cx = 26 + (k % 3) * 118, cy = 196 + ((k / 3) | 0) * 210;
    var id = a * 6 + k, owned = !!me.stick[id];
    drawStickerArt(cx, cy, 100, id, owned);
    fnt(ctx, '700', 10); ctx.textAlign = 'center';
    ctx.fillStyle = owned ? '#c8d6ea' : '#4e5b70';
    ctx.fillText(fitText(ctx, owned ? STICKERS[id] : '???', 110), cx + 50, cy + 118);
  }
  var tot = 0; for (var s2 = 0; s2 < 24; s2++) if (me.stick[s2]) tot++;
  fnt(ctx, '700', 12); ctx.fillStyle = '#8fa3c0'; ctx.textAlign = 'center';
  ctx.fillText('COLLECTED ' + tot + ' / 24', LW / 2, 616);
}

function drawStickerPop() {
  if (G.stickerT <= 0 || G.lastSticker < 0) return;
  var t = clamp(G.stickerT / 1.4, 0, 1);
  var y = 300 + (1 - easeOut(clamp((1 - t) * 4, 0, 1))) * 30;
  ctx.globalAlpha = clamp(t * 2, 0, 1);
  ctx.fillStyle = '#0d1420';
  rrect(ctx, 115, y - 44, 160, 96, 10); ctx.fill();
  ctx.strokeStyle = DISTRICTS[(G.lastSticker / 6) | 0].col; ctx.lineWidth = 2; ctx.stroke();
  drawStickerArt(129, y - 34, 60, G.lastSticker, true);
  ctx.textAlign = 'left'; fnt(ctx, '800', 12); ctx.fillStyle = '#eaf3ff';
  ctx.fillText(fitText(ctx, STICKERS[G.lastSticker], 76), 197, y - 8);
  fnt(ctx, '600', 10); ctx.fillStyle = '#8fa3c0';
  ctx.fillText('sticker earned', 197, y + 10);
  ctx.globalAlpha = 1;
}

function drawOver() {
  var won = G.winner === 0;
  ctx.fillStyle = 'rgba(6,9,16,.86)';
  ctx.fillRect(0, 84, LW, 616 - 84);
  ctx.textAlign = 'center';
  fnt(ctx, '800', 30); ctx.fillStyle = won ? '#4fd08a' : '#ff7a7a';
  ctx.fillText(won ? 'ROW COMPLETE' : 'RIVAL TOOK THE ROW', LW / 2, 250);
  fnt(ctx, '700', 14); ctx.fillStyle = '#c8d6ea';
  ctx.fillText(won ? 'You finished all 4 districts in ' + G.turns + ' turns.'
    : (G.players[G.winner] ? G.players[G.winner].name + ' finished all 4 districts.' : ''), LW / 2, 286);
  fnt(ctx, '600', 12); ctx.fillStyle = '#8fa3c0';
  ctx.fillText('Boards won ' + G.boardsWon + (G.bestTurns ? '   Best ' + G.bestTurns + ' turns' : ''), LW / 2, 312);
  ctx.fillText(won ? 'Board ' + (G.level + 1) + ' reseeds the rivals harder.' : 'Same board, fresh deal. Nothing is gated.', LW / 2, 334);
  var me = G.players[0];
  if (me) {
    var tot = 0; for (var s = 0; s < 24; s++) if (me.stick[s]) tot++;
    ctx.fillText('Stickers ' + tot + '/24    Coins ' + me.coins, LW / 2, 356);
  }
}

function drawStart() {
  ctx.fillStyle = '#0b0f18'; ctx.fillRect(0, 0, LW, LH);
  ctx.textAlign = 'center';
  fnt(ctx, '800', 34); ctx.fillStyle = '#eaf3ff';
  ctx.fillText('MERIDIAN', LW / 2, 250);
  ctx.fillStyle = '#4aa3ff';
  ctx.fillText('ROW', LW / 2, 292);
  fnt(ctx, '600', 13); ctx.fillStyle = '#8fa3c0';
  ctx.fillText('Lap a 24-tile town against three rivals.', LW / 2, 336);
  ctx.fillText('Build 4 districts to the top tier first.', LW / 2, 356);
  fnt(ctx, '700', 15); ctx.fillStyle = '#ffd24a';
  ctx.fillText('TAP TO BEGIN', LW / 2, 430 + Math.sin(Date.now() / 320) * 3);
  fnt(ctx, '600', 11); ctx.fillStyle = '#5d6b82';
  ctx.fillText('No energy. No timers. Everything is play-earned.', LW / 2, 470);
}

function drawRotate() {
  ctx.fillStyle = '#080a10'; ctx.fillRect(0, 0, LW, LH);
  ctx.textAlign = 'center';
  fnt(ctx, '800', 22); ctx.fillStyle = '#eaf3ff';
  ctx.fillText('ROTATE TO PORTRAIT', LW / 2, LH / 2 - 10);
  fnt(ctx, '600', 13); ctx.fillStyle = '#8fa3c0';
  ctx.fillText('The board is paused.', LW / 2, LH / 2 + 18);
  ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 3;
  rrect(ctx, LW / 2 - 26, LH / 2 + 46, 52, 84, 8); ctx.stroke();
}

/* ---------------- loop ---------------- */
var last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!last) last = now;
  var dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt < 0) dt = 0;

  paused = rotate || document.hidden;

  if (started && !paused && !UI.album) {
    stepGame(dt);
    parts.update(dt);
    floats.update(dt);
  }
  if (!paused) {
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
    if (flashT > 0) flashT -= dt;
  }

  buildUI();

  ctx.fillStyle = '#0b0f18';
  ctx.fillRect(0, 0, LW, LH);

  if (rotate) { drawRotate(); return; }
  if (!started) { drawStart(); return; }

  ctx.save();
  if (shakeT > 0) {
    var m = shakeMag * (shakeT / 0.28);
    ctx.translate(rrange(-m, m), rrange(-m, m));
  }

  drawHUD();
  ctx.fillStyle = '#0d121d';
  rrect(ctx, BX - 3, BY - 3, BS + 6, BS + 6, 10); ctx.fill();
  for (var i = 0; i < 24; i++) drawTile(TILES[i]);
  drawCenter();
  drawTokens();
  parts.draw(ctx);
  floats.draw(ctx);
  drawStickerPop();

  ctx.fillStyle = '#131926';
  ctx.fillRect(0, 452, LW, LH - 452);
  ctx.fillStyle = '#243049'; ctx.fillRect(0, 452, LW, 1);
  drawPlayers();
  drawActionArea();

  if (G.state === 'over') drawOver();
  if (!UI.album) { for (var b = 0; b < UI.buttons.length; b++) drawButton(UI.buttons[b], b); }

  if (flashT > 0) {
    ctx.globalAlpha = (flashT / 0.18) * 0.16;
    ctx.fillStyle = flashCol; ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (UI.album) {
    drawAlbum();
    for (var q = 0; q < UI.buttons.length; q++) drawButton(UI.buttons[q], q);
  }
}

resize();
requestAnimationFrame(frame);
