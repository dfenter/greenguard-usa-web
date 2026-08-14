/* Corridor Crawl - deterministic utilities shared by the sim and Phaser view. */
(function (root) {
  'use strict';

  function RNG(seed) {
    this.seed = (seed >>> 0) || 0x9e3779b9;
  }
  RNG.prototype.next = function () {
    var x = this.seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    this.seed = x >>> 0;
    return this.seed;
  };
  RNG.prototype.f = function () { return this.next() / 4294967296; };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.f() * (b - a + 1)); };
  RNG.prototype.pick = function (a) { return a[this.int(0, a.length - 1)]; };
  RNG.prototype.chance = function (p) { return this.f() < p; };
  RNG.prototype.shuffle = function (a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = this.int(0, i), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function key(x, y) { return x + ':' + y; }
  function hash(seed, text) {
    var h = seed >>> 0;
    for (var i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function setTextIfChanged(obj, value) {
    value = String(value);
    if (obj.text === value) return false;
    obj.setText(value); return true;
  }
  function setColorIfChanged(obj, color) {
    if (obj.__ccColor === color) return false;
    obj.__ccColor = color;
    if (obj.setFillStyle) obj.setFillStyle(color);
    if (obj.setTint) obj.setTint(color);
    return true;
  }
  function audio(kit, name, opts) {
    if (kit && kit.audio && kit.audio.sfx) kit.audio.sfx(name, opts || undefined);
  }

  root.CC = {
    RNG: RNG,
    clamp: clamp,
    dist: dist,
    sign: sign,
    key: key,
    hash: hash,
    setTextIfChanged: setTextIfChanged,
    setColorIfChanged: setColorIfChanged,
    audio: audio,
    TAU: Math.PI * 2
  };
})(window);
