/* ggnet.js - GreenGuard studio kit for host-authoritative 2-player co-op
 * over WebRTC DataChannel, signaled through a tiny relay server. ES5-style,
 * zero dependencies, classic script (window.GGNet), sibling to ggkit.js.
 *
 * Signaling relay protocol (see hm-signal server.js):
 *   GET /health          wakes a sleeping free-tier relay
 *   WS  /ws               JSON messages, one per line
 *     -> {t:'host'}                    <- {t:'room', code}
 *     -> {t:'join', code}              <- {t:'joined', code}  (to guest)
 *                                      <- {t:'peer', role:'guest'} (to host)
 *                                      <- {t:'err', reason}
 *     -> {t:'signal', data}  relayed verbatim to the other peer as
 *        {t:'signal', data}
 *     -> {t:'leave'} / socket close ->  {t:'peer-left'} to the other side
 *   Server pings every 25s; rooms expire after 10 minutes of inactivity.
 *
 * Usage:
 *   var conn = GGNet.host({
 *     signalUrl: 'https://hm-signal.onrender.com',
 *     onCode: function (code) {},          // room code to show the host
 *     onPeer: function () {},              // guest connected (DataChannels open)
 *     onState: function () {},             // hosts don't receive state
 *     onEvent: function (obj) {},          // reliable messages from guest
 *     onInput: function (obj) {},          // unreliable input from guest
 *     onClose: function (reason) {}        // 'peer-left' | 'error' | ...
 *   });
 *   var conn = GGNet.join({
 *     signalUrl: '...', code: 'ABCD',
 *     onState: function (obj) {},          // unreliable snapshots from host
 *     onEvent: function (obj) {},          // reliable messages from host
 *     onClose: function (reason) {}
 *   });
 *   conn.sendState(obj)  // host -> guest, unreliable/unordered
 *   conn.sendEvent(obj)  // either direction, reliable/ordered
 *   conn.sendInput(obj)  // guest -> host, unreliable/unordered
 *   conn.close()
 *
 * All payloads are JSON. Keep state snapshots compact: short keys, arrays
 * instead of objects where possible, integer-rounded positions.
 */
(function (global) {
  'use strict';

  var ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  function wsUrlFor(signalUrl) {
    // https://host -> wss://host/ws ; http -> ws
    var u = signalUrl.replace(/\/+$/, '');
    if (u.indexOf('https://') === 0) return 'wss://' + u.slice(8) + '/ws';
    if (u.indexOf('http://') === 0) return 'ws://' + u.slice(7) + '/ws';
    return u + '/ws';
  }

  function wake(signalUrl, cb) {
    var done = false;
    function finish() { if (!done) { done = true; cb(); } }
    try {
      // The relay's /health handler does not send CORS headers (server-side
      // gap, not fixable from here), so a 'cors' fetch always rejects even
      // when the wake itself succeeded. 'no-cors' still reaches the server
      // and wakes a sleeping instance; the opaque response is never read.
      fetch(signalUrl.replace(/\/+$/, '') + '/health', { mode: 'no-cors' })
        .then(finish, finish);
    } catch (e) { finish(); }
    // Safety ceiling: a cold Render instance can take 30s+ to wake; don't
    // block forever if the fetch itself hangs past that.
    setTimeout(finish, 30000);
  }

  function Conn(opts) {
    this.opts = opts || {};
    this.ws = null;
    this.pc = null;
    this.stateChan = null;   // unreliable/unordered, host->guest snapshots
    this.eventChan = null;   // reliable/ordered, both directions
    this.inputChan = null;   // unreliable/unordered, guest->host
    this.role = null;        // 'host' | 'guest'
    this.code = null;
    this.closed = false;
    this._chansOpen = 0;
  }

  Conn.prototype._emit = function (name, arg) {
    var fn = this.opts[name];
    if (typeof fn === 'function') {
      try { fn(arg); } catch (e) { /* isolate title bugs from netcode */ }
    }
  };

  Conn.prototype._makePeer = function () {
    var self = this;
    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onicecandidate = function (ev) {
      if (ev.candidate) {
        self._wsSend({ t: 'signal', data: { candidate: ev.candidate } });
      }
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        self._teardown('error');
      }
    };
    return pc;
  };

  Conn.prototype._wsSend = function (obj) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch (e) {}
    }
  };

  Conn.prototype._wireDataChannel = function (chan, kind) {
    var self = this;
    chan.onopen = function () {
      self._chansOpen++;
      if (self._chansOpen >= 3) self._emit('onPeer');
    };
    chan.onmessage = function (ev) {
      var obj;
      try { obj = JSON.parse(ev.data); } catch (e) { return; }
      if (kind === 'state') self._emit('onState', obj);
      else if (kind === 'event') self._emit('onEvent', obj);
      else if (kind === 'input') self._emit('onInput', obj);
    };
    chan.onclose = function () {
      if (!self.closed) self._teardown('peer-left');
    };
  };

  Conn.prototype._teardown = function (reason) {
    if (this.closed) return;
    this.closed = true;
    this._emit('onClose', reason);
    try { if (this.ws) this.ws.close(); } catch (e) {}
    try { if (this.pc) this.pc.close(); } catch (e) {}
  };

  Conn.prototype.sendState = function (obj) {
    if (this.stateChan && this.stateChan.readyState === 'open') {
      try { this.stateChan.send(JSON.stringify(obj)); } catch (e) {}
    }
  };
  Conn.prototype.sendEvent = function (obj) {
    if (this.eventChan && this.eventChan.readyState === 'open') {
      try { this.eventChan.send(JSON.stringify(obj)); } catch (e) {}
    }
  };
  Conn.prototype.sendInput = function (obj) {
    if (this.inputChan && this.inputChan.readyState === 'open') {
      try { this.inputChan.send(JSON.stringify(obj)); } catch (e) {}
    }
  };
  Conn.prototype.close = function () {
    if (this.closed) return;
    this._wsSend({ t: 'leave' });
    this._teardown('closed');
  };

  function connectSocket(signalUrl, onOpen, onMessage, onErr) {
    var ws = new WebSocket(wsUrlFor(signalUrl));
    ws.onopen = onOpen;
    ws.onmessage = function (ev) {
      var obj;
      try { obj = JSON.parse(ev.data); } catch (e) { return; }
      onMessage(obj);
    };
    ws.onerror = onErr;
    ws.onclose = function () { onErr('ws-closed'); };
    return ws;
  }

  function host(opts) {
    opts = opts || {};
    var conn = new Conn(opts);
    conn.role = 'host';

    wake(opts.signalUrl, function () {
      if (conn.closed) return;
      conn.ws = connectSocket(opts.signalUrl, function () {
        conn._wsSend({ t: 'host' });
      }, function (msg) {
        if (conn.closed) return;
        if (msg.t === 'room') {
          conn.code = msg.code;
          conn._emit('onCode', msg.code);
        } else if (msg.t === 'peer') {
          // Guest joined; host creates the offer and the three channels.
          var pc = conn._makePeer();
          conn.stateChan = pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
          conn.eventChan = pc.createDataChannel('event', { ordered: true });
          conn.inputChan = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 });
          conn._wireDataChannel(conn.stateChan, 'state');
          conn._wireDataChannel(conn.eventChan, 'event');
          conn._wireDataChannel(conn.inputChan, 'input');
          pc.createOffer().then(function (offer) {
            return pc.setLocalDescription(offer).then(function () {
              conn._wsSend({ t: 'signal', data: { sdp: pc.localDescription } });
            });
          }).catch(function () { conn._teardown('error'); });
        } else if (msg.t === 'signal') {
          var data = msg.data;
          if (data && data.sdp && conn.pc) {
            conn.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).catch(function () {});
          } else if (data && data.candidate && conn.pc) {
            conn.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function () {});
          }
        } else if (msg.t === 'peer-left') {
          conn._teardown('peer-left');
        } else if (msg.t === 'err') {
          conn._teardown('error');
        }
      }, function () {
        if (!conn.closed) conn._teardown('error');
      });
    });

    return conn;
  }

  function join(opts) {
    opts = opts || {};
    var conn = new Conn(opts);
    conn.role = 'guest';
    conn.code = opts.code;

    wake(opts.signalUrl, function () {
      if (conn.closed) return;
      var pc = conn._makePeer();
      pc.ondatachannel = function (ev) {
        var chan = ev.channel;
        if (chan.label === 'state') { conn.stateChan = chan; conn._wireDataChannel(chan, 'state'); }
        else if (chan.label === 'event') { conn.eventChan = chan; conn._wireDataChannel(chan, 'event'); }
        else if (chan.label === 'input') { conn.inputChan = chan; conn._wireDataChannel(chan, 'input'); }
      };

      conn.ws = connectSocket(opts.signalUrl, function () {
        conn._wsSend({ t: 'join', code: opts.code });
      }, function (msg) {
        if (conn.closed) return;
        if (msg.t === 'joined') {
          // wait for host's offer via 'signal'
        } else if (msg.t === 'signal') {
          var data = msg.data;
          if (data && data.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(function () {
              return pc.createAnswer();
            }).then(function (answer) {
              return pc.setLocalDescription(answer).then(function () {
                conn._wsSend({ t: 'signal', data: { sdp: pc.localDescription } });
              });
            }).catch(function () { conn._teardown('error'); });
          } else if (data && data.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function () {});
          }
        } else if (msg.t === 'peer-left') {
          conn._teardown('peer-left');
        } else if (msg.t === 'err') {
          conn._teardown('error');
        }
      }, function () {
        if (!conn.closed) conn._teardown('error');
      });
    });

    return conn;
  }

  global.GGNet = { host: host, join: join };
}(typeof window !== 'undefined' ? window : this));
