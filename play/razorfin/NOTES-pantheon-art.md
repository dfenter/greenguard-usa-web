# Pantheon / Underworld art lane

Owner: Pantheon art lane. Scope is `shark3d.js` plus the scratchpad lineup
captures. No UI/meta files were changed and no commit was made.

## Implementation

The roster gate is now 85 definitions. The 24 Act 4/5 definitions build through
the existing welded-body, winding, ramp, eye, material, and bend gates. Their
identity geometry uses the existing feature-batch path and is resolved from the
definition palette. Every identity record is numerically audited as proud of
the local surface at `.03-.08 * bodyLen` with `deltaV >= .25` against the
flank. Act 4/5 features compact to one material batch; every late rig is six
visible draws or fewer. The new features do not add child body geometry or
break the welded appendage contract.

`cyclopseye` suppresses the ordinary eye pair and uses one oversized central
eye. `typhonmaw` has 28 storm-spike descriptors versus 16 on `leviathanrex`,
so its storm silhouette is intentionally denser.

## Per-definition audit

All rows below report six visible draws. The shot path is relative to the
scratchpad lineup directory:

`/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/shotsP/`

| ID | Identity feature geometry | Tris | Capture |
|---|---|---:|---|
| `zeusfin` | Storm-bolt dorsal crest; gold flank trim | 3714 | `shark_zeusfin.png` — reads |
| `poseidonrex` | Three trident-tine dorsal points | 3866 | `shark_poseidonrex.png` — reads |
| `hadesmaw` | Void-dark crown; three ember gill bars | 3974 | `shark_hadesmaw.png` — reads |
| `apollodon` | Sun-disc halo; solar crown ray | 3710 | `shark_apollodon.png` — reads |
| `artemisstrike` | Large crescent-moon flank blaze | 3712 | `shark_artemisstrike.png` — reads |
| `athenajaw` | Three-point crested helm ridge | 3766 | `shark_athenajaw.png` — reads |
| `aresrender` | Scarred flank plate; three red war stripes | 3814 | `shark_aresrender.png` — reads |
| `hermesdart` | Paired winged pectoral tips | 3698 | `shark_hermesdart.png` — reads |
| `hephaestusforge` | Three magma seam veins | 3850 | `shark_hephaestusforge.png` — reads |
| `dionysustide` | Three enlarged vine-coil bands | 3826 | `shark_dionysustide.png` — reads |
| `aphroditelure` | Three shell rings with pearl highlights | 3862 | `shark_aphroditelure.png` — reads |
| `heracrown` | Three regal crown points; three peacock-eye spots | 4078 | `shark_heracrown.png` — reads |
| `typhonmaw` | Twelve added storm spikes over the kaiju plate storm | 4102 | `shark_typhonmaw.png` — reads |
| `hydrafang` | Two dark, camera-proud flanking head silhouettes | 3978 | `shark_hydrafang.png` — reads |
| `cerberusjaw` | Two extra jaw-line ridges; triple collar rings | 3838 | `shark_cerberusjaw.png` — reads |
| `chimerashark` | Dark/bright mismatched half-body split | 3882 | `shark_chimerashark.png` — reads |
| `medusagaze` | Three snake-coil crown tendrils; oversized petrifying eye | 3874 | `shark_medusagaze.png` — reads |
| `scyllarender` | Six enlarged tentacle-skirt cones at the pectoral line | 4010 | `shark_scyllarender.png` — reads |
| `charybdisvoid` | Three spiral vortex mouth rings | 3890 | `shark_charybdisvoid.png` — reads |
| `minotaurram` | Paired bull horns; gold nose ring | 3788 | `shark_minotaurram.png` — reads |
| `cyclopseye` | One central eye socket ring around the oversized eye | 3472 | `shark_cyclopseye.png` — reads |
| `harpyshade` | Six feathered wing-blade pectoral shapes | 3730 | `shark_harpyshade.png` — reads |
| `lamiacoil` | Authored elongated serpent tail; three proud coil bands | 4082 | `shark_lamiacoil.png` — reads |
| `kampechrono` | Two clock rings; clock-hand flank glyph | 3845 | `shark_kampechrono.png` — reads |

All 24 are below the 4200-triangle rig ceiling. The highest late-roster rig is
`typhonmaw` at 4102; `lamiacoil` is next at 4082. All Act 4/5 rows report one
compact identity feature batch and six visible draws.

## Measured shot and runtime audit

- Required command completed with all 24 IDs and produced 24 PNGs in `shotsP/`.
- A contact sheet was inspected, followed by individual checks of the weaker
  first pass (`artemisstrike`, `dionysustide`, `hydrafang`, `scyllarender`, and
  `lamiacoil`). Artemis, Dionysus, Scylla, Hydra, and Lamia were strengthened
  or surface-corrected before the final lineup capture.
- Standalone Chrome runtime audit with `?unlockall=1` returned exact
  `ctx.player.defId === requestedId` and the expected definition name for all
  24/24 IDs. No bad-ID fallback rendered reef.
- The current gameplay HUD does not render the shark name, so the name cannot
  be verified literally from pixels in these captures. The exact runtime
  definition/name audit above is the substitute; adding a HUD name is outside
  this lane and belongs to the parallel UI lane.

## Suite result / deviations

`node --import ./tools/reg.mjs tools/selftest.mjs art3d` passes (`pass=true`,
`ok=7`, `fail=0`). The final full suite also passed: `world` 206/206,
`game` 278/278, `fish` 7/7, `fx` 0/0, `ui` 238/238, `meta` 170/170, and
`abilities` 0/0. The anticipated `ACT_NAMES` mismatch did not occur in this
run. No UI/meta changes were made.
