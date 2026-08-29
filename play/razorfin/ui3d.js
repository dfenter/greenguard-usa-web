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
  var ACT_NAMES = { 1: 'Real Sharks', 2: 'Monsters', 3: 'Legends', 4: 'Pantheon', 5: 'Underworld' };
  var TRACKS = ['bite', 'speed', 'boost', 'power'];
  var TRACK_LABEL = { bite: 'Bite', speed: 'Speed', boost: 'Boost', power: 'Power' };
  var UP_PIPS = 5;
  var CHIP_MS = 1000;          // UI_LAW rule 3: max 1.0s hold
  var TUTORIAL_MS = 3200;      // UI_LAW rule 5: fades after ~3s
  var FRENZY_LABEL = { blood: 'BLOOD FRENZY', school: 'SCHOOL FRENZY', golden: 'GOLDEN SCHOOL' };
  // 6.7 pickup capsules (world writes plain e.buffId per fix-round 2's PICKUP
  // ID SEAM); labels for the buff-pickup hologram toast routed through
  // frenzyCue('buff:<id>'). An unrecognized id falls back to a generic label
  // rather than throwing, so a data-only new capsule still reads as *something*.
  var BUFF_LABEL = {
    overdrive: 'OVERDRIVE', shield: 'SHIELD BUBBLE', megajaw: 'MEGA-JAW',
    magnet: 'FRENZY MAGNET', chum: 'CHUM CLOUD', apex: 'APEX SURGE',
    // Rev 12 (12.4): SUPER SIZE, SHIELD, SPEED pickups. shield/speed reuse
    // the id an engine build already has a chance of publishing (existing
    // 'shield' above; 'speed' added new) alongside a longer supersize id.
    supersize: 'SUPER SIZE', superSize: 'SUPER SIZE', speed: 'SPEED BOOST'
  };
  // Rev 12 (12.4): pickup icon glyphs shown on the buff tick chips, gem-mesh
  // look with a per-type glyph. Keyed the same as BUFF_LABEL/pickup ids so
  // an unrecognised id simply renders no glyph rather than throwing.
  var BUFF_ICON = {
    overdrive: '⚡', shield: '🛡', megajaw: '🦷',
    magnet: '🧲', chum: '🩸', apex: '👑',
    supersize: '⬆', superSize: '⬆', speed: '💨'
  };
  // Rev 12 (12.2): shark classes. data.js SHARKS gain `cls`; a def with no
  // recognised class simply renders no badge (older data.js build, or a
  // typo'd class id) rather than throwing.
  var CLASS_LABEL = {
    common: 'COMMON', rare: 'RARE', epic: 'EPIC',
    legendary: 'LEGENDARY', god: 'GOD', demon: 'DEMON'
  };
  var CLASS_CSS = {
    common: 'rf-class-common', rare: 'rf-class-rare', epic: 'rf-class-epic',
    legendary: 'rf-class-legendary', god: 'rf-class-god', demon: 'rf-class-demon'
  };
  // Rev 12 (12.1): a simple emoji/glyph per level's horizon theme. An
  // unrecognised/absent theme falls back to a generic wave glyph rather than
  // a blank card.
  var LEVEL_THEME_ICON = {
    volcano_palms: '🌋', cliffs_cacti_ruins: '🏜', barrier_reef_cays: '🏝',
    atolls_overwater_huts: '🏖', fjords_snow: '🏔', glaciers_icebergs: '🧊',
    peaks_lagoon: '🌴', volcanic_isles: '🌋', temples_rice_terraces: '🛕',
    divi_trees_beach: '🌊', green_hills: '⛰', cliffs_pier_kelp: '🎣'
  };
  function levelThemeIcon(lvl) {
    var theme = lvl && lvl.sky && lvl.sky.horizonTheme;
    return (theme && LEVEL_THEME_ICON[theme]) || '🌊';
  }

  var CLASS_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, god: 4, demon: 5 };
  function classBadge(def) {
    var c = def && def.cls;
    if (!c || !CLASS_LABEL[c]) return null;
    return mk('span', 'rf-class-badge ' + CLASS_CSS[c], CLASS_LABEL[c]);
  }

  var FRENZY_VARIANTS = {
    blood: { chip: 'rf-chip-blood', toast: 'rf-toast-blood' },
    school: { chip: 'rf-chip-school', toast: 'rf-toast-school' },
    golden: { chip: 'rf-chip-golden', toast: 'rf-toast-golden' }
  };
  var FRENZY_STYLE_TEXT = [
    '.rf-chip.rf-chip-blood,#rfChip.rf-chip-blood,.rf-toast.rf-toast-blood,#rfShopToast.rf-toast-blood{background:rgba(179,18,42,.24);color:#ffb3ba;border-color:rgba(255,112,132,.62)}',
    '.rf-chip.rf-chip-school,#rfChip.rf-chip-school,.rf-toast.rf-toast-school,#rfShopToast.rf-toast-school{background:rgba(219,232,245,.2);color:#eaf4ff;border-color:rgba(219,232,245,.7)}',
    '.rf-chip.rf-chip-golden,#rfChip.rf-chip-golden,.rf-toast.rf-toast-golden,#rfShopToast.rf-toast-golden{background:rgba(255,214,122,.22);color:#ffe8ad;border-color:rgba(255,214,122,.72)}',
    '.rf-frenzy-blood{filter:saturate(1.12)}'
  ].join('');

  // ------------------------------------------------------ Rev 7 economy UI
  // S4 owns ui3d.js only (SPEC3D 7.7 ownership map); index.html is the
  // orchestrator's file, so every Rev 7 economy element (mission strip, gem
  // counters, relic dots, Collection/Skins shop section, the DEV-chip/SHOP
  // overlap guard) is built and styled entirely in JS here, injected as a
  // second <style> node alongside the existing frenzy-cue stylesheet.
  var GEM_ICON = '♦'; // simple diamond glyph, no image asset dependency
  var MISSION_KIND_LABEL = {
    eatCount: 'Eat', findRelic: 'Find a relic', surviveZone: 'Survive', score: 'Score'
  };
  var REV7_STYLE_TEXT = [
    // Mission strip: menu-only, sits directly under .rf-bar-top per task 1.
    '#rfMissionStrip{display:flex;gap:8px;flex:0 0 auto;padding:8px 2px 0;overflow-x:auto;-webkit-overflow-scrolling:touch}',
    '#rfMissionStrip:empty{display:none}',
    '.rf-mission{flex:0 0 auto;min-width:132px;max-width:200px;padding:6px 10px;border-radius:8px;',
    'background:rgba(10,34,51,.7);border:1px solid var(--line,rgba(88,176,214,.28))}',
    '.rf-mission-l{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--dim,#8fb4c4);',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rf-mission-bar{height:4px;border-radius:2px;background:rgba(207,245,255,.12);margin-top:4px;overflow:hidden}',
    '.rf-mission-bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#27e0ff,#9dff2b)}',
    '.rf-mission.rf-mission-done .rf-mission-bar>i{background:linear-gradient(90deg,#ffd67a,#ffe8ad)}',
    '.rf-mission.rf-mission-done .rf-mission-l{color:#ffd67a}',
    // Gem stat, reuses the existing .rf-stat look (menu/shop header + HUD).
    '.rf-gem b{color:#8fe3ff}',
    '#rfHudGems{position:absolute;left:calc(var(--pad-l,0px) + 12px);top:calc(var(--pad-t,0px) + 8px);',
    'display:flex;align-items:baseline;gap:4px;font-size:13px;font-weight:800;color:#8fe3ff;',
    'text-shadow:0 0 8px rgba(39,224,255,.4);pointer-events:none}',
    '#rfHudGems:empty{display:none}',
    // Per-zone relic dots (menu roster tier head).
    '.rf-relic-dots{display:inline-flex;gap:3px;margin-left:8px;vertical-align:middle}',
    '.rf-relic-dot{width:7px;height:7px;border-radius:50%;background:rgba(207,245,255,.16);',
    'border:1px solid rgba(207,245,255,.3)}',
    '.rf-relic-dot.rf-relic-on{background:#ffd67a;border-color:#ffd67a;box-shadow:0 0 5px rgba(255,214,122,.7)}',
    // Mission-tick chip variant (task 2: chip styling supports a mission tick).
    '#rfChip.rf-chip-mission,.rf-chip.rf-chip-mission{background:rgba(157,255,43,.18);color:#c8ffb0;',
    'border:1px solid rgba(157,255,43,.5)}',
    // Results: gems / mission results / relic finds / unlock callouts.
    '.rf-res-gems{color:#8fe3ff}',
    '.rf-res-mission{display:flex;align-items:center;justify-content:space-between;gap:8px;',
    'padding:4px 0;font-size:13px;color:var(--dim,#8fb4c4)}',
    '.rf-res-mission.rf-res-mission-done{color:#ffd67a}',
    '.rf-res-mission-tag{font-size:11px;font-weight:800;letter-spacing:.06em}',
    '.rf-res-relic{padding:3px 0;font-size:13px;color:#ffd67a}',
    '.rf-res-callout{margin-top:6px;padding:8px 10px;border-radius:8px;',
    'background:rgba(255,214,122,.12);border:1px solid rgba(255,214,122,.4);',
    'font-size:13px;font-weight:700;color:#ffe8ad}',
    // Shop: Collection/Skins section.
    '.rf-shop-act-h.rf-collection-h{color:#8fe3ff}',
    '.rf-collect-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}',
    '.rf-collect-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;',
    'border-radius:8px;background:rgba(10,34,51,.7);border:1px solid var(--line,rgba(88,176,214,.28));',
    'font-size:12px;text-align:center;cursor:pointer}',
    '.rf-collect-card:disabled{cursor:default;opacity:.55}',
    '.rf-collect-card.rf-collect-owned{border-color:#7fe3b0}',
    '.rf-collect-swatch{width:36px;height:28px;border-radius:6px}',
    '.rf-collect-silhouette{background:#0a1420;filter:brightness(.35)}',
    '.rf-collect-cost{color:#8fe3ff;font-weight:800}',
    '.rf-collect-hint{color:var(--dim,#8fb4c4);font-size:10px;line-height:1.25}',
    // 6: known-bug fixes. DEV chip vs SHOP button overlap guard -- forces the
    // dev chip out of the flex row's shrink pool so a long roster line can
    // never squeeze it over the SHOP/DIVE buttons in the bottom bar, and
    // caps it to a fixed max-width so an unusually wide render never spills.
    '#rfDevChip{flex:0 0 auto;max-width:64px;z-index:5}',
    // Rev 12 (12.4): GOLD RUSH HUD -- corner meter bar + banner, HUD ONLY-LAW
    // minimal (one small bar, one line, no new persistent chrome).
    '#rfGoldRush{position:absolute;right:calc(var(--pad-r,0px) + 12px);top:calc(var(--pad-t,0px) + 8px);',
    'display:none;flex-direction:column;align-items:flex-end;gap:2px;pointer-events:none;width:120px}',
    '#rfGoldRush.rf-on{display:flex}',
    '#rfGoldRushBar{width:100%;height:6px;border-radius:3px;background:rgba(10,34,51,.7);',
    'border:1px solid rgba(255,214,122,.4);overflow:hidden}',
    '#rfGoldRushFill{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffd67a,#fff3c4)}',
    '#rfGoldRushBanner{font-size:12px;font-weight:800;letter-spacing:.04em;color:#ffd67a;',
    'text-shadow:0 0 8px rgba(255,214,122,.6);opacity:0;transition:opacity .15s}',
    '#rfGoldRushBanner.rf-on{opacity:1}',
    '#rfGoldRushBanner.rf-gold-mega{color:#fff3c4;text-shadow:0 0 10px rgba(255,214,122,.9)}',
    // Rev 12 (12.2): class badges (common/rare/epic/legendary/god/demon).
    '.rf-class-badge{display:inline-block;font-size:9px;font-weight:800;letter-spacing:.05em;',
    'padding:1px 5px;border-radius:6px;text-transform:uppercase;margin-left:4px;vertical-align:middle}',
    '.rf-class-common{background:rgba(158,169,178,.22);color:#c7cdd3;border:1px solid rgba(158,169,178,.5)}',
    '.rf-class-rare{background:rgba(63,140,255,.22);color:#a9c8ff;border:1px solid rgba(63,140,255,.55)}',
    '.rf-class-epic{background:rgba(168,85,247,.22);color:#dcb9ff;border:1px solid rgba(168,85,247,.55)}',
    '.rf-class-legendary{background:rgba(255,214,122,.22);color:#ffe8ad;border:1px solid rgba(255,214,122,.6)}',
    '.rf-class-god{background:rgba(255,255,255,.28);color:#fffdf3;border:1px solid rgba(255,232,173,.85);',
    'text-shadow:0 0 6px rgba(255,255,255,.8)}',
    '.rf-class-demon{background:rgba(179,18,42,.28);color:#ffb3ba;border:1px solid rgba(255,84,84,.7)}',
    // Rev 12 (12.1): Level Select screen -- 12 location cards between Menu
    // and DIVE.
    '#rfLevelSelect{position:absolute;inset:0;display:none;flex-direction:column;',
    'background:rgba(4,14,22,.96);z-index:8;padding:12px}',
    '#rfLevelSelect.rf-on{display:flex}',
    '#rfLevelSelectGrid{flex:1;overflow-y:auto;display:grid;',
    'grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:8px 2px}',
    '.rf-level-card{position:relative;display:flex;flex-direction:column;justify-content:flex-end;',
    'min-height:96px;border-radius:10px;padding:8px;border:1px solid var(--line,rgba(88,176,214,.28));',
    'color:#eaf4ff;text-align:left;overflow:hidden;cursor:pointer}',
    '.rf-level-card:disabled{cursor:default}',
    '.rf-level-card.rf-level-sel{border-color:#ffd67a;box-shadow:0 0 0 2px rgba(255,214,122,.5)}',
    '.rf-level-icon{font-size:22px}',
    '.rf-level-name{font-size:13px;font-weight:800;margin-top:4px}',
    '.rf-level-best{font-size:11px;color:var(--dim,#cfe9f5);opacity:.85}',
    '.rf-level-lock{position:absolute;inset:0;display:flex;flex-direction:column;',
    'align-items:center;justify-content:center;gap:4px;background:rgba(4,14,22,.72);',
    'font-size:11px;font-weight:700;color:#cfe9f5}',
    '.rf-level-lock-glyph{font-size:18px}',
    '#rfLevelSelectBar{display:flex;gap:8px;padding-top:8px}'
  ].join('');
  var rev7StyleNode = null;
  function ensureRev7Styles() {
    var d = D();
    if (!d || !d.createElement) return false;
    if (rev7StyleNode) return true;
    var style = d.createElement('style');
    style.id = 'rfRev7Styles';
    style.textContent = REV7_STYLE_TEXT;
    var host = d.head || d.body || d.documentElement;
    if (host && host.appendChild) host.appendChild(style);
    rev7StyleNode = style;
    return true;
  }

  // ------------------------------------------------------------- plumbing
  // A document reference resolved lazily so __selftest can inject a stub.
  var doc = null;
  var frenzyStyleNode = null;
  var activeFrenzyCue = null;
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

  function normalizeFrenzyCue(cue) {
    if (cue === 'goldRush' || cue === 'goldrush' || cue === 'golden') return 'golden';
    if (cue === 'blood' || cue === 'school') return cue;
    return null;
  }

  function ensureFrenzyCueStyles() {
    var d = D();
    if (!d || !d.createElement) return false;
    if (frenzyStyleNode) return true;
    var style = d.createElement('style');
    style.id = 'rfFrenzyCueStyles';
    style.textContent = FRENZY_STYLE_TEXT;
    var host = d.head || d.body || d.documentElement;
    if (host && host.appendChild) host.appendChild(style);
    frenzyStyleNode = style;
    return true;
  }

  function setFrenzyCue(cue) {
    var key = normalizeFrenzyCue(cue);
    ensureFrenzyCueStyles();
    activeFrenzyCue = key;
    var chipNode = N('rfChip');
    var toastNode = N('rfShopToast');
    if (chipNode) addClass(chipNode, 'rf-chip');
    if (toastNode) addClass(toastNode, 'rf-toast');
    for (var k in FRENZY_VARIANTS) {
      if (!Object.prototype.hasOwnProperty.call(FRENZY_VARIANTS, k)) continue;
      removeClass(chipNode, FRENZY_VARIANTS[k].chip);
      removeClass(toastNode, FRENZY_VARIANTS[k].toast);
    }
    if (key) {
      addClass(chipNode, FRENZY_VARIANTS[key].chip);
      addClass(toastNode, FRENZY_VARIANTS[key].toast);
    }
    return key;
  }

  // Defensive numeric read with a fallback, used by the thumbnail bake path
  // when reading fields off a rig's userData.
  function num(v, fallback) {
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
  }

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
    thumbs: {},           // id -> dataURL (set by shark3d/engine, OR baked here)
    menuPick: null,       // id highlighted in the menu (not yet dived)
    shopPick: null,       // id whose upgrade panel the shop footer shows
    chipTimer: null,
    chipToken: 0,
    tutTimer: null,
    lastHud: null,        // previous hudState for diffing (primitives only)
    nodes: {},
    handles: null,        // engine bag: {start, firePower, quit}
    bound: false,
    // art MAJOR 1: menu thumbnail bake state.
    bakeQueue: [],         // ids waiting to be baked, visible cards first
    bakeQueued: {},         // id -> true while queued/baking (dedupe)
    bakeVisible: {},        // id -> true while its card is on screen
    bakeBytes: 0,           // running estimate of cached dataURL bytes
    bakeTimer: null,
    bakeDisabled: false     // set true if buildShark/renderer is unavailable
  };

  var CB = { dive: null, power: null, shopNav: null };

  // -------------------------------------------------------- node lookup
  // Every container id here must exist in index.html. Missing nodes are
  // tolerated (null) so a partial page cannot throw during boot.
  var NODE_IDS = [
    'rfMenu', 'rfMenuRoster', 'rfMenuCoins', 'rfMenuLevel', 'rfMenuXpFill',
    'rfMenuXpText', 'rfMenuSel', 'rfMenuSelName', 'rfMenuSelBlurb', 'rfDive',
    'rfMenuShop', 'rfCreditsBtn', 'rfCreditsOverlay', 'rfCreditsList', 'rfCreditsClose',
    'rfShop', 'rfShopList', 'rfShopCoins', 'rfShopUp', 'rfShopUpName',
    'rfShopBack', 'rfShopToast',
    'rfResults', 'rfResScore', 'rfResBest', 'rfResRows', 'rfResUnlocks',
    'rfResXpFill', 'rfResXpText', 'rfResLevel', 'rfResAgain', 'rfResShop',
    'rfResMenu',
    'rfHud', 'rfHudHp', 'rfHudBoost', 'rfPower',
    'rfPowerLabel', 'rfPowerFill', 'rfPowerPips', 'rfChip',
    'rfDevChip', 'rfTutorial', 'rfMinimap', 'rfMinimapWrap', 'rfMinimapDot',
    'rfHudCluster', 'rfHudScore', 'rfHudCombo'
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
    // Rev 12 (12.1): Level Select is a dynamically-injected overlay (index3d
    // .html predates it, per file ownership -- ui3d.js builds its own DOM
    // node the same way the Rev 7 gem stat / mission strip were added), so
    // it is not part of the fixed SCREENS map above and is toggled here.
    if (levelSelectNode) toggleClass(levelSelectNode, 'rf-on', name === 'levelSelect');
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

  // ------------------------------------------------ Rev 7 economy readers
  // Every read here is defensive: S3's meta.js/data.js Rev 7 fields
  // (gems/relics/missions, MISSIONS/RELICS tables, Meta.spendGems/
  // rollMissions) may not have landed yet, or may land in a slightly
  // different shape (NOTES-rev7-laneS3.md was absent at S4 authoring time,
  // per SPEC3D 7.6). Every accessor below falls back to an inert value
  // rather than throwing so the whole UI keeps working standalone.
  function gems() {
    var p = profile();
    var v = p && p.gems;
    return (typeof v === 'number' && isFinite(v)) ? v : 0;
  }

  // data.js MISSIONS entries: {id, type, name, target:{...}, gems}. type is
  // one of eatCount/findRelic/surviveZone/score; target carries the numeric
  // goal under a type-specific key (n for eatCount/findRelic/score, seconds
  // for surviveZone). missionById() below still tolerates an id with no
  // matching def (a save referencing a MISSIONS entry removed by a future
  // data.js regen) by falling back to the id itself as the label.
  function missionGoal(def) {
    var t = (def && def.target) || {};
    if (def && def.type === 'surviveZone') return (typeof t.seconds === 'number') ? t.seconds : 1;
    return (typeof t.n === 'number') ? t.n : 1;
  }

  function activeMissionDefs() {
    var p = profile();
    var ids = p && p.missions && Array.isArray(p.missions.active) ? p.missions.active : [];
    var d = RFD();
    var list = (d && Array.isArray(d.MISSIONS)) ? d.MISSIONS : [];
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var def = null;
      for (var j = 0; j < list.length; j++) if (list[j] && list[j].id === id) { def = list[j]; break; }
      var progress = (p.missions.progress && p.missions.progress[id]) || 0;
      var done = !!(p.missions.completed && p.missions.completed[id]);
      out.push({
        id: id,
        label: (def && def.name) || (def && def.type && MISSION_KIND_LABEL[def.type]) || String(id),
        kind: def && def.type,
        goal: missionGoal(def),
        progress: (typeof progress === 'number' && isFinite(progress)) ? progress : 0,
        done: done
      });
    }
    return out;
  }

  // profile.relics[zoneId] = [bool, bool, bool] (meta.js defaultRelics/
  // validateSave). zoneId keys are numbers in RFD.ZONES but object property
  // access below works either way (numeric or string key).
  function relicProgress(zoneId) {
    var p = profile();
    var arr = p && p.relics && Array.isArray(p.relics[zoneId]) ? p.relics[zoneId] : null;
    if (!arr) return null;
    var have = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i]) have++;
    return { have: have, total: arr.length };
  }

  function zoneRelicCap() {
    return 3; // SPEC3D 7.6 + data.js RELICS_BY_ZONE: 3 relics per zone.
  }

  function relicName(zoneId, relicId) {
    var d = RFD();
    var byZone = d && d.RELICS_BY_ZONE;
    var arr = byZone && byZone[zoneId];
    if (arr) {
      for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === relicId) return arr[i].name;
    }
    // Fall back to a flat scan of RELICS in case RELICS_BY_ZONE is absent.
    var flat = (d && Array.isArray(d.RELICS)) ? d.RELICS : [];
    for (var j = 0; j < flat.length; j++) if (flat[j] && flat[j].id === relicId) return flat[j].name;
    return null;
  }

  // data.js SKINS: {id, name, sharkId (null = usable on any owned shark, or
  // a specific shark id), cost, palette:{base,belly,accent,glow}}.
  // data.js SECRET_SHARKS: {sharkId, relicSets, gemCost} -- rendered as a
  // silhouette collection card alongside skins per task 4 ("secret sharks
  // shown as silhouettes with unlock hint").
  function collectionSkins() {
    var d = RFD();
    return (d && Array.isArray(d.SKINS)) ? d.SKINS : [];
  }

  function secretSharkRows() {
    var d = RFD();
    return (d && Array.isArray(d.SECRET_SHARKS)) ? d.SECRET_SHARKS : [];
  }

  function skinOwned(id) {
    var p = profile();
    return !!(p && p.skins && Array.isArray(p.skins.owned) && p.skins.owned.indexOf(id) >= 0);
  }

  // Meta.spendGems(kit, profile, n, reason) is the single spend authority
  // (D5/7.6 law). doBuySkin/doUnlockSecretShark below call the higher-level
  // Meta.buySkin/Meta.unlockSecretSharkWithGems, which spend gems through
  // that same authority internally; both call sites guard against an older
  // meta.js build (or a headless/partial boot) missing the Rev 7 economy
  // API by checking typeof before calling and falling back to a toast
  // rather than throwing, per the task brief's "guard if API absent".

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
  //
  // Rev 7 D4/plan "Thumbnails": L1 is rebuilding every shark rig in
  // parallel (welded loft, exaggeration, girth de-clamp), so the CACHE KEY
  // itself carries THUMB_CACHE_REV -- an id-only key would let a bake taken
  // against the OLD glued-together mesh silently survive and keep showing
  // in the roster after L1's rebuild lands, since nothing else here would
  // ever know the underlying geometry changed. Bumping THUMB_CACHE_REV is
  // therefore the actual invalidation lever for a future rig rebuild, not
  // just documentation. The public id-based surface (setThumb/paintThumb
  // arguments, the data-shark DOM attribute, S.thumbs' external shape) is
  // unchanged; only the internal S.thumbs storage key is rev-scoped.
  function tk(id) { return THUMB_CACHE_REV + ':' + id; }

  function setThumb(id, url) {
    if (typeof id !== 'string' || !id) return false;
    if (typeof url !== 'string' || url.indexOf('data:') !== 0) return false;
    S.thumbs[tk(id)] = url;
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
    var url = S.thumbs[tk(id)];
    clear(node);
    if (url) {
      removeClass(node, 'rf-mono');
      // The monogram path below writes the `background` SHORTHAND inline,
      // which resets inline background-size/position and overrides the
      // stylesheet's contain/center. Clear it and set longhands explicitly.
      node.style.background = '';
      node.style.backgroundImage = 'url(' + url + ')';
      node.style.backgroundSize = 'contain';
      node.style.backgroundRepeat = 'no-repeat';
      node.style.backgroundPosition = 'center';
      node.style.backgroundColor = '#082036';
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

  // ------------------------------------------------------ art MAJOR 1 bake
  // Menu thumbnails were a monogram-only placeholder. Bake a tiny 3D render
  // of each def's rig into a cached dataURL, reusing the LIVE renderer
  // (RF.Game.renderer/.three) rather than opening a second WebGL context --
  // opening a second context on top of the live game canvas is exactly the
  // kind of iOS memory pressure the 2026-08-19 roster-grid crash came from,
  // so this bake path is only ever a temporary resize + re-render of the
  // SAME context, restored immediately after each shot.
  //
  // Guard: if RF.Art3D.buildShark or the renderer is unavailable, bakeThumb
  // is a no-op and every card keeps rendering its monogram fallback (never a
  // hard dependency).
  //
  // Budget math (documented per the task): thumbs are baked at 112x90 CSS
  // px, matching the card's own display size 1:1 (no retina multiplier --
  // a menu thumbnail does not need to survive a full-screen zoom, unlike
  // the game canvas itself), so each PNG frame is at most 112*90*4 = 40,320
  // raw RGBA bytes before compression; toDataURL's base64 PNG is smaller in
  // practice (largely flat cyberpunk gradients over dark water), but even
  // at zero compression the theoretical per-thumb ceiling is ~40KB decoded
  // (~54KB as base64 text). BAKE_BYTE_CAP below is 8MB, giving headroom for
  // roughly 200 fully-uncompressed worst-case thumbnails against a 61-shark
  // roster -- in practice PNG compression on these mostly-flat renders keeps
  // real usage far under that. Baking stops entirely once the running total
  // (S.bakeBytes) crosses the cap; already-baked thumbs are kept.
  var THUMB_W = 112, THUMB_H = 90;
  var BAKE_BYTE_CAP = 8 * 1024 * 1024;
  var bakeScene = null, bakeCamera = null, bakeLights = null;
  // Rev 7 (D4/plan "Thumbnails"): L1 is rebuilding shark meshes (welded rig,
  // exaggeration, girth de-clamp), so every stale bake keyed only by shark
  // id would otherwise survive across the mesh rebuild and show the OLD
  // glued-together silhouette forever (S.thumbs/bakeQueued/bakeVisible are
  // plain in-memory maps, not persisted, but a long-lived tab or a future
  // persisted-thumb cache would still serve stale art). All bake-path keys
  // below are suffixed with this token so a rev bump invalidates every old
  // entry by construction (new key, cache miss, re-bake).
  var THUMB_CACHE_REV = 'rev7';

  function idleSchedule(fn) {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(fn, { timeout: 200 });
    }
    return window.setTimeout(fn, 32);
  }

  function ensureBakeRig(three) {
    if (bakeScene) return true;
    if (!three || !three.Scene || !three.PerspectiveCamera) return false;
    bakeScene = new three.Scene();
    // Opaque deep-navy backdrop: indigo shark bodies vanish against the
    // card's near-black panel when the bake is left transparent.
    if (three.Color) bakeScene.background = new three.Color(0x082036);
    bakeCamera = new three.PerspectiveCamera(32, THUMB_W / THUMB_H, 1, 4000);
    var hemi = new three.HemisphereLight(0x9fe8ff, 0x03101c, 1.1);
    var sun = new three.DirectionalLight(0xdfffff, 1.2);
    sun.position.set(120, 220, 260);
    bakeScene.add(hemi, sun);
    bakeLights = { hemi: hemi, sun: sun };
    return true;
  }

  // One shark baked per call: build the rig, frame it from bodyLen/radiusY
  // (the same metrics shark3d already stamps onto group.userData), render
  // one frame into the LIVE renderer at thumb resolution, read back a PNG
  // dataURL, then dispose the rig and restore the renderer's prior size so
  // the next live game frame is unaffected.
  function bakeThumb(id) {
    if (S.bakeDisabled || S.thumbs[tk(id)]) return false;
    var art = RF.Art3D, game = RF.Game;
    if (!art || typeof art.buildShark !== 'function') { S.bakeDisabled = true; return false; }
    if (!game || !game.renderer || !game.three) return false;
    var def = sharkById(id);
    if (!def) return false;
    var three = game.three;
    if (!ensureBakeRig(three)) { S.bakeDisabled = true; return false; }
    var renderer = game.renderer;
    var rec = null;
    var prevSize = null;
    try {
      rec = art.buildShark(def);
    } catch (e) { return false; }
    if (!rec || !rec.group) return false;
    // Rev 14 (O4 lazy loading): a withheld or still-loading textured model
    // comes back as a placeholder rig. Baking that would print a capsule or an
    // empty frame; leave the styled monogram and let a later pass bake it.
    if (rec.group.userData && (rec.group.userData.rfWithheld || rec.group.userData.rfLoading)) {
      try { if (RF.Art3D && typeof RF.Art3D.releaseShark === 'function') RF.Art3D.releaseShark(rec); } catch (e) {}
      return false;
    }
    try {
      var group = rec.group;
      bakeScene.add(group);
      // Frame from the rig's MEASURED bounds, not a userData estimate: the
      // first bake shipped with a giant fin filling the card because the
      // assumed length under-read the true extents against the narrow fov.
      var fitBox = new three.Box3().setFromObject(group);
      var fitSize = new three.Vector3();
      var fitCenter = new three.Vector3();
      fitBox.getSize(fitSize);
      fitBox.getCenter(fitCenter);
      var halfV = Math.tan((bakeCamera.fov * Math.PI / 180) * 0.5);
      var halfH = halfV * (THUMB_W / THUMB_H);
      // Horizontal extent limits against the horizontal fov, vertical
      // against the vertical; depth pads either. Slight 1.06 margin only.
      var dist = Math.max(
        (Math.max(fitSize.x, fitSize.z) * 0.5) / halfH,
        (fitSize.y * 0.5) / halfV,
        40) * 1.06;
      bakeCamera.position.set(fitCenter.x + dist * 0.42, fitCenter.y + dist * 0.24, fitCenter.z + dist * 0.88);
      bakeCamera.lookAt(fitCenter.x, fitCenter.y, fitCenter.z);
      bakeCamera.updateProjectionMatrix();
      if (renderer.getSize) {
        prevSize = new three.Vector2();
        renderer.getSize(prevSize);
      }
      var prevPixelRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
      renderer.setPixelRatio(1);
      renderer.setSize(THUMB_W, THUMB_H, false);
      renderer.render(bakeScene, bakeCamera);
      var url = renderer.domElement.toDataURL('image/png');
      if (prevSize) renderer.setSize(prevSize.x, prevSize.y, false);
      renderer.setPixelRatio(prevPixelRatio);
      if (typeof url === 'string' && url.indexOf('data:') === 0) {
        // Base64 length approximates 4/3 of decoded byte size; good enough
        // for a running budget estimate (documented above), not exact
        // accounting.
        var estBytes = Math.floor(url.length * 0.75);
        if (S.bakeBytes + estBytes > BAKE_BYTE_CAP) return false;
        S.bakeBytes += estBytes;
        setThumb(id, url);
      }
    } catch (e) {
      // Never let a bake failure break the menu; the monogram fallback
      // already covers this id.
      return false;
    } finally {
      if (rec && rec.group && bakeScene) {
        try { bakeScene.remove(rec.group); } catch (e2) { /* ignore */ }
      }
      if (rec && art.releaseShark) {
        // Lane A's own disposal path, if/when it lands (engine3d.js already
        // calls it guarded the same way).
        try { art.releaseShark(rec.group); } catch (e3) { /* ignore */ }
      } else if (rec && rec.group && rec.group.traverse) {
        // No releaseShark yet: dispose geometries/materials ourselves so 61
        // one-off bakes across a session cannot leak GPU buffers. Read-only
        // traversal of a group we own outright (built and removed by us);
        // never touches a live/rendered shark rig.
        try {
          rec.group.traverse(function (node) {
            if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
            var mats = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
            for (var mi = 0; mi < mats.length; mi++) {
              if (mats[mi] && typeof mats[mi].dispose === 'function') mats[mi].dispose();
            }
          });
        } catch (e4) { /* best-effort cleanup only */ }
      }
    }
    return true;
  }

  // Queue-drain: baked lazily, one per idle tick, so a 61-shark roster never
  // does 61 renders in one frame (the exact shape of the prior iOS crash).
  // Visible-card ids (queued by buildCard as they paint) are processed
  // before any background top-up.
  function drainBakeQueue() {
    S.bakeTimer = null;
    if (S.bakeDisabled) return;
    var id = S.bakeQueue.shift();
    if (id === undefined) return;
    delete S.bakeQueued[id];
    bakeThumb(id);
    if (S.bakeQueue.length) S.bakeTimer = idleSchedule(drainBakeQueue);
  }

  function queueBake(id) {
    if (S.bakeDisabled || !id || S.thumbs[tk(id)] || S.bakeQueued[id]) return;
    S.bakeQueued[id] = true;
    S.bakeQueue.push(id);
    if (!S.bakeTimer) S.bakeTimer = idleSchedule(drainBakeQueue);
  }

  // ---------------------------------------------------------------- MENU
  // Rev 17 Step 0: CC-BY 4.0 model credits, live obligation per LICENSES.md.
  // Names/authors/links kept in sync with that file by hand (no build step
  // reads it at runtime) -- update both if a CC-BY source is added/removed.
  var CREDITS_CC_BY = [
    { model: 'White Pointer', author: '3dartstevenz', url: 'https://sketchfab.com/3d-models/white-pointer-8e429052939a4677861d0d550a0e27cd' },
    { model: 'Tiger Shark', author: 'intervirtual', url: 'https://sketchfab.com/3d-models/tiger-shark-8a19770317984b4a9628934acd587a67' },
    { model: 'Great White Shark 3D Model', author: 'canyutsai1', url: 'https://sketchfab.com/3d-models/great-white-shark-3d-model-7a3f7e70f7054018919ad930ca586c62' },
    { model: 'Megalodon Rex (WIP#3) Animating', author: 'geneugene', url: 'https://sketchfab.com/3d-models/megalodon-rex-wip3-animating-495d71bf2fbc4de0a5e3e25823589f11' },
    { model: 'Shortfin mako shark', author: 'faerbogdan99', url: 'https://sketchfab.com/3d-models/shortfin-mako-shark-0ec4d184c6ea4a6a8704f56cc2ba6e78' },
    { model: 'Tiger Shark (Galeocerdo Cuvier)', author: 'fdehell', url: 'https://sketchfab.com/3d-models/tiger-shark-galeocerdo-cuvier-b74e252a508d406490ecef3bde602e2f' },
    { model: 'Pelagic Thresher Shark', author: 'charliegodofsharks', url: 'https://sketchfab.com/3d-models/pelagic-thresher-shark-b193a4cd16024e8d9efb19314129bf33' },
    { model: 'Shark', author: 'Poly by Google', url: 'https://poly.pizza/m/1mVWW4RFVHc' },
    { model: 'Tibu (hammer_chibi)', author: 'marioba', url: 'https://poly.pizza/m/TEUntUD1wl' }
  ];

  function buildCredits() {
    var list = N('rfCreditsList');
    if (!list) return;
    clear(list);
    var intro = mk('p', null, 'Model sources under CC-BY 4.0 (attribution required). Full list in LICENSES.md.');
    if (intro) { intro.style.margin = '0 0 12px'; intro.style.opacity = '0.85'; list.appendChild(intro); }
    for (var i = 0; i < CREDITS_CC_BY.length; i++) {
      var c = CREDITS_CC_BY[i];
      var row = mk('div', null);
      if (!row) continue;
      row.style.marginBottom = '10px';
      var line = mk('div', null, '"' + c.model + '" by ' + c.author);
      if (line) row.appendChild(line);
      var sub = mk('div', null);
      if (sub) {
        sub.style.fontSize = '12px';
        sub.style.opacity = '0.75';
        var link = document.createElement('a');
        link.href = c.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = c.url;
        link.style.color = '#8fd8ff';
        var lic = document.createTextNode('CC-BY 4.0 — ');
        sub.appendChild(lic);
        sub.appendChild(link);
        row.appendChild(sub);
      }
      list.appendChild(row);
    }
  }

  function showCredits() {
    buildCredits();
    var o = N('rfCreditsOverlay');
    if (o) { o.style.display = 'flex'; }
  }

  function hideCredits() {
    var o = N('rfCreditsOverlay');
    if (o) o.style.display = 'none';
  }

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
        var relicDots = buildRelicDots(tier);
        if (relicDots) head.appendChild(relicDots);
        if (!open) head.appendChild(mk('span', 'rf-tier-lock', 'Reach level ' + need));
        sec.appendChild(head);
      }

      // Rev 12 (12.2): "roster grouped by class within acts" -- a tier
      // (this ladder's existing grouping) sits inside one act, so sort each
      // tier's rows by class rank before rendering; a shark with no
      // recognised class sorts last rather than breaking the group.
      var tierRows = byTier[tier].slice();
      tierRows.sort(function (a, b) {
        return (CLASS_RANK[a.cls] != null ? CLASS_RANK[a.cls] : 99)
          - (CLASS_RANK[b.cls] != null ? CLASS_RANK[b.cls] : 99);
      });

      var grid = mk('div', 'rf-grid');
      for (var j = 0; j < tierRows.length; j++) {
        var card = buildCard(tierRows[j], open, sel);
        if (card && grid) grid.appendChild(card);
      }
      if (grid) sec.appendChild(grid);
      root.appendChild(sec);
    }

    paintMenuHeader(p);
    paintMenuSelection(sel);
  }

  // Task 1: "per-zone relic progress, e.g. 3 dots per zone" shown on the
  // roster ladder. data.js ZONES carry an intendedTier (the shark tier a
  // zone is balanced around, per SPEC3D 7.2); that is the natural tier ->
  // zone mapping, so a tier's relic dots show the zone whose intendedTier
  // matches (nearest-below if no exact match, since 4 zones cover many more
  // than 4 tiers). Falls back to null (no dots) if ZONES is unavailable,
  // rather than guessing a wrong zone id.
  function zonesList() {
    var d = RFD();
    return (d && Array.isArray(d.ZONES)) ? d.ZONES : [];
  }

  function zoneIdForTier(tier) {
    var zones = zonesList();
    if (!zones.length) return null;
    var best = null;
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (typeof z.intendedTier !== 'number') continue;
      if (z.intendedTier <= tier && (best === null || z.intendedTier > best.intendedTier)) best = z;
    }
    if (!best) best = zones[0];
    return best.id != null ? best.id : null;
  }

  function buildRelicDots(tier) {
    var zoneId = zoneIdForTier(tier);
    if (zoneId == null) return null;
    var rp = relicProgress(zoneId);
    if (!rp) return null; // no relic data for this zone yet: stay silent
    var wrap = mk('span', 'rf-relic-dots');
    if (!wrap) return null;
    var cap = rp.total || zoneRelicCap();
    for (var i = 0; i < cap; i++) {
      wrap.appendChild(mk('i', 'rf-relic-dot' + (i < rp.have ? ' rf-relic-on' : '')));
    }
    return wrap;
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
    // art MAJOR 1: queue a lazy bake for this card's shark if no thumbnail
    // exists yet. Cards painting here are exactly "visible" (the roster
    // grid is not virtualized), so this is the visible-card bake trigger;
    // queueBake is a no-op once cached, disabled, or already queued.
    queueBake(def.id);

    var nameRow = mk('span', 'rf-card-name', def.name);
    if (nameRow) {
      var cardBadge = classBadge(def);
      if (cardBadge) nameRow.appendChild(cardBadge);
      card.appendChild(nameRow);
    }

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

  // Known bug fix: re-apply rf-card-sel + the Owned/Selected footer badge
  // on any already-rendered roster cards without a full buildMenu() rebuild.
  // Cheap (class + one text node per card, no re-creation) and idempotent,
  // so calling it opportunistically from doSelect costs nothing when the
  // Menu roster has not been built yet (root is null/empty -> no-op loop).
  function resyncMenuSelectionBadges(selId) {
    var root = N('rfMenuRoster');
    if (!root || !root.querySelectorAll) return;
    var cards = root.querySelectorAll('.rf-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var cardId = card.getAttribute ? card.getAttribute('data-shark') : null;
      if (!cardId) continue;
      var isSel = cardId === selId;
      toggleClass(card, 'rf-card-sel', isSel);
      var foot = card.querySelector ? card.querySelector('.rf-card-own') : null;
      if (foot) setText(foot, isSel ? 'Selected' : 'Owned');
    }
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

  // Fix-round 3 HUD ONLY-LAW: DEV is a menu-only chip now (never in-run).
  // Dev state itself is unchanged (RF.DevMode owns it); this just mirrors
  // .active onto the chip every time the menu repaints.
  function paintMenuDevChip() {
    var d = Dev();
    toggleClass(N('rfDevChip'), 'rf-on', !!(d && d.active));
  }

  // Mission strip: built once directly under .rf-bar-top, task 1. Renders up
  // to 3 active missions with a progress bar; empty/absent missions collapse
  // the strip (:empty rule in REV7_STYLE_TEXT) so an old save with no
  // missions field shows nothing extra, never a broken row.
  // Existence check is a live tree query (querySelector), not
  // getElementById: this file's own selftest DOM stub auto-vivifies an
  // empty node on the FIRST getElementById lookup for any id (to satisfy
  // the fixed NODE_IDS contract), which would mask this node's very first
  // creation. querySelector (implemented as a real subtree walk in that
  // same stub) has no such auto-vivify behavior and matches real-DOM
  // getElementById semantics (null when nothing has been inserted yet).
  function ensureMissionStrip() {
    var menu = N('rfMenu');
    if (!menu) return null;
    var existing = menu.querySelector ? menu.querySelector('#rfMissionStrip') : null;
    if (existing) return existing;
    // Anchor: inserted as the element right after .rf-bar-top so it always
    // reads "Menu -> goals -> roster -> DIVE" top to bottom.
    var topBar = menu.children && menu.children.length ? menu.children[0] : null;
    var strip = mk('div', '');
    if (!strip) return null;
    strip.id = 'rfMissionStrip';
    if (topBar && topBar.parentNode === menu && topBar.nextSibling) {
      menu.insertBefore(strip, topBar.nextSibling);
    } else if (topBar) {
      menu.insertBefore(strip, topBar.nextSibling || null);
    } else {
      menu.insertBefore(strip, menu.firstChild);
    }
    return strip;
  }

  function paintMissionStrip() {
    var strip = ensureMissionStrip();
    if (!strip) return;
    clear(strip);
    var missions = activeMissionDefs();
    for (var i = 0; i < missions.length && i < 3; i++) {
      var mNode = buildMissionChip(missions[i]);
      if (mNode) strip.appendChild(mNode);
    }
  }

  function buildMissionChip(m) {
    var card = mk('div', 'rf-mission' + (m.done ? ' rf-mission-done' : ''));
    if (!card) return null;
    var label = m.label + (m.done ? ' (done)' : (' ' + fmt(m.progress) + '/' + fmt(m.goal)));
    card.appendChild(mk('span', 'rf-mission-l', label));
    var track = mk('span', 'rf-mission-bar');
    if (track) {
      var fill = mk('i', '');
      if (fill) {
        fill.style.width = m.done ? '100%' : pct(m.progress, m.goal);
        track.appendChild(fill);
      }
      card.appendChild(track);
    }
    return card;
  }

  // Gem balance stat, built once and inserted right after the coins stat in
  // the menu header bar. Built dynamically (index.html is orchestrator-
  // owned) rather than assumed to exist in markup.
  function ensureMenuGemStat() {
    var coinsB = N('rfMenuCoins');
    var coinsStat = coinsB && coinsB.parentNode;
    if (!coinsStat || !coinsStat.parentNode) return null;
    var existing = coinsStat.parentNode.querySelector
      ? coinsStat.parentNode.querySelector('#rfMenuGemStat') : null;
    if (existing) return existing;
    var wrap = mk('div', 'rf-stat rf-gem');
    if (!wrap) return null;
    wrap.id = 'rfMenuGemStat';
    var b = mk('b', '', '0');
    b.id = 'rfMenuGems';
    wrap.appendChild(b);
    wrap.appendChild(mk('span', '', 'GEMS'));
    coinsStat.parentNode.insertBefore(wrap, coinsStat.nextSibling);
    return wrap;
  }

  function paintMenuHeader(p) {
    setText(N('rfMenuCoins'), fmt(coins()));
    var gemStat = ensureMenuGemStat();
    var gemNode = gemStat && gemStat.querySelector ? gemStat.querySelector('#rfMenuGems') : null;
    setText(gemNode, fmt(gems()));
    var lvl = p ? (p.level | 0) : 1;
    setText(N('rfMenuLevel'), 'Level ' + lvl);
    paintMenuDevChip();
    paintMissionStrip();

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
    // Derived dynamically from the roster so new acts (Pantheon, Underworld,
    // ...) render without touching this function again.
    var actSet = {}, acts = [];
    for (var li = 0; li < list.length; li++) {
      var la = list[li].act;
      if (!actSet[la]) { actSet[la] = true; acts.push(la); }
    }
    acts.sort(function (x, y) { return x - y; });
    for (var a = 0; a < acts.length; a++) {
      var act = acts[a];
      var rows = list.filter(function (s) { return s.act === act; });
      if (!rows.length) continue;
      // Rev 12 (12.2): group by class within the act, tier/cost as before
      // inside a class.
      rows.sort(function (x, y) {
        var cr = (CLASS_RANK[x.cls] != null ? CLASS_RANK[x.cls] : 99)
          - (CLASS_RANK[y.cls] != null ? CLASS_RANK[y.cls] : 99);
        return cr || (x.tier - y.tier) || (x.cost - y.cost);
      });

      var sec = mk('section', 'rf-shop-act');
      if (!sec) continue;
      sec.appendChild(mk('h2', 'rf-shop-act-h', ACT_NAMES[act] || ('Act ' + act)));
      for (var i = 0; i < rows.length; i++) {
        var r = buildShopRow(rows[i]);
        if (r) sec.appendChild(r);
      }
      root.appendChild(sec);
    }

    var collectSec = buildCollectionSection();
    if (collectSec) root.appendChild(collectSec);

    setText(N('rfShopCoins'), fmt(coins()));
    ensureShopGemStat();
    buildUpgradePanel();
  }

  // Shop gem stat, mirrors ensureMenuGemStat but anchored beside the Shop's
  // own coin stat.
  function ensureShopGemStat() {
    var coinsB = N('rfShopCoins');
    var coinsStat = coinsB && coinsB.parentNode;
    if (!coinsStat || !coinsStat.parentNode) return null;
    var host = coinsStat.parentNode;
    var existing = host.querySelector ? host.querySelector('#rfShopGemStat') : null;
    if (!existing) {
      var wrap = mk('div', 'rf-stat rf-gem');
      if (!wrap) return null;
      wrap.id = 'rfShopGemStat';
      var b = mk('b', '', '0');
      b.id = 'rfShopGems';
      wrap.appendChild(b);
      wrap.appendChild(mk('span', '', 'GEMS'));
      host.insertBefore(wrap, coinsStat.nextSibling);
      existing = wrap;
    }
    var gemNode = existing.querySelector ? existing.querySelector('#rfShopGems') : null;
    setText(gemNode, fmt(gems()));
    return existing;
  }

  // Task 4: Collection/Skins section -- owned/lockable skins with gem
  // costs, secret sharks shown as silhouettes with an unlock hint. Defensive:
  // if RFD.SKINS/SECRET_SHARKS are both empty/absent (an older data.js
  // build), the section itself is simply not appended.
  function buildCollectionSection() {
    var skins = collectionSkins();
    var secrets = secretSharkRows();
    if (!skins.length && !secrets.length) return null;
    var sec = mk('section', 'rf-shop-act');
    if (!sec) return null;
    sec.appendChild(mk('h2', 'rf-shop-act-h rf-collection-h', 'Collection'));
    var grid = mk('div', 'rf-collect-grid');
    if (grid) {
      for (var i = 0; i < skins.length; i++) {
        var card = buildSkinCard(skins[i]);
        if (card) grid.appendChild(card);
      }
      for (var j = 0; j < secrets.length; j++) {
        var sCard = buildSecretSharkCard(secrets[j]);
        if (sCard) grid.appendChild(sCard);
      }
      sec.appendChild(grid);
    }
    return sec;
  }

  function buildSkinCard(skin) {
    var id = skin && skin.id;
    if (!id) return null;
    var have = skinOwned(id);
    var cls = 'rf-collect-card' + (have ? ' rf-collect-owned' : '');
    var card = mk('button', cls);
    if (!card) return null;
    card.type = 'button';

    var swatch = mk('span', 'rf-collect-swatch');
    if (swatch) {
      var pal = (skin.palette && typeof skin.palette.base === 'number') ? hex(skin.palette.base) : '#4a8fb0';
      swatch.style.background = pal;
      card.appendChild(swatch);
    }
    card.appendChild(mk('span', '', skin.name || id));

    if (have) {
      // B8 fix: owned skins become selectable via Meta.selectSkin, reflecting
      // profile.skins.selectedSkin. The card itself stays enabled (not
      // disabled) so the Select/Selected control below is clickable; card
      // click no-ops (selection happens via the explicit button) so the
      // whole card doesn't act as a toggle by accident.
      var p = profile();
      var isSelected = !!(p && p.skins && p.skins.selectedSkin === id);
      card.appendChild(mk('span', 'rf-collect-cost', 'OWNED'));
      var selBtn = mk('span', 'rf-collect-select' + (isSelected ? ' rf-collect-selected' : ''),
        isSelected ? 'Selected' : 'Select');
      if (selBtn) card.appendChild(selBtn);
      if (isSelected) {
        card.classList.add('rf-collect-selected-card');
      } else {
        card.addEventListener('click', function () { doSelectSkin(id); });
      }
    } else {
      var cost = (typeof skin.cost === 'number') ? skin.cost : 0;
      // A shark-locked skin (skin.sharkId set) also requires that shark be
      // owned first (meta.js buySkin's 'shark-not-owned' reason); shown as
      // a disabled hint rather than a silent failed click.
      if (skin.sharkId && !owned(skin.sharkId)) {
        var lockDef = sharkById(skin.sharkId);
        card.appendChild(mk('span', 'rf-collect-hint',
          'Own ' + (lockDef ? lockDef.name : skin.sharkId) + ' first'));
        card.disabled = true;
      } else {
        card.appendChild(mk('span', 'rf-collect-cost', GEM_ICON + ' ' + fmt(cost)));
        card.addEventListener('click', function () { doBuySkin(id); });
      }
    }
    return card;
  }

  // Secret sharks (task 4): silhouette card with an unlock hint, e.g.
  // "Find all Reef relics" -- built from relicSets (how many full zone
  // relic sets are needed) so the hint text is data-driven, not hardcoded
  // to a specific zone name.
  function buildSecretSharkCard(row) {
    var sharkId = row && row.sharkId;
    if (!sharkId) return null;
    var have = owned(sharkId);
    var cls = 'rf-collect-card' + (have ? ' rf-collect-owned' : '');
    var card = mk('button', cls);
    if (!card) return null;
    card.type = 'button';

    var swatch = mk('span', 'rf-collect-swatch' + (have ? '' : ' rf-collect-silhouette'));
    if (swatch) {
      if (have) {
        var def = sharkById(sharkId);
        var pal = paletteOf(def);
        swatch.style.background = hex(pal.base);
      }
      card.appendChild(swatch);
    }

    var def2 = sharkById(sharkId);
    card.appendChild(mk('span', '', have ? (def2 ? def2.name : sharkId) : '???'));

    if (have) {
      card.appendChild(mk('span', 'rf-collect-cost', 'OWNED'));
      card.disabled = true;
    } else {
      var sets = (typeof row.relicSets === 'number') ? row.relicSets : 1;
      var haveSets = 0;
      var zones = zonesList();
      for (var i = 0; i < zones.length; i++) {
        var rp = relicProgress(zones[i].id);
        if (rp && rp.have >= rp.total && rp.total > 0) haveSets++;
      }
      var hint = 'Find ' + sets + ' full relic set' + (sets === 1 ? '' : 's');
      card.appendChild(mk('span', 'rf-collect-hint', hint + ' (' + haveSets + '/' + sets + ')'));
      // B3 fix: the gems-only unlock path (meta.js unlockSecretSharkWithGems)
      // is independent of relic-set progress -- either path can unlock the
      // shark per SPEC.md. Show the gem purchase button whenever the API
      // exists and the shark is still locked; keep the relic hint text above
      // regardless. Meta remains the final affordability/idempotency check
      // (spendGems inside unlockSecretSharkWithGems).
      var m = Meta();
      if (m && typeof m.unlockSecretSharkWithGems === 'function') {
        var cost = (typeof row.gemCost === 'number') ? row.gemCost : 0;
        card.appendChild(mk('span', 'rf-collect-cost', GEM_ICON + ' ' + fmt(cost)));
        card.addEventListener('click', function () { doUnlockSecretShark(sharkId); });
      } else {
        card.disabled = true;
      }
    }
    return card;
  }

  function doBuySkin(id) {
    var m = Meta(), p = profile();
    if (!m || !p || typeof m.buySkin !== 'function') { toast('Collection is not available yet'); return; }
    var kit = S.ctx ? S.ctx.kit : null;
    var r = null;
    try { r = m.buySkin(kit, p, id); } catch (e) { r = null; }
    if (r && r.ok) {
      var skin = null, list = collectionSkins();
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) { skin = list[i]; break; }
      toast('Unlocked ' + (skin ? skin.name : id));
      buildShop();
      return;
    }
    var reason = r && r.reason;
    toast(reason === 'gems' ? 'Not enough gems'
      : reason === 'shark-not-owned' ? 'Own that shark first'
      : reason === 'owned' ? 'Already owned'
      : 'That purchase is not available');
  }

  function doSelectSkin(id) {
    var m = Meta(), p = profile();
    if (!m || !p || typeof m.selectSkin !== 'function') { toast('Collection is not available yet'); return; }
    var kit = S.ctx ? S.ctx.kit : null;
    var r = null;
    try { r = m.selectSkin(kit, p, id); } catch (e) { r = null; }
    if (r && r.ok) {
      // Refresh card states (Selected toggle, prior selection's Select
      // button) after the action, per task requirement.
      buildShop();
      return;
    }
    toast('Could not select that skin');
  }

  function doUnlockSecretShark(sharkId) {
    var m = Meta(), p = profile();
    if (!m || !p || typeof m.unlockSecretSharkWithGems !== 'function') {
      toast('Collection is not available yet');
      return;
    }
    var kit = S.ctx ? S.ctx.kit : null;
    var r = null;
    try { r = m.unlockSecretSharkWithGems(kit, p, sharkId); } catch (e) { r = null; }
    if (r && r.ok) {
      var def = sharkById(sharkId);
      toast('Unlocked ' + (def ? def.name : sharkId));
      buildShop();
      return;
    }
    var reason = r && r.reason;
    toast(reason === 'gems' ? 'Not enough gems' : 'That purchase is not available');
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
      var rowName = mk('div', 'rf-row-name', def.name);
      if (rowName) {
        var rowBadge = classBadge(def);
        if (rowBadge) rowName.appendChild(rowBadge);
        mid.appendChild(rowName);
      }

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
      // Known bug (ported fix from the pre-3D UI's "Menu ON-badge resync"):
      // a SELECT here (including the desktop path where a focused SELECT
      // button fires this same click handler on an Enter keypress, per
      // native <button> behavior -- no separate keydown listener needed)
      // changes the active shark, but showMenu()/buildMenu() only runs when
      // the player actually navigates back to the Menu screen. If the Menu
      // DOM is ever left mounted underneath the Shop (current index.html
      // uses exclusive .rf-on screens, but this repaint is cheap and inert
      // either way), its roster cards would keep showing the OLD card as
      // "Selected"/rf-card-sel until the next full buildMenu(). Repainting
      // the header + selection here (not the whole roster, to stay cheap)
      // keeps S.menuPick's OWN screen state honest immediately rather than
      // relying on a future showMenu() call to notice the drift.
      if (N('rfMenu')) paintMenuSelection(id);
      resyncMenuSelectionBadges(id);
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
  function toast(msg, cue) {
    var n = N('rfShopToast');
    if (!n) return;
    if (cue !== undefined) setFrenzyCue(cue);
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
      // SPEC3D 7.6: endRun payload adds gems (optional; a pre-Rev7 payload or
      // a zero-gem run simply omits the row rather than showing "0").
      var gemsEarned = (typeof d.gems === 'number' && isFinite(d.gems)) ? d.gems : 0;
      if (gemsEarned > 0) {
        rows.appendChild(resRow('Gems earned', GEM_ICON + ' ' + fmt(gemsEarned), 'rf-res-gems'));
      }
      rows.appendChild(resRow('Biggest prey', 'Tier ' + ((d.biggestTier | 0) || 0)));
      rows.appendChild(resRow('Best combo', 'x' + ((d.bestCombo | 0) || 0)));
      rows.appendChild(resRow('XP gained', fmt(d.xp)));
    }

    buildMissionResults(d.missionResults);
    buildRelicFinds(d.relicFinds, d.relicUnlocks);

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
      // SPEC3D 7.6: full zone relic set => unlock skin/bonus shark. meta.js
      // endRun's relicSetUnlocks() returns [{type:'relicSet', zoneId}] for a
      // newly-completed zone and [{type:'sharkUnlock', sharkId, via}] for a
      // secret shark that just crossed its relicSets threshold -- rendered
      // as unlock callouts alongside the existing tier-unlock rows.
      var relicUnlocks = Array.isArray(d.relicUnlocks) ? d.relicUnlocks : [];
      for (var ci = 0; ci < relicUnlocks.length && ci < 3; ci++) {
        var c = relicUnlocks[ci];
        if (!c) continue;
        if (c.type === 'relicSet') {
          un.appendChild(mk('div', 'rf-res-callout', 'Relic set complete: Zone ' + c.zoneId));
        } else if (c.type === 'sharkUnlock') {
          var def = sharkById(c.sharkId);
          un.appendChild(mk('div', 'rf-res-callout',
            'Secret shark unlocked: ' + (def ? def.name : c.sharkId)));
        }
      }
    }
  }

  // Mission results (task 3): endRun's ctx.run.missionResults (meta.js
  // missionEvent, line ~689) is a completion log -- {id, name, gems}, pushed
  // ONLY when a mission finishes this run, so every entry here IS "done"
  // (there is no partial/in-progress entry in this array by construction;
  // in-progress missions live on the Menu's mission strip instead, per
  // task 1). Reads m.progress/m.goal defensively in case a future build
  // adds a partial-result shape, but falls back to the DONE tag either way.
  function buildMissionResults(missionResults) {
    var root = N('rfResRows');
    if (!root) return;
    var list = Array.isArray(missionResults) ? missionResults : [];
    for (var i = 0; i < list.length && i < 3; i++) {
      var m = list[i] || {};
      var hasProgress = typeof m.progress === 'number' && typeof m.goal === 'number' && m.goal > 0;
      var done = hasProgress ? (m.progress >= m.goal) : !(m.done === false);
      var label = m.name || m.label || m.id || 'Mission';
      var row = mk('div', 'rf-res-mission' + (done ? ' rf-res-mission-done' : ''));
      if (!row) continue;
      row.appendChild(mk('span', '', label));
      row.appendChild(mk('span', 'rf-res-mission-tag',
        done ? 'DONE' : (fmt(m.progress) + '/' + fmt(m.goal))));
      root.appendChild(row);
    }
  }

  // Relic finds (task 3): endRun's relicFinds passes ctx.run.relics through
  // verbatim -- entries are {relicId, zoneId} (engine/world push these as
  // the player collects them mid-run). Resolved to a human name via
  // RFD.RELICS_BY_ZONE/RFD.RELICS; falls back to the raw relicId if the
  // table lookup misses (never drops the row, since a find still happened).
  function buildRelicFinds(relicFinds) {
    var root = N('rfResRows');
    if (!root) return;
    var list = Array.isArray(relicFinds) ? relicFinds : [];
    for (var i = 0; i < list.length && i < 5; i++) {
      var r = list[i];
      if (!r) continue;
      var name = (r.relicId != null && r.zoneId != null) ? relicName(r.zoneId, r.relicId) : null;
      var label = name || r.name || r.label || r.relicId || 'Relic';
      var row = mk('div', 'rf-res-relic', 'Relic found: ' + label);
      if (row) root.appendChild(row);
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
  // powerCharges/px/py are Rev 6 additions the engine may not have landed yet
  // (Lane E/W are mid-edit); every read below falls back safely when the
  // field is absent so this lane works standalone.
  // 6.11 + code review MAJOR 5: name/coins are OUT of the in-run HUD (menu/
  // results only); score is now a required in-run field. hungerFrac is the
  // engine's preferred field name for the HUD bar (SCREEN BALANCE LAW
  // amendment: hp/HUNGER); hpFrac/hp/maxHp are kept as the fallback chain
  // for an engine that has not landed hungerFrac yet.
  // Fix-round 3 HUD ONLY-LAW: 'dev' is still read off the engine's push (dev
  // state itself is unchanged) but it no longer drives an in-run element --
  // see devRunStartToast() below. 'buffTimers' is intentionally no longer a
  // tracked field; the persistent buff-bar row is retired in favor of the
  // power-button pips + a toast on pickup/expiry.
  var HUD_FIELDS = ['hp', 'maxHp', 'hpFrac', 'hungerFrac', 'boost', 'power', 'powerId',
                    'powerName', 'powerReady', 'dev', 'powerCharges',
                    'score', 'px', 'py', 'mode', 'goldMeter'];
  // buffTimers is a plain array of {frac} (or numbers 0..1) and is read
  // straight off the incoming object every push (not diffed with the rest)
  // since a buff bar is cheap to repaint and the shape may vary.
  var HUD_BUFFER_A = {};
  var HUD_BUFFER_B = {};
  var HUD_EMPTY = {};
  var hudWriteBuffer = HUD_BUFFER_A;

  function hudState(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var prev = S.lastHud;
    var next = hudWriteBuffer;
    var i, k, changed = false;

    for (i = 0; i < HUD_FIELDS.length; i++) {
      k = HUD_FIELDS[i];
      next[k] = Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : (prev ? prev[k] : undefined);
      if (next[k] !== (prev ? prev[k] : undefined)) changed = true;
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
      if (combo > 0 && combo !== (prev ? prev.combo | 0 : 0)) {
        var mult = (typeof obj.comboMult === 'number' && obj.comboMult > 1)
          ? (' x' + Math.floor(obj.comboMult)) : '';
        chip('x' + combo + mult);
      }
    }
    if (next.combo === undefined) next.combo = prev ? prev.combo | 0 : 0;
    // 6.11 + code review MAJOR 5: combo is also a REQUIRED persistent HUD
    // readout (not only a transient chip). The chip above stays the ONE
    // celebratory pop on a combo increase; #rfHudCombo is the quiet always-
    // -current number next to score, so a combo climb never disappears the
    // moment the chip fades.
    if (next.combo !== (prev ? (prev.combo | 0) : 0)) changed = true;
    paintPowerBuffs(obj.buffTimers);
    try { updateMinimap(next.px, next.py); } catch (e) { /* minimap is optional chrome */ }

    S.lastHud = next;
    hudWriteBuffer = next === HUD_BUFFER_A ? HUD_BUFFER_B : HUD_BUFFER_A;
    if (!changed) return false;
    paintHud(next, prev);
    return true;
  }

  function paintHud(n, prev) {
    prev = prev || HUD_EMPTY;

    // 6.11 + code review MAJOR 5: the persistent bar is HUNGER (drains as
    // the shark starves), not a generic health bar. hungerFrac is the
    // engine's preferred field; hpFrac/hp/maxHp remain the fallback chain
    // for an engine build that has not landed hungerFrac yet, so this lane
    // still paints correctly standalone. The bar's own low-state colour and
    // the underlying rf-low class are unchanged (visual grammar law: red is
    // reserved for the player being hurt / critical, whichever field drives
    // it).
    if (n.hp !== prev.hp || n.maxHp !== prev.maxHp || n.hpFrac !== prev.hpFrac
        || n.hungerFrac !== prev.hungerFrac) {
      var hp = N('rfHudHp');
      if (hp) {
        var frac = (typeof n.hungerFrac === 'number' && isFinite(n.hungerFrac))
          ? Math.max(0, Math.min(1, n.hungerFrac))
          : (typeof n.hpFrac === 'number' && isFinite(n.hpFrac))
          ? Math.max(0, Math.min(1, n.hpFrac))
          : (n.maxHp > 0 ? (n.hp / n.maxHp) : 1);
        hp.style.width = pct(frac, 1);
        toggleClass(hp, 'rf-low', frac < 0.3);
      }
    }

    if (n.boost !== prev.boost) {
      var b = N('rfHudBoost');
      if (b) b.style.width = pct(n.boost, 1);
    }

    // Score is persistent (unlike the combo chip, which stays a transient
    // toast): required in-run HUD element per 6.11. Falls back to '0' if the
    // engine has not landed score yet.
    if (n.score !== prev.score) {
      setText(N('rfHudScore'), fmt((typeof n.score === 'number' && isFinite(n.score)) ? Math.floor(n.score) : 0));
    }

    if (n.combo !== prev.combo) {
      var comboN = n.combo | 0;
      setText(N('rfHudCombo'), comboN > 0 ? ('x' + comboN) : '');
    }

    if (n.power !== prev.power || n.powerId !== prev.powerId ||
        n.powerName !== prev.powerName || n.powerReady !== prev.powerReady ||
        n.powerCharges !== prev.powerCharges) {
      var btn = N('rfPower');
      var f = N('rfPowerFill');
      // powerId is an RFD.ABILITIES key; powerName is accepted as a courtesy
      // so a caller that already resolved the label still works.
      var label = n.powerName || abilityName(n.powerId) || (n.powerId ? String(n.powerId) : '');
      var has = !!label;
      // Charge-gated abilities (powerCharges present) disable the button at
      // 0 charges even while otherwise "ready"; abilities without a charge
      // economy (powerCharges absent) keep the original ready/ hide logic.
      var noCharges = typeof n.powerCharges === 'number' && isFinite(n.powerCharges) && n.powerCharges <= 0;
      if (btn) {
        toggleClass(btn, 'rf-hide', !has);
        toggleClass(btn, 'rf-ready', !!n.powerReady && !noCharges);
        btn.disabled = !has || noCharges;
      }
      if (has) setText(N('rfPowerLabel'), label);
      if (f) f.style.height = pct(n.power, 1);
      paintPowerPips(n.powerCharges);
    }

    if (n.mode !== prev.mode || n.goldMeter !== prev.goldMeter) {
      paintGoldRush(n.mode, n.goldMeter);
    }

    // Fix-round 3 HUD ONLY-LAW: 'dev' is no longer painted into any in-run
    // element. It is still tracked in the diff buffer (S.lastHud.dev) so
    // devRunStartToast() can read the very first push of a run without a
    // second engine API, but there is intentionally no DOM write here.
  }

  // ------------------------------------------------------- GOLD RUSH HUD
  // Rev 12 (12.4): a visible MODE with a gold meter bar + banner, driven by
  // hudState fields the engine publishes (h.mode: 'goldrush'|'mega'|null,
  // h.goldMeter: 0..1). Defensive against an engine build that has not
  // landed those fields yet -- both are simply absent from HUD_FIELDS diffs
  // until pushed, and this whole block no-ops (stays hidden) if #rfHud is
  // unavailable. HUD ONLY-LAW: corners only, one small bar + one banner
  // line, no new persistent chrome beyond that.
  var goldRushNode = null;
  function ensureGoldRushNode() {
    var hud = N('rfHud');
    if (!hud) return null;
    if (goldRushNode && goldRushNode.parentNode === hud) return goldRushNode;
    var wrap = mk('div', '');
    if (!wrap) return null;
    wrap.id = 'rfGoldRush';
    var bar = mk('div', 'rf-meter');
    bar.id = 'rfGoldRushBar';
    var fill = mk('i', '');
    fill.id = 'rfGoldRushFill';
    bar.appendChild(fill);
    wrap.appendChild(bar);
    var banner = mk('div', '');
    banner.id = 'rfGoldRushBanner';
    wrap.appendChild(banner);
    hud.appendChild(wrap);
    goldRushNode = wrap;
    return wrap;
  }

  var GOLD_MODE_LABEL = {
    goldrush: 'GOLD RUSH!', goldRush: 'GOLD RUSH!',
    mega: 'MEGA GOLD RUSH!', megaGoldRush: 'MEGA GOLD RUSH!', megagoldrush: 'MEGA GOLD RUSH!'
  };

  function paintGoldRush(mode, meter) {
    var wrap = ensureGoldRushNode();
    if (!wrap) return;
    var frac = (typeof meter === 'number' && isFinite(meter)) ? Math.max(0, Math.min(1, meter)) : 0;
    var label = mode ? GOLD_MODE_LABEL[mode] : null;
    var active = !!label;
    toggleClass(wrap, 'rf-on', active || frac > 0);
    var fillNode = wrap.querySelector ? wrap.querySelector('#rfGoldRushFill') : null;
    if (fillNode) fillNode.style.width = pct(frac, 1);
    var bannerNode = wrap.querySelector ? wrap.querySelector('#rfGoldRushBanner') : null;
    if (bannerNode) {
      setText(bannerNode, label || '');
      toggleClass(bannerNode, 'rf-on', active);
      toggleClass(bannerNode, 'rf-gold-mega', mode === 'mega' || mode === 'megaGoldRush' || mode === 'megagoldrush');
    }
  }

  // 6.7 POWER button: charge pips (0-8). Rebuilds the small pip row only
  // when the charge count itself is new (paintHud's dirty-check already
  // gates the call), and disables the button at 0 charges so a 0-charge
  // press reads as inert rather than merely un-styled.
  var POWER_MAX_CHARGES = 8;
  var lastPipCount = -1;
  // Active-buff ticks inside the power cluster (6.12: buff feedback = power
  // button chrome + toast). Reads the engine's reused buffTimers array of
  // remaining fractions; absent/empty hides the row. Bounded to 4 bars.
  var POWER_BUFF_MAX = 4;
  function paintPowerBuffs(list) {
    var root = N('rfPowerBuffs');
    if (!root) return;
    var n = (list && typeof list.length === 'number') ? Math.min(POWER_BUFF_MAX, list.length) : 0;
    while (root.children.length < n) {
      var bar = mk('i', '');
      if (!bar) break;
      root.appendChild(bar);
    }
    for (var i = 0; i < root.children.length; i++) {
      var el = root.children[i];
      if (i < n) {
        var entry = list[i];
        var frac = typeof entry === 'number' ? entry : (entry && typeof entry.frac === 'number' ? entry.frac : 0);
        if (frac < 0) frac = 0; else if (frac > 1) frac = 1;
        el.style.display = 'block';
        el.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
        // Rev 12 (12.4): pickup icon glyph on the buff tick chip, IF the
        // engine publishes an id/buffId per entry -- the existing plain
        // number / {frac} shape (no id) still renders exactly as before.
        var buffId = entry && typeof entry === 'object' ? (entry.id || entry.buffId) : null;
        var glyph = buffId ? BUFF_ICON[buffId] : null;
        if (glyph) { el.textContent = glyph; el.setAttribute('data-buff', buffId); }
        else { el.textContent = ''; el.removeAttribute('data-buff'); }
      } else {
        el.style.display = 'none';
      }
    }
  }

  function paintPowerPips(charges) {
    var root = N('rfPowerPips');
    if (!root) return;
    var n = (typeof charges === 'number' && isFinite(charges)) ? Math.max(0, Math.min(POWER_MAX_CHARGES, Math.floor(charges))) : null;
    if (n === null) {
      // No charge economy reported (defensive fallback): hide the pip row
      // rather than guessing, per "consume defensively with fallbacks".
      toggleClass(root, 'rf-on', false);
      lastPipCount = -1;
      return;
    }
    toggleClass(root, 'rf-on', true);
    if (root.children.length !== POWER_MAX_CHARGES) {
      clear(root);
      for (var i = 0; i < POWER_MAX_CHARGES; i++) root.appendChild(mk('i', 'rf-power-pip'));
    }
    if (n === lastPipCount) return;
    lastPipCount = n;
    for (var j = 0; j < root.children.length; j++) {
      toggleClass(root.children[j], 'rf-power-pip-on', j < n);
    }
    var btn = N('rfPower');
    if (btn) toggleClass(btn, 'rf-power-empty', n <= 0);
  }

  // Fix-round 3 HUD ONLY-LAW: the persistent buff-bar row (#rfBuffTimers,
  // paintBuffTimers) is retired. Buff feedback is now ONLY the power-button
  // pips above (paintPowerPips, already wired to n.powerCharges) plus a
  // toast on buff pickup/expiry (queueToast(..., {holo:true}) at pickup,
  // engine/caller fires a plain queueToast at expiry). No replacement DOM
  // element is created; this is an intentional removal, not a stub.

  // -------------------------------------------------- ONE queued toast slot
  // SCREEN BALANCE LAW (6.9): every in-run transient (combo chips, frenzy
  // announcements, TOO BIG, pickup/tier-up callouts, etc) shares this single
  // corner-anchored #rfChip element; never more than one is visible at once.
  // Combo/engine-chip-queue calls keep the original instant replace-not-
  // -stacked semantics (a rapid combo climb must update the number right
  // away, per the existing selftest contract). Lower-frequency "popup" style
  // callouts (frenzy announcements, TOO BIG, pickup/tier-up) go through
  // queueToast, which adds a ~1.2s cooldown between shows so a burst of
  // popups queues one-at-a-time instead of visually stacking or flickering.
  var TOAST_COOLDOWN_MS = 1200;
  var TOAST_QUEUE_MAX = 4; // bounded; drop-oldest, never an unbounded stack
  var toastQueue = [];
  var toastCooldownUntil = 0;
  var toastCooldownTimer = null;

  // One chip at a time, <= 24px tall, <= 1.0s, replaced not stacked.
  // opts.missionTick applies the rf-chip-mission variant (task 2: chip
  // styling supports a mission-tick look, distinct from a plain toast/combo
  // pop) and is always cleared on the next chip so it never lingers.
  function chip(text, cue, opts) {
    var n = N('rfChip');
    if (!n) return;
    if (cue !== undefined) setFrenzyCue(cue);
    toggleClass(n, 'rf-chip-mission', !!(opts && opts.missionTick));
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

  function applyHoloFlicker(node) {
    if (!node) return;
    removeClass(node, 'rf-holo-flicker');
    // Force a reflow so the animation restarts on back-to-back holo toasts.
    if (typeof node.offsetWidth === 'number') { var _ = node.offsetWidth; }
    addClass(node, 'rf-holo-flicker');
  }

  function drainToastQueue() {
    toastCooldownTimer = null;
    var next = toastQueue.shift();
    if (next === undefined) return;
    chip(next.text, next.cue, { missionTick: next.missionTick });
    if (next.holo) applyHoloFlicker(N('rfChip'));
    toastCooldownUntil = Date.now() + TOAST_COOLDOWN_MS;
    if (toastQueue.length) toastCooldownTimer = setTimeout(drainToastQueue, TOAST_COOLDOWN_MS);
  }

  // Cooldown-gated popup: frenzy announcements, TOO BIG, pickup/tier-up
  // callouts. Distinct from chip() so the high-frequency combo path is never
  // subject to the 1.2s gap (a combo readout must always be current).
  // opts.holo applies the 6.9 hologram materialize scanline flicker
  // (pairs with RF.Fx.hologramFlash's additive sparkle burst). opts.
  // missionTick applies the mission-tick chip variant (task 2).
  function queueToast(text, cue, opts) {
    var holo = !!(opts && opts.holo);
    var missionTick = !!(opts && opts.missionTick);
    var now = Date.now();
    if (now >= toastCooldownUntil && !toastCooldownTimer) {
      chip(text, cue, { missionTick: missionTick });
      if (holo) applyHoloFlicker(N('rfChip'));
      toastCooldownUntil = now + TOAST_COOLDOWN_MS;
      return;
    }
    if (toastQueue.length >= TOAST_QUEUE_MAX) toastQueue.shift();
    toastQueue.push({ text: text, cue: cue, holo: holo, missionTick: missionTick });
    if (!toastCooldownTimer) {
      var wait = Math.max(0, toastCooldownUntil - now);
      toastCooldownTimer = setTimeout(drainToastQueue, wait);
    }
  }

  // Art review MAJOR (fix-round 3): a buff pickup's frenzyCue value ('buff'
  // or 'buff:<id>', per fx3d's cueName()) was silently dropped here --
  // normalizeFrenzyCue only recognizes the blood/school/golden family, so
  // RF.UI.frenzyCue('buff') returned false and neither a toast nor the
  // hologram materialize treatment ever fired for a buff pickup. Route that
  // case through the ONE queued toast slot with {holo:true} instead, which
  // pairs with fx3d's hologramFlash sparkle burst and applies the
  // rf-holo-flicker scanline/wipe CSS to #rfChip.
  function frenzyCue(cue) {
    if (cue === 'buff' || (typeof cue === 'string' && cue.indexOf('buff:') === 0)) {
      var buffId = cue.indexOf('buff:') === 0 ? cue.slice(5) : '';
      var label = (buffId && BUFF_LABEL[buffId]) || 'BUFF ACTIVE';
      var icon = buffId && BUFF_ICON[buffId];
      queueToast(icon ? (icon + ' ' + label) : label, null, { holo: true });
      return true;
    }
    var key = setFrenzyCue(cue);
    if (!key) return false;
    chip(FRENZY_LABEL[key]);
    return true;
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

    // Rev 12 (12.1): Menu -> DIVE now opens Level Select first (spec: "Menu
    // -> Level cards -> DIVE"); the level-select screen's own DIVE button
    // (diveIntoSelectedLevel) is what actually starts the run.
    n = N('rfDive');
    if (n) n.addEventListener('click', function () { showLevelSelect(); });

    n = N('rfMenuShop');
    if (n) n.addEventListener('click', function () { navShop(null); });

    n = N('rfShopBack');
    if (n) n.addEventListener('click', function () { showMenu(); });

    n = N('rfCreditsBtn');
    if (n) n.addEventListener('click', function () { showCredits(); });

    n = N('rfCreditsClose');
    if (n) n.addEventListener('click', function () { hideCredits(); });

    n = N('rfCreditsOverlay');
    if (n) n.addEventListener('click', function (ev) { if (ev && ev.target === n) hideCredits(); });

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

  // ------------------------------------------------------------- MINIMAP
  // 6.4: a DOM canvas ~200x88 CSS, drawn ONCE at init from World data if
  // available, then per-frame repaint of only the player dot + explored fog.
  // RF.World is Lane W's file; every access here is a guarded, read-only
  // call and the map hides entirely if the API is missing or throws so this
  // lane keeps working standalone against an older/partial world3d.js.
  //
  // Rev 6 fix: the world is a 3:1 landscape (14400x4800) but the CSS box is
  // ~2.27:1, so the sample grid is letterboxed inside the canvas rather than
  // stretched (avoids squashing the maze into an unrecognizable smear). The
  // backing store is sized to CSS size * devicePixelRatio so retina screens
  // get a crisp, non-blurry paint; all subsequent draws happen in CSS-pixel
  // space via ctx.scale(dpr, dpr).
  var MINIMAP_CSS_W = 200, MINIMAP_CSS_H = 88;
  var MINIMAP_GRID_W = 50, MINIMAP_GRID_H = 22; // coarse background sample grid
  var MM_WATER = '#03111d';       // dark navy water base
  var MM_ROCK = '#8fe3ff';        // clearly lighter neon-cyan rock mask
  var MM_FOG_MAX_A = 0.22;        // explored fog cap: never fully hides walls
  var mm = {
    ready: false,      // background sampled and painted
    available: false,  // RF.World exposes enough to draw at all
    ctx2d: null,
    dpr: 1,
    worldW: 14400, worldH: 4800,
    // letterbox rect as FRACTIONS of the canvas's CSS box (0..1), so dot/fog
    // placement stays correct even when the box is resized by the mobile
    // media query (200x88 -> 132x58) after the background was painted once
    // at init against the MINIMAP_CSS_W/H design constants.
    lbXf: 0, lbYf: 0, lbWf: 1, lbHf: 1,
    explored: null,    // Uint8Array(MINIMAP_GRID_W*MINIMAP_GRID_H), fog-of-war
    lastCellX: -1, lastCellY: -1
  };

  function worldDims() {
    var d = RFD();
    var w = d && d.WORLD;
    return {
      w: (w && typeof w.w === 'number' && w.w > 0) ? w.w : 14400,
      h: (w && typeof w.h === 'number' && w.h > 0) ? w.h : 4800
    };
  }

  function minimapAvailable() {
    var World = RF.World;
    return !!(World && (typeof World.regionAt === 'function' || typeof World.terrainSDF === 'function'));
  }

  // zoneTintAt(wy): subtle horizontal tint shift per depth zone, straight
  // from RFD.ZONES (yMin/yMax bands + a per-zone hex tint). Returns null if
  // ZONES is unavailable so callers fall back to the plain water color.
  function zoneTintAt(wy) {
    var d = RFD();
    var zones = d && d.ZONES;
    if (!zones || !zones.length) return null;
    // Sim Y and ZONES are both authored 0..h (the centered-space assumption
    // here was the round-3 minimap-origin bug).
    var y0 = wy;
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (typeof z.yMin === 'number' && typeof z.yMax === 'number' &&
          y0 >= z.yMin && y0 < z.yMax) {
        return typeof z.tint === 'string' ? z.tint : null;
      }
    }
    return null;
  }

  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    var n = parseInt(hex.indexOf('0x') === 0 ? hex.slice(2) : hex.replace('#', ''), 16);
    if (!isFinite(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // One-time background: letterboxed water/rock grid at proper 3:1 aspect,
  // subtle per-zone depth tint on the water, rock drawn clearly lighter so
  // the maze silhouette actually reads at ~200x88 CSS.
  function paintMinimapBackground() {
    var canvas = N('rfMinimap');
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    var ctx2d;
    try { ctx2d = canvas.getContext('2d'); } catch (e) { return false; }
    if (!ctx2d) return false;
    var World = RF.World;
    var dims = worldDims();
    mm.worldW = dims.w; mm.worldH = dims.h;

    // Backing store sized to CSS size * DPR so retina screens aren't blurry;
    // all drawing below happens in CSS-pixel space via ctx.scale(dpr, dpr).
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (!isFinite(dpr) || dpr <= 0) dpr = 1;
    mm.dpr = dpr;
    var cssW = MINIMAP_CSS_W, cssH = MINIMAP_CSS_H;
    try {
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
    } catch (e) { /* headless canvas stub may not allow resize */ }

    // Letterbox: world is w:h = 3:1, the CSS box is ~2.27:1, so fit the
    // world rect inside the box (never stretch) and center it.
    var worldAspect = mm.worldW / mm.worldH;
    var boxAspect = cssW / cssH;
    var lbW, lbH;
    if (worldAspect > boxAspect) { lbW = cssW; lbH = cssW / worldAspect; }
    else { lbH = cssH; lbW = cssH * worldAspect; }
    var lbX = (cssW - lbW) / 2, lbY = (cssH - lbH) / 2;
    mm.lbWf = lbW / cssW; mm.lbHf = lbH / cssH;
    mm.lbXf = lbX / cssW; mm.lbYf = lbY / cssH;

    var cellW = lbW / MINIMAP_GRID_W, cellH = lbH / MINIMAP_GRID_H;
    try {
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, cssW, cssH);
      // full-box base (letterbox bars stay this navy too)
      ctx2d.fillStyle = MM_WATER;
      ctx2d.fillRect(0, 0, cssW, cssH);
      for (var gy = 0; gy < MINIMAP_GRID_H; gy++) {
        for (var gx = 0; gx < MINIMAP_GRID_W; gx++) {
          // Sim space is 0..worldW / 0..worldH (world3d.js) - NOT centered.
          var wx = ((gx + 0.5) / MINIMAP_GRID_W) * mm.worldW;
          var wy = ((gy + 0.5) / MINIMAP_GRID_H) * mm.worldH;
          var open = true;
          if (World && typeof World.terrainSDF === 'function') {
            var sdf = World.terrainSDF(wx, wy);
            open = typeof sdf === 'number' && isFinite(sdf) ? sdf > 0 : true;
          }
          var px = lbX + gx * cellW, py = lbY + gy * cellH;
          if (open) {
            // water: dark navy, subtly tinted per depth zone band
            var tint = zoneTintAt(wy);
            var rgb = tint && hexToRgb(tint);
            ctx2d.fillStyle = rgb
              ? 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',.35)'
              : MM_WATER;
          } else {
            // rock: clearly lighter neon-cyan mask so the maze reads at a glance
            ctx2d.fillStyle = MM_ROCK;
          }
          ctx2d.fillRect(px, py, cellW + 0.5, cellH + 0.5);
        }
      }
      // thin neon outline around the letterboxed world rect for legibility
      ctx2d.strokeStyle = 'rgba(39,224,255,.5)';
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(lbX + 0.5, lbY + 0.5, lbW - 1, lbH - 1);
    } catch (e) { return false; }
    mm.ctx2d = ctx2d;
    mm.explored = new Uint8Array(MINIMAP_GRID_W * MINIMAP_GRID_H);
    return true;
  }

  function initMinimap() {
    var canvas = N('rfMinimap');
    var wrap = N('rfMinimapWrap');
    mm.available = minimapAvailable();
    if (!canvas || !wrap || !mm.available) {
      toggleClass(wrap, 'rf-on', false);
      mm.ready = false;
      return false;
    }
    var ok = false;
    try { ok = paintMinimapBackground(); } catch (e) { ok = false; }
    mm.ready = ok;
    toggleClass(wrap, 'rf-on', ok);
    return ok;
  }

  // Per-frame: player dot + explored fog only (the background canvas pixels
  // painted at init are never touched again). Reads h.px/h.py off the same
  // reused HUD_STATE object hudState() already receives; falls back to
  // hidden if the engine has not published them yet (Rev 6 addition).
  function updateMinimap(px, py) {
    if (!mm.ready) return;
    var canvas = N('rfMinimap');
    var dot = N('rfMinimapDot');
    if (!canvas || !dot) return;
    if (typeof px !== 'number' || typeof py !== 'number' || !isFinite(px) || !isFinite(py)) {
      toggleClass(dot, 'rf-on', false);
      return;
    }
    toggleClass(dot, 'rf-on', true);
    // Dot position is CSS pixels within the canvas's CSS box (canvas fills
    // its wrap via CSS, and rfMinimapDot is absolutely positioned within the
    // same wrap). The letterbox rect is stored as fractions of the CSS box
    // (mm.lbXf/lbYf/lbWf/lbHf) so this stays correct even if the box was
    // resized by the mobile media query after the background was painted
    // once at init against the MINIMAP_CSS_W/H design constants.
    var cw = canvas.clientWidth || MINIMAP_CSS_W, ch = canvas.clientHeight || MINIMAP_CSS_H;
    var lbX = mm.lbXf * cw, lbY = mm.lbYf * ch;
    var lbW = mm.lbWf * cw, lbH = mm.lbHf * ch;
    var fx2 = px / mm.worldW;
    var fy2 = py / mm.worldH;
    if (fx2 < 0) fx2 = 0; else if (fx2 > 1) fx2 = 1;
    if (fy2 < 0) fy2 = 0; else if (fy2 > 1) fy2 = 1;
    dot.style.left = (lbX + fx2 * lbW) + 'px';
    dot.style.top = (lbY + fy2 * lbH) + 'px';

    // Explored fog: mark the coarse cell under the player. Cheap (one array
    // write) and only repaints a pixel when the cell actually changes. Alpha
    // is capped low (MM_FOG_MAX_A) so fog can never fully hide the walls.
    // Fog is painted in the canvas's OWN CSS-pixel space (design constants,
    // matching the ctx.scale(dpr,dpr) set up at init), not the live client
    // size, since the backing store itself does not change with the media
    // query breakpoint.
    var gx = Math.min(MINIMAP_GRID_W - 1, Math.max(0, Math.floor(fx2 * MINIMAP_GRID_W)));
    var gy = Math.min(MINIMAP_GRID_H - 1, Math.max(0, Math.floor(fy2 * MINIMAP_GRID_H)));
    if (gx === mm.lastCellX && gy === mm.lastCellY) return;
    mm.lastCellX = gx; mm.lastCellY = gy;
    if (mm.explored && !mm.explored[gy * MINIMAP_GRID_W + gx] && mm.ctx2d) {
      mm.explored[gy * MINIMAP_GRID_W + gx] = 1;
      var lbXc = mm.lbXf * MINIMAP_CSS_W, lbYc = mm.lbYf * MINIMAP_CSS_H;
      var lbWc = mm.lbWf * MINIMAP_CSS_W, lbHc = mm.lbHf * MINIMAP_CSS_H;
      var cellW = lbWc / MINIMAP_GRID_W, cellH = lbHc / MINIMAP_GRID_H;
      var px2 = lbXc + gx * cellW, py2 = lbYc + gy * cellH;
      try {
        mm.ctx2d.fillStyle = 'rgba(255,255,255,' + MM_FOG_MAX_A + ')';
        mm.ctx2d.fillRect(px2, py2, cellW + 0.5, cellH + 0.5);
      } catch (e) { /* canvas may be a headless stub without 2d fill semantics */ }
    }
  }

  // ------------------------------------------------------------- exports
  // The engine calls init({profile, start(id), firePower, quit}). Those handles
  // are the authoritative wiring: DIVE/AGAIN call start(), the power button
  // calls firePower(). Explicit onDive/onPower registrations still win, so a
  // test harness or a different host can drive the same UI.
  function init(opts) {
    var o = opts || {};
    doc = o.document || (typeof document !== 'undefined' ? document : null);
    ensureFrenzyCueStyles();
    ensureRev7Styles();
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
    // World3D has finished its own init by the time a run starts, so this is
    // the first safe point to sample RF.World for the minimap background.
    try { initMinimap(); } catch (e) { /* minimap is optional chrome */ }
    // Fix-round 3 HUD ONLY-LAW: DEV never renders in-run chrome. The ONLY
    // in-run surface for dev state is this one toast at the moment a run
    // starts (queued through the normal single-toast slot, so it never
    // competes with another popup).
    try {
      var d = Dev();
      if (d && d.active) queueToast('DEV MODE');
    } catch (e) { /* dev toast is optional chrome */ }
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
    if (toastCooldownTimer) { clearTimeout(toastCooldownTimer); toastCooldownTimer = null; }
    toastQueue.length = 0;
    toastCooldownUntil = 0;
    S.chipToken++;
    removeClass(N('rfChip'), 'rf-on');
    removeClass(N('rfChip'), 'rf-chip-mission');
    removeClass(N('rfShopToast'), 'rf-on');
    setFrenzyCue(null);
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

  // -------------------------------------------------------- LEVEL SELECT
  // Rev 12 (12.1): a screen between Menu and DIVE. 12 location cards (name,
  // CSS-gradient thumbnail from the level's sky preset + a theme glyph, lock
  // state with unlock cost, best score). DIVE from here calls
  // RF.Meta.selectLevel (which sets profile.selectedLevel) then the normal
  // start handle, and RF.Game.selectLevel if the engine lane has landed it
  // (defensive: absent is fine, ctx.level/profile.selectedLevel already
  // carries the choice for engine/world to read).
  var levelSelectNode = null;
  function levelList() {
    var d = RFD();
    return (d && Array.isArray(d.LEVELS)) ? d.LEVELS : [];
  }
  function levelBest(id) {
    var m = Meta(), p = profile();
    if (m && typeof m.levelBest === 'function') {
      try { return m.levelBest(p, id) | 0; } catch (e) { return 0; }
    }
    return 0;
  }
  function levelUnlockedM(id) {
    var m = Meta(), p = profile();
    if (m && typeof m.levelUnlocked === 'function') {
      try { return !!m.levelUnlocked(p, id); } catch (e) { return false; }
    }
    return false;
  }
  function selectedLevelId() {
    var p = profile();
    if (p && typeof p.selectedLevel === 'string') return p.selectedLevel;
    var m = Meta();
    if (m && typeof m.firstLevelId === 'function') {
      try { return m.firstLevelId(); } catch (e) { /* fall through */ }
    }
    var lv = levelList();
    return lv.length ? lv[0].id : 'hawaii';
  }

  function unlockCostLabel(lvl) {
    var cost = lvl && lvl.unlock;
    if (!cost || !isFiniteNum(cost.n) || cost.n <= 0) return null;
    if (cost.type === 'coins') return fmt(cost.n) + ' coins';
    if (cost.type === 'gems') return fmt(cost.n) + ' ' + GEM_ICON;
    if (cost.type === 'score') return 'Score ' + fmt(cost.n) + ' on ' + (cost.levelId || 'a prior level');
    return null;
  }
  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
  function skyHex(v, fallback) {
    var n = typeof v === 'number' ? v : Number(v);
    return isFinite(n) ? hex(n) : fallback;
  }

  function ensureLevelSelectNode() {
    var d = D();
    if (!d) return null;
    if (levelSelectNode && levelSelectNode.parentNode) return levelSelectNode;
    ensureRev7Styles();
    var wrap = mk('div', '');
    if (!wrap) return null;
    wrap.id = 'rfLevelSelect';

    var bar = mk('div', 'rf-bar-top');
    var h1 = mk('h1', 'rf-title', 'CHOOSE YOUR WATERS');
    if (h1 && bar) bar.appendChild(h1);
    if (bar) wrap.appendChild(bar);

    var grid = mk('div', '');
    if (grid) { grid.id = 'rfLevelSelectGrid'; wrap.appendChild(grid); }

    var actions = mk('div', '');
    if (actions) {
      actions.id = 'rfLevelSelectBar';
      var back = mk('button', 'rf-btn rf-btn-ghost', 'BACK');
      if (back) {
        back.type = 'button';
        back.addEventListener('click', function () { showMenu(); });
        actions.appendChild(back);
      }
      var dive = mk('button', 'rf-btn rf-btn-go', 'DIVE');
      if (dive) {
        dive.type = 'button';
        dive.id = 'rfLevelSelectDive';
        dive.addEventListener('click', function () { diveIntoSelectedLevel(); });
        actions.appendChild(dive);
      }
      wrap.appendChild(actions);
    }

    // Anchored as a sibling of #rfMenu (its parentNode), matching how the
    // Rev 7 mission strip anchors relative to an existing container -- this
    // works both in the real page (rfMenu's parent is the shared overlay
    // root) and in this file's own selftest DOM stub, whose document object
    // has no .body/.head at all.
    var menuNode = N('rfMenu');
    var host = menuNode && menuNode.parentNode ? menuNode.parentNode : menuNode;
    if (!host) return null;
    host.appendChild(wrap);
    levelSelectNode = wrap;
    return wrap;
  }

  function diveIntoSelectedLevel() {
    var id = selectedLevelId();
    // RF.Game.selectLevel is the engine lane's seam (parallel lane per
    // SPEC3D 12.6); it may not exist yet, so this is a best-effort call and
    // never blocks DIVE -- profile.selectedLevel (already set by
    // doSelectLevel/doUnlockLevel) is the source of truth either way.
    if (window.RF && RF.Game && typeof RF.Game.selectLevel === 'function') {
      try { RF.Game.selectLevel(id); } catch (e) { /* engine lane owns its errors */ }
    }
    fire('onDive', activeId(), handle('start'));
  }

  function buildLevelCard(lvl, selId) {
    var id = lvl.id;
    var unlockedFlag = levelUnlockedM(id);
    var isSel = id === selId;
    var cls = 'rf-level-card' + (isSel ? ' rf-level-sel' : '');
    var card = mk('button', cls);
    if (!card) return null;
    card.type = 'button';
    card.setAttribute('data-level', id);

    // CSS-gradient thumbnail from the level's sky preset (top -> horizon).
    // gen_data.py writes sky colors as hex STRINGS ("0x1f6fb0"), unlike the
    // numeric silhouette palettes elsewhere in data.js, so this coerces
    // through Number() first rather than reusing hex()'s numeric-only path.
    var sky = lvl.sky || {};
    var top = skyHex(sky.top, '#1f6fb0');
    var horizon = skyHex(sky.horizon, '#ffb066');
    card.style.background = 'linear-gradient(180deg,' + top + ' 0%,' + horizon + ' 100%)';

    card.appendChild(mk('span', 'rf-level-icon', levelThemeIcon(lvl)));
    card.appendChild(mk('span', 'rf-level-name', lvl.name || id));
    var best = levelBest(id);
    card.appendChild(mk('span', 'rf-level-best', best > 0 ? ('Best ' + fmt(best)) : 'Unplayed'));

    if (!unlockedFlag) {
      var lock = mk('div', 'rf-level-lock');
      if (lock) {
        lock.appendChild(mk('span', 'rf-level-lock-glyph', '🔒'));
        var costLabel = unlockCostLabel(lvl);
        lock.appendChild(mk('span', '', costLabel || 'Locked'));
        card.appendChild(lock);
      }
      card.addEventListener('click', function () { doUnlockLevel(id); });
    } else {
      card.addEventListener('click', function () { doSelectLevel(id); });
    }
    return card;
  }

  function doSelectLevel(id) {
    var m = Meta(), p = profile();
    if (m && typeof m.selectLevel === 'function' && p) {
      var r = null;
      try { r = m.selectLevel(p, id); } catch (e) { r = null; }
      if (r && r.ok) commit();
    }
    buildLevelSelect();
  }

  function doUnlockLevel(id) {
    var m = Meta(), p = profile();
    if (!m || !p || typeof m.unlockLevel !== 'function') return;
    var kit = S.ctx ? S.ctx.kit : null;
    var r = null;
    try { r = m.unlockLevel(kit, p, id); } catch (e) { r = null; }
    if (r && r.ok) {
      // Land straight on the newly-unlocked level, matching the roster's
      // buy-then-select feel.
      try { m.selectLevel(p, id); } catch (e2) { /* best-effort */ }
      commit();
    }
    buildLevelSelect();
  }

  function buildLevelSelect() {
    var wrap = ensureLevelSelectNode();
    if (!wrap) return;
    var grid = wrap.querySelector ? wrap.querySelector('#rfLevelSelectGrid') : null;
    if (!grid) return;
    clear(grid);
    var levels = levelList();
    var selId = selectedLevelId();
    for (var i = 0; i < levels.length; i++) {
      var card = buildLevelCard(levels[i], selId);
      if (card) grid.appendChild(card);
    }
    var diveBtn = wrap.querySelector ? wrap.querySelector('#rfLevelSelectDive') : null;
    if (diveBtn) diveBtn.disabled = !levelUnlockedM(selId);
  }

  function showLevelSelect(state) {
    if (state && state.ctx) S.ctx = state.ctx;
    if (state && state.profile) S.profile = state.profile;
    buildLevelSelect();
    showOnly('levelSelect');
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

  // Task 2, HUD only-law: the ONLY new persistent in-run element is a gem
  // counter beside the coin counter. The in-run HUD has no coin counter at
  // all (6.11 removed it to menu/results only per code review MAJOR 5), so
  // this reads the run's gem total (profile.gems, static for the run's
  // duration since gems are awarded at endRun, not mid-run) once per
  // showHud() and lives in the same top-left corner as the retired coin
  // stat used to. Built dynamically since index.html has no such node yet.
  // Existence check is a direct object reference (S.hudGemNode), not a
  // getElementById('rfHudGems') round-trip: index.html has no such id in
  // its markup (this lane injects the node), and getElementById on an id
  // that has never been created is only guaranteed to return null in a
  // real DOM -- a test-harness DOM stub that auto-vivifies unknown ids
  // (which this file's own selftest stub does, to satisfy the fixed
  // NODE_IDS contract) would otherwise mask the very first creation.
  var hudGemNode = null;
  function ensureHudGemNode() {
    var hud = N('rfHud');
    if (!hud) return null;
    if (hudGemNode && hudGemNode.parentNode === hud) return hudGemNode;
    var node = mk('div', '');
    if (!node) return null;
    node.id = 'rfHudGems';
    hud.insertBefore(node, hud.firstChild);
    hudGemNode = node;
    return node;
  }

  function paintHudGems() {
    var node = ensureHudGemNode();
    if (!node) return;
    var n = gems();
    // :empty CSS rule hides the node entirely on saves with no gems yet
    // (task: purely additive, never a visible zero-state clutter regression
    // on an old save); once any gems exist it shows the compact readout.
    clear(node);
    if (n > 0) {
      node.appendChild(mk('span', '', GEM_ICON));
      node.appendChild(mk('span', '', compact(n)));
    }
  }

  // Mission progress ticks arrive via the existing toast/chip channels
  // (task 2). This is the caller-facing helper: fires the ONE queued toast
  // slot with the mission-tick chip variant so a mission completion or
  // step reads distinctly from a plain toast without adding new UI.
  function missionTick(text) {
    queueToast(text, null, { holo: false, missionTick: true });
  }

  function showHud() {
    // A fresh run means a fresh diff baseline, or the first push after a
    // menu round trip would be silently swallowed as unchanged.
    S.lastHud = null;
    showOnly('hud');
    paintHudGems();
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
    // getElementById(id) below must find nodes ui3d.js creates dynamically
    // via mk()+node.id=... (the Rev 7 gem-stat/mission-strip/HUD-gem
    // helpers), not only ones the harness itself looked up first. store
    // is declared here (Node's closure) and registerId() is called from
    // both setAttribute('id', ...) and the `id` property setter below.
    var store = {};
    function registerId(node) { if (node.id) store[node.id] = node; }
    function Node(tag) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.children = [];
      this.firstChild = null;
      this.nextSibling = null;
      this.parentNode = null;
      this._text = '';
      this.style = {};
      this.disabled = false;
      this.type = '';
      this.attrs = {};
      this._cls = {};
      this._className = '';
      this._id = '';
      var self = this;
      Object.defineProperty(this, 'id', {
        get: function () { return self._id; },
        set: function (v) { self._id = String(v); registerId(self); },
        enumerable: true
      });
      // className is a plain assignable property in real DOM (mk() writes
      // it as a shorthand for a whole class list, e.g. 'rf-mission
      // rf-mission-done'), and classList.contains() reflects it live. The
      // stub must mirror that: a className assignment repopulates _cls so
      // classList.contains(...) stays truthful for code that never calls
      // classList.add() directly.
      Object.defineProperty(this, 'className', {
        get: function () { return self._className; },
        set: function (v) {
          self._className = String(v == null ? '' : v);
          self._cls = {};
          var parts = self._className.split(/\s+/);
          for (var i = 0; i < parts.length; i++) if (parts[i]) self._cls[parts[i]] = true;
        },
        enumerable: true
      });
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
    Node.prototype._relink = function () {
      for (var i = 0; i < this.children.length; i++) {
        this.children[i].parentNode = this;
        this.children[i].nextSibling = (i + 1 < this.children.length) ? this.children[i + 1] : null;
      }
      this.firstChild = this.children.length ? this.children[0] : null;
    };
    Node.prototype.appendChild = function (c) {
      if (!c) return c;
      var i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      this.children.push(c);
      this._relink();
      return c;
    };
    Node.prototype.removeChild = function (c) {
      var i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      this._relink();
      return c;
    };
    // Minimal insertBefore: refIndex null/undefined appends at the end
    // (matching native insertBefore(node, null) semantics), which is the
    // only form the Rev 7 dynamic-node helpers above use.
    Node.prototype.insertBefore = function (c, ref) {
      if (!c) return c;
      var i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      var at = ref ? this.children.indexOf(ref) : -1;
      if (at < 0) this.children.push(c); else this.children.splice(at, 0, c);
      this._relink();
      return c;
    };
    Node.prototype.setAttribute = function (k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') { this.id = String(v); registerId(this); }
    };
    Node.prototype.getAttribute = function (k) { return this.attrs[k]; };
    Node.prototype.addEventListener = function (t, fn) {
      (this._listeners[t] = this._listeners[t] || []).push(fn);
    };
    Node.prototype.fire = function (t, ev) {
      var l = this._listeners[t] || [];
      for (var i = 0; i < l.length; i++) l[i](ev || {});
    };
    // Minimal recursive selector support: only what this file's own code
    // actually issues (#id and .class), enough to exercise the dynamic
    // gem-stat/collection-card/relic-dot helpers headlessly.
    function matchesSel(node, sel) {
      if (sel.charAt(0) === '#') return node.id === sel.slice(1);
      if (sel.charAt(0) === '.') return !!node._cls[sel.slice(1)];
      return node.tagName === sel.toUpperCase();
    }
    function walk(node, sel, out, first) {
      for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i];
        if (matchesSel(c, sel)) { out.push(c); if (first) return true; }
        if (walk(c, sel, out, first) && first) return true;
      }
      return false;
    }
    Node.prototype.querySelector = function (sel) {
      var out = [];
      walk(this, sel, out, true);
      return out.length ? out[0] : null;
    };
    Node.prototype.querySelectorAll = function (sel) {
      var out = [];
      walk(this, sel, out, false);
      return out;
    };
    // Real DOM's textContent GETTER concatenates every descendant text node;
    // this stub has no separate text-node type (mk() sets a leaf's _text
    // directly), so the getter recurses: a node with children reports the
    // concatenation of their textContent, a childless node reports its own
    // _text. The Rev 7 gem-stat/mission-strip/results/collection helpers
    // all build "icon span + value span" pairs and read the WRAPPER's
    // textContent to assert on the combined text, exactly like real DOM
    // code checking a card's rendered text.
    Object.defineProperty(Node.prototype, 'textContent', {
      get: function () {
        if (!this.children.length) return this._text;
        var out = '';
        for (var i = 0; i < this.children.length; i++) out += this.children[i].textContent;
        return out;
      },
      set: function (v) {
        this._text = String(v); this.children.length = 0; this.firstChild = null;
        this.nextSibling = null;
      }
    });
    // Minimal canvas 2D stub so the minimap's one-time background paint (6.4)
    // can be exercised headlessly: draw calls are no-ops, geometry is inert.
    Node.prototype.getContext = function (kind) {
      if (kind !== '2d') return null;
      if (!this._ctx2d) {
        this._ctx2d = {
          fillStyle: '', strokeStyle: '', lineWidth: 1,
          clearRect: function () {}, fillRect: function () {},
          strokeRect: function () {}, setTransform: function () {}
        };
      }
      return this._ctx2d;
    };

    var stub = {
      createElement: function (t) { return new Node(t); },
      getElementById: function (id) {
        if (!store[id]) { store[id] = new Node('div'); store[id].id = id; }
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
      hudWriteBuffer: hudWriteBuffer,
      menuPick: S.menuPick, shopPick: S.shopPick, inited: S.inited, handles: S.handles,
      dive: CB.dive, power: CB.power, shopNav: CB.shopNav,
      frenzyStyle: frenzyStyleNode, frenzyCue: activeFrenzyCue,
      toastQueue: toastQueue.slice(), toastCooldownUntil: toastCooldownUntil,
      toastCooldownTimer: toastCooldownTimer,
      bakeQueue: S.bakeQueue, bakeQueued: S.bakeQueued, bakeVisible: S.bakeVisible,
      bakeBytes: S.bakeBytes, bakeTimer: S.bakeTimer, bakeDisabled: S.bakeDisabled
    };
    S.thumbs = {};
    S.bound = false;
    S.lastHud = null;
    frenzyStyleNode = null;
    activeFrenzyCue = null;
    if (toastCooldownTimer) clearTimeout(toastCooldownTimer);
    toastQueue = [];
    toastCooldownUntil = 0;
    toastCooldownTimer = null;
    // Isolate the bake system entirely: no real bake timer must survive
    // into or out of the selftest, and bakeDisabled defaults false so the
    // no-RF.Art3D / no-RF.Game guard paths below are actually exercised.
    if (S.bakeTimer && typeof window.clearTimeout === 'function') { try { window.clearTimeout(S.bakeTimer); } catch (eBT) {} }
    S.bakeQueue = [];
    S.bakeQueued = {};
    S.bakeVisible = {};
    S.bakeBytes = 0;
    S.bakeTimer = null;
    S.bakeDisabled = false;

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
      ok('frenzy cue stylesheet created', !!frenzyStyleNode
        && String(frenzyStyleNode.textContent).indexOf('rf-chip-blood') >= 0
        && String(frenzyStyleNode.textContent).indexOf('rf-chip-school') >= 0
        && String(frenzyStyleNode.textContent).indexOf('rf-chip-golden') >= 0);

      frenzyCue('blood');
      ok('blood cue chip variant', N('rfChip').classList.contains('rf-chip-blood')
        && N('rfChip').classList.contains('rf-chip'));
      ok('blood cue toast variant', N('rfShopToast').classList.contains('rf-toast-blood'));
      frenzyCue('school');
      ok('school cue chip variant', N('rfChip').classList.contains('rf-chip-school')
        && !N('rfChip').classList.contains('rf-chip-blood'));
      frenzyCue('goldRush');
      ok('goldRush maps to golden variant', N('rfChip').classList.contains('rf-chip-golden')
        && N('rfShopToast').classList.contains('rf-toast-golden'));
      frenzyCue(null);
      ok('cue clear removes variants', !N('rfChip').classList.contains('rf-chip-golden')
        && !N('rfShopToast').classList.contains('rf-toast-golden'));

      // ---- fix-round 3 art MAJOR: buff pickup hologram wiring --------
      // fx3d's cueUi() forwards the run's frenzyCue verbatim, including the
      // 'buff'/'buff:<id>' values a pickup produces; those must reach the
      // toast with the holo treatment rather than being silently dropped by
      // normalizeFrenzyCue (which only knows the blood/school/golden family).
      clearTransients();
      var buffOk = frenzyCue('buff:overdrive');
      ok('buff:<id> cue is handled (not dropped)', buffOk === true);
      // Rev 12 (12.4): the toast now leads with the pickup's icon glyph
      // (gem-mesh look + per-type icon), so this checks the label is
      // present rather than requiring an exact match with no icon.
      ok('buff pickup toast uses the known label', N('rfChip').textContent.indexOf('OVERDRIVE') >= 0);
      ok('buff pickup toast shows immediately', N('rfChip').classList.contains('rf-on') === true);
      ok('buff pickup toast gets the holo flicker class', N('rfChip').classList.contains('rf-holo-flicker') === true);
      clearTransients();
      var buffOk2 = frenzyCue('buff');
      ok('bare buff cue is also handled', buffOk2 === true);
      ok('bare buff cue falls back to a generic label', N('rfChip').textContent === 'BUFF ACTIVE');
      clearTransients();
      var buffOk3 = frenzyCue('buff:notreal');
      ok('unknown buff id still shows a generic label, never throws', buffOk3 === true
        && N('rfChip').textContent === 'BUFF ACTIVE');
      clearTransients();

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
      // 6.11 + code review MAJOR 5: name/coins are OUT of the in-run HUD
      // (menu/results only). score is a required persistent field; the
      // hp bar is now driven by hungerFrac when present, falling back to
      // hpFrac/hp/maxHp for an engine build that has not landed hungerFrac.
      showHud();
      var first = hudState({ hp: 60, maxHp: 60, boost: 1, score: 0 });
      ok('first push paints', first === true);
      ok('hud score painted', N('rfHudScore').textContent === '0');
      ok('hud hp full', N('rfHudHp').style.width === '100.00%');
      var firstHudBuffer = S.lastHud;

      var same = hudState({ hp: 60, maxHp: 60, boost: 1, score: 0 });
      ok('identical push is a no-op', same === false);
      var secondHudBuffer = S.lastHud;
      ok('HUD no-op still swaps the preallocated buffer', secondHudBuffer !== firstHudBuffer);

      var moved = hudState({ hp: 30, maxHp: 60, boost: 1, score: 0 });
      ok('changed push paints', moved === true);
      ok('HUD diff buffers swap by reference', S.lastHud === firstHudBuffer);
      ok('hp halves', N('rfHudHp').style.width === '50.00%');
      ok('hp not low at half', N('rfHudHp').classList.contains('rf-low') === false);
      hudState({ hp: 6, maxHp: 60, boost: 1, score: 0 });
      ok('hp low under 30 percent', N('rfHudHp').classList.contains('rf-low') === true);

      // hungerFrac wins over hp/maxHp/hpFrac when the engine supplies it,
      // exactly like hpFrac's existing precedence -- so a build that has
      // landed hungerFrac gets the correct starving-shark read even while
      // hp/maxHp are still populated for legacy readers.
      hudState({ hungerFrac: 0.2, hp: 999, maxHp: 10 });
      ok('hungerFrac wins over hp/maxHp', N('rfHudHp').style.width === '20.00%');
      ok('hungerFrac drives the low state', N('rfHudHp').classList.contains('rf-low') === true);

      // Partial pushes must carry unspecified fields forward.
      hudState({ score: 4200 });
      ok('partial push keeps hp', S.lastHud.hp === 999);
      ok('partial push updates score', N('rfHudScore').textContent === '4,200');

      // ---- persistent score + combo readout (score+combo required) --
      hudState({ combo: 4 });
      ok('persistent combo readout shown', N('rfHudCombo').textContent === 'x4');
      hudState({ combo: 0 });
      ok('persistent combo readout clears at zero', N('rfHudCombo').textContent === '');

      hudState({ powerName: 'Pyro Breath', power: 0.5, powerReady: false });
      ok('power shown', N('rfPower').classList.contains('rf-hide') === false);
      ok('power label', N('rfPowerLabel').textContent === 'Pyro Breath');
      ok('power fill height', N('rfPowerFill').style.height === '50.00%');
      ok('power not ready', N('rfPower').classList.contains('rf-ready') === false);
      hudState({ power: 1, powerReady: true });
      ok('power ready', N('rfPower').classList.contains('rf-ready') === true);

      // ---- 6.7 power charge pips + disabled-at-zero -----------------
      hudState({ powerCharges: 5 });
      ok('pip row shown', N('rfPowerPips').classList.contains('rf-on') === true);
      var pipsOn = 0;
      for (var pi = 0; pi < N('rfPowerPips').children.length; pi++) {
        if (N('rfPowerPips').children[pi].classList.contains('rf-power-pip-on')) pipsOn++;
      }
      ok('five pips lit for five charges', pipsOn === 5);
      ok('power not empty at 5 charges', N('rfPower').classList.contains('rf-power-empty') === false);
      hudState({ powerCharges: 0 });
      ok('power empty at zero charges', N('rfPower').classList.contains('rf-power-empty') === true);
      ok('power disabled at zero charges', N('rfPower').disabled === true);
      hudState({ powerCharges: undefined, powerId: null, power: 0, powerReady: false });

      // ---- fix-round 3 HUD ONLY-LAW: no persistent buff-bar row ------
      // #rfBuffTimers/paintBuffTimers is retired; a buffTimers push must be
      // tolerated (never throw) but must not resurrect any in-run element,
      // and the node this test harness fabricates on first getElementById
      // lookup must stay untouched (no rf-on, no children) since ui3d.js
      // itself never looks it up anymore.
      hudState({ buffTimers: [{ frac: 0.6 }, 0.25] });
      ok('buffTimers push does not throw', true);
      ok('no buff-bar element is touched', N('rfBuffTimers') === null);

      // ---- fix-round 3 HUD ONLY-LAW: dev is never in-run chrome ------
      // hudState still accepts/diffs the field (S.lastHud.dev) so a future
      // consumer of the diff buffer works, but it must not paint rfDevChip
      // (that element now lives in the menu bar only, painted from
      // RF.DevMode.state.active by paintMenuDevChip/runStarted's toast).
      removeClass(N('rfDevChip'), 'rf-on');
      hudState({ dev: true });
      ok('dev push does not toggle the (retired) in-run chip', N('rfDevChip').classList.contains('rf-on') === false);
      ok('dev is still tracked in the diff buffer', S.lastHud.dev === true);
      hudState({ dev: false });
      ok('dev push (false) still does not touch the chip', N('rfDevChip').classList.contains('rf-on') === false);

      // ---- fix-round 3: DEV menu chip + one-shot run-start toast -----
      var savedDevMode = RF.DevMode;
      RF.DevMode = { state: { active: true } };
      try {
        buildMenu();
        ok('menu paints DEV chip on when RF.DevMode.state.active', N('rfDevChip').classList.contains('rf-on') === true);
        RF.DevMode.state.active = false;
        buildMenu();
        ok('menu clears DEV chip when dev goes inactive', N('rfDevChip').classList.contains('rf-on') === false);

        RF.DevMode.state.active = true;
        var devTok0 = S.chipToken;
        runStarted({});
        ok('run start queues/paints one DEV toast when active', N('rfChip').textContent === 'DEV MODE' || (toastQueue.length && toastQueue[toastQueue.length - 1].text === 'DEV MODE'));
        ok('run start dev toast used the normal token path', S.chipToken >= devTok0);

        RF.DevMode.state.active = false;
        clearTransients();
        runStarted({});
        // runStarted's own clearTransients() always bumps S.chipToken and
        // hides (but does not blank the stale textContent of) #rfChip,
        // independent of the dev toast -- so the assertion must check
        // visibility (rf-on) and the queue, not leftover text.
        ok('run start does not toast when dev is inactive', N('rfChip').classList.contains('rf-on') === false
          && toastQueue.every(function (t) { return t.text !== 'DEV MODE'; }));
      } finally {
        RF.DevMode = savedDevMode;
        clearTransients();
        // buildMenu() above queues a real thumbnail bake per roster shark
        // (buildCard -> queueBake) whenever a real RFD roster is loaded (the
        // in-browser selftest run has one); undo that bake-queue side effect
        // so the dedicated queueBake/drainBakeQueue assertions further down
        // still see a clean, single-entry queue.
        if (S.bakeTimer && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          try { window.clearTimeout(S.bakeTimer); } catch (eBakeClr) { /* best effort */ }
        }
        S.bakeTimer = null;
        S.bakeQueue = [];
        S.bakeQueued = {};
      }

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

      // ---- 6.9 ONE queued toast slot: cooldown-gated popups -----------
      var qTok0 = S.chipToken;
      queueToast('TOO BIG');
      ok('first popup paints immediately', chipNode.textContent === 'TOO BIG' && S.chipToken === qTok0 + 1);
      queueToast('SHIELD UP');
      ok('second popup within cooldown does not repaint yet', chipNode.textContent === 'TOO BIG');
      ok('second popup is queued, not dropped', toastQueue.length === 1 && toastQueue[0].text === 'SHIELD UP');
      queueToast('MEGA JAW');
      ok('a third popup within cooldown still queues (bounded, not stacked visually)',
        toastQueue.length === 2 && chipNode.textContent === 'TOO BIG');
      if (toastCooldownTimer) { clearTimeout(toastCooldownTimer); toastCooldownTimer = null; }
      toastQueue.length = 0; toastCooldownUntil = 0;
      if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }
      removeClass(chipNode, 'rf-on');

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
      ok('thumb cached', S.thumbs[tk('reef')] === 'data:image/png;base64,AA');
      setThumb('reef', 'data:image/png;base64,BB');
      ok('thumb overwritten', S.thumbs[tk('reef')] === 'data:image/png;base64,BB');
      ok('thumb cache isolated', S.thumbs[tk('tiger')] === undefined);
      ok('thumb cache key carries the rev token', tk('reef').indexOf(THUMB_CACHE_REV + ':') === 0);

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

      // ---- art MAJOR 1: thumbnail bake guard + happy path -------------
      var savedArt3D = RF.Art3D, savedGame = RF.Game;
      var savedBakeScene = bakeScene, savedBakeCamera = bakeCamera, savedBakeLights = bakeLights;
      bakeScene = null; bakeCamera = null; bakeLights = null;
      delete RF.Art3D; delete RF.Game;
      ok('bakeThumb no-ops with no RF.Art3D', bakeThumb('mako') === false);
      ok('no-Art3D bake disables further attempts', S.bakeDisabled === true);
      S.bakeDisabled = false;

      var disposedGeo = 0, disposedMat = 0;
      var fakeGroup = {
        userData: { rfBodyLen: 220, rfRadiusY: 48 },
        traverse: function (fn) {
          fn({ geometry: { dispose: function () { disposedGeo++; } }, material: { dispose: function () { disposedMat++; } } });
        }
      };
      RF.Art3D = { buildShark: function () { return { group: fakeGroup, parts: {}, animate: function () {} }; } };
      var fakeCanvasCalls = 0;
      RF.Game = {
        three: {
          Scene: function () { this.children = []; this.add = function () { }; this.remove = function () { }; },
          PerspectiveCamera: function () {
            this.fov = 32;
            this.position = { set: function () {} };
            this.lookAt = function () {};
            this.updateProjectionMatrix = function () {};
          },
          HemisphereLight: function () {},
          DirectionalLight: function () { this.position = { set: function () {} }; },
          Vector2: function () { this.x = 0; this.y = 0; },
          Vector3: function () { this.x = 0; this.y = 0; this.z = 0; },
          Color: function () {},
          Box3: function () {
            this.setFromObject = function () { return this; };
            this.getSize = function (v) { v.x = 220; v.y = 96; v.z = 60; return v; };
            this.getCenter = function (v) { v.x = 0; v.y = 0; v.z = 0; return v; };
          }
        },
        renderer: {
          getSize: function (v) { v.x = 844; v.y = 390; },
          getPixelRatio: function () { return 2; },
          setPixelRatio: function () {},
          setSize: function () {},
          render: function () { fakeCanvasCalls++; },
          domElement: { toDataURL: function () { return 'data:image/png;base64,' + new Array(80).join('Q'); } }
        }
      };
      ok('bakeThumb bakes with stub Art3D/Game', bakeThumb('mako') === true);
      ok('bake rendered exactly one frame', fakeCanvasCalls === 1);
      ok('bake result is cached via setThumb', typeof S.thumbs[tk('mako')] === 'string' && S.thumbs[tk('mako')].indexOf('data:') === 0);
      ok('bake disposes the one-off rig geometry/material', disposedGeo === 1 && disposedMat === 1);
      ok('bakeThumb is a no-op once already cached', (function () {
        var before = fakeCanvasCalls;
        bakeThumb('mako');
        return fakeCanvasCalls === before;
      })());

      // Byte cap: an already-over-budget running total must refuse to cache
      // a new bake even though the render itself would have succeeded.
      S.bakeBytes = BAKE_BYTE_CAP + 1;
      ok('bake refuses past the byte cap', bakeThumb('tiger') === false);
      ok('over-cap bake does not populate the thumb cache', S.thumbs[tk('tiger')] === undefined);
      S.bakeBytes = 0;

      // queueBake dedupes and drains lazily via the idle scheduler.
      S.thumbs = {};
      queueBake('mako');
      ok('queueBake enqueues once', S.bakeQueue.length === 1 && S.bakeQueued.mako === true);
      queueBake('mako');
      ok('queueBake dedupes a second call', S.bakeQueue.length === 1);
      if (S.bakeTimer && typeof window.clearTimeout === 'function') { try { window.clearTimeout(S.bakeTimer); } catch (eBT3) {} }
      S.bakeTimer = null;
      drainBakeQueue();
      ok('drainBakeQueue bakes the queued id', S.thumbs[tk('mako')] !== undefined);
      ok('drainBakeQueue clears the dedupe flag', S.bakeQueued.mako === undefined);

      RF.Art3D = savedArt3D; RF.Game = savedGame;
      if (savedArt3D === undefined) delete RF.Art3D;
      if (savedGame === undefined) delete RF.Game;
      bakeScene = savedBakeScene; bakeCamera = savedBakeCamera; bakeLights = savedBakeLights;

      // ---- Rev 7 economy: mission strip, gems, relic dots, results, shop
      // Collection section (task 7). RF.Meta is not loaded by the `ui`
      // selftest target (see tools/selftest.mjs), so Meta()-backed reads
      // (coins/owned/tierUnlocked/etc) already fall back to their existing
      // defensive defaults throughout this file; the assertions below drive
      // the Rev 7 surfaces directly off S.profile / RFD (real data.js IS
      // loaded here) plus a minimal fake RF.Meta for the buy/spend paths,
      // exercising exactly the same defensive fallbacks a real, older, or
      // partially-booted meta.js build would hit.
      (function rev7SelftestBlock() {
        var savedMeta = RF.Meta;
        // profile() prefers S.ctx.save over S.profile; a prior block in this
        // same __selftest run left S.ctx set from an earlier runStarted()
        // call, which would otherwise shadow every profile below.
        S.ctx = null;

        // This stub's getElementById(id) auto-vivifies a bare, PARENTLESS
        // div for any of the fixed NODE_IDS on first lookup (grab() has
        // already touched all of them by this point in the run) -- it does
        // not reconstruct index.html's actual nesting (.rf-bar-top wrapping
        // rfMenuCoins, etc). The Rev 7 gem-stat helpers walk UP from
        // rfMenuCoins/rfShopCoins's real parentNode to find their insertion
        // point, so exercising them meaningfully here requires rebuilding
        // that one level of real nesting the stub does not provide.
        var menuBarTop = N('rfMenu').querySelector('.rf-bar-top') || mk('div', 'rf-bar-top');
        var menuCoinsStatWrap = mk('div', 'rf-stat');
        menuCoinsStatWrap.appendChild(N('rfMenuCoins'));
        menuBarTop.appendChild(menuCoinsStatWrap);
        if (!menuBarTop.parentNode) N('rfMenu').insertBefore(menuBarTop, N('rfMenu').firstChild);
        var shopBarTop = N('rfShop').querySelector('.rf-bar-top') || mk('div', 'rf-bar-top');
        var shopCoinsStatWrap = mk('div', 'rf-stat');
        shopCoinsStatWrap.appendChild(N('rfShopCoins'));
        shopBarTop.appendChild(shopCoinsStatWrap);
        if (!shopBarTop.parentNode) N('rfShop').insertBefore(shopBarTop, N('rfShop').firstChild);
        var profOld = { coins: 0, level: 5, xp: 0, selected: 'reef', sharks: {} };
        var profRev7 = {
          coins: 0, level: 5, xp: 0, selected: 'reef', sharks: {},
          gems: 7,
          relics: { 1: [true, true, false], 2: [false, false, false] },
          skins: { owned: ['skin_neon_riptide'], selectedSkin: null },
          missions: {
            active: ['m_eat_any_15', 'm_find_relic_any'],
            progress: { m_eat_any_15: 9, m_find_relic_any: 1 },
            completed: { m_find_relic_any: true }
          }
        };

        // Old (pre-Rev7) save shape: gems()/activeMissionDefs()/
        // relicProgress() must degrade to inert defaults, never throw.
        delete RF.Meta;
        showMenu({ profile: profOld });
        ok('gems() defaults to 0 on a pre-Rev7 profile', gems() === 0);
        ok('activeMissionDefs() empty on a pre-Rev7 profile', activeMissionDefs().length === 0);
        ok('relicProgress() null on a pre-Rev7 profile', relicProgress(1) === null);
        var threwOldMenu = false;
        try { buildMenu(); } catch (e) { threwOldMenu = true; }
        ok('buildMenu tolerates a pre-Rev7 profile', threwOldMenu === false);
        ok('mission strip stays empty on a pre-Rev7 profile', (function () {
          var menu = N('rfMenu');
          var s = menu && menu.querySelector ? menu.querySelector('#rfMissionStrip') : null;
          return !s || s.children.length === 0;
        })());

        // Rev 7 profile: gems/missions/relics all read correctly.
        showMenu({ profile: profRev7 });
        ok('gems() reads profile.gems', gems() === 7);
        var missions = activeMissionDefs();
        ok('activeMissionDefs() returns the active ids in order',
          missions.length === 2 && missions[0].id === 'm_eat_any_15' && missions[1].id === 'm_find_relic_any');
        ok('activeMissionDefs() resolves the real MISSIONS name', missions[0].label === 'Eat 15 fish');
        ok('activeMissionDefs() carries progress/goal', missions[0].progress === 9 && missions[0].goal === 15);
        ok('activeMissionDefs() flags a completed mission done', missions[1].done === true);
        ok('missionGoal() reads target.n for eatCount', missionGoal({ type: 'eatCount', target: { n: 15 } }) === 15);
        ok('missionGoal() reads target.seconds for surviveZone',
          missionGoal({ type: 'surviveZone', target: { seconds: 90 } }) === 90);

        var rp1 = relicProgress(1);
        ok('relicProgress() counts true entries', rp1 && rp1.have === 2 && rp1.total === 3);
        var rp2 = relicProgress(2);
        ok('relicProgress() reads a zero-progress zone', rp2 && rp2.have === 0);
        ok('relicProgress() null for an untouched zone key', relicProgress(999) === null);
        ok('zoneIdForTier maps a low tier to zone 1', zoneIdForTier(1) === 1);
        ok('zoneIdForTier maps a high tier to the nearest-below zone', zoneIdForTier(9) === 4);
        ok('zoneIdForTier falls back to the first zone below any intendedTier', zoneIdForTier(0) === 1);

        // ---- Menu: mission strip, gem stat, relic dots ---------------
        buildMenu();
        var stripNode = N('rfMenu').querySelector('#rfMissionStrip');
        ok('mission strip renders one card per active mission',
          !!stripNode && stripNode.children.length === 2);
        ok('mission strip shows progress text for an in-progress mission',
          stripNode.children[0].children[0].textContent.indexOf('9/15') > 0);
        ok('mission strip flags a completed mission with the done class',
          stripNode.children[1].classList.contains('rf-mission-done') === true);
        var gemStatNode = N('rfMenu').querySelector('#rfMenuGems');
        ok('menu gem stat reflects profile.gems', !!gemStatNode && gemStatNode.textContent === '7');

        ok('roster tier head carries relic dots for a zone with progress', (function () {
          var roster = N('rfMenuRoster');
          if (!roster) return false;
          var dots = roster.querySelectorAll('.rf-relic-dots');
          return dots.length > 0 && dots[0].children.length === 3
            && dots[0].children[0].classList.contains('rf-relic-on') === true;
        })());

        // ---- HUD: gem counter beside the (retired) coin counter -------
        showHud();
        var hudGemNode = N('rfHud').querySelector('#rfHudGems');
        ok('HUD gem node created on showHud', !!hudGemNode);
        ok('HUD gem node shows the compact gem count', hudGemNode.textContent.indexOf('7') >= 0);
        showHud(); // idempotent: must not duplicate the node or throw
        ok('HUD gem node is not duplicated across repeated showHud calls',
          N('rfHud').querySelectorAll('#rfHudGems').length <= 1);

        // Zero-gem profile: the HUD node must render EMPTY (no clutter on a
        // fresh save), never a "0" readout.
        S.profile = { coins: 0, level: 1, xp: 0, selected: 'reef', sharks: {}, gems: 0 };
        showHud();
        ok('HUD gem node is empty at zero gems',
          N('rfHud').querySelector('#rfHudGems').textContent === '');
        S.profile = profRev7;

        // Mission-tick chip variant (task 2).
        clearTransients();
        missionTick('Mission complete!');
        ok('missionTick shows immediately via the one queued toast slot',
          N('rfChip').textContent === 'Mission complete!' && N('rfChip').classList.contains('rf-on') === true);
        ok('missionTick applies the rf-chip-mission variant',
          N('rfChip').classList.contains('rf-chip-mission') === true);
        clearTransients();
        ok('clearTransients removes the mission-tick chip variant',
          N('rfChip').classList.contains('rf-chip-mission') === false);
        chip('x3');
        ok('a plain chip does not carry the mission-tick variant',
          N('rfChip').classList.contains('rf-chip-mission') === false);

        // ---- Results: gems / mission results / relic finds / unlocks --
        showResults({
          score: 900, coins: 40, xp: 5, gems: 4,
          missionResults: [{ id: 'm_eat_any_15', name: 'Eat 15 fish', gems: 1 }],
          relicFinds: [{ relicId: 'relic_z1_a', zoneId: 1 }],
          relicUnlocks: [
            { type: 'relicSet', zoneId: 1 },
            { type: 'sharkUnlock', sharkId: 'nullfin', via: 'relicSet' }
          ],
          unlocks: []
        });
        ok('results screen renders a gems-earned row', (function () {
          var rows = N('rfResRows');
          for (var i = 0; i < rows.children.length; i++) {
            if (rows.children[i].classList.contains('rf-res-gems')
              || (rows.children[i].children[0] && rows.children[i].children[0].textContent === 'Gems earned')) return true;
          }
          return false;
        })());
        ok('results screen renders the completed mission as DONE', (function () {
          var rows = N('rfResRows');
          for (var i = 0; i < rows.children.length; i++) {
            if (rows.children[i].classList.contains('rf-res-mission-done')) return true;
          }
          return false;
        })());
        ok('results screen renders the relic find by resolved name', (function () {
          var rows = N('rfResRows');
          for (var i = 0; i < rows.children.length; i++) {
            if (rows.children[i].classList.contains('rf-res-relic')
              && rows.children[i].textContent.indexOf('Coral Shard') >= 0) return true;
          }
          return false;
        })());
        ok('results screen renders the relic-set + secret-shark unlock callouts', (function () {
          var un = N('rfResUnlocks');
          var joined = '';
          for (var i = 0; i < un.children.length; i++) joined += un.children[i].textContent + '|';
          return joined.indexOf('Relic set complete: Zone 1') >= 0
            && joined.indexOf('Secret shark unlocked') >= 0;
        })());

        // A zero/absent Rev 7 payload must still render cleanly (no gems
        // row, no mission/relic rows, no callouts) -- exactly the
        // defensive contract the task calls for.
        showResults({ score: 5, coins: 1, xp: 1, unlocks: [] });
        ok('results screen omits the gems row when gems is absent', (function () {
          var rows = N('rfResRows');
          for (var i = 0; i < rows.children.length; i++) {
            if (rows.children[i].classList.contains('rf-res-gems')) return false;
          }
          return true;
        })());
        var threwBareResults = false;
        try { showResults({}); } catch (e) { threwBareResults = true; }
        ok('results screen tolerates a bare payload with no Rev 7 fields', threwBareResults === false);

        // ---- Shop: Collection/Skins section ---------------------------
        // A minimal fake RF.Meta must be present for buildSecretSharkCard's
        // B3 gem-button gating (typeof m.unlockSecretSharkWithGems ===
        // 'function'); the real meta.js is not loaded in this ui-only
        // selftest run.
        RF.Meta = { unlockSecretSharkWithGems: function () { return { ok: false }; }, selectSkin: function () { return { ok: false }; } };
        showShop({ profile: profRev7 });
        var shopRoot = N('rfShopList');
        ok('shop renders a Collection section when SKINS/SECRET_SHARKS exist',
          !!shopRoot && shopRoot.querySelectorAll('.rf-collection-h').length === 1);
        var cards = shopRoot.querySelectorAll('.rf-collect-card');
        ok('shop Collection renders at least one skin + one secret shark card',
          cards.length >= (RFD().SKINS || []).length + (RFD().SECRET_SHARKS || []).length);
        var ownedCard = null, lockedSecretCard = null;
        for (var cci = 0; cci < cards.length; cci++) {
          if (cards[cci].classList.contains('rf-collect-owned') && ownedCard === null) ownedCard = cards[cci];
          if (cards[cci].textContent.indexOf('???') >= 0 && lockedSecretCard === null) lockedSecretCard = cards[cci];
        }
        ok('an owned skin card is flagged rf-collect-owned',
          !!ownedCard && ownedCard.classList.contains('rf-collect-owned'));
        ok('an unmet secret shark renders as a silhouette (???) with a relic-set hint',
          !!lockedSecretCard && lockedSecretCard.textContent.indexOf('relic set') > 0);

        // B3 selftest coverage: gem-unlock button presence for a locked
        // secret shark with 0 relic sets -- the gems-only path must be
        // reachable regardless of relic progress (fix-lane F3 blocker 3).
        ok('a locked secret shark with 0 relic sets still shows the gem-unlock button',
          !!lockedSecretCard && lockedSecretCard.textContent.indexOf('(0/') > 0
          && !!lockedSecretCard.querySelector('.rf-collect-cost')
          && lockedSecretCard.disabled !== true);

        // B8 selftest coverage: owned skins get a Select/Selected toggle
        // reflecting profile.skins.selectedSkin, calling Meta.selectSkin and
        // refreshing card states after the action.
        ok('an owned skin card renders a Select toggle instead of being disabled',
          !!ownedCard && ownedCard.disabled !== true
          && !!ownedCard.querySelector('.rf-collect-select'));
        var shopGemNode = N('rfShop') && N('rfShop').querySelector ? N('rfShop').querySelector('#rfShopGems') : null;
        ok('shop gem stat reflects profile.gems', !!shopGemNode && shopGemNode.textContent === '7');

        // buySkin/unlockSecretSharkWithGems guarded when Meta is absent
        // (task 4: "guard if API absent").
        delete RF.Meta;
        var toastNoApi = 0;
        var savedToastTimer = toastTimer;
        doBuySkin('skin_magma_core');
        ok('doBuySkin does not throw with no RF.Meta', N('rfShopToast').textContent.indexOf('not available') >= 0);
        doUnlockSecretShark('banshee');
        ok('doUnlockSecretShark does not throw with no RF.Meta', N('rfShopToast').textContent.indexOf('not available') >= 0);
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

        // buySkin/unlockSecretSharkWithGems success + failure paths via a
        // minimal fake RF.Meta (mirrors the real meta.js signatures this
        // file calls: buySkin(kit,p,id) / unlockSecretSharkWithGems(kit,p,id)).
        var buySkinCalls = [], unlockCalls = [], selectCalls = [];
        RF.Meta = {
          buySkin: function (kit, p, id) {
            buySkinCalls.push(id);
            if (id === 'skin_fail') return { ok: false, reason: 'gems' };
            return { ok: true, skin: id, cost: 6 };
          },
          unlockSecretSharkWithGems: function (kit, p, id) {
            unlockCalls.push(id);
            return { ok: true, shark: id, cost: 20 };
          },
          selectSkin: function (kit, p, id) {
            selectCalls.push(id);
            if (p) p.skins.selectedSkin = id;
            return { ok: true, skin: id };
          }
        };
        doSelectSkin('skin_neon_riptide');
        ok('doSelectSkin calls Meta.selectSkin with the skin id',
          selectCalls.indexOf('skin_neon_riptide') >= 0);
        ok('doSelectSkin refreshes the shop so the newly-selected card shows Selected', (function () {
          var refreshedCards = N('rfShopList').querySelectorAll('.rf-collect-card');
          for (var i = 0; i < refreshedCards.length; i++) {
            var selNode = refreshedCards[i].querySelector('.rf-collect-selected');
            if (selNode && selNode.textContent === 'Selected'
              && refreshedCards[i].textContent.indexOf('Neon') >= 0) return true;
          }
          return false;
        })());
        doBuySkin('skin_neon_riptide');
        ok('doBuySkin calls Meta.buySkin with the skin id', buySkinCalls.indexOf('skin_neon_riptide') >= 0);
        doBuySkin('skin_fail');
        ok('doBuySkin surfaces a gems-shortfall toast on failure',
          N('rfShopToast').textContent === 'Not enough gems');
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
        doUnlockSecretShark('nullfin');
        ok('doUnlockSecretShark calls Meta.unlockSecretSharkWithGems with the shark id',
          unlockCalls.indexOf('nullfin') >= 0);
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

        RF.Meta = savedMeta;
        if (savedMeta === undefined) delete RF.Meta;
        S.profile = null;
      }());

      // ---- known-bug fixes (task 6) ----------------------------------
      (function knownBugsSelftestBlock() {
        // DEV chip / SHOP button overlap guard: the injected Rev 7
        // stylesheet must define the #rfDevChip layout guard (flex:0 0
        // auto + max-width), since index.html itself is orchestrator-owned
        // and this lane cannot edit its CSS directly.
        ok('Rev 7 stylesheet is injected', !!rev7StyleNode);
        ok('Rev 7 stylesheet guards #rfDevChip against the SHOP-button overlap',
          !!rev7StyleNode && String(rev7StyleNode.textContent).indexOf('#rfDevChip{flex:0 0 auto') >= 0);

        // Menu ON-badge stale-after-Shop-select fix: doSelect's own click
        // handler (which a focused <button>'s native Enter keypress also
        // fires -- the "desktop Enter path", no separate keydown listener
        // needed) must resync the roster's rf-card-sel + Owned/Selected
        // badge immediately, not only on the next full buildMenu().
        var savedMeta2 = RF.Meta;
        var selectCalls = [];
        RF.Meta = {
          select: function (p, id) { selectCalls.push(id); p.selected = id; return { ok: true, persisted: false }; },
          ownedFor: function (p, id) { return !!(p.sharks && p.sharks[id] && p.sharks[id].owned); },
          tierUnlocked: function () { return true; },
          activeShark: function (p) { return p.selected; },
          displayCoins: function (p) { return p.coins; }
        };
        var pSel = { coins: 0, level: 5, xp: 0, selected: 'reef', sharks: { reef: { owned: true }, mako: { owned: true } } };
        var savedRFD = window.RFD;
        window.RFD = {
          SHARKS: [
            { id: 'reef', name: 'Reef Shark', tier: 1, act: 1, cost: 0, stats: { speed: 1, bite: 1, hp: 1 } },
            { id: 'mako', name: 'Mako', tier: 1, act: 1, cost: 0, stats: { speed: 2, bite: 2, hp: 2 } }
          ],
          SHARK_BY_ID: {
            reef: { id: 'reef', name: 'Reef Shark', tier: 1, act: 1, cost: 0, stats: { speed: 1, bite: 1, hp: 1 } },
            mako: { id: 'mako', name: 'Mako', tier: 1, act: 1, cost: 0, stats: { speed: 2, bite: 2, hp: 2 } }
          }
        };
        showMenu({ profile: pSel });
        var reefCard = null, makoCard = null;
        var rosterCards = N('rfMenuRoster').querySelectorAll('.rf-card');
        for (var rci = 0; rci < rosterCards.length; rci++) {
          var rid = rosterCards[rci].getAttribute('data-shark');
          if (rid === 'reef') reefCard = rosterCards[rci];
          if (rid === 'mako') makoCard = rosterCards[rci];
        }
        ok('roster starts with reef selected', !!reefCard && reefCard.classList.contains('rf-card-sel') === true);
        S.shopPick = 'mako';
        doSelect('mako');
        ok('doSelect calls Meta.select with the new shark id', selectCalls.indexOf('mako') >= 0);
        ok('ON-badge resync: previously-selected card loses rf-card-sel without a full buildMenu()',
          !!reefCard && reefCard.classList.contains('rf-card-sel') === false);
        ok('ON-badge resync: newly-selected card gains rf-card-sel immediately',
          !!makoCard && makoCard.classList.contains('rf-card-sel') === true);
        var makoFoot = makoCard && makoCard.querySelector ? makoCard.querySelector('.rf-card-own') : null;
        ok('ON-badge resync: newly-selected card footer reads Selected, not stale Owned',
          !!makoFoot && makoFoot.textContent === 'Selected');
        window.RFD = savedRFD;
        RF.Meta = savedMeta2;
        if (savedMeta2 === undefined) delete RF.Meta;
      }());

      // ---- Rev 12: Level Select, class badges, v3 save --------------
      (function () {
        var m = window.RF && window.RF.Meta;
        var rfd = window.RFD;
        if (!m || !rfd || !Array.isArray(rfd.LEVELS) || !rfd.LEVELS.length) {
          // Data/meta lanes not loaded in this selftest invocation (this
          // file's ui suite can run standalone without meta.js/data.js in
          // some harness modes) -- skip rather than false-failing.
          return;
        }
        var pLv = m.defaultProfile();
        showMenu({ profile: pLv });
        N('rfDive').fire('click');
        ok('DIVE from Menu opens Level Select', S.screen === 'levelSelect');
        var grid = el('rfLevelSelectGrid');
        var cards = grid && grid.querySelectorAll ? grid.querySelectorAll('.rf-level-card') : [];
        ok('Level Select renders one card per RFD.LEVELS entry (12)',
          cards.length === rfd.LEVELS.length && cards.length === 12);

        var firstId = m.firstLevelId();
        var firstCard = null, secondCard = null;
        var secondId = rfd.LEVELS[1] && rfd.LEVELS[1].id;
        for (var ci = 0; ci < cards.length; ci++) {
          var lid = cards[ci].getAttribute('data-level');
          if (lid === firstId) firstCard = cards[ci];
          if (lid === secondId) secondCard = cards[ci];
        }
        ok('the starter level card is selected/highlighted',
          !!firstCard && firstCard.classList.contains('rf-level-sel') === true);
        ok('the starter level card shows no lock overlay',
          !!firstCard && firstCard.querySelector('.rf-level-lock') === null);
        ok('a second level card shows a lock overlay (unlock cost/state)',
          !!secondCard && secondCard.querySelector('.rf-level-lock') !== null);

        // Unlock via the card's own click path (doUnlockLevel), then it
        // should render unlocked with no lock overlay on rebuild.
        pLv.coins = 1e9;
        if (secondCard) secondCard.fire('click');
        var grid2 = el('rfLevelSelectGrid');
        var cards2 = grid2 && grid2.querySelectorAll ? grid2.querySelectorAll('.rf-level-card') : [];
        var secondCard2 = null;
        for (var ci2 = 0; ci2 < cards2.length; ci2++) {
          if (cards2[ci2].getAttribute('data-level') === secondId) secondCard2 = cards2[ci2];
        }
        ok('unlocking a level from its card clears the lock overlay on rebuild',
          !!secondCard2 && secondCard2.querySelector('.rf-level-lock') === null);
        ok('unlocking persists on the profile', pLv.levels[secondId].unlocked === true);

        // Selecting the now-unlocked card should move the highlight + DIVE
        // should start with that level selected.
        if (secondCard2) secondCard2.fire('click');
        ok('selecting an unlocked level updates profile.selectedLevel', pLv.selectedLevel === secondId);

        // Class badges: reef (common), a legend (legendary/epic), Sharkjira.
        // The selftest DOM stub's querySelector only supports #id/.class
        // (see matchesSel above), not attribute selectors, so this walks
        // the roster cards by data-shark like the ON-badge test above does.
        showMenu({ profile: pLv });
        var rosterRoot = N('rfMenuRoster');
        var rosterAllCards = rosterRoot && rosterRoot.querySelectorAll
          ? rosterRoot.querySelectorAll('.rf-card') : [];
        var reefBadgeCard = null;
        for (var rbi = 0; rbi < rosterAllCards.length; rbi++) {
          if (rosterAllCards[rbi].getAttribute('data-shark') === 'reef') { reefBadgeCard = rosterAllCards[rbi]; break; }
        }
        var reefBadge = reefBadgeCard && reefBadgeCard.querySelector
          ? reefBadgeCard.querySelector('.rf-class-badge') : null;
        ok('reef (common class) shows a class badge on its roster card',
          !!reefBadge && reefBadge.textContent === 'COMMON');
        var jiraDef = null;
        for (var sdi = 0; sdi < rfd.SHARKS.length; sdi++) {
          if (rfd.SHARKS[sdi].id === 'leviathanrex') jiraDef = rfd.SHARKS[sdi];
        }
        ok('Sharkjira renders its data-driven name', !jiraDef || jiraDef.name === 'Sharkjira');
        if (jiraDef && jiraDef.cls) {
          ok('Sharkjira has a recognised class badge label',
            !!CLASS_LABEL[jiraDef.cls]);
        }

        // v3 migration fixture: an old v2 save round-trips through load()
        // with a valid, unlocked levels object.
        var v2Fixture = {
          v: 2, coins: 100, xp: 0, level: 1, selected: 'reef',
          sharks: { reef: { owned: true, up: { bite: 0, speed: 0, boost: 0, power: 0 } } },
          best: { score: 0, biggestTier: 0 }, runs: 0, tutorialDone: false, lastBonusDay: null,
          gems: 0, relics: {}, skins: { owned: [], selectedSkin: null },
          missions: { active: [], progress: {}, completed: {} }
        };
        var kitFixture = {
          save: (function () {
            var raw = null;
            return { get: function () { return raw; }, set: function (v) { raw = v; } };
          }())
        };
        kitFixture.save.set(v2Fixture);
        var migrated = m.load(kitFixture);
        ok('v2->v3 migration fixture produces a valid levels object',
          migrated.v === m.SAVE_VERSION && !!migrated.levels && !!migrated.selectedLevel);
        ok('v2->v3 migration fixture unlocks the starter level',
          migrated.levels[migrated.selectedLevel].unlocked === true);
      }());

      // ---- thumbnail bake cache rev token (task 5) -------------------
      ok('thumb cache key function exists and is rev-scoped', typeof tk === 'function'
        && tk('x').indexOf('rev7:') === 0);
      ok('THUMB_CACHE_REV matches the rev token documented in the plan (L1 rig rebuild)',
        THUMB_CACHE_REV === 'rev7');

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

      // Rev 12 (12.1): Menu's DIVE now opens Level Select first (Menu ->
      // Level cards -> DIVE); the level-select screen's own DIVE button is
      // what reaches the dive callback. AGAIN (post-run) is unaffected --
      // it still dives straight back in.
      N('rfDive').fire('click');
      ok('menu DIVE opens level select, does not dive directly', dived === 0 && S.screen === 'levelSelect');
      var lsDive = levelSelectNode && levelSelectNode.querySelector
        ? levelSelectNode.querySelector('#rfLevelSelectDive') : null;
      if (lsDive) lsDive.fire('click');
      ok('level select DIVE reaches the dive callback', dived === 1);
      N('rfResAgain').fire('click');
      ok('again reuses dive callback', dived === 2);

      onDive(null);
      var threw2 = false;
      try { if (lsDive) lsDive.fire('click'); } catch (e) { threw2 = true; }
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
      var lsDive2 = levelSelectNode && levelSelectNode.querySelector
        ? levelSelectNode.querySelector('#rfLevelSelectDive') : null;
      if (lsDive2) lsDive2.fire('click');
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
      // Fix-round 3: force dev inactive for this legacy block regardless of
      // the host page's real ?unlockall=1/DevMode state, since runStarted()
      // now legitimately queues a one-shot 'DEV MODE' toast when dev IS
      // active (see the dedicated DEV toast block above) and that would
      // otherwise make this assertion query-string-dependent.
      var savedDevModeRunBlock = RF.DevMode;
      RF.DevMode = { state: { active: false } };
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
      hudState({ hp: 5, maxHp: 10 });
      runEnded({ save: { coins: 2 } });
      ok('runEnded resets diff baseline', S.lastHud === null);
      ok('runEnded adopts ctx', S.ctx && S.ctx.save.coins === 2);
      ok('runStarted tolerates no ctx', runStarted() === true);
      ok('runEnded tolerates no ctx', runEnded() === true);
      RF.DevMode = savedDevModeRunBlock;

      // ---- 6.4 minimap: guarded on RF.World availability --------------
      var savedWorld = RF.World;
      delete RF.World;
      runStarted({ save: { coins: 1 } });
      ok('minimap hidden with no RF.World', N('rfMinimapWrap').classList.contains('rf-on') !== true);
      RF.World = {
        regionAt: function () { return 1; },
        terrainSDF: function (x, y) { return (Math.abs(x) < 6000 && Math.abs(y) < 2000) ? 40 : -40; }
      };
      runStarted({ save: { coins: 1 } });
      ok('minimap shown when RF.World exposes terrainSDF/regionAt',
        N('rfMinimapWrap').classList.contains('rf-on') === true);
      hudState({ px: 100, py: -200 });
      ok('minimap dot shown once px/py are finite', N('rfMinimapDot').classList.contains('rf-on') === true);
      hudState({ px: undefined, py: undefined });
      RF.World = savedWorld;
      runEnded({ save: { coins: 1 } });

      // hpFrac is trusted when the engine supplies it (and still wins over
      // raw hp/maxHp when hungerFrac has not been sent this push).
      showHud();
      hudState({ hp: 999, maxHp: 10, hpFrac: 0.25 });
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
      hudState({ chips: queue });
      ok('chip queue drained by one', queue.length === 2);
      ok('chip shows the head', N('rfChip').textContent === 'x3');
      hudState({ chips: queue });
      ok('chip queue drains again', queue.length === 1 && N('rfChip').textContent === 'FRENZY');
      hudState({ chips: [] });
      ok('empty queue does not throw', true);
      if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }

      // The reused HUD_STATE must never be retained. name/coins are no
      // longer in HUD_FIELDS (6.11 + code review MAJOR 5: out of the in-run
      // HUD), so this now exercises the fields that ARE still copied: hp/
      // maxHp/score.
      var reused = { hp: 1, maxHp: 2, score: 5, chips: null };
      hudState(reused);
      reused.hp = 999; reused.score = 9999;
      ok('hudState retains no reference to the pushed object',
        S.lastHud !== reused && S.lastHud.hp === 1 && S.lastHud.score === 5);

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

      // ---- Pantheon/Underworld: ACT_NAMES + dynamic shop/roster acts ----
      ok('ACT_NAMES has all 5 acts named', Object.keys(ACT_NAMES).length === 5
        && ACT_NAMES[4] === 'Pantheon' && ACT_NAMES[5] === 'Underworld');
      var rosterHas85 = allSharks().length === 86;
      ok('roster carries all 86 sharks (62 base + 24 Pantheon/Underworld)', rosterHas85);
      var actTestProfile = { coins: 0, level: 12, xp: 0, selected: 'reef', sharks: {} };
      showShop({ profile: actTestProfile });
      var shopRoot = N('rfShopList');
      var shopAllSecs = shopRoot ? shopRoot.querySelectorAll('.rf-shop-act') : [];
      // Exclude the trailing Collection section (also class rf-shop-act) --
      // only the per-act sections should number 5.
      var shopHeaders = [];
      var shopActSecCount = 0;
      for (var shi = 0; shi < shopAllSecs.length; shi++) {
        var hh = shopAllSecs[shi].querySelector('.rf-shop-act-h');
        if (!hh || hh.classList.contains('rf-collection-h')) continue;
        shopActSecCount++;
        shopHeaders.push(hh.textContent);
      }
      ok('shop renders one section per act present in the roster (5, not hardcoded 3)',
        rosterHas85 && shopActSecCount === 5);
      ok('shop act headers include Pantheon and Underworld',
        shopHeaders.indexOf('Pantheon') >= 0 && shopHeaders.indexOf('Underworld') >= 0);

    } finally {
      if (S.chipTimer) { clearTimeout(S.chipTimer); S.chipTimer = null; }
      if (S.tutTimer) { clearTimeout(S.tutTimer); S.tutTimer = null; }
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      if (toastCooldownTimer) { clearTimeout(toastCooldownTimer); toastCooldownTimer = null; }
      if (S.bakeTimer && typeof window.clearTimeout === 'function') { try { window.clearTimeout(S.bakeTimer); } catch (eBT2) {} }
      doc = saved.doc;
      S.ctx = saved.ctx; S.profile = saved.profile; S.thumbs = saved.thumbs;
      S.screen = saved.screen; S.lastHud = saved.lastHud; S.nodes = saved.nodes;
      hudWriteBuffer = saved.hudWriteBuffer;
      S.bound = saved.bound; S.menuPick = saved.menuPick; S.shopPick = saved.shopPick;
      S.inited = saved.inited; S.handles = saved.handles;
      CB.dive = saved.dive; CB.power = saved.power; CB.shopNav = saved.shopNav;
      frenzyStyleNode = saved.frenzyStyle; activeFrenzyCue = saved.frenzyCue;
      toastQueue = saved.toastQueue; toastCooldownUntil = saved.toastCooldownUntil;
      toastCooldownTimer = saved.toastCooldownTimer;
      S.bakeQueue = saved.bakeQueue; S.bakeQueued = saved.bakeQueued; S.bakeVisible = saved.bakeVisible;
      S.bakeBytes = saved.bakeBytes; S.bakeTimer = saved.bakeTimer; S.bakeDisabled = saved.bakeDisabled;
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
    queueToast: queueToast,
    frenzyCue: frenzyCue,
    tutorial: tutorial,
    toast: toast,
    get screen() { return S.screen; },
    __selftest: __selftest
  };
}());
