// hm2_ui.js - menu layout engine for Horde Meridian 2. ES5, no deps on game.js.
// Loads after hm_data.js (may read window.__HM_DATA for TYPE/LINE/fonts) and
// before game.js. Exposes window.__HM2_UI.
(function () {
  'use strict';

  var D = window.__HM_DATA || {};
  var TYPE = D.TYPE || { hero: 44, title: 32, head: 24, sub: 18, body: 15, label: 13, micro: 12 };
  var LINE = D.LINE || 1.3;
  var FONT_DISPLAY = D.FONT_DISPLAY || '"HM Display", "Chakra Petch", "Trebuchet MS", system-ui, sans-serif';
  var FONT_BODY = D.FONT_BODY || '"HM Body", "Inter", system-ui, sans-serif';

  var _measureCache = {};
  var _measureCtx = null;
  function measureCtx() {
    if (_measureCtx) return _measureCtx;
    try {
      var c = document.createElement('canvas');
      _measureCtx = c.getContext('2d');
    } catch (e) { _measureCtx = null; }
    return _measureCtx;
  }

  function fontShorthand(style) {
    style = style || {};
    var size = (style.fontSize || TYPE.body) + 'px';
    var family = style.fontFamily || FONT_BODY;
    var weight = style.fontStyle && /bold/i.test(style.fontStyle) ? 'bold ' : '';
    var italic = style.fontStyle && /italic/i.test(style.fontStyle) ? 'italic ' : '';
    return italic + weight + size + ' ' + family;
  }

  function measureWidth(scene, str, style) {
    var font = fontShorthand(style);
    var key = font + '' + str;
    if (Object.prototype.hasOwnProperty.call(_measureCache, key)) return _measureCache[key];
    var w = 0;
    var ctx = measureCtx();
    if (ctx) {
      ctx.font = font;
      w = ctx.measureText(str).width;
    } else if (scene && scene.add && scene.add.text) {
      var t = scene.add.text(0, 0, str, style);
      w = t.width;
      t.destroy();
    } else {
      w = str.length * (parseInt(style.fontSize, 10) || 14) * 0.55;
    }
    _measureCache[key] = w;
    return w;
  }

  function hardBreakWord(scene, word, style, maxWidth) {
    // Break a single overlong word mid-word into chunks that fit maxWidth.
    var out = [];
    var cur = '';
    for (var i = 0; i < word.length; i++) {
      var next = cur + word[i];
      if (measureWidth(scene, next, style) > maxWidth && cur.length > 0) {
        out.push(cur);
        cur = word[i];
      } else {
        cur = next;
      }
    }
    if (cur.length) out.push(cur);
    return out.length ? out : [word];
  }

  function ellipsise(scene, str, style, maxWidth) {
    if (measureWidth(scene, str, style) <= maxWidth) return str;
    var s = str;
    while (s.length > 0 && measureWidth(scene, s + '…', style) > maxWidth) {
      s = s.slice(0, -1);
    }
    return s + '…';
  }

  // Wrap `str` to at most `maxLines` lines of `maxWidth`. If the content does
  // not fit, the LAST line is ellipsised so the truncation is visible.
  //
  // The overflow flag is tracked explicitly as words are consumed rather than
  // inferred by comparing character counts afterwards. The character-count
  // heuristic silently dropped trailing words whenever the placed text was
  // coincidentally as long as the source: "GEM REFINERY" rendered as "GEM" and
  // "FIELD MAGNET" as "FIELD", which is worse than clipping because the label
  // still looks like a real, and wrong, name.
  // Always append the ellipsis, trimming characters until it fits. Used when we
  // KNOW content was dropped, where plain ellipsise() would be a no-op because
  // the surviving line already fits on its own.
  function forceEllipsise(scene, str, style, maxWidth) {
    var s = str;
    while (s.length > 0 && measureWidth(scene, s + '…', style) > maxWidth) {
      s = s.slice(0, -1);
    }
    return s.replace(/\s+$/, '') + '…';
  }

  function wrapText(scene, str, style, maxWidth, maxLines) {
    if (str == null) return [];
    str = String(str);
    maxWidth = maxWidth || 100;
    maxLines = maxLines || 1;
    style = style || {};
    if (maxWidth <= 0 || maxLines <= 0) return [];

    var words = str.split(/\s+/).filter(function (w) { return w.length > 0; });
    if (!words.length) return [];

    var lines = [];
    var cur = '';
    var consumed = 0;          // words fully placed
    var truncated = false;     // a hard-broken word lost part of itself

    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var candidate = cur.length ? (cur + ' ' + word) : word;
      if (measureWidth(scene, candidate, style) <= maxWidth) {
        cur = candidate;
        consumed = i + 1;
        continue;
      }
      // The candidate is too wide, so the current line is finished.
      if (cur.length) {
        lines.push(cur);
        cur = '';
        if (lines.length >= maxLines) break;
      }
      if (measureWidth(scene, word, style) <= maxWidth) {
        cur = word;
        consumed = i + 1;
        continue;
      }
      // A single word wider than the line: break it across the remaining lines.
      var chunks = hardBreakWord(scene, word, style, maxWidth);
      var ci = 0;
      for (; ci < chunks.length; ci++) {
        if (cur.length) {
          lines.push(cur);
          cur = '';
          if (lines.length >= maxLines) break;
        }
        cur = chunks[ci];
      }
      if (ci < chunks.length - 1 || lines.length >= maxLines) {
        // Some chunks of this word never made it onto a line.
        if (ci < chunks.length - 1) truncated = true;
      }
      if (lines.length >= maxLines) break;
      consumed = i + 1;
    }
    if (lines.length < maxLines && cur.length) lines.push(cur);

    lines = lines.slice(0, maxLines);
    if (!lines.length) return [];

    var overflow = truncated || consumed < words.length;
    if (overflow) {
      var lastIdx = lines.length - 1;
      lines[lastIdx] = forceEllipsise(scene, lines[lastIdx], style, maxWidth);
    }
    return lines;
  }

  function layoutColumn(opts) {
    opts = opts || {};
    var top = opts.top || 0, bottom = opts.bottom || 0;
    var count = Math.max(0, opts.count || 0);
    var gap = opts.gap != null ? opts.gap : 6;
    var min = opts.min != null ? opts.min : 24;
    var max = opts.max != null ? opts.max : 200;
    if (count <= 0) return { h: min, ys: [], overflow: false };

    var avail = bottom - top;
    var h = (avail - gap * (count - 1)) / count;
    var overflow = false;
    if (h < min) { h = min; overflow = true; }
    if (h > max) h = max;

    var ys = [];
    var totalH = count * h + gap * (count - 1);
    var startY = top + h / 2;
    if (!overflow) {
      // Center the block if it's smaller than available space isn't required;
      // just lay out from top sequentially.
      for (var i = 0; i < count; i++) ys.push(top + h / 2 + i * (h + gap));
    } else {
      for (var j = 0; j < count; j++) ys.push(startY + j * (h + gap));
    }
    return { h: h, ys: ys, overflow: overflow };
  }

  function safeContainer(scene, x, y) {
    if (!scene || !scene.add || !scene.add.container) return null;
    return scene.add.container(x || 0, y || 0);
  }

  function card(scene, opts) {
    opts = opts || {};
    if (!scene || !scene.add) return null;
    var x = opts.x || 0, y = opts.y || 0, w = opts.w || 140, h = opts.h || 60;
    var c = safeContainer(scene, x, y);
    if (!c) return null;

    var bg = null;
    try {
      if (scene.add.image && scene.textures && scene.textures.exists && scene.textures.exists('atlas')) {
        bg = scene.add.image(0, 0, 'atlas', opts.selected ? 'card_hot' : 'card').setDisplaySize(w, h);
      }
    } catch (e) { bg = null; }
    if (!bg) bg = scene.add.rectangle(0, 0, w, h, 0x14222c, 1);
    c.add(bg);
    if (opts.dim) bg.setAlpha(0.55);

    var leftEdge = -w / 2;
    var textLeft = leftEdge + 10;
    var icon = null;
    if (opts.icon) {
      try {
        icon = scene.add.image(leftEdge + 18, 0, 'atlas', opts.icon).setScale(0.42);
        if (opts.iconColor != null) icon.setTint(opts.iconColor);
        c.add(icon);
        textLeft = leftEdge + 36;
      } catch (e) { icon = null; }
    }

    var titleStyle = { fontFamily: FONT_DISPLAY, fontSize: TYPE.label, fontStyle: 'bold' };
    var valueW = 0;
    var valueText = null;
    if (opts.value != null && opts.value !== '') {
      var vw = w / 2 - 9 - textLeft;
      var valStr = ellipsise(scene, String(opts.value), titleStyle, Math.max(20, vw * 0.6));
      valueText = scene.add.text(w / 2 - 9, -(h / 2) + 15, valStr,
        { fontFamily: FONT_DISPLAY, fontSize: TYPE.label + 'px', fontStyle: 'bold', color: '#ffd67a' });
      valueText.setOrigin(1, 0.5);
      c.add(valueText);
      valueW = valueText.width + 6;
    }

    var titleMaxW = Math.max(10, (w / 2 - 9 - valueW) - textLeft);
    var titleStr = opts.title != null ? String(opts.title) : '';
    var titleFit = wrapText(scene, titleStr, titleStyle, titleMaxW, 1)[0] || '';
    var titleText = scene.add.text(textLeft, -(h / 2) + 15, titleFit,
      { fontFamily: FONT_DISPLAY, fontSize: TYPE.label + 'px', fontStyle: 'bold', color: '#d8f5ff' });
    titleText.setOrigin(0, 0.5);
    c.add(titleText);

    if (opts.lines && opts.lines.length) {
      var bodyStyle = { fontFamily: FONT_BODY, fontSize: TYPE.micro };
      var bodyMaxW = Math.max(10, (w / 2 - 9) - textLeft);
      var joined = opts.lines.join(' ');
      var wrapped = wrapText(scene, joined, bodyStyle, bodyMaxW, 2);
      var lineH = TYPE.micro * LINE;
      var startY = 4;
      for (var li = 0; li < wrapped.length; li++) {
        var lt = scene.add.text(textLeft, startY + li * lineH, wrapped[li],
          { fontFamily: FONT_BODY, fontSize: TYPE.micro + 'px', color: '#8fb3c4' });
        lt.setOrigin(0, 0.5);
        c.add(lt);
      }
    }

    if (opts.selected) { try { bg.setTint ? bg.setTint(0x8effd8) : null; } catch (e) {} }

    c.bg = bg;
    c.titleText = titleText;
    c.valueText = valueText;
    c.icon = icon;

    if (opts.onTap && bg.setInteractive) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', opts.onTap);
    }
    return c;
  }

  function tabBar(scene, opts) {
    opts = opts || {};
    if (!scene || !scene.add) return null;
    var x = opts.x || 0, y = opts.y || 0, w = opts.w || 300;
    var tabs = opts.tabs || [];
    var n = Math.max(1, tabs.length);
    var tabW = w / n;
    var c = safeContainer(scene, x, y);
    if (!c) return null;

    var entries = [];
    var active = opts.active;

    function build() {
      for (var i = 0; i < tabs.length; i++) {
        (function (tab, i) {
          var tx = -w / 2 + tabW / 2 + i * tabW;
          var isActive = tab.key === active;
          var bg = null;
          try {
            if (scene.textures && scene.textures.exists && scene.textures.exists('atlas')) {
              bg = scene.add.image(tx, 0, 'atlas', isActive ? 'btn_hot' : 'btn').setDisplaySize(tabW - 3, 34);
            }
          } catch (e) { bg = null; }
          if (!bg) bg = scene.add.rectangle(tx, 0, tabW - 3, 34, isActive ? 0x1c3f45 : 0x14222c, 1);
          var style = { fontFamily: FONT_DISPLAY, fontSize: TYPE.label, fontStyle: 'bold' };
          var label = wrapText(scene, tab.label, style, tabW - 9, 1)[0] || '';
          var txt = scene.add.text(tx, 0, label,
            { fontFamily: FONT_DISPLAY, fontSize: TYPE.label + 'px', fontStyle: 'bold',
              color: isActive ? '#8effd8' : '#8fb3c4' });
          txt.setOrigin(0.5);
          c.add([bg, txt]);
          if (bg.setInteractive) {
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerdown', function () {
              active = tab.key;
              if (opts.onSelect) opts.onSelect(tab.key);
              refresh();
            });
          }
          entries.push({ key: tab.key, bg: bg, txt: txt });
        }(tabs[i], i));
      }
    }

    function refresh() {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var isActive = e.key === active;
        e.txt.setColor(isActive ? '#8effd8' : '#8fb3c4');
        if (e.bg.setFrame) e.bg.setFrame(isActive ? 'btn_hot' : 'btn');
        else e.bg.setFillStyle ? e.bg.setFillStyle(isActive ? 0x1c3f45 : 0x14222c) : null;
      }
    }

    build();
    c.setActive = function (key) {
      active = key;
      refresh();
    };
    return c;
  }

  window.__HM2_UI = {
    wrapText: wrapText,
    layoutColumn: layoutColumn,
    card: card,
    tabBar: tabBar,
    // Callers sizing a column against real glyph widths need this.
    measureWidth: measureWidth,
    _measureWidth: measureWidth
  };
}());
