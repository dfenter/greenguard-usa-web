/* Lunker Lake data. All names, fish, lakes, and tackle are original. */
(function () {
  'use strict';
  const LL = window.LL = {};

  LL.rng = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17; s >>>= 0;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  LL.SPECIES = [
    { id:'sunhook', name:'Bronze Sunhook', tier:'Common', band:0, action:'slow', time:['dawn','day'], min:.4, max:2.6, tint:0xd09338, sprite:'orange', icon:'B', pattern:'bars' },
    { id:'shiner', name:'Glass Shiner', tier:'Common', band:0, action:'fast', time:['day'], min:.15, max:.9, tint:0xb9d9e8, sprite:'blue', icon:'C', pattern:'glint' },
    { id:'reedspear', name:'Reedspear', tier:'Uncommon', band:1, action:'fast', time:['day'], min:1.8, max:9.5, tint:0x6fa04e, sprite:'green', icon:'U', pattern:'stripe' },
    { id:'drumfin', name:'Marbled Drumfin', tier:'Uncommon', band:1, action:'slow', time:['dusk'], min:1.2, max:6.5, tint:0x9b8bab, sprite:'grey', icon:'U', pattern:'marble' },
    { id:'coppergill', name:'Coppergill', tier:'Common', band:1, action:'pulse', time:['day','dusk'], min:.8, max:4, tint:0xc2703a, sprite:'orange', icon:'C', pattern:'gill' },
    { id:'whiskerling', name:'Slate Whiskerling', tier:'Rare', band:2, action:'slow', time:['night'], min:3, max:16, tint:0x79808b, sprite:'greyLong', icon:'R', pattern:'whisker' },
    { id:'nightperch', name:'Nightperch', tier:'Uncommon', band:2, action:'fast', time:['dusk','night'], min:1, max:5.5, tint:0x4b6f99, sprite:'blue', icon:'U', pattern:'spot' },
    { id:'greenmouth', name:'Lunker Greenmouth', tier:'Rare', band:2, action:'pulse', time:['dawn','dusk'], min:4, max:19, tint:0x4b8f5c, sprite:'green', icon:'R', pattern:'mouth' },
    { id:'silverMinnow', name:'Silver Minnow', tier:'Common', band:0, action:'pulse', time:['dawn','day'], min:.1, max:.7, tint:0xb9d9e8, sprite:'grey', icon:'C', pattern:'silver' },
    { id:'emberBass', name:'Ember Bass', tier:'Uncommon', band:1, action:'pulse', time:['dusk'], min:2, max:8.5, tint:0xd85b3d, sprite:'red', icon:'U', pattern:'ember' },
    { id:'moonCarp', name:'Moonwake Carp', tier:'Rare', band:2, action:'slow', time:['night'], min:4.5, max:14, tint:0xd9c7e8, sprite:'pink', icon:'R', pattern:'moon' },
    { id:'pearlRoach', name:'Pearl Roach', tier:'Uncommon', band:0, action:'slow', time:['dawn'], min:.4, max:2.2, tint:0xe5d7bc, sprite:'brown', icon:'U', pattern:'pearl' },
    { id:'willowPike', name:'Willow Pike', tier:'Rare', band:1, action:'fast', time:['dawn','day'], min:3, max:12, tint:0x8aad58, sprite:'green', icon:'R', pattern:'pike' },
    { id:'thunderTrout', name:'Thunder Trout', tier:'Epic', band:2, action:'fast', time:['dusk'], min:6, max:24, tint:0x6d9bc2, sprite:'blue', icon:'E', pattern:'flash' },
    { id:'lanternKoi', name:'Lantern Koi', tier:'Epic', band:0, action:'slow', time:['night'], min:2, max:11, tint:0xf39b56, sprite:'orange', icon:'E', pattern:'lantern' },
    { id:'mossback', name:'Mossback Tench', tier:'Rare', band:1, action:'pulse', time:['dusk','night'], min:3.5, max:13, tint:0x6d8155, sprite:'green', icon:'R', pattern:'moss' },
    { id:'redfinRumble', name:'Redfin Rumble', tier:'Uncommon', band:0, action:'pulse', time:['day'], min:.7, max:3.5, tint:0xd95452, sprite:'red', icon:'U', pattern:'redfin' },
    { id:'starlingGar', name:'Starling Gar', tier:'Rare', band:1, action:'fast', time:['dawn'], min:5, max:16, tint:0xa5c1b3, sprite:'greyLong', icon:'R', pattern:'star' },
    { id:'auroraSturgeon', name:'Aurora Sturgeon', tier:'Legendary', band:2, action:'slow', time:['night'], min:12, max:42, tint:0xa6d7d4, sprite:'greyLong', icon:'L', pattern:'aurora' },
    { id:'violetSkate', name:'Violet Skate', tier:'Epic', band:2, action:'pulse', time:['night'], min:5, max:18, tint:0x9c77c7, sprite:'pink', icon:'E', pattern:'violet' }
  ];
  LL.BY_ID = {};
  LL.SPECIES.forEach(function (sp) { LL.BY_ID[sp.id] = sp; });

  LL.LAKES = [
    { name:'Cedar Mirror', subtitle:'A calm inlet for first casts', weather:'DAWN GLASS', light:'dawn', wind:-.08, unlock:0, sky:['#f1b47b','#6c9eb8'], water:['#3a91a1','#12394c'], accent:0xf0bd6b, stock:['sunhook','shiner','silverMinnow','pearlRoach','coppergill','reedspear','redfinRumble'] },
    { name:'Ember Basin', subtitle:'Warm currents under a red sky', weather:'EMBER DUSK', light:'dusk', wind:.14, unlock:3, sky:['#d86b58','#283d69'], water:['#345e91','#111e42'], accent:0xff8e58, stock:['drumfin','emberBass','nightperch','greenmouth','redfinRumble','willowPike','coppergill'] },
    { name:'Willow Reach', subtitle:'Long reeds hide sharp hunters', weather:'HIGH SUN', light:'day', wind:-.2, unlock:6, sky:['#84c8c1','#e7d79c'], water:['#2e8e91','#164a52'], accent:0xa3dfae, stock:['reedspear','coppergill','willowPike','starlingGar','greenmouth','silverMinnow','shiner'] },
    { name:'Lantern Hollow', subtitle:'The lake wakes after sundown', weather:'LANTERN NIGHT', light:'night', wind:.1, unlock:10, sky:['#415a91','#201b43'], water:['#245573','#0b1931'], accent:0xc9a4f1, stock:['whiskerling','moonCarp','lanternKoi','mossback','violetSkate','nightperch','greenmouth'] },
    { name:'Aurora Sink', subtitle:'A deep-water expedition', weather:'AURORA TIDE', light:'night', wind:-.26, unlock:15, sky:['#2e8f9c','#202957'], water:['#1b657e','#081d35'], accent:0x88e6d2, stock:['auroraSturgeon','thunderTrout','violetSkate','moonCarp','whiskerling','starlingGar','mossback'] }
  ];

  LL.RODS = [
    { id:'reed', name:'Reedglass Rod', cost:0, catchUnlock:0, power:1, control:1, note:'Balanced starter rod' },
    { id:'copper', name:'Copperwind Rod', cost:6, catchUnlock:8, power:1.16, control:1.06, note:'More pull, softer snap' },
    { id:'moon', name:'Moonline Rod', cost:14, catchUnlock:16, power:1.34, control:1.14, note:'Built for rare water' }
  ];
  LL.LURES = [
    { id:'feather', name:'Feather Jerk', action:'fast', cost:0, catchUnlock:0, note:'Fast twitch' },
    { id:'cork', name:'Cork Walker', action:'slow', cost:2, catchUnlock:2, note:'Slow drag' },
    { id:'pulse', name:'Pulse Spoon', action:'pulse', cost:4, catchUnlock:5, note:'Measured pulses' },
    { id:'lantern', name:'Lantern Fly', action:'slow', cost:8, catchUnlock:12, note:'Night glow' }
  ];

  LL.timeLabel = function (light) { return light === 'dawn' ? 'DAWN' : light === 'dusk' ? 'DUSK' : light === 'night' ? 'NIGHT' : 'DAY'; };
  LL.tierColor = function (tier) {
    return { Common:0xa9c4ce, Uncommon:0x72e29b, Rare:0x72b8ff, Epic:0xd998ff, Legendary:0xffd36e }[tier] || 0xffffff;
  };
  LL.makeLake = function (index, seed) {
    index = Number.isInteger(index) ? Math.max(0, Math.min(LL.LAKES.length - 1, index)) : 0;
    const config = LL.LAKES[index % LL.LAKES.length];
    const r = LL.rng((seed || 1) * 2654435761 + index * 7919 + 17);
    const stock = [];
    config.stock.forEach(function (id, i) {
      const sp = LL.BY_ID[id];
      const count = 2 + ((r() * (sp.tier === 'Legendary' ? 1.2 : 3.4)) | 0);
      for (let n = 0; n < count; n++) {
        const size = Math.pow(r(), sp.tier === 'Common' ? 2.2 : 1.45);
        stock.push({ species:sp, weight:Math.round((sp.min + size * (sp.max - sp.min)) * 100) / 100, seed:r(), home:i });
      }
    });
    return { index:index, seed:seed, config:config, name:config.name, subtitle:config.subtitle, weather:config.weather, light:config.light, wind:config.wind, sky:config.sky, water:config.water, accent:config.accent, stock:stock };
  };

  LL.validSave = function (o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.version !== 3) return false;
    if (!Number.isInteger(o.unlockedLake) || o.unlockedLake < 0 || o.unlockedLake > 4) return false;
    if (!Number.isInteger(o.catches) || o.catches < 0 || o.catches > 9999) return false;
    if (!Number.isFinite(o.coins) || o.coins < 0 || o.coins > 999999) return false;
    if (!Number.isFinite(o.best) || o.best < 0 || o.best > 1000) return false;
    if (!o.trophies || typeof o.trophies !== 'object' || Array.isArray(o.trophies)) return false;
    if (!o.records || typeof o.records !== 'object' || Array.isArray(o.records)) return false;
    if (!Array.isArray(o.rods) || !Array.isArray(o.lures) || !o.rods.length || !o.lures.length) return false;
    if (new Set(o.rods).size !== o.rods.length || new Set(o.lures).size !== o.lures.length) return false;
    if (o.rods.some(function (id) { return !LL.RODS.some(function (rod) { return rod.id === id; }); })) return false;
    if (o.lures.some(function (id) { return !LL.LURES.some(function (lure) { return lure.id === id; }); })) return false;
    if (o.rods.indexOf('reed') < 0 || o.lures.indexOf('feather') < 0) return false;
    if (LL.RODS.every(function (rod) { return rod.id !== o.selectedRod; }) || o.rods.indexOf(o.selectedRod) < 0) return false;
    if (LL.LURES.every(function (lure) { return lure.id !== o.selectedLure; }) || o.lures.indexOf(o.selectedLure) < 0) return false;
    if (typeof o.tutorialComplete !== 'boolean' || !Number.isInteger(o.tutorialStep) || o.tutorialStep < 0 || o.tutorialStep > 3) return false;
    if (!Number.isInteger(o.lastLake) || o.lastLake < 0 || o.lastLake > o.unlockedLake) return false;
    if (Object.keys(o.trophies).some(function (id) { return !LL.BY_ID[id] || !Number.isFinite(o.trophies[id]) || o.trophies[id] <= 0 || o.trophies[id] > LL.BY_ID[id].max; })) return false;
    if (Object.keys(o.records).some(function (key) { const parts = key.split(':'); return parts.length !== 2 || !/^[0-4]$/.test(parts[0]) || !LL.BY_ID[parts[1]] || !Number.isFinite(o.records[key]) || o.records[key] <= 0 || o.records[key] > LL.BY_ID[parts[1]].max; })) return false;
    let reachable = 0; while (reachable < 4 && Object.keys(o.trophies).length >= LL.LAKES[reachable + 1].unlock) reachable += 1;
    if (o.unlockedLake > reachable) return false;
    return true;
  };
  LL.defaultSave = function () {
    return { version:3, unlockedLake:0, catches:0, coins:0, best:0, trophies:{}, records:{}, rods:['reed'], lures:['feather'], selectedRod:'reed', selectedLure:'feather', tutorialComplete:false, tutorialStep:0, lastLake:0 };
  };
})();
