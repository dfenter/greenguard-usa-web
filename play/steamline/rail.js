'use strict';
/* Steamline - authored rail geometry. No external map or asset dependency. */
(function (root) {
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / ((b - a) || 1), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function polyline(points) {
    var pts = points.map(function (p) { return { x: p.x, y: p.y }; });
    var cum = [0], len = 0, i;
    for (i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      cum.push(len);
    }
    return { pts: pts, cum: cum, len: len };
  }
  function at(poly, distance) {
    var s = clamp(distance, 0, poly.len), lo = 0, hi = poly.cum.length - 1, mid;
    while (lo < hi - 1) {
      mid = (lo + hi) >> 1;
      if (poly.cum[mid] <= s) lo = mid; else hi = mid;
    }
    var a = poly.pts[lo], b = poly.pts[lo + 1] || a;
    var span = (poly.cum[lo + 1] - poly.cum[lo]) || 1;
    var t = (s - poly.cum[lo]) / span;
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * t, y: a.y + dy * t, tx: dx / d, ty: dy / d };
  }
  function midpoint(a, b) { return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }; }
  function branchPoints(a, b, offset, bend) {
    var m = midpoint(a, b), dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    var station = { x: m.x + nx * offset, y: m.y + ny * offset };
    var c1 = { x: lerp(a.x, m.x, 0.6) + nx * offset * bend, y: lerp(a.y, m.y, 0.6) + ny * offset * bend };
    var c2 = { x: lerp(m.x, b.x, 0.4) + nx * offset * bend, y: lerp(m.y, b.y, 0.4) + ny * offset * bend };
    return { points: [a, c1, station, c2, b], station: station, normal: { x: nx, y: ny } };
  }

  /* Each map has twelve potential junctions. The active shift reveals them
     two at a time, so authored identity survives the campaign ramp. */
  var DEFS = {
    'city-loop': {
      name: 'Civic Loop', eyebrow: 'Morning platforms', routing: 'turntable timing', stationShift: 0, speedBias: 1, dwellBonus: 0, sky: '#102535', ground: '#163545', rail: '#8bd3d6', accent: '#f8c76a',
      nodes: [
        { x: -610, y: 90 }, { x: -490, y: -150 }, { x: -300, y: -210 }, { x: -110, y: -92 },
        { x: 90, y: -135 }, { x: 285, y: -225 }, { x: 500, y: -130 }, { x: 625, y: 70 },
        { x: 485, y: 205 }, { x: 260, y: 165 }, { x: 55, y: 245 }, { x: -175, y: 195 },
        { x: -410, y: 235 }
      ],
      offsets: [105, -92, 100, -88, 102, -96, 90, -86, 100, -94, 96, -88],
      signature: { kind: 'turntable', x: 6, y: 30 }, shortcutIndex: 8, shortcutLabel: 'garden siding'
    },
    'mountain-switchback': {
      name: 'Alpine Switchback', eyebrow: 'Mountain dispatch', routing: 'climb siding speed', stationShift: 1, speedBias: 0.86, dwellBonus: 0, sky: '#17243b', ground: '#24334a', rail: '#b8d4e7', accent: '#ef9b5b',
      nodes: [
        { x: -650, y: 250 }, { x: -545, y: 55 }, { x: -445, y: 250 }, { x: -325, y: 20 },
        { x: -205, y: 190 }, { x: -82, y: -68 }, { x: 40, y: 95 }, { x: 170, y: -180 },
        { x: 295, y: -25 }, { x: 415, y: -255 }, { x: 535, y: -95 }, { x: 645, y: -285 },
        { x: 710, y: -120 }
      ],
      offsets: [90, -115, 108, -100, 122, -105, 108, -118, 102, -105, 120, -98],
      signature: { kind: 'tunnel', x: 7, y: -90 }, shortcutIndex: 5, shortcutLabel: 'miner cut'
    },
    'coastal-freight': {
      name: 'Tidewater Yard', eyebrow: 'Coastal freight', routing: 'drawbridge dwell', stationShift: 2, speedBias: 1, dwellBonus: 0.28, sky: '#0d2a37', ground: '#16434a', rail: '#8fe1d2', accent: '#f2a35e',
      nodes: [
        { x: -690, y: 15 }, { x: -570, y: -5 }, { x: -450, y: 35 }, { x: -325, y: -12 },
        { x: -200, y: 28 }, { x: -75, y: -8 }, { x: 50, y: 30 }, { x: 175, y: -18 },
        { x: 300, y: 24 }, { x: 425, y: -5 }, { x: 545, y: 35 }, { x: 650, y: 0 },
        { x: 730, y: 42 }
      ],
      offsets: [118, -126, 128, -116, 130, -122, 120, -128, 118, -126, 122, -116],
      signature: { kind: 'drawbridge', x: 5, y: 3 }, shortcutIndex: 9, shortcutLabel: 'breakwater siding'
    },
    'night-terminal': {
      name: 'Lantern Terminal', eyebrow: 'Night operations', routing: 'lantern patience', stationShift: 3, speedBias: 1.04, dwellBonus: 0, sky: '#171731', ground: '#262244', rail: '#d8b7eb', accent: '#f3c96b',
      nodes: [
        { x: -600, y: -255 }, { x: -385, y: -255 }, { x: -385, y: -55 }, { x: -130, y: -55 },
        { x: -130, y: -255 }, { x: 130, y: -255 }, { x: 130, y: -55 }, { x: 390, y: -55 },
        { x: 390, y: -255 }, { x: 610, y: -255 }, { x: 610, y: 40 }, { x: 350, y: 40 },
        { x: 350, y: 245 }
      ],
      offsets: [112, -112, 122, -115, 105, -120, 114, -108, 122, -112, 112, -126],
      signature: { kind: 'grid', x: 6, y: -55 }, shortcutIndex: 2, shortcutLabel: 'service alley'
    }
  };

  function buildLayout(key) {
    var def = DEFS[key] || DEFS['city-loop'];
    var nodes = def.nodes.map(function (p) { return { x: p.x, y: p.y }; });
    var edges = [], routes = [], stations = [], i;
    edges.push({ kind: 'entry', index: 0, poly: polyline([{ x: nodes[0].x - 175, y: nodes[0].y + 65 }, nodes[0]]) });
    for (i = 0; i < nodes.length - 1; i++) {
      var a = nodes[i], b = nodes[i + 1], m = midpoint(a, b);
      var main = polyline([a, { x: m.x, y: m.y }, b]);
      var br = branchPoints(a, b, def.offsets[i], 0.78);
      var side = polyline(br.points);
      var stationS = side.cum[2];
      var station = at(side, stationS);
      var mainEdge = { kind: 'main', index: edges.length, segment: i, poly: main, stationS: null, shortcut: false };
      var sideEdge = { kind: 'side', index: edges.length + 1, segment: i, poly: side, stationS: stationS, station: station, shortcut: i === def.shortcutIndex };
      edges.push(mainEdge, sideEdge);
      routes.push({ main: mainEdge.index, side: sideEdge.index });
      stations.push({ index: i, x: station.x, y: station.y, tx: station.tx, ty: station.ty, color: (i + (def.stationShift || 0)) % 5, edge: sideEdge.index, shortcut: sideEdge.shortcut });
    }
    var last = nodes[nodes.length - 1];
    var before = nodes[nodes.length - 2];
    var dx = last.x - before.x, dy = last.y - before.y, d = Math.hypot(dx, dy) || 1;
    var exit = { x: last.x + dx / d * 180, y: last.y + dy / d * 180 };
    var exitEdge = { kind: 'exit', index: edges.length, poly: polyline([last, exit]), stationS: null };
    edges.push(exitEdge);
    var bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    edges.forEach(function (edge) {
      edge.poly.pts.forEach(function (p) {
        bounds.x0 = Math.min(bounds.x0, p.x); bounds.y0 = Math.min(bounds.y0, p.y);
        bounds.x1 = Math.max(bounds.x1, p.x); bounds.y1 = Math.max(bounds.y1, p.y);
      });
    });
    bounds.x0 -= 84; bounds.x1 += 84; bounds.y0 -= 84; bounds.y1 += 84;
    return {
      key: key in DEFS ? key : 'city-loop', def: def, name: def.name, eyebrow: def.eyebrow,
      nodes: nodes, edges: edges, routes: routes, stations: stations, exitIdx: exitEdge.index,
      junctions: routes.length, bounds: bounds, signature: def.signature,
      shortcutIndex: def.shortcutIndex, shortcutLabel: def.shortcutLabel, routing: def.routing,
      colors: ['#f26767', '#55c7e8', '#f2c45e', '#56d6a6', '#b995f1']
    };
  }

  root.SL_RAIL = {
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, mulberry32: mulberry32,
    polyline: polyline, at: at, defs: DEFS, buildLayout: buildLayout
  };
})(typeof window !== 'undefined' ? window : globalThis);
