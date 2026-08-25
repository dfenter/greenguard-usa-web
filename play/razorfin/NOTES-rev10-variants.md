# Rev 10 variant-art audit

Date: 2026-08-24  
Lane: VARIANT ART / Luna xhigh  
Owner scope: `play/razorfin/shark3d.js`, this audit note, and scratchpad probes only.

## Verdict

Final pass: 85/85 rows rendered and audited. Every row has a visible identity signal at the gameplay camera: a per-bone silhouette profile, a readable pattern or palette separation, a species eye/accent family, or (for acts 2–5) an authored glow family. No non-allowlisted bone-mounted prop remains. The approved Sharky base shading, jaw, and tint pipeline remains intact; `reef` is explicitly neutral in the variant profile.

The contact sheet is at `/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/shotsV/contact.png`. The render report is `.../shotsV/render-audit.json`.

## Iteration log / self-rejections

- Rejected the first implementation's hashed scale on `reef`: it was an approved base-reference row, so its Head/Neck/Abdomen/Tail/Fin/Jaw factors are now exactly `[1,1,1]`.
- Rejected the first focused prop render: GLB-bone child translations magnified into floating features. Retained props now have zero child translation, are fit against the body, and are removed unless their world-space bounding boxes contact the body.
- Rejected all historical tag-driven decorations (grin, cyclops eye, spikes, lures, generic plates, and unscoped horns). Only the allowlist below can instantiate a prop.
- Re-rendered all 85 rows after those changes. The final contact sheet has no shark-mounted floating artifact. White rectangles, bubbles, ability particles, and HUD elements visible in the screenshots are world/UI dressing and are excluded from the shark-child audit.

## Allowlist

| IDs | Feature | Final result |
|---|---|---|
| `hammerhead`, `athenajaw` | hammer cephalofoil | retained, head-contact fitted |
| `sawshark`, `barbhook`, `chimerashark` | sawshark rostrum | retained, head-contact fitted |
| `minotaurram` | horns | retained, head-contact fitted |
| `coralcrown`, `zeusfin`, `heracrown` | crown | retained, head-contact fitted |
| every other row | no prop | verified |

## Render gate

The PIL probe `contact-sheet.py` tiles the 85 head/body captures and measures compact color/edge feature distance for every pair within each act. It enforces a minimum distance floor of `0.0200`.

| Act | Rows | Unique captures | Minimum pair distance | Closest pair | Gate |
|---:|---:|---:|---:|---|---|
| 1 | 16 | 16 | 0.039609 | blue / reef | PASS |
| 2 | 20 | 20 | 0.030710 | snapjaw / venomspine | PASS |
| 3 | 25 | 25 | 0.025118 | glacier / nocturne | PASS |
| 4 | 12 | 12 | 0.061562 | athenajaw / hephaestusforge | PASS |
| 5 | 12 | 12 | 0.039734 | kampechrono / scyllarender | PASS |

The closest pairs were inspected at full capture size. They remain distinct through silhouette, pattern, or palette/eye/glow separation; none was rejected in the final pass.

## Full per-row audit

| # | Act | id | Base | Shape lane | Pattern | Allowlisted prop | Distinct? | Clean? |
|---:|---:|---|---|---|---|---|---|---|
| 1 | 1 | reef | sharky | point; L1.00 / G0.34 | plain | none | PASS (render) | PASS |
| 2 | 1 | epaulette | sharky | blunt; L0.92 / G0.30 | spots | none | PASS (render) | PASS |
| 3 | 1 | cookiecutter | sharky | blunt; L0.85 / G0.30 | collar | none | PASS (render) | PASS |
| 4 | 1 | mako | sharky | point; L1.10 / G0.32 | plain | none | PASS (render) | PASS |
| 5 | 1 | blue | sharky | point; L1.15 / G0.28 | plain | none | PASS (render) | PASS |
| 6 | 1 | hammerhead | sharky | hammer; L1.20 / G0.36 | plain | hammer | PASS (render) | PASS |
| 7 | 1 | thresher | sharky | point; L1.30 / G0.28 | plain | none | PASS (render) | PASS |
| 8 | 1 | sawshark | sharky | saw; L1.15 / G0.30 | plain | saw | PASS (render) | PASS |
| 9 | 1 | tiger | sharky | blunt; L1.30 / G0.40 | stripes | none | PASS (render) | PASS |
| 10 | 1 | bull | sharky | blunt; L1.22 / G0.44 | plain | none | PASS (render) | PASS |
| 11 | 1 | goblin | goblinshark | point; L1.18 / G0.33 | plain | none | PASS (render) | PASS |
| 12 | 1 | greatwhite | sharky | point; L1.45 / G0.46 | plain | none | PASS (render) | PASS |
| 13 | 1 | whaleshark | sharky | whale; L1.80 / G0.55 | dots | none | PASS (render) | PASS |
| 14 | 1 | megalodon | sharky | blunt; L1.75 / G0.55 | scars | none | PASS (render) | PASS |
| 15 | 1 | dunkleosteus | sharky | rock; L1.55 / G0.60 | plates | none | PASS (render) | PASS |
| 16 | 1 | greenland | sharky | blunt; L1.60 / G0.50 | mottled | none | PASS (render) | PASS |
| 17 | 2 | snapjaw | sharky | croc; L1.65 / G0.48 | scales | none | PASS (render) | PASS |
| 18 | 2 | gulperfiend | anglerfish | angler; L1.50 / G0.52 | plain | none | PASS (render) | PASS |
| 19 | 2 | anglerfang | anglerfish | angler; L1.35 / G0.42 | plain | none | PASS (render) | PASS |
| 20 | 2 | morayne | sharky | eel; L1.90 / G0.24 | bands | none | PASS (render) | PASS |
| 21 | 2 | sailfin | sharky | point; L1.40 / G0.30 | plain | none | PASS (render) | PASS |
| 22 | 2 | thornback | sharky | rock; L1.45 / G0.50 | spikes | none | PASS (render) | PASS |
| 23 | 2 | stonejaw | sharky | rock; L1.50 / G0.55 | cracks | none | PASS (render) | PASS |
| 24 | 2 | duskfin | sharky | point; L1.35 / G0.34 | plain | none | PASS (render) | PASS |
| 25 | 2 | barbhook | sharky | saw; L1.40 / G0.36 | plain | saw | PASS (render) | PASS |
| 26 | 2 | coralcrown | sharky | blunt; L1.40 / G0.44 | coral | crown | PASS (render) | PASS |
| 27 | 2 | vex | sharky | void; L1.30 / G0.36 | plain | none | PASS (render) | PASS |
| 28 | 2 | abyssmaw | anglerfish | angler; L1.60 / G0.50 | plain | none | PASS (render) | PASS |
| 29 | 2 | riftjaw | sharky | point; L1.40 / G0.38 | plain | none | PASS (render) | PASS |
| 30 | 2 | venomspine | sharky | point; L1.38 / G0.36 | spikes | none | PASS (render) | PASS |
| 31 | 2 | howler | sharky | blunt; L1.42 / G0.40 | plain | none | PASS (render) | PASS |
| 32 | 2 | magmaw | sharky | rock; L1.45 / G0.46 | cracks | none | PASS (render) | PASS |
| 33 | 2 | frostjaw | sharky | blunt; L1.45 / G0.44 | plain | none | PASS (render) | PASS |
| 34 | 2 | stormfin | sharky | point; L1.40 / G0.34 | plain | none | PASS (render) | PASS |
| 35 | 2 | gloomtide | sharky | eel; L1.70 / G0.30 | plain | none | PASS (render) | PASS |
| 36 | 2 | wreckfang | sharky | mech; L1.50 / G0.48 | rivets | none | PASS (render) | PASS |
| 37 | 3 | ironfin | sharky | mech; L1.55 / G0.44 | panels | none | PASS (render) | PASS |
| 38 | 3 | cindermaw | sharky | point; L1.55 / G0.42 | cracks | none | PASS (render) | PASS |
| 39 | 3 | glacier | sharky | blunt; L1.65 / G0.50 | facets | none | PASS (render) | PASS |
| 40 | 3 | gravewater | sharky | skull; L1.50 / G0.42 | rot | none | PASS (render) | PASS |
| 41 | 3 | teslafang | sharky | point; L1.48 / G0.36 | plain | none | PASS (render) | PASS |
| 42 | 3 | plaguemaw | sharky | blunt; L1.52 / G0.44 | boils | none | PASS (render) | PASS |
| 43 | 3 | sunspine | sharky | point; L1.50 / G0.38 | rays | none | PASS (render) | PASS |
| 44 | 3 | nocturne | sharky | point; L1.50 / G0.38 | stars | none | PASS (render) | PASS |
| 45 | 3 | tempest | sharky | point; L1.52 / G0.36 | plain | none | PASS (render) | PASS |
| 46 | 3 | maelstrom | sharky | whale; L1.75 / G0.52 | swirls | none | PASS (render) | PASS |
| 47 | 3 | bonecrown | sharky | skull; L1.58 / G0.46 | bones | none | PASS (render) | PASS |
| 48 | 3 | mirrorscale | sharky | point; L1.48 / G0.38 | mirror | none | PASS (render) | PASS |
| 49 | 3 | aurora | sharky | point; L1.62 / G0.42 | ribbons | none | PASS (render) | PASS |
| 50 | 3 | vulkan | sharky | rock; L1.70 / G0.50 | magma | none | PASS (render) | PASS |
| 51 | 3 | voltaicrex | sharky | point; L1.65 / G0.42 | plain | none | PASS (render) | PASS |
| 52 | 3 | nullfin | sharky | void; L1.55 / G0.40 | plain | none | PASS (render) | PASS |
| 53 | 3 | chronos | sharky | point; L1.58 / G0.40 | rings | none | PASS (render) | PASS |
| 54 | 3 | seismos | sharky | rock; L1.75 / G0.55 | faults | none | PASS (render) | PASS |
| 55 | 3 | banshee | sharky | skull; L1.55 / G0.38 | plain | none | PASS (render) | PASS |
| 56 | 3 | vortexa | sharky | whale; L1.80 / G0.54 | swirls | none | PASS (render) | PASS |
| 57 | 3 | warbringer | sharky | mech; L1.80 / G0.50 | plating | none | PASS (render) | PASS |
| 58 | 3 | omenmaw | anglerfish | angler; L1.75 / G0.52 | runes | none | PASS (render) | PASS |
| 59 | 3 | solaris | sharky | point; L1.70 / G0.44 | corona | none | PASS (render) | PASS |
| 60 | 3 | absolutezero | sharky | blunt; L1.75 / G0.48 | facets | none | PASS (render) | PASS |
| 61 | 3 | leviathanrex | sharky | kaiju; L2.20 / G0.60 | plates | none | PASS (render) | PASS |
| 62 | 4 | zeusfin | sharky | point; L1.58 / G0.40 | rays | crown | PASS (render) | PASS |
| 63 | 4 | poseidonrex | sharky | whale; L1.78 / G0.53 | swirls | none | PASS (render) | PASS |
| 64 | 4 | hadesmaw | sharky | void; L1.58 / G0.40 | runes | none | PASS (render) | PASS |
| 65 | 4 | apollodon | sharky | point; L1.54 / G0.40 | corona | none | PASS (render) | PASS |
| 66 | 4 | artemisstrike | sharky | point; L1.50 / G0.36 | facets | none | PASS (render) | PASS |
| 67 | 4 | athenajaw | sharky | hammer; L1.58 / G0.40 | plates | hammer | PASS (render) | PASS |
| 68 | 4 | aresrender | sharky | croc; L1.62 / G0.46 | cracks | none | PASS (render) | PASS |
| 69 | 4 | hermesdart | sharky | point; L1.46 / G0.34 | rings | none | PASS (render) | PASS |
| 70 | 4 | hephaestusforge | sharky | mech; L1.62 / G0.50 | rivets | none | PASS (render) | PASS |
| 71 | 4 | dionysustide | sharky | blunt; L1.50 / G0.42 | boils | none | PASS (render) | PASS |
| 72 | 4 | aphroditelure | anglerfish | angler; L1.48 / G0.38 | mirror | none | PASS (render) | PASS |
| 73 | 4 | heracrown | sharky | kaiju; L2.18 / G0.58 | faults | crown | PASS (render) | PASS |
| 74 | 5 | typhonmaw | sharky | kaiju; L2.22 / G0.61 | faults | none | PASS (render) | PASS |
| 75 | 5 | hydrafang | sharky | eel; L1.85 / G0.30 | bands | none | PASS (render) | PASS |
| 76 | 5 | cerberusjaw | sharky | croc; L1.60 / G0.46 | cracks | none | PASS (render) | PASS |
| 77 | 5 | chimerashark | sharky | saw; L1.52 / G0.42 | scales | saw | PASS (render) | PASS |
| 78 | 5 | medusagaze | anglerfish | angler; L1.44 / G0.40 | spots | none | PASS (render) | PASS |
| 79 | 5 | scyllarender | sharky | eel; L1.86 / G0.28 | bands | none | PASS (render) | PASS |
| 80 | 5 | charybdisvoid | sharky | whale; L1.80 / G0.54 | swirls | none | PASS (render) | PASS |
| 81 | 5 | minotaurram | sharky | rock; L1.55 / G0.52 | faults | horns | PASS (render) | PASS |
| 82 | 5 | cyclopseye | sharky | blunt; L1.55 / G0.46 | scars | none | PASS (render) | PASS |
| 83 | 5 | harpyshade | sharky | point; L1.42 / G0.32 | stripes | none | PASS (render) | PASS |
| 84 | 5 | lamiacoil | sharky | eel; L1.88 / G0.26 | bands | none | PASS (render) | PASS |
| 85 | 5 | kampechrono | sharky | skull; L1.58 / G0.42 | bones | none | PASS (render) | PASS |

## Gate commands

- `node --check play/razorfin/shark3d.js` — PASS.
- `node --import ./tools/reg.mjs tools/selftest.mjs art3d` — `pass=true ok=5 fail=0`.
- Full suite `world game art3d fish fx ui meta abilities` — every lane PASS; world 210 checks, game 278, art3d 5, fish 8, fx 0, ui 238, meta 170, abilities 0.
- Art3D node selftest — 85/85 checked, max visible draw count 3, preload/cache green, act signatures 16/16, 20/20, 25/25, 12/12, 12/12, and retained props exactly match the allowlist.
- Browser harness — 85/85 final captures; contact-sheet render gate PASS.

## Implementation summary

- Per-variant Sharky bone factors cover Head, Neck, Abdomen, Tail1–4, LowerJaw, and available Fin1/Fin2 L/R bones.
- Named silhouette families include slim mako/blue, long-tailed thresher, thick bull, broad hammerhead, bulky whale/kaiju/greenland, eel-like rows, heavier croc/jaw rows, and exaggerated act-5 jaws.
- Texture identity uses readable pattern scale, per-row seeded patterning, belly/accent colors, named eye colors with deterministic fallback, and automatic act 2–5 glow family resolution where authored glow is absent.
- Goblin and angler rows keep their own bases; Sharky variants do not receive generic bolt-on decorations.
