(function () {
  'use strict';

  var DATA = window.__HM_DATA || {};
  var TYPE = DATA.TYPE || {};
  var SAFE = DATA.SAFE || {};
  var FONT_DISPLAY = DATA.FONT_DISPLAY || 'sans-serif';
  var FONT_BODY = DATA.FONT_BODY || 'sans-serif';
  var SIZE = {
    head: TYPE.head || 22,
    sub: TYPE.sub || 17,
    body: TYPE.body || 14,
    label: TYPE.label || 12.5,
    micro: TYPE.micro || 11
  };

  function clamp(value, low, high) {
    return value < low ? low : (value > high ? high : value);
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\u2014/g, '-');
  }

  function upper(value) {
    return clean(value).toUpperCase();
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function formatTime(value) {
    var seconds = Math.max(0, Math.floor(Number(value) || 0));
    return pad2(Math.floor(seconds / 60)) + ':' + pad2(seconds % 60);
  }

  function cssColor(value) {
    var hex = Math.max(0, Number(value) || 0).toString(16);
    return '#' + ('000000' + hex).slice(-6);
  }

  function regionFor(level) {
    var regions = DATA.REGIONS || [];
    var key = level && level.region;
    var i;
    for (i = 0; i < regions.length; i++) {
      if (regions[i].key === key) return regions[i];
    }
    return regions[0] || {
      key: '', code: '---', name: 'UNKNOWN SECTOR',
      palette: { border: 0x54d6ff, mid: 0x1f7180 }
    };
  }

  function addText(scene, group, x, y, value, size, color, face, originX, maxWidth) {
    var px = Math.max(SIZE.micro, size || SIZE.body);
    var text = scene.add.text(x, y, clean(value), {
      fontFamily: face === 'body' ? FONT_BODY : FONT_DISPLAY,
      fontSize: px + 'px',
      color: color || '#e7fff7',
      fontStyle: face === 'body' ? 'normal' : 'bold',
      align: 'left',
      lineSpacing: Math.round(px * 0.35)
    }).setOrigin(originX == null ? 0 : originX, 0.5);
    if (maxWidth && text.width > maxWidth) text.setScale(maxWidth / text.width);
    group.add(text);
    return text;
  }

  function addCenteredText(scene, x, y, value, size, color, face) {
    return scene.add.text(x, y, clean(value), {
      fontFamily: face === 'body' ? FONT_BODY : FONT_DISPLAY,
      fontSize: Math.max(SIZE.micro, size || SIZE.body) + 'px',
      color: color || '#e7fff7',
      fontStyle: face === 'body' ? 'normal' : 'bold',
      align: 'center'
    }).setOrigin(0.5);
  }

  function playSelect(campaign) {
    if (campaign && typeof campaign.sfx === 'function') campaign.sfx('select');
  }

  function makeButton(scene, campaign, x, y, width, height, label, primary, onTap) {
    var container = scene.add.container(x, y);
    var frame = primary ? 'btn_hot' : 'btn';
    var glow = scene.add.image(0, 0, 'disc')
      .setDisplaySize(width * 1.08, height * 1.85)
      .setTint(primary ? 0x8effd8 : 0x4b6c7e)
      .setAlpha(primary ? 0.16 : 0.08)
      .setBlendMode(Phaser.BlendModes.ADD);
    var background = scene.add.image(0, 0, 'atlas', frame).setDisplaySize(width, height);
    var text = addCenteredText(scene, 0, 0, label, primary ? SIZE.sub : SIZE.body,
      primary ? '#dcfff2' : '#b9d6e2');
    container.add([glow, background, text]);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', function () {
      background.setFrame(primary ? 'btn_hot' : 'btn');
      background.setTint(0xdfffff);
    });
    background.on('pointerout', function () {
      background.clearTint();
      background.setFrame(frame);
    });
    background.on('pointerup', function () {
      background.clearTint();
      background.setFrame(frame);
    });
    background.on('pointerdown', function () {
      playSelect(campaign);
      background.setFrame('btn_press');
      if (onTap) onTap();
    });
    container.hitTarget = background;
    return container;
  }

  function drawBackdrop(scene, width, height) {
    var graphics = scene.add.graphics().setDepth(-10);
    var i;
    for (i = 0; i < 36; i++) {
      var f = i / 35;
      graphics.fillStyle((Math.floor(5 + f * 8) << 16) |
        (Math.floor(12 + (1 - f) * 22) << 8) | Math.floor(24 + (1 - f) * 26), 1);
      graphics.fillRect(0, height * f, width, height / 35 + 1);
    }
    scene.add.image(width / 2, height * 0.94, 'disc')
      .setDisplaySize(width * 1.8, height * 0.8)
      .setTint(0x1d6fa0).setAlpha(0.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-9);
  }

  function addStars(scene, group, x, y, earned, color) {
    var count = clamp(Math.floor(Number(earned) || 0), 0, 3);
    var i;
    for (i = 0; i < 3; i++) {
      var star = scene.add.text(x + i * 13, y, i < count ? '★' : '☆', {
        fontFamily: FONT_DISPLAY,
        fontSize: '13px',
        color: i < count ? '#ffd67a' : '#536b78',
        fontStyle: 'bold'
      }).setOrigin(0, 0.5);
      group.add(star);
    }
  }

  function levelById(levels, id) {
    var i;
    for (i = 0; i < levels.length; i++) {
      if (levels[i] && levels[i].id === id) return levels[i];
    }
    return null;
  }

  function firstUnlocked(levels) {
    var i;
    for (i = 0; i < levels.length; i++) {
      if (levels[i] && levels[i].unlocked) return levels[i].id;
    }
    return null;
  }

  function createScene() {
    var scene = this;
    var width = this.scale.width;
    var height = this.scale.height;
    var safeTop = Number(SAFE.top) || 0;
    var safeRight = Number(SAFE.right) || 0;
    var safeBottom = Number(SAFE.bottom) || 0;
    var safeLeft = Number(SAFE.left) || 0;
    var campaign = window.__HM_CAMPAIGN;

    drawBackdrop(scene, width, height);

    function backToTitle() {
      scene.scene.start('title');
    }

    var center = (safeLeft + width - safeRight) / 2;
    var backButton = makeButton(scene, campaign, center,
      height - safeBottom - 28, Math.min(118, width * 0.34), 40, 'BACK', false,
      backToTitle);

    if (!campaign) {
      if (scene.input && scene.input.keyboard) {
        scene.input.keyboard.on('keydown-ESC', backToTitle);
      }
      return;
    }

    var levels = [];
    try {
      levels = typeof campaign.levels === 'function' ? campaign.levels() : [];
    } catch (e) {
      levels = [];
    }
    if (!Array.isArray(levels)) levels = [];

    var headerRight = width - safeRight - 12;
    var headerTop = safeTop + 12;
    var header = scene.add.image(center, headerTop + 34, 'atlas', 'panel_deep')
      .setDisplaySize(Math.max(200, width - safeLeft - safeRight - 16), 70)
      .setAlpha(0.82);
    header.setDepth(1);
    var title = addCenteredText(scene, safeLeft + 24, headerTop + 22, 'MISSION SELECT',
      SIZE.head, '#c9ffe9');
    title.setOrigin(0, 0.5);
    title.setDepth(2);
    var total = 0;
    try { total = Math.floor(Number(campaign.totalStars()) || 0); } catch (e2) { total = 0; }
    total = clamp(total, 0, 27);
    var totalText = scene.add.text(headerRight, headerTop + 53, 'TOTAL STARS ' + total + '/27', {
      fontFamily: FONT_DISPLAY,
      fontSize: SIZE.label + 'px',
      color: '#ffd67a',
      fontStyle: 'bold',
      align: 'right'
    }).setOrigin(1, 0.5).setDepth(2);
    var subtitle = addCenteredText(scene, safeLeft + 24, headerTop + 53,
      'MERIDIAN CAMPAIGN // 9 MISSIONS', SIZE.micro, '#7fa3b5', 'body');
    subtitle.setOrigin(0, 0.5);
    subtitle.setDepth(2);

    var launchY = height - safeBottom - 79;
    var viewTop = headerTop + 78;
    var viewBottom = launchY - 29;
    if (viewBottom < viewTop + 100) viewBottom = viewTop + 100;
    var viewLeft = safeLeft + 12;
    var viewWidth = Math.max(180, width - safeLeft - safeRight - 24);
    var cardWidth = viewWidth;
    var divider = scene.add.image(center, viewTop - 8, 'edge')
      .setDisplaySize(viewWidth, 2).setTint(0x54d6ff).setAlpha(0.42).setDepth(3);
    var maskShape = scene.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(viewLeft, viewTop, viewWidth, viewBottom - viewTop);
    var listMask = maskShape.createGeometryMask();
    scene.events.once('shutdown', function () {
      try { listMask.destroy(); } catch (e) {}
      try { maskShape.destroy(); } catch (e2) {}
    });
    var state = {
      selectedId: firstUnlocked(levels),
      scroll: 0,
      maxScroll: 0,
      dragging: false,
      moved: false,
      pointerId: -1,
      startY: 0,
      lastY: 0,
      cardId: null
    };
    var listGroup = null;
    var launchButton = null;

    function setScroll(value) {
      state.scroll = clamp(value, -state.maxScroll, 0);
      if (listGroup) listGroup.y = state.scroll;
    }

    function beginDrag(pointer, id) {
      if (!pointer || pointer.y < viewTop || pointer.y > viewBottom) return;
      state.dragging = true;
      state.moved = false;
      state.pointerId = pointer.id;
      state.startY = pointer.y;
      state.lastY = pointer.y;
      state.cardId = id == null ? null : id;
    }

    function finishDrag(pointer) {
      if (!state.dragging || !pointer || pointer.id !== state.pointerId) return;
      var id = state.cardId;
      var shouldSelect = !state.moved && id != null;
      state.dragging = false;
      state.pointerId = -1;
      state.cardId = null;
      if (shouldSelect) {
        var picked = levelById(levels, id);
        if (picked && picked.unlocked) {
          playSelect(campaign);
          if (state.selectedId !== picked.id) {
            state.selectedId = picked.id;
            renderCards();
          }
        }
      }
    }

    function addCard(level, index, y, selected) {
      var region = regionFor(level);
      var palette = region.palette || {};
      var accent = palette.border || 0x54d6ff;
      var cardHeight = selected ? 188 : 108;
      var card = scene.add.container(center, y);
      var glow = scene.add.image(0, 0, 'disc')
        .setDisplaySize(cardWidth * 1.06, cardHeight * 1.35)
        .setTint(accent).setAlpha(selected ? 0.12 : 0.035)
        .setBlendMode(Phaser.BlendModes.ADD);
      var background = scene.add.image(0, 0, 'atlas', selected ? 'card_hot' : 'card')
        .setDisplaySize(cardWidth, cardHeight);
      var accentBar = scene.add.rectangle(-cardWidth / 2 + 7, 0, 4, cardHeight - 12,
        accent, 0.95);
      card.add([glow, background, accentBar]);

      var left = -cardWidth / 2 + 20;
      var mainLeft = -cardWidth / 2 + 52;
      var right = cardWidth / 2 - 16;
      var top = -cardHeight / 2;
      var regionName = upper(region.name || 'UNKNOWN SECTOR');
      var regionCode = upper(region.code || '---');
      addText(scene, card, left, top + 17,
        'MISSION ' + pad2(Number(level && level.id) || index + 1), SIZE.micro,
        '#8fb3c4', 'display', 0);
      addText(scene, card, right, top + 17, regionCode, SIZE.micro,
        cssColor(accent), 'display', 1);
      addText(scene, card, mainLeft, top + 38,
        upper(level && level.name || 'UNKNOWN MISSION'), SIZE.sub,
        selected ? '#e7fff7' : '#d6e9ef', 'display', 0, cardWidth - 98);
      addText(scene, card, mainLeft, top + 58,
        upper(level && level.tagline || regionName), SIZE.micro,
        cssColor(palette.near || accent), 'body', 0, cardWidth - 76);
      addStars(scene, card, mainLeft, top + 82, level && level.stars, accent);
      addText(scene, card, mainLeft + 49, top + 82,
        'RUN ' + formatTime(level && level.duration), SIZE.micro,
        '#9bb8c5', 'body', 0, cardWidth - 160);
      if (Number(level && level.bestTime) > 0) {
        addText(scene, card, right, top + 82,
          'BEST ' + formatTime(level.bestTime), SIZE.micro, '#ffd67a', 'display', 1);
      }

      if (!level || !level.unlocked) {
        var lock = scene.add.image(right - 3, top + 39, 'atlas', 'ic_lock')
          .setScale(0.43).setTint(accent);
        card.add(lock);
        var previous = levels[index - 1];
        var previousName = previous ? upper(previous.name) : 'PREVIOUS MISSION';
        addText(scene, card, mainLeft, cardHeight / 2 - 16,
          'LOCKED // CLEAR ' + previousName, SIZE.micro, '#9db0b9', 'display', 0,
          cardWidth - 76);
      }

      if (selected && level && level.unlocked) {
        var line = scene.add.image(0, top + 104, 'edge')
          .setDisplaySize(cardWidth - 52, 1).setTint(accent).setAlpha(0.45);
        card.add(line);
        addText(scene, card, left, top + 121, 'BRIEFING', SIZE.micro,
          cssColor(accent), 'display', 0);
        var briefing = Array.isArray(level.briefing) ? level.briefing : [];
        var bi;
        for (bi = 0; bi < Math.min(3, briefing.length); bi++) {
          addText(scene, card, left, top + 141 + bi * 16, briefing[bi], SIZE.micro,
            '#b9d6e2', 'body', 0, cardWidth - 38);
        }
      }

      card.setAlpha(level && level.unlocked ? 1 : 0.45);
      background.setInteractive({ useHandCursor: !!(level && level.unlocked) });
      background.on('pointerdown', function (cardId) {
        return function (eventPointer) { beginDrag(eventPointer, cardId); };
      }(level && level.id));
      background.on('pointerover', function () {
        if (level && level.unlocked) background.setTint(0xe7fff7);
      });
      background.on('pointerout', function () { background.clearTint(); });
      listGroup.add(card);
      return cardHeight;
    }

    function renderCards() {
      if (listGroup) listGroup.destroy(true);
      listGroup = scene.add.container(0, 0).setDepth(4).setMask(listMask);
      var y = viewTop + 8;
      var i;
      for (i = 0; i < levels.length; i++) {
        var level = levels[i];
        var selected = !!level && level.id === state.selectedId;
        var cardHeight = addCard(level, i, y + (selected ? 94 : 54), selected);
        y += cardHeight + 8;
      }
      state.maxScroll = Math.max(0, y - viewBottom + 4);
      setScroll(state.scroll);
    }

    var dragZone = scene.add.rectangle(center, viewTop + (viewBottom - viewTop) / 2,
      viewWidth, viewBottom - viewTop, 0x000000, 0.001).setDepth(3);
    dragZone.setInteractive({ useHandCursor: false });
    dragZone.on('pointerdown', function (pointer) { beginDrag(pointer, null); });
    scene.input.on('pointermove', function (pointer) {
      if (!state.dragging || pointer.id !== state.pointerId) return;
      var delta = pointer.y - state.lastY;
      if (Math.abs(pointer.y - state.startY) > 5) state.moved = true;
      state.lastY = pointer.y;
      setScroll(state.scroll + delta);
    });
    scene.input.on('pointerup', finishDrag);
    scene.input.on('wheel', function (pointer, over, deltaX, deltaY) {
      if (pointer && pointer.y >= viewTop && pointer.y <= viewBottom) {
        setScroll(state.scroll - (Number(deltaY) || 0) * 0.68);
      }
    });

    renderCards();

    launchButton = makeButton(scene, campaign, center, launchY,
      Math.min(286, width - safeLeft - safeRight - 36), 46, 'LAUNCH MISSION', true,
      function () {
        var selected = levelById(levels, state.selectedId);
        if (!selected || !selected.unlocked || typeof campaign.start !== 'function') return;
        campaign.start(selected.id);
      });
    launchButton.setDepth(8);
    launchButton.setVisible(!!levelById(levels, state.selectedId));
    backButton.setDepth(8);

    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.on('keydown-ESC', backToTitle);
    }
  }

  window.__HM_CAMPAIGN_UI = {
    key: 'missions',
    create: createScene
  };
}());
