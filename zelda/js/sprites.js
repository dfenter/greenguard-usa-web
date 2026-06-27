/* sprites.js — procedural pixel-art sprites + a simple text font.
   All sprites are packed into a single atlas canvas (one 2D context) to
   stay within iOS Safari's canvas context limit. */

const PALETTE = {
  '.': null,
  K: '#000000', W: '#ffffff', w: '#bcbcbc', d: '#545454', n: '#a0a0a0',
  G: '#34b233', g: '#0a7a18', e: '#005000',           // greens (tunic)
  S: '#f8b878', s: '#c07838',                           // skin
  F: '#7a4010', B: '#5a2c08',                           // brown hair/boots/belt
  R: '#d82828', r: '#902020',                           // red
  Y: '#f8d030', O: '#f87800',                           // yellow / orange
  b: '#3858f8', c: '#78c8f8', N: '#1830a0',             // blues
  P: '#9038e0', m: '#f078c0',                           // purple / pink
  T: '#f8c890',                                         // tan / sand
};

const Sprites = (() => {
  const cache = {};

  // ---- Single atlas canvas ----
  let atlas, atlasCtx;
  let _ax = 0, _ay = 0, _rowH = 0;
  const ATLAS_W = 256, ATLAS_H = 128;

  function _initAtlas() {
    atlas = document.createElement('canvas');
    atlas.width = ATLAS_W; atlas.height = ATLAS_H;
    atlasCtx = atlas.getContext('2d');
  }

  function _alloc(w, h) {
    if (_ax + w > ATLAS_W) { _ax = 0; _ay += _rowH; _rowH = 0; }
    _rowH = Math.max(_rowH, h);
    const sx = _ax, sy = _ay;
    _ax += w;
    return { sx, sy, sw: w, sh: h };
  }

  // Draw pixel map directly into atlas — no temp canvas
  function build(map, px = 1) {
    const h = map.length;
    let w = 0;
    for (const r of map) w = Math.max(w, r.length);
    const pos = _alloc(w * px, h * px);
    for (let y = 0; y < h; y++) {
      const row = map[y];
      for (let i = 0; i < row.length; i++) {
        const col = PALETTE[row[i]];
        if (col) { atlasCtx.fillStyle = col; atlasCtx.fillRect(pos.sx + i * px, pos.sy + y * px, px, px); }
      }
    }
    return pos;
  }

  function hexRGB(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }

  // Recolor: read region from atlas, modify pixels in memory, put into new region
  function recolor(src, fromTo) {
    const img = atlasCtx.getImageData(src.sx, src.sy, src.sw, src.sh);
    const conv = Object.entries(fromTo).map(([f, t]) => [hexRGB(f), hexRGB(t)]);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 0) continue;
      for (const [f, t] of conv) {
        if (img.data[i] === f[0] && img.data[i+1] === f[1] && img.data[i+2] === f[2]) {
          img.data[i] = t[0]; img.data[i+1] = t[1]; img.data[i+2] = t[2]; break;
        }
      }
    }
    const pos = _alloc(src.sw, src.sh);
    atlasCtx.putImageData(img, pos.sx, pos.sy);
    return pos;
  }

  // Flip horizontal: read pixels, flip in memory, put into new region — no temp canvas
  function flipH(src) {
    const w = src.sw, h = src.sh;
    const srcData = atlasCtx.getImageData(src.sx, src.sy, w, h);
    const flipped = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const di = (y * w + (w - 1 - x)) * 4;
        flipped.data[di]   = srcData.data[si];
        flipped.data[di+1] = srcData.data[si+1];
        flipped.data[di+2] = srcData.data[si+2];
        flipped.data[di+3] = srcData.data[si+3];
      }
    }
    const pos = _alloc(w, h);
    atlasCtx.putImageData(flipped, pos.sx, pos.sy);
    return pos;
  }

  // make a "step" frame by nudging the bottom legRows horizontally
  function legFrame(map, legRows, dir) {
    const m = map.slice();
    for (const r of legRows) {
      if (dir > 0) m[r] = ' ' + m[r];
      else m[r] = m[r].slice(1);
    }
    return m;
  }

  // Blit a sprite rect to a destination context
  function blit(ctx, sp, dx, dy) {
    ctx.drawImage(atlas, sp.sx, sp.sy, sp.sw, sp.sh, dx|0, dy|0, sp.sw, sp.sh);
  }

  // ===== LINK =====
  const LINK_DOWN = [
    '......KKKK......',
    '.....KYYYYK.....',
    '....KYYYYYYK....',
    '....KFFFFFFK....',
    '...KFSSSSSSFK...',
    '...KSKSSSSKSK...',
    '...KSSSSSSSSK...',
    '....KSSSSSSK....',
    '...KKGGGGGGKK...',
    '..KGGGeeeeGGGK..',
    '..SGGeGGGGeGGS..',
    '..SKGGGRRGGGKS..',
    '...KGGRRRRGGK...',
    '...KKBGGGGBKK...',
    '....KB....BK....',
    '....KK....KK....',
  ];
  const LINK_UP = [
    '......KKKK......',
    '.....KYYYYK.....',
    '....KYYYYYYK....',
    '....KGGGGGGK....',
    '...KGGGGGGGGK...',
    '...KGGGGGGGGK...',
    '...KGGGGGGGGK...',
    '....KGGGGGGK....',
    '...KKGGGGGGKK...',
    '..KGGSeeeeSGGK..',
    '..SGGeGGGGeGGS..',
    '..SKGGGGGGGGKS..',
    '...KGGGGGGGGK...',
    '...KKBGGGGBKK...',
    '....KB....BK....',
    '....KK....KK....',
  ];
  const LINK_SIDE = [        // facing right
    '....KKKK........',
    '...KYYYYK.......',
    '..KYYYYYYKK.....',
    '..KFFFFFSSK.....',
    '..KFSSSSKSK.....',
    '..KFSSSSSSK.....',
    '...KSSSSSK......',
    '...KKGGGGKK.....',
    '..KGGGGGGGGK....',
    '..KGGGeeeGGGK...',
    '..KGGeGGGGeGK...',
    '...KGGRRRGGK....',
    '...KGGRRRGGK....',
    '...KKBGGBKK.....',
    '....KBKKBK......',
    '....KKK.KK......',
  ];

  // ===== ENEMIES =====
  const OCTOROK = [
    '......KKKK......',
    '....KKRRRRKK....',
    '...KRRRRRRRRK...',
    '..KRRWKRRKWRRK..',
    '..KRRWKRRKWRRK..',
    '..KRRRRRRRRRRK..',
    '..KRRRKKKKRRRK..',
    '..KRRRRRRRRRRK..',
    '..KKRRRRRRRRKK..',
    '...KRRKRRKRRK...',
    '...KRKKRRKKRK...',
    '...KKK.KK.KKK...',
    '................',
    '................',
    '................',
    '................',
  ];
  const MOBLIN = [
    '.....KKKKKK.....',
    '....KFFFFFFK....',
    '...KFFFFFFFFK...',
    '...KFRWFFWRFK...',
    '...KFFKFFKFFK...',
    '...KFFFKKFFFK...',
    '...KFFKKKKFFK...',
    '..KKFFFFFFFFKK..',
    '.KB FFFFFFFF BK.',
    '.KBKFFFFFFFFKBK.',
    '..KKFFFFFFFFKK..',
    '...KFFKKKKFFK...',
    '...KFFK..KFFK...',
    '...KKBK..KBKK...',
    '....KK....KK....',
    '................',
  ];
  const TEKTITE = [
    '..K..........K..',
    '..KK........KK..',
    '...KK..KK..KK...',
    '....KKKPPKKKK...',
    '...KPPPPPPPPK...',
    '..KPPWPPPPWPPK..',
    '..KPPWPPPPWPPK..',
    '..KPPPPPPPPPPK..',
    '..KPPPKKKKPPPK..',
    '...KPPPPPPPPK...',
    '....KKPPPPKK....',
    '...KK..KK..KK...',
    '..KK....KK...K..',
    '..K......K...K..',
    '................',
    '................',
  ];
  const LEEVER = [
    '................',
    '.......KK.......',
    '......KRRK......',
    '.....KRRRRK.....',
    '....KRYYYYRK....',
    '...KRYWWWWYRK...',
    '...KRYWKKWYRK...',
    '...KRYWWWWYRK...',
    '....KRYYYYRK....',
    '.....KRRRRK.....',
    '......KRRK......',
    '.......KK.......',
    '................',
    '................',
    '................',
    '................',
  ];
  const ZOLA = [
    '................',
    '......KKKK......',
    '....KKbbbbKK....',
    '...KbbbbbbbbK...',
    '..KbbWKbbKWbbK..',
    '..KbbWKbbKWbbK..',
    '..KbbbbbbbbbbK..',
    '..KbbRRRRRRbbK..',
    '..KbbbKKKKbbbK..',
    '...KbbbbbbbbK...',
    '....KKbbbbKK....',
    '.....KbbbbK.....',
    '....cKbbbbKc....',
    '...ccc.KK.ccc...',
    '................',
    '................',
  ];
  const OLDMAN = [
    '.....KKKKKK.....',
    '....KRRRRRRK....',
    '...KRRRRRRRRK...',
    '...KWWWWWWWWK...',
    '..KWWKWWWWKWWK..',
    '..KWWWWWWWWWWK..',
    '..KWWWKKKKWWWK..',
    '..KWWWWWWWWWWK..',
    '...KWWWWWWWWK...',
    '....KWWWWWWK....',
    '...KRRRRRRRRK...',
    '..KRRRRRRRRRRK..',
    '..KRRRRRRRRRRK..',
    '..KRKRRRRRRKRK..',
    '..KKK.KKKK.KKK..',
    '................',
  ];
  const AQUAMENTUS = [        // dragon boss, 24x22
    '..............KKKK......',
    '.............KGGGGKK....',
    '....KK......KGGGGGGGK...',
    '...KYK.....KGGWKGGWGK...',
    '..KYYK....KGGGGGGGGGK...',
    '..KYK....KGGGGGKKGGGK...',
    '.KYK....KGGGGGGGGGGGGK..',
    '.KK....KGGGGGGGGGGGGGK..',
    '......KGGGGGGGGGGGGGGK..',
    '.....KGGGeeeGGGGGGGGK...',
    '....KGGGGeGeGGGGGGGGK...',
    '....KGGGGGGGGGGGGGGK....',
    '...KGGGGGGGGGGGGGGK.....',
    '...KGGGGGGGGGGGGGK......',
    '..KGGGGGGGGGGGGGK.......',
    '..KGGGGGGGGGGGGK........',
    '..KGGGGGGGGGGGGK........',
    '..KGGGGGGGGGGGGGK.......',
    '...KGGGGGGGGGGGGK.......',
    '...KGGKKGGGKKGGGK.......',
    '...KGK..KGK..KGK.......',
    '...KK....K....KK.......',
  ];

  const KEESE = [
    '................',
    '..K.........K...',
    '..KK.......KK...',
    '.K.KK.....KK.K..',
    '.K..KKK.KKK..K..',
    '.K..KdddddK..K..',
    '..K.KdWddWdK.K..',
    '..K.KddddddK.K..',
    '...KKddddddKK...',
    '....KdddddK.....',
    '.....KKKKK......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ];
  const STALFOS = [
    '.....KKKK.......',
    '....KWWWWK......',
    '...KWWWWWWK.....',
    '...KWKWWKWK.....',
    '...KWWWWWWK.....',
    '...KWKKKKWK.....',
    '....KWWWWK......',
    '..K.KWWWWK.K....',
    '.KW.KWWWWK.WK...',
    '.K..KWWWWK..K...',
    '....KWWWWK......',
    '...KWW..WWK.....',
    '...KW....WK.....',
    '..KK......KK....',
    '..K........K....',
    '................',
  ];
  const GEL = [
    '................',
    '................',
    '................',
    '.....KKKK.......',
    '....KGGGGK......',
    '...KGGGGGGK.....',
    '...KGKGGKGK.....',
    '...KGGGGGGK.....',
    '...KGGGGGGK.....',
    '....KGGGGK......',
    '.....KKKK.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ];
  const LYNEL = [
    '.....KKKKK......',
    '....KOOOOOK.....',
    '...KOFFFFFOK....',
    '...KOFKFFKFOK...',
    '...KOFFFFFFOK...',
    '....KFFFFFFK....',
    '...KKTTTTTTKK...',
    '..KTTTTTTTTTTK..',
    '..KTTTTTTTTTTK..',
    '..KTTKTTTTKTTK..',
    '..KKTKTTTTKTKK..',
    '....KKTTTTKK....',
    '....KK....KK....',
    '...KK......KK...',
    '................',
    '................',
  ];

  const GORIYA = [
    '.....KKKKKK.....',
    '....KsBBBBsK....',
    '...KsBBBBBBsK...',
    '...KsBWBBWBsK...',
    '...KsBBKBBKBsK..',
    '...KsBBBKBBBsK..',
    '...KsBBKKBBBsK..',
    '..KKsBBBBBBBsKK.',
    '.KFKsBBBBBBBsKFK',
    '.KFKsBBBBBBBsKFK',
    '..KKsBBBBBBBsKK.',
    '...KsBBKKBBsK...',
    '...KsBFK..KFsK..',
    '...KKBkK..KKBkK.',
    '....KB....KB....',
    '....KK....KK....',
  ];

  const IRON_KNUCKLE = [
    '.....KKKKKK.....',
    '....KwwwwwwK....',
    '...KwwwwwwwwK...',
    '...KwwKwwKwwK...',
    '...KwwwwwwwwK...',
    '...KwwKKKKwwK...',
    '....KwwwwwwK....',
    '..KKKwwwwwwKKK..',
    '.KwwKwwwwwwKwwK.',
    '.KwwKwwwwwwKwwK.',
    '..KKKwwwwwwKKK..',
    '...KKwwwwwwKK...',
    '...KwK....KwK...',
    '..KKwK....KwKK..',
    '..Kw........wK..',
    '..KK........KK..',
  ];

  const DARKNUT = [
    '.....KKKKKK.....',
    '....KddddddK....',
    '...KddddddddK...',
    '...KddKddKddK...',
    '...KddddddddK...',
    '...KddKKKKddK...',
    '...KddddddddK...',
    '..KKddddddddKK..',
    '.KdKddddddddKdK.',
    '.KdKddddddddKdK.',
    '..KKKWWWWWWKKK..',
    '...KKWWWwWWKK...',
    '...KWK....KWK...',
    '..KKWK....KWKK..',
    '..Kd........dK..',
    '..KK........KK..',
  ];

  const WIZZROBE = [
    '......KKKK......',
    '.....KPPPPk.....',
    '....KPPPPPPk....',
    '....KPKPPKPk....',
    '....KPPPPPPk....',
    '....KPKKKKPk....',
    '.....KPPPPk.....',
    '....KKPPPPKk....',
    '...KPPKPPKPPk...',
    '...KPPPKKPPPk...',
    '....KPPPPPPP k..',
    '.....KPPPPPk....',
    '....KPK..KPPk...',
    '...KPK....KPPk..',
    '....KK....KKk...',
    '......KKKK......',
  ];

  const LIKE_LIKE = [
    '................',
    '.....KKKKKK.....',
    '....KssssssK....',
    '...KssssssssK...',
    '...KssKssKssK...',
    '...KssssssssK...',
    '...KssssssssK...',
    '...KssKssKssK...',
    '...KssssssssK...',
    '...KssssssssK...',
    '...KssKssKssK...',
    '...KssssssssK...',
    '....KssssssK....',
    '.....KKKKKK.....',
    '................',
    '................',
  ];

  function init() {
    let _step = 'atlas';
    try {
      _initAtlas();
      _step = 'keese';    cache.keese = build(KEESE);
      _step = 'stalfos';  cache.stalfos = build(STALFOS);
      _step = 'gel';      const gel = build(GEL);
      _step = 'gel.blue'; cache.gel = { green: gel, blue: recolor(gel, {'#34b233':'#3858f8','#0a7a18':'#1830a0'}) };
      _step = 'lynel';    cache.lynel = build(LYNEL);
      _step = 'link.dn0'; const ld0 = build(LINK_DOWN);
      _step = 'link.dn1'; const ld1 = build(legFrame(LINK_DOWN, [14,15], 1));
      _step = 'link.up0'; const lu0 = build(LINK_UP);
      _step = 'link.up1'; const lu1 = build(legFrame(LINK_UP, [14,15], 1));
      _step = 'link.rt0'; const lr0 = build(LINK_SIDE);
      _step = 'link.rt1'; const lr1 = build(legFrame(LINK_SIDE, [14,15], -1));
      cache.link = { down:[ld0,ld1], up:[lu0,lu1], right:[lr0,lr1] };
      _step = 'link.lt0'; const ll0 = flipH(lr0);
      _step = 'link.lt1'; const ll1 = flipH(lr1);
      cache.link.left = [ll0, ll1];
      _step = 'octorok';  const oct = build(OCTOROK);
      _step = 'oct.blue'; cache.octorok = { red: oct, blue: recolor(oct, {'#d82828':'#3858f8','#902020':'#1830a0'}) };
      _step = 'moblin';   cache.moblin = build(MOBLIN);
      _step = 'mob.blue'; cache.moblin_blue = recolor(cache.moblin, {'#7a4010':'#3858f8','#5a2c08':'#1830a0'});
      _step = 'tektite';  const tek = build(TEKTITE);
      _step = 'tek.org';  const tekO = recolor(tek, {'#9038e0':'#f87800','#f078c0':'#f8c890'});
      _step = 'tek.blu';  const tekB = recolor(tek, {'#9038e0':'#3858f8'});
      cache.tektite = { orange: tekO, blue: tekB };
      _step = 'leever';   cache.leever = build(LEEVER);
      _step = 'zola';     cache.zola = build(ZOLA);
      _step = 'oldman';   cache.oldman = build(OLDMAN);
      _step = 'aquam';    const aq = build(AQUAMENTUS);
      _step = 'aq.red';   const aqR = recolor(aq, {'#34b233':'#d82828','#0a7a18':'#902020','#005000':'#601010'});
      _step = 'aq.blue';  const aqB = recolor(aq, {'#34b233':'#3858f8','#0a7a18':'#1830a0','#005000':'#102060'});
      cache.aquamentus = { green: aq, red: aqR, blue: aqB };
      _step = 'goriya';   const goriya = build(GORIYA);
      _step = 'gor.blue'; cache.goriya = { brown: goriya, blue: recolor(goriya, {'#7a4010':'#3858f8','#5a2c08':'#1830a0','#f8b878':'#78c8f8'}) };
      _step = 'ironknkl'; cache.ironknuckle = build(IRON_KNUCKLE);
      _step = 'darknut';  cache.darknut = build(DARKNUT);
      _step = 'wizzrobe'; cache.wizzrobe = build(WIZZROBE);
      _step = 'likelike'; cache.likelike = build(LIKE_LIKE);
    } catch(e) {
      throw new Error('sprites[' + _step + ']: ' + e.message);
    }
  }

  function get(name) { return cache[name]; }

  return { init, get, blit, build, flipH, recolor };
})();

/* ---- Font: crisp pixel text via small monospace, scaled by CSS ---- */
const Font = (() => {
  function draw(ctx, str, x, y, col = '#fff', scale = 1) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.font = (8 * scale) + 'px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = col;
    const s = String(str).toUpperCase();
    let cx = x;
    const cw = 8 * scale;
    for (const ch of s) {
      ctx.fillText(ch, cx, y);
      cx += cw;
    }
    ctx.restore();
  }
  function width(str, scale = 1) { return String(str).length * 8 * scale; }
  return { draw, width };
})();
