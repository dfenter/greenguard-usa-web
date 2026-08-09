/* Dirt Rocket - seeded track generation */
(function (g) {
  'use strict';

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var DX = 10; // sample spacing in world px

  function smooth(t) { return t * t * (3 - 2 * t); }

  function makeTrack(seed) {
    var rnd = mulberry32(seed);
    var R = function (a, b) { return a + rnd() * (b - a); };
    var h = [0];
    var cur = 0;
    var mud = [];      // [x0,x1]
    var marks = [];    // {x, kind}
    var jumps = 0;

    function seg(len, fn) {
      var n = Math.max(1, Math.round(len / DX));
      var base = cur;
      for (var i = 1; i <= n; i++) h.push(base + fn(i / n));
      cur = base + fn(1);
      return n * DX;
    }
    function x() { return (h.length - 1) * DX; }

    // ---- start straight
    seg(560, function () { return 0; });

    var target = 8200 + Math.floor(R(0, 1800));
    var kinds = ['rollers', 'table', 'kicker', 'whoops', 'mud', 'rollers', 'kicker', 'table'];
    var last = -1;
    var guard = 0;

    while (x() < target && guard++ < 60) {
      var k = kinds[Math.floor(rnd() * kinds.length)];
      if (k === last && rnd() < 0.8) k = 'rollers';
      last = k;

      // keep the ribbon inside a sane band
      var drift = R(-70, 70);
      if (cur < -260) drift = R(20, 90);
      if (cur > 260) drift = R(-90, -20);

      if (k === 'rollers') {
        var cyc = Math.round(R(1, 3)), amp = R(18, 46), ph = rnd() * 6.283;
        seg(R(520, 900), function (t) {
          return drift * smooth(t) + amp * (Math.sin(ph + t * 6.283 * cyc) - Math.sin(ph));
        });

      } else if (k === 'whoops') {
        var n2 = Math.round(R(5, 8)), a2 = R(12, 21);
        marks.push({ x: x() + 40, kind: 'whoops' });
        seg(n2 * 108, function (t) {
          return drift * smooth(t) - a2 * (1 - Math.cos(t * 6.283 * n2)) * 0.5 * (0.5 + 0.5 * Math.sin(Math.PI * t));
        });

      } else if (k === 'mud') {
        var mx0 = x();
        marks.push({ x: mx0 + 20, kind: 'mud' });
        var ln = R(280, 460);
        seg(ln, function (t) { return drift * 0.4 * smooth(t) + 6 * Math.sin(t * 20); });
        mud.push([mx0, x()]);
        seg(R(180, 300), function (t) { return drift * 0.6 * smooth(t); });

      } else if (k === 'table') {
        var th = R(62, 108);
        marks.push({ x: x() + 30, kind: 'table' });
        seg(R(185, 235), function (t) { return -th * smooth(t); });          // ramp up
        seg(R(150, 260), function (t) { return 0; });                         // deck
        seg(R(175, 225), function (t) { return (th + drift * 0.3) * smooth(t); }); // ramp down
        seg(R(220, 340), function (t) { return drift * 0.4 * smooth(t); });

      } else { // kicker with a real gap + landing ramp
        jumps++;
        var jh = R(78, 132);
        var gap = R(190, 340);
        marks.push({ x: x() + 30, kind: 'jump' });
        seg(R(215, 275), function (t) { return -jh * t * t; });                      // launch ramp
        seg(60, function (t) { return (jh + 34) * smooth(t); });                      // face of the gap
        seg(gap, function (t) { return 0; });                                         // pit floor
        seg(R(200, 260), function (t) { return -(jh * 0.72 + 34) * smooth(t); });     // landing ramp up
        seg(R(230, 340), function (t) { return (jh * 0.72 + drift * 0.3) * smooth(t); }); // landing downslope
        seg(R(180, 280), function (t) { return drift * 0.3 * smooth(t); });
      }
    }

    // ---- finish straight
    var finishX = x() + 260;
    seg(560, function (t) { return -cur * 0.35 * smooth(t); });

    var len = (h.length - 1) * DX;

    function heightAt(wx) {
      var f = wx / DX;
      if (f <= 0) return h[0];
      if (f >= h.length - 1) return h[h.length - 1];
      var i = f | 0, u = f - i;
      return h[i] + (h[i + 1] - h[i]) * u;
    }
    function slopeAt(wx) {
      var a = heightAt(wx - 9), b = heightAt(wx + 9);
      return Math.atan2(b - a, 18);
    }
    function isMud(wx) {
      for (var i = 0; i < mud.length; i++) if (wx >= mud[i][0] && wx <= mud[i][1]) return true;
      return false;
    }

    return {
      seed: seed, DX: DX, h: h, len: len, finishX: finishX,
      mud: mud, marks: marks, jumps: jumps,
      par: len / 520 + jumps * 0.3,
      heightAt: heightAt, slopeAt: slopeAt, isMud: isMud
    };
  }

  g.DR = g.DR || {};
  g.DR.makeTrack = makeTrack;
  g.DR.rng = mulberry32;
})(window);
