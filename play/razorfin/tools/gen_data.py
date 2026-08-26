#!/usr/bin/env python3
"""Generate play/razorfin/data.js from compact tables. Orchestrator-owned."""
import json

# id, name, tier, act, cost, (speed,accel,turn,bite,hp,metab,boost), passives, active,
# (head, len, girth, finS, tailS, base, belly, accent, glow, pattern, fx), npc(weight,zones)|None, blurb
SHARKS = [
# --- Act 1: real sharks (16), tiers 1-6 ---
("reef","Reef Shark",1,1,0,(288,624,3.4,1,60,1.6,2.2),[],None,
 ("point",1.00,0.34,1.00,1.00,0x7d8fa0,0xdfe8ee,0x4b6070,0,"plain",None),(4,[1]),
 "Where every legend starts. Quick, small, and always hungry."),
("epaulette","Epaulette Shark",1,1,150,(262,672,4.6,1,55,1.5,2.0),[],None,
 ("blunt",0.92,0.30,0.90,1.15,0xc7a06a,0xefe0c2,0x8a6b3c,0,"spots",None),None,
 "A shallows crawler that turns tighter than anything its size."),
("cookiecutter","Cookiecutter Shark",1,1,300,(275,648,3.8,2,50,1.7,2.0),["biteUp"],None,
 ("blunt",0.85,0.30,0.85,0.95,0x6a5d52,0xcabcae,0x3f362f,0,"collar",None),None,
 "Small jaws, absurd confidence. Bites things far bigger than itself."),
("mako","Shortfin Mako",2,1,600,(425,840,3.2,2,85,2.0,3.0),["lunge"],None,
 ("point",1.10,0.32,1.05,1.20,0x3f6fb2,0xe8f1f7,0x27497a,0,"plain",None),(3,[2]),
 "The fastest jaws in open water. Blink and it has already eaten."),
("blue","Blue Shark",2,1,800,(400,768,3.6,2,80,1.9,2.8),[],"sonic",
 ("point",1.15,0.28,1.20,1.10,0x3a86c8,0xeef6fb,0x1f5a94,0,"plain",None),(2,[2]),
 "Long, elegant, and much louder than it looks."),
("hammerhead","Hammerhead",3,1,1400,(375,720,3.0,3,120,2.2,2.8),["wideBite"],"sonic",
 ("hammer",1.20,0.36,1.10,1.00,0x8b9aa6,0xe6edf1,0x5d6d7a,0,"plain",None),(3,[2,3]),
 "That head is not for show. Nothing slips past a sweep this wide."),
("thresher","Thresher Shark",3,1,1600,(388,744,3.3,2,105,2.1,2.9),["comboPlus"],"volt",
 ("point",1.30,0.28,1.00,2.20,0x4c7ba0,0xe9f2f7,0x2e5573,0,"plain",None),None,
 "Half shark, half whip. Keeps a feeding streak alive forever."),
("sawshark","Longnose Sawshark",3,1,1800,(350,696,3.1,3,110,2.2,2.6),["wideBite"],"pyro",
 ("saw",1.15,0.30,0.95,1.00,0x9a8f74,0xe8e2cf,0x6b6350,0,"plain",None),None,
 "Leads with a toothed blade and asks no questions."),
("tiger","Tiger Shark",4,1,3000,(375,708,2.9,4,170,2.4,2.8),["junkEater"],"toxin",
 ("blunt",1.30,0.40,1.05,1.05,0x6e7f6a,0xdfe7dc,0x44523f,0,"stripes",None),(3,[2,3]),
 "Eats fish, mines, jellyfish, license plates. Mostly in that order."),
("bull","Bull Shark",4,1,3400,(362,732,3.0,4,180,2.5,2.7),["biteUp"],"volt",
 ("blunt",1.22,0.44,1.00,0.95,0x77808a,0xe2e8ec,0x4c545e,0,"plain",None),(2,[2,3]),
 "Short temper, shorter patience. Hits far above its weight."),
("goblin","Goblin Shark",4,1,3800,(338,672,2.8,4,150,2.3,2.6),["lungeMega"],"phase",
 ("point",1.18,0.33,0.90,1.00,0xc79aa6,0xf0dfe4,0x8f5f70,0,"plain",None),None,
 "A jaw that arrives before the shark does."),
("greatwhite","Great White",5,1,7000,(400,744,2.8,6,260,2.7,3.2),["lunge"],"pyro",
 ("point",1.45,0.46,1.15,1.10,0x74808c,0xf2f5f7,0x47525c,0,"plain",None),(3,[2,3]),
 "The apex everyone pictures. Now it breathes fire."),
("whaleshark","Whale Shark",5,1,7500,(300,576,2.4,4,320,2.2,2.4),["filterFeedMax"],"vortex",
 ("whale",1.80,0.55,1.00,0.95,0x3e5a75,0xdce8f0,0x27415a,0,"dots",None),None,
 "A gentle giant with a mouth like a hangar door."),
("megalodon","Megalodon",6,1,14000,(388,720,2.6,8,420,3.0,3.0),[],"freeze",
 ("blunt",1.75,0.55,1.20,1.10,0x5c6670,0xe6eaee,0x39424c,0,"scars",None),(2,[3,4]),
 "The ocean remembered it the whole time."),
("dunkleosteus","Dunkleosteus",6,1,15000,(350,672,2.5,8,380,2.9,2.6),["biteUp","ambush","armored"],"sonic",
 ("rock",1.55,0.60,0.85,0.90,0x55635b,0xcfd8d2,0x333d37,0,"plates",None),None,
 "Older than sharks. Armored in bone and very much awake."),
("greenland","Greenland Shark",6,1,13000,(288,528,2.2,7,400,1.2,2.2),["slowMetabX"],"toxin",
 ("blunt",1.60,0.50,0.90,0.90,0x4a5450,0xc9d2ce,0x2d3532,0,"mottled",None),None,
 "Centuries old and in absolutely no hurry."),
# --- Act 2: monster sharks (20), tiers 7-8 ---
("snapjaw","Snapjaw",7,2,22000,(362,696,2.6,9,480,3.0,2.8),["biteUp","ambush"],"pyro",
 ("croc",1.65,0.48,0.85,1.00,0x5d7048,0xd9e2c8,0x3a4a2b,0x9bd45a,"scales","emberEyes"),(2,[3,4]),
 "Not a shark. Nobody has told it, and nobody is going to."),
("gulperfiend","Gulper Fiend",7,2,23000,(325,624,2.7,8,460,2.9,2.6),["filterFeed","biteUp"],"vortex",
 ("angler",1.50,0.52,0.80,1.10,0x3a3f5c,0xb8bdd6,0x23273d,0x7f89d6,"plain","gulpGlow"),None,
 "Its stomach has opinions. All of them are yes."),
("anglerfang","Anglerfang",7,2,23000,(312,648,3.0,8,440,2.8,2.5),["dreadAura","ambush"],"volt",
 ("angler",1.35,0.42,0.85,0.95,0x2f3348,0xa9adc4,0x1b1e30,0xffe08a,"plain","lure"),None,
 "Brings its own night light. Dinner walks in on its own."),
("morayne","Morayne",7,2,22000,(375,768,4.8,7,400,2.8,2.7),[],"toxin",
 ("eel",1.90,0.24,0.70,1.30,0x4f6b4a,0xcfdcc8,0x314530,0x8fd67f,"bands","none"),None,
 "An eel the size of a bus with a shark's appetite."),
("sailfin","Sailfin Ripper",7,2,25000,(500,936,3.4,7,380,3.1,3.6),["lunge"],"sonic",
 ("point",1.40,0.30,1.60,1.30,0x2f7fa8,0xdff0f7,0x1b5673,0x66d9ff,"plain","sailGlow"),None,
 "The fastest thing in the water, and it knows it."),
("thornback","Thornback",7,2,24000,(312,600,2.5,8,520,2.8,2.4),["armored","spines"],"quake",
 ("rock",1.45,0.50,0.90,0.90,0x6b5b4a,0xd8ccb8,0x453a2e,0xd8b06a,"spikes","none"),None,
 "Hugging it is the last mistake most predators make."),
("stonejaw","Stonejaw",7,2,24000,(300,576,2.4,9,560,2.7,2.3),["armored","junkEater"],"quake",
 ("rock",1.50,0.55,0.80,0.85,0x66625a,0xcfccc4,0x413e38,0xb8ab88,"cracks","none"),None,
 "A reef that got up one day and started eating."),
("duskfin","Duskfin",7,2,25000,(388,744,3.2,7,410,2.9,2.9),["ambush","stealth"],"phase",
 ("point",1.35,0.34,1.05,1.05,0x2a2f3a,0x8f97a6,0x171b23,0x5a6b8f,"plain","shadow"),None,
 "By the time the water darkens, it is already behind you."),
("barbhook","Barbhook",7,2,24000,(375,720,2.9,8,430,2.9,2.7),["wideBite","lunge"],"volt",
 ("saw",1.40,0.36,1.00,1.00,0x707a85,0xdde3e8,0x49525c,0xa9c9e8,"plain","none"),None,
 "Leads with a barbed harpoon of a snout. Prey stays put."),
("coralcrown","Coralcrown",7,2,23000,(325,624,2.7,7,450,1.6,2.5),["slowMetab","regen"],"freeze",
 ("blunt",1.40,0.44,1.00,0.95,0xb56576,0xf2d7dd,0x7d4150,0xff9eb0,"coral","crown"),None,
 "Wears a living reef and heals like one."),
("vex","Vex",8,2,34000,(412,840,5.2,9,480,3.0,3.0),["pressureImmune","freeTurn"],"phase",
 ("void",1.30,0.36,1.30,1.10,0x3d2f5c,0xc8bce8,0x261d3d,0xa07fff,"plain","alien"),None,
 "It does not swim the way water expects. Water has complained."),
("abyssmaw","Abyss Maw",8,2,35000,(350,672,2.7,10,540,2.8,2.6),["pressureImmune","dreadAura"],"toxin",
 ("angler",1.60,0.50,0.85,1.00,0x1d2333,0x7a84a0,0x10141f,0x4f5f8f,"plain","abyssGlow"),None,
 "The deep sent something back up. It is still hungry."),
("riftjaw","Riftjaw",8,2,36000,(400,792,3.0,9,470,3.0,2.9),["lungeMega","blink"],"phase",
 ("point",1.40,0.38,1.10,1.05,0x2f4f5c,0xbcd8e0,0x1c333d,0x6fe8e0,"plain","rift"),None,
 "Its lunge skips the part of space in between."),
("venomspine","Venomspine",8,2,34000,(375,720,3.1,8,450,2.9,2.8),["spines","toxinWake"],"toxin",
 ("point",1.38,0.36,1.05,1.05,0x3f5c33,0xcfe0c4,0x27401e,0x9bff6f,"spikes","venomDrip"),None,
 "Leaves a trail nothing sane swims through."),
("howler","Howler",8,2,34000,(388,744,3.0,8,460,3.0,2.8),["dreadAura"],"sonic",
 ("blunt",1.42,0.40,1.10,1.10,0x5c4a6b,0xd8cce0,0x3a2d45,0xc9a0ff,"plain","soundRings"),None,
 "You hear it twice. Once now, once when it is far too late."),
("magmaw","Magmaw",8,2,36000,(375,720,2.8,9,500,3.0,2.7),["fireWake","fireImmune"],"pyro",
 ("rock",1.45,0.46,1.00,1.00,0x4a2f26,0xe0b89f,0x2e1b14,0xff6a29,"cracks","lavaVeins"),None,
 "Runs hot. The water around it never quite forgives."),
("frostjaw","Frostjaw",8,2,36000,(362,696,2.8,9,500,2.6,2.7),["freezeTouch"],"freeze",
 ("blunt",1.45,0.44,1.05,1.00,0x3d6b8f,0xe0f0fa,0x264a66,0x9fdcff,"plain","frost"),None,
 "Everything it brushes slows, then stops, then shatters."),
("stormfin","Stormfin",8,2,35000,(412,816,3.2,8,460,3.0,3.0),["shockTouch"],"volt",
 ("point",1.40,0.34,1.25,1.15,0x33415c,0xcdd8ec,0x1f2a40,0xbfe0ff,"plain","arcs"),None,
 "A thunderhead with fins. Do not touch. It wants you to touch."),
("gloomtide","Gloomtide",8,2,34000,(362,696,2.9,8,470,2.8,2.7),["coinMagnet","drain"],"vortex",
 ("eel",1.70,0.30,0.85,1.20,0x2d3340,0x9aa3b5,0x1a1f29,0x6f7fa0,"plain","gloom"),None,
 "Everything of value drifts toward it. So does everything else."),
("wreckfang","Wreckfang",8,2,36000,(350,672,2.7,9,540,2.9,2.5),["junkEater","armored","mineHeal"],"quake",
 ("mech",1.50,0.48,0.95,0.95,0x5a5f66,0xc9cdd4,0x393d43,0xffb84a,"rivets","sparks"),None,
 "Eats shipwrecks for the iron. Mines are a delicacy."),
# --- Act 3: super / legendary (25), tiers 9-12 ---
("ironfin","Ironfin",9,3,50000,(400,768,2.9,10,620,2.9,3.0),["armored","coinMagnet"],"volt",
 ("mech",1.55,0.44,1.15,1.05,0x6a7078,0xd4d9df,0x43484f,0x66d9ff,"panels","thrusters"),None,
 "Somebody built a shark. Somebody should apologize."),
("cindermaw","Cindermaw",9,3,52000,(412,792,2.9,10,580,3.0,3.1),["fireWake","fireImmune"],"pyro",
 ("point",1.55,0.42,1.15,1.10,0x59261c,0xf0c2a0,0x38160f,0xff8a3d,"cracks","emberTrail"),None,
 "The sea boils politely out of its way."),
("glacier","Glacier",9,3,52000,(362,672,2.6,10,680,2.5,2.7),["armored","freezeTouch"],"freeze",
 ("blunt",1.65,0.50,1.05,0.95,0x6fa3c4,0xf0f8fd,0x4a7a99,0xc4ecff,"facets","iceShards"),None,
 "A drifting ice age with teeth."),
("gravewater","Gravewater",9,3,52000,(375,696,2.8,9,560,2.7,2.8),["undying","toxinEater"],"toxin",
 ("skull",1.50,0.42,1.00,1.00,0x3d4a3a,0xb9c4b4,0x252e23,0x8fd67f,"rot","wisps"),None,
 "Already died once. Found the experience overrated."),
("teslafang","Teslafang",9,3,52000,(425,840,3.1,9,540,3.0,3.2),["comboSpeed"],"volt",
 ("point",1.48,0.36,1.25,1.20,0x2e3a5c,0xd0dcf4,0x1b2438,0xe8f4ff,"plain","dynamo"),None,
 "The longer it feeds, the faster it gets. It is always feeding."),
("plaguemaw","Plaguemaw",9,3,50000,(375,720,2.9,9,560,2.8,2.8),["infect"],"toxin",
 ("blunt",1.52,0.44,1.05,1.00,0x4a5233,0xc9cfb0,0x2e331f,0xbfd45a,"boils","spores"),None,
 "One bite becomes ten. Its meals do the spreading."),
("sunspine","Sunspine",9,3,52000,(400,768,3.0,9,550,2.9,3.0),["surfacePower","fireWake"],"pyro",
 ("point",1.50,0.38,1.20,1.10,0x8f5c1f,0xffe8b0,0x5c3a10,0xffd45a,"rays","corona"),None,
 "Solar powered and fully charged by breakfast."),
("nocturne","Nocturne",9,3,52000,(400,768,3.0,9,550,2.7,3.0),["depthPower","dreadAura"],"phase",
 ("point",1.50,0.38,1.20,1.10,0x1f2340,0x8a90b8,0x12142a,0x7f8fff,"stars","moonlit"),None,
 "Stronger the deeper it goes. It goes very deep."),
("tempest","Tempest",9,3,52000,(438,864,3.2,9,530,3.0,3.3),["lunge"],"sonic",
 ("point",1.52,0.36,1.35,1.25,0x3a5c6b,0xd4e8f0,0x24404c,0xa0e8ff,"plain","stormcap"),None,
 "Arrives like weather. Leaves like a warning."),
("maelstrom","Maelstrom",9,3,52000,(362,672,2.7,10,600,2.8,2.7),["filterFeedMax"],"vortex",
 ("whale",1.75,0.52,1.00,1.00,0x2a4a5c,0xc4dce8,0x18303d,0x4fd0e8,"swirls","whirl"),None,
 "The drain at the bottom of the ocean, self-propelled."),
("bonecrown","Bonecrown",9,3,52000,(362,672,2.7,10,640,2.7,2.6),["undying","armored"],"quake",
 ("skull",1.58,0.46,1.00,0.95,0x8f8a7a,0xe8e4d8,0x5c584c,0xfff0c4,"bones","marrowGlow"),None,
 "Wears its ancestors. They approve of the menu."),
("mirrorscale","Mirrorscale",9,3,52000,(388,744,3.0,9,560,2.8,2.9),["dreadAura"],"freeze",
 ("point",1.48,0.38,1.15,1.05,0x7a8a99,0xf4f8fb,0x525f6b,0xffffff,"mirror","glints"),None,
 "Prey sees itself, panics, and swims the wrong way. Toward it."),
("aurora","Aurora",10,3,70000,(412,792,3.0,11,720,2.7,3.1),["freezeTouch","armored"],"freeze",
 ("point",1.62,0.42,1.30,1.10,0x4a7f9e,0xf2fbff,0x2f5a75,0xa8f0d4,"ribbons","aurora"),None,
 "The lights in the water are beautiful. Swim away from them."),
("vulkan","Vulkan",10,3,72000,(400,744,2.8,12,780,2.9,2.9),["fireWake","armored","fireImmune"],"pyro",
 ("rock",1.70,0.50,1.10,1.00,0x3d1f16,0xe8b590,0x260f0a,0xff5a1f,"magma","eruption"),None,
 "A volcano that got tired of waiting for things to fall in."),
("voltaicrex","Voltaic Rex",10,3,72000,(438,840,3.0,11,700,3.0,3.2),["shockTouch","comboSpeed"],"volt",
 ("point",1.65,0.42,1.30,1.20,0x24304a,0xd8e4fa,0x141d30,0xf0f8ff,"plain","stormcrown"),None,
 "The storm named itself king. Nothing has argued."),
("nullfin","Nullfin",10,3,74000,(400,768,3.1,11,680,2.8,3.0),["biteUpX","pressureImmune"],"phase",
 ("void",1.55,0.40,1.20,1.10,0x171226,0x6f5f8f,0x0c0a17,0x9f6fff,"plain","voidRipple"),None,
 "Where it bites, there is simply less ocean afterward."),
("chronos","Chronos",10,3,74000,(412,792,3.0,10,660,2.7,3.0),[],"chrono",
 ("point",1.58,0.40,1.20,1.10,0x6b5c3a,0xf0e4c4,0x453a22,0xffe08a,"rings","clockGlow"),None,
 "Everything else slows down. It prefers the word savoring."),
("seismos","Seismos",10,3,72000,(375,696,2.6,12,800,2.8,2.7),["armored"],"quake",
 ("rock",1.75,0.55,1.00,0.90,0x4f463d,0xd0c8bc,0x322c26,0xd8a05a,"faults","tremor"),None,
 "The seafloor flinches when it gets close."),
("banshee","Banshee",10,3,72000,(425,816,3.2,10,640,2.8,3.1),["undying","dreadAura"],"sonic",
 ("skull",1.55,0.38,1.20,1.15,0x5c6b7a,0xe8f0f4,0x3a4550,0xd4f0ff,"plain","wail"),None,
 "The scream arrives before it does. Both are fatal."),
("vortexa","Vortexa",10,3,72000,(375,696,2.7,11,700,2.7,2.8),["filterFeedMax","coinMagnet"],"vortex",
 ("whale",1.80,0.54,1.05,1.00,0x1f3d4a,0xbcd8e0,0x122630,0x39c6d6,"swirls","engine"),None,
 "An engine that runs on everything."),
("warbringer","Warbringer",11,3,95000,(412,768,2.8,13,900,2.9,3.0),["armored","spines","undying","coinMagnet"],"volt",
 ("mech",1.80,0.50,1.15,1.05,0x4a4f57,0xc9ced6,0x2e3238,0xff4a4a,"plating","warlights"),None,
 "Decommissioned twice. It disagreed both times."),
("omenmaw","Omenmaw",11,3,95000,(388,720,2.9,12,860,2.8,2.9),["dreadAuraX","pressureImmune"],"toxin",
 ("angler",1.75,0.52,1.00,1.05,0x1a1424,0x6f6486,0x0e0b15,0x8f4fff,"runes","omens"),None,
 "Prey does not flee. Prey volunteers."),
("solaris","Solaris",11,3,95000,(412,768,2.9,12,840,2.9,3.0),["fireWakeX","fireImmune"],"pyro",
 ("point",1.70,0.44,1.25,1.10,0x8f4a10,0xfff0c4,0x5c2f0a,0xffe45a,"corona","sunflare"),None,
 "A small sun on a strict seafood diet."),
("absolutezero","Absolute Zero",11,3,95000,(375,696,2.7,12,880,2.5,2.8),["freezeTouch","armored","freezeField"],"freeze",
 ("blunt",1.75,0.48,1.10,1.00,0x4a7a99,0xf8fdff,0x2f5470,0xe0f8ff,"facets","iceAge"),None,
 "The water freezes first. The rest is scheduling."),
("leviathanrex","Sharkjira",12,3,150000,(400,720,2.5,16,1400,2.6,3.0),["armored","pressureImmune","junkEater","biteUpX"],"atomic",
 ("kaiju",2.40,0.60,1.30,1.20,0x1b1f22,0xb8cdc4,0x2a3138,0x3fd6ff,"plates","dorsalCharge"),None,
 "A kaiju wearing a shark's face. Jagged dorsal plates, an atomic-blue glow "
 "in its spine and gills, and an underbite that ends arguments. The ocean "
 "has a king. The land has a warning."),
("leviathan_rex","Leviathan Rex",12,3,150000,(400,720,2.5,16,1400,2.6,3.0),["armored","pressureImmune","junkEater","biteUpX"],"atomic",
 ("kaiju",2.20,0.60,1.30,1.20,0x2e3d38,0xb8cdc4,0x1a2622,0x9ff7f0,"plates","dorsalCharge"),None,
 "The ocean has a king. The land has a warning."),
# --- Act 4: Pantheon (12), gods, tiers 9-12 ---
("zeusfin","Zeusfin",9,4,160000,(420,804,3.1,10,600,2.9,3.1),["shockTouch","comboSpeed"],"volt",
 ("point",1.58,0.40,1.25,1.15,0xd8b03a,0xfff6d0,0x8a6a10,0xfff2a0,"rays","stormcrown"),None,
 "Throws the first punch as lightning. There is no second punch needed."),
("poseidonrex","Poseidonrex",9,4,162000,(388,720,2.7,10,660,2.7,2.9),["filterFeedMax","coinMagnet"],"vortex",
 ("whale",1.78,0.53,1.05,1.00,0x2a6f9e,0xdcf2fb,0x184a6e,0x6fe0ff,"swirls","engine"),None,
 "Owns the current. Everything else just borrows it."),
("hadesmaw","Hadesmaw",10,4,180000,(400,768,3.0,11,700,2.7,3.0),["dreadAuraX","pressureImmune"],"phase",
 ("void",1.58,0.40,1.20,1.10,0x1a1626,0x7a6f9a,0x0e0b17,0xb08fff,"runes","voidRipple"),None,
 "Every soul is already spoken for. It is just collecting."),
("apollodon","Apollodon",9,4,160000,(408,780,3.0,10,580,2.9,3.0),["fireWake","fireImmune"],"pyro",
 ("point",1.54,0.40,1.22,1.10,0xd88a1f,0xfff0c0,0x8a5610,0xffe45a,"corona","sunflare"),None,
 "Sun god, sun bite. Neither one waits for permission."),
("artemisstrike","Artemis Strike",9,4,158000,(430,828,3.2,9,560,2.9,3.2),["lunge"],"freeze",
 ("point",1.50,0.36,1.28,1.15,0x5f9ec4,0xf0faff,0x3a6a8a,0xc0f0ff,"facets","iceShards"),(2,[3,4]),
 "Never misses the shot. Rarely needs a second one."),
("athenajaw","Athenajaw",10,4,182000,(400,768,3.0,11,680,2.8,3.0),["armored","dreadAura"],"sonic",
 ("hammer",1.58,0.40,1.15,1.05,0xb8ac8a,0xf4efe0,0x736a52,0xffe8b0,"plates","wail"),None,
 "Strategy first, teeth second. The teeth still work."),
("aresrender","Aresrender",10,4,184000,(408,768,2.9,12,720,2.9,2.9),["armored","spines"],"pyro",
 ("croc",1.62,0.46,1.05,1.00,0x8a2018,0xf0b0a0,0x581008,0xff5a29,"cracks","emberTrail"),(2,[3,4]),
 "It does not pick fights. It is the fight."),
("hermesdart","Hermes Dart",9,4,159000,(450,876,3.4,9,540,3.0,3.3),["comboSpeed"],"chrono",
 ("point",1.46,0.34,1.30,1.20,0xd0d8e0,0xffffff,0x8a95a0,0xfff6c4,"rings","clockGlow"),None,
 "Delivers the bad news before you finish reading the good news."),
("hephaestusforge","Hephaestus Forge",10,4,183000,(378,720,2.7,12,760,2.9,2.8),["armored","junkEater","mineHeal"],"quake",
 ("mech",1.62,0.50,0.98,0.95,0x8a6a2a,0xf0dca0,0x5a4318,0xffb84a,"rivets","sparks"),None,
 "Built its own teeth. Kept the receipts."),
("dionysustide","Dionysus Tide",9,4,158000,(388,744,2.9,9,570,2.8,2.8),["infect"],"toxin",
 ("blunt",1.50,0.42,1.05,1.00,0x8a2f6b,0xe8c4e0,0x5c1f47,0xd45aff,"boils","spores"),(2,[3,4]),
 "One sip and the whole reef is at the party."),
("aphroditelure","Aphrodite Lure",9,4,159000,(400,768,3.0,9,560,2.8,3.0),["dreadAura"],"sonic",
 ("angler",1.48,0.38,1.15,1.05,0xff9ec4,0xffe8f2,0xb0568a,0xffc4e8,"mirror","glints"),None,
 "Everything swims closer. Nothing swims away."),
("heracrown","Hera Crown",12,4,220000,(400,724,2.5,17,1440,2.6,3.0),["armored","pressureImmune","dreadAuraX"],"quake",
 ("kaiju",2.18,0.58,1.28,1.18,0xd8b84a,0xfff6da,0x8a6f20,0xfff0a0,"faults","tremor"),None,
 "The throne was never Zeus's to keep. She just let him think so."),
# --- Act 5: Underworld (12), demons/monsters, tiers 9-12 ---
("typhonmaw","Typhonmaw",12,5,222000,(398,718,2.5,17,1450,2.6,3.0),["armored","pressureImmune","biteUpX"],"quake",
 ("kaiju",2.22,0.61,1.30,1.20,0x241018,0xa04f5c,0x140a0e,0xff2b4a,"faults","tremor"),None,
 "The old gods lost this one on purpose. It remembers."),
("hydrafang","Hydrafang",10,5,182000,(370,700,2.8,11,700,2.7,2.8),["infect","undying"],"toxin",
 ("eel",1.85,0.30,0.80,1.25,0x2a5c3a,0xa8d69a,0x173a20,0x6fff8a,"bands","venomDrip"),(2,[3,4]),
 "Cut one head off its combo. The other nine keep eating."),
("cerberusjaw","Cerberus Jaw",10,5,183000,(392,744,2.9,11,660,2.9,2.9),["ambush","dreadAura"],"pyro",
 ("croc",1.60,0.46,1.05,1.00,0x2a1a14,0x8a5a3a,0x150c0a,0xff5a1f,"cracks","emberTrail"),(3,[3,4]),
 "Guards the exit. There is no exit."),
("chimerashark","Chimera Shark",9,5,160000,(400,772,2.9,10,580,2.9,3.0),["fireWake","wideBite"],"pyro",
 ("saw",1.52,0.42,1.05,1.05,0x4a3a1a,0xd4b56a,0x2c2210,0xff8a3d,"scales","emberTrail"),None,
 "Three animals' worth of bad ideas, one body to carry them."),
("medusagaze","Medusa Gaze",9,5,159000,(360,684,2.7,10,600,2.6,2.7),["freezeTouch","dreadAura"],"freeze",
 ("angler",1.44,0.40,0.90,1.00,0x2a4a2a,0x9ac48a,0x162a16,0x9fffb0,"spots","frost"),None,
 "Look too long and the current does the rest."),
("scyllarender","Scylla Render",9,5,158000,(374,716,2.9,9,560,2.8,2.7),["ambush","spines"],"vortex",
 ("eel",1.86,0.28,0.78,1.28,0x2f1f3a,0xa08fc4,0x18101f,0x8a5aff,"bands","gloom"),None,
 "Six mouths, one rock, zero survivors from that strait."),
("charybdisvoid","Charybdis Void",10,5,184000,(360,672,2.6,11,700,2.7,2.6),["filterFeedMax","coinMagnet"],"vortex",
 ("whale",1.80,0.54,1.02,0.98,0x140f24,0x5a4f80,0x0a0716,0x6a3fff,"swirls","whirl"),None,
 "Everything eventually drains. It never fills back up."),
("minotaurram","Minotaur Ram",10,5,183000,(365,700,2.6,12,740,2.8,2.7),["armored","junkEater"],"quake",
 ("rock",1.55,0.52,0.92,0.90,0x3a2a1f,0x9a7a5a,0x201510,0xff6a2b,"faults","tremor"),None,
 "The maze was never the trap. It was."),
("cyclopseye","Cyclops Eye",9,5,159000,(388,748,2.9,10,600,2.9,2.8),["dreadAura"],"sonic",
 ("blunt",1.55,0.46,1.05,1.00,0x3a2f24,0xb09a70,0x22190f,0xd9c8ff,"scars","wail"),(2,[3,4]),
 "One eye is all it needs. It never once looked away."),
("harpyshade","Harpy Shade",9,5,158000,(415,800,3.2,9,540,2.9,3.1),["ambush","stealth"],"phase",
 ("point",1.42,0.32,1.15,1.05,0x241f30,0x6a5f80,0x120e1a,0x8a5aff,"stripes","shadow"),(3,[3,4]),
 "Steals the meal before the meal knows it was served."),
("lamiacoil","Lamia Coil",9,5,159000,(372,712,3.0,9,560,2.8,2.7),["infect","toxinWake"],"toxin",
 ("eel",1.88,0.26,0.82,1.30,0x2a3a1a,0x8ec46a,0x172310,0xaaff5a,"bands","venomDrip"),None,
 "Sings a lullaby. Nobody wakes up for the encore."),
("kampechrono","Kampe Chrono",10,5,185000,(400,764,2.9,11,660,2.8,3.0),["comboSpeed"],"chrono",
 ("skull",1.58,0.42,1.05,1.00,0x241a30,0x8a7a9a,0x120e1a,0xc9a0ff,"bones","clockGlow"),None,
 "Guards the gate on both sides of the hour at once."),
]

CREATURES = [
 # id, name, tier, kind, speed, hp, score, coins, spriteKey|proc, packMin, packMax, tint
 # tint = hex int matching each species' dominant/visible color (Rev 7 7.6:
 # engine swallow burst color; kills the constant-amber bug).
 # Rev 9 9.4 CLARITY: true shoaling species get a cohesive pack of 6-10 (was
 # scattered singles/loose ranges up to 16-18); solo/small-group "big target"
 # prey (parrot/grouper/ray/turtle/tuna/swordfish/dolphinfish/marlin/
 # giantsquid/abyssal/leviathanprey) are intentionally NOT schools and keep
 # their small pack ranges so they still read as individually-readable catches.
 # Rev 12 12.1 level specials: seal/sealion/orca are alaska/california level
 # creatures; orca is a predator-class NPC (kind stays "prey" for eat-table
 # plumbing consistency with the rest of this table -- npc weighting/zones
 # elsewhere in the codebase is what actually governs predator behavior for
 # the roster; this table has no npc column, so orca is simply a big-ticket
 # catch here and its predator behavior is out of gen_data.py's ownership).
 ("seal","Harbor Seal",3,"prey",100,3,32,5,"proc_seal",1,3,0x8a8f94),
 ("sealion","Sea Lion",4,"prey",115,4,46,7,"proc_sealion",1,2,0xa0855a),
 ("orca","Orca",8,"prey",190,20,220,32,"proc_orca",1,1,0x1a1e22),
 ("minnow","Minnow Shoal",0,"prey",65,1,5,1,"fish_blue",4,7,0x5fa8e8),
 ("reeffish","Reef Fish",1,"prey",70,1,10,2,"fish_orange",4,7,0xff9d4a),
 ("mackerel","Mackerel",1,"prey",95,1,12,2,"fish_grey_long_a",4,7,0x8fa0ac),
 ("parrot","Parrotfish",2,"prey",75,2,18,3,"fish_green",2,5,0x5ad687),
 ("grouper","Grouper",3,"prey",65,4,30,5,"fish_brown",1,3,0x8a6b45),
 ("ray","Coasting Ray",3,"prey",80,3,34,5,"proc_ray",1,2,0x4a5f70),
 ("turtle","Sea Turtle",4,"prey",55,6,50,8,"proc_turtle",1,2,0x4a7a4f),
 ("tuna","Bluefin Tuna",4,"prey",135,4,44,7,"fish_red",2,6,0xd94f4a),
 ("swordfish","Swordfish",5,"prey",160,6,70,10,"proc_sword",1,2,0x3a5570),
 ("dolphinfish","Dorado",5,"prey",125,5,60,9,"fish_pink",2,4,0xff7ab0),
 ("marlin","Marlin",6,"prey",170,8,95,14,"proc_sword",1,1,0x2f5c85),
 ("squidling","Squidling",2,"prey",80,2,20,4,"proc_squid",4,7,0xc76fd6),
 ("giantsquid","Giant Squid",7,"prey",95,14,150,22,"proc_squid_big",1,1,0x8a3fa0),
 ("anglerprey","Lanternfish Swarm",6,"prey",75,1,16,3,"fish_grey",4,7,0xffe08a),
 ("abyssal","Abyss Grazer",8,"prey",85,18,200,30,"proc_grazer",1,2,0x3d5c6e),
 ("leviathanprey","Deep Leviathan Calf",10,"prey",110,40,420,60,"proc_calf",1,1,0x2a4a5c),
]
# NOTE (S3): anglerprey score outlier (16 at tier 6, far below grouper's 30 at
# tier 3) is NOT trivially parameterized -- score does not follow a clean
# f(tier) curve across the roster already (turtle t4=50, tuna t4=44, marlin
# t6=95 vs anglerprey t6=16); anglerprey is intentionally a large loose pack
# (8-16) of low-value fodder, unlike the other tier-6 single-catch marlin.
# Left as authored; flagged here rather than silently reparameterized.
HAZARDS = [
 ("mine","Drift Mine",99,"hazard",0,1,0,0,"proc_mine",25,0xd9484a),
 ("jelly","Moon Jelly",99,"hazard",30,2,8,2,"proc_jelly",6,0xc79dff),
 ("puffer","Pufferfish",99,"hazard",90,3,26,4,"proc_puffer",10,0xffd45a),
]
# Rev 6: world grows to 14400x4800 (6.4). Zone band count stays 4; yMax moves
# to 1200/2400/3600/4800 so each band is 1200px tall (was 900).
# Rev 9.5 OPEN OCEAN: zones are now DEPTH BANDS over the open-ocean SDF
# (mazeRawSDF/buildMazeLayout replaced with a seabed+mounds generator; see
# NOTES-rev9-ocean.md). Bands: 1 Sunlit 0-1100, 2 Reef 1100-2300,
# 3 Twilight 2300-3500, 4 Abyss 3500-4800. World height (4800) and band
# COUNT are unchanged, only the boundaries moved so Reef starts shallower
# (mound tops reach into it) and Abyss gets the full deep-floor share.
# Rev 7 7.2 (S3): intendedTier per zone = the player tier a zone is built
# around. Rule: every prey row's tier <= intendedTier+2 (over-tier prey moved
# to a deeper zone; density preserved by raising in-band low-tier weights
# rather than dropping population). turtle(t4) and dolphinfish(t5) moved out
# of zone1/zone2 respectively; zone3's marlin(t6)/giantsquid(t7) moved to
# zone4; low-tier weights raised in the zones that lost rows so total spawn
# pressure per zone stays comparable to Rev 6.
# Rev 9 9.4 CLARITY ("way too many random fish"): each zone's prey table is
# trimmed to AT MOST 3 species (was 4-6) so a bystander can tell what is on
# screen; hazards are unlimited (they are rare and read as distinct threats,
# not clutter). Weights raised within the surviving rows so per-zone spawn
# pressure/density is preserved (fewer species, same overall volume). Species
# dropped from a zone were either redundant with another zone's row of the
# same species (parrot/squidling t2 folded into zone2 instead of splitting
# zone1 across 5 species) or already covered by a same-tier sibling row.
ZONES = [
 {"id":1,"name":"Sunlit Shelf","yMin":0,"yMax":1100,"tint":"0x1b4d66","fog":"0x5fa8c2","ambient":"bubbles","pressureTier":1,
  "intendedTier":1,
  "spawns":[["minnow",8],["reeffish",8],["mackerel",6],["jelly",2],["puffer",1]]},
 {"id":2,"name":"Kelp Midwater","yMin":1100,"yMax":2300,"tint":"0x14384d","fog":"0x4e8199","ambient":"kelp","pressureTier":3,
  "intendedTier":3,
  "spawns":[["parrot",5],["grouper",5],["tuna",5],["jelly",2],["mine",1],["puffer",1]]},
 {"id":3,"name":"Twilight Reef","yMin":2300,"yMax":3500,"tint":"0x0c2233","fog":"0x304e65","ambient":"motes","pressureTier":6,
  "intendedTier":6,
  "spawns":[["dolphinfish",4],["swordfish",4],["anglerprey",5],["mine",2],["jelly",1]]},
 {"id":4,"name":"The Abyss","yMin":3500,"yMax":4800,"tint":"0x050d17","fog":"0x162533","ambient":"abyss","pressureTier":9,
  "intendedTier":9,
  "spawns":[["giantsquid",4],["abyssal",4],["leviathanprey",1],["mine",2]]},
]
# Rev 12 12.1: LEVELS -- 12 locations, world3d level select + above-water sky
# backdrop. unlock: {"type":"coins"|"gems"|"score","n"|"levelId"} -- coins/
# gems are a flat currency threshold; score is {"levelId":<prior id>,"n":
# <score needed on that prior level>} (progression gate). sky: gradient top/
# horizon colors + a horizonTheme id consumed by world3d's parallax silhouette
# layer (z -600). water: surface tint, 4 depth-band tints (shallow->abyss,
# matches the 4 ZONES bands), haze color. seabed: sand|reef|rock|ice|kelp|
# volcanic. preyWeights: {defId:weight} overlay merged onto the zone spawn
# tables for this level (world3d ownership; gen_data only supplies the
# weights). special: list of CREATURES ids that are level-signature spawns
# (in addition to preyWeights, for level-select blurb/thumbnail purposes).
# hazards: list of HAZARDS ids active on this level (subset of the 3 hazard
# rows above; all 12 levels currently share the full hazard set unless noted).
LEVELS = [
 {"id":"hawaii","name":"Hawaii","unlock":{"type":"coins","n":0},
  "sky":{"top":"0x1f6fb0","horizon":"0xffb066","horizonTheme":"volcano_palms"},
  "water":{"surface":"0x1b4d66","bands":["0x2a6f8c","0x1b4d66","0x0e3348","0x061a26"],"haze":"0x5fa8c2"},
  "seabed":"sand","preyWeights":{"minnow":8,"reeffish":8,"parrot":3},
  "special":["turtle"],"hazards":["jelly","puffer","mine"]},
 {"id":"mexico","name":"Mexico","unlock":{"type":"coins","n":4000},
  "sky":{"top":"0x2a5c8f","horizon":"0xd98a4a","horizonTheme":"cliffs_cacti_ruins"},
  "water":{"surface":"0x18475e","bands":["0x265f7a","0x18475e","0x0d2e3f","0x071a26"],"haze":"0x5a96ac"},
  "seabed":"rock","preyWeights":{"grouper":5,"mackerel":6,"tuna":4},
  "special":["ray"],"hazards":["jelly","puffer","mine"]},
 {"id":"belize","name":"Belize","unlock":{"type":"coins","n":9000},
  "sky":{"top":"0x1e77b8","horizon":"0xffe0a0","horizonTheme":"barrier_reef_cays"},
  "water":{"surface":"0x14556f","bands":["0x1f7091","0x14556f","0x0b3549","0x051c28"],"haze":"0x4fa4c4"},
  "seabed":"reef","preyWeights":{"reeffish":8,"parrot":6,"grouper":4},
  "special":["ray"],"hazards":["jelly","puffer","mine"]},
 {"id":"maldives","name":"Maldives","unlock":{"type":"coins","n":16000},
  "sky":{"top":"0x2f8fc4","horizon":"0xfff0c4","horizonTheme":"atolls_overwater_huts"},
  "water":{"surface":"0x156078","bands":["0x2288a8","0x156078","0x0c3c4c","0x061f28"],"haze":"0x66b8d0"},
  "seabed":"sand","preyWeights":{"dolphinfish":4,"swordfish":3,"squidling":6},
  "special":["ray"],"hazards":["jelly","puffer","mine"]},
 {"id":"newzealand","name":"New Zealand","unlock":{"type":"coins","n":26000},
  "sky":{"top":"0x3a5a78","horizon":"0xd8e4ec","horizonTheme":"fjords_snow"},
  "water":{"surface":"0x11384a","bands":["0x1c4a5f","0x11384a","0x092430","0x04131a"],"haze":"0x4a7a92"},
  "seabed":"rock","preyWeights":{"tuna":5,"marlin":2,"mackerel":5},
  "special":["seal"],"hazards":["jelly","mine"]},
 {"id":"alaska","name":"Alaska","unlock":{"type":"coins","n":40000},
  "sky":{"top":"0x4a6a82","horizon":"0xe8f0f4","horizonTheme":"glaciers_icebergs"},
  "water":{"surface":"0x0f2e3f","bands":["0x184156","0x0f2e3f","0x081e29","0x040f16"],"haze":"0x5a8a9e"},
  "seabed":"ice","preyWeights":{"tuna":4,"anglerprey":6,"seal":3},
  "special":["seal","orca"],"hazards":["mine"]},
 {"id":"tahiti","name":"Tahiti","unlock":{"type":"coins","n":58000},
  "sky":{"top":"0x1f7fc0","horizon":"0xffcf94","horizonTheme":"peaks_lagoon"},
  "water":{"surface":"0x175a76","bands":["0x257da0","0x175a76","0x0d3a4c","0x061e28"],"haze":"0x5fb0cc"},
  "seabed":"reef","preyWeights":{"parrot":6,"dolphinfish":4,"squidling":5},
  "special":["ray"],"hazards":["jelly","puffer","mine"]},
 {"id":"azores","name":"Azores","unlock":{"type":"coins","n":80000},
  "sky":{"top":"0x2c5c7a","horizon":"0xc4a488","horizonTheme":"volcanic_isles"},
  "water":{"surface":"0x123b4e","bands":["0x1d5064","0x123b4e","0x0a2632","0x05141c"],"haze":"0x4f8ca4"},
  "seabed":"volcanic","preyWeights":{"swordfish":4,"giantsquid":2,"marlin":2},
  "special":["marlin"],"hazards":["mine","jelly"]},
 {"id":"bali","name":"Bali","unlock":{"type":"coins","n":105000},
  "sky":{"top":"0x2a76b8","horizon":"0xffdca0","horizonTheme":"temples_rice_terraces"},
  "water":{"surface":"0x155a72","bands":["0x217f9c","0x155a72","0x0c3948","0x061e26"],"haze":"0x5ab0cc"},
  "seabed":"reef","preyWeights":{"parrot":6,"squidling":5,"reeffish":6},
  "special":["ray"],"hazards":["jelly","puffer","mine"]},
 {"id":"aruba","name":"Aruba","unlock":{"type":"coins","n":135000},
  "sky":{"top":"0x1e84c0","horizon":"0xfff0d0","horizonTheme":"divi_trees_beach"},
  "water":{"surface":"0x14607a","bands":["0x2088a4","0x14607a","0x0b3d4d","0x061f28"],"haze":"0x5fb8d4"},
  "seabed":"sand","preyWeights":{"mackerel":6,"tuna":5,"dolphinfish":4},
  "special":["turtle"],"hazards":["jelly","puffer","mine"]},
 {"id":"jamaica","name":"Jamaica","unlock":{"type":"coins","n":170000},
  "sky":{"top":"0x2472ac","horizon":"0xa8d888","horizonTheme":"green_hills"},
  "water":{"surface":"0x155a70","bands":["0x1f7c94","0x155a70","0x0c3a48","0x061e26"],"haze":"0x54a4bc"},
  "seabed":"reef","preyWeights":{"grouper":5,"parrot":5,"reeffish":6},
  "special":["turtle"],"hazards":["jelly","puffer","mine"]},
 {"id":"california","name":"California","unlock":{"type":"score","levelId":"jamaica","n":8000},
  "sky":{"top":"0x3a5f78","horizon":"0xd8c8b0","horizonTheme":"cliffs_pier_kelp"},
  "water":{"surface":"0x11384a","bands":["0x1c4f60","0x11384a","0x092431","0x04121a"],"haze":"0x5088a0"},
  "seabed":"kelp","preyWeights":{"tuna":5,"marlin":2,"sealion":4},
  "special":["sealion"],"hazards":["mine","jelly"]},
]

# Rev 6.7: pickup capsule table. Weighted draw on notable-kill drops (Lane E
# calls World.spawnBuffDrop) and rare ambient spawns (Lane W runSpawner).
# dur is seconds; GOLD RUSH is unchanged and stays in FRENZY2, not here.
PICKUPS = [
 {"id":"overdrive","name":"Overdrive","weight":26,"dur":8.0,"tint":"0xff2bd6"},
 {"id":"shield","name":"Shield Bubble","weight":24,"dur":0,"hits":2,"tint":"0x27e0ff"},
 {"id":"megajaw","name":"Mega-Jaw","weight":20,"dur":10.0,"tint":"0x9dff2b"},
 {"id":"magnet","name":"Frenzy Magnet","weight":18,"dur":8.0,"tint":"0xff2bd6"},
 {"id":"chum","name":"Chum Cloud","weight":16,"dur":6.0,"tint":"0x27e0ff"},
 {"id":"apex","name":"Apex Surge","weight":3,"dur":5.0,"tint":"0xd98a2b"},
 # Rev 12 12.4: MODES power-up pickups (supersize/shield/speed). Distinct ids
 # from the Rev 6.7 "shield"/"magnet" rows above (those stay as-is; this is a
 # separate son's-list buff set). All use the gem-mesh look (world3d) with a
 # per-type color + icon glyph, keyed by MODES.buffs below.
 {"id":"buff_supersize","name":"Super Size","weight":14,"dur":10.0,"tint":"0xffd400","icon":"supersize"},
 {"id":"buff_shield","name":"Aegis Shield","weight":16,"dur":12.0,"tint":"0x27e0ff","icon":"shield"},
 {"id":"buff_speed","name":"Riptide Speed","weight":18,"dur":9.0,"tint":"0x9dff2b","icon":"speed"},
]
# Rev 7 7.6 (S3): secret items + missions + gems config.
# RELICS: 3 per zone x 4 zones, deterministic seeded placement (seed=zone id)
# done by world3d (S2) at spawn init; this table is id/zoneId/name only.
RELICS = [
 {"id":"relic_z1_a","zoneId":1,"name":"Coral Shard"},
 {"id":"relic_z1_b","zoneId":1,"name":"Sunken Compass"},
 {"id":"relic_z1_c","zoneId":1,"name":"Barnacled Coin"},
 {"id":"relic_z2_a","zoneId":2,"name":"Kelp-Wrapped Idol"},
 {"id":"relic_z2_b","zoneId":2,"name":"Diver's Lantern"},
 {"id":"relic_z2_c","zoneId":2,"name":"Cracked Porthole"},
 {"id":"relic_z3_a","zoneId":3,"name":"Twilight Pearl"},
 {"id":"relic_z3_b","zoneId":3,"name":"Ghost Net Buckle"},
 {"id":"relic_z3_c","zoneId":3,"name":"Bioluminescent Vial"},
 {"id":"relic_z4_a","zoneId":4,"name":"Abyssal Rune"},
 {"id":"relic_z4_b","zoneId":4,"name":"Leviathan Tooth"},
 {"id":"relic_z4_c","zoneId":4,"name":"Void Fragment"},
]
# MISSIONS: type in eatCount/findRelic/surviveZone/score. gem reward 1-5.
# target: eatCount->{defId|null(any prey), n}; findRelic->{zoneId|null}; # of
# relics found in that run; surviveZone->{zoneId, seconds}; score->{n}.
MISSIONS = [
 {"id":"m_eat_any_15","type":"eatCount","name":"Eat 15 fish","target":{"defId":None,"n":15},"gems":1},
 {"id":"m_eat_any_40","type":"eatCount","name":"Eat 40 fish","target":{"defId":None,"n":40},"gems":2},
 {"id":"m_eat_reef_25","type":"eatCount","name":"Eat 25 reef fish","target":{"defId":"reeffish","n":25},"gems":2},
 {"id":"m_eat_mackerel_20","type":"eatCount","name":"Eat 20 mackerel","target":{"defId":"mackerel","n":20},"gems":2},
 {"id":"m_eat_tuna_10","type":"eatCount","name":"Eat 10 tuna","target":{"defId":"tuna","n":10},"gems":3},
 {"id":"m_eat_squid_8","type":"eatCount","name":"Eat 8 squidlings","target":{"defId":"squidling","n":8},"gems":2},
 {"id":"m_eat_marlin_5","type":"eatCount","name":"Eat 5 marlin","target":{"defId":"marlin","n":5},"gems":3},
 {"id":"m_find_relic_any","type":"findRelic","name":"Find a relic","target":{"zoneId":None,"n":1},"gems":3},
 {"id":"m_find_relic_2","type":"findRelic","name":"Find 2 relics","target":{"zoneId":None,"n":2},"gems":4},
 {"id":"m_find_relic_z1","type":"findRelic","name":"Find a relic in the Sunlit Shelf","target":{"zoneId":1,"n":1},"gems":2},
 {"id":"m_find_relic_z4","type":"findRelic","name":"Find a relic in the Abyss","target":{"zoneId":4,"n":1},"gems":5},
 {"id":"m_survive_z2_60","type":"surviveZone","name":"Survive 60s in the Kelp Midwater","target":{"zoneId":2,"seconds":60},"gems":2},
 {"id":"m_survive_z3_90","type":"surviveZone","name":"Survive 90s in the Twilight Reef","target":{"zoneId":3,"seconds":90},"gems":3},
 {"id":"m_survive_z4_60","type":"surviveZone","name":"Survive 60s in the Abyss","target":{"zoneId":4,"seconds":60},"gems":4},
 {"id":"m_score_2000","type":"score","name":"Score 2000 in one run","target":{"n":2000},"gems":2},
 {"id":"m_score_6000","type":"score","name":"Score 6000 in one run","target":{"n":6000},"gems":4},
]
# GEMS: award table for frenzy completions + daily bonus + world pickup value.
# Never purchasable (D5/7.6 law). goldrush/blood/school key off ctx.run
# frenzy completion type; daily is the once-per-day first-run bonus (meta.js);
# gempickup is the value of a rare world 'gempickup' entity kind.
GEMS = {"frenzy":{"goldrush":2,"blood":1,"school":1},"daily":2,"gempickup":1}
# SKINS: cosmetic palette-swap skins, gem-cost only. sharkId:null = a global
# skin selectable on any owned shark; sharkId:'<id>' = locked to that shark's
# silhouette (palette remap only, same geometry).
SKINS = [
 {"id":"skin_neon_riptide","name":"Neon Riptide","sharkId":None,"cost":6,
  "palette":{"base":0x27e0ff,"belly":0xd8fbff,"accent":0xff2bd6,"glow":0x9dff2b}},
 {"id":"skin_magma_core","name":"Magma Core","sharkId":None,"cost":6,
  "palette":{"base":0xff5a1f,"belly":0xffe0b0,"accent":0x9dff2b,"glow":0xffd45a}},
 {"id":"skin_acid_wake","name":"Acid Wake","sharkId":None,"cost":8,
  "palette":{"base":0x9dff2b,"belly":0xeaffcf,"accent":0x27e0ff,"glow":0xff2bd6}},
 {"id":"skin_void_chrome","name":"Void Chrome","sharkId":None,"cost":10,
  "palette":{"base":0x2a2f3a,"belly":0x9fa8bf,"accent":0xa07fff,"glow":0xffffff}},
 {"id":"skin_bloodtide","name":"Bloodtide","sharkId":None,"cost":8,
  "palette":{"base":0x8f1a2a,"belly":0xffc4c9,"accent":0xd98a2b,"glow":0xff2bd6}},
 {"id":"skin_gilded","name":"Gilded","sharkId":None,"cost":12,
  "palette":{"base":0xd8b06a,"belly":0xfff4d8,"accent":0xffe08a,"glow":0xffffff}},
 {"id":"skin_reef_ghost","name":"Reef Ghost","sharkId":"reef","cost":5,
  "palette":{"base":0xcfe8f0,"belly":0xffffff,"accent":0x8fd4ff,"glow":0xa0f0ff}},
 {"id":"skin_megalodon_bone","name":"Bonewhite Meg","sharkId":"megalodon","cost":15,
  "palette":{"base":0xe8e4d8,"belly":0xfff8ec,"accent":0x8f8a7a,"glow":0xfff0c4}},
]
# SECRET_SHARKS: gems-only unlock path for two existing act-3 sharks (design
# call: gate by RELIC SET count rather than adding new roster rows -- keeps
# the 61-shark roster canonical). relicSets = number of FULL zone relic sets
# (3/3 collected) required; gemCost is an alternative gems-only unlock if the
# player has not found the relics. Either path unlocks (OR, not AND).
SECRET_SHARKS = [
 {"sharkId":"nullfin","relicSets":2,"gemCost":20},
 {"sharkId":"banshee","relicSets":3,"gemCost":30},
]
ABILITIES = {
 "pyro":   {"name":"Pyro Breath","kind":"cone","range":320,"arc":0.9,"dur":2.2,"dmg":3,"charge":14,"tint":0xff7a29,"sfx":"power_fire"},
 "freeze": {"name":"Frost Pulse","kind":"pulse","range":300,"dur":0.4,"effectDur":3.0,"charge":15,"tint":0x8fe8ff,"sfx":"power_ice"},
 "volt":   {"name":"Chain Volt","kind":"chain","range":260,"jumps":6,"jumpRange":180,"dmg":2,"charge":12,"tint":0xf2f7ff,"sfx":"power_volt"},
 "toxin":  {"name":"Toxin Cloud","kind":"trail","range":90,"dur":4.0,"dot":0.8,"charge":13,"tint":0x6fe06f,"sfx":"power_toxin"},
 "sonic":  {"name":"Sonic Roar","kind":"pulse","range":380,"dur":0.5,"stun":2.2,"fear":3.5,"charge":12,"tint":0xd9c8ff,"sfx":"power_sonic"},
 "vortex": {"name":"Maw Vortex","kind":"field","range":340,"dur":2.8,"pull":420,"charge":15,"tint":0x39c6d6,"sfx":"power_vortex"},
 "phase":  {"name":"Phase Shift","kind":"self","dur":2.6,"charge":14,"tint":0xb8fff2,"sfx":"power_phase"},
 "quake":  {"name":"Quake Slam","kind":"pulse","range":420,"dur":0.6,"stun":2.8,"dmg":2,"charge":16,"tint":0xd8b06a,"sfx":"power_quake"},
 "chrono": {"name":"Chrono Field","kind":"self","dur":3.2,"worldScale":0.35,"charge":18,"tint":0xffe08a,"sfx":"power_chrono"},
 "atomic": {"name":"Atomic Breath","kind":"beam","range":900,"width":70,"dur":2.4,"dmg":99,"charge":24,"windup":0.8,"tint":0x9ffcf0,"sfx":"power_atomic"},
}
ECONOMY = {
 "levelCap":60,
 "tierUnlockLevel":[0,1,3,6,10,15,21,27,33,40,47,54,60],  # index=tier (1-based; [0] unused)
 "xpCurve":{"base":100,"growth":1.13},
 "upgradeCosts":{"base":400,"growth":1.7,"levels":5,"tierMult":0.6},
 "upgradeEffect":{"bite":0.10,"speed":0.06,"boost":0.12,"power":0.08},
 "dailyBonusMult":1.5,
 "coinRunMult":1.0,"xpRunMult":1.0,
}
FRENZY = {"comboWindow":3.0,"steps":[3,6,10],"mults":[1,2,3,5],"meterPerEat":0.06,"goldRushDur":8.0,"goldRushSpeed":1.4,"goldRushCoinMult":2}
BAL = {"metabScale":0.5,"eatHealBonus":1.25}
FRENZY2 = {"school":{"count":4,"swirlT":5.0,"eatRate":1.3},
           "blood":{"dur":6.0,"bite":1.5,"speed":1.2},
           "golden":{"chance":0.02,"coinBurst":250,"deadline":10.0}}
# Rev 12 12.4: MODES -- GOLD RUSH / MEGA GOLD RUSH as visible modes, plus
# buff-pickup effect sizes for supersize/shield/speed. goldRush reuses the
# existing FRENZY.goldRushDur/Speed/CoinMult meter mechanics (unchanged) but
# is now surfaced as a named mode with a banner/vignette/HUD bar (engine3d/
# ui3d ownership); megaGoldRush is a NEW second-tier mode reached by chaining
# a second full meter fill during Gold Rush.
MODES = {
 "goldRush": {"dur": 8.0, "coinMult": 2, "speedMult": 1.4, "invulnerable": True,
              "tint": "0xffd400", "banner": "GOLD RUSH!"},
 "megaGoldRush": {"dur": 10.0, "coinMult": 3, "speedMult": 1.5, "invulnerable": True,
                   "allEdible": True, "tint": "0xfff5b0", "banner": "MEGA GOLD RUSH!"},
 "buffs": {
   "supersize": {"dur": 10.0, "sizeMult": 1.5, "tierBonus": 2, "tint": "0xffd400"},
   "shield": {"dur": 12.0, "hits": 3, "tint": "0x27e0ff"},
   "speed": {"dur": 9.0, "speedMult": 1.5, "tint": "0x9dff2b"},
 },
}
FX = {"bubbles":{},"motes":{},"chomp":{},"deathBurst":{},"elementSpark":{},"ring":{},"beamCore":{}}
SFX = {"chomp":"sfx_snap.mp3","bubble":"sfx_bubble.mp3","splash":"sfx_splash.mp3",
       "power_fire":None,"power_ice":None,"power_volt":None,"power_toxin":None,"power_sonic":None,
       "power_vortex":None,"power_phase":None,"power_quake":None,"power_chrono":None,"power_atomic":None,
       "hurt":None,"death":None,"coin":None,"levelup":None,"goldrush":None,"roar":None}
MUSIC = {"calm":"dawn_loop.mp3","danger":None,"goldrush":None}

def js(o):
    return json.dumps(o, separators=(",", ":"))

# Rev 12 12.2: shark class rule. common = act1 tiers1-4; rare = act1 tiers5-6
# or act2 tier7; epic = act2 tier8 or act3 tiers9-10; legendary = act3
# tiers11-12; god = act4 (Pantheon); demon = act5 (Underworld).
def shark_cls(tier, act):
    if act == 1 and 1 <= tier <= 4: return "common"
    if (act == 1 and tier in (5, 6)) or (act == 2 and tier == 7): return "rare"
    if (act == 2 and tier == 8) or (act == 3 and 9 <= tier <= 10): return "epic"
    if act == 3 and 11 <= tier <= 12: return "legendary"
    if act == 4: return "god"
    if act == 5: return "demon"
    raise ValueError("no class rule for tier=%r act=%r" % (tier, act))

# HSE lane O1: base-family map (row id -> MODEL_FILES key).
#
# Every key below was render-verified in assets/bakeview before a row was
# pointed at it (evidence: hse/FAMILY_MAP.md). Five bakes were REJECTED and
# are deliberately absent: altimus (a fossil jaw, not a shark body),
# bullshark (untextured grey creature), realisticshark (degenerate mesh),
# tiger_mg (paper-thin, no volume), hammerhead_approved (a byte-duplicate of
# scallopedhammer carrying a larger texture).
#
# Families: small/reef -> dogfish, smoothhound, bullhead; hammer ->
# smoothhammer (common) / scallopedhammer (god); fast point -> mako,
# blueshark; bulk -> whitepointer, greatwhite_cy, megalodonrex; tiger ->
# tiger_nu, tigershark; whaler -> whaler; thresher -> thresher.
#
# Stylized head tags (mech/skull/void/rock/croc/angler/kaiju) have no real
# shark counterpart, so they take a neutral body of the right mass and get
# their identity from the props and shader lanes rather than the base mesh.
TEXTURED_MODEL_BY_ROW = {
    "reef":            "dogfish",           # point tiny: small houndshark bodies
    "epaulette":       "bullhead",          # blunt small: bullhead snout
    "cookiecutter": "smoothhound",  # was HELD (L2 length gate); relax-to-fit in rig_morph.js bounds it now
    "mako": "mako",  # was HELD-L2 (rig_morph gate fixed by F1)
    "blue": "mako",  # was HELD-L2 (rig_morph gate fixed by F1)
    "hammerhead":      "smoothhammer",      # hammer head tag
    "thresher": "thresher",  # was HELD-L2 (rig_morph gate fixed by F1)
    "sawshark": "thresher",  # was HELD (props); props_textured.js carries a textured-flagged material now
    "tiger":           "tiger_nu",          # blunt mid: tiger body
    "bull": "whaler",  # was HELD-L2 (rig_morph gate fixed by F1)
    # "goblin": "greatwhite_cy"  HELD: art3d pins this row to goblinshark (its own silhouette rig)
    "greatwhite":      "greatwhite_cy",     # point tier4-5: great white
    "whaleshark": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "megalodon": "whitepointer",  # was HELD-L2b; rig_morph relax-to-fit bounds the morph now
    "dunkleosteus": "bullhead",  # was HELD-L2b; rig_morph relax-to-fit bounds the morph now
    "greenland": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "snapjaw":         "tigershark",        # croc tag: broad flat jaw reads closest
    # "gulperfiend": "smoothhound"  HELD: art3d pins this row to anglerfish (its own silhouette rig)
    "anglerfang":      "smoothhound",       # angler tag: stubby body, lure prop carries identity
    "morayne": "thresher",  # was HELD-L2 (rig_morph gate fixed by F1)
    "sailfin": "blueshark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "thornback":       "bullhead",          # rock tag: chunky body
    "stonejaw":        "whaler",            # rock tag: chunky body
    "duskfin":         "mako",              # point high tier: fast/bulk mix
    "barbhook": "thresher",  # was HELD (props); textured-flagged prop material now
    "coralcrown": "whaler",  # was HELD (props); textured-flagged prop material now
    "vex": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "abyssmaw":        "smoothhound",       # angler tag: stubby body, lure prop carries identity
    "riftjaw":         "whaler",            # point high tier: fast/bulk mix
    "venomspine":      "mako",              # point high tier: fast/bulk mix
    "howler":          "tigershark",        # blunt high tier: heavy bodies
    "magmaw":          "bullhead",          # rock tag: chunky body
    "frostjaw":        "whitepointer",      # blunt high tier: heavy bodies
    "stormfin": "blueshark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "gloomtide": "blueshark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "wreckfang":       "greatwhite_cy",     # mech tag: neutral bulk, identity from props/shader
    "ironfin":         "greatwhite_cy",     # mech tag: neutral bulk, identity from props/shader
    "cindermaw":       "blueshark",         # point high tier: fast/bulk mix
    "glacier":         "whitepointer",      # blunt high tier: heavy bodies
    "gravewater":      "whitepointer",      # skull tag: neutral bulk, identity from props/shader
    "teslafang": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "plaguemaw":       "tigershark",        # blunt high tier: heavy bodies
    "sunspine":        "whitepointer",      # point high tier: fast/bulk mix
    "nocturne": "blueshark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "tempest":         "blueshark",         # point high tier: fast/bulk mix
    "maelstrom": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "bonecrown":       "greatwhite_cy",     # skull tag: neutral bulk, identity from props/shader
    "mirrorscale":     "whaler",            # point high tier: fast/bulk mix
    "aurora": "blueshark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "vulkan": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "voltaicrex": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "nullfin":         "greatwhite_cy",     # void tag: neutral bulk, identity from props/shader
    "chronos":         "mako",              # point high tier: fast/bulk mix
    "seismos": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "banshee":         "whitepointer",      # skull tag: neutral bulk, identity from props/shader
    "vortexa": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "warbringer": "greatwhite_cy",  # was HELD-L2b; relax-to-fit bounds the morph now
    "omenmaw":         "bullhead",          # angler tag: stubby body, lure prop carries identity
    "solaris":         "whitepointer",      # point high tier: fast/bulk mix
    "absolutezero": "tigershark",  # was HELD-L2 (rig_morph gate fixed by F1)
    # "leviathanrex": "whitepointer"  HELD-K: textured kaiju features render as a box pile (F2 sheet); toon rig until props_textured kaiju pass
    # "leviathan_rex": "whitepointer"  HELD-K: textured kaiju features render as a box pile (F2 sheet); toon rig until props_textured kaiju pass
    "zeusfin": "mako",  # was HELD (props); crown feature is textured-flagged now
    "poseidonrex": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "hadesmaw":        "whitepointer",      # void tag: neutral bulk, identity from props/shader
    "apollodon":       "mako",              # point high tier: fast/bulk mix
    "artemisstrike":   "whaler",            # point high tier: fast/bulk mix
    "athenajaw":       "scallopedhammer",   # hammer head tag
    "aresrender":      "tigershark",        # croc tag: broad flat jaw reads closest
    "hermesdart": "whaler",  # was HELD-L2 (rig_morph gate fixed by F1)
    "hephaestusforge": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "dionysustide":    "whaler",            # blunt high tier: heavy bodies
    "aphroditelure":   "bullhead",          # angler tag: stubby body, lure prop carries identity
    "heracrown": "whitepointer",  # was HELD (props); crown feature is textured-flagged now
    "typhonmaw": "whitepointer",  # was HELD-L2b; relax-to-fit bounds the morph now
    "hydrafang": "blueshark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "cerberusjaw": "tigershark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "chimerashark": "thresher",  # was HELD (props); saw feature is textured-flagged now
    "medusagaze":      "bullhead",          # angler tag: stubby body, lure prop carries identity
    "scyllarender": "blueshark",  # was HELD-L2 (rig_morph gate fixed by F1)
    "charybdisvoid": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "minotaurram": "whitepointer",  # was HELD (props); horns feature is textured-flagged now
    "cyclopseye":      "whaler",            # blunt high tier: heavy bodies
    "harpyshade": "whitepointer",  # was HELD-L2 (rig_morph gate fixed by F1)
    "lamiacoil": "thresher",  # was HELD-L2 (rig_morph gate fixed by F1)
    "kampechrono": "whitepointer",  # was HELD-L2b; relax-to-fit bounds the morph now
}

def shark_row(t):
    (sid,name,tier,act,cost,st,pas,active,sil,npc,blurb)=t
    stats={"speed":st[0],"accel":st[1],"turn":st[2],"bite":st[3],"hp":st[4],"metab":st[5],"boost":st[6]}
    sils={"head":sil[0],"len":sil[1],"girth":sil[2],"finScale":sil[3],"tailScale":sil[4],
          "palette":{"base":sil[5],"belly":sil[6],"accent":sil[7],"glow":sil[8]},"pattern":sil[9],"fx":sil[10]}
    # Rev 14: optional 12th SIL field selects a TEXTURED base asset by
    # MODEL_FILES key (shark3d.js). Rows that omit it keep the low-poly
    # Sharky/goblin/angler/piranha routing exactly as before, so the key is
    # emitted only when a row actually sets one.
    model = sil[11] if len(sil) > 11 else None
    # HSE lane: base-family map. Every real-shark family points at the best
    # BAKED asset that exists right now and has been render-verified; a family
    # whose bake has not landed yet stays on the current rig rather than
    # breaking. Re-check the bake folder and widen this map as GLBs arrive.
    model = model or TEXTURED_MODEL_BY_ROW.get(sid)
    if model:
        sils["model"] = model
    row={"id":sid,"name":name,"tier":tier,"act":act,"cls":shark_cls(tier,act),"cost":cost,"stats":stats,"passives":pas,
         "active":active,"sil":sils,"npc":({"weight":npc[0],"zones":npc[1]} if npc else None),"blurb":blurb}
    return js(row)

lines=[]
lines.append("/* Razorfin data tables. Pure data, zero logic. Generated by gen_data.py (orchestrator-owned).")
lines.append("   Schema: SPEC.md. Regenerate rather than hand-editing rows. No em dashes in strings. */")
lines.append("window.RFD=(function(){")
lines.append("'use strict';")
lines.append("var SHARKS=[")
for t in SHARKS: lines.append(shark_row(t)+",")
lines.append("];")
def table(name, rows, keys):
    out=["var %s=["%name]
    for r in rows:
        out.append(js(dict(zip(keys,r)))+",")
    out.append("];")
    return out
lines+=table("CREATURES",CREATURES,["id","name","tier","kind","speed","hp","score","coins","sprite","packMin","packMax","tint"])
lines+=table("HAZARDS",HAZARDS,["id","name","tier","kind","speed","hp","score","coins","sprite","dmg","tint"])
lines.append("var ZONES="+js(ZONES)+";")
lines.append("var LEVELS="+js(LEVELS)+";")
lines.append("var MODES="+js(MODES)+";")
lines.append("var PICKUPS="+js(PICKUPS)+";")
lines.append("var RELICS="+js(RELICS)+";")
lines.append("var MISSIONS="+js(MISSIONS)+";")
lines.append("var GEMS="+js(GEMS)+";")
lines.append("var SKINS="+js(SKINS)+";")
lines.append("var SECRET_SHARKS="+js(SECRET_SHARKS)+";")
lines.append("var ABILITIES="+js(ABILITIES)+";")
lines.append("var ECONOMY="+js(ECONOMY)+";")
lines.append("var FRENZY="+js(FRENZY)+";")
lines.append("var BAL="+js(BAL)+";")
lines.append("var FRENZY2="+js(FRENZY2)+";")
lines.append("var FX="+js(FX)+";")
lines.append("var SFX="+js(SFX)+";")
lines.append("var MUSIC="+js(MUSIC)+";")
lines.append("var SHARK_BY_ID={};SHARKS.forEach(function(s){SHARK_BY_ID[s.id]=s;});")
lines.append("var CREATURE_BY_ID={};CREATURES.concat(HAZARDS).forEach(function(c){CREATURE_BY_ID[c.id]=c;});")
lines.append("var RELICS_BY_ZONE={};RELICS.forEach(function(r){(RELICS_BY_ZONE[r.zoneId]=RELICS_BY_ZONE[r.zoneId]||[]).push(r);});")
lines.append("var LEVEL_BY_ID={};LEVELS.forEach(function(l){LEVEL_BY_ID[l.id]=l;});")
lines.append("return {SHARKS:SHARKS,SHARK_BY_ID:SHARK_BY_ID,CREATURES:CREATURES,HAZARDS:HAZARDS,")
lines.append("CREATURE_BY_ID:CREATURE_BY_ID,ZONES:ZONES,LEVELS:LEVELS,LEVEL_BY_ID:LEVEL_BY_ID,MODES:MODES,PICKUPS:PICKUPS,RELICS:RELICS,RELICS_BY_ZONE:RELICS_BY_ZONE,")
lines.append("MISSIONS:MISSIONS,GEMS:GEMS,SKINS:SKINS,SECRET_SHARKS:SECRET_SHARKS,ABILITIES:ABILITIES,ECONOMY:ECONOMY,")
lines.append("FRENZY:FRENZY,BAL:BAL,FRENZY2:FRENZY2,FX:FX,SFX:SFX,MUSIC:MUSIC,WORLD:{w:14400,h:4800},")
lines.append("SAVE_VERSION:3,ENTITY_BUDGET:{onscreen:32,total:120}};")
lines.append("})();")
print("\n".join(lines))
