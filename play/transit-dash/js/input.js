/* Transit Dash - input: swipe + keyboard, per-pointerId tracking (hardening #2/#3) */
(function (g) {
  'use strict';

  var Input = {
    el: null,
    pointers: new Map(),      // pointerId -> {x0,y0,x,y,t0,fired}
    keys: new Set(),
    queue: [],                // pending actions: 'left','right','up','down'
    enabled: true,
    SWIPE: 26,

    attach: function (el) {
      this.el = el;
      var self = this;
      var opt = { passive: false };

      this._pd = function (e) { self.onDown(e); };
      this._pm = function (e) { self.onMove(e); };
      this._pu = function (e) { self.onUp(e); };
      this._pc = function (e) { self.onCancel(e); };

      if (window.PointerEvent) {
        el.addEventListener('pointerdown', this._pd, opt);
        el.addEventListener('pointermove', this._pm, opt);
        window.addEventListener('pointerup', this._pu, opt);
        window.addEventListener('pointercancel', this._pc, opt);
        el.addEventListener('lostpointercapture', this._pc, opt);
      } else {
        el.addEventListener('touchstart', function (e) { self.touch(e, 'down'); }, opt);
        el.addEventListener('touchmove', function (e) { self.touch(e, 'move'); }, opt);
        window.addEventListener('touchend', function (e) { self.touch(e, 'up'); }, opt);
        window.addEventListener('touchcancel', function (e) { self.touch(e, 'cancel'); }, opt);
        el.addEventListener('mousedown', function (e) { self.mouse(e, 'down'); }, opt);
        window.addEventListener('mousemove', function (e) { self.mouse(e, 'move'); }, opt);
        window.addEventListener('mouseup', function (e) { self.mouse(e, 'up'); }, opt);
      }

      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      el.addEventListener('touchstart', function (e) { e.preventDefault(); }, opt);

      window.addEventListener('keydown', function (e) { self.onKey(e, true); });
      window.addEventListener('keyup', function (e) { self.onKey(e, false); });
      window.addEventListener('blur', function () { self.releaseAll(); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self.releaseAll();
      });
    },

    touch: function (e, kind) {
      e.preventDefault();
      var list = kind === 'down' || kind === 'move' ? e.changedTouches : e.changedTouches;
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var fake = { pointerId: 'T' + t.identifier, clientX: t.clientX, clientY: t.clientY, preventDefault: function () { } };
        if (kind === 'down') this.onDown(fake);
        else if (kind === 'move') this.onMove(fake);
        else if (kind === 'up') this.onUp(fake);
        else this.onCancel(fake);
      }
    },
    mouse: function (e, kind) {
      var fake = { pointerId: 'M', clientX: e.clientX, clientY: e.clientY, preventDefault: function () { } };
      if (kind === 'down') { e.preventDefault(); this.onDown(fake); }
      else if (kind === 'move') { if (this.pointers.has('M')) this.onMove(fake); }
      else this.onUp(fake);
    },

    onDown: function (e) {
      if (e.preventDefault) e.preventDefault();
      if (!this.enabled) return;
      var id = e.pointerId;
      this.pointers.set(id, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), fired: false });
      if (this.el && this.el.setPointerCapture && typeof id === 'number') {
        try { this.el.setPointerCapture(id); } catch (err) { }
      }
    },
    onMove: function (e) {
      if (e.preventDefault) e.preventDefault();
      if (!this.enabled) return;
      var p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (p.fired) return;
      var dx = p.x - p.x0, dy = p.y - p.y0;
      if (Math.abs(dx) < this.SWIPE && Math.abs(dy) < this.SWIPE) return;
      p.fired = true;
      if (Math.abs(dx) > Math.abs(dy)) this.push(dx > 0 ? 'right' : 'left');
      else this.push(dy > 0 ? 'down' : 'up');
    },
    onUp: function (e) {
      var p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (!p.fired && this.enabled) {
        var dt = performance.now() - p.t0;
        var dx = (e.clientX || p.x) - p.x0, dy = (e.clientY || p.y) - p.y0;
        if (dt < 400 && Math.abs(dx) < this.SWIPE && Math.abs(dy) < this.SWIPE) this.push('up'); // tap = vault
      }
    },
    onCancel: function (e) { this.pointers.delete(e.pointerId); },

    onKey: function (e, down) {
      var k = e.key;
      var map = {
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
        ArrowUp: 'up', w: 'up', W: 'up', ' ': 'up',
        ArrowDown: 'down', s: 'down', S: 'down'
      };
      var act = map[k];
      if (act) {
        e.preventDefault();
        if (down && !this.keys.has(k) && this.enabled) this.push(act);
        if (down && this.enabled) this.keys.add(k); else if (!down) this.keys.delete(k);
        return;
      }
      if (!down) this.keys.delete(k);
      if (down && (k === 'p' || k === 'P' || k === 'Escape')) {
        if (typeof this.onPause === 'function') this.onPause();
      }
      if (down && (k === 'r' || k === 'R')) {
        if (typeof this.onRestart === 'function') this.onRestart();
      }
      if (down && (k === 'm' || k === 'M')) {
        g.TD.Audio.muted = !g.TD.Audio.muted;
      }
    },

    push: function (a) { if (this.queue.length < 6) this.queue.push(a); },
    take: function () { return this.queue.length ? this.queue.shift() : null; },

    releaseAll: function () {
      this.pointers.clear();
      this.keys.clear();
      this.queue.length = 0;
    },
    reset: function () { this.releaseAll(); this.enabled = true; }
  };

  g.TD.Input = Input;
})(window);
