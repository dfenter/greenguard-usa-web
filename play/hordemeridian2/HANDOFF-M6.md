# HANDOFF-M6: chase cam (FPV), VFX pass, in-run text budget

Milestone M6 of Horde Meridian 2. Branch `hm2-m6`, base `1c66fa66` (head of hm2-m5).

**GATED HASH: `a87cfb9f62c6078b2a6453dce1b939ff80ed46d1`**
**GATE VERDICT: PASS at round 1 of cap 3** (separate Opus LOW adversarial gate agent).

NOT merged, NOT deployed. No hub card, no Fable final read. Those are the router's, after M4 and M5
gate and merge into this branch.

## Commits

| hash | what |
|---|---|
| `a907c990` | chase cam toggle, HUD stays screen-locked via uiCam |
| `8982177c` | VFX pass: shockwave/streak/burst events, per-archetype muzzle/impact, boss phase slow-mo |
| `8445107b` | text budget: 3-word mid-run banners, no sub-1.0 text scale |
| `a87cfb9f` | `hm2_m6_probe.mjs` + `hm2_m6_probe_mutate.sh` |

Diff versus base: `game.js` plus the two new probe files only. 624 insertions, 22 deletions.
Hygiene verified: zero Co-Authored-By trailers, zero em dashes, no new binary assets.

## Done, against Dan's acceptance checklist

- **Chase cam (FPV toggle).** Camera rotates with ship heading in the 2D sim (`readChaseCamPref()`
  game.js:708, `scene.chaseCam` :2167, settings row :860, rotation applied :10133). Radar and HUD stay
  screen-locked on the separate `uiCam`. Co-op guest is render-only. Storage key `hm2_chasecam`.
  **Classic camera remains the default** when the key is absent.
- **VFX pass.** Purge = shockwave ring, gem pickup = streak, level-up = burst, replacing floaters.
  Per-archetype muzzle and impact particles via `ARCHETYPE_FX` (:77) / `ARCHETYPE_FX_DEFAULT` (:91),
  consumed at :7205 and :8012. Boss phase change = screen flash plus 0.3s slow-mo through the existing
  dt gate (:3925), reusing the existing spectacle system. Existing atlas frames reused only.
- **Text budget.** In-run text limited to run clock, level, and banners of 3 words or fewer. No
  `setScale` below 1.0 on text. One tagline per screen.
- **New `hm2_m6_probe.mjs`,** 21 assertions: chase-cam rotation read from the REAL
  `scene.cameras.main.rotation` and `scene.chaseCam` at 390x844 (classic vs chase screenshot pair,
  heading fixed) against the spec literal `-(heading + PI/2)`; HUD screen-lock; in-run text census over
  a 30s run; VFX objects spawning on all four events. Mutation-tested by `hm2_m6_probe_mutate.sh`:
  **9 mutations against M6's own functions, all 9 caught** (probe exit non-zero on every one).

## Evidence at `a87cfb9f`

Run by the orchestrator and independently re-run by the gate agent, both with the serving port's cwd
confirmed via `lsof` and a 200 on `hm2_enemies.js` before any browser probe.

| probe | result |
|---|---|
| `hm2_world.test.mjs` | 24/24 |
| `hm2_m4_probe.mjs` | 50/50 |
| `hm2_m5_migration_probe.mjs` | 19/19 |
| `hm2_m6_probe.mjs` | 21/21, exit 0 |
| `hm2_m6_probe_mutate.sh` | 9/9 mutations caught, exit 0 |
| `hm2_bestiary_probe.mjs 8820 42` | 50/50 |
| `hm2_boss_probe.mjs <url> 999` | 54/54 |
| `hm2_campaign_probe.mjs <url>` | 55/55, medians L1=150 L5=167 L10=54 L15=120 (INFORMATIONAL ONLY) |
| `hm2_world_probe.mjs` | flaky on both trees, see residual 1 |
| `hm2_m5_probe.mjs` | intermittent, see residual 2 |

Gate's vacuity hunt found nothing invalidating: chase cam reads the live camera transform rather than a
mirror; the text census is genuinely populated (an independent display-list walk found 47-49 visible
text objects per sample, and every threshold violation was covered by a declared exemption, with zero
reaching the counted set, so it is not over-excluded); VFX assertions hit real pooled objects with rings
force-killed before each event so fresh acquisition is provable, which defeats the masked-pool pattern
that burned M2 and M3. No probe was weakened and no survival assertions were added or restored.

## Residuals and follow-ups for Dan

1. **`hm2_world_probe` crystal-shoals luminance is FLAKY ON BOTH TREES, straddling the 0.18 gate.**
   Measured this turn: M6 tree 3 PASS / 1 FAIL (failing delta 0.1733, passing delta 0.2246); base tree
   `1c66fa66` 2 PASS / 1 FAIL (failing delta 0.1732). Not an M6 regression. Two earlier readings were
   both wrong and are corrected here: the orchestrator's evidence table said "PASS" off a single run,
   and the gate reported it as a hard FAIL on M6 with base "failing worse at 0.1238", which does not
   reproduce. The real behaviour is a marginal region palette sitting right on the threshold. FIX
   SUGGESTION: widen the crystal-shoals palette separation, or raise the sample count, rather than
   lowering the gate.
2. **`hm2_m5_probe` `class <X>: took damage (damageTaken > 0)` flakes on both trees**, failing with
   `damageTaken=0` when the bot happens to fly a whole window untouched. Failing class varies
   (recon, vector, warden). Orchestrator observed 2/3 on M6 and 2/6 on base; the gate observed 1/3 on
   M6 and 0/3 on base. Rates differ by sample but it is present on base, so NOT an M6 regression.
   **Do not let any lane weaken or delete this assertion:** it reads the `p.damageTaken` accumulator
   Dan mandated after Warden shield regen voided three hp assertions. Fix the BOT so it reliably takes
   contact, or lengthen the sample.
3. **`hm2_boss_probe` throws in `browser.close()` teardown** after printing 54/54. Reproduces
   identically at base `1c66fa66`. Pre-existing, cosmetic, worth a cleanup.
4. **Mutation-harness lanes must get their own worktree.** During M6 a harness run baked
   `if (false) dt *= 0.3;` and a removed gem-trail call into commit `8982177c` because two lanes shared
   one worktree while game.js was patched on disk. The probe lane caught and repaired it in `a87cfb9f`;
   both the orchestrator and the gate verified no mutation markers survive at HEAD (slow-mo gate live at
   :3925, gem trail live at :9089, zero `if (false)` residue). Process fix, not a code defect.
5. **A reported L14 to L15 "detached Frame" crash does NOT reproduce.** An isolated L13-L14-L15 repro
   passes in both camera modes, and campaign is 55/55 with all three L15 assertions green. The single
   `FRAMEDETACHED` line is benign `browser.close()` teardown noise. Closed, no fix needed.
6. `setScale(1/DPR)` in `8445107b` looks sub-1.0 but measures 1.0 at live DPR=1 with uiCam zoom=1. The
   only 0.9-scaled text is `nb.dist`, byte-identical at base. Pre-existing, not an M6 violation.
7. Campaign survival medians remain noise-dominated and are informational only, per Dan's ruling.

---

## FINAL INTEGRATION (M4 + M5 + M6) - RELEASE 2026-09-19

**Gated hash: `a3d9cadd`** (branch `hm2-mutfix`, fast-forwarded onto `hm2-m6`).
Lineage: `a87cfb9f` gated M6 -> `c7da28e1` merge of gated M5 `c20a07be` ->
`36882899` boss slow-mo presentation-only fix -> `27c3041e` probe instrument ->
`af56551e` probe carriers + majority gate + recaptured literals + won capture ->
`a3d9cadd` m6 mutation harness re-anchor.

### Gate verdict: RELEASE

Independent adversarial Opus gate, cap 2 rounds, own worktree and port.

Probe set at `a3d9cadd`, one browser probe at a time, machine-wide:

| probe | result |
|---|---|
| `hm2_world.test.mjs` (node) | 24/24 |
| `hm2_m4_probe.mjs` | 74/74 |
| `hm2_m5_migration_probe.mjs` | 19/19 |
| `hm2_m6_probe.mjs` | 21/21 |
| `hm2_m6_probe_mutate.sh` | 9/9 applied, 0 ANCHOR-FAIL, 9/9 caught |
| `hm2_m5_probe.mjs` | 50/50 |
| `hm2_world_probe.mjs` | PASS, exit 0 |
| `hm2_bestiary_probe.mjs` | 50/50 |
| `hm2_boss_probe.mjs` | 54/54 |
| `hm2_campaign_probe.mjs` | 72/72, 0 FAIL, 1 WARN, exit 0 |

The single WARN is the known ~1-in-48 probe-side carrier; the 2-of-3 majority
held and the literal was asserted against the majority.

**Majority-gate soundness proven by two real game-code mutations**, each of which
drove the campaign probe to exit 1 with hard FAILs (not merely a WARN):
1. mine-bomber `REGION_ENEMIES` weight 0.15 -> 0.85
2. burrower `hotStartExclude` removed plus `rampAt` 0

Every recaptured literal traces to a source cause. `af56551e` and `a3d9cadd`
touch probe files only; game code is untouched by both. No new commit trailers.
HM1 (`play/hordemeridian/`) untouched throughout.

### Residuals (all carried, none a release blocker)

1. **m5 took-damage assertion flaky.** Flakes for any ship class and fails more
   often than it passes on some trees. Pre-existing at the parent. Fix the BOT,
   never weaken the assertion.
2. **crystal-shoals luminance flaky near the 0.18 gate.** Straddles the floor on
   both trees. Widen the region palette; do not lower the gate.
3. **Boss probe teardown throw.** Pre-existing, after all assertions report.
4. **Campaign probe teardown lacks try/catch.** Can surface a wrapper exit 1
   while the log reads 72/72. Wrap the teardown.
5. **~1-in-48 probe carrier under the majority gate.** Mitigated, not cured. The
   real fix is a sim/fx RNG split in `game.js`: the probe overrides GLOBAL
   `Math.random`, so presentation draws share the sim stream. Presentation-path
   consumers at roughly `game.js:8947` and `game.js:9060` (sfx rate).
6. **Deterministic 60s window never contains a boss phase.** Boss behavior is
   outside the deterministic metric's coverage.
7. **Events-RNG seed reproducibility unasserted.** Dropping the `resetEvents`
   seed still passes the M4 probe.
8. **META not consolidated into `HANGAR_TRACKS`.** Documented follow-up; Dan
   ruled publish without it.
9. **`errs=1` on every bot trial line**, on base and on mutants alike. Confirm
   as teardown noise.
