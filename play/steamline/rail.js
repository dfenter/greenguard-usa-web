'use strict';
/* Steamline - rail network geometry (original work) */

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function smoothstep(a, b, x){
  x = (x - a) / (b - a);
  if (x < 0) x = 0; else if (x > 1) x = 1;
  return x * x * (3 - 2 * x);
}

function polyBuild(pts){
  var cum = [0], L = 0;
  for (var i = 1; i < pts.length; i++){
    L += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    cum.push(L);
  }
  return { pts: pts, cum: cum, len: L };
}

function polyAt(p, s){
  if (s < 0) s = 0; else if (s > p.len) s = p.len;
  var lo = 0, hi = p.cum.length - 1, m;
  while (lo < hi - 1){ m = (lo + hi) >> 1; if (p.cum[m] <= s) lo = m; else hi = m; }
  var a = p.pts[lo], b = p.pts[lo+1] || p.pts[lo];
  var seg = (p.cum[lo+1] - p.cum[lo]) || 1;
  var t = (s - p.cum[lo]) / seg;
  var dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * t, y: a.y + dy * t, tx: dx / dl, ty: dy / dl };
}

/* Serpentine main line: down the left column, round the bottom, up the right column. */
var SPINE_CX = 100, SPINE_TOP = -80, SPINE_HB = 300, SPINE_R = 100;
function buildSpine(){
  var pts = [], y, k, th;
  for (y = SPINE_TOP; y <= SPINE_HB; y += 10) pts.push({ x: -SPINE_CX, y: y });
  for (k = 1; k <= 44; k++){
    th = Math.PI - Math.PI * k / 44;
    pts.push({ x: Math.cos(th) * SPINE_R, y: SPINE_HB + Math.sin(th) * SPINE_R });
  }
  for (y = SPINE_HB - 10; y >= SPINE_TOP; y -= 10) pts.push({ x: SPINE_CX, y: y });
  return polyBuild(pts);
}

/* Sample a stretch of spine, optionally bowed outward by D (a station siding). */
function sampleEdge(spine, s0, s1, D){
  var L = s1 - s0, N = Math.max(8, Math.round(L / 6)), pts = [], k, u, s, p, w;
  for (k = 0; k <= N; k++){
    u = k / N; s = s0 + L * u;
    p = polyAt(spine, s);
    w = D > 0 ? D * smoothstep(0, 0.36, u) * (1 - smoothstep(0.64, 1, u)) : 0;
    pts.push({ x: p.x - p.ty * w, y: p.y + p.tx * w });
  }
  return { pts: pts, midIdx: Math.round(N / 2) };
}

var NET_S0 = 70, NET_SEG = 150, NET_D = 95, NET_EXIT = 92, NET_MAX = 6;

function makeEdge(kind, seg, pts){
  var p = polyBuild(pts);
  var path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  /* first ~78 units, used to show which way a switch is set */
  var head = new Path2D();
  head.moveTo(pts[0].x, pts[0].y);
  for (i = 1; i < pts.length && p.cum[i] < 78; i++) head.lineTo(pts[i].x, pts[i].y);
  return { kind: kind, seg: seg, poly: p, len: p.len, path: path, headPath: head,
           stationS: null, stationPt: null, signalS: p.len > 62 ? p.len - 24 : null,
           signalPt: null, dirPt: polyAt(p, Math.min(26, p.len)) };
}

/* n = station count. Edge index layout: 0 entry, 1+2i main_i, 2+2i side_i, 1+2n exit. */
function buildNet(spine, n, colors){
  var jS = [], i;
  for (i = 0; i <= n; i++) jS.push(NET_S0 + NET_SEG * i);
  var edges = [];
  edges.push(makeEdge('entry', -1, sampleEdge(spine, 0, jS[0], 0).pts));
  for (i = 0; i < n; i++){
    edges.push(makeEdge('main', i, sampleEdge(spine, jS[i], jS[i+1], 0).pts));
    var sd = sampleEdge(spine, jS[i], jS[i+1], NET_D);
    var e = makeEdge('side', i, sd.pts);
    e.stationS = e.poly.cum[sd.midIdx];
    e.stationPt = polyAt(e.poly, e.stationS);
    edges.push(e);
  }
  var endS = Math.min(spine.len, jS[n] + NET_EXIT);
  var ex = makeEdge('exit', -1, sampleEdge(spine, jS[n], endS, 0).pts);
  ex.signalS = null;
  edges.push(ex);

  var all = new Path2D();
  for (i = 0; i < edges.length; i++){
    all.addPath(edges[i].path);
    if (edges[i].signalS !== null) edges[i].signalPt = polyAt(edges[i].poly, edges[i].signalS);
  }

  var nodes = [], stations = [];
  for (i = 0; i <= n; i++) nodes.push(polyAt(spine, jS[i]));
  for (i = 0; i < n; i++){
    var sp = edges[2 + 2*i].stationPt;
    stations.push({ x: sp.x, y: sp.y, tx: sp.tx, ty: sp.ty, color: colors[i % colors.length], i: i });
  }
  return { n: n, jS: jS, edges: edges, nodes: nodes, stations: stations, allPath: all,
           entryPt: polyAt(edges[0].poly, 0), exitPt: polyAt(ex.poly, ex.len),
           exitIdx: 1 + 2*n, sw: new Array(n).fill(false) };
}

function childIdx(net, seg){ return net.sw[seg] ? 2 + 2*seg : 1 + 2*seg; }

function nextEdgeIdx(net, ei){
  var e = net.edges[ei];
  if (e.kind === 'exit') return -1;
  var j = (e.kind === 'entry' ? -1 : e.seg) + 1;
  return j < net.n ? childIdx(net, j) : net.exitIdx;
}

/* Both possible successors - used for safe following across a junction. */
function childrenIdx(net, ei){
  var e = net.edges[ei];
  if (e.kind === 'exit') return [];
  var j = (e.kind === 'entry' ? -1 : e.seg) + 1;
  return j < net.n ? [1 + 2*j, 2 + 2*j] : [net.exitIdx];
}

function netBounds(net){
  var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  for (var i = 0; i < net.edges.length; i++){
    var pts = net.edges[i].poly.pts;
    for (var k = 0; k < pts.length; k++){
      if (pts[k].x < b.x0) b.x0 = pts[k].x;
      if (pts[k].x > b.x1) b.x1 = pts[k].x;
      if (pts[k].y < b.y0) b.y0 = pts[k].y;
      if (pts[k].y > b.y1) b.y1 = pts[k].y;
    }
  }
  b.x0 -= 34; b.x1 += 34; b.y0 -= 30; b.y1 += 30;
  return b;
}
