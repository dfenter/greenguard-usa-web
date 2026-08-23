# Razorfin Rev 7 adversarial review

Verdict: **REWORK**

The requested selftest command exits green, but it is not an integration gate. The
run printed caught lane errors (including `Art3D.animate`, `Art3D.buildShark`,
`UI.hudState`, `World.teardown`, and `Fx.teardown`) while still reporting
`pass=true`. More importantly, the live game path has several Rev 7 producers
missing even though the isolated consumers pass their module tests.

Command run:

```text
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
```

## Blockers

1. **Rev 7 missions are never connected to a run.** `meta.js:615-633` defines
   `rollMissions`, and `meta.js:650-690` defines the four event types and their
   gem/result side effects. However, `engine3d.js:2792-2851` starts a run without
   calling `RF.Meta.rollMissions`, while `engine3d.js:1343-1380` has no mission
   calls in the fixed-step loop. The eat score is applied at
   `engine3d.js:1972-1975`, relics are collected at `engine3d.js:2067-2085`,
   and neither path calls `missionEvent`; there is also no score or zone-time
   producer. Consequently the live profile starts with no active goals, all
   four mission types remain at zero, and `missionResults`/mission gems stay
   empty. Wire mission selection at run start, then send `eat`, `relic`,
   `score`, and cumulative `zoneTime` events from the authoritative engine
   paths. Forward completed IDs to the existing UI mission-tick channel.

2. **Frenzy gems have a consumer but no producer.** `meta.js:811-828` only
   credits `run.frenzyCompletions.{goldrush,blood,school}`. The run bag created
   at `engine3d.js:1207-1218` has no `frenzyCompletions` field, and the actual
   completion edges at `engine3d.js:2482-2537` (Blood/School) and
   `engine3d.js:2618-2628` (Gold Rush) never increment one. Every frenzy gem
   award is therefore silently lost while the isolated meta test passes when
   handed a synthetic field. Initialize the counters and increment exactly
   once beside each existing guarded announcement edge; include the counts in
   the end-run payload breakdown.

3. **The gems-only secret-shark path is unreachable from the live UI.** The
   specification says either relic sets or gems unlock a secret shark
   (`SPEC.md:179-183`). Meta implements the purchase at `meta.js:568-580`, but
   `ui3d.js:1246-1263` only creates the purchase button when
   `haveSets >= sets`; with fewer relic sets the card is disabled regardless of
   the player's gem balance. This makes a documented 20/30-gem unlock
   impossible unless the player already has the relic threshold, at which point
   the relic path should already grant ownership. Make the gem purchase action
   available independently of the relic-progress hint (Meta remains the final
   affordability/idempotency check).

4. **`Meta.endRun` is a re-entrant payout primitive and duplicates gems.**
   `meta.js:738-828` applies coins, XP, runs, daily state, `run.gems`, and
   frenzy counts every time it is called; there is no settled marker or cached
   result. A direct probe calling it twice on the same context produced
   `first gems=6`, `second gems=4`, and profile `gems=10`, `runs=2` from one
   run bag. The engine's `finishRun` guard reduces the normal path risk, but
   `RF.Meta.endRun` is public and any retry, restore, or future UI path can
   duplicate payout. Add a per-run settlement token/guard and return the cached
   result on re-entry; do not rely on the engine's separate `running` flag.

5. **Keyboard steering and the dead zone use stale camera geometry during
   pulses/zoom.** Pointer input correctly uses the live camera in
   `engine3d.js:1071-1085`, but keyboard target distance, head radius, and
   world-to-CSS conversion use boot/run constants `CAM_Z` and `CAM_FOV` at
   `engine3d.js:1435-1464`. The render camera changes live FOV and dolly at
   `engine3d.js:3082-3112`; pulses additionally change the effective z in
   `engine3d.js:250-264`. During an eat/death/blood pulse, the same 220 CSS-px
   keyboard target and the same finger distance therefore produce the wrong
   world target and wrong speed/dead-zone magnitude. Derive the keyboard target,
   `headRcss`, and `distCss` from the live camera (or use the same preallocated
   project/unproject path for both controls), while retaining the allocation-free
   scratch objects and release glide.

6. **The popup atlas still performs a per-eat GPU attribute upload and a lazy
   allocation.** `engine3d.js:956-967` clones a sprite geometry on first use and
   sets `uv.needsUpdate = true` every time `paintGlyph` runs. That is a buffer
   upload for every displayed glyph after initialization, contrary to the
   requested zero-upload eat path. The selftest at `engine3d.js:4326-4354`
   instruments only `texture.needsUpdate`, so it cannot see these UV uploads.
   Prebuild the UV geometry variants for every glyph/weight during atlas/pool
   initialization and make `scorePopup` only swap pooled objects/visibility;
   no per-popup geometry clone or `needsUpdate` write should remain.

7. **The staged eat effect allocates option objects on every bite.**
   `engine3d.js:1988-1998` creates fresh option objects for the death burst,
   motes, gib burst, and `eatShockwave` call. `fx3d.js:1106-1121` creates four
   more option objects inside `eatShockwave` for rings/gibs. `pulseChroma`
   itself is correctly uniform-only, but the complete eat path is not
   allocation-free. Move these fixed-shape option records to module-level
   scratch objects and overwrite scalar fields before synchronous pool emits;
   keep tint and tier numeric so no per-eat arrays/closures are introduced.

8. **Bought skins cannot be selected or rendered.** Meta exposes selection at
   `meta.js:540-544`, but the live collection card marks an owned skin disabled
   at `ui3d.js:1195-1198` and has no select action. The render path builds from
   the shark definition's authored palette (`shark3d.js:1562-1586` and
   `shark3d.js:1674-1708`); there is no consumer of
   `profile.skins.selectedSkin` in `engine3d.js` or `shark3d.js`. A successful
   gem purchase is therefore a dead-end cosmetic record. Make owned cards
   selectable and pass the selected skin palette into the shark build/material
   path, or remove the purchase/selection claim from the live UI.

## Minors / release-gate gaps

- The architecture header still says 7200x3600 and the old base-z contract at
  `SPEC3D.md:22-27`; `engine3d.js:171-173` repeats that stale comment, while the
  landed world is 14400x4800 (`world3d.js:227-228`, `SPEC3D.md:759-760`).
  `SPEC.md:110` also still says `SAVE_VERSION=1` even though Rev 7 is version 2.
  Update the superseded documentation so future lanes do not implement the
  wrong world/camera contract.
- `world3d.js:411-415` still documents that no kit bus exists, although
  `engine3d.js:1184-1197` now creates the `emit/on` bus before `World.init`; the
  current `rf-sting` path is wired correctly, but the comments and handoff note
  are misleading.
- The generated-data audit is clean: `python3 tools/gen_data.py` matches the
  landed `data.js`; zone `intendedTier` bounds and the 3-per-zone
  `RELICS_BY_ZONE` shape are consistent. Save probes also confirmed v1->v2
  preserves coins/xp/runs and that null/partial invalid records fall back to a
  default profile without throwing. These are not blockers.
- Manual shader-source review found the expected declarations: shark's seven
  bend uniforms are injected at `shark3d.js:330-349`, and the instanced fish
  shader declares `uBendK/uBendSpan` plus `aBendPhase/aBendAmp` at
  `world3d.js:1072-1105`; instanced updates mark the batch dirty at
  `world3d.js:6157-6190`. The remaining verification gap is a real browser GL
  compile and a played control/economy probe, not a confirmed shader defect.

Selftests should be extended with one integrated run fixture that rolls missions,
eats/collects/advances time, completes frenzy edges, settles once, and verifies
the exact results/profile delta. Until that exists and the blockers above are
fixed, this revision is not shippable.
