/* tiles.js — 16x16 tile definitions, baked to offscreen canvases.
   Each tile char maps to {solid, draw}. Themes recolor ground/wall. */

const Tiles = (() => {
  // Single tile atlas (one 2D context). Each unique theme:ch is baked once into
  // its own 16x16 slot and drawn via drawImage(atlas, sx,sy,...). This avoids
  // both the iOS canvas-context limit AND the mutate-a-shared-canvas-in-a-loop
  // sync bug that left tiles rendering wrong on iOS.
  const ATLAS_COLS = 16, ATLAS_ROWS = 16;     // up to 256 distinct tiles
  const _atlas = document.createElement('canvas');
  _atlas.width = ATLAS_COLS * 16; _atlas.height = ATLAS_ROWS * 16;
  const _ax = _atlas.getContext('2d');
  const slots = {};   // key `${theme}:${ch}` -> {sx, sy}
  let _slotN = 0;

  // theme palettes
  const THEMES = {
    over:   { ground:'#e8a060', groundAlt:'#d88840', grass:'#34a800', grassDk:'#1c7000',
              wall:'#7a4010', wallDk:'#4a2408', water:'#2038c0', waterLt:'#4060f0',
              rock:'#7c7c7c', rockDk:'#4a4a4a', sand:'#f8d090' },
    death:  { ground:'#b0b0b0', groundAlt:'#909090', grass:'#888888', grassDk:'#5a5a5a',
              wall:'#585858', wallDk:'#303030', water:'#2038c0', waterLt:'#4060f0',
              rock:'#9c9c9c', rockDk:'#5a5a5a', sand:'#c8c8c8' },
    dungeon:{ ground:'#101010', groundAlt:'#1a1a1a', grass:'#101010', grassDk:'#000',
              wall:'#0048b0', wallDk:'#002870', water:'#000000', waterLt:'#3858f8',
              rock:'#0048b0', rockDk:'#002870', sand:'#3a2a1a' },
    dungeon2:{ground:'#101010', groundAlt:'#1a1a1a', grass:'#101010', grassDk:'#000',
              wall:'#a02828', wallDk:'#601010', water:'#000000', waterLt:'#3858f8',
              rock:'#a02828', rockDk:'#601010', sand:'#3a2a1a' },
  };

  function px(x, cx, cy, w, h, col) { x.fillStyle = col; x.fillRect(cx, cy, w, h); }

  // draw routines per tile char
  const DRAW = {
    // grass / open ground
    '.'(x, t) { px(x,0,0,16,16,t.grass);
      x.fillStyle = t.grassDk;
      for (let i=0;i<6;i++){ const gx=(i*53%14), gy=(i*97%14); x.fillRect(gx,gy,2,1); x.fillRect(gx+1,gy+1,1,1);} },
    // sand / path
    '~'(x, t) { px(x,0,0,16,16,t.sand);
      x.fillStyle = t.groundAlt; for(let i=0;i<8;i++){x.fillRect((i*37%15),(i*71%15),1,1);} },
    // tree (solid)
    'T'(x, t) { px(x,0,0,16,16,t.grass);
      px(x,2,3,12,11,t.grassDk); px(x,3,2,10,2,'#0a5000'); px(x,1,5,14,7,'#1c7000');
      x.fillStyle='#0a5000'; x.fillRect(4,5,2,2); x.fillRect(9,7,2,2); x.fillRect(6,10,2,2);
      px(x,6,12,4,4,'#5a2c08'); },
    // mountain / rock wall (solid)
    'M'(x, t) { px(x,0,0,16,16,t.wall);
      x.fillStyle=t.wallDk;
      x.fillRect(0,0,16,2); x.fillRect(0,7,16,2); x.fillRect(0,14,16,2);
      x.fillRect(4,2,2,5); x.fillRect(11,2,2,5); x.fillRect(7,9,2,5); x.fillRect(1,9,2,5); x.fillRect(13,9,2,5); },
    // rock boulder (solid)
    'R'(x, t) { px(x,0,0,16,16,t.grass);
      px(x,2,3,12,11,t.rock); px(x,3,2,10,1,t.rockDk); px(x,2,13,12,2,t.rockDk);
      x.fillStyle=t.rockDk; x.fillRect(5,5,2,2); x.fillRect(9,8,2,2); },
    // water (solid)
    'W'(x, t) { px(x,0,0,16,16,t.water);
      x.fillStyle=t.waterLt; x.fillRect(2,3,5,1); x.fillRect(9,6,5,1); x.fillRect(4,10,5,1); x.fillRect(1,13,4,1); },
    // bridge (passable)
    '='(x, t) { px(x,0,0,16,16,t.water);
      px(x,0,2,16,12,'#c8a060'); x.fillStyle='#8a5a20';
      x.fillRect(0,2,16,1); x.fillRect(0,13,16,1); for(let i=0;i<16;i+=4)x.fillRect(i,3,1,10); },
    // cave / cliff door (passable -> trigger)
    'C'(x, t) { px(x,0,0,16,16,t.wall); px(x,4,4,8,12,'#000');
      x.fillStyle=t.wallDk; x.fillRect(3,3,10,2); x.fillRect(3,3,2,12); x.fillRect(11,3,2,12); },
    // overworld stairs (passable -> trigger)
    'S'(x, t) { px(x,0,0,16,16,t.rockDk);
      x.fillStyle=t.rock; for(let i=0;i<4;i++) x.fillRect(2,3+i*3,12,2); },
    // dungeon entrance (passable -> trigger)
    'D'(x, t) { px(x,0,0,16,16,t.wall); px(x,3,2,10,14,'#000');
      x.fillStyle='#202020'; x.fillRect(4,3,8,2); px(x,6,6,4,10,'#101010'); },
    // armos statue (solid, becomes enemy)
    'A'(x, t) { px(x,0,0,16,16,t.grass); px(x,4,2,8,13,t.rock);
      x.fillStyle=t.rockDk; x.fillRect(6,4,2,2); x.fillRect(9,4,2,2); x.fillRect(5,8,6,1); x.fillRect(4,12,8,3); },
    // gravestone (solid)
    'G'(x, t) { px(x,0,0,16,16,t.grass); px(x,4,2,8,12,t.rock);
      x.fillStyle=t.rockDk; x.fillRect(7,5,2,4); x.fillRect(5,7,6,2); px(x,3,13,10,2,'#5a3a10'); },
    // cracked rock face — bombable secret (solid; like M but with a hairline crack)
    'H'(x, t) { px(x,0,0,16,16,t.wall);
      x.fillStyle=t.wallDk;
      x.fillRect(0,0,16,2); x.fillRect(0,7,16,2); x.fillRect(0,14,16,2);
      x.fillRect(4,2,2,5); x.fillRect(11,2,2,5); x.fillRect(7,9,2,5); x.fillRect(1,9,2,5); x.fillRect(13,9,2,5);
      x.fillStyle='#000'; x.fillRect(7,3,1,2); x.fillRect(8,5,1,2); x.fillRect(7,10,1,2); x.fillRect(6,12,1,2); },
    // burnable tree — secret under it (solid; near-identical to T, one off-color leaf)
    'U'(x, t) { px(x,0,0,16,16,t.grass);
      px(x,2,3,12,11,t.grassDk); px(x,3,2,10,2,'#0a5000'); px(x,1,5,14,7,'#1c7000');
      x.fillStyle='#0a5000'; x.fillRect(4,5,2,2); x.fillRect(9,7,2,2); x.fillRect(6,10,2,2);
      x.fillStyle='#2c8410'; x.fillRect(11,5,2,2);
      px(x,6,12,4,4,'#5a2c08'); },

    // ===== dungeon tiles =====
    'F'(x, t) { px(x,0,0,16,16,t.ground); x.fillStyle=t.groundAlt; x.fillRect(0,0,16,1); x.fillRect(0,0,1,16); },
    '#'(x, t) { px(x,0,0,16,16,t.wall); x.fillStyle=t.wallDk;
      x.fillRect(0,0,16,2); x.fillRect(0,7,16,2); x.fillRect(0,14,16,2);
      x.fillRect(7,2,2,5); x.fillRect(3,9,2,5); x.fillRect(11,9,2,5); },
    'B'(x, t) { px(x,0,0,16,16,t.ground); px(x,1,1,14,14,t.wall);
      x.fillStyle=t.wallDk; x.fillRect(1,1,14,1); x.fillRect(1,14,14,1); x.fillRect(1,1,1,14); x.fillRect(14,1,1,14);
      x.fillRect(7,3,2,10); x.fillRect(3,7,10,2); },
    // dungeon stairs (passable -> trigger)
    'X'(x, t) { px(x,0,0,16,16,t.ground); x.fillStyle='#d0d0d0';
      for(let i=0;i<4;i++) x.fillRect(2+i,2+i*3,12-i*2,2); },
    // block with item pedestal floor
    'P'(x, t) { px(x,0,0,16,16,t.ground); x.fillStyle=t.groundAlt;
      x.fillRect(3,3,10,10); px(x,5,5,6,6,'#3a2a1a'); },
    // locked door (solid until a key is used)
    'L'(x, t) { px(x,0,0,16,16,t.wall);
      px(x,3,1,10,14,'#b88018'); x.fillStyle='#7a5008';
      x.fillRect(3,1,10,1); x.fillRect(3,14,10,1); x.fillRect(3,1,1,14); x.fillRect(12,1,1,14);
      px(x,7,6,2,4,'#000'); px(x,6,5,4,2,'#000'); },
    // shutter door (solid; slams open when the room condition is met)
    'Z'(x, t) { px(x,0,0,16,16,t.wall);
      px(x,3,1,10,14,'#666'); x.fillStyle='#333';
      for (let i = 0; i < 5; i++) x.fillRect(3, 2 + i * 3, 10, 1);
      x.fillStyle='#999'; x.fillRect(3,1,10,1); },
    // pushable block (solid; Link shoves it one tile to trip a secret)
    'p'(x, t) { px(x,0,0,16,16,t.ground); px(x,1,1,14,14,t.wall);
      x.fillStyle=t.wallDk;
      x.fillRect(1,1,14,1); x.fillRect(1,14,14,1); x.fillRect(1,1,1,14); x.fillRect(14,1,1,14);
      x.fillRect(4,4,8,8);
      x.fillStyle=t.wall; x.fillRect(6,6,4,4); },
  };

  const SOLID = new Set(['T','M','R','W','A','G','#','B','L','H','U','Z','p']);
  const TRIGGER = new Set(['C','S','D','X']);   // walkable special tiles

  function isSolid(ch) { return SOLID.has(ch); }
  function isTrigger(ch) { return TRIGGER.has(ch); }

  // Bake a tile into its atlas slot (once) and return {sx, sy}.
  function slot(theme, ch) {
    const key = theme + ':' + ch;
    let s = slots[key];
    if (!s) {
      const sx = (_slotN % ATLAS_COLS) * 16, sy = ((_slotN / ATLAS_COLS) | 0) * 16;
      _slotN++;
      _ax.save();
      _ax.clearRect(sx, sy, 16, 16);
      _ax.translate(sx, sy);
      const t = THEMES[theme] || THEMES.over;
      (DRAW[ch] || DRAW['.'])(_ax, t);
      _ax.restore();
      s = slots[key] = { sx, sy };
    }
    return s;
  }

  // Draw tile theme:ch at (dx,dy) on ctx, from the atlas.
  function blit(ctx, theme, ch, dx, dy) {
    const s = slot(theme, ch);
    ctx.drawImage(_atlas, s.sx, s.sy, 16, 16, dx, dy, 16, 16);
  }

  function bgColor(theme) { return (THEMES[theme]||THEMES.over).ground; }

  return { blit, isSolid, isTrigger, bgColor, THEMES };
})();
