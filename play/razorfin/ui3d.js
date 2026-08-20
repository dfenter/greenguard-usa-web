/* Razorfin 3D - ui3d.js (Lane C3)
 *
 * DOM overlay UI for the three.js rebuild: Menu, Shop, Results, HUD.
 * Classic script. Exports window.RF.UI. No modules, no imports.
 *
 * Contract (SPEC3D.md "ui3d.js"):
 *   RF.UI.init(opts)            opts = {profile, start(id), firePower, quit}
 *   RF.UI.showMenu(state)       roster ladder, tier locks, DIVE
 *   RF.UI.showShop(state)       three act sections, stat bars, upgrades
 *   RF.UI.showResults(payload)  RF.Meta.endRun payload
 *   RF.UI.runStarted(ctx)       engine entered a run: hide menus, show HUD
 *   RF.UI.runEnded(ctx)         run over: drop transients, clear diff baseline
 *   RF.UI.tutorial(text|null)   one thin fading strip, engine owns the once-rule
 *   RF.UI.showHud() / hideAll()
 *   RF.UI.hudState(obj)         engine pushes the REUSED HUD_STATE each frame
 *   RF.UI.setThumb(id, dataURL) engine/shark3d may push roster thumbnails
 *   RF.UI.onDive/onPower/onShopNav  register as a call OR assign as a property
 *
 * The engine's HUD_STATE object is REUSED every frame: it is read
 * synchronously here and only primitives are retained for diffing, never the
 * object itself. All CSS is authored in plain CSS px (three owns density via
 * setPixelRatio; RF.Game.S does not exist).
 *
 * Backend is RF.Meta only (meta.js is untouched): load/commit/endRun/buy/
 * select/ownedFor/tierUnlocked/activeShark/displayCoins/upLevel + RF.DevMode.
 * kit.input still owns GAME input; every listener here is a DOM listener on a
 * UI element, never on the canvas or the document body.
 *
 * UI_LAW: one transient at a time, chips <= 24px and <= 1s, tutorial strip is
 * a single thin fading line, every tap target >= 44px, all readable text
 * >= 14px, no em dashes anywhere in user-facing strings.
 */
(function () {
  'use strict';

  var RF = window.RF = window.RF || {};

  // ------------------------------------------------------------ constants
  var ACT_NAMES = { 1: 'Real Sharks', 2: 'Monsters', 3: 'Legends' };
  var TRACKS = ['bite', 'speed', 'boost', 'power'];
  var TRACK_LABEL = { bite: 'Bite', speed: 'Speed', boost: 'Boost', power: 'Power' };
  var UP_PIPS = 5;
  var CHIP_MS = 1000;          // UI_LAW rule 3: max 1.0s hold
  var TUTORIAL_MS = 3200;      // UI_LAW rule 5: fades after ~3s

  // ------------------------------------------------------------- plumbing
  // A document reference resolved lazily so __selftest can inject a stub.
  var doc = null;
  function D() { return doc || (typeof document !== 'undefined' ? document : null); }

  function RFD() { return window.RFD || null; }
  function Meta() { return RF.Meta || null; }
  function Dev() { return (RF.DevMode && RF.DevMode.state) || null; }

  function el(id) { var d = D(); return d && d.getElementById ? d.getElementById(id) : null; }

  function mk(tag, cls, txt) {
    var d = D();
    if (!d || !d.createElement) return null;
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = String(txt);
    return n;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setText(node, s) { if (node) node.textContent = String(s); }

  function addClass(node, c) { if (node && node.classList) node.classList.add(c); }
  function removeClass(node, c) { if (node && node.classList) node.classList.remove(c); }
  function toggleClass(node, c, on) { if (on) addClass(node, c); else removeClass(node, c); }

  // Width as a percentage string, clamped, for meters and stat bars.
  function pct(v, max) {
    var n = (typeof v === 'number' && isFinite(v)) ? v : 0;
    var m = (typeof max === 'number' && isFinite(max) && max > 0) ? max : 1;
    var r = n / m;
    if (!(r > 0)) r = 0;
    if (r > 1) r = 1;
    return (r * 100).toFixed(2) + '%';
  }

  function fmt(n) {
    var v = Math.floor((typeof n === 'number' && isFinite(n)) ? n : 0);
    var s = String(Math.abs(v)), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (v < 0 ? '-' : '') + s + out;
  }

  // Compact coin display for the in-run HUD: 1234 -> 1.2k.
  function compact(n) {
    var v = Math.floor((typeof n === 'number' && isFinite(n)) ? n : 0);
    if (v < 1000) return String(v);
    if (v < 1000000) {
      var k = v / 1000;
      return (k < 10 ? k.toFixed(1) : String(Math.floor(k))) + 'k';
    }
    var m = v / 1000000;
    return (m < 10 ? m.toFixed(1) : String(Math.floor(m))) + 'm';
  }

  function hex(n) {
    var v = (typeof n === 'number' && isFinite(n)) ? (n | 0) : 0;
    if (v < 0) v = 0;
    var s = v.toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }

  // Palette for a shark def. RF.Art3D may not be loaded (headless, partial
  // boot); the silhouette palette in data.js is always there.
  function paletteOf(def) {
    var sp = (def && def.sil && def.sil.palette) || {};
    return {
      base: isFinite(sp.base) ? sp.base : 0x4a8fb0,
      belly: isFinite(sp.belly) ? sp.belly : 0xdfeef2,
      accent: isFinite(sp.accent) ? sp.accent : 0x2b5f78,
      glow: isFinite(sp.glow) ? sp.glow : 0
    };
  }

  // Monogram fallback: first letter of each of the first two words.
  function monogram(name) {
    var s = String(name || '?').trim();
    if (!s) return '?';
    var parts = s.split(/\s+/);
    var a = parts[0] ? parts[0].charAt(0) : '';
    var b = parts.length > 1 && parts[1] ? parts[1].charAt(0) : '';
    return (a + b).toUpperCase() || '?';
  }

  function allSharks() {
    var d = RFD();
    return (d && Array.isArray(d.SHARKS)) ? d.SHARKS : [];
  }

  function sharkById(id) {
    var d = RFD();
    if (d && d.SHARK_BY_ID && Object.prototype.hasOwnProperty.call(d.SHARK_BY_ID, id)) {
      return d.SHARK_BY_ID[id];
    }
    return null;
  }

  function abilityName(id) {
    var d = RFD();
    var a = d && d.ABILITIES ? d.ABILITIES[id] : null;
    return (a && a.name) ? a.name : null;
  }

  // Roster maxima, so a data.js regeneration keeps the bars meaningful.
  var STAT_MAX = null;
  function statMax() {
    if (STAT_MAX) return STAT_MAX;
    var m = { speed: 1, bite: 1, hp: 1 };
    var list = allSharks();
    for (var i = 0; i < list.length; i++) {
      var s = list[i].stats || {};
      if (s.speed > m.speed) m.speed = s.speed;
      if (s.bite > m.bite) m.bite = s.bite;
      if (s.hp > m.hp) m.hp = s.hp;
    }
    STAT_MAX = m;
    return m;
  }

  // --------------------------------------------------------------- state
  var S = {
    inited: false,
    screen: 'none',       // 'none' | 'menu' | 'shop' | 'results' | 'hud'
    ctx: null,            // engine context (kit + save live here)
    profile: null,
    thumbs: {},           // id -> dataURL
    menuPick: null,       // id highlighted in the menu (not yet dived)
    shopPick: null,       // id whose upgrade panel the shop footer shows
    chipTimer: null,
    chipToken: 0,
    tutTimer: null,
    lastHud: null,        // previous hudState for diffing (primitives only)
    nodes: {},
    handles: null,        // engine bag: {start, firePower, quit}
    bound: false
  };

  var CB = { dive: null, power: null, shopNav: null };

  // -------------------------------------------------------- node lookup
  // Every container id here must exist in index.html. Missing nodes are
  // tolerated (null) so a partial page cannot throw during boot.
  var NODE_IDS = [
    'rfMenu', 'rfMenuRoster', 'rfMenuCoins', 'rfMenuLevel', 'rfMenuXpFill',
    'rfMenuXpText', 'rfMenuSel', 'rfMenuSelName', 'rfMenuSelBlurb', 'rfDive',
    'rfMenuShop',
    'rfShop', 'rfShopList', 'rfShopCoins', 'rfShopUp', 'rfShopUpName',
    'rfShopBack', 'rfShopToast',
    'rfResults', 'rfResScore', 'rfResBest', 'rfResRows', 'rfResUnlocks',
    'rfResXpFill', 'rfResXpText', 'rfResLevel', 'rfResAgain', 'rfResShop',
    'rfResMenu',
    'rfHud', 'rfHudName', 'rfHudHp', 'rfHudBoost', 'rfHudCoins', 'rfPower',
    'rfPowerLabel', 'rfPowerFill', 'rfChip', 'rfDevChip', 'rfTutorial'
  ];

  function grab() {
    var n = {};
    for (var i = 0; i < NODE_IDS.length; i++) n[NODE_IDS[i]] = el(NODE_IDS[i]);
    S.nodes = n;
    return n;
  }

  function N(id) { return S.nodes[id] || null; }

  // ------------------------------------------------------------- screens
  var SCREENS = { menu: 'rfMenu', shop: 'rfShop', results: 'rfResults', hud: 'rfHud' };

  function showOnly(name) {
    for (var k in SCREENS) {
      if (!Object.prototype.hasOwnProperty.call(SCREENS, k)) continue;
      toggleClass(N(SCREENS[k]), 'rf-on', k === name);
    }
    S.screen = name || 'none';
  }

  // ------------------------------------------------------------ profile
  // The profile is whatever the engine handed us in ctx.save. We never load
  // or commit behind the engine's back except on an explicit buy/select,
  // which is exactly what RF.Meta.commit is for.
  function profile() {
    if (S.ctx && S.ctx.save) return S.ctx.save;
    return S.profile;
  }

  function commit() {
    var m = Meta();
    var p = profile();
    if (!m || !p) return false;
    var kit = S.ctx ? S.ctx.kit : null;
    if (!kit) return false;
    try { return m.commit(kit, p); } catch (e) { return false; }
  }

  function coins() {
    var m = Meta(), p = profile();
    if (m && typeof m.displayCoins === 'function') {
      try { return m.displayCoins(p); } catch (e) { /* fall through */ }
    }
    return p ? p.coins : 0;
  }

  function owned(id) {
    var m = Meta(), p = profile();
    if (m && typeof m.ownedFor === 'function') {
      try { return !!m.ownedFor(p, id); } catch (e) { return false; }
    }
    return false;
  }

  function unlocked(tier) {
    var m = Meta(), p = profile();
    if (m && typeof m.tierUnlocked === 'function') {
      try { return !!m.tierUnlocked(p, tier); } catch (e) { return false; }
    }
    return false;
  }

  function tierNeed(tier) {
    var m = Meta();
    if (m && typeof m.tierUnlockLevel === 'function') {
      try { return m.tierUnlockLevel(tier) | 0; } catch (e) { return 0; }
    }
    var d = RFD();
    var arr = (d && d.ECONOMY && d.ECONOMY.tierUnlockLevel) || [];
    return arr[tier] | 0;
  }

  function activeId() {
    var m = Meta(), p = profile();
    if (m && typeof m.activeShark === 'function') {
      try { return m.activeShark(p); } catch (e) { /* fall through */ }
    }
    return p ? p.selected : 'reef';
  }

  function upLevel(id, track) {
    var m = Meta(), p = profile();
    if (m && typeof m.upLevel === 'function') {
      try { return m.upLevel(p, id, track) | 0; } catch (e) { return 0; }
    }
    return 0;
  }

  function upCost(tier, lvl) {
    var m = Meta();
    if (m && typeof m.upgradeCost === 'function') {
      try { return m.upgradeCost(tier, lvl) | 0; } catch (e) { return 0; }
    }
    return 0;
  }

  // ----------------------------------------------------------- thumbnails
  // shark3d/engine push baked thumbnails in as data URLs. Until one arrives
  // for a given id the card renders a styled monogram so the menu is fully
  // usable with no thumbnails at all.
  function setThumb(id, url) {
    if (typeof id !== 'string' || !id) return false;
    if (typeof url !== 'string' || url.indexOf('data:') !== 0) return false;
    S.thumbs[id] = url;
    // Live-patch any card already on screen rather than rebuilding the list.
    var d = D();
    if (d && d.querySelectorAll) {
      var nodes = d.querySelectorAll('.rf-thumb[data-shark="' + id + '"]');
      for (var i = 0; i < nodes.length; i++) paintThumb(nodes[i], id);
    }
    return true;
  }

  function paintThumb(node, id) {
    if (!node) return;
    var def = sharkById(id);
    var url = S.thumbs[id];
    clear(node);
    if (url) {
      removeClass(node, 'rf-mono');
      node.style.backgroundImage = 'url(' + url + ')';
      return;
    }
    // Monogram fallback card, tinted from the silhouette palette so each
    // shark still reads as itself.
    addClass(node, 'rf-mono');
    node.style.backgroundImage = 'none';
    var pal = paletteOf(def);
    node.style.background = 'linear-gradient(150deg,' + hex(pal.accent) + ',' + hex(pal.base) + ')';
    var g = mk('span', 'rf-mono-text', monogram(def ? def.name : id));
    if (g) {
      g.style.color = hex(pal.belly);
      node.appendChild(g);
    }
  }

  // ---------------------------------------------------------------- MENU
  function buildMenu() {
    var root = N('rfMenuRoster');
    if (!root) return;
    clear(root);

    var p = profile();
    var list = allSharks();
    var sel = S.menuPick || activeId();

    // Group by tier so the ladder reads as a progression, ascending.
    var byTier = {}, tiers = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i].tier | 0;
      if (!byTier[t]) { byTier[t] = []; tiers.push(t); }
      byTier[t].push(list[i]);
    }
    tiers.sort(function (a, b) { return a - b; });

    for (var ti = 0; ti < tiers.length; ti++) {
      var tier = tiers[ti];
      var open = unlocked(tier);
      var need = tierNeed(tier);

      var sec = mk('section', 'rf-tier' + (open ? '' : ' rf-locked'));
      if (!sec) continue;
      var head = mk('div', 'rf-tier-head');
      if (head) {
        head.appendChild(mk('span', 'rf-tier-n', 'Tier ' + tier));
        head.appendChild(mk('span', 'rf-tier-act', ACT_NAMES[byTier[tier][0].act] || ''));
        if (!open) head.appendChild(mk('span', 'rf-tier-lock', 'Reach level ' + need));
        sec.appendChild(head);
      }

      var grid = mk('div', 'rf-grid');
      for (var j = 0; j < byTier[tier].length; j++) {
        var card = buildCard(byTier[tier][j], open, sel);
        if (card && grid) grid.appendChild(card);
      }
      if (grid) sec.appendChild(grid);
      root.appendChild(sec);
    }

    paintMenuHeader(p);
    paintMenuSelection(sel);
  }

  function buildCard(def, tierOpen, sel) {
    var have = owned(def.id);
    var isSel = def.id === sel;
    var cls = 'rf-card';
    if (!tierOpen) cls += ' rf-card-locked';
    else if (!have) cls += ' rf-card-unowned';
    if (isSel) cls += ' rf-card-sel';

    var card = mk('button', cls);
    if (!card) return null;
    card.type = 'button';
    card.setAttribute('data-shark', def.id);

    var th = mk('span', 'rf-thumb');
    if (th) {
      th.setAttribute('data-shark', def.id);
      paintThumb(th, def.id);
      card.appendChild(th);
    }

    card.appendChild(mk('span', 'rf-card-name', def.name));

    var foot = mk('span', 'rf-card-foot');
    if (foot) {
      if (!tierOpen) {
        foot.appendChild(mk('span', 'rf-card-lock', 'Reach level ' + tierNeed(def.tier)));
      } else if (have) {
        foot.appendChild(mk('span', 'rf-card-own', isSel ? 'Selected' : 'Owned'));
      } else {
        foot.appendChild(mk('span', 'rf-card-cost', fmt(def.cost) + ' coins'));
      }
      card.appendChild(foot);
    }

    if (tierOpen && have) {
      card.addEventListener('click', function () { pickMenu(def.id); });
    } else if (tierOpen) {
      // Unowned but reachable: send the player to the shop, where buying lives.
      card.addEventListener('click', function () { navShop(def.id); });
    } else {
      card.disabled = true;
    }
    return card;
  }

  function pickMenu(id) {
    var m = Meta(), p = profile();
    if (m && typeof m.select === 'function' && p) {
      var r = null;
      try { r = m.select(p, id); } catch (e) { r = null; }
      if (r && r.ok) {
        S.menuPick = id;
        if (r.persisted) commit();
        buildMenu();
        return;
      }
    }
    S.menuPick = id;
    buildMenu();
  }

  function paintMenuHeader(p) {
    setText(N('rfMenuCoins'), fmt(coins()));
    var lvl = p ? (p.level | 0) : 1;
    setText(N('rfMenuLevel'), 'Level ' + lvl);

    var m = Meta();
    var into = 0, need = 1;
    if (m && typeof m.levelForXp === 'function' && p) {
      try {
        var lv = m.levelForXp(p.xp);
        into = lv.into | 0;
        need = lv.need | 0;
      } catch (e) { into = 0; need = 1; }
    }
    var fill = N('rfMenuXpFill');
    if (fill) fill.style.width = need > 0 ? pct(into, need) : '100%';
    setText(N('rfMenuXpText'), need > 0 ? (fmt(into) + ' / ' + fmt(need) + ' XP') : 'Max level');
  }

  function paintMenuSelection(sel) {
    var def = sharkById(sel);
    setText(N('rfMenuSelName'), def ? def.name : 'No shark');
    setText(N('rfMenuSelBlurb'), def ? (def.blurb || '') : '');
    var dive = N('rfDive');
    if (dive) dive.disabled = !def || !owned(sel);
  }

  // ---------------------------------------------------------------- SHOP
  function buildShop() {
    var root = N('rfShopList');
    if (!root) return;
    clear(root);

    var list = allSharks().slice();
    // Act sections, each sorted by tier then cost, mirroring the 2D shop.
    var acts = [1, 2, 3];
    for (var a = 0; a < acts.length; a++) {
      var act = acts[a];
      var rows = list.filter(function (s) { return s.act === act; });
      if (!rows.length) continue;
      rows.sort(function (x, y) { return (x.tier - y.tier) || (x.cost - y.cost); });

      var sec = mk('section', 'rf-shop-act');
      if (!sec) continue;
      sec.appendChild(mk('h2', 'rf-shop-act-h', ACT_NAMES[act] || ('Act ' + act)));
      for (var i = 0; i < rows.length; i++) {
        var r = buildShopRow(rows[i]);
        if (r) sec.appendChild(r);
      }
      root.appendChild(sec);
    }

    setText(N('rfShopCoins'), fmt(coins()));
    buildUpgradePanel();
  }

  function buildShopRow(def) {
    var have = owned(def.id);
    var open = unlocked(def.tier);
    var act = activeId();
    var isActive = def.id === act;

    var row = mk('div', 'rf-row' + (open ? '' : ' rf-row-locked') + (isActive ? ' rf-row-active' : ''));
    if (!row) return null;
    row.setAttribute('data-shark', def.id);

    var pal = paletteOf(def);
    var badge = mk('span', 'rf-badge', 'T' + def.tier);
    if (badge) {
      badge.style.background = hex(pal.base);
      badge.style.color = hex(pal.belly);
      row.appendChild(badge);
    }

    var mid = mk('div', 'rf-row-mid');
    if (mid) {
      mid.appendChild(mk('div', 'rf-row-name', def.name));

      var mx = statMax();
      var bars = mk('div', 'rf-bars');
      if (bars) {
        bars.appendChild(statBar('Speed', def.stats.speed, mx.speed, pal.base));
        bars.appendChild(statBar('Bite', def.stats.bite, mx.bite, pal.accent));
        bars.appendChild(statBar('HP', def.stats.hp, mx.hp, pal.belly));
        mid.appendChild(bars);
      }

      var chips = mk('div', 'rf-row-chips');
      if (chips) {
        var an = abilityName(def.active);
        if (an) chips.appendChild(mk('span', 'rf-chip-active', an));
        var ps = def.passives || [];
        for (var i = 0; i < ps.length && i < 3; i++) {
          chips.appendChild(mk('span', 'rf-chip-passive', ps[i]));
        }
        if (ps.length > 3) chips.appendChild(mk('span', 'rf-chip-passive', '+' + (ps.length - 3)));
        mid.appendChild(chips);
      }
      row.appendChild(mid);
    }

    var btn = mk('button', 'rf-buy');
    if (btn) {
      btn.type = 'button';
      if (!open) {
        btn.textContent = 'LVL ' + tierNeed(def.tier);
        btn.disabled = true;
        addClass(btn, 'rf-buy-locked');
      } else if (isActive) {
        btn.textContent = 'IN USE';
        btn.disabled = true;
        addClass(btn, 'rf-buy-inuse');
      } else if (have) {
        btn.textContent = 'SELECT';
        btn.addEventListener('click', function () { doSelect(def.id); });
      } else {
        btn.textContent = 'BUY';
        btn.addEventListener('click', function () { doBuy(def.id); });
        var price = mk('span', 'rf-price', fmt(def.cost));
        if (price) btn.appendChild(price);
      }
      row.appendChild(btn);
    }

    // Tapping the row body focuses its upgrade panel, if it is owned.
    if (have && mid) {
      mid.addEventListener('click', function () {
        S.shopPick = def.id;
        buildUpgradePanel();
      });
    }
    return row;
  }

  function statBar(label, v, max, tint) {
    var wrap = mk('div', 'rf-bar');
    if (!wrap) return null;
    wrap.appendChild(mk('span', 'rf-bar-l', label));
    var track = mk('span', 'rf-bar-t');
    if (track) {
      var fill = mk('i', 'rf-bar-f');
      if (fill) {
        fill.style.width = pct(v, max);
        fill.style.background = hex(tint);
        track.appendChild(fill);
      }
      wrap.appendChild(track);
    }
    return wrap;
  }

  function doBuy(id) {
    var m = Meta(), p = profile();
    if (!m || !p) return;
    var r = null;
    try { r = m.buy(p, { shark: id }); } catch (e) { r = null; }
    if (r && r.ok) {
      commit();
      toast('Unlocked ' + (sharkById(id) || {}).name);
      buildShop();
      return;
    }
    toast(buyFailText(r));
  }

  function doBuyUpgrade(id, track) {
    var m = Meta(), p = profile();
    if (!m || !p) return;
    var r = null;
    try { r = m.buy(p, { upgrade: { id: id, track: track } }); } catch (e) { r = null; }
    if (r && r.ok) {
      commit();
      buildShop();
      return;
    }
    toast(buyFailText(r));
  }

  function doSelect(id) {
    var m = Meta(), p = profile();
    if (!m || !p) return;
    var r = null;
    try { r = m.select(p, id); } catch (e) { r = null; }
    if (r && r.ok) {
      if (r.persisted) commit();
      S.menuPick = id;
      S.shopPick = id;
      buildShop();
      return;
    }
    toast('That shark is not owned yet');
  }

  function buyFailText(r) {
    var reason = r ? r.reason : 'bad-request';
    if (reason === 'coins') return 'Not enough coins. Need ' + fmt(r.cost);
    if (reason === 'locked') return 'Locked. Reach level ' + (r.needLevel | 0);
    if (reason === 'maxed') return 'That track is already at max';
    if (reason === 'owned') return 'Already owned';
    if (reason === 'dev-unlocked') return 'Dev unlock is active, nothing to buy';
    if (reason === 'not-owned') return 'Buy the shark first';
    return 'That purchase is not available';
  }

  function buildUpgradePanel() {
    var root = N('rfShopUp');
    if (!root) return;
    clear(root);

    var id = S.shopPick || activeId();
    var def = sharkById(id);
    setText(N('rfShopUpName'), def ? ('Upgrades: ' + def.name) : 'Upgrades');
    if (!def || !owned(id)) {
      root.appendChild(mk('div', 'rf-up-empty', 'Select an owned shark to upgrade it.'));
      return;
    }

    for (var i = 0; i < TRACKS.length; i++) {
      var col = buildTrack(def, TRACKS[i]);
      if (col) root.appendChild(col);
    }
  }

  function buildTrack(def, track) {
    var lvl = upLevel(def.id, track);
    var maxed = lvl >= UP_PIPS;
    var cost = maxed ? 0 : upCost(def.tier, lvl);

    var col = mk('button', 'rf-up' + (maxed ? ' rf-up-max' : ''));
    if (!col) return null;
    col.type = 'button';
    col.appendChild(mk('span', 'rf-up-l', TRACK_LABEL[track] || track));

    var pips = mk('span', 'rf-pips');
    if (pips) {
      for (var i = 0; i < UP_PIPS; i++) {
        pips.appendChild(mk('i', 'rf-pip' + (i < lvl ? ' rf-pip-on' : '')));
      }
      col.appendChild(pips);
    }

    col.appendChild(mk('span', 'rf-up-c', maxed ? 'MAX' : fmt(cost)));
    if (maxed) col.disabled = true;
    else col.addEventListener('click', function () { doBuyUpgrade(def.id, track); });
    return col;
  }

  // A small self-fading toast. One at a time, per UI_LAW rule 1.
  var toastTimer = null;
  function toast(msg) {
    var n = N('rfShopToast');
    if (!n) return;
    setText(n, msg);
    addClass(n, 'rf-on');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    toastTimer = setTimeout(function () {
      removeClass(n, 'rf-on');
      toastTimer = null;
    }, 1600);
  }

  // ------------------------------------------------------------- RESULTS
  function buildResults(payload) {
    var d = payload || {};
    setText(N('rfResScore'), fmt(d.score));

    var best = N('rfResBest');
    if (best) {
      if (d.newBest) {
        setText(best, 'NEW BEST');
        addClass(best, 'rf-newbest');
      } else {
        removeClass(best, 'rf-newbest');
        setText(best, 'Best ' + fmt(d.best && d.best.score));
      }
    }

    var rows = N('rfResRows');
    if (rows) {
      clear(rows);
      rows.appendChild(resRow('Coins earned', fmt(d.coins)));
      if (d.dailyBonus) {
        rows.appendChild(resRow('Daily bonus', '+' + fmt(d.bonusCoins), 'rf-res-bonus'));
      }
      rows.appendChild(resRow('Biggest prey', 'Tier ' + ((d.biggestTier | 0) || 0)));
      rows.appendChild(resRow('Best combo', 'x' + ((d.bestCombo | 0) || 0)));
      rows.appendChild(resRow('XP gained', fmt(d.xp)));
    }

    var lvlUps = d.levelUps | 0;
    var lvlNode = N('rfResLevel');
    if (lvlNode) {
      setText(lvlNode, lvlUps > 0
        ? ('LEVEL UP  ' + (lvlUps > 1 ? ('x' + lvlUps + '  ') : '') + 'Level ' + (d.level | 0))
        : ('Level ' + (d.level | 0)));
      toggleClass(lvlNode, 'rf-levelup', lvlUps > 0);
    }

    var need = d.xpNeed | 0;
    var fill = N('rfResXpFill');
    if (fill) fill.style.width = need > 0 ? pct(d.xpInto, need) : '100%';
    setText(N('rfResXpText'), need > 0
      ? (fmt(d.xpInto) + ' / ' + fmt(need) + ' XP')
      : 'Max level');

    var un = N('rfResUnlocks');
    if (un) {
      clear(un);
      var list = Array.isArray(d.unlocks) ? d.unlocks : [];
      for (var i = 0; i < list.length && i < 3; i++) {
        var u = list[i];
        var names = Array.isArray(u.names) ? u.names.join(', ') : '';
        var extra = (u.count | 0) > (u.names ? u.names.length : 0)
          ? (' and ' + ((u.count | 0) - u.names.length) + ' more')
          : '';
        un.appendChild(mk('div', 'rf-unlock',
          'Tier ' + u.tier + ' unlocked: ' + names + extra));
      }
    }
  }

  function resRow(label, value, cls) {
    var r = mk('div', 'rf-res-row' + (cls ? (' ' + cls) : ''));
    if (!r) return null;
    r.appendChild(mk('span', 'rf-res-l', label));
    r.appendChild(mk('span', 'rf-res-v', value));
    return r;
  }

  // ----------------------------------------------------------------- HUD
  // The engine pushes a plain state object ~10x/s and on change. Everything
  // is diffed against the previous push so an unchanged field costs no DOM
  // write at all.
  var HUD_FIELDS = ['name', 'hp', 'maxHp', 'hpFrac', 'boost', 'power', 'powerId',
                    'powerName', 'powerReady', 'coins', 'dev'];

  function hudState(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var prev = S.lastHud || {};
    var next = {};
    var i, k, changed = false;

    for (i = 0; i < HUD_FIELDS.length; i++) {
      k = HUD_FIELDS[i];
      next[k] = Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : prev[k];
      if (next[k] !== prev[k]) changed = true;
    }

    // The engine hands over a bounded chips QUEUE plus the live combo. Lane C3
    // owns the presentation: ONE chip at a time, <=24px, <=1s (UI_LAW 1/3), so
    // the queue is drained one entry per push and never rendered as a stack.
    // The queue array belongs to the reused HUD_STATE, so it is consumed here
    // and never retained.
    var q = obj.chips;
    if (q && typeof q.length === 'number' && q.length) {
      var head = q.shift();
      if (head != null) chip(typeof head === 'string' ? head : String(head));
    } else {
      var combo = (typeof obj.combo === 'number' && isFinite(obj.combo)) ? Math.floor(obj.combo) : 0;
      next.combo = combo;
      if (combo > 0 && combo !== (prev.combo | 0)) {
        var mult = (typeof obj.comboMult === 'number' && obj.comboMult > 1)
          ? (' x' + Math.floor(obj.comboMult)) : '';
        chip('x' + combo + mult);
      }
    }
    if (next.combo === undefined) next.combo = prev.combo | 0;

    S.lastHud = next;
    if (!changed) return false;
    paintHud(next, prev);
    return true;
  }

  function paintHud(n, prev) {
    if (n.name !== prev.name) setText(N('rfHudName'), n.name || '');

    if (n.hp !== prev.hp || n.maxHp !== prev.maxHp || n.hpFrac !== prev.hpFrac) {
      var hp = N('rfHudHp');
      if (hp) {
        // The engine already computes hpFrac; trust it when present.
        var frac = (typeof n.hpFrac === 'number' && isFinite(n.hpFrac))
          ? Math.max(0, Math.min(1, n.hpFrac))
          : (n.maxHp > 0 ? (n.hp / n.maxHp) : 1);
        hp.style.width = pct(frac, 1);
        // Colour is state, not a label: no extra text for low health.
        toggleClass(hp, 'rf-low', frac < 0.3);
      }
    }

    if (n.boost !== prev.boost) {
      var b = N('rfHudBoost');
      if (b) b.style.width = pct(n.boost, 1);
    }

    if (n.coins !== prev.coins) setText(N('rfHudCoins'), compact(n.coins));

    if (n.power !== prev.power || n.powerId !== prev.powerId ||
        n.powerName !== prev.powerName || n.powerReady !== prev.powerReady) {
      var btn = N('rfPower');
      var f = N('rfPowerFill');
      // powerId is an RFD.ABILITIES key; powerName is accepted as a courtesy
      // so a caller that already resolved the label still works.
      var label = n.powerName || abilityName(n.powerId) || (n.powerId ? String(n.powerId) : '');
      var has = !!label;
      if (btn) {
        toggleClass(btn, 'rf-hide', !has);
        toggleClass(btn, 'rf-ready', !!n.powerReady);
        btn.disabled = !has;
      }
      if (has) setText(N('rfPowerLabel'), label);
      if (f) f.style.height = pct(n.power, 1);
    }

    if (n.dev !== prev.dev) toggleClass(N('rfDevChip'), 'rf-on', !!n.dev);
  }

  // One chip at a time, <= 24px tall, <= 1.0s, replaced not stacked.
  function chip(text) {
    var n = N('rfChip');
    if (!n) return;
    setText(n, text);
    addClass(n, 'rf-on');
    S.chipToken++;
    var token = S.chipToken;
    if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }
    S.chipTimer = setTimeout(function () {
      if (token !== S.chipToken) return;
      removeClass(n, 'rf-on');
      S.chipTimer = null;
    }, CHIP_MS);
  }

  // One thin strip, one line, fades on its own. Never stacks.
  function tutorial(text) {
    var n = N('rfTutorial');
    if (!n) return;
    if (!text) {
      removeClass(n, 'rf-on');
      return;
    }
    // No profile/dev gate here: engine3d.js already checks tutorialDone and
    // forceSkipTutorial before calling, and commits the flag itself. Re-testing
    // it would swallow the one call the engine does make (it sets the flag in
    // the same breath), so an explicit call always shows.
    setText(n, text);
    addClass(n, 'rf-on');
    if (S.tutTimer) { clearTimeout(S.tutTimer); S.tutTimer = null; }
    S.tutTimer = setTimeout(function () {
      removeClass(n, 'rf-on');
      S.tutTimer = null;
    }, TUTORIAL_MS);
  }

  // -------------------------------------------------------------- wiring
  function navShop(focusId) {
    if (focusId) S.shopPick = focusId;
    showShop();
    fire('onShopNav', focusId || null, null);
  }

  // A callback may be REGISTERED (RF.UI.onDive(fn)) or ASSIGNED
  // (RF.UI.onDive = fn); the engine does the latter. Property assignment
  // replaces this function on the export, so the assigned value is read back
  // off RF.UI here rather than trusting the CB slot alone.
  function cb(name) {
    var assigned = RF.UI ? RF.UI[name] : null;
    // An assigned handler is a plain function; the registrar has .__rfReg.
    if (typeof assigned === 'function' && !assigned.__rfReg) return assigned;
    return CB[name === 'onDive' ? 'dive' : name === 'onPower' ? 'power' : 'shopNav'];
  }

  function fire(name, arg, fallback) {
    var fn = cb(name);
    if (typeof fn === 'function') {
      try { fn(arg); } catch (e) { /* callback owns its errors */ }
      return true;
    }
    if (typeof fallback === 'function') {
      try { fallback(arg); } catch (e) { /* handle owns its errors */ }
      return true;
    }
    return false;
  }

  function handle(name) {
    return (S.handles && typeof S.handles[name] === 'function') ? S.handles[name] : null;
  }

  function bind() {
    if (S.bound) return;
    var n;

    n = N('rfDive');
    if (n) n.addEventListener('click', function () {
      fire('onDive', activeId(), handle('start'));
    });

    n = N('rfMenuShop');
    if (n) n.addEventListener('click', function () { navShop(null); });

    n = N('rfShopBack');
    if (n) n.addEventListener('click', function () { showMenu(); });

    n = N('rfResAgain');
    if (n) n.addEventListener('click', function () {
      fire('onDive', activeId(), handle('start'));
    });

    n = N('rfResShop');
    if (n) n.addEventListener('click', function () { navShop(null); });

    n = N('rfResMenu');
    if (n) n.addEventListener('click', function () { showMenu(); });

    // The power button is the ONE in-run DOM control (SPEC3D: allowed, it is
    // not a game gesture). pointerdown, so it fires on touch-down like the
    // rest of the control surface rather than on release.
    n = N('rfPower');
    if (n) {
      n.addEventListener('pointerdown', function (ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        fire('onPower', null, handle('firePower'));
      });
      // Suppress the synthetic click so a tap cannot fire the power twice.
      n.addEventListener('click', function (ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      });
    }

    S.bound = true;
  }

  // ------------------------------------------------------------- exports
  // The engine calls init({profile, start(id), firePower, quit}). Those handles
  // are the authoritative wiring: DIVE/AGAIN call start(), the power button
  // calls firePower(). Explicit onDive/onPower registrations still win, so a
  // test harness or a different host can drive the same UI.
  function init(opts) {
    var o = opts || {};
    doc = o.document || (typeof document !== 'undefined' ? document : null);
    S.ctx = o.ctx || null;
    S.profile = o.profile || (S.ctx ? S.ctx.save : null) || null;
    S.handles = {
      start: typeof o.start === 'function' ? o.start : null,
      firePower: typeof o.firePower === 'function' ? o.firePower : null,
      quit: typeof o.quit === 'function' ? o.quit : null
    };
    grab();
    bind();
    S.inited = true;
    return true;
  }

  // Run boundaries. The engine owns when a run begins and ends; the UI just
  // swaps to the in-run cluster and drops every out-of-run transient.
  function runStarted(ctx) {
    if (ctx) S.ctx = ctx;
    // The engine hands the coach line over just BEFORE this call, so the
    // tutorial strip is deliberately left running; only stale out-of-run
    // transients are dropped.
    clearTransients({ keepTutorial: true });
    showHud();
    return true;
  }

  function runEnded(ctx) {
    if (ctx) S.ctx = ctx;
    clearTransients();
    // Next run starts from a clean diff baseline, and the results screen (or
    // the menu) is the engine's call, not ours.
    S.lastHud = null;
    return true;
  }

  function clearTransients(opts) {
    var keepTut = !!(opts && opts.keepTutorial);
    if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    S.chipToken++;
    removeClass(N('rfChip'), 'rf-on');
    removeClass(N('rfShopToast'), 'rf-on');
    if (!keepTut) {
      if (S.tutTimer) { clearTimeout(S.tutTimer); S.tutTimer = null; }
      removeClass(N('rfTutorial'), 'rf-on');
    }
  }

  function showMenu(state) {
    if (state && state.ctx) S.ctx = state.ctx;
    if (state && state.profile) S.profile = state.profile;
    S.menuPick = (state && state.selected) || activeId();
    buildMenu();
    showOnly('menu');
    return true;
  }

  function showShop(state) {
    if (state && state.ctx) S.ctx = state.ctx;
    if (state && state.profile) S.profile = state.profile;
    if (state && state.focus) S.shopPick = state.focus;
    buildShop();
    showOnly('shop');
    return true;
  }

  function showResults(payload) {
    buildResults(payload);
    showOnly('results');
    return true;
  }

  function showHud() {
    // A fresh run means a fresh diff baseline, or the first push after a
    // menu round trip would be silently swallowed as unchanged.
    S.lastHud = null;
    showOnly('hud');
    return true;
  }

  function hideAll() {
    showOnly('none');
    return true;
  }

  function onDive(fn) { CB.dive = (typeof fn === 'function') ? fn : null; }
  function onPower(fn) { CB.power = (typeof fn === 'function') ? fn : null; }
  function onShopNav(fn) { CB.shopNav = (typeof fn === 'function') ? fn : null; }
  onDive.__rfReg = onPower.__rfReg = onShopNav.__rfReg = true;

  // ------------------------------------------------------------ selftest
  // Pure-logic coverage with a minimal document stub. Every check exercises
  // code that does not need layout: screen transitions, hudState diffing,
  // the thumb cache, formatters, and the buy-failure copy.
  function __selftest() {
    var checks = 0, fails = 0, log = [];
    function ok(name, cond) {
      checks++;
      if (!cond) { fails++; log.push('FAIL ' + name); }
    }

    // ---- minimal DOM stub -------------------------------------------
    function Node(tag) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.children = [];
      this.firstChild = null;
      this._text = '';
      this.style = {};
      this.disabled = false;
      this.type = '';
      this.attrs = {};
      this._cls = {};
      this.className = '';
      var self = this;
      this.classList = {
        add: function (c) { self._cls[c] = true; self._sync(); },
        remove: function (c) { delete self._cls[c]; self._sync(); },
        contains: function (c) { return !!self._cls[c]; }
      };
      this._listeners = {};
    }
    Node.prototype._sync = function () {
      var out = [];
      for (var k in this._cls) if (this._cls[k]) out.push(k);
      this.className = out.join(' ');
    };
    Node.prototype.appendChild = function (c) {
      if (!c) return c;
      this.children.push(c);
      this.firstChild = this.children[0];
      return c;
    };
    Node.prototype.removeChild = function (c) {
      var i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      this.firstChild = this.children.length ? this.children[0] : null;
      return c;
    };
    Node.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
    Node.prototype.getAttribute = function (k) { return this.attrs[k]; };
    Node.prototype.addEventListener = function (t, fn) {
      (this._listeners[t] = this._listeners[t] || []).push(fn);
    };
    Node.prototype.fire = function (t, ev) {
      var l = this._listeners[t] || [];
      for (var i = 0; i < l.length; i++) l[i](ev || {});
    };
    Object.defineProperty(Node.prototype, 'textContent', {
      get: function () { return this._text; },
      set: function (v) { this._text = String(v); this.children.length = 0; this.firstChild = null; }
    });

    var store = {};
    var stub = {
      createElement: function (t) { return new Node(t); },
      getElementById: function (id) {
        if (!store[id]) { store[id] = new Node('div'); store[id].attrs.id = id; }
        return store[id];
      },
      querySelectorAll: function () {
        // The thumb repaint path walks live cards. An empty list keeps the
        // cache assertion honest without simulating a selector engine.
        return [];
      }
    };

    // ---- save and restore module state ------------------------------
    var saved = {
      doc: doc, ctx: S.ctx, profile: S.profile, thumbs: S.thumbs,
      screen: S.screen, lastHud: S.lastHud, nodes: S.nodes, bound: S.bound,
      menuPick: S.menuPick, shopPick: S.shopPick, inited: S.inited, handles: S.handles,
      dive: CB.dive, power: CB.power, shopNav: CB.shopNav
    };
    S.thumbs = {};
    S.bound = false;
    S.lastHud = null;

    try {
      // ---- formatters (pure) ---------------------------------------
      ok('fmt thousands', fmt(1234567) === '1,234,567');
      ok('fmt zero', fmt(0) === '0');
      ok('fmt NaN is zero', fmt(NaN) === '0');
      ok('compact small', compact(999) === '999');
      ok('compact k', compact(1234) === '1.2k');
      ok('compact big k', compact(45000) === '45k');
      ok('compact m', compact(2400000) === '2.4m');
      ok('pct half', pct(5, 10) === '50.00%');
      ok('pct clamps high', pct(20, 10) === '100.00%');
      ok('pct clamps low', pct(-5, 10) === '0.00%');
      ok('pct zero max', pct(5, 0) === '100.00%');
      ok('hex pads', hex(0x02101c) === '#02101c');
      ok('hex clamps negative', hex(-1) === '#000000');
      ok('monogram two words', monogram('Reef Shark') === 'RS');
      ok('monogram one word', monogram('Leviathan') === 'L');
      ok('monogram empty', monogram('') === '?');

      // ---- buy failure copy ----------------------------------------
      ok('fail coins', buyFailText({ reason: 'coins', cost: 500 }).indexOf('500') > 0);
      ok('fail locked', buyFailText({ reason: 'locked', needLevel: 12 }).indexOf('12') > 0);
      ok('fail maxed', buyFailText({ reason: 'maxed' }).indexOf('max') > 0);
      ok('fail unknown', buyFailText(null).length > 0);
      var copyKeys = ['coins', 'locked', 'maxed', 'owned', 'dev-unlocked', 'not-owned', 'x'];
      var noDash = true;
      for (var ci = 0; ci < copyKeys.length; ci++) {
        // The em dash is written as an escape so this file stays grep-clean.
        if (buyFailText({ reason: copyKeys[ci], cost: 1, needLevel: 1 }).indexOf('\u2014') >= 0) noDash = false;
      }
      ok('no em dashes in copy', noDash);

      // ---- init against the stub -----------------------------------
      init({ document: stub, profile: { coins: 100, level: 5, xp: 0, selected: 'reef', sharks: {} } });
      ok('inited', S.inited === true);
      ok('nodes grabbed', !!N('rfHud') && !!N('rfMenu'));
      ok('bound once', S.bound === true);

      // ---- screen transitions --------------------------------------
      hideAll();
      ok('hideAll clears screen', S.screen === 'none');
      ok('hideAll hides hud', N('rfHud').classList.contains('rf-on') === false);

      showHud();
      ok('showHud sets screen', S.screen === 'hud');
      ok('showHud shows hud', N('rfHud').classList.contains('rf-on') === true);
      ok('showHud hides menu', N('rfMenu').classList.contains('rf-on') === false);
      ok('showHud resets diff baseline', S.lastHud === null);

      showResults({ score: 1200, coins: 40, level: 3, xpInto: 5, xpNeed: 10, unlocks: [] });
      ok('showResults sets screen', S.screen === 'results');
      ok('results exclusive', N('rfHud').classList.contains('rf-on') === false &&
        N('rfResults').classList.contains('rf-on') === true);
      ok('results score painted', N('rfResScore').textContent === '1,200');

      showResults({ score: 0, newBest: false, best: { score: 900 }, unlocks: [] });
      ok('results best line', N('rfResBest').textContent.indexOf('900') > 0);
      ok('results not newbest', N('rfResBest').classList.contains('rf-newbest') === false);
      showResults({ score: 1000, newBest: true, best: { score: 1000 }, unlocks: [] });
      ok('results newbest flag', N('rfResBest').classList.contains('rf-newbest') === true);
      ok('results newbest text', N('rfResBest').textContent === 'NEW BEST');

      showResults({ score: 5, level: 4, levelUps: 2, xpInto: 1, xpNeed: 4, unlocks: [] });
      ok('levelup flagged', N('rfResLevel').classList.contains('rf-levelup') === true);
      ok('levelup count shown', N('rfResLevel').textContent.indexOf('x2') > 0);
      showResults({ score: 5, level: 4, levelUps: 0, xpInto: 1, xpNeed: 4, unlocks: [] });
      ok('no levelup flag', N('rfResLevel').classList.contains('rf-levelup') === false);

      showResults({
        score: 5, unlocks: [{ tier: 4, level: 10, count: 5, names: ['A', 'B', 'C'] }]
      });
      ok('unlock rendered', N('rfResUnlocks').children.length === 1);
      ok('unlock counts remainder',
        N('rfResUnlocks').children[0].textContent.indexOf('2 more') > 0);
      showResults({ score: 5, unlocks: [] });
      ok('unlocks cleared', N('rfResUnlocks').children.length === 0);

      // Results must not throw on a missing payload.
      var threw = false;
      try { showResults(null); } catch (e) { threw = true; }
      ok('results tolerates null payload', threw === false);

      // ---- hudState diffing ----------------------------------------
      showHud();
      var first = hudState({ name: 'Reef Shark', hp: 60, maxHp: 60, boost: 1, coins: 0 });
      ok('first push paints', first === true);
      ok('hud name painted', N('rfHudName').textContent === 'Reef Shark');
      ok('hud hp full', N('rfHudHp').style.width === '100.00%');
      ok('hud coins compact', N('rfHudCoins').textContent === '0');

      var same = hudState({ name: 'Reef Shark', hp: 60, maxHp: 60, boost: 1, coins: 0 });
      ok('identical push is a no-op', same === false);

      var moved = hudState({ name: 'Reef Shark', hp: 30, maxHp: 60, boost: 1, coins: 0 });
      ok('changed push paints', moved === true);
      ok('hp halves', N('rfHudHp').style.width === '50.00%');
      ok('hp not low at half', N('rfHudHp').classList.contains('rf-low') === false);
      hudState({ name: 'Reef Shark', hp: 6, maxHp: 60, boost: 1, coins: 0 });
      ok('hp low under 30 percent', N('rfHudHp').classList.contains('rf-low') === true);

      // Partial pushes must carry unspecified fields forward.
      hudState({ coins: 4200 });
      ok('partial push keeps name', S.lastHud.name === 'Reef Shark');
      ok('partial push updates coins', N('rfHudCoins').textContent === '4.2k');

      hudState({ powerName: 'Pyro Breath', power: 0.5, powerReady: false });
      ok('power shown', N('rfPower').classList.contains('rf-hide') === false);
      ok('power label', N('rfPowerLabel').textContent === 'Pyro Breath');
      ok('power fill height', N('rfPowerFill').style.height === '50.00%');
      ok('power not ready', N('rfPower').classList.contains('rf-ready') === false);
      hudState({ power: 1, powerReady: true });
      ok('power ready', N('rfPower').classList.contains('rf-ready') === true);

      hudState({ dev: true });
      ok('dev chip on', N('rfDevChip').classList.contains('rf-on') === true);
      hudState({ dev: false });
      ok('dev chip off', N('rfDevChip').classList.contains('rf-on') === false);

      ok('bad hudState rejected', hudState(null) === false);
      ok('non-object hudState rejected', hudState(7) === false);

      // ---- combo chip ----------------------------------------------
      var chipNode = N('rfChip');
      hudState({ combo: 3 });
      ok('combo chip shown', chipNode.classList.contains('rf-on') === true);
      ok('combo chip text', chipNode.textContent === 'x3');
      var tok = S.chipToken;
      hudState({ combo: 3 });
      ok('same combo does not refire', S.chipToken === tok);
      hudState({ combo: 5 });
      ok('new combo refires', S.chipToken === tok + 1);
      ok('combo chip replaced not stacked', chipNode.textContent === 'x5');
      hudState({ combo: 0 });
      ok('combo zero does not fire', S.chipToken === tok + 1);
      if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }

      // Frenzy triggers use the existing one-at-a-time chip/toast surfaces.
      toast('Blood Frenzy');
      ok('toast shown for frenzy trigger', N('rfShopToast').classList.contains('rf-on') === true);
      ok('toast text shown', N('rfShopToast').textContent === 'Blood Frenzy');
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

      // ---- thumbnail cache -----------------------------------------
      ok('thumb rejects non-data url', setThumb('reef', 'http://x/y.png') === false);
      ok('thumb rejects empty id', setThumb('', 'data:image/png;base64,AA') === false);
      ok('thumb rejects non-string', setThumb('reef', null) === false);
      ok('thumb accepts data url', setThumb('reef', 'data:image/png;base64,AA') === true);
      ok('thumb cached', S.thumbs.reef === 'data:image/png;base64,AA');
      setThumb('reef', 'data:image/png;base64,BB');
      ok('thumb overwritten', S.thumbs.reef === 'data:image/png;base64,BB');
      ok('thumb cache isolated', S.thumbs.tiger === undefined);

      // A card with a cached thumb paints the image; without one it falls
      // back to a monogram, which is what keeps the menu usable at boot.
      var withThumb = new Node('span');
      paintThumb(withThumb, 'reef');
      ok('thumb card uses image',
        String(withThumb.style.backgroundImage).indexOf('data:image/png;base64,BB') > 0);
      ok('thumb card not mono', withThumb.classList.contains('rf-mono') === false);

      var noThumb = new Node('span');
      paintThumb(noThumb, 'nosuchshark');
      ok('fallback is mono', noThumb.classList.contains('rf-mono') === true);
      ok('fallback has no image', noThumb.style.backgroundImage === 'none');
      ok('fallback has monogram child', noThumb.children.length === 1);

      // ---- callbacks -----------------------------------------------
      var dived = 0, powered = 0, navd = 0;
      onDive(function () { dived++; });
      onPower(function () { powered++; });
      onShopNav(function () { navd++; });

      var prevented = 0;
      N('rfPower').fire('pointerdown', { preventDefault: function () { prevented++; } });
      ok('power callback fired', powered === 1);
      ok('power prevents default', prevented === 1);
      N('rfPower').fire('click', { preventDefault: function () { prevented++; } });
      ok('click suppressed, no double fire', powered === 1 && prevented === 2);

      N('rfDive').fire('click');
      ok('dive callback fired', dived === 1);
      N('rfResAgain').fire('click');
      ok('again reuses dive callback', dived === 2);

      onDive(null);
      var threw2 = false;
      try { N('rfDive').fire('click'); } catch (e) { threw2 = true; }
      ok('null dive callback is safe', threw2 === false);

      // A throwing callback must not escape into the engine's frame.
      onPower(function () { throw new Error('boom'); });
      var threw3 = false;
      try { N('rfPower').fire('pointerdown', {}); } catch (e) { threw3 = true; }
      ok('throwing power callback contained', threw3 === false);

      onShopNav(null);

      // ---- engine interface: handles, run boundaries, chips ---------
      // The engine calls init({profile,start,firePower,quit}) and expects
      // DIVE/AGAIN to reach start() and the power button to reach firePower().
      var started = [], fired = 0, quit = 0;
      CB.dive = null; CB.power = null; CB.shopNav = null;
      delete RF.UI.onDive; delete RF.UI.onPower;
      RF.UI.onDive = onDive; RF.UI.onPower = onPower; RF.UI.onShopNav = onShopNav;
      S.bound = false; store = {};
      init({ document: stub, profile: { coins: 0, level: 1, xp: 0, selected: 'reef', sharks: {} },
             start: function (id) { started.push(id); },
             firePower: function () { fired++; },
             quit: function () { quit++; } });
      N('rfDive').fire('click');
      ok('engine start handle reached by DIVE', started.length === 1);
      N('rfResAgain').fire('click');
      ok('engine start handle reached by AGAIN', started.length === 2);
      N('rfPower').fire('pointerdown', {});
      ok('engine firePower handle reached', fired === 1);

      // An explicit registration must WIN over the engine handle.
      var reg = 0;
      onPower(function () { reg++; });
      N('rfPower').fire('pointerdown', {});
      ok('registered onPower wins over handle', reg === 1 && fired === 1);
      onPower(null);
      N('rfPower').fire('pointerdown', {});
      ok('clearing registration falls back to handle', fired === 2);

      // Property-ASSIGNMENT style (the engine's documented alternative).
      var assigned = 0;
      RF.UI.onPower = function () { assigned++; };
      N('rfPower').fire('pointerdown', {});
      ok('assigned onPower property is honoured', assigned === 1 && fired === 2);
      RF.UI.onPower = onPower;
      N('rfPower').fire('pointerdown', {});
      ok('restoring the registrar re-enables the handle', fired === 3);

      // runStarted / runEnded.
      chip('x9');
      ok('chip up before runStarted', N('rfChip').classList.contains('rf-on') === true);
      runStarted({ save: { coins: 1 } });
      ok('runStarted shows hud', S.screen === 'hud');
      ok('runStarted clears transients', N('rfChip').classList.contains('rf-on') === false);
      // The engine sends the coach line immediately BEFORE runStarted, so the
      // tutorial strip must survive that transition.
      tutorial('Hold and drag anywhere to swim.');
      ok('tutorial shows on an explicit call', N('rfTutorial').classList.contains('rf-on') === true);
      runStarted({ save: { coins: 1 } });
      ok('runStarted keeps the tutorial strip', N('rfTutorial').classList.contains('rf-on') === true);
      chip('x2');
      runEnded({ save: { coins: 1 } });
      ok('runEnded clears the tutorial strip', N('rfTutorial').classList.contains('rf-on') === false);
      ok('runEnded clears the chip', N('rfChip').classList.contains('rf-on') === false);
      ok('tutorial(null) hides the strip', (function () {
        tutorial('x'); tutorial(null);
        return N('rfTutorial').classList.contains('rf-on') === false;
      })());
      ok('runStarted adopts ctx', S.ctx && S.ctx.save.coins === 1);
      hudState({ name: 'A', hp: 5, maxHp: 10, coins: 0 });
      runEnded({ save: { coins: 2 } });
      ok('runEnded resets diff baseline', S.lastHud === null);
      ok('runEnded adopts ctx', S.ctx && S.ctx.save.coins === 2);
      ok('runStarted tolerates no ctx', runStarted() === true);
      ok('runEnded tolerates no ctx', runEnded() === true);

      // hpFrac is trusted when the engine supplies it.
      showHud();
      hudState({ name: 'B', hp: 999, maxHp: 10, hpFrac: 0.25, coins: 0 });
      ok('hpFrac wins over hp/maxHp', N('rfHudHp').style.width === '25.00%');
      ok('hpFrac drives the low state', N('rfHudHp').classList.contains('rf-low') === true);

      // powerId resolves through RFD.ABILITIES.
      hudState({ powerId: 'pyro', power: 1, powerReady: true });
      ok('powerId resolves to a name', N('rfPowerLabel').textContent === 'Pyro Breath');
      hudState({ powerId: null, power: 0, powerReady: false });
      ok('null powerId hides the button', N('rfPower').classList.contains('rf-hide') === true);

      // The engine's chips QUEUE is drained one entry per push, never stacked.
      showHud();
      var queue = ['x3', 'FRENZY', 'GOLD RUSH'];
      hudState({ name: 'C', chips: queue });
      ok('chip queue drained by one', queue.length === 2);
      ok('chip shows the head', N('rfChip').textContent === 'x3');
      hudState({ name: 'C', chips: queue });
      ok('chip queue drains again', queue.length === 1 && N('rfChip').textContent === 'FRENZY');
      hudState({ name: 'C', chips: [] });
      ok('empty queue does not throw', true);
      if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }

      // The reused HUD_STATE must never be retained.
      var reused = { name: 'D', hp: 1, maxHp: 2, coins: 5, chips: null };
      hudState(reused);
      reused.name = 'MUTATED'; reused.coins = 9999;
      ok('hudState retains no reference to the pushed object',
        S.lastHud !== reused && S.lastHud.name === 'D' && S.lastHud.coins === 5);

      // ---- screen exclusivity invariant ----------------------------
      var screens = ['menu', 'shop', 'results', 'hud'];
      var exclusive = true;
      for (var si = 0; si < screens.length; si++) {
        showOnly(screens[si]);
        var on = 0;
        for (var sj = 0; sj < screens.length; sj++) {
          if (N(SCREENS[screens[sj]]).classList.contains('rf-on')) on++;
        }
        if (on !== 1) exclusive = false;
      }
      ok('exactly one screen at a time', exclusive);
      showOnly('none');
      var anyOn = false;
      for (var sk = 0; sk < screens.length; sk++) {
        if (N(SCREENS[screens[sk]]).classList.contains('rf-on')) anyOn = true;
      }
      ok('none hides everything', anyOn === false);

    } finally {
      if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }
      if (S.tutTimer) { clearTimeout(S.tutTimer); S.tutTimer = null; }
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      doc = saved.doc;
      S.ctx = saved.ctx; S.profile = saved.profile; S.thumbs = saved.thumbs;
      S.screen = saved.screen; S.lastHud = saved.lastHud; S.nodes = saved.nodes;
      S.bound = saved.bound; S.menuPick = saved.menuPick; S.shopPick = saved.shopPick;
      S.inited = saved.inited; S.handles = saved.handles;
      CB.dive = saved.dive; CB.power = saved.power; CB.shopNav = saved.shopNav;
      RF.UI.onDive = onDive; RF.UI.onPower = onPower; RF.UI.onShopNav = onShopNav;
    }

    for (var li = 0; li < log.length; li++) {
      if (typeof console !== 'undefined' && console.log) console.log(log[li]);
    }
    return { pass: fails === 0, checks: checks, fails: fails, log: log };
  }

  // --------------------------------------------------------------- export
  RF.UI = {
    init: init,
    showMenu: showMenu,
    showShop: showShop,
    showResults: showResults,
    showHud: showHud,
    hideAll: hideAll,
    runStarted: runStarted,
    runEnded: runEnded,
    hudState: hudState,
    setThumb: setThumb,
    onDive: onDive,
    onPower: onPower,
    onShopNav: onShopNav,
    chip: chip,
    tutorial: tutorial,
    toast: toast,
    get screen() { return S.screen; },
    __selftest: __selftest
  };
}());
