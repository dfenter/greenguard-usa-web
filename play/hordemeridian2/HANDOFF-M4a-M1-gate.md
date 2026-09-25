# HANDOFF: M4a + M1 combined gate and deploy (2026-09-18)

Status: **DEPLOYED**. Live at https://new.greenguard-usa.com/play/hordemeridian2

Deployed commit: `0ac8710b`
Vercel deployment: `greenguard-usa-5bl52b54l-green-guard-usa-s-projects.vercel.app`

Branch `calendar-dnd`, not pushed.

## What landed

### M4a campaign Rev 2 (lucille-70 lane)
- `aa8c9b69` replace the campaign with 15 new missions (Rev 2), 19 files, +972/-666
- `c0b00531` HANDOFF-M4a.md, lane self-gate 55/55

### M1 weapons (lucille-70 lane)
- `bad7b4f8` 12 archetypes plus 12 evolutions, +1068/-561
- `hm2_weapons.js` new, the 50-key HM1 table is gone, legendary tier removed
- Detail in HANDOFF-M1.md

### Gate fixes (this lane)
- `a865dfb8` hot-start: rail chargeTime 0.42 to 0.24, beam spec dmg 1.14 to 1.85,
  dronebay droneFireRate 0.9 to 0.55. Level-1 rows only, levels 2-5 untouched.
- `3003b8a0` mission count and star cap derived from `levels.length`
- `c5f75977`, `a93ff486`, `0c8029d8`, `db3ea077`, `0ac8710b` codex recipe legibility

## Gate verdicts

| check | verdict | evidence |
| --- | --- | --- |
| all 15 missions boot and run | PASS | hm2_campaign_probe, L1-L15, no console errors |
| campaign level count live | PASS | `campaignLevels: 15` read from the live page |
| weapons + evolutions present | PASS | `HM2_WEAPONS.WEAPONS.length === 24` live |
| no console errors at 390x844 | PASS | live page boots with zero console errors |
| capture harness 390x844 | PASS | 10 screens in `review_evidence/m4a_m1/` |
| hm2_world.test.mjs | PASS | 20 cases, 0 failures |
| node --check all touched JS | PASS | |
| hot-start survival >= 60s | PARTIAL | see residuals |

The 5 console messages the capture harness reports locally are benign: one
service-worker scope error that only occurs when serving from a plain local
http.server, and four WebGL ReadPixels performance warnings caused by the
harness taking screenshots. The live page has zero console errors.

## Two real bugs found and fixed at gate

**1. The mission list under-reported the campaign and discarded stars.**
`hm_campaign_ui.js` hardcoded the string `'13 MISSIONS'` and clamped the star
total to `27` (13 x 3), both left over from Rev 1. Rev 2 ships 15 missions, so
the header read "13 MISSIONS / STARS 0/27" and any star earned on mission 14 or
15 was silently clamped away. Both now derive from `levels.length`, so the
header reads "15 MISSIONS / STARS 0/45" and the cap follows the level list.

**2. Every evolution recipe was unreadable in the codex.**
M1's design says the codex shows all 24 weapons with their recipes from day one,
because the recipe is the information that makes the tab actionable. At 390x844
the 4-column grid gave each card about 60px of text width, so
`'LEVEL 5 PLUS REACTOR MODULE'` wrapped to one line and truncated to `'LEVEL...'`
on all 12 evolutions. Fixed in three steps: 3 columns on viewports under 520px,
the recipe line starting at the card padding instead of clearing the icon (it
renders below the icon's centre line and never collided with it), and shorter
labels. All 12 recipes are now fully legible at 390px.

## Residuals (NOT fixed, owner: whoever holds game.js next)

**beam hot-start median is 28.1s against a 60s bar.**
Raising `spec.dmg` from 1.14 to 1.85 moved it only from 26.1s to 28.1s. Diagnosis:
the beam sweep angle is hardcoded at `game.js:6604`:

```js
var bAng = bm.sweep ? this.run.time * 2.4 + Math.sin(this.run.time * 0.85) * 0.36 : ang;
```

The sweep rate is a literal `2.4` that ignores weapon level, fire rate and
`effectiveSpec` entirely, so beam's area coverage never improves and extra
damage per tick barely helps. The fix belongs in that expression (drive the
sweep rate from the spec or the level row), which is in game.js. lucille-b3 owns
game.js for M2 Phase B, so this lane did not touch it.

**dronebay hot-start is unmeasured.**
Its pre-fix median was 34.9s. The post-fix run never completed: the local probe
server was killed by this lane during the deploy, so dronebay, mine, ricochet,
arccoil and flak report `NaN` from load failures, not from gameplay. Those five
need a re-run on a stable server. Note the server must be threaded
(`ThreadingHTTPServer`); a plain `python3 -m http.server` wedges under the
probe's concurrent requests and produces false `ERR_EMPTY_RESPONSE` failures
that look like game bugs.

Hot-start medians measured on a stable server, post-fix:

| weapon | pre | post | bar |
| --- | --- | --- | --- |
| lance | 83.9 | 80.2 | PASS |
| scatter | 83.4 | 82.2 | PASS |
| rail | 20.9 | **79.1** | PASS (was failing) |
| seeker | 80.5 | 81.2 | PASS |
| mortar | 80.5 | 80.9 | PASS |
| beam | 26.1 | 28.1 | **FAIL** |
| glaive | 80.9 | 83.3 | PASS |
| mine, ricochet, arccoil, flak | 79.7-82.3 | unmeasured | re-run needed |
| dronebay | 34.9 | unmeasured | re-run needed |

**The HM1 bot numbers are invalid.** The M4a lane found that the inherited bot
set `scene.input.vx/vy` and assigned `p.vx/p.vy`, neither of which is a real
input path: game.js reads `this.stick` (`active`, `dx`, `dy`) in the movement
integrator and overwrites velocity from it every frame. Driving `stick` took
mission 1 from about 20s to a full 150s clear. Every survival number produced by
the old bot, including the 78-93s medians quoted in HM1 memory, was measured
with a bot that could not steer. Use `hm2_campaign_probe.mjs`, which drives
`stick` correctly.

Mission 10's bot trials end at about 54s at full hull. That is objective
completion, not a death, so its "survival median" reads low for a mission that
is not short. The probe reports run length, not survival.

## M2 state versus the two M2 commits already present

M2 is NOT done and this deploy deliberately excludes it.

At the time of this gate, `282171be` (hm2_world.js SDF arena) and `caf61e1a`
(hm2_background.js 4-layer parallax) were the only M2 commits, both Phase A:
new files only, nothing wired into the running game. lucille-b3 has since landed
Phase B work on top (`107a779d`, `1f258d8a`, `b7193ac3`, `a92f734a`, `6b386bda`,
`cfbf6c2c`), including its own gate verdict `1f258d8a "gate verdict HOLD, probe
pass was false (no teleport, orientation gate)"`.

This deploy was cut from `0ac8710b`, which is M4a + M1 + the gate fixes and
**none** of the M2 Phase B work, because that work is under its own HOLD. The
deploy was built in a throwaway git worktree at that commit so the main
checkout, which holds lucille-b3's in-flight edits, was never stashed or
checked out.

What M2 still needs, beyond the SDF and background modules that exist:
- the SDF clamp actually replacing the rectangular EDGE clamp in the live sim
  (Phase B, in progress, currently HOLD)
- terrain features instantiated per region (asteroid fields, gravity wells,
  nebulae, derelict hulks, solar flares) with collision and projectile effects
- the palette/luminance gate per region (enemy and projectile luminance delta
  >= 0.18 against the sampled backdrop)
- an fps floor of 50 on the mobile profile with the parallax layers live

## Gotchas for the next lane

- Deploying from a worktree needs `.vercel/` copied in (it is gitignored) and
  `redesign/node_modules` symlinked from the main checkout. Without the latter,
  `deploy.sh site` runs `npx astro build`, npx installs a fresh astro 7.x, and
  the build dies with "Tsconfig not found astro/tsconfigs/strict". The repo
  pins astro 5.x.
- `deploy.sh` derives `REPO_ROOT` from its own location, so it deploys whatever
  tree it is run from. That is what makes the worktree deploy safe.
- The bare directory URL `/play/hordemeridian2/` returns a redirect stub. Use
  `curl -L` or request `index.html` when checking the live page for script tags.
