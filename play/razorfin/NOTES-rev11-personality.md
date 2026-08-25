# Rev 11 — Shark Personality lane

Date: 2026-08-24  
Owner: Razorfin / Luna xhigh  
Scope: `play/razorfin/shark3d.js` and scratchpad render probes

## Result

All 85 roster rows now have an authored personality definition. The approved
Sharky base, 9c shading, tint pipeline, and draw budget remain intact. `reef`
is the neutral reference row: its geometry, face, and surface morph values are
zero/one defaults and `personalityGeometryFor()` returns an untouched clone.

The implementation has four layers per row:

- `bulk`: head, neck, chest/abdomen, tail, and fin multipliers applied on top
  of the existing rig profile.
- `sculpt`: bind-pose displacement for head/neck/chest/tail, jaw and
  underbite, brow, dorsal, back hump, belly sag, and muscle wave.
- `face`: eye scale, brow angle, pupil scale, jaw gape bias, and face tilt;
  the normal bite animation still owns the live jaw motion.
- `surface`: relief amplitude, texture density, scars, plates, pattern mode,
  plus one clean signature feature. Relief is a normal perturbation in the
  existing skin shader; props remain limited to the existing allowlist.

Geometry is baked per `(template, shark id, skinned mesh index)` into a cache.
Vertex regions come from the GLB skin weights for `Head`, `Neck`, `Abdomen`,
`Tail`, and `LowerJaw` (with a normalized positional fallback for unnamed
template bones). Normals and bounds are recomputed after displacement, so the
sculpt stays rigged and has no mesh seam. The measured maximum offset is 0.0532
of model span, below the 0.30 sanity bound.

## Personality table

The numeric authored values are the `PERSONALITY_TABLE` in
`play/razorfin/shark3d.js`. This compact table records the design brief and
signature read for every row, in roster order.

| Act | ID | Character brief | Signature read |
|---:|---|---|---|
| 1 | reef | quick small nimble reef scout | clean starter silhouette |
| 1 | epaulette | shallows crawler, low belly, bright alert eyes | walking-paw fin read |
| 1 | cookiecutter | small round biter with absurd confidence | circular bite collar |
| 1 | mako | racing torpedo, long slim flank, sharp snout | razor dorsal and racing flank |
| 1 | blue | elegant long-distance sprinter, cool and watchful | needle tail and glassy eye |
| 1 | hammerhead | broad-headed sweep hunter, focused and fearless | cephalofoil silhouette |
| 1 | thresher | lean hunter with a whip tail and patient stare | oversized whip tail |
| 1 | sawshark | compact blade-nose ambusher, eyes narrowed | clean saw rostrum |
| 1 | tiger | stocky striped bruiser with a low brow | vertical tiger bars |
| 1 | bull | short thick brawler, heavy brow, underbite | knuckle-heavy chest |
| 1 | goblin | long blade snout, protruding jaw, nervous eyes | projecting jaw |
| 1 | greatwhite | massive chest, clean apex wedge, confident face | high dorsal and white belly |
| 1 | whaleshark | gentle giant, hangar mouth, soft sleepy eye | polka-dot hangar jaw |
| 1 | megalodon | monster bulk, scarred hide, massive jaw | three long cheek scars |
| 1 | dunkleosteus | ancient armored tank, blunt plated skull | bone-plate cheek shield |
| 1 | greenland | ancient slow tank, sagging bulk, cloudy eye, mottled | drooping aged silhouette |
| 2 | snapjaw | crocodile-short brawler with a clamped underbite | croc jaw block |
| 2 | gulperfiend | deepwater balloon body, tiny eye, eager gape | stretchable gulper pouch |
| 2 | anglerfang | small angler with a forward lunge and sharp chin | single lure focus |
| 2 | morayne | bus-sized eel, ribbon body, lazy predatory eye | ribbon tail coil |
| 2 | sailfin | needle-fast sprinter with a banner dorsal fin | sail-like fin rays |
| 2 | thornback | rock-backed bruiser whose fins stay sharp | thorn ridge |
| 2 | stonejaw | reef boulder that learned to bite | stone brow and jaw |
| 2 | duskfin | low-profile dusk hunter, narrow body and sly eyes | shadowed eye line |
| 2 | barbhook | barbed harpoon snout, rigid neck, trapper stare | barbed saw rostrum |
| 2 | coralcrown | living reef carrier, thick shoulders, proud chin | coral crown contact prop |
| 2 | vex | warped void swimmer, narrow middle and sideways gaze | asymmetric void brow |
| 2 | abyssmaw | deep returned thing, oversized throat and hungry eye | dark gulper throat |
| 2 | riftjaw | lunge-built wedge, split-second eyes, lean chest | split jaw plane |
| 2 | venomspine | slender venom carrier, lifted back and cruel grin | raised venom spines |
| 2 | howler | big-mouthed blunt caller, chest like a speaker cone | throat-rattle chest |
| 2 | magmaw | hot rock maw, square skull and heavy shoulders | lava fissure brow |
| 2 | frostjaw | cold stocky hunter, compressed snout and fixed stare | ice wedge snout |
| 2 | stormfin | thunderhead sprinter, electric dorsal and alert face | forked storm fin |
| 2 | gloomtide | long drifting eel, soft belly, magnet-eyed ambush | magnetic eye dots |
| 2 | wreckfang | salvage-eater, iron shoulders, square mechanical jaw | riveted shoulder plates |
| 3 | ironfin | purpose-built steel shark, narrow nose, rigid spine | panel-line back |
| 3 | cindermaw | heat-scarred open-water striker, lean with a hard jaw | cinder cheek cracks |
| 3 | glacier | drifting ice age, wide forehead, heavy calm body | faceted ice hump |
| 3 | gravewater | already-dead swimmer, hollow face, loose belly | sunken socket read |
| 3 | teslafang | charged long-snouted feeder, spring-loaded tail | charged flank ridge |
| 3 | plaguemaw | infected stocky carrier, swollen throat and mean brow | boil-like relief |
| 3 | sunspine | solar sprinter with a high radiant dorsal line | sun-ray dorsal |
| 3 | nocturne | deepening night hunter, narrow face, upward gaze | star-speckled face |
| 3 | tempest | weather-front torpedo, tense neck and warning stare | storm-front fin edge |
| 3 | maelstrom | wide drain-mouth, rolling belly, unstoppable current | spiral belly relief |
| 3 | bonecrown | skeletal monarch, tall brow, tight hungry body | bone crown ridge |
| 3 | mirrorscale | reflective decoy, sleek flank, unreadable face | mirror flank shimmer |
| 3 | aurora | long elegant light-runner, lifted fins, curious eyes | ribbon light fin |
| 3 | vulkan | volcanic boulder, high back, square furnace jaw | volcanic back plates |
| 3 | voltaicrex | storm king, long crown line, charged cheek muscles | electric crown ridge |
| 3 | nullfin | void cutout, missing fin line, severe jaw | missing dorsal notch |
| 3 | chronos | precise ringed hunter, lean body, measured gaze | clock rings over flank |
| 3 | seismos | seafloor tank, thick neck, low quaking brow | fault-line shoulder |
| 3 | banshee | hollow screamer, narrow skull, stretched jaw hinge | long scream jaw |
| 3 | vortexa | wide vortex mouth, coiled belly, fixed hungry eye | spiral cheek vortex |
| 3 | warbringer | decommissioned war beast, armored chest, blunt snout | armored shoulder mass |
| 3 | omenmaw | prophecy angler, towering throat, hypnotic forward face | rune throat lantern |
| 3 | solaris | small sun, compact power chest, bright fearless eye | corona brow rays |
| 3 | absolutezero | frozen blunt tank, compressed face, unblinking eye | ice-facet jaw |
| 3 | leviathanrex | kaiju monster, massive chest, scarred king jaw | massive scarred kaiju |
| 4 | zeusfin | lightning spear, upright brow, decisive king stare | crown of fin rays |
| 4 | poseidonrex | current-owning whale, huge shoulders, calm imperial eye | tidal shoulder curl |
| 4 | hadesmaw | underworld collector, void cheek, closed severe eye | void rune jaw |
| 4 | apollodon | sun bite, lean heroic wedge, high cheek plane | sun corona brow |
| 4 | artemisstrike | silent huntress, thin profile, perfectly level eyes | arrow-straight flank |
| 4 | athenajaw | strategist hammerhead, armored forehead, measuring gaze | armored cephalofoil |
| 4 | aresrender | the fight itself, crocodile jaw, forward-leaning shoulders | rendered croc jaw |
| 4 | hermesdart | messenger dart, needle nose, restless bright eyes | winglike fin dart |
| 4 | hephaestusforge | self-built forge shark, square torso, hot rivet brow | forge rivet brow |
| 4 | dionysustide | party tide, broad cheeks, mischievous half-lidded eye | bubbled cheek relief |
| 4 | aphroditelure | beautiful lure, elegant body, inviting dangerous gaze | lure-forward face |
| 4 | heracrown | queen-sized kaiju, armored shoulders, unblinking crown stare | crown and shoulder armor |
| 5 | typhonmaw | old god monster, asymmetrical bulk, jaw like a cave | monster cave maw |
| 5 | hydrafang | serpentine many-headed read, long neck, coiling tail | repeating neck bands |
| 5 | cerberusjaw | guard-dog brawler, triple-hinge jaw, broad neck | layered guard jaw |
| 5 | chimerashark | three-animal hybrid, saw nose, mismatched muscle | saw plus split dorsal |
| 5 | medusagaze | lure-eyed petrifier, soft body, forward hypnotic face | large gaze spot |
| 5 | scyllarender | rock strait hunter, eel length, six-cut jaw attitude | six flank cuts |
| 5 | charybdisvoid | drain-mouth whale, hollow chest, orbiting eye | void drain spiral |
| 5 | minotaurram | horned maze brute, thick neck, lowered ram brow | ram horns and stone brow |
| 5 | cyclopseye | single-eyed heavy tank, centered stare, blunt jaw | single centered eye |
| 5 | harpyshade | ambush glider, thin shoulders, hooked stealth gaze | wing-fin shadow |
| 5 | lamiacoil | lullaby eel, long coil, soft jaw and sleepy eye | long lullaby coil |
| 5 | kampechrono | gate guardian, skull brow, compact clockwork bulk | clockwork bone brow |

## Gates and audit

Targeted command:

```text
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish
art3d: pass=true
fish: pass=true
```

The direct Art3D report was also checked after the final close-pair tuning:

| Check | Result |
|---|---:|
| Personality rows | 85 / 85 |
| Missing IDs | 0 |
| Baked personality geometries | 85 shark rows (163 cached skinned-mesh entries) |
| Maximum morph/span ratio | 0.0532 |
| Draw budget | unchanged, <=3 |
| Act 1: rows / unique / minimum feature difference | 16 / 16 / 2 |
| Act 2: rows / unique / minimum feature difference | 20 / 20 / 2 |
| Act 3: rows / unique / minimum feature difference | 25 / 25 / 2 |
| Act 4: rows / unique / minimum feature difference | 12 / 12 / 3 |
| Act 5: rows / unique / minimum feature difference | 12 / 12 / 3 |

The closest code-level pairs were reef/greatwhite, gulperfiend/abyssmaw,
maelstrom/vortexa, zeusfin/poseidonrex, and hydrafang/scyllarender; each still
differs in at least two of silhouette, pattern, hue family, and face attitude.

The 85-row local Chrome capture and contact-sheet audit are at:

- Contact sheet: `/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/shotsP11-final/contact.png`
- Render report: `/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/shotsP11-final/render-audit.json`
- Harness: `/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/sharkline.js`

The screenshot analyzer reported 85 images and the following minimum visual
distances (floor: 0.0200):

| Act | Rows | Minimum | Closest visual pair | Median |
|---:|---:|---:|---|---:|
| 1 | 16 | 0.025455 | cookiecutter / epaulette | 0.152068 |
| 2 | 20 | 0.022606 | sailfin / stormfin | 0.153761 |
| 3 | 25 | 0.020213 | aurora / banshee | 0.114756 |
| 4 | 12 | 0.031732 | dionysustide / hadesmaw | 0.164702 |
| 5 | 12 | 0.037092 | hydrafang / scyllarender | 0.188244 |

The in-app Browser surface was unavailable during this pass (`agent.browsers.list()`
returned no browsers), so the roster capture used the existing local
Chrome/puppeteer scratchpad harness. The local Chrome run loaded and captured
all 85 rows; no browser console/render failure was observed in that harness.

The requested repository-wide command was also run:

```text
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
```

`art3d`, `fish`, `fx`, `meta`, and `abilities` passed. The working tree's
unrelated `game` camera-framing assertion and `ui` buff-pickup-label assertion
remain red in other owned files (`engine3d.js` and `ui3d.js`); this lane did
not modify or mask them. `node --check play/razorfin/shark3d.js` passes.
