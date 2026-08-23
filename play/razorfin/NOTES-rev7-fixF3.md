# Rev 7 fix-lane F3 -- ui3d.js

Scope: `play/razorfin/ui3d.js` only, per REVIEW-REV7.md blockers 3 and 8
(UI half) plus ui3d minors. No other files touched, no git commit made.

## B3 -- gems-only secret-shark unlock unreachable from live UI (fixed)

`buildSecretSharkCard` in `ui3d.js` previously gated the gem-purchase button
on `haveSets >= sets` (full relic-set progress), making the documented
20/30-gem gems-only unlock path (`SPEC.md:179-183`, `meta.js:568-580`
`unlockSecretSharkWithGems`) impossible to reach unless the player already
had the relic threshold -- at which point the relic-set auto-grant
(`meta.js relicSetUnlocks`) would already have owned the shark.

Fix: the gem purchase button/cost row is now shown whenever
`Meta().unlockSecretSharkWithGems` exists as a function AND the shark is not
yet owned -- independent of `haveSets`. The relic-set hint text
(`Find N full relic set(s) (have/need)`) is kept unconditionally above the
button, per the task instruction. `Meta` (via `meta.js unlockSecretSharkWithGems`
-> `spendGems`) remains the sole affordability/idempotency authority; this
lane only decides whether to render the button, never spends gems or grants
ownership directly.

## B8 (UI half) -- owned skins cannot be selected (fixed)

`buildSkinCard` previously marked every owned skin card `disabled = true`
with only an "OWNED" label -- no way to act on it. `meta.js` already exposed
`selectSkin(kit, profile, skinId)` (`meta.js:540-544`), writing
`profile.skins.selectedSkin`, but nothing in `ui3d.js` called it.

Fix:
- Owned skin cards are no longer `disabled`. They render an "OWNED" label
  plus a `.rf-collect-select` toggle span reading `Select` (unselected) or
  `Selected` (when `profile.skins.selectedSkin === skin.id`).
- A new `doSelectSkin(id)` calls `Meta().selectSkin(kit, profile, id)` (mirrors
  the existing `doBuySkin`/`doUnlockSecretShark` guard-if-absent and
  try/catch pattern), and on success calls `buildShop()` to fully rebuild the
  shop DOM so every card's Select/Selected state (the newly-selected one and
  any previously-selected one) is refreshed from the mutated profile.
- Cards for the currently-selected skin get an `rf-collect-selected-card`
  class (for stylesheet hooking) and skip the click listener, since
  re-selecting the same skin is a no-op; unselected owned cards' whole card
  click (not just the toggle span) fires `doSelectSkin` for a larger hit
  target, consistent with the existing `buildSkinCard`/`buildSecretSharkCard`
  whole-card-click pattern.

Note: this lane only renders the selection UI and calls `Meta.selectSkin`.
Consuming `profile.skins.selectedSkin` to actually palette the rendered
shark (`shark3d.js`/`engine3d.js` build path, the other half of blocker 8)
is fix-lane F1's responsibility, wired in parallel.

## Minors

No ui3d.js-specific minors were called out in the review's Minors section
(the three items there are all in `world3d.js`/`engine3d.js`/`SPEC.md`
comments, out of this lane's file scope).

## Selftest coverage added (`ui3d.js` `__selftest`, `rev7SelftestBlock`)

- Replaced the stale "owned skin card is disabled" assertion (contradicted
  the B8 fix) with an "owned skin card is flagged rf-collect-owned"
  assertion, plus a new assertion that owned cards are NOT disabled and
  render a `.rf-collect-select` node.
- Added: "a locked secret shark with 0 relic sets still shows the
  gem-unlock button" -- built against `profRev7` (no zone has all 3 relics,
  so `haveSets === 0` for both `SECRET_SHARKS` rows), asserts the `(0/N)`
  hint renders, a `.rf-collect-cost` gem-cost node exists, and the card is
  not disabled. A minimal fake `RF.Meta` (`unlockSecretSharkWithGems`,
  `selectSkin`) is installed before `showShop()` since the real `meta.js`
  is not loaded in the `ui`-only selftest run.
- Added: `doSelectSkin('skin_neon_riptide')` against a fake `RF.Meta.selectSkin`
  that records the call and mutates the passed profile's
  `skins.selectedSkin`; asserts the call happened and that after the
  post-action `buildShop()` refresh, the Neon Riptide card shows a
  `Selected` toggle.

## Verification

```
cd play/razorfin
node --import ./tools/reg.mjs tools/selftest.mjs ui
# ui: pass=true ok=234 fail=0

node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
# world: pass=true ok=195 fail=0
# game: pass=true ok=228 fail=0
# art3d: pass=false ok=0 fail=0   <- pre-existing, unrelated to this lane
#   (engine3d.js synthetic lane-fault throws noted in REVIEW-REV7.md's own
#   "Command run" preamble: Art3D.buildShark/animate, UI.hudState,
#   World.teardown, Fx.teardown "blew up" errors are caught-and-logged
#   synthetic faults baked into engine3d.js's own selftest fixture, not
#   caused by any change in this lane; ui3d.js is untouched by them)
# fish: pass=true ok=7 fail=0
# fx: pass=true ok=0 fail=0
# ui: pass=true ok=234 fail=0
# meta: pass=true ok=166 fail=0
# abilities: pass=true ok=0 fail=0
```

No files outside `ui3d.js` and this notes file were modified. No git commit
made (per instructions).
