/* pn_sim.js — Pennant Nine rules simulation.
 * Engine free and deterministic apart from an injected random source, so the
 * renderer draws exactly the path the rules resolved against.
 */
(function (root) {
  'use strict';

  var PN = root.PN || (root.PN = {});
  var clamp = PN.clamp;

  // Contact anchor and half window are the prototype's tuned constants.
  var CONTACT_AT = 0.66;
  var WINDOW = 0.36;
  var CONTACT_GATE = 0.95;

  PN.CONTACT_AT = CONTACT_AT;
  PN.WINDOW = WINDOW;

  // ------------------------------------------------------------- pitch
  // Plate space: x and y in strike zone half widths. |x|<=1 and |y|<=1 is a
  // strike. The renderer plots this same path, so tells never lie.
  PN.pitchPath = function (pitch, tx, ty, t, out) {
    var rx = -pitch.breakX * 0.30;
    var ry = -2.35;
    var bend = t * (t - 1);
    var o = out || { x: 0, y: 0 };
    o.x = rx + (tx - rx) * t + pitch.breakX * bend * 1.75;
    o.y = ry + (ty - ry) * t + pitch.breakY * bend * 1.35;
    return o;
  };

  PN.pitchDuration = function (pitch) { return 0.88 / pitch.speed; };

  PN.zoneColumn = function (x) { return x < -0.34 ? 0 : x < 0.34 ? 1 : 2; };

  PN.isStrike = function (x, y) { return Math.abs(x) <= 1 && Math.abs(y) <= 1; };

  // ------------------------------------------------------------ hitter
  PN.hitterStats = function (player, formRec) {
    var f = formRec || { form: 0, growth: 0 };
    return {
      id: player.id,
      name: player.name,
      pos: player.pos,
      contact: clamp(player.contact + f.growth * 0.6 + f.form, 0.3, 0.99),
      power: clamp(player.power + f.growth + f.form * 0.6, 0.3, 0.99),
      speed: clamp(player.speed + f.growth * 0.3, 0.3, 0.99)
    };
  };

  // Carry falls off either side of a 30 degree barrel.
  function angleFactor(la) {
    var d = (la - 30) / 26;
    return Math.max(0, 1 - d * d);
  }

  // Sum of three uniforms, roughly gaussian in [-1.5, 1.5].
  function bell(rnd) { return rnd() + rnd() + rnd() - 1.5; }

  // Full contact resolution. ctx carries the hitter, swing plan, park, the
  // pitch geometry at the plate and a random source.
  PN.resolveContact = function (ctx) {
    var rnd = ctx.rnd;
    var te = ctx.progress - CONTACT_AT;
    var win = WINDOW * ctx.swing.window * (ctx.windowScale || 1);
    var timing = clamp(1 - Math.abs(te) / win, 0, 1);
    var zoneBonus = ctx.guessCol === ctx.actualCol ? 0.18 : 0;
    var quality = timing * 0.64 + ctx.hitter.contact * 0.28 + zoneBonus;
    var plateDist = Math.sqrt(ctx.plateX * ctx.plateX + ctx.plateY * ctx.plateY);
    quality -= clamp((plateDist - 1) / 0.9, 0, 1) * 0.45;
    quality = clamp(quality, 0, 1.25);

    var res = {
      timing: timing,
      te: te,
      quality: quality,
      zoneBonus: zoneBonus > 0,
      grade: 'MISS',
      kind: 'whiff',
      outcome: 'WHIFF',
      carry: 0, la: 0, spray: 0, bases: 0, out: true
    };

    if (timing <= 0) return res;

    var hitChance = clamp(quality - 0.1, 0.03, 0.96);
    if (rnd() >= hitChance * CONTACT_GATE) return res;

    // Signed timing error drives loft and spray; the spread on top is the
    // difference between a barrel and a mishit at the same timing.
    var loft = ctx.swing.loft;
    var la = 18 - te * 150 + loft + bell(rnd) * 16;
    var spray = te * 240 + bell(rnd) * 38;
    spray = clamp(spray, -62, 62);

    var park = ctx.park;
    var power = ctx.hitter.power * ctx.swing.power * (0.75 + quality * 0.5);
    var wind = 1 + park.wind * park.windDir * (spray / 45) * 0.9;
    var carry = (80 + quality * 156 + power * 124) * angleFactor(la) * wind * (ctx.boost || 1);

    res.la = la;
    res.spray = spray;
    res.carry = carry;
    res.kind = 'inplay';
    res.grade = timing > 0.86 ? 'PERFECT' : timing > 0.62 ? 'SOLID' : timing > 0.34 ? 'FAIR' : 'WEAK';

    if (Math.abs(spray) > 45) {
      res.kind = 'foul';
      res.outcome = 'FOUL';
      return res;
    }
    if (la > 48) {
      res.outcome = 'POP OUT';
      res.kind = 'pop';
      return res;
    }
    var fence = PN.fenceAt(park, spray);
    if (la < 5) {
      res.kind = 'ground';
      var through = clamp(quality * 0.62 + ctx.hitter.speed * 0.22 - 0.36, 0.05, 0.62);
      if (rnd() < through) { res.outcome = 'SINGLE'; res.bases = 1; res.out = false; }
      else res.outcome = 'GROUND OUT';
      return res;
    }
    if (carry >= fence && la >= 14 && la <= 50) {
      res.outcome = 'HOME RUN';
      res.kind = 'homer';
      res.bases = 4;
      res.out = false;
      return res;
    }
    // depth relative to this park's wall at this spray angle
    var deep = carry / fence;
    if (la >= 24) {
      res.kind = 'fly';
      if (deep >= 0.94) {
        res.outcome = ctx.hitter.speed > 0.8 && rnd() < 0.24 ? 'TRIPLE' : 'DOUBLE';
        res.bases = res.outcome === 'TRIPLE' ? 3 : 2;
        res.out = false;
        return res;
      }
      // a blooper or a gapper can still fall in
      if (carry > fence * 0.66 && rnd() < 0.08) { res.outcome = 'SINGLE'; res.bases = 1; res.out = false; return res; }
      if (carry < 150 && rnd() < 0.10) { res.outcome = 'SINGLE'; res.bases = 1; res.out = false; return res; }
      res.outcome = 'FLY OUT';
      return res;
    }
    res.kind = 'liner';
    if (deep >= 0.84) {
      res.outcome = ctx.hitter.speed > 0.82 && rnd() < 0.22 ? 'TRIPLE' : 'DOUBLE';
      res.bases = res.outcome === 'TRIPLE' ? 3 : 2;
      res.out = false;
      return res;
    }
    var caught = clamp(0.93 - quality * 0.26 - carry / 1100, 0.26, 0.90);
    if (rnd() < caught) { res.outcome = 'LINE OUT'; return res; }
    res.outcome = 'SINGLE';
    res.bases = 1;
    res.out = false;
    return res;
  };

  // ------------------------------------------------- player as a pitcher
  // Prototype accuracy, in-zone and strike power math preserved, with the
  // effort and stamina layer added on top.
  PN.resolvePitch = function (ctx) {
    var rnd = ctx.rnd;
    var dx = ctx.targetX / 1.05;
    var dy = ctx.targetY / 1.05;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var accuracy = clamp(1 - distance, 0, 1);
    var inZone = PN.isStrike(ctx.targetX, ctx.targetY);
    var stamina = clamp(ctx.stamina, 0, 1);
    var control = ctx.control * (0.72 + stamina * 0.28);
    var strikePower = accuracy * 0.7 + (inZone ? 0.25 : 0) + ctx.pitch.bonus + ctx.effort.bonus
      + (control - 0.75) * 0.34;
    var out = {
      accuracy: accuracy, inZone: inZone, strikePower: strikePower,
      kind: 'ball', outcome: 'BALL', bases: 0, carry: 0, spray: 0, la: 0
    };
    if (!inZone && rnd() > clamp(0.30 + accuracy * 0.36 - ctx.hitter.contact * 0.22, 0.06, 0.62)) {
      return out; // batter lays off, ball
    }
    var getsOut = rnd() < clamp(strikePower - ctx.hitter.contact * 0.18 + 0.10, 0.12, 0.94);
    if (getsOut) {
      out.kind = 'out';
      out.outcome = inZone ? 'CALLED STRIKE' : 'CHASED IT';
      if (rnd() < 0.46) out.outcome = 'SWING AND MISS';
      return out;
    }
    var hitChance = clamp((1 - accuracy) * 0.38 + ctx.hitter.contact * 0.27 + ctx.hitter.power * 0.13, 0.08, 0.74);
    if (rnd() >= hitChance) {
      out.kind = 'weak';
      out.outcome = rnd() < 0.5 ? 'SOFT CONTACT' : 'POP OUT';
      return out;
    }
    var la = 6 + rnd() * 46;
    var spray = bell(rnd) * 34;
    var power = ctx.hitter.power * (0.7 + rnd() * 0.5);
    var carry = (86 + (1 - accuracy) * 130 + power * 170) * angleFactor(la)
      * (1 + ctx.park.wind * ctx.park.windDir * (spray / 45) * 0.9);
    var fence = PN.fenceAt(ctx.park, spray);
    out.kind = 'inplay';
    out.la = la; out.spray = spray; out.carry = carry;
    if (Math.abs(spray) > 45) { out.kind = 'foul'; out.outcome = 'FOUL'; return out; }
    if (carry >= fence && la >= 14 && la <= 50) { out.outcome = 'HOME RUN'; out.bases = 4; return out; }
    if (carry / fence >= 0.93) {
      out.outcome = ctx.hitter.speed > 0.84 && rnd() < 0.22 ? 'TRIPLE' : 'DOUBLE';
      out.bases = out.outcome === 'TRIPLE' ? 3 : 2;
      return out;
    }
    if (la > 26 && carry / fence < 0.82 && rnd() < 0.52) {
      out.kind = 'weak';
      out.outcome = 'FLY OUT';
      out.bases = 0;
      return out;
    }
    out.outcome = 'SINGLE';
    out.bases = 1;
    return out;
  };

  // --------------------------------------------------------- game state
  PN.newGame = function (opts) {
    var innings = opts.innings || 9;
    return {
      mode: opts.mode || 'season',
      park: opts.park,
      opp: opts.opp,
      playerHome: !!opts.playerHome,
      innings: innings,
      inning: 1,
      half: 'top',
      outs: 0,
      balls: 0,
      strikes: 0,
      bases: [false, false, false],
      score: [0, 0], // [away, home]
      hits: [0, 0],
      errors: [0, 0],
      lineScore: [[], []],
      pa: 0,
      paPitches: 0,
      playerBat: 0,
      aiBat: 0,
      pitches: 0,
      stamina: 1,
      arm: opts.arm,
      lines: {},
      over: false,
      log: []
    };
  };

  PN.playerIsBatting = function (g) {
    return g.playerHome ? g.half === 'bottom' : g.half === 'top';
  };
  PN.playerSideIndex = function (g) { return g.playerHome ? 1 : 0; };
  PN.oppSideIndex = function (g) { return g.playerHome ? 0 : 1; };

  PN.advanceBases = function (g, distance, sideIndex, batterSpeed) {
    var scoreRuns = 0;
    var old = g.bases.slice();
    var next = [false, false, false];
    if (distance >= 4) {
      scoreRuns = 1 + (old[0] ? 1 : 0) + (old[1] ? 1 : 0) + (old[2] ? 1 : 0);
    } else {
      var extra = batterSpeed > 0.8 && distance === 1 ? 1 : 0;
      for (var i = 2; i >= 0; i -= 1) {
        if (old[i]) {
          var dest = i + distance + extra;
          if (dest >= 3) scoreRuns += 1;
          else next[dest] = true;
        }
      }
      var batterDest = distance - 1;
      if (batterDest >= 3) scoreRuns += 1;
      else next[batterDest] = true;
    }
    g.bases = next;
    g.score[sideIndex] += scoreRuns;
    return scoreRuns;
  };

  PN.walk = function (g, sideIndex) {
    var runs = 0;
    var b = g.bases;
    if (b[0]) {
      if (b[1]) {
        if (b[2]) runs = 1;
        else b[2] = true;
      } else b[1] = true;
    }
    b[0] = true;
    g.score[sideIndex] += runs;
    return runs;
  };

  PN.recordLine = function (g, id, field, n) {
    var line = g.lines[id];
    if (!line) { line = g.lines[id] = { ab: 0, h: 0, r: 0, rbi: 0, hr: 0, bb: 0, k: 0 }; }
    line[field] += n == null ? 1 : n;
    return line;
  };

  PN.clearCount = function (g) { g.balls = 0; g.strikes = 0; g.paPitches = 0; };

  // Ends the half inning, rolls the line score, and closes the game when the
  // rules say it is over. Returns 'half', 'game' or 'live'.
  PN.endHalf = function (g) {
    var side = g.half === 'top' ? 0 : 1;
    var runsThis = g.score[side] - (g.lineScore[side].reduce(function (a, b) { return a + b; }, 0));
    g.lineScore[side].push(runsThis);
    g.bases = [false, false, false];
    g.outs = 0;
    PN.clearCount(g);
    if (g.half === 'top') {
      // home already ahead entering the bottom of the final inning ends it
      if (g.inning >= g.innings && g.score[1] > g.score[0]) { g.over = true; return 'game'; }
      g.half = 'bottom';
      return 'half';
    }
    if (g.inning >= g.innings && g.score[0] !== g.score[1]) { g.over = true; return 'game'; }
    if (g.inning >= 12) { g.over = true; return 'game'; }
    g.inning += 1;
    g.half = 'top';
    return 'half';
  };

  // Walk-off check inside the bottom half.
  PN.checkWalkoff = function (g) {
    if (g.half === 'bottom' && g.inning >= g.innings && g.score[1] > g.score[0]) {
      g.over = true;
      return true;
    }
    return false;
  };

  PN.gameWinner = function (g) {
    if (g.score[0] === g.score[1]) return -1;
    return g.score[1] > g.score[0] ? 1 : 0;
  };

  // ------------------------------------------------------ AI half sim
  // The opponent's own half when the player chooses to let the arm work
  // (used by the pitch clock guard so an at-bat never drags).
  PN.aiSwingDecision = function (g, hitter, pitch, plateX, plateY, rnd) {
    var strike = PN.isStrike(plateX, plateY);
    var eager = hitter.contact * 0.5 + (g.strikes >= 2 ? 0.34 : 0.06);
    return rnd() < (strike ? 0.52 + eager * 0.5 : 0.22 + eager * 0.32);
  };

  // -------------------------------------------------------- season roll
  PN.standingsRow = function (season, id) {
    for (var i = 0; i < season.standings.length; i += 1) {
      if (season.standings[i].id === id) return season.standings[i];
    }
    return season.standings[0];
  };

  PN.simOtherGames = function (season, skipIds, rnd) {
    var pool = PN.TEAMS.filter(function (t) { return skipIds.indexOf(t.id) < 0; });
    for (var i = 0; i + 1 < pool.length; i += 2) {
      var a = PN.standingsRow(season, pool[i].id);
      var b = PN.standingsRow(season, pool[i + 1].id);
      var aStr = pool[i].bat + pool[i].arm;
      var bStr = pool[i + 1].bat + pool[i + 1].arm;
      var aWins = rnd() < 0.5 + (aStr - bStr) * 0.55;
      var ar = 1 + ((rnd() * 7) | 0);
      var br = 1 + ((rnd() * 6) | 0);
      if (aWins) ar = Math.max(ar, br + 1); else br = Math.max(br, ar + 1);
      a.rf += ar; a.ra += br; b.rf += br; b.ra += ar;
      if (aWins) { a.w += 1; b.l += 1; } else { b.w += 1; a.l += 1; }
    }
  };

  PN.sortedStandings = function (season) {
    return season.standings.slice().sort(function (x, y) {
      if (y.w !== x.w) return y.w - x.w;
      var xd = x.rf - x.ra, yd = y.rf - y.ra;
      if (yd !== xd) return yd - xd;
      return y.rf - x.rf;
    });
  };

  PN.playoffField = function (season) {
    return PN.sortedStandings(season).slice(0, 4).map(function (r) { return r.id; });
  };

  // Between games: rest the rotation, drift form, grow the young bats.
  PN.rollSeasonDay = function (season, usedArmId, rnd) {
    PN.ROTATION.forEach(function (a) {
      var rec = season.arms[a.id];
      if (!rec) return;
      if (a.id === usedArmId) rec.rest = clamp(rec.rest - 0.55, 0, 1);
      else rec.rest = clamp(rec.rest + 0.30 * a.stamina, 0, 1);
    });
    PN.ROSTER.forEach(function (p) {
      var rec = season.form[p.id];
      if (!rec) return;
      rec.form = clamp(rec.form * 0.82 + (rnd() - 0.5) * 0.03, -0.08, 0.08);
    });
  };

  PN.applyGameStats = function (season, g, rnd) {
    PN.ROSTER.forEach(function (p) {
      var line = g.lines[p.id];
      var rec = season.form[p.id];
      if (!line || !rec) return;
      rec.ab += line.ab; rec.h += line.h; rec.hr += line.hr; rec.rbi += line.rbi;
      var hot = line.ab > 0 ? line.h / line.ab : 0;
      rec.form = clamp(rec.form + (hot - 0.27) * 0.05, -0.08, 0.08);
      if (line.h > 0 || line.hr > 0) rec.growth = clamp(rec.growth + 0.0016 * (1 + line.hr), 0, 0.12);
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PN;
})(typeof window !== 'undefined' ? window : globalThis);
