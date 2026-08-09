// Meadow Solitaire - the diorama. 12 plantings, 3 visible growth stages each.
var Meadow = (function () {

  // slot layout inside a unit box (0..1). Back row sits higher/smaller.
  var SLOTS = [
    { x: 0.10, y: 0.36, s: 0.78, t: 3 }, { x: 0.30, y: 0.31, s: 0.72, t: 1 },
    { x: 0.52, y: 0.33, s: 0.74, t: 3 }, { x: 0.74, y: 0.30, s: 0.70, t: 2 },
    { x: 0.90, y: 0.37, s: 0.78, t: 1 },
    { x: 0.18, y: 0.60, s: 0.92, t: 0 }, { x: 0.40, y: 0.57, s: 0.88, t: 2 },
    { x: 0.62, y: 0.59, s: 0.90, t: 0 }, { x: 0.84, y: 0.62, s: 0.94, t: 3 },
    { x: 0.14, y: 0.85, s: 1.06, t: 2 }, { x: 0.46, y: 0.88, s: 1.10, t: 0 },
    { x: 0.78, y: 0.86, s: 1.08, t: 1 }
  ];
  var COSTS = [14, 26, 44];          // coins to move to stage 1, 2, 3
  var NAMES = ['Sunbell', 'Mossknot', 'Featherreed', 'Whistlepine'];
  var PETAL = ['#f2c14a', '#e88ab6', '#8fd0e8', '#f0f2e0'];

  function slotCount() { return SLOTS.length; }
  function cost(stage) { return stage >= 3 ? 0 : COSTS[stage]; }
  function totalCost() { var t = 0; for (var i = 0; i < SLOTS.length; i++) t += COSTS[0] + COSTS[1] + COSTS[2]; return t; }

  function sway(t, seed, amp) { return Math.sin(t * 1.3 + seed * 2.1) * amp + Math.sin(t * 0.47 + seed) * amp * 0.5; }

  // draw one planting anchored at its base (bx, by), unit scale u
  function plant(ctx, type, stage, bx, by, u, t, seed, glow) {
    ctx.save();
    ctx.translate(bx, by);
    // soil mound
    ctx.fillStyle = '#3c2f22';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13 * u, 4.4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    if (glow > 0) {
      ctx.globalAlpha = glow;
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 15 * u, 6 * u, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (stage <= 0) {
      ctx.strokeStyle = 'rgba(150,170,130,0.42)';
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, -6 * u, 8 * u, 8 * u, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore(); return;
    }
    var g = stage / 3;                        // 0.33 .. 1
    var lean = sway(t, seed, 2.2 * g);
    var h = (type === 3 ? 46 : type === 1 ? 22 : 30) * u * (0.34 + 0.66 * g);

    if (type === 3) {                          // Whistlepine - conifer
      ctx.strokeStyle = '#6a4a2c'; ctx.lineWidth = 3.4 * u * g + 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean * 0.4, -h * 0.5, lean, -h); ctx.stroke();
      var tiers = stage + 1;
      for (var i = 0; i < tiers; i++) {
        var ty = -h * (0.35 + 0.62 * i / tiers), tw = (16 - i * 3.4) * u * (0.5 + 0.5 * g);
        ctx.fillStyle = i % 2 ? '#5d9143' : '#4c7f38';
        ctx.beginPath();
        ctx.moveTo(lean * (ty / -h), ty - 13 * u * g);
        ctx.lineTo(lean * (ty / -h) - tw, ty + 5 * u);
        ctx.lineTo(lean * (ty / -h) + tw, ty + 5 * u);
        ctx.closePath(); ctx.fill();
      }
    } else if (type === 1) {                   // Mossknot - round bush
      var r = 12 * u * (0.4 + 0.6 * g);
      ctx.fillStyle = '#48793a';
      for (var b = 0; b < 3; b++) {
        ctx.beginPath();
        ctx.ellipse(lean * 0.4 + (b - 1) * r * 0.75, -r * 0.8 - (b === 1 ? r * 0.4 : 0), r * 0.8, r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#63a04b';
      ctx.beginPath(); ctx.ellipse(lean * 0.4, -r * 1.05, r * 0.72, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      if (stage === 3) {
        ctx.fillStyle = '#e05a5a';
        for (var q = 0; q < 4; q++) {
          ctx.beginPath();
          ctx.arc(lean * 0.4 + Math.cos(q * 2.3 + seed) * r * 0.8, -r * (0.7 + 0.5 * Math.abs(Math.sin(q + seed))), 2.2 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (type === 2) {                   // Featherreed - grass tuft
      var blades = 3 + stage * 2;
      ctx.lineCap = 'round';
      for (var k = 0; k < blades; k++) {
        var sp = (k / (blades - 1) - 0.5) * 2;
        ctx.strokeStyle = k % 2 ? '#7fb257' : '#5f9440';
        ctx.lineWidth = 2.3 * u;
        ctx.beginPath(); ctx.moveTo(sp * 3 * u, 0);
        ctx.quadraticCurveTo(sp * 10 * u + lean * 0.5, -h * 0.6, sp * 15 * u + lean * 1.4, -h * (0.75 + 0.25 * Math.abs(sp)));
        ctx.stroke();
      }
      if (stage === 3) {
        ctx.fillStyle = '#d9c877';
        for (var m = 0; m < 3; m++) {
          ctx.beginPath();
          ctx.ellipse((m - 1) * 8 * u + lean * 1.2, -h * 0.95, 2.4 * u, 5 * u, (m - 1) * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {                                   // Sunbell - flower stalk
      ctx.strokeStyle = '#5f9440'; ctx.lineWidth = 2.6 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean * 0.5, -h * 0.55, lean, -h); ctx.stroke();
      ctx.fillStyle = '#4c8036';
      for (var l = 0; l < stage; l++) {
        var ly = -h * (0.3 + l * 0.22), dir = l % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(lean * 0.4 + dir * 7 * u, ly, 7 * u, 3 * u, dir * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (stage >= 2) {
        var pr = (stage === 3 ? 7 : 4.4) * u;
        var col = PETAL[seed % PETAL.length];
        ctx.fillStyle = col;
        var petals = stage === 3 ? 6 : 5;
        for (var p = 0; p < petals; p++) {
          var a = p / petals * Math.PI * 2 + t * 0.2;
          ctx.beginPath();
          ctx.ellipse(lean + Math.cos(a) * pr * 0.85, -h + Math.sin(a) * pr * 0.85, pr * 0.62, pr * 0.42, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f7e6a0';
        ctx.beginPath(); ctx.arc(lean, -h, pr * 0.48, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // returns array of hit boxes {i, x, y, w, h} in canvas space
  function draw(ctx, x, y, w, h, state, t, opts) {
    opts = opts || {};
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

    // sky
    var sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#2b4a52'); sky.addColorStop(0.45, '#3d6353'); sky.addColorStop(1, '#375c33');
    ctx.fillStyle = sky; ctx.fillRect(x, y, w, h);

    // sun
    ctx.fillStyle = 'rgba(240,226,150,0.35)';
    ctx.beginPath(); ctx.arc(x + w * 0.82, y + h * 0.12, h * 0.075, 0, Math.PI * 2); ctx.fill();

    // rolling hills
    var hills = [
      { c: '#31543a', o: 0.30, a: 0.045 }, { c: '#3a6440', o: 0.46, a: 0.06 }, { c: '#436f45', o: 0.68, a: 0.05 }
    ];
    for (var hh = 0; hh < hills.length; hh++) {
      ctx.fillStyle = hills[hh].c;
      ctx.beginPath(); ctx.moveTo(x, y + h);
      for (var px = 0; px <= w; px += 8) {
        var ny = y + h * hills[hh].o + Math.sin(px / w * 5 + hh * 2.1) * h * hills[hh].a;
        ctx.lineTo(x + px, ny);
      }
      ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    }

    // drifting motes
    if (!opts.flat) {
      ctx.fillStyle = 'rgba(230,240,190,0.30)';
      for (var m = 0; m < 9; m++) {
        var mx = x + ((m * 137 + t * (12 + m * 3)) % w);
        var my = y + h * (0.25 + 0.6 * ((m * 0.17 + Math.sin(t * 0.5 + m) * 0.08) % 1));
        ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    var boxes = [];
    var order = SLOTS.map(function (s, i) { return i; }).sort(function (a, b) { return SLOTS[a].y - SLOTS[b].y; });
    for (var oi = 0; oi < order.length; oi++) {
      var i = order[oi], s = SLOTS[i];
      var bx = x + s.x * w, by = y + h * (0.30 + s.y * 0.66);
      var u = (w / 390) * s.s * (opts.scale || 1);
      var st = state[i] | 0;
      var glow = (opts.affordable && opts.affordable(i) && st < 3) ? 0.35 + 0.25 * Math.sin(t * 3 + i) : 0;
      if (opts.selected === i) glow = 0.9;
      plant(ctx, s.t, st, bx, by, u, t, i, glow);
      var bw = Math.max(48, 46 * u), bh = Math.max(48, 56 * u);
      boxes.push({ i: i, x: bx - bw / 2, y: by - bh + 10 * u, w: bw, h: bh, cx: bx, cy: by });
    }
    ctx.restore();
    return boxes;
  }

  return {
    draw: draw, plant: plant, cost: cost, count: slotCount, totalCost: totalCost,
    names: NAMES, slots: SLOTS
  };
})();
