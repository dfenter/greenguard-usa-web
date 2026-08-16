/* Willowmere AAA rebuild. Phaser is the view; GGKit owns lifecycle, input,
   save, audio, settings, and juice. All visual art is procedural original IP. */
(function (root) {
  'use strict';

  var VW = 390, VH = 844, WORLD_W = 780, WORLD_H = 1380;
  var FONT = 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  var SAVE_VERSION = 3, DAY_SECONDS = 240, PLAYER_SPEED = 122, GRID = 16;
  var sceneLive = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function int(v, d) { return Math.round(num(v, d)); }
  function str(v, d) { return typeof v === 'string' ? v : d; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  var SEASONS = [
    { id: 'spring', name: 'Spring', icon: '✿', sky: '#9bd4d0', water: '#4c9ab0', water2: '#7cc4c0', grass: '#71b86a', grass2: '#8dcc78', grove: '#4f8d67', soil: '#b9825a', stone: '#b4c0ba', light: '#fff1ba', accent: '#f19a9d' },
    { id: 'summer', name: 'Summer', icon: '☀', sky: '#84c7dc', water: '#3483aa', water2: '#5bb3c0', grass: '#55a553', grass2: '#77bb5f', grove: '#32744e', soil: '#b98757', stone: '#9caea7', light: '#ffe18b', accent: '#f4c45f' },
    { id: 'autumn', name: 'Autumn', icon: '❧', sky: '#d6a078', water: '#3b7892', water2: '#6aa2a1', grass: '#8f984f', grass2: '#ad9b4e', grove: '#6d713b', soil: '#a56f50', stone: '#9a9b91', light: '#ffd080', accent: '#e17e49' },
    { id: 'winter', name: 'Winter', icon: '❄', sky: '#9ab8d0', water: '#386b91', water2: '#78a7bb', grass: '#b7c9c0', grass2: '#d5ded5', grove: '#426b68', soil: '#b8aea0', stone: '#c9d2d2', light: '#dff4ff', accent: '#b7c9ee' }
  ];

  /* Thirty gatherables. The prototype's nine material families and six fish
     remain in the graph, with seasonal variants adding a full year. */
  var ITEMS = [
    ['reed','Reed','reed','#88bb78',[0,1,2,3]], ['driftwood','Driftwood','wood','#b78d67',[0,1,2,3]],
    ['clay','River Clay','clay','#c17e61',[0,1,2,3]], ['lakestone','Lakestone','stone','#9aa8af',[0,1,2,3]],
    ['pinecone','Pinecone','cone','#8b6848',[0,1,2,3]], ['glowmoss','Glowmoss','moss','#76e0bd',[1,2,3]],
    ['honeycap','Honeycap','cap','#e0aa51',[1,2]], ['berry','Dewberry','berry','#cb6595',[0,1]],
    ['amberleaf','Amberleaf','leaf','#e28142',[2]], ['silverfin','Silverfin','fish','#cfe8ee',[0,1]],
    ['sunperch','Sunperch','fish','#f4c65d',[1]], ['ribbonfish','Ribbonfish','fish','#77c4e1',[0,3]],
    ['emberscale','Emberscale','fish','#e46d53',[2]], ['duskcarp','Duskcarp','fish','#9c83c7',[2,3]],
    ['lanternfish','Lanternfish','fish','#ffe397',[3]], ['rainpetal','Rain Petal','flower','#efa2b6',[0]],
    ['clover','Clover','flower','#73bd74',[0]], ['sweetpea','Sweet Pea','flower','#d5a8df',[0,1]],
    ['sunmelon','Sunmelon','fruit','#f1a65f',[1]], ['tomato','Terrace Tomato','fruit','#dc6d5d',[1,2]],
    ['lavender','Blue Lavender','flower','#a48bd1',[1]], ['mapleseed','Maple Seed','seed','#c77b48',[2]],
    ['hazelnut','Hazelnut','nut','#a96e45',[2]], ['ciderapple','Cider Apple','fruit','#d86e5e',[2]],
    ['frostplum','Frost Plum','fruit','#a4a9df',[3]], ['snowdrop','Snowdrop','flower','#e4f2e5',[3]],
    ['icefern','Ice Fern','fern','#9ed9d9',[3]], ['starberry','Starberry','berry','#9bb5ec',[3]],
    ['willowfloss','Willow Floss','floss','#d8d1bb',[0,1]], ['millgrain','Mill Grain','grain','#e3bd6d',[2,3]]
  ].map(function (a) { return { id:a[0], name:a[1], kind:a[2], color:a[3], seasons:a[4] }; });
  var ITEM = {};
  ITEMS.forEach(function (it) { ITEM[it.id] = it; });

  var FURNITURE = [
    ['mat','Reed Mat',66,44,'flat','#a4ba72','#718e55',['reed',3]], ['stool','Driftwood Stool',34,34,'round','#b59470','#72573f',['driftwood',2,'reed',1]],
    ['lantern','Clay Lantern',26,38,'lamp','#c17f61','#ffe5a1',['clay',2,'glowmoss',1]], ['shelf','Pine Shelf',70,28,'box','#a68761','#604b38',['driftwood',3,'pinecone',2]],
    ['hearth','Stone Hearth',76,44,'box','#8c9aa2','#e78b4c',['lakestone',4,'clay',1]], ['trophy','Angler Trophy',42,30,'box','#d6e5ea','#75654e',['silverfin',1,'lakestone',2]],
    ['table','Willow Table',76,50,'box','#b49569','#76543e',['driftwood',3,'reed',2]], ['rug','Moss Rug',88,60,'flat','#70bc96','#468b72',['glowmoss',3,'reed',2]],
    ['screen','Amber Screen',58,66,'tall','#df913c','#9e5e2b',['amberleaf',4,'driftwood',2]], ['mirror','Lake Mirror',36,50,'tall','#9ec7d9','#64879c',['lakestone',2,'clay',2,'glowmoss',1]],
    ['honeylamp','Honey Lamp',28,40,'lamp','#d0a04f','#ffda8d',['honeycap',2,'clay',2]], ['bedroll','Cozy Bedroll',62,40,'flat','#c38ba1','#925f78',['reed',3,'amberleaf',2]],
    ['armchair','Quilted Armchair',48,48,'box','#c46b7b','#834958',['berry',2,'reed',2,'willowfloss',1]], ['wheel','Harbor Wheel',50,50,'round','#9a7b52','#60472f',['driftwood',4,'lakestone',1]],
    ['garland','Festival Garland',92,24,'flat','#e2c260','#c27c3e',['rainpetal',2,'amberleaf',2,'willowfloss',1]], ['banner','Starlit Banner',38,70,'tall','#6271c3','#e8e1a3',['starberry',2,'reed',2]],
    ['bench','Willow Bench',86,34,'box','#a9825e','#664a37',['driftwood',4,'willowfloss',1]], ['tea','Tea Table',54,42,'round','#c28b64','#7d563e',['clay',2,'honeycap',1]],
    ['riverstool','Riverstone Stool',34,34,'round','#a9b1b1','#667178',['lakestone',3,'clay',1]], ['mantel','Mill Mantel',92,26,'box','#8c684e','#c07c48',['driftwood',5,'millgrain',2]],
    ['daybed','Reed Daybed',94,46,'flat','#8eb9a0','#547f6c',['reed',4,'sweetpea',2]], ['cluster','Lantern Cluster',42,54,'lamp','#d19a4b','#ffe49b',['clay',3,'glowmoss',2]],
    ['basket','Berry Basket',42,38,'round','#b68158','#d26a87',['berry',3,'reed',2]], ['swing','Porch Swing',84,52,'box','#b0835e','#6b4a37',['driftwood',5,'willowfloss',2]],
    ['quilt','Lake Quilt',86,58,'flat','#7ba5bc','#d7b27d',['ribbonfish',1,'reed',3,'sweetpea',1]], ['planter','Terrace Planter',74,32,'box','#ad7257','#71a55e',['clay',3,'tomato',2]],
    ['trellis','Flower Trellis',72,70,'tall','#8b6d4c','#e49cb1',['driftwood',3,'rainpetal',2,'clover',2]], ['fence','Willow Fence',92,24,'flat','#a18a63','#76975f',['willowfloss',3,'reed',2]],
    ['millstand','Mill Wheel Stand',56,60,'round','#967050','#dfb36a',['driftwood',4,'millgrain',2]], ['moonshelf','Moon Shelf',68,30,'box','#657f94','#e0e7e0',['frostplum',1,'lakestone',2]],
    ['snowwindow','Snow Window',58,52,'tall','#d6e5ee','#8cb0c1',['snowdrop',2,'icefern',2]], ['quiltRack','Quilt Rack',70,54,'tall','#ab7858','#c7859a',['amberleaf',2,'reed',3]],
    ['birdbath','Bird Bath',48,38,'round','#b1c2c1','#6b9b99',['lakestone',3,'clover',2]], ['duckdecoy','Duck Decoy',38,30,'round','#d69b61','#779d70',['driftwood',2,'sunperch',1]],
    ['herbrack','Herb Rack',70,34,'box','#7b9b64','#c7a66b',['driftwood',3,'lavender',2]], ['festtable','Festival Table',98,42,'box','#d1a460','#8b5d40',['ciderapple',2,'millgrain',2,'berry',2]],
    ['seedcab','Seed Cabinet',56,72,'tall','#a17a5e','#e2bd6c',['mapleseed',2,'hazelnut',2,'driftwood',2]], ['vase','Clay Vase',30,42,'lamp','#c88168','#efa2b6',['clay',3,'rainpetal',1]],
    ['arch','Willow Arch',96,86,'tall','#8fa373','#e7c478',['willowfloss',4,'reed',3,'clover',1]], ['starmap','Star Map',62,48,'flat','#53688f','#e1d49a',['starberry',2,'lakestone',1,'ribbonfish',1]]
  ].map(function (a) {
    var r = {}; r.id=a[0]; r.name=a[1]; r.w=a[2]; r.h=a[3]; r.shape=a[4]; r.a=a[5]; r.b=a[6]; r.recipe={};
    for (var i=0;i<a[7].length;i+=2) r.recipe[a[7][i]]=a[7][i+1]; return r;
  });
  var FURN = {}; FURNITURE.forEach(function (f) { FURN[f.id] = f; });

  var DISTRICTS = [
    { id:'lake-shore', name:'Lake Shore', x:0,y:0,w:780,h:300, accent:'#5bb3c0', spawn:[390,235] },
    { id:'willow-grove', name:'Willow Grove', x:0,y:300,w:390,h:360, accent:'#78b875', spawn:[260,500] },
    { id:'terraced-farms', name:'Terraced Farms', x:0,y:660,w:780,h:360, accent:'#e0bd65', spawn:[520,790] },
    { id:'old-mill', name:'Old Mill', x:0,y:1020,w:780,h:360, accent:'#d89162', spawn:[390,1160] }
  ];
  var FESTIVALS = [
    { season:0, name:'Rain Petal Walk', district:'willow-grove', detail:'The grove wears pink ribbons and the first seedlings are shared.' },
    { season:1, name:'Sunlit Regatta', district:'lake-shore', detail:'Little boats circle the lake while the village sings from the dock.' },
    { season:2, name:'Harvest Table', district:'terraced-farms', detail:'Every porch holds a dish and every terrace glows amber.' },
    { season:3, name:'Lantern Festival', district:'old-mill', detail:'The old mill turns once more, carrying lantern light through winter.' }
  ];

  var NPCS = [
    {id:'maple',name:'Maple Thorne',role:'baker',color:'#e17e8e',hair:'#5d3528',loves:'honeycap',likes:'berry',hates:'lakestone',spot:[140,720],greet:['The ovens are warm. Take your time.','You always arrive when the buns do.','You are family at this counter now.'],request:[['honeycap',2,'A small batch of honeycap buns would make this morning sing.'],['willowfloss',3,'Help me mend Gran’s old recipe book with willow floss.']],stories:[['Careful, that tray is hotter than the dock at noon.','My gran ran this bakery. I kept her stool and threw out her recipes.','That was brave.','It was rude. Her honeycap buns were terrible.'],['I found her notebook behind the flour bin.','She hoped whoever came next would change everything.','She knew you.','She did. Take this chair and sit with me.']],reward:'armchair'},
    {id:'bram',name:'Bram Quill',role:'fisher',color:'#649fca',hair:'#263743',loves:'silverfin',likes:'driftwood',hates:'berry',spot:[610,260],greet:['The water is flat and the fish are honest.','I saw your bobber from the far pier.','You out-fished me. I am gracious about it.'],request:[['silverfin',1,'Bring me a silverfin and I will show you the quiet water.'],['ribbonfish',2,'The old wheel deserves a story from the deep reeds.']],stories:[['Thirty years on this lake and it still lies to me.','It goes calm when a storm is coming.','Same as people. Read the little ripples.'],['My old boat wheel has been in the shed for years.','I rowed to the far reeds this morning. Take the wheel.']],reward:'wheel'},
    {id:'oleo',name:'Oleander Vane',role:'herbalist',color:'#7fc79a',hair:'#3e4e32',loves:'glowmoss',likes:'amberleaf',hates:'pinecone',spot:[130,560],greet:['Mind the drying racks. Everything bites a little.','You have steady hands. I could use them.','The shop is better with your muddy boots.'],request:[['glowmoss',3,'Find glowmoss after dusk, when it remembers how to shine.'],['icefern',2,'Keep two winter ferns safe for the cold months.']],stories:[['Glowmoss only shines when the night is properly dark.','People are similar. I say that to sound wise.'],['I came here to be alone for one winter. It was nine winters ago.','Somebody always needed a poultice. Take this wall wash.']],reward:'amberwash'},
    {id:'tansy',name:'Tansy Ford',role:'lake kid',color:'#f0c85a',hair:'#9b5d2d',loves:'berry',likes:'pinecone',hates:'clay',spot:[460,610],greet:['I am counting ducks. I am at forty. Or nine.','My flat rock collection is mostly one rock.','Best friend inspection: passed.'],request:[['berry',3,'Bring three dewberries for the duck picnic.'],['starberry',2,'I need starberries for a map of the sky.']],stories:[['Grown-ups walk past the lake like it is a wall.','A lake is a door. Fish live whole lives under it.'],['I made a garland for the lantern festival.','Hang it in your cottage so somebody with taste sees it.']],reward:'garland'},
    {id:'corvin',name:'Corvin Reed',role:'boatwright',color:'#c88959',hair:'#3c2b22',loves:'driftwood',likes:'lakestone',hates:'honeycap',spot:[650,720],greet:['Everything in this shop is halfway to a boat.','Hand me that plane. Good hands.','I am putting you on the sign.'],request:[['driftwood',3,'Bring three straight pieces from the grove.'],['millgrain',2,'The mill needs grain before it can turn again.']],stories:[['A hull is a hundred small decisions that agree.','That is why I sand slowly.'],['I never finished my father’s skiff.','I pulled the tarp off after you came round.']],reward:'banner'},
    {id:'juniper',name:'Juniper Ash',role:'musician',color:'#a68ad4',hair:'#302440',loves:'amberleaf',likes:'clay',hates:'reed',spot:[650,930],greet:['I am tuning. It is a lifestyle.','Sit in. I will play the slow one.','Every song has a lake in it now.'],request:[['amberleaf',3,'Bring amber leaves for the festival score.'],['clay',2,'Two river-clay bells will finish the refrain.']],stories:[['The hall is empty most nights. I play anyway.','Old rooms hold sound like cupped hands.'],['I finished the festival piece. It took two seasons.','Here are lakewood boards, so you have something to stay on.']],reward:'lakewood'},
    {id:'mara',name:'Mara Fen',role:'farmer',color:'#d49a61',hair:'#6f4c31',loves:'sunmelon',likes:'clover',hates:'duskcarp',spot:[520,740],greet:['The terraces are thirsty, even after rain.','A good row starts with good company.','Your hands know the soil now.'],request:[['sunmelon',2,'Bring two sunmelons for the seed table.'],['ciderapple',2,'The orchard press is waiting for cider apples.']],stories:[['Every terrace is a promise made to gravity.','You keep promises by coming back.'],['My first harvest failed completely.','The second one fed the whole hillside. Take these seeds.']],reward:'planter'},
    {id:'rue',name:'Rue Bell',role:'mill keeper',color:'#86b6bf',hair:'#4d5964',loves:'millgrain',likes:'frostplum',hates:'honeycap',spot:[570,1160],greet:['The mill has a rhythm if you listen.','The wheel likes a steady hand.','You make the old place feel young.'],request:[['millgrain',3,'Bring grain for the first honest turn in years.'],['frostplum',2,'Winter plums will sweeten the mill supper.']],stories:[['The mill stopped when people stopped asking it to sing.','A building remembers being useful.'],['The wheel turns again because everyone carried something.','Take this mantel. It belongs above a warm room.']],reward:'mantel'},
    {id:'sol',name:'Sol Alder',role:'gardener',color:'#e4bb67',hair:'#765238',loves:'snowdrop',likes:'willowfloss',hates:'emberscale',spot:[240,875],greet:['Winter is just a garden resting its eyes.','I keep seeds in every coat pocket.','You are part of the planting now.'],request:[['snowdrop',3,'Collect snowdrops for the quiet garden.'],['mapleseed',2,'Maple seeds make fine little wishes.']],stories:[['A garden is not a painting. It changes while you look.','That is why I love it.'],['The old willow dropped seeds all over town.','Take this trellis and let something climb.']],reward:'trellis'},
    {id:'pippa',name:'Pippa Wren',role:'story keeper',color:'#d889a8',hair:'#4e3855',loves:'starberry',likes:'lavender',hates:'clay',spot:[270,1140],greet:['I keep the stories that people nearly tell.','The village has a new page today.','You are in more stories than you know.'],request:[['starberry',2,'Bring two starberries for the winter storybook.'],['lavender',3,'Lavender keeps the ink cupboard sweet.']],stories:[['A story is a place where someone can stay for a while.','You have been staying.'],['The best stories are not about winning.','They are about who put the kettle on.']],reward:'starmap'}
  ];
  var NPC = {}; NPCS.forEach(function (n) { NPC[n.id] = n; });

  var GATHER_POINTS = [
    {item:'reed',x:92,y:342},{item:'rainpetal',x:182,y:368},{item:'clover',x:304,y:408},{item:'sweetpea',x:92,y:514},
    {item:'willowfloss',x:212,y:588},{item:'glowmoss',x:348,y:610},{item:'driftwood',x:680,y:350},{item:'clay',x:720,y:470},
    {item:'pinecone',x:54,y:704},{item:'sunmelon',x:196,y:704},{item:'tomato',x:326,y:744},{item:'lavender',x:690,y:690},
    {item:'berry',x:98,y:842},{item:'mapleseed',x:180,y:914},{item:'ciderapple',x:300,y:956},{item:'honeycap',x:710,y:842},
    {item:'lakestone',x:66,y:1000},{item:'amberleaf',x:740,y:974},{item:'millgrain',x:106,y:1070},{item:'frostplum',x:202,y:1100},
    {item:'starberry',x:290,y:1260},{item:'snowdrop',x:500,y:1060},{item:'icefern',x:680,y:1110},{item:'hazelnut',x:724,y:1240},
    {item:'silverfin',x:380,y:254},{item:'sunperch',x:410,y:230},{item:'ribbonfish',x:450,y:190},{item:'emberscale',x:330,y:160},
    {item:'duskcarp',x:520,y:180},{item:'lanternfish',x:260,y:210}
  ];
  var OBSTACLES = [
    {x:0,y:0,w:350,h:176},{x:430,y:0,w:350,h:176}, {x:350,y:320,w:80,h:100},
    {x:454,y:404,w:196,h:146}, {x:36,y:688,w:116,h:90},{x:624,y:682,w:126,h:104},
    {x:40,y:868,w:150,h:104},{x:586,y:866,w:142,h:104},{x:242,y:1030,w:296,h:160}
  ];
  function currentNodeItem(point, season) {
    var item=ITEM[point.item]; if(item&&item.seasons.indexOf(season)>=0)return item.id;
    var seasonal=season===0?'clover':season===1?'sunmelon':season===2?'amberleaf':'snowdrop'; return ITEM[seasonal]?seasonal:'reed';
  }

  var WM_STATE = {
    ready:false, mode:'boot', scene:'world', progress:0, score:0, health:100,
    stage:'lake-shore', currentStage:'Lake Shore', day:1, season:'spring',
    weather:'clear', friendship:0, villagers:10, placements:0, inventory:0,
    action:'Explore', reducedMotion:false, forceMode:null, forceStage:null,
    moveCount:0, lastBeat:'boot'
  };
  var BRIDGE = {
    state:WM_STATE, forceMode:null, forceStage:null,
    forceMove:function (x,y) { if (sceneLive) sceneLive.forceMove(num(x,390),num(y,420)); },
    forceInteract:function () { if (sceneLive) sceneLive.contextAction(); },
    forceGather:function () { if (sceneLive) sceneLive.forceGather(); },
    resetSave:function () { if (sceneLive) sceneLive.resetSave(); }
  };
  root.__wm = BRIDGE;

  function validateSave(value) { return value == null || (obj(value).v === SAVE_VERSION && obj(value).kind === 'willowmere'); }
  var kit = GGKit.create({
    slug:'willowmere', orientation:'portrait', validateSave:validateSave,
    onPause:function () { if (sceneLive) { sceneLive.pausedByKit = true; sceneLive.keys = {}; sceneLive.joystick.id = null; sceneLive.joystick.dx = 0; sceneLive.joystick.dy = 0; } },
    onResume:function () { if (sceneLive) sceneLive.pausedByKit = false; },
    onRestart:function () { if (sceneLive) sceneLive.resetSave(); }
  });
  if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;
  WM_STATE.reducedMotion = !kit.juice.enabled;
  kit.audio.register({
    music_spring:'audio/music_spring.mp3', music_summer:'audio/music_summer.mp3', music_autumn:'audio/music_autumn.mp3', music_winter:'audio/music_winter.mp3', music_night:'audio/music_night.mp3',
    sfx_ui:'audio/sfx_ui.mp3', sfx_step:'audio/sfx_step.mp3', sfx_gather:'audio/sfx_gather.mp3',
    sfx_craft:'audio/sfx_craft.mp3', sfx_gift:'audio/sfx_gift.mp3', sfx_heart:'audio/sfx_heart.mp3',
    sfx_place:'audio/sfx_place.mp3', sfx_rotate:'audio/sfx_rotate.mp3', sfx_day:'audio/sfx_day.mp3',
    sfx_festival:'audio/sfx_festival.mp3'
  });
  kit.registerPWA();

  function blankSave() {
    var np = {}; NPCS.forEach(function (n) { np[n.id] = { points:0, tier:0, request:0, story1:false, story2:false, giftDay:0 }; });
    return {v:SAVE_VERSION,kind:'willowmere',day:1,tod:0.02,scene:'world',x:390,y:560,fx:0,fy:1,
      inv:{},owned:{},placements:[],npc:np,harvested:{},styles:{wall:0,floor:0},seenSeasons:[0],festivalFlags:[],stats:{gather:0,craft:0,gift:0,steps:0},lastStage:'lake-shore'};
  }
  function normalizeSave(raw) {
    var s = blankSave(), o = obj(raw);
    if (o.v !== SAVE_VERSION || o.kind !== 'willowmere') return s;
    s.day=clamp(int(o.day,1),1,9999); s.tod=clamp(num(o.tod,0.02),0,0.999); s.scene=o.scene==='cottage'?'cottage':'world';
    s.x=clamp(num(o.x,390),24,WORLD_W-24); s.y=clamp(num(o.y,560),120,WORLD_H-24); s.fx=clamp(num(o.fx,0),-1,1); s.fy=clamp(num(o.fy,1),-1,1);
    var iv=obj(o.inv); Object.keys(ITEM).forEach(function (id) { var n=clamp(int(iv[id],0),0,999); if(n) s.inv[id]=n; });
    var ow=obj(o.owned);Object.keys(FURN).forEach(function(id){var n=clamp(int(ow[id],0),0,99);if(n)s.owned[id]=n;});
    var pl=arr(o.placements); for(var i=0;i<pl.length && i<80;i++){var p=obj(pl[i]), f=FURN[str(p.id,'')]; if(!f)continue; s.placements.push({id:f.id,x:clamp(num(p.x,230),64,326),y:clamp(num(p.y,420),196,640),rot:((int(p.rot,0)%4)+4)%4});}
    var nn=obj(o.npc); NPCS.forEach(function(n){var a=obj(nn[n.id]);s.npc[n.id]={points:clamp(int(a.points,0),0,30),tier:clamp(int(a.tier,0),0,5),request:clamp(int(a.request,0),0,2),story1:a.story1===true,story2:a.story2===true,giftDay:int(a.giftDay,0)};});
    var vs=arr(o.seenSeasons); s.seenSeasons=[]; vs.forEach(function(v){v=int(v,-1);if(v>=0&&v<4&&s.seenSeasons.indexOf(v)<0)s.seenSeasons.push(v);}); if(!s.seenSeasons.length)s.seenSeasons=[0];
    s.festivalFlags=arr(o.festivalFlags).map(function(v){return int(v,-1);}).filter(function(v){return v>=0&&v<4;});
    var hv=obj(o.harvested);Object.keys(hv).forEach(function(k){var n=int(k,-1);if(n>=0&&n<GATHER_POINTS.length)s.harvested[n]=int(hv[k],0);});
    var sty=obj(o.styles);s.styles={wall:clamp(int(sty.wall,0),0,2),floor:clamp(int(sty.floor,0),0,2)};
    var st=obj(o.stats); s.stats={gather:clamp(int(st.gather,0),0,9999),craft:clamp(int(st.craft,0),0,9999),gift:clamp(int(st.gift,0),0,9999),steps:clamp(int(st.steps,0),0,999999)};
    s.lastStage=str(o.lastStage,'lake-shore'); return s;
  }

  function saveState(s) { kit.save.set(s); }
  function seasonIndex(day) { return Math.floor(((day - 1) % 12) / 3); }
  function seasonName(day) { return SEASONS[seasonIndex(day)].name; }
  function weatherFor(day, season) {
    var choices = season === 3 ? ['snow','clear','snow','clear'] : season === 0 ? ['rain','clear','breeze','rain'] : season === 2 ? ['breeze','clear','rain','clear'] : ['clear','breeze','clear','rain'];
    return choices[(day - 1) % choices.length];
  }
  function districtAt(x, y) {
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i]; if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
    }
    /* Willow Grove only spans the west half of its band, so the cottage side
       (and the default spawn) falls between rectangles. Fall back to the
       nearest district instead of always naming the Lake Shore. */
    var best = DISTRICTS[0], bd = Infinity;
    for (var j = 0; j < DISTRICTS.length; j++) {
      var e = DISTRICTS[j], dx = Math.max(e.x - x, 0, x - (e.x + e.w)), dy = Math.max(e.y - y, 0, y - (e.y + e.h));
      var dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  }
  function hex(c) { return Phaser.Display.Color.HexStringToColor(c).color; }
  function text(scene, x, y, value, size, color, weight, originX, originY) {
    var t = scene.add.text(x, y, value, {fontFamily:FONT,fontSize:size+'px',fontStyle:weight||'600',color:color||'#f5f3df',resolution:2});
    t.setOrigin(originX === undefined ? 0.5 : originX, originY === undefined ? 0.5 : originY); return t;
  }
  function setTextIfChanged(t, value) { if (t && t.text !== value) t.setText(value); }
  function makeTexture(scene, key, w, h, draw) {
    var g = scene.add.graphics(); draw(g); g.generateTexture(key, w, h); g.destroy(); return key;
  }
  function fill(g, c, a) { g.fillStyle(hex(c), a === undefined ? 1 : a); }
  function stroke(g, c, width, a) { g.lineStyle(width || 1, hex(c), a === undefined ? 1 : a); }
  function round(g, x, y, w, h, r, c, a) { fill(g,c,a); g.fillRoundedRect(x,y,w,h,r); }
  function iconTexture(scene, key, type, c) {
    return makeTexture(scene,key,48,48,function(g){
      fill(g,'#000000',0); g.fillRect(0,0,48,48); fill(g,c||'#f6e5a6',1);
      if(type==='bag'){g.fillRoundedRect(12,16,24,22,5);stroke(g,'#163b3c',3);g.strokeRoundedRect(12,16,24,22,5);g.strokeRoundedRect(18,10,12,10,5);}
      else if(type==='gear'){g.fillCircle(24,24,10);for(var i=0;i<8;i++){var a=i*Math.PI/4;g.fillRect(21+Math.cos(a)*13,21+Math.sin(a)*13,6,6);}fill(g,'#163b3c');g.fillCircle(24,24,4);}
      else if(type==='hand'){g.fillRoundedRect(18,17,14,20,5);g.fillRect(14,21,6,15);g.fillRect(19,11,4,14);g.fillRect(24,9,4,16);g.fillRect(29,12,4,15);}
      else if(type==='leaf'){g.fillEllipse(24,22,23,13);fill(g,'#163b3c');g.fillRect(23,20,3,18);}
      else if(type==='heart'){g.fillCircle(18,20,8);g.fillCircle(30,20,8);g.fillTriangle(10,22,38,22,24,39);}
      else if(type==='rotate'){stroke(g,'#163b3c',4);g.strokeCircle(24,24,13);g.fillTriangle(32,10,39,19,28,18);}
      else if(type==='undo'){stroke(g,'#163b3c',4);g.beginPath();g.moveTo(35,18);g.lineTo(20,18);g.lineTo(20,11);g.lineTo(10,23);g.lineTo(20,35);g.lineTo(20,28);g.lineTo(31,28);g.strokePath();}
      else {g.fillCircle(24,24,10);}
    });
  }

  function bakeWorld(scene, key, season) {
    var C = SEASONS[season];
    makeTexture(scene,key,WORLD_W,WORLD_H,function(g){
      fill(g,C.grass); g.fillRect(0,0,WORLD_W,WORLD_H);
      /* Lake Shore: water, sand edge, reed fingers, and the old dock. */
      fill(g,C.water); g.fillRect(0,0,WORLD_W,292);
      fill(g,C.water2,0.48); for(var w=0;w<16;w++){g.fillRect((w*97)%760,34+(w%6)*38,58+(w%3)*18,4);g.fillRect((w*53+40)%760,52+(w%7)*31,28,3);}
      fill(g,season===3?'#e0e5dd':'#e3cd96'); g.fillRect(0,282,WORLD_W,24);
      for(var r=0;r<14;r++){fill(g,C.grove,0.74);g.fillEllipse(30+r*58,314+(r%3)*12,38,18);}
      fill(g,'#9a784c'); g.fillRect(350,210,80,112); fill(g,'#715538'); for(var pl=0;pl<8;pl++)g.fillRect(352,216+pl*14,76,3);
      stroke(g,'#ddc493',3); g.strokeRect(354,213,72,106);
      /* Willow Grove: deep green shade and broad willow crowns. */
      fill(g,season===3?'#b8c7c0':C.grove); g.fillRect(0,306,390,354);
      fill(g,C.grass2,0.35); for(var p=0;p<18;p++)g.fillRect((p*83)%390,358+(p*41)%250,56,24);
      for(var t=0;t<9;t++){var tx=34+(t*73)%330,ty=350+(t*47)%260;fill(g,'#624b35');g.fillRect(tx-4,ty,8,48);fill(g,season===2?['#b96d38','#d99445','#8c773c'][t%3]:season===3?'#55726d':C.grove);g.fillEllipse(tx,ty-12,58,38);g.fillEllipse(tx-22,ty+8,42,30);g.fillEllipse(tx+24,ty+7,44,28);}
      /* Terraced Farms: clearly different stepped fields. */
      fill(g,season===3?'#cbd5cf':C.grass); g.fillRect(0,660,WORLD_W,360);
      for(var q=0;q<5;q++){var yy=690+q*60;fill(g,season===3?'#b0c2bc':C.soil);g.fillRoundedRect(18,yy,744,42,12);fill(g,season===3?'#dbe6e0':C.grass2);g.fillRect(30,yy+8,720,25);stroke(g,season===3?'#97aba7':'#78924f',2);for(var crop=0;crop<18;crop++){var cx=42+crop*40+(q%2)*10;g.lineBetween(cx,yy+27,cx,yy+12);}}
      fill(g,'#b69a69'); g.fillRect(365,660,48,360); fill(g,'#cfb77b'); g.fillRect(335,780,110,48);
      /* Old Mill: river cut, mill house, wheel, and finale clearing. */
      fill(g,season===3?'#d6e0df':'#6e9b7c'); g.fillRect(0,1020,WORLD_W,360);
      fill(g,season===3?'#5b8194':'#4f8e91'); g.fillRect(0,1092,WORLD_W,110); fill(g,'#8fc4b4',0.45);g.fillRect(0,1124,WORLD_W,5);g.fillRect(0,1168,WORLD_W,4);
      fill(g,'#806a55'); g.fillRect(242,1028,296,170); fill(g,'#a67b5b');g.fillTriangle(220,1034,390,948,560,1034);fill(g,'#5c5149');g.fillRect(312,1070,70,82);g.fillRect(418,1070,70,82);fill(g,C.light,0.72);g.fillRect(328,1087,36,28);g.fillRect(434,1087,36,28);
      stroke(g,'#735840',8); g.strokeCircle(390,1150,72); stroke(g,season===3?'#d6e3e0':'#b7d2bb',5);for(var spoke=0;spoke<8;spoke++){var sa=spoke*Math.PI/4;g.lineBetween(390,1150,390+Math.cos(sa)*66,1150+Math.sin(sa)*66);}fill(g,'#7b6046');g.fillCircle(390,1150,12);
      /* A cottage and yard anchor the home loop. */
      fill(g,'#c7a579');g.fillRect(454,404,196,142);fill(g,'#8d5f4a');g.fillTriangle(438,430,552,350,666,430);fill(g,'#7d5a44');g.fillRect(530,478,42,68);fill(g,C.light);g.fillRect(476,440,38,28);g.fillRect(594,440,38,28);fill(g,'#d8c894',0.8);g.fillRect(440,555,226,100);
      stroke(g,'#d9c48f',2);g.strokeRect(440,555,226,100);fill(g,season===3?'#dfe8e1':C.grass2,0.56);for(var yard=0;yard<12;yard++)g.fillCircle(468+(yard%6)*34,580+Math.floor(yard/6)*38,6);
      /* Paths and district seams are softened with stepping stones. */
      fill(g,'#cbb586',0.9);g.fillRect(365,300,52,720);g.fillRect(120,790,540,42);g.fillRect(365,1150,52,120);
      for(var stone=0;stone<22;stone++){fill(g,season===3?'#dfe6df':'#e1c994',0.72);g.fillEllipse(390+(stone%2)*18-9,330+stone*38,18,9);}
      if(season===3){fill(g,'#f5f7f0',0.75);for(var sn=0;sn<100;sn++)g.fillCircle((sn*73)%WORLD_W,(sn*97)%WORLD_H,1+(sn%3));}
      if(season===0){fill(g,'#f3b4bf',0.85);for(var fl=0;fl<34;fl++)g.fillCircle((fl*67)%WORLD_W,320+(fl*83)%960,2+(fl%2));}
    });
  }

  function bakeCottage(scene,key) {
    makeTexture(scene,key,390,700,function(g){
      fill(g,'#273d3d');g.fillRect(0,0,390,700);fill(g,'#dac9a9');g.fillRect(20,104,350,560);fill(g,'#9b7958');for(var i=0;i<14;i++)g.fillRect(20,104+i*40,350,3);fill(g,'#d7bd91');g.fillRect(20,104,350,62);fill(g,'#7ca8ae');g.fillRoundedRect(145,119,100,40,6);fill(g,'#e9edcf');g.fillCircle(218,139,7);fill(g,'#895e43');g.fillRect(40,184,92,56);fill(g,'#6e4d39');g.fillRect(52,226,68,8);fill(g,'#d8ba84');g.fillRect(55,196,24,16);fill(g,'#9a9fa1');g.fillRect(91,196,28,10);fill(g,'#7c5d45');g.fillRect(260,184,86,62);fill(g,'#d6e2ea');g.fillRect(268,204,70,36);fill(g,'#f2f5f4');g.fillRect(274,190,34,19);fill(g,'#7a5540');g.fillRect(170,650,50,16);stroke(g,'#5d493b',3);g.strokeRect(20,104,350,560);fill(g,'#f3e6bc',0.3);g.fillRect(330,178,40,480);
    });
  }

  function blockedWorld(x, y, radius) {
    if (x < radius + 12 || x > WORLD_W - radius - 12 || y < radius + 10 || y > WORLD_H - radius - 10) return true;
    if (y < 300 && !(x > 340 && x < 440 && y > 180)) return true;
    for (var i=0;i<OBSTACLES.length;i++){var b=OBSTACLES[i];if(x>b.x-radius&&x<b.x+b.w+radius&&y>b.y-radius&&y<b.y+b.h+radius)return true;}
    return false;
  }
  function blockedCottage(x,y,radius) {
    if (x < 40+radius || x > 350-radius || y < 170+radius || y > 642-radius) return true;
    if (x < 150 && y < 252 && y > 180) return true;
    if (x > 250 && y < 258 && y > 174) return true;
    return false;
  }
  function safeWorldTarget(x,y) {
    x=clamp(x,32,WORLD_W-32);y=clamp(y,120,WORLD_H-32);
    if (!blockedWorld(x,y,16)) return {x:x,y:y};
    for(var r=24;r<180;r+=24)for(var q=0;q<12;q++){var a=q*Math.PI/6;var xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r;if(!blockedWorld(xx,yy,16))return{x:xx,y:yy};}
    return {x:390,y:560};
  }
  function pathTo(startX,startY,targetX,targetY,inside) {
    var cell=24, cols=Math.ceil((inside?350:WORLD_W)/cell), rows=Math.ceil((inside?700:WORLD_H)/cell), max=cols*rows;
    var grid=new Uint8Array(max), prev=new Int32Array(max), queue=new Int32Array(max); prev.fill(-2);
    var solid=inside?blockedCottage:blockedWorld;
    for(var gy=0;gy<rows;gy++)for(var gx=0;gx<cols;gx++)grid[gy*cols+gx]=solid((gx+.5)*cell,(gy+.5)*cell,14)?1:0;
    var sx=clamp(Math.floor(startX/cell),0,cols-1),sy=clamp(Math.floor(startY/cell),0,rows-1),tx=clamp(Math.floor(targetX/cell),0,cols-1),ty=clamp(Math.floor(targetY/cell),0,rows-1);
    var si=sy*cols+sx,ti=ty*cols+tx; if(grid[si])return[]; if(grid[ti]){var near=inside?{x:clamp(targetX,32,330),y:clamp(targetY,188,630)}:safeWorldTarget(targetX,targetY);tx=clamp(Math.floor(near.x/cell),0,cols-1);ty=clamp(Math.floor(near.y/cell),0,rows-1);ti=ty*cols+tx;}
    var head=0,tail=0;prev[si]=-1;queue[tail++]=si;
    while(head<tail){var cur=queue[head++];if(cur===ti)break;var cx=cur%cols,cy=(cur/cols)|0;for(var k=0;k<4;k++){var nx=cx+(k===0?1:k===1?-1:0),ny=cy+(k===2?1:k===3?-1:0);if(nx<0||ny<0||nx>=cols||ny>=rows)continue;var ni=ny*cols+nx;if(prev[ni]!==-2||grid[ni])continue;prev[ni]=cur;queue[tail++]=ni;}}
    if(prev[ti]===-2)return[]; var cells=[],c=ti;while(c>=0&&cells.length<128){cells.push(c);c=prev[c];}cells.reverse();var out=[];
    for(var i=1;i<cells.length;i++){var px=(cells[i]%cols+.5)*cell,py=(((cells[i]/cols)|0)+.5)*cell;if(i===cells.length-1||i%2===0)out.push({x:px,y:py});}
    if(!out.length)out.push({x:targetX,y:targetY});return out;
  }

  var GameScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function GameScene() { Phaser.Scene.call(this,{key:'willowmere'}); },

    create: function () {
      this.s=normalizeSave(kit.save.get(null)); this.mode='title'; this.pausedByKit=false; this.clock=0; this.acc=0;
      this.moveTarget=null; this.path=[]; this.actionTarget=null; this.joystick={id:null,x:0,y:0,dx:0,dy:0};
      this.drag={id:null,index:-1}; this.ghost={x:220,y:410,rot:0,valid:true}; this.craftPage=0; this.giftPage=0; this.toast={text:'',t:0}; this.tutorialT=5;
      this.lastSeason=-1; this.lastMusic=''; this.npcPositions=[]; this.nodePositions=[]; this.dynShake={x:0,y:0};
      for(var i=0;i<4;i++)bakeWorld(this,'world-'+SEASONS[i].id,i); bakeCottage(this,'cottage');
      makeTexture(this,'wm_dot',8,8,function(g){fill(g,'#ffffff');g.fillRect(0,0,8,8);});
      iconTexture(this,'wm_bag','bag','#f5dda0');iconTexture(this,'wm_gear','gear','#d9e9dc');iconTexture(this,'wm_hand','hand','#f5dda0');iconTexture(this,'wm_leaf','leaf','#8dd7aa');iconTexture(this,'wm_heart','heart','#f19a9d');iconTexture(this,'wm_rotate','rotate','#f5dda0');iconTexture(this,'wm_undo','undo','#f5dda0');
      this.worldImage=this.add.image(0,0,'world-'+SEASONS[seasonIndex(this.s.day)].id).setOrigin(0).setDepth(0);
      this.cottageImage=this.add.image(0,0,'cottage').setOrigin(0).setDepth(0).setVisible(false);
      this.dyn=this.add.graphics().setDepth(20); this.weather=this.add.graphics().setDepth(24);
      /* The UI layer is authored in screen space (0..VW, 0..VH), so it must be
         pinned to the camera. Without scrollFactor 0 the HUD, the stick, the
         action button and every panel slide away with the world scroll. */
      this.uiG=this.add.graphics().setDepth(180).setScrollFactor(0); this.uiTexts=[]; for(i=0;i<72;i++){var ut=text(this,0,0,'',14,'#f5f3df','600',0,0);ut.setDepth(220);ut.setScrollFactor(0);ut.setVisible(false);this.uiTexts.push(ut);}
      this.icons={bag:this.add.image(290,34,'wm_bag').setDisplaySize(28,28).setDepth(221),gear:this.add.image(352,34,'wm_gear').setDisplaySize(28,28).setDepth(221),action:this.add.image(330,758,'wm_hand').setDisplaySize(30,30).setDepth(221),rotate:this.add.image(63,94,'wm_rotate').setDisplaySize(26,26).setDepth(221),undo:this.add.image(115,94,'wm_undo').setDisplaySize(26,26).setDepth(221)};
      for(var ik in this.icons)this.icons[ik].setScrollFactor(0);
      this.sparkEmitter=this.add.particles(0,0,'wm_dot',{speed:{min:45,max:145},angle:{min:0,max:360},lifespan:{min:320,max:720},scale:{start:.8,end:0},alpha:{start:.9,end:0},emitting:false,blendMode:Phaser.BlendModes.ADD,maxAliveParticles:42}).setDepth(80);
      this.leafEmitter=this.add.particles(0,0,'wm_dot',{speed:{min:20,max:80},angle:{min:230,max:310},lifespan:{min:500,max:1000},scale:{start:1.1,end:0},alpha:{start:.7,end:0},emitting:false,tint:hex('#d88988'),maxAliveParticles:24}).setDepth(79);
      this.camera=this.cameras.main; this.camera.setBounds(0,0,WORLD_W,WORLD_H); this.camera.setScroll(0,0);
      this.installPointerBridge(); this.refreshStage(true); this.syncState();
      sceneLive=this; BRIDGE.state.ready=true; BRIDGE.game=this; BRIDGE.kit=kit;
      kit.loader.progress(1); kit.loader.hide();
    },

    installPointerBridge: function () {
      if(root.__wmPointerBridge)return; root.__wmPointerBridge=true; var pointers={}; var self=this;
      function local(e){var c=self.game.canvas,r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*VW/Math.max(1,r.width),y:(e.clientY-r.top)*VH/Math.max(1,r.height)};}
      root.addEventListener('pointerdown',function(e){if(!sceneLive||kit.paused||sceneLive.pausedByKit)return;var p=local(e);p.id=e.pointerId;p.sx=p.x;p.sy=p.y;p.kind='tap';p.moved=false;pointers[e.pointerId]=p;sceneLive.pointerDown(p);},{passive:true});
      root.addEventListener('pointermove',function(e){var p=pointers[e.pointerId];if(!p||!sceneLive)return;var q=local(e);p.x=q.x;p.y=q.y;if(Math.hypot(p.x-p.sx,p.y-p.sy)>9)p.moved=true;sceneLive.pointerMove(p);},{passive:true});
      root.addEventListener('pointerup',function(e){var p=pointers[e.pointerId];if(!p)return;delete pointers[e.pointerId];if(sceneLive){if(kit.paused||sceneLive.pausedByKit)sceneLive.pointerCancel(p);else sceneLive.pointerUp(p);}}, {passive:true});
      root.addEventListener('pointercancel',function(e){var p=pointers[e.pointerId];if(!p)return;delete pointers[e.pointerId];if(sceneLive)sceneLive.pointerCancel(p);},{passive:true});
      root.addEventListener('keydown',function(e){if(sceneLive)sceneLive.key(e,true);});root.addEventListener('keyup',function(e){if(sceneLive)sceneLive.key(e,false);});
      function clearGestures(){pointers={};if(sceneLive){sceneLive.joystick.id=null;sceneLive.joystick.dx=0;sceneLive.joystick.dy=0;sceneLive.drag.index=-1;}}
      root.addEventListener('blur',clearGestures);document.addEventListener('visibilitychange',function(){if(document.hidden)clearGestures();});
    },

    pointerDown: function (p) {
      if(this.mode==='title'){if(this.inRect(p.x,p.y,95,548,200,64))this.beginPlay();return;}
      if(this.mode==='festival'){if(this.inRect(p.x,p.y,95,690,200,56))this.closeFestival();return;}
      if(this.mode==='decorate'){if(this.inRect(p.x,p.y,34,70,58,48)){this.rotateSelected();p.kind='button';return;}if(this.inRect(p.x,p.y,86,70,58,48)){this.undoPlacement();p.kind='button';return;}if(this.inRect(p.x,p.y,300,70,68,48)){this.finishDecorate();p.kind='button';return;}if(p.y>690){this.decorateTrayTap(p);return;}for(var di=this.s.placements.length-1;di>=0;di--){var dp=this.s.placements[di],df=FURN[dp.id];if(df&&Math.abs(p.x-dp.x)<Math.max(30,df.w/2)&&Math.abs(p.y-dp.y)<Math.max(30,df.h/2)){this.drag.index=di;this.drag.oldX=dp.x;this.drag.oldY=dp.y;this.ghost={x:dp.x,y:dp.y,rot:dp.rot,valid:true};p.kind='decorate';return;}}p.kind='decorate';this.decorateMove(p);return;}
      var b=this.hitButton(p.x,p.y);if(b){p.kind='button';p.button=b;return;}
      if(this.mode==='craft'||this.mode==='bag'||this.mode==='gift'||this.mode==='dialog'||this.mode==='menu'){p.kind='panel';return;}
      if(p.y>690&&p.x<150){p.kind='stick';this.joystick.id=p.id;this.joystick.x=p.x;this.joystick.y=p.y;this.joystick.dx=0;this.joystick.dy=0;return;}
      if(this.mode==='play'||this.mode==='cottage'){p.kind='tap';}
    },
    pointerMove: function (p) { if(p.kind==='stick'){this.joystick.dx=clamp((p.x-this.joystick.x)/46,-1,1);this.joystick.dy=clamp((p.y-this.joystick.y)/46,-1,1);}else if(p.kind==='decorate')this.decorateMove(p); },
    pointerUp: function (p) { if(p.kind==='stick'){this.joystick.id=null;this.joystick.dx=0;this.joystick.dy=0;return;} if(p.kind==='button'&&p.button){if(!p.moved)this.fireButton(p.button);return;} if(p.kind==='panel'){if(!p.moved)this.panelTap(p.x,p.y);return;} if(p.kind==='decorate'){this.decorateDrop();return;} if(p.kind==='tap'&&!p.moved){if(this.mode==='play'||this.mode==='cottage')this.playTap(p.x,p.y);} },
    pointerCancel: function (p) { if(p.kind==='stick'){this.joystick.id=null;this.joystick.dx=0;this.joystick.dy=0;}if(p.kind==='decorate')this.decorateDrop(); },
    key: function (e,down) { if(!down||kit.paused)return;var k=(e.key||'').toLowerCase();if(this.mode==='title'&&(k==='enter'||k===' ')){this.beginPlay();e.preventDefault();return;}if(k==='escape'){if(this.mode==='decorate')this.finishDecorate();else if(this.mode!=='play'&&this.mode!=='cottage')this.mode='play';else this.mode='menu';e.preventDefault();return;}if(k==='e'||k===' '){if(this.mode==='play'||this.mode==='cottage')this.contextAction();else if(this.mode==='dialog')this.advanceDialog();e.preventDefault();return;}if(k==='i'){this.mode=this.mode==='bag'?'play':'bag';return;}if(k==='c'&&this.s.scene==='cottage'){this.mode=this.mode==='craft'?'cottage':'craft';return;}if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k)>=0){this.keys=this.keys||{};this.keys[k]=down;e.preventDefault();}},
    inRect: function (x,y,rx,ry,rw,rh) { return x>=rx&&x<=rx+rw&&y>=ry&&y<=ry+rh; },

    beginPlay: function () { if(this.mode!=='title')return;this.mode=this.s.scene==='cottage'?'cottage':'play';this.toastBeat('A gentle year begins.',2.4);this.playMusic();kit.audio.sfx('sfx_ui',{volume:.55}); },
    resetSave: function () { this.s=blankSave();this.mode='play';this.moveTarget=null;this.path=[];this.refreshStage(true);this.toastBeat('A fresh year in Willowmere.',2.2);saveState(this.s); },
    closeFestival: function () { this.mode='play';this.s.festivalFlags=[0,1,2,3];saveState(this.s); },
    refreshStage: function (snap) { var d=districtAt(this.s.x,this.s.y);this.s.lastStage=d.id;if(snap){this.player={x:this.s.x,y:this.s.y,fx:this.s.fx,fy:this.s.fy,anim:0};this.camera.setScroll(clamp(this.s.x-VW/2,0,WORLD_W-VW),clamp(this.s.y-VH/2,0,WORLD_H-VH));} },
    currentSeason: function () { return seasonIndex(this.s.day); },
    syncState: function () {
      var si=this.currentSeason(), d=districtAt(this.s.x,this.s.y),friend=0,stories=0;NPCS.forEach(function(n){var a=this.s.npc[n.id];friend+=a.tier;stories+=a.story2?1:0;},this);
      WM_STATE.mode=this.mode;WM_STATE.scene=this.s.scene;WM_STATE.day=this.s.day;WM_STATE.season=SEASONS[si].id;WM_STATE.weather=weatherFor(this.s.day,si);WM_STATE.stage=d.id;WM_STATE.currentStage=d.name;WM_STATE.friendship=friend;WM_STATE.progress=clamp((friend+this.s.stats.gather*.025+this.s.stats.craft*.03)/60,0,1);WM_STATE.score=this.s.stats.gather*10+this.s.stats.craft*30+friend*20+stories*100;WM_STATE.health=100;WM_STATE.placements=this.s.placements.length;WM_STATE.inventory=Object.keys(this.s.inv).length;WM_STATE.action=this.actionLabel();WM_STATE.lastBeat=this.toast.text||'quiet';WM_STATE.forceMode=BRIDGE.forceMode;WM_STATE.forceStage=BRIDGE.forceStage;
    },
    syncForces: function () {
      if(BRIDGE.forceStage && this.mode!=='title'){var target=null;for(var i=0;i<DISTRICTS.length;i++)if(DISTRICTS[i].id===BRIDGE.forceStage||DISTRICTS[i].name.toLowerCase()===String(BRIDGE.forceStage).toLowerCase())target=DISTRICTS[i];if(target&&this.s.scene==='world'){this.s.x=target.spawn[0];this.s.y=target.spawn[1];this.player.x=this.s.x;this.player.y=this.s.y;this.refreshStage(true);}}
      if(BRIDGE.forceMode){var m=String(BRIDGE.forceMode);if(m==='play'||m==='cottage'||m==='craft'||m==='bag'||m==='decorate'||m==='dialog'||m==='gift'||m==='festival'||m==='menu'){this.mode=m;if(m==='cottage'||m==='craft'||m==='decorate'){this.s.scene='cottage';this.player.x=195;this.player.y=610;}else if(m==='play'&&this.s.scene==='cottage'){this.s.scene='world';this.player.x=552;this.player.y=590;this.refreshStage(true);}}}
    },
    playMusic: function () { var track=this.s.tod>.72?'music_night':'music_'+SEASONS[this.currentSeason()].id;if(track!==this.lastMusic){this.lastMusic=track;kit.audio.music(track,850);} },
    toastBeat: function (msg,seconds) { this.toast.text=msg;this.toast.t=seconds||1;this.tutorialT=0; },
    juiceBeat: function (x,y,kind) { var fx=kit.juice.frame();if(!kit.juice.enabled)return;kit.juice.shake(kind==='big'?4:2,kind==='big'?150:90);kit.juice.hitStop(kind==='big'?55:38);this.sparkEmitter.explode(kind==='big'?20:10,x,y);this.leafEmitter.explode(kind==='big'?10:5,x,y); },
    update: function (time,delta) {
      if(!this.player)return;this.syncForces();var raw=clamp(num(delta,0)/1000,0,1/30),juice=kit.juice.frame();this.dynShake.x=juice.dx;this.dynShake.y=juice.dy;
      if(!this.pausedByKit&&!juice.frozen){this.clock+=raw;if(this.toast.t>0)this.toast.t-=raw;this.tutorialT=Math.max(0,this.tutorialT-raw);this.step(raw);}
      this.renderWorld();this.renderUI();this.syncState();
    },
    step: function (dt) {
      if(this.mode==='play'||this.mode==='cottage'||this.mode==='decorate'){this.s.tod+=dt/DAY_SECONDS;if(this.s.tod>=1){this.s.tod=0;this.s.day++;var ns=this.currentSeason();if(this.s.seenSeasons.indexOf(ns)<0)this.s.seenSeasons.push(ns);this.toastBeat('A new morning in '+SEASONS[ns].name+'.',2.4);kit.audio.sfx('sfx_day',{volume:.55});this.juiceBeat(this.player.x,this.player.y,'big');}this.movePlayer(dt);this.playMusic();}
      this.refreshStage(false);if(this.mode==='play'&&this.s.scene==='world'){this.camera.setScroll(lerp(this.camera.scrollX,clamp(this.player.x-VW/2,0,WORLD_W-VW),Math.min(1,dt*5)),lerp(this.camera.scrollY,clamp(this.player.y-400,0,WORLD_H-VH),Math.min(1,dt*5)));}
      this.s.x=this.player.x;this.s.y=this.player.y;this.s.fx=this.player.fx;this.s.fy=this.player.fy;this.s.stats.steps+=this.player.moving?1:0;
      if(this.s.stats.steps%20===0)saveState(this.s);
    },
    movePlayer: function (dt) {
      var kx=0,ky=0,K=this.keys||{};if(K.a||K.arrowleft||kit.input.keyDown('KeyA')||kit.input.keyDown('ArrowLeft'))kx--;if(K.d||K.arrowright||kit.input.keyDown('KeyD')||kit.input.keyDown('ArrowRight'))kx++;if(K.w||K.arrowup||kit.input.keyDown('KeyW')||kit.input.keyDown('ArrowUp'))ky--;if(K.s||K.arrowdown||kit.input.keyDown('KeyS')||kit.input.keyDown('ArrowDown'))ky++;
      if(this.joystick.id!==null){kx=this.joystick.dx;ky=this.joystick.dy;}
      this.player.moving=false;var inside=this.s.scene==='cottage',solid=inside?blockedCottage:blockedWorld;
      if(kx||ky){this.moveTarget=null;this.path=[];var mag=Math.hypot(kx,ky)||1;this.tryMove(kx/mag*PLAYER_SPEED*dt,ky/mag*PLAYER_SPEED*dt,solid);}
      else if(this.moveTarget){var aim=this.path.length?this.path[0]:this.moveTarget,dx=aim.x-this.player.x,dy=aim.y-this.player.y,d=Math.hypot(dx,dy);if(d<7&&this.path.length){this.path.shift();aim=this.path.length?this.path[0]:this.moveTarget;dx=aim.x-this.player.x;dy=aim.y-this.player.y;d=Math.hypot(dx,dy);}if(d<7){var a=this.actionTarget;this.moveTarget=null;this.path=[];if(a)this.performAction(a);}else this.tryMove(dx/d*PLAYER_SPEED*dt,dy/d*PLAYER_SPEED*dt,solid);}
      if(this.player.moving){this.player.anim+=dt*9;this.player.fx=this.player.vx;this.player.fy=this.player.vy;if(Math.floor(this.player.anim)%5===0&&Math.random()<.08)kit.audio.sfx('sfx_step',{volume:.18});}else this.player.anim=0;
    },
    tryMove: function (dx,dy,solid) { var nx=this.player.x+dx,ny=this.player.y+dy,ok=false;if(!solid(nx,this.player.y,15)){this.player.x=nx;ok=true;}if(!solid(this.player.x,ny,15)){this.player.y=ny;ok=true;}this.player.vx=dx;this.player.vy=dy;this.player.moving=ok;if(ok)WM_STATE.moveCount++; },
    startMove: function (x,y,action) { var inside=this.s.scene==='cottage',safe=inside?{x:clamp(x,60,330),y:clamp(y,190,630)}:safeWorldTarget(x,y);this.path=pathTo(this.player.x,this.player.y,safe.x,safe.y,inside);this.moveTarget=safe;this.actionTarget=action||null; },
    playTap: function (x,y) { if(y>690||y<62)return;var wx=x,wy=y;if(this.s.scene==='world'){wx+=this.camera.scrollX;wy+=this.camera.scrollY;}var near=this.nearest(wx,wy,56);if(near){if(dist(this.player.x,this.player.y,near.x,near.y)<62)this.performAction(near);else this.startMove(near.x,near.y,near);return;}this.startMove(wx,wy,null);this.sparkEmitter.explode(5,wx,wy); },
    npcPosition: function (n,index) { var wob=Math.sin(this.clock*0.7+index)*4;return{x:n.spot[0]+wob,y:n.spot[1]+Math.cos(this.clock*.55+index)*3}; },
    nearest: function (x,y,max) {
      var out=[],i,p,d,best=null,bd=max*max;
      if(this.s.scene==='world'){
        out.push({type:'fish',id:'silverfin',x:400,y:240,label:'Cast a line'});out.push({type:'cottage',x:552,y:566,label:'Enter cottage'});out.push({type:'mill',x:390,y:1240,label:'Visit the old mill'});
        for(i=0;i<GATHER_POINTS.length;i++){p=GATHER_POINTS[i];if(this.s.harvested[i]===this.s.day)continue;out.push({type:'node',index:i,x:p.x,y:p.y,item:currentNodeItem(p,this.currentSeason()),label:'Gather'});}
        this.npcPositions=[];for(i=0;i<NPCS.length;i++){p=this.npcPosition(NPCS[i],i);this.npcPositions[i]=p;out.push({type:'npc',index:i,x:p.x,y:p.y,label:'Talk'});}
      } else {
        out=[{type:'bench',x:86,y:268,label:'Craft'},{type:'bed',x:300,y:278,label:'Rest'},{type:'exit',x:195,y:640,label:'Go outside'}];
      }
      for(i=0;i<out.length;i++){d=dist(x,y,out[i].x,out[i].y);if(d*d<bd){bd=d*d;best=out[i];}}return best;
    },
    contextAction: function () { if(this.mode==='title'){this.beginPlay();return;}if(this.mode==='dialog'){this.advanceDialog();return;}if(this.mode==='decorate')return;var a=this.nearest(this.player.x,this.player.y,72);if(a)this.performAction(a);else this.toastBeat('Nothing nearby yet.',1); },
    forceMove: function (x,y) { if(this.mode==='title')this.beginPlay();if(this.s.scene==='world'){var q=safeWorldTarget(x,y);this.startMove(q.x,q.y,null);}else this.startMove(x,y,null); },
    forceGather: function () { for(var i=0;i<GATHER_POINTS.length;i++){if(this.s.harvested[i]!==this.s.day){var p=GATHER_POINTS[i];this.player.x=p.x;this.player.y=p.y;this.performAction({type:'node',index:i,x:p.x,y:p.y,item:currentNodeItem(p,this.currentSeason())});return;}} },
    performAction: function (a) {
      if(!a)return;
      if(a.type==='node'){this.gather(a.index);return;}if(a.type==='fish'){this.catchFish();return;}if(a.type==='npc'){this.openNpc(a.index);return;}
      if(a.type==='cottage'){this.s.scene='cottage';this.mode='cottage';this.player.x=195;this.player.y=610;this.camera.setScroll(0,0);this.toastBeat('Home, with room to make it yours.',1.8);kit.audio.sfx('sfx_ui',{volume:.45});saveState(this.s);return;}
      if(a.type==='exit'){this.s.scene='world';this.mode='play';this.player.x=552;this.player.y=590;this.refreshStage(true);this.toastBeat('Back to the village.',1.4);saveState(this.s);return;}
      if(a.type==='bench'){this.mode='craft';this.craftPage=0;return;}if(a.type==='bed'){this.s.tod=0;this.s.day++;this.toastBeat('Morning finds you rested.',1.8);kit.audio.sfx('sfx_day',{volume:.5});saveState(this.s);return;}
      if(a.type==='mill'){this.startFestival(3);return;}
    },
    gather: function (index) {
      if(index<0||index>=GATHER_POINTS.length||this.s.harvested[index]===this.s.day)return;var p=GATHER_POINTS[index],id=currentNodeItem(p,this.currentSeason()),it=ITEM[id];if(!it)return;
      this.s.harvested[index]=this.s.day;this.s.inv[id]=(this.s.inv[id]||0)+1;this.s.stats.gather++;this.toastBeat('+1 '+it.name,1);this.juiceBeat(p.x,p.y,'small');kit.audio.sfx('sfx_gather',{volume:.62});saveState(this.s);
    },
    catchFish: function () { var season=this.currentSeason(),choices=season===0?['silverfin','ribbonfish']:season===1?['sunperch','silverfin']:season===2?['emberscale','duskcarp']:['duskcarp','lanternfish'];var id=pick(choices);this.s.inv[id]=(this.s.inv[id]||0)+1;this.s.stats.gather++;this.toastBeat('+1 '+ITEM[id].name,1);this.juiceBeat(400,240,'big');kit.audio.sfx('sfx_gather',{volume:.7});saveState(this.s); },
    openNpc: function (index) {
      var n=NPCS[index],a=this.s.npc[n.id],tier=clamp(Math.floor(a.points/6),0,5),lines;
      if(tier>=2&&!a.story1){lines=n.stories[0].slice();this.dialog={npc:index,kind:'story1',lines:lines,index:0};this.mode='dialog';kit.audio.sfx('sfx_heart',{volume:.6});return;}
      if(tier>=4&&a.story1&&!a.story2){lines=n.stories[1].slice();this.dialog={npc:index,kind:'story2',lines:lines,index:0};this.mode='dialog';kit.audio.sfx('sfx_heart',{volume:.6});return;}
      if(a.request<2){var req=n.request[a.request],have=this.s.inv[req[0]]||0;if(have>=req[1]){this.s.inv[req[0]]-=req[1];if(!this.s.inv[req[0]])delete this.s.inv[req[0]];a.request++;a.points=clamp(a.points+2,0,30);this.toastBeat(n.name.split(' ')[0]+' is glad you came through.',1.6);this.juiceBeat(n.spot[0],n.spot[1],'small');saveState(this.s);}}
      tier=clamp(Math.floor(a.points/6),0,5);this.dialog={npc:index,kind:'talk',lines:[n.greet[Math.min(2,Math.floor(tier/2))]],index:0};this.mode='dialog';kit.audio.sfx('sfx_ui',{volume:.45});
    },
    advanceDialog: function () {
      if(!this.dialog)return;var d=this.dialog;if(d.index<d.lines.length-1){d.index++;kit.audio.sfx('sfx_ui',{volume:.35});return;}var n=NPCS[d.npc],a=this.s.npc[n.id];
      if(d.kind==='story1'){a.story1=true;a.tier=Math.max(a.tier,2);this.toastBeat(n.name.split(' ')[0]+' shared a story.',1.6);this.mode='play';this.dialog=null;saveState(this.s);return;}
      if(d.kind==='story2'){a.story2=true;a.tier=Math.max(a.tier,4);this.award(n);this.toastBeat(n.name.split(' ')[0]+' gave you something lasting.',1.8);this.mode='play';this.dialog=null;saveState(this.s);if(this.allStories())this.startFestival(3);return;}
    },
    award: function (n) { if(FURN[n.reward])this.s.owned[n.reward]=(this.s.owned[n.reward]||0)+1;else if(n.reward==='amberwash')this.s.styles.wall=1;else if(n.reward==='lakewood')this.s.styles.floor=1;kit.audio.sfx('sfx_festival',{volume:.55});this.juiceBeat(this.player.x,this.player.y,'big'); },
    allStories: function () { for(var i=0;i<NPCS.length;i++)if(!this.s.npc[NPCS[i].id].story2)return false;return true; },
    giftItems: function () { var out=[];for(var id in this.s.inv)if(this.s.inv[id]>0&&ITEM[id])out.push(id);return out; },
    giftItem: function (id) { if(!this.dialog)return;var n=NPCS[this.dialog.npc],a=this.s.npc[n.id],count=this.s.inv[id]||0;if(!count)return;this.s.inv[id]--;if(!this.s.inv[id])delete this.s.inv[id];var pts=id===n.loves?5:id===n.likes?3:id===n.hates?-2:1;a.points=clamp(a.points+pts,0,30);a.tier=clamp(Math.floor(a.points/6),0,5);a.giftDay=this.s.day;this.dialog={npc:this.dialog.npc,kind:'talk',lines:[pts>=5?'You remembered exactly what I love.':pts>=3?'That is a thoughtful one.':pts<0?'I will try to find a use for it.':'Thank you. I will keep it close.'],index:0};this.mode='dialog';this.s.stats.gift++;this.toastBeat((pts>=3?'A warm exchange.':'A small exchange.'),1);this.juiceBeat(n.spot[0],n.spot[1],pts>=3?'big':'small');kit.audio.sfx(pts>=3?'sfx_heart':'sfx_gift',{volume:.6});saveState(this.s); },
    canCraft: function (f) { for(var id in f.recipe)if((this.s.inv[id]||0)<f.recipe[id])return false;return true; },
    craft: function (index) { var f=FURNITURE[index];if(!f)return;if(!this.canCraft(f)){this.toastBeat('Gather the materials first.',1);kit.audio.sfx('sfx_ui',{volume:.45});return;}for(var id in f.recipe){this.s.inv[id]-=f.recipe[id];if(!this.s.inv[id])delete this.s.inv[id];}this.s.owned[f.id]=(this.s.owned[f.id]||0)+1;this.s.stats.craft++;this.toastBeat(f.name+' made.',1);this.juiceBeat(195,170,'big');kit.audio.sfx('sfx_craft',{volume:.7});saveState(this.s); },
    availableFurniture: function () { var out=[];for(var i=0;i<FURNITURE.length;i++){var f=FURNITURE[i],placed=0;for(var j=0;j<this.s.placements.length;j++)if(this.s.placements[j].id===f.id)placed++;if((this.s.owned[f.id]||0)>placed)out.push(f);}return out; },
    enterDecorate: function () { if(this.s.scene!=='cottage')return;this.mode='decorate';this.selectedFurniture=null;this.drag.index=-1;this.toastBeat('Place, rotate, or undo. The door stays clear.',2); },
    decorateTrayTap: function (p) { var items=this.availableFurniture(),slot=Math.floor((p.x-12)/92),row=Math.floor((p.y-706)/62),index=this.craftPage*8+row*4+slot;if(slot<0||slot>3||row<0||row>1||!items[index])return;this.selectedFurniture=items[index].id;this.ghost={x:220,y:410,rot:0,valid:true};this.drag.index=-2;kit.audio.sfx('sfx_ui',{volume:.4}); },
    decorateMove: function (p) { if(p.y<150){return;}var x=clamp(Math.round(p.x/GRID)*GRID,58,332),y=clamp(Math.round(p.y/GRID)*GRID,192,630);if(this.drag.index>=0){var pl=this.s.placements[this.drag.index];if(pl){pl.x=x;pl.y=y;this.ghost={x:x,y:y,rot:pl.rot,valid:this.validPlacement(pl,this.drag.index)};}}else if(this.selectedFurniture){this.ghost.x=x;this.ghost.y=y;this.ghost.valid=this.validPlacement({id:this.selectedFurniture,x:x,y:y,rot:this.ghost.rot},-1);} },
    decorateDrop: function () { if(this.drag.index>=0){if(!this.ghost.valid){this.s.placements[this.drag.index].x=this.drag.oldX;this.s.placements[this.drag.index].y=this.drag.oldY;this.toastBeat('That spot is too tight.',1);}else{saveState(this.s);kit.audio.sfx('sfx_place',{volume:.5});}this.drag.index=-1;return;}if(this.selectedFurniture){if(!this.ghost.valid){this.toastBeat('That spot is too tight.',1);return;}this.s.placements.push({id:this.selectedFurniture,x:this.ghost.x,y:this.ghost.y,rot:this.ghost.rot});this.selectedFurniture=null;this.drag.index=-1;this.toastBeat('Placed.',.8);this.juiceBeat(this.ghost.x,this.ghost.y,'small');kit.audio.sfx('sfx_place',{volume:.6});saveState(this.s);} },
    validPlacement: function (p,skip) { var f=FURN[p.id];if(!f)return false;var w=f.w/2,h=f.h/2;if(p.x-w<32||p.x+w>358||p.y-h<180||p.y+h>642)return false;if(p.x>160&&p.x<230&&p.y>612)return false;for(var i=0;i<this.s.placements.length;i++){if(i===skip)continue;var q=this.s.placements[i],g=FURN[q.id];if(Math.abs(p.x-q.x)<(w+g.w/2-4)&&Math.abs(p.y-q.y)<(h+g.h/2-4))return false;}return true; },
    rotateSelected: function () { if(this.drag.index>=0&&this.s.placements[this.drag.index])this.s.placements[this.drag.index].rot=(this.s.placements[this.drag.index].rot+1)%4;else if(this.selectedFurniture)this.ghost.rot=(this.ghost.rot+1)%4;this.toastBeat('Turned.',.7);kit.audio.sfx('sfx_rotate',{volume:.52}); },
    undoPlacement: function () { if(this.s.placements.length){this.s.placements.pop();this.toastBeat('Last placement undone.',.8);kit.audio.sfx('sfx_ui',{volume:.45});saveState(this.s);} },
    finishDecorate: function () { this.selectedFurniture=null;this.drag.index=-1;this.mode='cottage';saveState(this.s);this.toastBeat('A room that feels like yours.',1.3); },
    startFestival: function (season) { if(season===3&&!this.allStories()&&this.s.stats.craft<8)return;var f=FESTIVALS[season]||FESTIVALS[3];if(this.s.festivalFlags.indexOf(season)<0)this.s.festivalFlags.push(season);this.mode='festival';this.festival=f;kit.audio.sfx('sfx_festival',{volume:.8});this.juiceBeat(195,380,'big');saveState(this.s); },
    hitButton: function (x,y) {
      if(this.mode==='play'||this.mode==='cottage'){if(this.inRect(x,y,264,8,52,52))return 'bag';if(this.inRect(x,y,326,8,52,52))return 'settings';if(this.inRect(x,y,286,720,100,86))return 'action';if(this.mode==='cottage'&&this.inRect(x,y,174,720,98,56))return 'decorate';}
      if(this.mode==='menu'){if(this.inRect(x,y,70,316,250,56))return 'sound';if(this.inRect(x,y,70,386,250,56))return 'settings';if(this.inRect(x,y,70,456,250,56))return 'close';}
      if(this.mode==='craft'||this.mode==='bag'||this.mode==='gift'){if(this.inRect(x,y,324,76,52,52))return 'close';}
      if(this.mode==='dialog'){if(this.inRect(x,y,25,726,160,58))return 'gift';if(this.inRect(x,y,205,726,160,58))return 'continue';}
      return null;
    },
    fireButton: function (b) { if(b==='bag'){this.mode='bag';return;}if(b==='settings'){kit.openSettings();return;}if(b==='action'){this.contextAction();return;}if(b==='decorate'){this.enterDecorate();return;}if(b==='close'){this.mode=this.s.scene==='cottage'?'cottage':'play';return;}if(b==='sound'){kit.audio.setMute(!kit.audio.prefs.mute);return;}if(b==='continue'){this.advanceDialog();return;}if(b==='gift'){if(this.dialog)this.mode='gift';return;} },
    panelTap: function (x,y) {
      if(this.mode==='bag'){if(this.inRect(x,y,324,76,52,52))this.mode='play';return;}
      if(this.mode==='craft'){if(this.inRect(x,y,324,76,52,52)){this.mode='cottage';return;}var page=FURNITURE.slice(this.craftPage*8,this.craftPage*8+8);for(var i=0;i<page.length;i++){var col=i%2,row=Math.floor(i/2),rx=24+col*176,ry=146+row*126;if(this.inRect(x,y,rx,ry,164,112)){this.craft(this.craftPage*8+i);return;}}if(this.inRect(x,y,24,716,80,54))this.craftPage=Math.max(0,this.craftPage-1);if(this.inRect(x,y,286,716,80,54))this.craftPage=Math.min(4,this.craftPage+1);return;}
      if(this.mode==='gift'){if(this.inRect(x,y,324,76,52,52)){this.mode='dialog';return;}var items=this.giftItems(),page=items.slice(this.giftPage*8,this.giftPage*8+8);for(i=0;i<page.length;i++){col=i%4;row=Math.floor(i/4);rx=20+col*90;ry=166+row*112;if(this.inRect(x,y,rx,ry,82,96)){this.giftItem(page[i]);return;}}return;}
      if(this.mode==='dialog'){if(this.inRect(x,y,324,76,52,52)){this.mode='play';this.dialog=null;return;}if(this.inRect(x,y,25,726,160,58)){this.mode='gift';return;}if(this.inRect(x,y,205,726,160,58)){this.advanceDialog();return;}if(y>470)this.advanceDialog();return;}
      if(this.mode==='menu'){if(this.inRect(x,y,70,456,250,56))this.mode='play';}
    },

    renderWorld: function () {
      var si=this.currentSeason(),j=this.dynShake;this.worldImage.setPosition(j.x,j.y);this.cottageImage.setPosition(0,0);this.dyn.setPosition(j.x,j.y);this.weather.setPosition(j.x,j.y);
      if(this.mode==='title'||this.s.scene==='world'){this.worldImage.setVisible(true);this.cottageImage.setVisible(false);if(si!==this.lastSeason){this.worldImage.setTexture('world-'+SEASONS[si].id);this.lastSeason=si;}this.renderField();}
      else {this.worldImage.setVisible(false);this.cottageImage.setVisible(true);this.dyn.setPosition(0,0);this.weather.setPosition(0,0);
        /* The interior is authored at the camera origin. Any path into the
           cottage that skips performAction (the __wm forceMode hook) would
           otherwise leave the world scroll in place and clip the room. */
        if(this.camera.scrollX!==0||this.camera.scrollY!==0)this.camera.setScroll(0,0);
        /* renderWeather never runs indoors, so the last outdoor frame of rain
           or snow would otherwise stay frozen on top of the room. */
        this.weather.clear();
        this.renderCottage();}
    },
    renderField: function () {
      var g=this.dyn,si=this.currentSeason(),C=SEASONS[si],i,p,n,near;g.clear();this.npcPositions=[];this.nodePositions=[];
      for(i=0;i<GATHER_POINTS.length;i++){p=GATHER_POINTS[i];this.nodePositions[i]=p;if(p.x<this.camera.scrollX-50||p.x>this.camera.scrollX+VW+50||p.y<this.camera.scrollY-60||p.y>this.camera.scrollY+VH+50)continue;this.drawNode(g,p,i,this.s.harvested[i]===this.s.day,currentNodeItem(p,si));}
      for(i=0;i<NPCS.length;i++){n=NPCS[i];p=this.npcPosition(n,i);this.npcPositions[i]=p;if(p.x>this.camera.scrollX-50&&p.x<this.camera.scrollX+VW+50&&p.y>this.camera.scrollY-60&&p.y<this.camera.scrollY+VH+60)this.drawNpc(g,n,p,i);}
      near=this.nearest(this.player.x,this.player.y,76);if(near){stroke(g,'#ffe39a',2,.9);g.strokeCircle(near.x,near.y-5,22+Math.sin(this.clock*4)*2);}
      this.drawPath(g);this.drawPlayer(g,this.player.x,this.player.y);this.renderWeather(si,C);
    },
    drawPath: function (g) { if(!this.path.length)return;stroke(g,'#f5e5ad',2,.45);g.beginPath();g.moveTo(this.player.x,this.player.y);for(var i=0;i<this.path.length;i++)g.lineTo(this.path[i].x,this.path[i].y);g.strokePath();var t=this.moveTarget;if(t){fill(g,'#fff0b1',.75);g.fillCircle(t.x,t.y,4);}},
    drawNode: function (g,p,index,spent,id) { var it=ITEM[id]||ITEM.reed,x=p.x,y=p.y;fill(g,'#163b3c',.2);g.fillEllipse(x,y+9,22,7);if(spent){fill(g,it.color,.28);}else fill(g,it.color,.95);if(it.kind==='fish'){g.fillEllipse(x,y,24,12);g.fillTriangle(x-12,y,x-21,y-7,x-21,y+7);fill(g,'#ffffff',.7);g.fillCircle(x+6,y-2,2);}else if(it.kind==='flower'||it.kind==='berry'){g.fillCircle(x-6,y,7);g.fillCircle(x+6,y,7);g.fillCircle(x,y-7,7);fill(g,'#f9e5ad',.9);g.fillCircle(x,y,3);}else if(it.kind==='stone'||it.kind==='clay'){g.fillTriangle(x-12,y+6,x-6,y-8,x+12,y+3);fill(g,'#ffffff',.23);g.fillCircle(x-3,y-2,3);}else if(it.kind==='wood'||it.kind==='seed'||it.kind==='nut'){g.fillRoundedRect(x-14,y-7,28,14,6);fill(g,'#6e4d36',.35);g.fillRect(x-5,y-5,3,10);}else{g.fillEllipse(x,y,24,15);fill(g,'#f2e3a4',.5);g.fillCircle(x-5,y-2,3);}if(!spent&&it.kind==='moss'&&this.currentSeason()===3){fill(g,'#dff7f3',.25);g.fillCircle(x,y,24);}},
    drawNpc: function (g,n,p,index) { var a=this.s.npc[n.id],tier=clamp(Math.floor(a.points/6),0,5),bob=Math.abs(Math.sin(this.clock*1.5+index))*2;fill(g,'#163b3c',.22);g.fillEllipse(p.x,p.y+13,12,5);fill(g,n.color);g.fillRoundedRect(p.x-9,p.y-11-bob,18,23,6);fill(g,'#f0caa8');g.fillCircle(p.x,p.y-18-bob,9);fill(g,n.hair);g.fillEllipse(p.x,p.y-23-bob,18,9);fill(g,'#203e43');g.fillCircle(p.x-3,p.y-18-bob,1.5);g.fillCircle(p.x+3,p.y-18-bob,1.5);if(dist(this.player.x,this.player.y,p.x,p.y)<84){this.uiWorldLabel(g,n.name.split(' ')[0],p.x,p.y-44,n.color);if((tier>=2&&!a.story1)||(tier>=4&&a.story1&&!a.story2)){fill(g,'#ffe29a');g.fillCircle(p.x+15,p.y-34,8);this.uiWorldLabel(g,'!',p.x+15,p.y-34,'#163b3c');}}},
    uiWorldLabel: function (g,value,x,y,color) { /* Labels are only close-range context, never a permanent HUD row. */ fill(g,'#163b3c',.84);g.fillRoundedRect(x-22,y-11,44,22,7); },
    drawPlayer: function (g,x,y) { var bob=Math.abs(Math.sin(this.player.anim))*2.2;fill(g,'#163b3c',.24);g.fillEllipse(x,y+13,12,5);fill(g,'#5b96ad');g.fillRoundedRect(x-9,y-11-bob,18,23,6);fill(g,'#f1caa7');g.fillCircle(x,y-19-bob,9);fill(g,'#4d3628');g.fillEllipse(x,y-24-bob,18,9);fill(g,'#213d43');if(Math.abs(this.player.fx)>Math.abs(this.player.fy)){g.fillRect(x+(this.player.fx>0?3:-6),y-21-bob,3,3);}else{g.fillRect(x-4,y-20-bob,3,3);g.fillRect(x+2,y-20-bob,3,3);}if(this.mode==='decorate'&&this.selectedFurniture){stroke(g,this.ghost.valid?'#8fe0a5':'#e78787',2,.95);g.strokeCircle(x,y-2,21);}},
    renderCottage: function () { var g=this.dyn;g.clear();var list=this.s.placements.slice().sort(function(a,b){return a.y-b.y;});for(var i=0;i<list.length;i++){var pl=list[i],f=FURN[pl.id];if(f)this.drawFurniture(g,f,pl.x,pl.y,1,false,pl.rot);}if(this.mode==='decorate'){if(this.selectedFurniture){var gf=FURN[this.selectedFurniture];if(gf)this.drawFurniture(g,gf,this.ghost.x,this.ghost.y,.52,true,this.ghost.rot);}if(this.drag.index>=0){var active=this.s.placements[this.drag.index],af=active&&FURN[active.id];if(af)this.drawFurniture(g,af,active.x,active.y,1,true,active.rot);}}this.drawPlayer(g,this.player.x,this.player.y);},
    drawFurniture: function (g,f,x,y,alpha,ghost,rot) { var w=f.w,h=f.h;g.save();g.translateCanvas(x,y);g.rotateCanvas((rot||0)*Math.PI/2);fill(g,'#163b3c',.18*alpha);g.fillEllipse(0,h/2-1,w*.45,6);if(f.shape==='flat'){fill(g,f.a,alpha);g.fillRoundedRect(-w/2,-h/2,w,h,6);stroke(g,f.b,3,alpha);g.strokeRoundedRect(-w/2+5,-h/2+5,w-10,h-10,4);}else if(f.shape==='round'){fill(g,f.b,alpha);g.fillCircle(0,0,w/2);fill(g,f.a,alpha);g.fillCircle(0,-2,w/2-5);}else if(f.shape==='lamp'){fill(g,f.a,alpha);g.fillRect(-5,-h/2+11,10,h-11);fill(g,f.b,alpha);g.fillCircle(0,-h/2+9,w/2);fill(g,f.b,.15*alpha);g.fillCircle(0,-h/2+9,w);}else if(f.shape==='tall'){fill(g,f.a,alpha);g.fillRoundedRect(-w/2,-h/2,w,h,5);fill(g,f.b,alpha);g.fillRect(-w/2+5,-h/2+6,w-10,h*.35);}else{fill(g,f.a,alpha);g.fillRoundedRect(-w/2,-h/2,w,h,5);fill(g,f.b,alpha);g.fillRect(-w/2+4,h/2-12,w-8,8);fill(g,'#ffffff',.16*alpha);g.fillRect(-w/2+4,-h/2+4,w-8,6);}if(ghost){stroke(g,this.ghost.valid?'#8fe0a5':'#e78787',2,.95);g.strokeRoundedRect(-w/2-4,-h/2-4,w+8,h+8,7);}g.restore();},
    renderWeather: function (si,C) { var g=this.weather;g.clear();if(this.s.scene!=='world')return;var x0=this.camera.scrollX-10,y0=this.camera.scrollY-10;if(WM_STATE.weather==='rain'){stroke(g,'#b7e0e5',1,0.55);for(var i=0;i<34;i++){var x=x0+(i*83)%410,y=y0+(i*47+this.clock*180)%860;g.lineBetween(x,y,x-4,y+12);}}else if(WM_STATE.weather==='snow'){fill(g,'#f4f8f3',.74);for(i=0;i<44;i++){x=x0+(i*67)%410;y=y0+(i*41+this.clock*26)%860;g.fillCircle(x,y,1+(i%3));}}else{fill(g,si===2?'#f1b879':'#f5e8aa',.68);for(i=0;i<8;i++){x=40+(i*97)%700;y=330+(i*61)%820;g.fillCircle(x,y,2+Math.sin(this.clock*2+i));}}
      /* Ambient creatures are quiet silhouettes, not collectible noise. */
      if(this.camera.scrollY<310){fill(g,'#f1f0dc',.8);g.fillEllipse(112+Math.sin(this.clock*.4)*9,245,22,10);g.fillCircle(123+Math.sin(this.clock*.4)*9,241,5);g.fillEllipse(170+Math.sin(this.clock*.35+2)*8,268,18,8);}
    },

    uiText: function (x,y,value,size,color,weight,ox,oy) { var t=null;for(var i=0;i<this.uiTexts.length;i++)if(!this.uiTexts[i].visible){t=this.uiTexts[i];break;}if(!t)return null;t.setVisible(true);t.setPosition(x,y);t.setOrigin(ox===undefined?.5:ox,oy===undefined?.5:oy);t.setFontSize((size||14)+'px');t.setColor(color||'#f5f3df');t.setFontStyle(weight||'600');setTextIfChanged(t,String(value));return t; },
    uiButton: function (x,y,w,h,label,primary) { round(this.uiG,x,y,w,h,14,primary?'#3d8d79':'#1c4b4b',.96);stroke(this.uiG,primary?'#9fe0c0':'#5d8883',1,.72);this.uiG.strokeRoundedRect(x+1,y+1,w-2,h-2,13);if(label)this.uiText(x+w/2,y+h/2,label,14,'#f5f3df','700'); },
    hideUI: function () { for(var i=0;i<this.uiTexts.length;i++)this.uiTexts[i].setVisible(false);this.icons.bag.setVisible(false);this.icons.gear.setVisible(false);this.icons.action.setVisible(false);this.icons.rotate.setVisible(false);this.icons.undo.setVisible(false); },
    renderUI: function () {
      var g=this.uiG;g.clear();this.hideUI();var si=this.currentSeason(),C=SEASONS[si];
      if(this.mode==='title'){this.drawTitle(g,C);return;}if(this.mode==='festival'){this.drawFestival(g);return;}if(this.mode==='menu'){this.drawMenu(g);return;}
      if(this.mode==='decorate'){this.drawDecorate(g);this.drawTransient(g);return;}
      if(this.mode==='craft'){this.drawCraft(g);return;}if(this.mode==='bag'){this.drawBag(g);return;}if(this.mode==='gift'){this.drawGift(g);return;}if(this.mode==='dialog'){this.drawDialog(g);return;}
      this.drawHUD(g,C);this.drawTransient(g);
    },
    drawTitle: function (g,C) { fill(g,'#071b20',.5);g.fillRect(0,0,VW,VH);round(g,36,184,318,424,24,'#12383b',.96);stroke(g,'#82c2a7',2,.8);g.strokeRoundedRect(36,184,318,424,24);fill(g,C.accent,.95);g.fillCircle(195,278,56);fill(g,'#fff2bd',.95);g.fillCircle(195,278,36);stroke(g,'#467d70',4,.8);g.strokeCircle(195,278,48);this.uiText(195,370,'WILLOWMERE',30,'#f7edc6','800');this.uiText(195,408,'A gentle life by the lake',16,'#b9ddd1','600');this.uiText(195,448,'Gather  •  craft  •  decorate  •  belong',14,'#e5e8d1','600');this.uiButton(95,548,200,64,'Begin the year',true);this.uiText(195,650,'Tap to walk. Use the hand when something calls.',14,'#d0e4d7','600'); },
    drawHUD: function (g,C) {
      fill(g,'#0c2d31',.88);g.fillRect(0,0,VW,64);stroke(g,'#6f9e8f',1,.5);g.lineBetween(0,64,VW,64);
      this.uiText(16,19,'Day '+this.s.day+'  '+C.icon+' '+C.name,14,'#f5edc9','700',0,.5);this.uiText(16,43,WM_STATE.weather==='clear'?'Clear skies':WM_STATE.weather==='rain'?'Soft rain':WM_STATE.weather==='snow'?'Snowfall':'A light breeze',14,'#b9d8d0','600',0,.5);
      this.uiText(196,19,WM_STATE.currentStage,14,'#e7e2c3','700');this.uiText(196,43,'♥ '+WM_STATE.friendship+'  •  '+WM_STATE.placements+' placed',14,'#b7dcc8','600');
      round(g,264,8,52,52,14,'#174547',.96);round(g,326,8,52,52,14,'#174547',.96);this.icons.bag.setVisible(true);this.icons.gear.setVisible(true);this.uiText(290,58,String(WM_STATE.inventory),14,'#f5dda0','700');
      fill(g,'#0a2428',.9);g.fillRect(0,704,VW,140);stroke(g,'#2f6560',1,.7);g.lineBetween(0,704,VW,704);
      stroke(g,'#b7d8c3',3,.65);g.strokeCircle(72,758,44);stroke(g,'#5b9081',2,.6);g.strokeCircle(72,758,23);if(this.joystick.id!==null){fill(g,'#8fd0b0',.65);g.fillCircle(72+this.joystick.dx*22,758+this.joystick.dy*22,17);}
      round(g,286,720,100,86,16,'#3d8d79',.98);this.icons.action.setVisible(true);this.icons.action.setPosition(315,746);this.uiText(336,776,this.actionLabel(),14,'#f5f3df','800');
      if(this.s.scene==='cottage'){this.uiButton(174,720,98,56,'Decorate',false);}
    },
    actionLabel: function () { if(this.mode==='cottage'){var a=this.nearest(this.player.x,this.player.y,74);return a?(a.label==='Craft'?'Craft':a.label==='Rest'?'Rest':'Go outside'):'Explore';}if(this.mode!=='play')return 'Use';var a=this.nearest(this.player.x,this.player.y,74);if(!a)return 'Explore';if(a.type==='node')return 'Gather';if(a.type==='npc')return 'Talk';if(a.type==='fish')return 'Fish';if(a.type==='cottage')return 'Enter';if(a.type==='mill')return 'Visit';return 'Use'; },
    drawTransient: function (g) { if(this.toast.t>0){var a=clamp(this.toast.t,0,1);round(g,16,72,358,34,10,'#12393a',.94*a);this.uiText(195,89,this.toast.text,14,'#f6edc8','700');}else if(this.tutorialT>0){round(g,16,72,358,30,9,'#12393a',.72);this.uiText(195,87,this.s.scene==='cottage'?'The hand button uses what is nearby.':'Drag the lake path with the stick, then follow the hand.',14,'#cce6d5','600');} },
    drawClose: function (g) { round(g,324,76,52,52,14,'#174547',.98);this.uiText(350,102,'×',28,'#f5edc9','600'); },
    drawPanel: function (g,title,sub) { fill(g,'#071b20',.78);g.fillRect(0,0,VW,VH);round(g,14,72,362,700,20,'#12383b',.98);stroke(g,'#62958b',2,.86);g.strokeRoundedRect(14,72,362,700,20);this.uiText(32,108,title,22,'#f5edc9','800',0,.5);if(sub)this.uiText(32,132,sub,14,'#b9d8d0','600',0,.5);this.drawClose(g); },
    drawBag: function (g) { this.drawPanel(g,'Bag','Materials and the people you are growing with');var ids=Object.keys(this.s.inv);for(var i=0;i<ids.length&&i<12;i++){var id=ids[i],it=ITEM[id],x=28+(i%4)*86,y=160+Math.floor(i/4)*74;round(g,x,y,78,60,10,'#1e5554',.95);fill(g,it.color);g.fillCircle(x+18,y+22,10);this.uiText(x+34,y+20,it.name.slice(0,10),14,'#f4efcf','700',0,.5);this.uiText(x+34,y+42,'x'+this.s.inv[id],14,'#bce0ce','700',0,.5);}
      var yy=404;this.uiText(30,yy,'Friends',16,'#f5edc9','800',0,.5);for(i=0;i<NPCS.length;i++){var n=NPCS[i],a=this.s.npc[n.id],tier=clamp(Math.floor(a.points/6),0,5);var row=yy+32+i*28;fill(g,n.color);g.fillCircle(38,row,6);this.uiText(54,row,n.name.split(' ')[0],14,'#e6e8d6','700',0,.5);for(var h=0;h<tier;h++){fill(g,'#f19a9d');g.fillCircle(236+h*13,row,4);}if(a.story2)this.uiText(350,row,'done',14,'#f5d17e','700',1,.5);else if(a.story1)this.uiText(350,row,'story 2',14,'#b8d9c9','600',1,.5);} },
    drawCraft: function (g) { var start=this.craftPage*8;this.drawPanel(g,'Workbench',(start+1)+'-'+Math.min(start+8,FURNITURE.length)+' of '+FURNITURE.length+' pieces');var page=FURNITURE.slice(start,start+8);for(var i=0;i<page.length;i++){var f=page[i],col=i%2,row=Math.floor(i/2),x=24+col*176,y=146+row*126,can=this.canCraft(f);round(g,x,y,164,112,12,can?'#205d54':'#1b4446',.98);stroke(g,can?'#8fd0ad':'#426c68',1,.85);g.strokeRoundedRect(x+1,y+1,162,110,11);fill(g,f.a);g.fillRoundedRect(x+12,y+32,38,30,6);this.uiText(x+58,y+24,f.name,14,'#f5edc9','800',0,.5);var mats=[],id;for(id in f.recipe)mats.push(ITEM[id]?ITEM[id].name+' '+f.recipe[id]:'');this.uiText(x+58,y+49,mats.slice(0,2).join('  '),14,can?'#bce0ce':'#c69090','600',0,.5);this.uiText(x+58,y+72,mats.slice(2,4).join('  '),14,can?'#bce0ce':'#c69090','600',0,.5);this.uiText(x+146,y+92,'x'+(this.s.owned[f.id]||0),14,'#f5d17e','700',1,.5);}
      this.uiButton(24,716,80,54,'Prev',false);this.uiButton(286,716,80,54,'Next',false); },
    drawGift: function (g) { var n=this.dialog&&NPCS[this.dialog.npc];this.drawPanel(g,'Give a gift',n?'to '+n.name:'Choose something kind');var items=this.giftItems();for(var i=0;i<items.length&&i<8;i++){var id=items[i],it=ITEM[id],col=i%4,row=Math.floor(i/4),x=20+col*90,y=166+row*112;round(g,x,y,82,96,12,'#1e5554',.96);fill(g,it.color);g.fillCircle(x+41,y+30,17);this.uiText(x+41,y+59,it.name.slice(0,10),14,'#f5edc9','700');this.uiText(x+41,y+80,'x'+this.s.inv[id],14,'#bce0ce','700');}if(!items.length)this.uiText(195,350,'Gather something first.',16,'#b9d8d0','600'); },
    drawDialog: function (g) { var d=this.dialog,n=d?NPCS[d.npc]:null;fill(g,'#071b20',.42);g.fillRect(0,0,VW,VH);round(g,14,532,362,278,20,'#12383b',.98);stroke(g,n?n.color:'#82c2a7',2,.9);g.strokeRoundedRect(14,532,362,278,20);if(n){fill(g,n.color);g.fillCircle(48,570,22);this.uiText(48,570,n.name.charAt(0),20,'#173638','800');this.uiText(82,558,n.name,16,n.color,'800',0,.5);this.uiText(82,582,n.role,14,'#b9d8d0','600',0,.5);}var line=d&&d.lines[d.index]||'';this.uiText(32,632,line,16,'#f4efcf','600',0,.5);if(d&&d.kind==='talk'){this.uiButton(25,726,160,58,'Gift',true);this.uiButton(205,726,160,58,'Continue',false);}else{this.uiButton(205,726,160,58,'Continue',true);}this.drawClose(g); },
    drawDecorate: function (g) { fill(g,'#0a2428',.92);g.fillRect(0,0,VW,142);this.uiText(195,30,'Decorate',20,'#f5edc9','800');this.uiButton(34,70,58,48,'',false);this.uiButton(86,70,58,48,'',false);this.uiButton(300,70,68,48,'Done',true);this.icons.rotate.setVisible(true);this.icons.undo.setVisible(true);this.uiText(195,96,this.selectedFurniture?'Move the ghost, then tap to place':'Pick a piece below',14,'#b9d8d0','600');fill(g,'#0b292d',.96);g.fillRect(0,690,VW,154);stroke(g,'#4a7771',1,.8);g.lineBetween(0,690,VW,690);var items=this.availableFurniture(),start=this.craftPage*8;for(var i=0;i<Math.min(8,items.length-start);i++){var f=items[start+i],col=i%4,row=Math.floor(i/4),x=12+col*92,y=706+row*62;round(g,x,y,84,52,9,this.selectedFurniture===f.id?'#3d8d79':'#1b4d4d',.98);fill(g,f.a);g.fillRoundedRect(x+7,y+11,28,26,5);this.uiText(x+40,y+18,f.name.split(' ')[0],14,'#f4efcf','700',0,.5);this.uiText(x+40,y+37,'x'+((this.s.owned[f.id]||0)-this.placedCount(f.id)),14,'#bce0ce','600',0,.5);}if(!items.length)this.uiText(195,762,'Craft a piece at the bench first.',14,'#b9d8d0','600'); },
    placedCount: function (id) { var c=0;for(var i=0;i<this.s.placements.length;i++)if(this.s.placements[i].id===id)c++;return c; },
    drawMenu: function (g) { fill(g,'#071b20',.76);g.fillRect(0,0,VW,VH);round(g,30,164,330,400,22,'#12383b',.98);stroke(g,'#62958b',2,.86);g.strokeRoundedRect(30,164,330,400,22);this.uiText(52,208,'Willowmere',24,'#f5edc9','800',0,.5);this.uiText(52,244,'Day '+this.s.day+'  •  '+SEASONS[this.currentSeason()].name,14,'#b9d8d0','600',0,.5);this.uiText(52,270,'No currency. No energy. No waiting.',14,'#bce0ce','600',0,.5);this.uiButton(70,316,250,56,kit.audio.prefs.mute?'Sound: Off':'Sound: On',false);this.uiButton(70,386,250,56,'Settings',false);this.uiButton(70,456,250,56,'Back',true); },
    drawFestival: function (g) { var f=this.festival||FESTIVALS[3];fill(g,'#071b20',.82);g.fillRect(0,0,VW,VH);for(var i=0;i<14;i++){var x=32+i*26,y=170+Math.sin(this.clock+i)*22;fill(g,['#f3c66f','#ee929a','#9fd9bd','#a5c4ed'][i%4],.9);g.fillCircle(x,y,5);}round(g,32,238,326,390,24,'#143d40',.99);stroke(g,'#f1d27c',2,.9);g.strokeRoundedRect(32,238,326,390,24);this.uiText(195,294,f.name,24,'#f5d98c','800');this.uiText(195,344,'The village gathers.',16,'#bce0ce','700');this.uiText(195,396,f.detail,14,'#f4efcf','600');this.uiText(195,488,'Friendship built this place.',14,'#bce0ce','600');this.uiText(195,528,'Day '+this.s.day+'  •  '+WM_STATE.friendship+' friendship',14,'#d8e6cf','600');this.uiButton(95,690,200,56,'Keep wandering',true); },
  });

  kit.loader.show('Willowmere');kit.loader.progress(.18);
  var game = new Phaser.Game({
    type:Phaser.AUTO,parent:document.getElementById('game')||document.body,backgroundColor:'#102c30',
    render:{antialias:true,antialiasGL:false,roundPixels:false,powerPreference:'high-performance',batchSize:2048},
    audio:{noAudio:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:VW,height:VH},
    fps:{target:60,min:30},banner:false,scene:[GameScene]
  });
  BRIDGE.game=game;BRIDGE.kit=kit;
})(window);
