# HANDOFF-M5: Ships, tiers and customization

Milestone M5 plus the integration of gated M4.
**Gate verdict RELEASE at round 1 of cap 3. Gated hash `c20a07be`.**
Branch `hm2-m5`, pushed. NOT merged to main, NOT deployed, no hub card.

## What M5 delivers

- 3 ship classes (warden, recon, vector) x 3 tiers (Mk I-III), warden default.
- `PROFILE_VERSION` 4 with a real v2 -> v3 -> v4 migration cascade.
- Customization: 8 paints, 6 trims, 4 trails, 4 shot colours, 5 decals.
- 9 new hull frames in the atlas, plus a generator that extends it.
- HM1 profile import (`hm1ImportDone`), SHIPS tab, live hangar preview.

## Integration of M4

Merge `7ed7d20a` has both parents: `1c66fa66` (M5) and `65a1a791` (gated M4).
Only `hm2_campaign_probe.mjs` conflicted. `game.js` and `hm_data.js` auto-merged
with both sides intact: M4's `currentRowPool` row gate, burrower
`hotStartExclude` and separated events RNG, alongside M5's `SHIP_CLASSES`,
`PROFILE_VERSION` and tier stats.

M4's campaign probe was taken wholesale because it carries the deterministic
seeded metric. Its intro-cutscene skip survives via the real
`input.emit('pointerdown')` path, not by forcing `scene.state`.

### damageTaken: one writer

M4's probe used to wrap `hurt()`, diff POST-shield hp, and assign the result
onto `s.p.damageTaken` under a comment claiming game.js had no such field. That
comment was false on the merged tree, where game.js increments `p.damageTaken`
itself before the shield absorbs. Resolution: **game.js is the sole writer**
(all damage routes through `hurt()`; the co-op override site is unreachable in
probes) and **the probe only reads**. The old wrapper was removed.

## Recaptured metric literals, and why

The deterministic seeded metric pins `performance.now()` and `Math.random()`
over the first 60 sim-seconds for missions 1/5/10/15 and asserts spawn
composition and damage at `COUNT_TOL = 0`. Literals moved at `c20a07be` for two
distinct, documented causes:

- **Composition**, all four missions: M4's row gate now rejects out-of-row
  substitutions and falls back to the row family. Verified causally, not
  vacuously: L1's grave-egg / derelict-guard-hulk / wall-warden trace to the
  deliberately ungated `hotStartPools` path (all aurelion-graveyard variants,
  `hotStartExclude` false, and L1 is that region); L10's lone drifter traces to
  `pickRegionEnemy`'s fallback.
- **Damage**: the Warden default hp/shield plus counting damage
  pre-absorption rather than sampling post-shield hp.

**L10 is burrower-free in every run.** That absence is the M4 row-gate fix's
direct signature. L10 at 54s is the bot SURVIVING, a win, not a death.

## Evidence at `c20a07be`

All measured on an IDLE host, one browser probe at a time (see residual 1).

| Probe | Result |
|---|---|
| `hm2_world.test.mjs` | 24/24 |
| `hm2_m4_probe.mjs` | 74/74 |
| `hm2_m5_migration_probe.mjs` | 19/19 |
| `hm2_world_probe.mjs` | PASS |
| `hm2_bestiary_probe.mjs` seed 42 | 50/50 |
| `hm2_boss_probe.mjs` seed 999 | 54/54 |
| `hm2_campaign_probe.mjs` | **64/64 exit 0**, L15 byte-identical (74/93/36/36/45) |
| `hm2_m5_probe.mjs` | 48-49/50, see residual 2 |

The campaign **64/64 is the first independent confirmation of the metric figure
recorded in HANDOFF-M4.md**, which was never independently confirmed at the time.

Gate also verified, against both parents: merge correctness PASS; no vacuity
holes (9 tier frames all exist in the atlas and reach the sprite via
`safeFrameName` at game.js:3508; every tier stat is consumed at game.js:3366-3371;
`renderPreview` reads the live `profile.hangar`; the migration is a real
v2-v3-v4 cascade); counts exact at 8/6/4/4/5, 3 classes x 3 tiers,
`PROFILE_VERSION` 4.

## Residuals and follow-ups

1. **Campaign probe is host-load sensitive** through an unknown mechanism,
   likely cross-phase contamination from phases 1-3 sharing one browser. A
   loaded host produced 62/64 with an L15 composition drift of 283 vs 284
   spawns; the same tree on an idle host gives 64/64 byte-identical.
   **Capture and gating therefore REQUIRE an idle host and one browser probe at
   a time.** This is a correctness requirement, not a speed tip. Root cause is a
   follow-up, not a blocker.

2. **`hm2_m5_probe.mjs` took-damage / shield-dip assertions are PRE-EXISTING
   flaky, and worse than previously recorded.** Measured at the parent
   `1c66fa66`: 50/50 then 48/50. Measured on the merged tree: 0 of 4 runs clean
   (48, 49, 48, 48 of 50), including a verifiably uncontaminated run. The merge
   did NOT introduce it. Two corrections to the earlier record: it is **not
   "vector, 2 of 3"** but **any class** (warden 3, recon 2, vector 1 across six
   runs), and on this hardware it **fails far more often than it passes**. The
   50/50 figure is therefore unreliable and must not be quoted as clean.
   Per the standing rule the fix is **the bot, never weakening the assertion**.

3. **META was not structurally merged into HANGAR_TRACKS.** Kept as two parallel
   lists to preserve saved progression. Documented follow-up per Dan, not a
   blocker for publishing.

4. `88e8bded` carries a single `Co-Authored-By` trailer and is already on
   `origin/hm2-m4`. Accepted residual per Dan. **Do not rewrite pushed shared
   history for one trailer.**

5. A plausible causal story can be wrong: the probe's nested double
   `requestAnimationFrame` before the synthetic clock pin looked like textbook
   nondeterminism, but mutation testing showed that prefix IS deterministic
   (12/12 bit-exact, and re-introducing wall-clock frames still passed). The
   proposed clock-pin fix moved every literal and made things worse, so it was
   abandoned and nothing was committed. Determinism must pass BEFORE any literal
   is recaptured.

6. The atlas has no generator for its original 65 frames (`build_atlas.py` named
   in `meta.app` is absent), so `tools/build_hulls.py` can only extend, never
   rebuild.

7. Recon hull pixel counts (458/469/534) are far below warden's
   (1588/1642/1754). Confirm the recon silhouette reads at 64px once tinted.

8. The Warden shield voids hp-delta assertions. Any future probe measuring
   player damage must use the `p.damageTaken` accumulator or sample hp + shield.

## Next

M6 integration: merge gated `hm2-m5` into `hm2-m6` (gated `a87cfb9f`). Expect
conflicts in game.js render/VFX/text regions. Then main, deploy, hub card.
