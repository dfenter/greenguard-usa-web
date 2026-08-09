/* Blockborough simulation. This file keeps the archived prototype's tuning intact. */
(function (G) {
  'use strict';

  var W = 16, H = 22, N = W * H;
  var T = { GRASS: 0, WATER: 1, HILL: 2, ROAD: 3, HOME: 4, SHOP: 5, POWER: 6, PARK: 7 };
  var TOOLS = [
    { id: 'road', t: T.ROAD, name: 'Road', cost: 12, col: '#73838b' },
    { id: 'home', t: T.HOME, name: 'Homes', cost: 30, col: '#58bf8b' },
    { id: 'shop', t: T.SHOP, name: 'Shops', cost: 55, col: '#55a8dc' },
    { id: 'power', t: T.POWER, name: 'Plant', cost: 300, col: '#ed745c' },
    { id: 'park', t: T.PARK, name: 'Park', cost: 40, col: '#a6dd58' },
    { id: 'raze', t: -1, name: 'Raze', cost: 6, col: '#d5dce0' }
  ];
  var GOALS = [500, 2000, 5000];
  var MILESTONES = [
    { id: 'district', pop: 120, label: 'First district', detail: 'A neighborhood has a pulse.', require: { serviceHomes: 2 } },
    { id: 'crossing', pop: 250, label: 'Cross-town crossing', detail: 'Connect two edges with roads.', require: { edgeRoads: 2 } },
    { id: 'neighborhood', pop: 500, label: 'Neighborhood charter', detail: 'Reach the first population goal.', require: { parks: 1 } },
    { id: 'market', pop: 800, label: 'Market quarter', detail: 'Shops now anchor a real economy.', require: { poweredShops: 1 } },
    { id: 'greenbelt', pop: 1200, label: 'Greenbelt reserve', detail: 'Parks make room for a bigger city.', require: { parks: 3 } },
    { id: 'grid', pop: 1800, label: 'Grid authority', detail: 'Keep power flowing across the grid.', require: { poweredBuildings: 8 } },
    { id: 'civic', pop: 2400, label: 'Civic center', detail: 'The town has a civic identity.', require: { shops: 2 } },
    { id: 'transit', pop: 3000, label: 'Transit spine', detail: 'Traffic is a system, not a warning.', require: { edgeRoads: 2, roads: 12 } },
    { id: 'skyline', pop: 3800, label: 'Skyline district', detail: 'Density tiers are doing the work.', require: { denseHomes: 4 } },
    { id: 'blockborough', pop: 5000, label: 'Blockborough', detail: 'A flagship city, built tile by tile.', require: { parks: 4, shops: 3, edgeRoads: 2 } }
  ];
  var HOME_POP = [10, 34, 90];
  var SHOP_CAP = [220, 700, 1800];
  var PLANT_CAP = 46;
  var ROAD_CAP = 26;
  var TICK_MS = 6000;
  var MAX_FUNDS = 100000000;
  var MAX_MONTH = 1000000;
  var MAX_GROWTH = 64;

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function blank(seed) {
    var s = {
      seed: seed >>> 0, t: new Uint8Array(N), d: new Uint8Array(N),
      g: new Float32Array(N), pow: new Uint8Array(N), acc: new Uint8Array(N),
      svc: new Uint8Array(N), des: new Float32Array(N), load: new Float32Array(N),
      pop: 0, funds: 2200, month: 1, income: 0, upkeep: 0, goal: 0, best: 0,
      broke: false, placeError: '', metrics: null
    };
    terrain(s);
    return s;
  }

  function terrain(s) {
    var r = mulberry(s.seed), cw = 6, ch = 8, cp = [], x, y, i;
    for (i = 0; i < cw * ch; i++) cp.push(r());
    function sample(fx, fy) {
      var gx = fx * (cw - 1), gy = fy * (ch - 1);
      var x0 = Math.floor(gx), y0 = Math.floor(gy);
      var x1 = Math.min(cw - 1, x0 + 1), y1 = Math.min(ch - 1, y0 + 1);
      var tx = gx - x0, ty = gy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var a = cp[y0 * cw + x0], b = cp[y0 * cw + x1];
      var c = cp[y1 * cw + x0], d = cp[y1 * cw + x1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
    var wv = 0.30 + r() * 0.06, hv = 0.74 - r() * 0.04, open = 0;
    for (var pass = 0; pass < 14; pass++) {
      open = 0;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var v = sample(x / (W - 1), y / (H - 1)), k = y * W + x;
        s.t[k] = v < wv ? T.WATER : v > hv ? T.HILL : T.GRASS;
        if (s.t[k] === T.GRASS) open++;
      }
      if (open >= 245) break;
      wv -= 0.022; hv += 0.022;
    }
    for (y = 8; y < 14; y++) for (x = 5; x < 11; x++) s.t[y * W + x] = T.GRASS;
    for (x = 5; x < 11; x++) s.t[10 * W + x] = T.ROAD;
  }

  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function building(t) { return t === T.HOME || t === T.SHOP || t === T.POWER; }
  function canPlace(s, x, y, tool) {
    s.broke = false;
    s.placeError = '';
    if (!tool || !inb(x, y)) return { valid: false, reason: 'out-of-bounds', cost: 0 };
    var k = y * W + x, cur = s.t[k];
    if (cur === T.WATER || cur === T.HILL) return { valid: false, reason: 'blocked-terrain', cost: tool.cost };
    if (tool.t === -1) {
      if (cur === T.GRASS) return { valid: false, reason: 'empty', cost: 0 };
      var cityPieces = 0;
      for (var piece = 0; piece < N; piece++) if (s.t[piece] >= T.ROAD) cityPieces++;
      if (cityPieces <= 1) return { valid: false, reason: 'core', cost: tool.cost };
      if (s.funds < tool.cost) { s.broke = true; return { valid: false, reason: 'insufficient-funds', cost: tool.cost }; }
      return { valid: true, reason: 'valid', cost: tool.cost };
    }
    if (cur === tool.t) return { valid: false, reason: 'duplicate', cost: tool.cost };
    if (cur !== T.GRASS) return { valid: false, reason: 'occupied', cost: tool.cost };
    if (s.funds < tool.cost) { s.broke = true; return { valid: false, reason: 'insufficient-funds', cost: tool.cost }; }
    return { valid: true, reason: 'valid', cost: tool.cost };
  }

  function place(s, x, y, tool) {
    var check = canPlace(s, x, y, tool);
    if (!check.valid) { s.placeError = check.reason; return 0; }
    var k = y * W + x;
    if (tool.t === -1) {
      s.t[k] = T.GRASS; s.d[k] = 0; s.g[k] = 0; s.funds -= tool.cost; return 1;
    }
    s.t[k] = tool.t; s.d[k] = 0; s.g[k] = 0; s.funds -= tool.cost; return 1;
  }

  function stamp(s, type, radius, amount) {
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var k = y * W + x;
      if (s.t[k] !== type) continue;
      var density = s.d[k] || 0;
      for (var ny = y - radius; ny <= y + radius; ny++) for (var nx = x - radius; nx <= x + radius; nx++) {
        if (!inb(nx, ny)) continue;
        var distance = Math.max(Math.abs(nx - x), Math.abs(ny - y));
        s.des[ny * W + nx] += amount * (1 - distance / (radius + 1)) * (1 + density * 0.15);
      }
    }
  }

  function analyze(s) {
    var i, x, y, k, nx, ny;
    s.acc.fill(0);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      k = y * W + x;
      if (!building(s.t[k])) continue;
      if ((inb(x - 1, y) && s.t[k - 1] === T.ROAD) || (inb(x + 1, y) && s.t[k + 1] === T.ROAD) ||
          (inb(x, y - 1) && s.t[k - W] === T.ROAD) || (inb(x, y + 1) && s.t[k + W] === T.ROAD)) s.acc[k] = 1;
    }
    s.pow.fill(0);
    var dist = new Int16Array(N), component = new Int16Array(N), q = [], componentPlants = [], componentRoads = [];
    dist.fill(-1); component.fill(-1);
    var componentCount = 0;
    for (var seed = 0; seed < N; seed++) {
      if ((s.t[seed] !== T.ROAD && s.t[seed] !== T.POWER) || dist[seed] !== -1) continue;
      var componentId = componentCount++, plantCount = 0, hasRoad = false;
      q.length = 0; q.push(seed); dist[seed] = 0; component[seed] = componentId;
      var qi = 0;
      while (qi < q.length) {
        k = q[qi++]; x = k % W; y = (k / W) | 0;
        if (s.t[k] === T.POWER) plantCount++;
        if (s.t[k] === T.ROAD) hasRoad = true;
        if (dist[k] >= 40) continue;
        for (i = 0; i < 4; i++) {
          nx = x + (i === 0 ? 1 : i === 1 ? -1 : 0); ny = y + (i === 2 ? 1 : i === 3 ? -1 : 0);
          if (!inb(nx, ny)) continue;
          var nk = ny * W + nx;
          if (dist[nk] !== -1 || (s.t[nk] !== T.ROAD && s.t[nk] !== T.POWER)) continue;
          dist[nk] = dist[k] + 1; component[nk] = componentId; q.push(nk);
        }
      }
      componentPlants[componentId] = plantCount;
      componentRoads[componentId] = hasRoad;
    }
    for (k = 0; k < N; k++) {
      var cid = component[k];
      if (cid >= 0 && componentPlants[cid] > 0 && componentRoads[cid]) s.pow[k] = 1;
    }
    var cand = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      k = y * W + x;
      if (s.t[k] === T.POWER) continue;
      if (s.t[k] !== T.HOME && s.t[k] !== T.SHOP) continue;
      var best = -1;
      for (i = 0; i < 4; i++) {
        nx = x + (i === 0 ? 1 : i === 1 ? -1 : 0); ny = y + (i === 2 ? 1 : i === 3 ? -1 : 0);
        if (!inb(nx, ny)) continue;
        var roadKey = ny * W + nx, roadComponent = component[roadKey];
        if (s.t[roadKey] === T.ROAD && roadComponent >= 0 && componentPlants[roadComponent] > 0 && componentRoads[roadComponent] && (best < 0 || dist[roadKey] < best)) {
          best = dist[roadKey];
          var bestComponent = roadComponent;
        }
      }
      if (best >= 0) cand.push([best, k, bestComponent]);
    }
    cand.sort(function (a, b) { return a[0] - b[0]; });
    var usedCapacity = [];
    for (i = 0; i < cand.length; i++) {
      var candidate = cand[i], componentCap = componentPlants[candidate[2]] * PLANT_CAP;
      usedCapacity[candidate[2]] = usedCapacity[candidate[2]] || 0;
      if (usedCapacity[candidate[2]] + 1 <= componentCap) {
        s.pow[candidate[1]] = 1;
        usedCapacity[candidate[2]] += 1;
      }
    }

    s.des.fill(0); stamp(s, T.PARK, 4, 3.4); stamp(s, T.POWER, 3, -5);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      k = y * W + x;
      if (s.t[k] !== T.WATER && s.t[k] !== T.HILL) continue;
      var amt = s.t[k] === T.WATER ? 1.2 : 0.6;
      for (ny = y - 2; ny <= y + 2; ny++) for (nx = x - 2; nx <= x + 2; nx++) if (inb(nx, ny)) {
        s.des[ny * W + nx] += amt / (1 + Math.abs(nx - x) + Math.abs(ny - y));
      }
    }

    s.load.fill(0);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      k = y * W + x;
      var weight = s.t[k] === T.HOME ? HOME_POP[s.d[k]] * 0.28 : s.t[k] === T.SHOP ? (s.d[k] + 1) * 7 : 0;
      if (!weight) continue;
      var sum = 0;
      for (ny = y - 2; ny <= y + 2; ny++) for (nx = x - 2; nx <= x + 2; nx++) if (inb(nx, ny) && s.t[ny * W + nx] === T.ROAD) sum += 1 / (1 + Math.abs(nx - x) + Math.abs(ny - y));
      if (!sum) continue;
      for (ny = y - 2; ny <= y + 2; ny++) for (nx = x - 2; nx <= x + 2; nx++) {
        if (!inb(nx, ny)) continue;
        var rk = ny * W + nx;
        if (s.t[rk] === T.ROAD) s.load[rk] += weight * (1 / (1 + Math.abs(nx - x) + Math.abs(ny - y))) / sum;
      }
    }

    s.svc.fill(0);
    var shops = [], homes = [], shopDemand = [];
    for (k = 0; k < N; k++) {
      if (s.t[k] === T.SHOP) { shops.push(k); shopDemand.push(0); }
      else if (s.t[k] === T.HOME) homes.push(k);
    }
    for (var hi = 0; hi < homes.length; hi++) {
      k = homes[hi]; x = k % W; y = (k / W) | 0;
      var near = [];
      for (i = 0; i < shops.length; i++) {
        var sk = shops[i], sx = sk % W, sy = (sk / W) | 0, dd = Math.max(Math.abs(sx - x), Math.abs(sy - y));
        if (dd <= 5 && s.pow[sk] && s.acc[sk]) near.push([dd, i]);
      }
      near.sort(function (a, b) { return a[0] - b[0]; });
      for (i = 0; i < near.length; i++) {
        var si = near[i][1], need = HOME_POP[s.d[k]];
        if (shopDemand[si] + need <= SHOP_CAP[s.d[shops[si]]]) { s.svc[k] = 1; shopDemand[si] += need; break; }
      }
    }
    for (i = 0; i < shops.length; i++) if (shopDemand[i] > 0) s.svc[shops[i]] = 1;

    var edgeRoads = 0, visitedRoad = new Uint8Array(N), focusKey = -1, focusTier = -1;
    for (k = 0; k < N; k++) {
      if (s.t[k] === T.HOME && s.d[k] >= focusTier) { focusTier = s.d[k]; focusKey = k; }
    }
    for (k = 0; k < N; k++) {
      if (s.t[k] !== T.ROAD || visitedRoad[k]) continue;
      q.length = 0; q.push(k); visitedRoad[k] = 1; qi = 0;
      var edgeMask = 0;
      while (qi < q.length) {
        var road = q[qi++], rx = road % W, ry = (road / W) | 0;
        if (rx === 0) edgeMask |= 1;
        if (rx === W - 1) edgeMask |= 2;
        if (ry === 0) edgeMask |= 4;
        if (ry === H - 1) edgeMask |= 8;
        for (i = 0; i < 4; i++) {
          nx = rx + (i === 0 ? 1 : i === 1 ? -1 : 0); ny = ry + (i === 2 ? 1 : i === 3 ? -1 : 0);
          if (inb(nx, ny)) {
            nk = ny * W + nx;
            if (s.t[nk] === T.ROAD && !visitedRoad[nk]) { visitedRoad[nk] = 1; q.push(nk); }
          }
        }
      }
      var edges = 0;
      for (i = 0; i < 4; i++) if (edgeMask & (1 << i)) edges++;
      edgeRoads = Math.max(edgeRoads, edges);
    }
    var poweredBuildings = 0, poweredShops = 0, serviceHomes = 0, denseHomes = 0;
    for (k = 0; k < N; k++) {
      if (s.t[k] === T.HOME && s.svc[k]) serviceHomes++;
      if (s.t[k] === T.HOME && s.pow[k]) poweredBuildings++;
      if (s.t[k] === T.HOME && s.d[k] >= 2) denseHomes++;
      if (s.t[k] === T.SHOP && s.pow[k]) { poweredBuildings++; poweredShops++; }
    }
    s.metrics = {
      homes: homes, shops: shops.length, poweredShops: poweredShops, poweredBuildings: poweredBuildings,
      serviceHomes: serviceHomes, denseHomes: denseHomes, roads: roadsCount(s), parks: parksCount(s), edgeRoads: edgeRoads,
      focusKey: focusKey
    };
    return { homes: homes, shops: shops };
  }

  function roadsCount(s) {
    var count = 0;
    for (var i = 0; i < N; i++) if (s.t[i] === T.ROAD) count++;
    return count;
  }

  function parksCount(s) {
    var count = 0;
    for (var i = 0; i < N; i++) if (s.t[i] === T.PARK) count++;
    return count;
  }

  function milestoneComplete(s, milestone) {
    if (!milestone) return false;
    if (!s.metrics) analyze(s);
    if (s.pop < milestone.pop) return false;
    var need = milestone.require || {}, metrics = s.metrics || {};
    for (var key in need) if ((metrics[key] || 0) < need[key]) return false;
    return true;
  }

  function milestoneProgress(s, milestone) {
    if (!milestone) return 0;
    if (!s.metrics) analyze(s);
    var progress = Math.min(1, s.pop / Math.max(1, milestone.pop)), need = milestone.require || {}, metrics = s.metrics || {};
    for (var key in need) progress = Math.min(progress, Math.min(1, (metrics[key] || 0) / Math.max(1, need[key])));
    return progress;
  }

  function roadCong(s, x, y) {
    for (var i = 0; i < 4; i++) {
      var nx = x + (i === 0 ? 1 : i === 1 ? -1 : 0), ny = y + (i === 2 ? 1 : i === 3 ? -1 : 0);
      if (!inb(nx, ny)) continue;
      var k = ny * W + nx;
      if (s.t[k] === T.ROAD && s.load[k] > ROAD_CAP) return true;
    }
    return false;
  }

  function tick(s) {
    analyze(s);
    var grew = [], k, x, y;
    for (k = 0; k < N; k++) {
      var tt = s.t[k];
      if (tt !== T.HOME && tt !== T.SHOP) continue;
      x = k % W; y = (k / W) | 0;
      var ok = s.acc[k] && s.pow[k] && s.svc[k], cong = roadCong(s, x, y);
      if (ok) {
        var rate = 1 + Math.max(-0.6, Math.min(0.8, s.des[k] * 0.16));
        if (cong) rate *= 0.35;
        rate *= s.d[k] === 0 ? 1 : s.d[k] === 1 ? 0.55 : 0;
        s.g[k] += rate;
        if (s.g[k] >= 3 && s.d[k] < 2) { s.d[k]++; s.g[k] = 0; grew.push(k); }
      } else {
        s.g[k] -= 0.7;
        if (s.g[k] <= -3) { s.g[k] = 0; if (s.d[k] > 0) s.d[k]--; }
      }
    }
    var pop = 0, jobs = 0, roads = 0, plants = 0, parks = 0, homes = 0, shops = 0;
    for (k = 0; k < N; k++) {
      if (s.t[k] === T.HOME) { homes++; pop += s.acc[k] && s.pow[k] ? HOME_POP[s.d[k]] : Math.round(HOME_POP[s.d[k]] * 0.25); }
      else if (s.t[k] === T.SHOP && s.pow[k]) { shops++; jobs += (s.d[k] + 1) * 12; }
      else if (s.t[k] === T.ROAD) roads++;
      else if (s.t[k] === T.POWER) plants++;
      else if (s.t[k] === T.PARK) parks++;
    }
    s.pop = pop; if (pop > s.best) s.best = pop;
    s.income = Math.round(30 + pop * 0.55 + Math.min(jobs, pop) * 0.30);
    s.upkeep = Math.round(roads * 0.4 + plants * 22 + parks * 2);
    for (k = 0; k < N; k++) {
      if (s.t[k] === T.HOME) s.upkeep += 0.8 * (s.d[k] + 1);
      else if (s.t[k] === T.SHOP) s.upkeep += 1.2 * (s.d[k] + 1);
    }
    s.upkeep = Math.round(s.upkeep);
    s.funds += s.income - s.upkeep;
    if (s.funds < 0) s.funds = 0;
    if (s.funds < 70 && s.income - s.upkeep <= 0) s.funds += 30;
    s.broke = false;
    s.month++;
    for (var gi = 0; gi < GOALS.length; gi++) if (s.pop >= GOALS[gi]) s.goal = Math.max(s.goal, gi + 1);
    analyze(s);
    return { grew: grew, pop: pop, jobs: jobs, roads: roads, plants: plants, parks: parks };
  }

  function serialize(s, tutorialStep) {
    return { seed: s.seed, t: Array.from(s.t), d: Array.from(s.d), g: Array.from(s.g), pop: s.pop, funds: s.funds,
      month: s.month, income: s.income, upkeep: s.upkeep, goal: s.goal, best: s.best, broke: !!s.broke,
      tutorialStep: Math.max(0, Math.min(5, tutorialStep | 0)) };
  }
  function restore(raw) {
    if (!raw || !Array.isArray(raw.t) || raw.t.length !== N || !Array.isArray(raw.d) || raw.d.length !== N || !Array.isArray(raw.g) || raw.g.length !== N) return null;
    if (!Number.isInteger(raw.seed) || !Number.isFinite(raw.funds) || raw.funds < 0 || raw.funds > MAX_FUNDS ||
        !Number.isInteger(raw.pop) || raw.pop < 0 || raw.pop > N * HOME_POP[2] ||
        !Number.isInteger(raw.month) || raw.month < 1 || raw.month > MAX_MONTH ||
        !Number.isFinite(raw.income) || raw.income < -MAX_FUNDS || raw.income > MAX_FUNDS || !Number.isFinite(raw.upkeep) || raw.upkeep < 0 || raw.upkeep > MAX_FUNDS || !Number.isInteger(raw.goal) || raw.goal < 0 || raw.goal > GOALS.length ||
        !Number.isInteger(raw.best) || raw.best < 0 || raw.best > N * HOME_POP[2] || (raw.tutorialStep != null && (!Number.isInteger(raw.tutorialStep) || raw.tutorialStep < 0 || raw.tutorialStep > 5))) return null;
    var hasCityPiece = false, s = blank(raw.seed >>> 0);
    for (var i = 0; i < N; i++) {
      if (!Number.isInteger(raw.t[i]) || raw.t[i] < T.GRASS || raw.t[i] > T.PARK || !Number.isInteger(raw.d[i]) || raw.d[i] < 0 || raw.d[i] > 2 || (raw.t[i] !== T.HOME && raw.t[i] !== T.SHOP && raw.t[i] !== T.POWER && raw.d[i] !== 0) || !Number.isFinite(raw.g[i]) || Math.abs(raw.g[i]) > MAX_GROWTH) return null;
      if (raw.t[i] >= T.ROAD) hasCityPiece = true;
      s.t[i] = raw.t[i]; s.d[i] = raw.d[i]; s.g[i] = raw.g[i];
    }
    if (!hasCityPiece) return null;
    s.pop = raw.pop; s.funds = raw.funds; s.month = raw.month;
    s.income = raw.income; s.upkeep = raw.upkeep; s.goal = raw.goal; s.best = Math.max(s.pop, raw.best); s.broke = !!raw.broke;
    s.tutorialStep = Number.isInteger(raw.tutorialStep) ? Math.max(0, Math.min(5, raw.tutorialStep)) : 0;
    analyze(s); return s;
  }

  G.BlockboroughSim = { W: W, H: H, N: N, T: T, TOOLS: TOOLS, GOALS: GOALS, MILESTONES: MILESTONES,
    HOME_POP: HOME_POP, TICK_MS: TICK_MS, blank: blank, place: place, analyze: analyze, tick: tick,
    canPlace: canPlace, milestoneComplete: milestoneComplete, milestoneProgress: milestoneProgress,
    serialize: serialize, restore: restore };
}(window));
