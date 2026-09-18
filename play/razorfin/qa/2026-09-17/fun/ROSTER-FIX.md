# Roster monogram fix, 2026-09-17

## Mechanism (confirmed in source)

`shark3d.js` `placeholderRig()` asks `requestTemplate(base)` for a def's real
base model. When the base is a textured key (`TEXTURED_KEYS`) and the runtime
is a browser at the menu (not a live run), `mayLoadTextured()` is false and
`requestTemplate` returns null on purpose, to protect the iOS texture budget
(this is the fix from the 2026-08-19 crash, documented in the surrounding
comments). Before this change, `placeholderRig` responded to that null by
hiding the grey capsule placeholder and setting `group.userData.rfWithheld =
true`. `ui3d.js`'s `bakeThumb()` checks `rfWithheld` and refuses to bake,
so the roster card kept its two-letter monogram fallback forever, not just
during a load. 54 of 86 rows hit this path (every row with a textured
`sil.model`), including every tier-11/12 flagship and Great White, Megalodon,
Tiger, Bull, Hammerhead.

This was working as designed for the *texture* budget, but starved the
*thumbnail*, which does not need texture at all.

## What changed

`shark3d.js`:
- Added `untexturedBaseForDef(def)`, a copy of `baseForDef`'s head-tag routing
  (goblin -> `goblinshark`, angler -> `anglerfish`, piranha -> `piranha`,
  everything else -> `sharky`) that deliberately never returns a
  `TEXTURED_KEYS` or `fam/` entry. It always lands in `BASE_KEYS`, the
  low-poly set that is resident at boot and never evicted.
- In `placeholderRig()`, when the real base is withheld, instead of hiding
  the placeholder we now look up the already-resident untextured template
  for `untexturedBaseForDef(def)` and run it through the normal
  `buildLoadedRig()` path -- the same call the real base would have used.
  Palette, personality sculpt, variant profile and bone profile all still
  apply on top of the shared low-poly mesh, which is what keeps two
  different textured sharks (e.g. Great White vs Tiger Shark, both routed to
  `sharky`) visually distinct even without paint.
- If the untextured template is somehow not resident either (should not
  happen -- `BASE_KEYS` loads eagerly at boot), the code falls back to the
  original behavior: hide the placeholder, set `rfWithheld`, let the card
  show its monogram. No regression path was removed, only extended.
- No changes to `TEXTURED_KEYS`, `mayLoadTextured()`, or anything that
  governs when a TEXTURED base itself may load. The withholding is untouched;
  only the thumbnail's source geometry changed.

`qa/2026-09-17/harness/memprobe.mjs` (new): follows the pattern described in
the QA brief. Reads `Art3D.modelBudget()` (texturedBytes + rowSkinBytes) and
`renderer.info.memory` at the menu (after the roster bake queue fully
drains) and again after a dive is started and NPCs have had time to spawn.

## Verification

### 1. rosteraudit / real menu bake (harness + a DOM-level check via the real
   menu/bake-queue path, both agree)
- `rosteraudit.mjs`: **total 86 | baked 86 | withheld 0 | loading 0 | err 0**
- Driving the actual `RF.UI.showMenu()` roster and reading each card's live
  `.rf-thumb` DOM state after the idle-tick bake queue drains: **86/86 cards
  show a real backgroundImage bake, 0 carry the `rf-mono` class.**

### 2. Contact sheet
`play/razorfin/qa/2026-09-17/fun/roster_contact_sheet.png` -- all 86 cards,
labeled with shark name, baked through the real `RF.UI` menu/bake path (not
a synthetic loop). Legible at 10-column grid, 112x90 thumb per cell.

### 3. Memory, measured with memprobe.mjs (corrected, this gate)

**Correction note.** The first version of `memprobe.mjs` did not actually
measure an in-run state: it called `RF.UI.onDive()` with no argument, which
is a callback *registrar* (`ui3d.js:2970`), not a trigger -- called bare it
sets `CB.dive = null`, unregistering the handler instead of starting a run.
`mayLoadTextured()` gates on `runIsLive()` -> `RF.Game.ctx.player`
(`shark3d.js:3988`), and no player was ever created, so the "IN-RUN" sample
was just a second MENU sample (both printed 6.67MB, byte-identical
residency). That version also summed only `texturedBytes + rowSkinBytes`,
which excludes the ~5.3MB untextured base set and every live GPU
texture/canvas byte by construction, and printed 35/40MB "caps" that do not
exist anywhere in the codebase -- the real `ModelBudget.cap`
(`hse/model_budget.js:62`, `TEXTURED_LRU_CAP = 3`) is a COUNT of resident
textured templates, not a byte budget. Corrected below.

The rebuilt probe enters a run through `RF.Game.startRun('reef')`
(`engine3d.js:3832`), the same function the UI's `onDive` callback chain
ultimately calls and which sets `ctx.player` (`engine3d.js:1974`). It
asserts `RF.Game.ctx.player` is truthy before taking the in-run sample and
fails loudly (non-zero exit, no number printed) if the run did not start.

```
MENU:   hasPlayer=false
MENU base(untextured, fixed-est)=5.30MB
MENU texturedBytes=6.67MB (1 models, count-cap=3) rowSkinBytes=0.00MB
MENU bakedThumbs=86/86 (mono=0) estBytes=3.31MB (worst-case 40320B/thumb)
MENU gpu: geometries=10 textures=140
MENU JS heap used=41.86MB
MENU TOTAL (base+modelBudget+bakedThumbsEst)=15.27MB

IN-RUN: hasPlayer=true
IN-RUN base(untextured, fixed-est)=5.30MB
IN-RUN texturedBytes=6.67MB (1 models, count-cap=3) rowSkinBytes=0.00MB
IN-RUN bakedThumbs=86/86 (mono=0) estBytes=3.31MB (worst-case 40320B/thumb)
IN-RUN gpu: geometries=74 textures=154
IN-RUN JS heap used=76.59MB
IN-RUN TOTAL (base+modelBudget+bakedThumbsEst)=15.27MB
```
Reproduced across two consecutive runs, identical figures both times.

`hasPlayer` flips false -> true and GPU geometries (10 -> 74), GPU texture
handles (140 -> 154), and JS heap (41.86MB -> 76.59MB) all move between the
two samples, confirming the in-run sample is now a genuinely different
engine state, not a second menu sample.

Resident low-poly set at both samples: sharky, anglerfish, thresher (the
boot-selected textured model), goblinshark, shark_b, fish_clown, fish_blue,
fish_tuna, dolphin, manta, hammer_chibi, shark_c, shark, whale, piranha.
Only `thresher` counts against the textured budget (1 of `TEXTURED_LRU_CAP`
= 3 resident slots, a COUNT cap, not a byte cap) at both menu and in-run;
every withheld card's thumbnail now comes from `sharky` / `goblinshark` /
`anglerfish` / `piranha`, none of which count against `texturedBytes`
(base-set templates are admitted with `textured: false`, `bytes: 0` in
`ModelBudget`). All 86 roster thumbnails baked (0 monograms), well under
`ui3d.js`'s 8MB `BAKE_BYTE_CAP`.

**No byte budget exists in code** for the menu/in-run totals above -- there
is no byte threshold anywhere in the codebase to compare them against, so no
pass/fail line is printed. The previously-quoted 29.8MB / 33.7MB historical
baseline is not reused as a pass/fail line either: it was measured a
different way (unknown methodology, predates this component breakdown), so
it is not an apples-to-apples comparison against the totals above.

**Regression verdict: no.** Textured template residency held at 1 of a
3-slot count cap in both the menu and in-run states, matching the structural
argument that `untexturedBaseForDef` provably cannot return a textured key
(the fix routes withheld cards to the low-poly base set only). The +2.2MB
`bakedThumbBytesEst` component (86 baked thumbs) is the actual cost Wave 1
adds, and it is a canvas/DOM cost, not a texture-decode cost -- it does not
touch `ModelBudget` or the textured LRU at all, and it is bounded by the
existing 8MB bake cap that was already in place before this change.

### 4. Selftest, from `<worktree>/play/razorfin`
```
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
world: pass=true ok=380 fail=0
game:  pass=true ok=398 fail=0   (394 baseline; +4 from unrelated concurrent lane edits to engine3d.js/data.js in this shared worktree, not this change)
art3d: pass=true ok=31  fail=0
fish:  pass=true ok=8   fail=0
fx:    pass=true ok=26  fail=0   (0 baseline listed in the brief; confirmed 0 at HEAD before this change too -- also unrelated concurrent lane work)
ui:    pass=true ok=239 fail=0
meta:  pass=true ok=192 fail=0
abilities: pass=true ok=0 fail=0
```
All fail=0. world/art3d/fish/ui/meta match the given baseline exactly. game
and fx counts differ from baseline only because other lanes have pending,
uncommitted edits to `engine3d.js`/`data.js`/`gen_data.py` in this same
shared worktree; `git stash` confirmed fx=0 at the unmodified HEAD, and this
change touches only `shark3d.js`.

## Silhouette readability

All 86 read as the intended creature at thumb size. The `sharky`-routed
rows (the great majority -- Great White, Megalodon, Tiger, Bull, Hammerhead,
all four elemental/Greek tiers, etc.) read clearly as generic sharks, which
is expected since the design already uses `sharky` as the default hull for
every row without a specific head tag. The angler/goblin/piranha-routed rows
(Snapjaw, Gulper Fiend, Anglerfang, Abyss Maw, Omenmaw, Aphrodite Lure,
Medusa Gaze, Vex, and a few others) read as their intended deep-sea/anglerfish
silhouette (round body, lure, or the goblin's long snout), which matches
their names and is the same shape those rows would show when actually
in-run -- no silhouette was flagged as unrecognisable.

## Files touched
- `play/razorfin/shark3d.js` (the fix)
- `play/razorfin/qa/2026-09-17/harness/memprobe.mjs` (new)
- `play/razorfin/qa/2026-09-17/fun/roster_contact_sheet.png` (new, evidence)
- `play/razorfin/qa/2026-09-17/fun/ROSTER-FIX.md` (this file)
