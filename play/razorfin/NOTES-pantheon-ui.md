# NOTES — Pantheon UI lane (2026-08-23)

Owner: UI lane (ui3d.js, meta.js, sharkart.js, this file). Nothing else
touched. Read NOTES-pantheon-data.md first; this file picks up exactly the
four findings it flagged for the UI/render lanes.

## Task

Data lane added Act 4 "Pantheon" (12 gods) and Act 5 "Underworld" (12
demons/monsters) to the roster (61 -> 85 sharks, acts now 1-5). Four things
in this lane's files assumed exactly 3 acts / a 61-shark roster. Fixed all
four.

## Changes

### 1. `ui3d.js:39` — `ACT_NAMES`
Added `4: 'Pantheon'`, `5: 'Underworld'`. Used at:
- `ui3d.js:829` (menu roster tier-head act badge) — no code change needed,
  already reads `ACT_NAMES[...]`, now resolves for acts 4/5 instead of
  falling back to `''`.
- `ui3d.js:~1112` (shop section header) — same, now resolves instead of
  falling back to `'Act ' + act`.

### 2. `ui3d.js` shop act sections — dynamic act iteration
`buildShop()` had `var acts = [1, 2, 3]` hardcoded. Replaced with a scan of
`allSharks()` that collects distinct `act` values present in the roster and
sorts them ascending, so shop sections render for every act in the data
(now 5) without further hardcoding if a 6th act ever lands. The menu roster
ladder (`buildMenu()`, ~line 807) needed **no change** — it was already
grouping by `tier` off the live roster and deriving each tier's act name
via `ACT_NAMES[byTier[tier][0].act]`, with no act-count assumption baked
in.

### 3. `meta.js:1016-1017` — `actName()`
This is dead code (Phaser scene, not the active 3D UI path — engine3d/
ui3d.js is what's live), but fixed anyway for consistency per instructions.
Extended the ternary chain to cover act 4 ('Pantheon') and act 5
('Underworld'), with a generic `'Act ' + act` fallback beyond that instead
of every act >= 3 silently reading as 'Legends'.

Also fixed the sibling `buildList()` in the same dead Phaser shop scene
(`meta.js` ~line 1273), which had the identical `var acts = [1, 2, 3]`
hardcode — replaced with the same dynamic-scan-and-sort pattern used in
ui3d.js's `buildShop()`, so both shop implementations now agree.

### 4. `sharkart.js:274` and `sharkart.js:754` — act clamp widened [1,3] -> [1,5]
Both were `clamp(finiteNumber(act, ...), 1, 3)`, hard-clamping any act-4/5
shark down to act 3 for rendering purposes. Widened both clamps to `1, 5`.

Checked every downstream consumer of the clamped act value before doing
this, to confirm widening (not remapping) was the right, minimal fix:

- `sharkart.js:274` (`sharkGeom`) — `sharkAct` feeds only `mouthGape:
  0.17 + tier*0.024 + (act-1)*0.045`, itself clamped to `[0.18, 0.52]`.
  At tier 12 / act 5 this computes to 0.638, clamped down to the existing
  0.52 ceiling — i.e. gods/demons at the top tier just hit the same gape
  cap Legends already hits, no new headroom needed, no clamp-ceiling bug.
- `sharkart.js:754` (`drawEye`) — act only gates `iris = act >= 2 ? glow :
  blend(...)`. This is a two-way branch (act 2+ glows, act 1 doesn't), not
  a three-way per-act style table, so widening to 5 automatically buckets
  both new acts into the existing "glow" branch alongside acts 2-3 —
  matching the instruction's "gods lean act-3 styling ... demons lean
  act-2/3 monster styling" without adding new branches. `r` (eye radius)
  scales off `tier` only, so god/demon top-tier eyes read slightly larger
  than lower tiers automatically, independent of the act change.

No other `.act` consumers exist in sharkart.js (confirmed via grep) — the
two clamp sites were the complete list.

## Selftests

- `ui3d.js` `__selftest()`: added checks that `ACT_NAMES` has all 5
  entries (Pantheon/Underworld named), that `allSharks().length === 85`,
  and that `buildShop()` renders exactly 5 per-act sections (excluding the
  trailing Collection section, which reuses the `.rf-shop-act` class) with
  headers including both 'Pantheon' and 'Underworld'.
- `meta.js` `__selftest()`: added checks that `actName(1..3)` is unchanged,
  `actName(4) === 'Pantheon'`, `actName(5) === 'Underworld'`, and
  `allSharks().length === 85`.
- Grepped both files (and sharkart.js) for other hardcoded `3`/`61`
  act-count or roster-count assumptions per the task instruction; found
  none beyond the four already listed in NOTES-pantheon-data.md's
  inventory. The `61`-roster comments at `ui3d.js:645,761,779-780` (iOS
  canvas-memory budget estimates) and `sharkart.js:1348,1380` are prose
  only, not assertions — left as-is (not selftest-breaking, and
  re-verifying the iOS budget math against 85 bakes is a perf-lane concern
  outside this pass, consistent with the data lane's own note on this).

## Verification

```
cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs ui meta
  ui: pass=true ok=238 fail=0
  meta: pass=true ok=170 fail=0

node --import ./tools/reg.mjs tools/selftest.mjs ui meta art3d world game
  ui: pass=true ok=238 fail=0
  meta: pass=true ok=170 fail=0
  art3d EXCEPTION Error: RF.Art3D expected 61 sharks, received 85
    at shark3d.js:3035
  world: pass=true ok=206 fail=0
  game: pass=true ok=278 fail=0
```

`art3d` fails exactly as flagged in NOTES-pantheon-data.md — the hardcoded
`rows.length !== 61` assertion at `shark3d.js:3035` is owned by the
parallel Luna lane (shark3d.js), not this one. Not touched, per scope.
Everything else in the full suite (world, game, ui, meta) passes clean
against the 85-shark roster.

## Files touched by this lane

- `/Users/lucille/greenguard-usa-web/play/razorfin/ui3d.js` — ACT_NAMES +
  dynamic shop act-section iteration + selftest coverage.
- `/Users/lucille/greenguard-usa-web/play/razorfin/meta.js` — actName() +
  dynamic Phaser-shop act iteration (dead code, fixed for consistency) +
  selftest coverage.
- `/Users/lucille/greenguard-usa-web/play/razorfin/sharkart.js` — act clamp
  widened [1,3] -> [1,5] at both call sites (sharkGeom, drawEye).
- `/Users/lucille/greenguard-usa-web/play/razorfin/NOTES-pantheon-ui.md` —
  this file.

Not touched: `shark3d.js` (Luna lane), `gen_data.py`/`data.js` (data lane,
already landed), or anything else.

No git commit made (per instructions).
