# Glow clamp (QA-REPORT finding 3, fix-round 4)

Fixed in `tools/gen_data.py` (palette pass, `clamp_glow_luminance` +
`GLOW_CLAMP_SHARK_IDS`), regenerated `data.js` via
`python3 tools/gen_data.py > data.js`. Never hand-edited data.js.

Method: HLS lightness binary search per shark, hue and saturation held
fixed, target rendered luminance 0.45 (mid-band of 0.35-0.55). Pure white
(mirrorscale) has no hue to preserve and lands as neutral grey by design.

| shark | before hex | after hex | before luminance | after luminance |
|---|---|---|---|---|
| mirrorscale | 0xffffff | 0xb3b3b3 | 1.000 | 0.451 |
| teslafang | 0xe8f4ff | 0x6cb9ff | 0.891 | 0.451 |
| voltaicrex | 0xf0f8ff | 0x69b9ff | 0.929 | 0.449 |
| absolutezero | 0xe0f8ff | 0x00c1f9 | 0.902 | 0.450 |
| banshee | 0xd4f0ff | 0x43bdff | 0.835 | 0.448 |
| cyclopseye | 0xd9c8ff | 0xc0a4ff | 0.633 | 0.450 |
| glacier | 0xc4ecff | 0x36beff | 0.789 | 0.448 |
| bonecrown | 0xfff0c4 | 0xe3aa00 | 0.876 | 0.451 |
| hermesdart | 0xfff6c4 | 0xd1b100 | 0.912 | 0.450 |
| aphroditelure | 0xffc4e8 | 0xff8dd3 | 0.666 | 0.450 |
| artemisstrike | 0xc0f0ff | 0x00c1fd | 0.807 | 0.452 |

All 11 now sit at ~0.45 rendered luminance, mid-band of 0.35-0.55. Hue held
fixed per shark (frost sharks stay cyan/blue-frosty, volt sharks stay
electric blue, aphroditelure stays pink, bonecrown/hermesdart stay
warm/gold), so identity is preserved, not flattened to one color.

Scope: the clamp is gated on `GLOW_CLAMP_SHARK_IDS`, the exact 11 ids named
in QA-REPORT finding 3. 13 other roster sharks (anglerfang, venomspine,
aurora, chronos, solaris, leviathan_rex, zeusfin, apollodon, athenajaw,
heracrown, hydrafang, medusagaze, lamiacoil) also sit above 0.75 luminance
but are NOT part of this finding's named list and were left untouched, per
"do not retune anything other than these glow values."

## data.js diff stat

```
play/razorfin/data.js | 24 ++++++++++++------------
 1 file changed, 12 insertions(+), 12 deletions(-)
```

12 changed lines = the 11 target sharks' rows (one line each, diffed as
remove+add by git since each row is a single JSON line). Verified
programmatically that only the `glow` field changed in each of the 11 rows
(name, stats, passives, sil geometry, pattern, fx, model, family, blurb all
byte-identical before/after).

## Selftest verification

`node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities`

world 380/380, game 398/398, fish 8/8, ui 239/239, meta 192/192,
abilities 0/0, all fail=0, no regressions vs baseline (world 380, game 394,
fish 8, ui 239, meta 192, abilities 0). game's ok count rose from 394 to 398
and fx now reports 26/26 (baseline noted fx ok=0 as a known runner bug being
fixed by another lane) -- both from unrelated concurrent work in
engine3d.js/shark3d.js, not this fix.

art3d: ok=31, fail=1 (FAM_FILES gate, "expected empty, got 5"). Confirmed
pre-existing and unrelated to this fix: `tools/gen_data.py` and `data.js`
are untouched by that failure (it comes from 5 .glb files already on disk
under the forbidden `assets/models/fam/**` path, owned by another lane).
Verified via `git stash`/`pop` that gen_data.py/data.js content is identical
before and after, and that engine3d.js/shark3d.js already carried unstaged
changes from the other lane before this fix started.
