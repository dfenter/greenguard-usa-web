/* tiles.js — collision and presentation metadata for the preserved sim.
   Phaser renders the tiles. Keeping the collision registry here preserves the
   archived movement and room graph without retaining the old canvas renderer. */

const Tiles = (() => {
  const SOLID = new Set(['T', 'M', 'R', 'W', 'A', 'G', '#', 'B', 'L', 'H', 'U', 'Z', 'Q', 'p']);
  const TRIGGER = new Set(['C', 'S', 'D', 'X']);
  const THEMES = {
    over: { ground: '#244c4b', groundAlt: '#2f6255', grass: '#437c63', grassDk: '#1c3f3b', wall: '#42645c', wallDk: '#1a2d35', water: '#163f63', waterLt: '#3c8b9a', rock: '#6d7981', rockDk: '#354653', sand: '#c4a579' },
    death: { ground: '#3d4652', groundAlt: '#566172', grass: '#64727a', grassDk: '#26343d', wall: '#53616b', wallDk: '#202d36', water: '#15354d', waterLt: '#397285', rock: '#8a8f93', rockDk: '#465058', sand: '#a99579' },
    dungeon: { ground: '#111d2b', groundAlt: '#1b2b3d', grass: '#14283a', grassDk: '#0b1625', wall: '#304d69', wallDk: '#15263b', water: '#0b1c2d', waterLt: '#396d8a', rock: '#567b8e', rockDk: '#213b4c', sand: '#674e3d' },
    dungeon2: { ground: '#1d192c', groundAlt: '#2e2340', grass: '#302347', grassDk: '#171227', wall: '#654463', wallDk: '#2c1d39', water: '#1a172c', waterLt: '#845a87', rock: '#866f8b', rockDk: '#40314d', sand: '#704e42' },
  };
  const LEVEL_HUES = { 1: 220, 2: 270, 3: 330, 4: 18, 5: 55, 6: 145, 7: 195, 8: 300, 9: 320 };

  function isSolid(ch) { return SOLID.has(ch); }
  function isTrigger(ch) { return TRIGGER.has(ch); }
  function bgColor(theme) { return (THEMES[theme] || THEMES.over).ground; }
  function levelTheme(theme, levelId) {
    if (!levelId || !/^dungeon/.test(theme)) return theme;
    return theme + '@' + levelId;
  }
  function palette(theme, levelId) {
    const base = THEMES[theme] || THEMES.over;
    if (!levelId || !/^dungeon/.test(theme)) return base;
    const hue = LEVEL_HUES[levelId] || 220;
    const shift = [Math.cos(hue * Math.PI / 180) * 0.10, Math.sin(hue * Math.PI / 180) * 0.08, 0.08];
    const tint = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return '#' + c.map((v, i) => Math.max(0, Math.min(255, Math.round(v + 255 * shift[i]))).toString(16).padStart(2, '0')).join('');
    };
    const out = {};
    for (const key in base) out[key] = tint(base[key]);
    return out;
  }
  return { isSolid, isTrigger, bgColor, THEMES, levelTheme, palette };
})();
