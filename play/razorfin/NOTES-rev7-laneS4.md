# Rev 7 Lane S4 Notes (ui3d.js)

Scope: SPEC3D Rev 7 7.6 UI consumption (S4 column of the ownership map, 7.7)
plus the two known-bug fixes in the task brief. Owned file: `ui3d.js` only
(and this notes file). Did not touch game.js/world.js/juice.js (dead) or any
other lane's file.

Authored against SPEC3D.md 7.6/7.7 + the plan (D5) before
`NOTES-rev7-laneS3.md` existed, so the economy readers were first written
defensively against the SPEC's prose shape. S3's notes file appeared mid-task
(concurrent lane); its documented `endRun` payload and `profile` schema
matched what I had already reverse-engineered directly from the landed
`meta.js`/`data.js` sources, so no rework was needed beyond confirming the
match. Everything below reflects the REAL landed S3 shapes, not the earlier
guesses.

## What changed in ui3d.js

Since index.html is orchestrator-owned (not in S4's file list), every new
DOM element is built and inserted dynamically at runtime rather than assumed
to exist in markup, and all new CSS lives in a second injected `<style>` node
(`ensureRev7Styles()`, id `rfRev7Styles`) alongside the existing frenzy-cue
stylesheet pattern.

### 1. Menu: mission strip, gem balance, relic dots
- `#rfMissionStrip` — a new row inserted directly under `.rf-bar-top` inside
  `#rfMenu` (found via `menu.children[0]`), rendering up to 3
  `profile.missions.active` entries as `.rf-mission` cards (label + progress
  bar), with a `.rf-mission-done` class + "(done)" label for completed ones.
  Collapses to nothing (`#rfMissionStrip:empty{display:none}`) on a save
  with no active missions, so a pre-Rev7 profile shows zero extra chrome.
- `#rfMenuGemStat` (`.rf-stat.rf-gem`, child `<b id="rfMenuGems">`) —
  inserted as a sibling right after the existing coins `.rf-stat`, found by
  walking up from `#rfMenuCoins`'s `parentNode`. Mirrors the coins stat's
  existing look.
- Relic dots: `.rf-relic-dots` (3 `.rf-relic-dot` per zone, `.rf-relic-on`
  when collected) appended into each tier's `.rf-tier-head`. Tier -> zone
  mapping uses `RFD.ZONES[].intendedTier` (nearest-below the tier), since
  zones and shark tiers are not 1:1 in `data.js`. Silently renders nothing
  if `ZONES` is unavailable or the tier has no zone at/below it.
- Menu -> goals -> roster -> DIVE ordering (task 1's "logical game flow") is
  satisfied by insertion order: mission strip is the first thing under the
  top bar, above the roster scroll; the existing DIVE flow is untouched.

### 2. HUD: gem counter only
- `#rfHudGems` is the ONE new persistent in-run element (HUD only-law).
  Built once per `showHud()` call (idempotent — a direct `hudGemNode`
  module var tracks the live reference so repeated `showHud()` calls never
  duplicate it), inserted as `#rfHud`'s first child. Renders `♦<compact
  count>` when `profile.gems > 0`, or nothing at all at zero gems (no
  zero-state clutter on a fresh save).
- Note: the in-run HUD has NO coin counter today (removed by 6.11/code
  review MAJOR 5 — "name/coins are OUT of the in-run HUD"), so "beside the
  coin counter" is necessarily aspirational; the gem counter occupies the
  same top-left corner the retired coin stat used to.
- Mission ticks: `RF.UI.missionTick(text)` (new export target for the
  engine/kit-bus caller) routes through the existing single queued-toast
  slot (`queueToast`) with a new `rf-chip-mission` CSS variant on `#rfChip`,
  applied via `chip(text, cue, {missionTick:true})` and cleared by
  `clearTransients()`. No new persistent element — chip/toast channels only,
  per the task.

### 3. Results
- Gems earned row (`.rf-res-gems`), only rendered when `payload.gems > 0`.
- Mission results: `payload.missionResults` (`{id, name, gems}[]`, per
  meta.js `missionEvent` — this array is a completion LOG, every entry is
  already "done" by construction; there is no partial/in-progress entry
  shape here today). Rendered as `.rf-res-mission.rf-res-mission-done` rows
  with a DONE tag. Reads `m.progress`/`m.goal` defensively in case a future
  payload adds a partial-result shape, falling back to DONE either way.
- Relic finds: `payload.relicFinds` (`{relicId, zoneId}[]`, echoes
  `ctx.run.relics`). Resolved to a human name via
  `RFD.RELICS_BY_ZONE`/`RFD.RELICS`; falls back to the raw `relicId` if the
  table lookup misses.
- Unlock callouts: `payload.relicUnlocks` (`{type:'relicSet', zoneId}` /
  `{type:'sharkUnlock', sharkId, via}`, from meta.js `relicSetUnlocks`),
  rendered as `.rf-res-callout` blocks alongside the existing tier-unlock
  `.rf-unlock` rows.
- All four are fully optional/defensive: `showResults({})` renders cleanly
  with none of them present (asserted in selftest).

### 4. Shop: Collection section
- New `.rf-shop-act` section titled "Collection", appended after the
  existing Act 1/2/3 sections, built from `RFD.SKINS` + `RFD.SECRET_SHARKS`.
  Not appended at all if both tables are empty/absent.
- Skin cards (`.rf-collect-card`): swatch tinted from `skin.palette.base`,
  name, and either "OWNED" (disabled) or a gem cost button wired to
  `Meta.buySkin(kit, profile, id)`. A shark-locked skin (`skin.sharkId` set)
  shows "Own <Shark> first" and stays disabled until that shark is owned,
  matching `buySkin`'s `shark-not-owned` reason.
- Secret shark cards: silhouette (`???` name, dimmed swatch,
  `.rf-collect-silhouette`) with a data-driven hint — "Find N full relic
  sets (have/need)" computed from `SECRET_SHARKS[].relicSets` against the
  player's actual `relicProgress()` per zone. Once the threshold is met, the
  card switches to a live gem-cost buy button wired to
  `Meta.unlockSecretSharkWithGems(kit, profile, id)`; the relic-set path
  itself auto-grants ownership via `endRun` (meta.js), so this button is
  strictly the optional gems-skip path S3's notes describe.
- Gem stat mirrored in the Shop header (`#rfShopGemStat`/`#rfShopGems`),
  same pattern as the Menu.
- Both buy paths guard `typeof Meta.buySkin/unlockSecretSharkWithGems`
  before calling and fall back to a "Collection is not available yet" toast
  if `RF.Meta` or the method is missing, per task 4's "guard if API absent".

### 5. Thumbnail bake cache rev token
- `THUMB_CACHE_REV = 'rev7'`. All `S.thumbs` cache keys are now
  `THUMB_CACHE_REV + ':' + id` (via a `tk(id)` helper) instead of the bare
  shark id, in `setThumb`/`paintThumb`/`bakeThumb`/`queueBake`'s
  already-cached guard. The public surface (`RF.UI.setThumb(id, url)`
  arguments, the `data-shark` DOM attribute, `paintThumb`'s id parameter) is
  unchanged — only the internal storage key is rev-scoped, so this is a
  same-session invalidation lever for whenever L1's welded-rig rebuild (or a
  future persisted-thumb cache) needs old bakes to miss and re-render.
  Bumping `THUMB_CACHE_REV` on a future rebuild is the actual invalidation
  action, not just documentation.

### 6. Known bug fixes
- **DEV chip / SHOP button overlap**: `index.html` (not owned by S4) already
  has `#rfDevChip` and `#rfMenuShop` in separate bars (`.rf-bar-top` vs
  `.rf-bar-bottom`), so no literal overlap exists in the current markup, but
  the "known polish list" bug is guarded anyway since S4 cannot edit the
  orchestrator's CSS directly: the injected Rev 7 stylesheet adds
  `#rfDevChip{flex:0 0 auto;max-width:64px;z-index:5}`, which prevents the
  chip from ever being squeezed by flex-shrink into overlapping sibling
  buttons regardless of future markup changes to that bar.
- **Menu ON-badge stale after Shop select (desktop Enter path)**: `doSelect`
  (the Shop's SELECT button handler — a focused `<button>`'s native Enter
  keypress fires the same `click` handler, no separate keydown listener
  needed) now calls `resyncMenuSelectionBadges(id)` immediately after a
  successful `Meta.select`, which re-applies `rf-card-sel` and the
  Owned/Selected footer text on any already-rendered roster cards without
  waiting for a full `buildMenu()` rebuild. Also repaints
  `paintMenuSelection(id)` if `#rfMenu` exists. Ported from the equivalent
  fix in the pre-3D UI's `NOTES-laneA.md` ("Menu ON-badge resync"), adapted
  to this file's DOM-diff style instead of a scene wake/resume hook.

### 7. Selftest
Added a dedicated Rev 7 block (`rev7SelftestBlock`) plus a known-bugs block
(`knownBugsSelftestBlock`) inside `__selftest()`, covering: gems/mission/
relic readers against both a pre-Rev7 and a Rev7 profile shape,
`zoneIdForTier` mapping, mission strip rendering + progress text + done
state, menu/HUD/shop gem stats, the mission-tick chip variant, Results'
gems/mission-results/relic-finds/unlock-callout rendering (including the
all-absent defensive case), the Shop Collection section's skin/secret-shark
cards (owned, locked-with-hint, guarded-API-absent, and success/failure via
a fake `RF.Meta`), the DEV-chip CSS guard, and the ON-badge resync path. All
new checks use the existing `{pass, checks, fails, log[]}` result shape.

Extending this required strengthening the selftest's own minimal DOM stub
(previously missing `parentNode`/`nextSibling`/`insertBefore`/
`querySelector`/`querySelectorAll`, and — significant — a `textContent`
getter that only returned a node's own assigned text rather than
aggregating descendants like real DOM, and a `className` setter that never
synced `classList`). All four gaps were fixed in the stub itself (not
worked around in the new tests) so the tests exercise the same code paths a
real browser would.

## Verify
```
cd play/razorfin && node --import ./tools/reg.mjs tools/selftest.mjs ui
-> ui: pass=true ok=230 fail=0

node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
-> world: pass=false ok=188 fail=7   <- S2's world3d.js, NOT my file (7.2/instanced-bend work in flight)
-> game:  pass=true  ok=228 fail=0
-> art3d: pass=false ok=0   fail=0   <- L1's shark3d.js, NOT my file (welded-rig rebuild in flight)
-> fish:  pass=true  ok=7   fail=0
-> fx:    pass=true  ok=0   fail=0
-> ui:    pass=true  ok=230 fail=0
-> meta:  pass=true  ok=159 fail=0
-> abilities: pass=true ok=0 fail=0
```
world/art3d failures are pre-existing, in other lanes' files, and correspond
to Rev 7 work still in flight there (S2/world3d.js, L1/shark3d.js) — noted
per task instructions, not touched.

## Deviations from the task brief
- Task 2 says "gem counter beside coin counter" for the HUD; the in-run HUD
  has had no coin counter at all since 6.11 (code review MAJOR 5 removed
  name/coins to menu/results only). The gem counter was placed in the same
  top-left corner the coin stat used to occupy instead, since there is
  nothing literal to sit "beside."
- Task 5 says "find the thumbnail bake cache key and add a rev token" — the
  bake path had no shader/mesh cache key of its own (that lives in
  shark3d.js, L1's file); the only cache key in ui3d.js is the thumbnail
  dataURL cache (`S.thumbs`, keyed by shark id). Added the rev token there.
  Since thumbnails are not persisted anywhere (in-memory only, confirmed via
  grep for localStorage/sessionStorage/IndexedDB), the rev bump has no
  observable effect on THIS session's behavior today — it exists so a
  future rebuild-triggered bump (or a future persisted-thumb cache) actually
  invalidates by construction rather than needing a second coordinated fix.
- Task 6's DEV-chip-vs-SHOP overlap: since S4 cannot edit index.html, this
  is a defensive CSS guard against the class of bug (flex-shrink squeeze)
  rather than a fix to an overlap actually reproducible in the current
  markup (the two elements are already in separate bars there).
- `NOTES-rev7-laneS3.md` was absent when this lane started (per the task's
  explicit contingency) and appeared mid-task; its documented
  `endRun`/profile shapes were cross-checked against the landed
  `meta.js`/`data.js` and matched what this file already consumed, so no
  rework followed from reading it — only confirmation.

## Risks / worth a second look
- Secret-shark relic-set progress in the Shop Collection card
  (`buildSecretSharkCard`) recomputes `haveSets` by iterating all zones and
  calling `relicProgress()` per card render — cheap at 4 zones but redundant
  across multiple secret-shark cards; fine at today's scale (2 secret
  sharks), would be worth hoisting to a single pass if `SECRET_SHARKS`
  grows materially.
- `zoneIdForTier`'s "nearest zone at/below this tier" mapping is a
  reasonable heuristic given zones and tiers are not 1:1 in `data.js`, but
  it was not specified anywhere in SPEC3D/plan/S3's notes — worth a design
  sanity check against the actual roster ladder once L1's tier art is
  final, in case a different zone/tier grouping reads better visually.
- Mission strip and relic dots have not been visually verified in a live
  browser (no played-probe run as part of this lane) — the plan's own
  verification section calls for scripted puppeteer probes (menu ->
  mission complete -> results, relic find + gem award) as part of the
  orchestrator's overall Rev 7 verification pass, not per-lane.
