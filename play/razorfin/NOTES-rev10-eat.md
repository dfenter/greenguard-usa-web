# Rev 10: one-bite swallow (Hungry Shark rule)

## Owner report (real iPhone, twice)

"Fish don't disappear when eaten." Confirmed via headless probes that
`World.kill` removes an entity the same frame it fires - so eaten fish were
NOT sticking around as zombies. The actual bug: `stepEat` only granted an
INSTANT swallow when `tier <= p.tier - 1 + instantBonus`; anything from
`p.tier - 1` up to the full `eatEligible` ceiling (`p.tier + BITE_UP_BASE +
biteUp`) went through `multiBite()` instead - per-target hp, 0.15s chew
cooldown, several bites to actually die. A tier-1 reef shark biting a
same-tier reeffish/mackerel hit exactly that path: the fish flinched,
survived the first touch, and visibly "stayed" for a beat. That flinch-and-
linger is what read as "doesn't disappear."

Hungry Shark rule, as specified: anything the shark is ALLOWED to eat
(`eatEligible()` true) is eaten in ONE bite - it vanishes into the mouth on
first contact. Only an over-tier "TOO BIG" target resists, and that gate was
already correct (unchanged).

## Change (engine3d.js)

`stepEat`'s per-entity loop (~engine3d.js:2045-2131): removed the
instant-vs-chew tier split entirely. Every entity that passes `eatEligible()`
(and isn't a hazard, isn't a pickup/relic/buffpickup) now calls `swallow(e)`
directly - no `tier <= p.tier - 1 + instantBonus` branch, no `multiBite(e)`
call from this path. `eatEligible()` itself is unchanged: it is already the
single "can this shark eat this" gate (shared with `preyNear`/`lunge`), so it
remains the only tier check. The dead `instantBonus`/`megajawInstantBonus()`
read in this loop was removed along with its stale comment block;
`megajawInstantBonus()` itself is untouched and still used by one selftest
fixture that exercises megajaw's widened gate math directly.

`multiBite()` and `decayTargetBiteCooldowns()` are left in place (not
deleted) - grepped `data.js` and the whole engine for a `chewy` flag on any
creature/boss def and found none, so per the task there is no armored/boss
class left that still needs a chew phase for PLAYER-eaten prey. Hazard
handling (`isHazard` -> `junkEater`-only) is a separate branch above the
swallow call and was not touched. `multiBite` is kept as dead-but-harmless
code (still directly unit-tested) rather than deleted, since ripping out
plumbing (`_biteCd`, the decay ownership handshake) wasn't asked for and
touching it risks lanes elsewhere in the file that still read `_biteCd`.

`swallow()` itself (FX/score/combo/coins/mission events/hitStop/suction) was
not touched - it already was, and remains, the single completion point for
every kill, called exactly once per swallow.

## Selftest changes (engine3d.js `__selftest`)

Replaced the "three-fish school" `multiBite()` chew-window fixture
(`chewy`/`chewy2`/`chewy3`, asserting per-target hp chip damage and a shared
150ms chew cooldown) with a one-bite fixture: three same-tier prey entities
fed through `stepEat()` directly, asserting `RF.World.kill` fires for all
three on the FIRST call (`killedSchool.length === 3`, all three `.active ===
false`) and `hp === 0` on every one (swallow's zero-out, so the frenzy hook's
`hp <= 0` gate still sees a real kill same as before). The `_biteCd`
decay-ownership-handshake sub-test (which only existed to probe
`multiBite`'s cooldown field) was removed with it - that mechanism is no
longer reachable from the production eat path being tested here.

The existing TOO BIG cue test, wideBite cone-regression test, and the
megajaw instant-tier-widening test were left as-is: all three already assert
via `stepEat()` + `World.kill`/`hp` outcomes that hold true whether the
underlying path is instant-swallow or chew, so they needed no changes and
still pass.

`node --import ./tools/reg.mjs tools/selftest.mjs game world`:

```
game: pass=true ok=278 fail=0
world: pass=true ok=206 fail=0
```

(The "Art3D.animate threw", "World.teardown threw" etc. console lines in that
run are deliberate injected-error fixtures elsewhere in the selftest suite,
unrelated to this change.)

## Real-input probe

`scratchpad/razorfin/onebite_probe.js`: launches the actual page in headless
Chrome via puppeteer, starts a real run on the reef shark (tier 1), spawns a
dense reeffish+mackerel wall directly in the swim lane, then drives the shark
with REAL DOM touch events (`Input.dispatchTouchEvent` touchStart/touchMove
at canvas coordinates, going through ggkit's real `onDown`/`onMove` ->
`plantStick`/`dragStick` -> `ctl.px/py` pipeline - the same code path a real
iPhone touch takes, not a backdoor velocity/position write) for ~4.5s of held
forward drag.

Ground truth is read off the engine's own eat pipeline rather than guessed
via proximity sampling (rAF-based mouth-radius sampling proved racy against
the fixed-STEP tick that actually runs `stepEat` and produced false
negatives on the very frame the real kill happened): every tagged prey
entity is watched every animation frame for `0 < hp < full` while still
`active` - since `swallow()` hard-zeroes `hp` at kill and `multiBite()` is no
longer reachable from the production path, this window should never be
observed. `RF.World.kill` is hooked to log every tagged-entity kill's cause
and `hp` at the moment of death.

Three runs (fresh spawn each time, real touch drag each time):

| run | playerKills (eaten) | chipDamagedCount | hpAtKill for every 'eaten' kill | scoreDelta |
|---|---|---|---|---|
| 1 | 2  | 0 | all 0 | +22  |
| 2 | 10 | 0 | all 0 | (not captured, see run 3) |
| 3 | 6  | 0 | all 0 | +128 |

`chipDamagedCount === 0` in every run: no tagged prey was ever caught with
partial hp while still active - the exact signature of the reported bug
(a same-tier fish flinching and lingering) never occurs. Every `'eaten'` kill
in `killLog` has `hpAtKill: 0`, confirming the swallow path (not multiBite)
handled all of them. Score rose on every run in proportion to kills. Player
position moved substantially each run (e.g. run 3: x 2000 -> 3634 over the
touch-drag window), confirming the touch input was actually driving real
physics, not a stalled/no-op run.

Command: `node onebite_probe.js` from `scratchpad/razorfin/` (needs
`puppeteer-core` + local Chrome, same setup `eatprobe.js` uses).
