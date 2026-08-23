# NOTES — Pantheon data lane (2026-08-23)

Owner: data lane (tools/gen_data.py, data.js, SPEC.md, this file). Nothing
else touched.

## Task

Dan's directive: "god versions / demon versions of the sharks, all the
greek gods and demons." Added 24 rows to SHARKS in tools/gen_data.py:
- Act 4 "Pantheon" (12 gods)
- Act 5 "Underworld" (12 demons/monsters)

Roster grows 61 -> 85. Regenerated data.js via `python3 tools/gen_data.py >
data.js`. Verified with a standalone eval: `window.RFD.SHARKS.length ===
85`, `acts === [1,2,3,4,5]`.

## Full new-row inventory

All stats scale from the Act-3 tier9-12 curve. heracrown (act4 tier12) and
typhonmaw (act5 tier12) top out ~1400/1450 hp and 16/17 bite vs
leviathanrex's 1400 hp / 16 bite -- both within the ~10% power-creep cap
Dan set (heracrown ~+3% hp, typhonmaw ~+3.5% hp). Exactly one tier-12 per
new act, matching the "one tier-12 per act max" rule.

### Act 4 — Pantheon (gods, radiant palettes, npc always None)

| id | name | tier | cost | head | pattern | active |
|---|---|---|---|---|---|---|
| zeusfin | Zeusfin | 9 | 160000 | point | rays | volt |
| poseidonrex | Poseidonrex | 9 | 162000 | whale | swirls | vortex |
| hadesmaw | Hadesmaw | 10 | 180000 | void | runes | phase |
| apollodon | Apollodon | 9 | 160000 | point | corona | pyro |
| artemisstrike | Artemis Strike | 9 | 158000 | point | facets | freeze |
| athenajaw | Athenajaw | 10 | 182000 | hammer | plates | sonic |
| aresrender | Aresrender | 10 | 184000 | croc | cracks | pyro |
| hermesdart | Hermes Dart | 9 | 159000 | point | rings | chrono |
| hephaestusforge | Hephaestus Forge | 10 | 183000 | mech | rivets | quake |
| dionysustide | Dionysus Tide | 9 | 158000 | blunt | boils | toxin |
| aphroditelure | Aphrodite Lure | 9 | 159000 | angler | mirror | sonic |
| heracrown | Hera Crown | 12 | 220000 | kaiju | faults | quake |

### Act 5 — Underworld (demons/monsters, infernal palettes)

| id | name | tier | cost | head | pattern | active | npc |
|---|---|---|---|---|---|---|---|
| typhonmaw | Typhonmaw | 12 | 222000 | kaiju | faults | quake | None |
| hydrafang | Hydrafang | 10 | 182000 | eel | bands | toxin | (2,[3,4]) |
| cerberusjaw | Cerberus Jaw | 10 | 183000 | croc | cracks | pyro | (3,[3,4]) |
| chimerashark | Chimera Shark | 9 | 160000 | saw | scales | pyro | None |
| medusagaze | Medusa Gaze | 9 | 159000 | angler | spots | freeze | None |
| scyllarender | Scylla Render | 9 | 158000 | eel | bands | vortex | None |
| charybdisvoid | Charybdis Void | 10 | 184000 | whale | swirls | vortex | None |
| minotaurram | Minotaur Ram | 10 | 183000 | rock | faults | quake | None |
| cyclopseye | Cyclops Eye | 9 | 159000 | blunt | scars | sonic | (2,[3,4]) |
| harpyshade | Harpy Shade | 9 | 158000 | point | stripes | phase | (3,[3,4]) |
| lamiacoil | Lamia Coil | 9 | 159000 | eel | bands | toxin | None |
| kampechrono | Kampe Chrono | 10 | 185000 | skull | bones | chrono | None |

4 demon npc entries added (hydrafang, cerberusjaw, cyclopseye, harpyshade),
all zones [3,4], weights 2-3 (low, per instruction). Zero god npc entries
(gods never ambient predators, per instruction).

All heads/patterns/passives/actives drawn only from the existing enumerated
sets (verified: patterns cross-checked against SUPPORTED_PATTERN_IDS in
shark3d.js:58-63; heads against the archetype list already in use in
gen_data.py; passives against the union already used in the SHARKS table;
actives against RFD.ABILITIES keys). tierUnlockLevel (13 entries, index
1-12) was NOT extended — all new tiers are within the existing 1-12 range.

## Act representation findings (for the UI/render lanes)

Acts are NOT just bare ints consumed structurally — several files hardcode
the assumption there are exactly 3 acts:

- `meta.js:1016-1017` — `actName(act)` returns `'Real Sharks'|'Monsters'|
  'Legends'` for act 1/2/3 only; act 4/5 fall through to `undefined`
  (ternary has no else branch beyond 'Legends' for act===3, actually
  returns 'Legends' for anything >=3 -- re-check: `act === 1 ? 'Real
  Sharks' : act === 2 ? 'Monsters' : 'Legends'` -- so act 4 and act 5 BOTH
  silently render as "Legends"). Needs a real name map for Pantheon /
  Underworld.
- `ui3d.js:39` — `var ACT_NAMES = { 1: 'Real Sharks', 2: 'Monsters', 3:
  'Legends' };` used at ui3d.js:829 and ui3d.js:1112 for shop section
  headers and tier-act badges. Falls back to `'Act ' + act` string at
  ui3d.js:1112 only (`ACT_NAMES[act] || ('Act ' + act)`) but ui3d.js:829
  falls back to `''` (no fallback text) for the per-tier act badge. Needs
  entries for 4: 'Pantheon', 5: 'Underworld'.
- `sharkart.js:274` and `sharkart.js:754` — both do
  `clamp(finiteNumber(act, tier >= 5 ? 2 : 1), 1, 3)`, i.e. HARD-CLAMPS
  any act value to the range [1,3]. Every act-4/5 shark will render with
  its silhouette/eye act-tier visual logic treated as act 3. This affects
  eye iris glow-vs-blend selection (sharkart.js:757) and whatever else
  reads the clamped `act` inside sharkGeom. Needs the clamp widened to
  [1,5] (or reworked) by whichever lane owns sharkart.js.
- `shark3d.js:754` region equivalents: `shark3d.js:728`,
  `shark3d.js:1227`, `shark3d.js:1412` all do
  `finite(def.act, def.tier >= 5 ? 2 : 1)` for `bodyRampColors` — these do
  NOT clamp to [1,3], they pass the raw act through, so shark3d.js's ramp
  function should be checked for how it handles act values 4/5 (may Just
  Work if bodyRampColors treats act as an unbounded index, may not).
- `shark3d.js:2660` — `act: finite(def.act, 1)` stored on the built rig,
  unclamped, passed forward.
- `shark3d.js:2737` — DISTINCTNESS_TIER_RADIUS=1 gate compares
  `Math.abs(a.act - b.act) > DISTINCTNESS_TIER_RADIUS`; acts 4 and 5 are
  adjacent (diff=1) so act-4 vs act-5 sharks of similar tier ARE subject to
  the distinctness check against each other. Act 3 vs Act 4/5 are NOT
  (diff >= 1, boundary condition: diff===1 passes the `> 1` check as false,
  so act3-act4 pairs at abs diff 1 WOULD still be checked). Confirmed this
  is fine: new god/demon rows already use distinct heads/patterns from
  adjoining act-3 tier9-12 rows.

None of the above files are owned by this lane (data.js/gen_data.py/
SPEC.md/this NOTES file only) -- flagging for whichever lane owns meta.js,
ui3d.js, sharkart.js, shark3d.js to add act 4/5 names and widen the [1,3]
clamps.

## Selftest / roster-count assertion inventory (files NOT owned by this lane)

Ran: `python3 tools/gen_data.py > data.js` then
`node --import ./tools/reg.mjs tools/selftest.mjs meta ui world game`.

Result: `meta: pass=true ok=166 fail=0`, `ui: pass=true ok=234 fail=0`,
`world: pass=true ok=195 fail=0`, `game: pass=true ok=278 fail=0`. All four
selftest suites invoked by the standard command PASS with the 85-shark
roster -- tools/selftest.mjs itself has no hardcoded `61` (it derives
counts dynamically), so nothing in the file this lane's `selftest.mjs`
call chain is broken.

However, a SEPARATE hard-coded roster-count assertion exists outside that
chain, in a file I do not own:

- **`shark3d.js:3035`** —
  `if (!rows || rows.length !== 61) throw new Error('RF.Art3D expected 61
  sharks, received ' + (rows ? rows.length : 0));` inside `__selftest()`.
  This WILL throw once shark3d.js's own selftest runs against the
  regenerated 85-row data.js. This is Art3D/Lane D3/S1 territory per
  SPEC3D.md Rev 7 ownership comments -- the follow-up lane owning
  shark3d.js needs to bump this literal from `61` to `85` (or better,
  derive it from a constant) as part of picking up the new rows.

No other hardcoded `61` roster-count assertions were found via
`grep -rn "61\b"` across tools/*.mjs and the game.js/world.js/engine3d.js/
world3d.js/ui3d.js/sharkart.js sources -- the other `61` hits in those
files are either unrelated arithmetic (hashing constants like
`t | 61`, `Math.imul(...,61)`) or comments describing the (now stale)
"61-shark roster" iOS memory budget in ui3d.js:645,761,779-780 and
sharkart.js:1348,1380 (comments only, not assertions -- still worth the
follow-up lane's attention since the iOS canvas-memory budget math in
those comments may need re-checking against 85 shark bakes, but they do
not fail selftest and are not literal `!== 61` assertions).

## Other things NOT touched (out of lane scope, flagged only)

- `sharkart.js:1348-1380` iOS canvas-memory hotfix comments reference "61
  'menu' bakes" and "complete 61-shark roster below the iOS budget" -- the
  budget math should be re-verified by the owning lane against 85 bakes.
- ui3d.js:645 similarly references "a 61-shark roster" in a perf comment.

## Files touched by this lane

- `/Users/lucille/greenguard-usa-web/play/razorfin/tools/gen_data.py` — added 24 SHARKS rows (Act 4 Pantheon, Act 5 Underworld).
- `/Users/lucille/greenguard-usa-web/play/razorfin/data.js` — regenerated (85 SHARKS rows, acts 1-5).
- `/Users/lucille/greenguard-usa-web/play/razorfin/SPEC.md` — Rev 8 addendum note (roster 61->85, act count); Shop scene note updated to "5 act sections"; sharkart.js interface note mentions Act 4/5 glow/pattern convention.
- `/Users/lucille/greenguard-usa-web/play/razorfin/NOTES-pantheon-data.md` — this file.

No git commit made (per instructions).
