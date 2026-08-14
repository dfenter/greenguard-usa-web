/* Vector Storm shared math and renderer guards.
 * Lifecycle, input, save and audio are deliberately owned by GGKit.
 */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function angleLerp(a, b, t) {
    var d = ((b - a + Math.PI * 3) % TAU) - Math.PI;
    return a + d * clamp(t, 0, 1);
  }
  function setTextIfChanged(obj, value) {
    var text = String(value);
    if (obj && obj.text !== text) obj.setText(text);
  }
  function setColorIfChanged(obj, color) {
    if (obj && obj._vsColor !== color) {
      obj.setColor(color);
      obj._vsColor = color;
    }
  }
  function drawRing(g, x, y, r, segments, start, end) {
    var from = start == null ? 0 : start;
    var to = end == null ? TAU : end;
    var n = Math.max(6, segments | 0);
    var step = (to - from) / n;
    g.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = from + step * i;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
  }
  function hex(value) { return '#' + ('000000' + (value >>> 0).toString(16)).slice(-6); }

  root.VSCore = {
    TAU: TAU,
    clamp: clamp,
    lerp: lerp,
    dist2: dist2,
    makeRng: makeRng,
    angleLerp: angleLerp,
    setTextIfChanged: setTextIfChanged,
    setColorIfChanged: setColorIfChanged,
    drawRing: drawRing,
    hex: hex
  };
})(typeof window !== 'undefined' ? window : globalThis);
