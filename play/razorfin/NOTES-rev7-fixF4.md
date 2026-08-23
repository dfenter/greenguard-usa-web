# Rev 7 fix lane F4 — fx3d.js allocation-free eat path

Scope: `play/razorfin/fx3d.js` only, per REVIEW-REV7.md blocker 7 (fx part).

## What blocker 7 said

`eatShockwave` (fx3d.js ~1106-1121 in the reviewed revision) allocated four
fresh option object literals per call — one for the white core ring, one for
the prey-tinted shell, one for the wide lag shell, and one for the gib burst.
The engine-side caller (`engine3d.js:1988-1998`) was already fixed in a
different lane; this lane only owns the fx3d.js half.

## Fix

Hoisted the four option records to module-level scratch objects, declared
right above `eatShockwave`:

- `EAT_CORE_RING_OPTS`
- `EAT_SHELL1_RING_OPTS`
- `EAT_SHELL2_RING_OPTS`
- `EAT_GIB_OPTS`

Each call now overwrites the relevant scalar fields (`tint`, `scale`, `life`,
`count`, `tint2`) on the existing object instead of building a new literal,
then passes the same object into `emit(...)`. This matches the pattern
already used elsewhere in the file for pool items (acquire/activate over a
persistent slot rather than `new`/literal per emit) and for the existing
frozen constant option objects (`FRENZY_EDGE_OPTS`, `SCHOOL_RING_OPTS`, etc.)
— the only difference is these four vary per call so they're mutable scratch,
not `Object.freeze`d constants.

Verified `activate()` / `activateRelicRing()` / the ring and gib pool item
setup only read scalar fields synchronously off `opts` during the call and
copy them onto the pooled item — none of them retain a reference to the
`opts` object itself, so reusing/overwriting the scratch objects across calls
is safe.

## Sweep of other hot emit helpers (gemPickup, relicFound)

Checked `emitGemPickup` and `emitRelicFound` (fx3d.js ~687-711) and their
dispatch in `emit()` (~830-839). Both consume the caller-supplied `opts`
object directly — they don't build any option literals internally. The only
inline object literals calling `emit('gemPickup', ...)` / `emit('relicFound',
...)` inside fx3d.js are in the selftest harness (~1848, ~1859), which is not
a hot path. No further hoisting was needed in fx3d.js for these two; if a hot
per-call literal exists for gem/relic pickup it would be at the engine3d.js
call site, which is out of this lane's ownership.

## Selftest

Added an identity + scalar-overwrite assertion to the existing "art CRITICAL
4/5" block in `fx3d.js`'s `selftest()`:

- Captures the four scratch object references before a 40-call loop of
  `eatShockwave` with varying tint/tier per call.
- Asserts identity is unchanged after the loop (proves no new object is
  allocated per call).
- Asserts the last call's scalar writes actually landed (proves the scratch
  objects are live and not stale/frozen — i.e. not just skipping work).

## Verification

```
cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs fx
# fx: pass=true ok=0 fail=0   (ok/fail counters are unused by this module;
# unchanged from pre-fix baseline — confirmed via git stash)

node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
# world: pass=true ok=195 fail=0
# game:  pass=true ok=228 fail=0   (pre-existing caught lane errors from
#        Art3D.animate/buildShark, UI.hudState, World.teardown, Fx.teardown
#        still print — same as REVIEW-REV7.md's baseline command output;
#        none of these are in fx3d.js and are out of this lane's scope)
# art3d: pass=true ok=4 fail=0
# fish:  pass=true ok=7 fail=0
# fx:    pass=true ok=0 fail=0
# ui:    pass=false ok=233 fail=1  (blocker 3, gem-unlock button — separate
#        lane, not fx3d.js, untouched here)
# meta:  pass=true ok=166 fail=0
# abilities: pass=true ok=0 fail=0
```

No regressions introduced by this change. The `ui` failure is the
pre-existing blocker 3 (secret-shark gem-unlock button), owned by a
different fix lane, not touched by this change.

No git commit made per instructions.
