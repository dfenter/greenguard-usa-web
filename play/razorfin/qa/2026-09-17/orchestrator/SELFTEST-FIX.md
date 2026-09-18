# SELFTEST-FIX: fx3d ok=0 under-report (QA-REPORT.md finding 4)

## Root cause

`fx3d.js` `moduleSelftest` (around line 2732) returns a NESTED result shape:
`{ pass, fx, juice, sound, music }`, where each of `fx`/`juice`/`sound`/`music` is
itself its own `{pass, notes[]}` result. `tools/selftest.mjs` only knew how to read
`res.notes` directly or flatten `res.sections`, so a nested-sub-result module like
fx3d matched neither branch and fell through to an empty notes array, printing
`ok=0` even though the four sub-selftests together produce real checks. This is a
runner defect, not an fx3d defect.

## Fix

`tools/selftest.mjs` `collectNotes()` was generalized to recurse into any own
property whose value looks like a selftest result (`typeof v.pass === 'boolean'`,
not an array), in addition to the existing `notes` and `sections` handling. This
covers fx3d's shape without hardcoding the `fx`/`juice`/`sound`/`music` key names,
and both pre-existing shapes (`{pass, notes}` and `{pass, sections}`) still work
unchanged.

## abilities ok=0 (not a bug)

Checked `RF.Abilities.__selftest` (`abilities.js` line ~1087): its `notes` array is
assert-style, only pushed to on failure. On a clean pass it returns `notes: []` by
design/convention, so `ok=0 fail=0 pass=true` is correct and expected. Left
unchanged per the QA report's own framing.

## Before / after

Command (from `play/razorfin/`):
`node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities`

| module    | before ok | after ok | before fail | after fail |
|-----------|-----------|----------|--------------|------------|
| world     | 380       | 380      | 0            | 0          |
| game      | 394       | 394      | 0            | 0          |
| art3d     | 31        | 31       | 0            | 0          |
| fish      | 8         | 8        | 0            | 0          |
| fx        | 0         | 26       | 0            | 0          |
| ui        | 239       | 239      | 0            | 0          |
| meta      | 192       | 192      | 0            | 0          |
| abilities | 0         | 0        | 0            | 0          |

No module regressed: every module's `ok` count is >= baseline and `fail` is 0
everywhere, both before and after.
