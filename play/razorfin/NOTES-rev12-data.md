# Rev 12 data lane (gen_data.py / data.js / SPEC.md) — pass 1

Owner: data lane only (12.6). Files touched: `tools/gen_data.py`, `data.js`
(regenerated, never hand-edited), `SPEC.md`. No other files touched, no
commit made.

## What changed

### 12.1 LEVELS (12 rows)
New `LEVELS` table + `LEVEL_BY_ID` derived index in gen_data.py/data.js, in
SPEC3D order: hawaii, mexico, belize, maldives, newzealand, alaska, tahiti,
azores, bali, aruba, jamaica, california. Each row: `id, name, unlock
{type:coins|score, n, levelId?}, sky{top,horizon,horizonTheme}, water
{surface,bands[4],haze}, seabed (sand|reef|rock|ice|kelp|volcanic),
preyWeights {defId:weight} (overlay onto the level's zone spawn table),
special [creatureId,...] (signature spawns), hazards [hazardId,...]`.
`california` is unlock-gated on `jamaica` score (progression gate,
`{"type":"score","levelId":"jamaica","n":8000}`); all others are flat coin
thresholds ramping 0 -> 170000. Special creatures per SPEC3D 12.1: alaska
gets seal+orca (orca is the predator-class NPC), california gets sealion,
belize/maldives/tahiti/bali/jamaica get ray as their signature "big fish"
(manta/whale-calf already existed in CREATURES pre-Rev12 and were left as
general roster entries, not tied to a specific level, since SPEC3D 12.1 only
names them as existing specials, not level-exclusive).

New CREATURES rows added for the level specials that didn't exist yet:
`seal` (Harbor Seal, tier3), `sealion` (Sea Lion, tier4), `orca` (Orca,
tier8, predator-class narrative flavor — see note below). `manta` and whale
calf (`leviathanprey`, the existing "Deep Leviathan Calf" row) already
existed and were left untouched.

**Design note on `orca` "predator-class NPC":** CREATURES has no `npc`
column (that's a SHARKS-only field per SPEC.md's existing schema — `npc:
{weight, zones}` lives on shark rows, used for roster-driven predator AI per
world.js's "Predator AI" contract). Rather than invent a new column
mid-table, `orca` is authored as a high-value/high-hp prey-table row (score
220, hp 20, coins 32) so it reads as a dangerous, notable catch; actually
making it chase/threaten the player as a true predator is an AI behavior
call that belongs to world3d (out of this lane's ownership). Flagged for the
world3d follow-up lane rather than silently deciding it in data.

### 12.2 Shark classes
Added `cls` field to every SHARKS row via a `shark_cls(tier, act)` rule
function (not a hand-typed column, to guarantee consistency): common = act1
tiers1-4 (11 sharks), rare = act1 tiers5-6 or act2 tier7 (15), epic = act2
tier8 or act3 tiers9-10 (30), legendary = act3 tiers11-12 (5), god = act4
(12), demon = act5 (12). Totals sum to 85, matching the existing roster-size
gate other lanes assert on. The function raises (regen fails loudly) if any
row falls outside the rule — verified clean on all 85 rows.

### 12.3 Sharkjira
`leviathanrex` row renamed `"Sharkjira"` (id unchanged, per spec). Blurb
rewritten with the kaiju-shark framing. Palette updated to the specified
charcoal scheme: base `0x1b1f22`, belly kept at `0xb8cdc4` (unspecified by
spec, left as-is), accent `0x2a3138`, glow (spec calls it "accent/glow"
0x3fd6ff, applied to the `glow` slot which is what drives the emissive/spine
effect per shark3d.js's existing atomic-blue treatment). `sil.len` raised
9.09% -> **2.4** exactly per spec (kaiju cap for Sharkjira specifically,
distinct from the general 2.6 cap in 12.5).

### 12.4 MODES
New `MODES` table: `goldRush` (dur 8s, coinMult 2, speedMult 1.4,
invulnerable, banner "GOLD RUSH!") reusing the existing FRENZY meter numbers
(unchanged) but now named/surfaced as a mode object for engine3d/ui3d to
consume directly. `megaGoldRush` (dur 10s, coinMult 3, speedMult 1.5,
invulnerable, `allEdible: true`, banner "MEGA GOLD RUSH!") is new — reached
by chaining a second full meter during Gold Rush per spec; the *chaining
trigger logic* itself is engine3d's (out of data ownership), this table only
supplies the mode's numbers. `MODES.buffs` holds supersize/shield/speed
effect sizes (supersize: 1.5x size + 2 tier bonus / 10s; shield: 3 hits /
12s; speed: 1.5x speed / 9s).

New PICKUPS rows for the buff trio: `buff_supersize`, `buff_shield`,
`buff_speed` (distinct ids from the pre-existing Rev 6.7 `shield`/`magnet`
rows, which were left untouched since they're a different mechanic/pool).
All three use `tint` + a new `icon` field (glyph key) per spec's "gem-mesh
look with per-type color + icon glyph" — `icon` is a new PICKUPS field,
additive, does not break existing rows (they simply have no `icon`).

### 12.5 Zoom + bigger sharks
No gen_data.py change required — CAM_Z_LEN_MULT/clamps/framing gate are
engine3d.js-owned constants and that lane has already landed 2.2/250..600
(confirmed by reading the file, see Consumer failures below). The only data
lane deliverable here was Sharkjira's `sil.len: 2.4` (done under 12.3 above)
and confirming no SHARKS row exceeds the general 2.6 cap (max non-Sharkjira
len in the roster is 2.22, kaiju-head rows `heracrown`/`typhonmaw`; headroom
intact).

### SAVE_VERSION 2 -> 3
`data.js`'s `RFD.SAVE_VERSION` bumped to 3. Per 12.1 "levels save shape",
the new save-shape field this implies is `profile.levels: {id:{best,
unlocked}}` (SPEC.md schema section updated accordingly) — meta.js owns the
actual defaultProfile/validateSave/normalize/migrate wiring for that field
and the v2->v3 migration chain step; not touched here.

## SPEC.md updated
Added a `## Rev 12 addendum` section documenting the `LEVELS`, `MODES`,
`cls` field on SHARKS, the `icon` field on PICKUPS, and the SAVE_VERSION 3
`profile.levels` shape, mirroring the existing Rev 7 addendum style (schema
block + a short migration-contract note) so downstream lanes have a written
contract to implement against without re-deriving it from SPEC3D.

## Validation

`python3 tools/gen_data.py > data.js` regenerated clean (no exceptions from
`shark_cls`, all 85 rows classified).

`node --import ./tools/reg.mjs tools/selftest.mjs meta ui world game`:

```
meta: pass=true ok=192 fail=0
ui:   pass=false ok=237 fail=1
world: pass=false ok=209 fail=1
game:  pass=false ok=277 fail=1
```

(First run of this suite, before ui3d.js's own concurrent Rev 12 edits landed
mid-session, showed `ui: pass=true ok=238 fail=0`; a second run after a
regen picked up ui3d.js's in-flight `BUFF_ICON` table and now shows the
failure below — confirmed unrelated to data.js, see #4.)

### Consumer failure inventory (NOT fixed here — out of data-lane ownership, for the follow-up lanes)

1. **`meta.js:920`** (also same pattern at `meta.js:710` and `meta.js:750`) —
   `RF.Meta.endRun` throws `TypeError: Cannot read properties of undefined
   (reading '1')` on `profile.relics[zids[i]]`. Root cause: the selftest's
   `ctx.save` fixture does not go through `RF.Meta.load()`'s
   normalize/backfill path (meta.js:307-312, which guarantees
   `profile.relics[zoneId]` is always a 3-length bool array), so
   `profile.relics[zids[i]]` is `undefined` for a save object built by hand.
   Pre-existing bug, NOT caused by the SAVE_VERSION 2->3 bump or by the new
   LEVELS table — meta.js already independently hardcodes `var SAVE_VERSION
   = 3` (meta.js:26), i.e. a meta.js lane had already started Rev 12 work
   expecting this bump before this pass landed. Owner: meta.js lane (12.6:
   "UI: ui3d.js + meta.js ... save schema v3 with migration").

2. **`world3d.js:9129`** — `ATMO-01: hemisphere sky tracks the zone TINT,
   not the fog gray` selftest assertion fails (`shallowHemiCol !==
   hexNum(Zs[0].tint)`). This is a world3d-internal atmosphere-lighting
   contract (SPEC3D "ATMO-01: THIS MODULE IS THE SOLE ATMOSPHERE OWNER",
   world3d.js:1902) unrelated to LEVELS/ZONES data shape — ZONES rows are
   unchanged by this pass (LEVELS is new/additive). Likely stale from
   in-flight world3d Rev-11/Rev-12 env-lane work landing concurrently.
   Owner: world3d.js lane (12.6: "World: world3d.js ... AFTER the Rev 11 env
   lane lands").

3. **`engine3d.js:3726`** — `check(Math.abs(camZForLen(150) - 262.5) <
   1e-9, 'camZForLen scales 1.75x inside the clamp band (150px -> 262.5)')`
   fails. Root cause: this assertion still hardcodes the OLD `1.75x`
   multiplier/expected value, but `engine3d.js`'s own `CAM_Z_LEN_MULT` has
   already been changed to `2.2` (engine3d.js:207, with a comment citing
   "Rev 12 / 12.5: dolly out ~25%") — i.e. engine3d has already landed the
   12.5 zoom change but its selftest wasn't updated to match (150 * 2.2 =
   330, not 262.5). Not a data-lane issue; SHARKS/data has no camera
   constants. Owner: engine3d.js lane (12.6: "Engine: engine3d.js (camera,
   modes, level ctx, super size)").

4. **`ui3d.js:2937`** — `ok('buff pickup toast uses the known label',
   N('rfChip').textContent === 'OVERDRIVE')` fails (actual text is
   `'⚡ OVERDRIVE'`). Root cause: ui3d.js's own concurrently-landed Rev 12
   `BUFF_ICON` table (ui3d.js:59-63, comment "Rev 12 (12.4): pickup icon
   glyphs shown on the buff tick chips") now maps `overdrive -> '⚡'`, and
   `frenzyCue()`'s `queueToast(icon ? (icon + ' ' + label) : label, ...)`
   (ui3d.js:2157) prepends that glyph to the chip text — but the test at
   ui3d.js:2937 (dated to an earlier "fix-round 3" pass, before BUFF_ICON
   existed) still asserts the bare label with no icon prefix. `overdrive`'s
   PICKUPS row in data.js has no `icon` field (confirmed) — ui3d.js's
   `BUFF_ICON` map supplies the glyph independently of data.js's `icon`
   field added on the three new buff_* rows this pass. Self-inflicted
   ui3d.js test/implementation mismatch, unrelated to any data.js content;
   present even on an unmodified data.js. Owner: ui3d.js lane (12.6: "UI:
   ui3d.js + meta.js ... level select, classes, save schema v3").

   **Separately (id-contract gap, flag only, not a test failure today):**
   ui3d.js's own in-flight `BUFF_LABEL`/`BUFF_ICON` tables key off short ids
   `supersize`/`speed` (plus a redundant `superSize` camelCase alias), but
   this pass's new PICKUPS rows use the ids `buff_supersize`, `buff_shield`,
   `buff_speed` (namespaced to avoid colliding with the pre-existing Rev 6.7
   `shield`/`magnet` PICKUPS rows, since `shield` was already taken). Once
   world3d actually starts publishing `buff:buff_supersize` etc. via
   `frenzyCue`, `BUFF_LABEL[buffId]` will miss and fall back to the generic
   'BUFF ACTIVE' label. Whichever lane wires the pickup-to-cue plumbing
   needs to either add the `buff_*` keys to ui3d.js's tables or strip the
   `buff_` prefix before the lookup -- flagging here since it crosses the
   data/ui id boundary but isn't a currently-failing assertion.

None of the four failures are in files this lane owns or touched
(gen_data.py/data.js/SPEC.md); all four are pre-existing/in-flight issues
in concurrently-edited consumer files (meta.js, world3d.js, engine3d.js,
ui3d.js), each already showing independent Rev 12 work landing ahead of/
alongside this pass (meta.js's own `SAVE_VERSION = 3`, engine3d.js's own
`CAM_Z_LEN_MULT = 2.2`, ui3d.js's own `BUFF_LABEL`/`BUFF_ICON` entries for
supersize/speed).

## Tables summary

- `LEVELS`: 12 rows (new), `LEVEL_BY_ID` derived index (new).
- `SHARKS`: 85 rows, unchanged count; each gained `cls`; `leviathanrex`
  renamed to Sharkjira with updated blurb/palette/len.
- `CREATURES`: 16 -> 19 rows (+seal, +sealion, +orca).
- `MODES`: new table (`goldRush`, `megaGoldRush`, `buffs.{supersize,shield,speed}`).
- `PICKUPS`: 6 -> 9 rows (+buff_supersize, +buff_shield, +buff_speed), all
  rows now optionally carry `icon`.
- `SAVE_VERSION`: 2 -> 3.
- `ZONES`, `HAZARDS`, `RELICS`, `MISSIONS`, `GEMS`, `SKINS`, `SECRET_SHARKS`,
  `ABILITIES`, `ECONOMY`, `FRENZY`, `BAL`, `FRENZY2`, `FX`, `SFX`, `MUSIC`:
  unchanged.
