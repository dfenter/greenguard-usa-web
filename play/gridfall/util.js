/* Gridfall - util.js : rng, safe storage, timers, math */
'use strict';
var U = (function () {

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---- deterministic RNG (mulberry32) ---- */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    function r() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    r.int = function (n) { return Math.floor(r() * n) % (n || 1); };
    r.pick = function (arr) { return arr[Math.floor(r() * arr.length) % arr.length]; };
    return r;
  }
  function hashStr(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function todayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /* ---- storage: every access guarded, every parse type-validated ---- */
  var PRE = 'gridfall.';
  function raw(key) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      var v = localStorage.getItem(PRE + key);
      return (typeof v === 'string') ? v : null;
    } catch (e) { return null; }
  }
  function setRaw(key, val) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return false;
      localStorage.setItem(PRE + key, String(val));
      return true;
    } catch (e) { return false; }
  }
  function getNum(key, dflt) {
    var v = raw(key);
    if (v === null) return dflt;
    var n = parseFloat(v);
    if (typeof n !== 'number' || !isFinite(n)) return dflt;
    return n;
  }
  function setNum(key, n) {
    if (typeof n !== 'number' || !isFinite(n)) return;
    setRaw(key, Math.round(n));
  }
  function getJSON(key, dflt) {
    var v = raw(key);
    if (v === null) return dflt;
    var o = null;
    try { o = JSON.parse(v); } catch (e) { return dflt; }
    if (o === null || o === undefined) return dflt;
    return o;
  }
  function setJSON(key, o) {
    var s = null;
    try { s = JSON.stringify(o); } catch (e) { return; }
    if (typeof s === 'string') setRaw(key, s);
  }
  /* history: array of {m:mode, s:score, l:lines, d:datestr} - always pruned */
  var HIST_MAX = 10;
  function getHistory() {
    var a = getJSON('history', null);
    if (!a || Object.prototype.toString.call(a) !== '[object Array]') return [];
    var out = [];
    for (var i = 0; i < a.length && out.length < HIST_MAX; i++) {
      var r = a[i];
      if (!r || typeof r !== 'object') continue;
      var s = parseFloat(r.s);
      if (!isFinite(s)) continue;
      var l = parseFloat(r.l); if (!isFinite(l)) l = 0;
      out.push({
        m: (r.m === 'daily') ? 'daily' : 'marathon',
        s: Math.max(0, Math.round(s)),
        l: Math.max(0, Math.round(l)),
        d: (typeof r.d === 'string' && r.d.length < 16) ? r.d : ''
      });
    }
    return out;
  }
  function pushHistory(rec) {
    var a = getHistory();
    a.unshift(rec);
    while (a.length > HIST_MAX) a.pop();
    setJSON('history', a);
    return a;
  }

  /* ---- managed timers: cancellable in one call (restart safety) ---- */
  var timers = [];
  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    if (timers.length > 64) { clearTimeout(timers.shift()); }
    return id;
  }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
  }

  return {
    clamp: clamp, lerp: lerp, makeRng: makeRng, hashStr: hashStr, todayKey: todayKey,
    getNum: getNum, setNum: setNum, getJSON: getJSON, setJSON: setJSON,
    getHistory: getHistory, pushHistory: pushHistory,
    later: later, clearTimers: clearTimers
  };
})();
