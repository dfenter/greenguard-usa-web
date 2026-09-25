# HM2 release lane 2026-09-25: STOPPED before deploy

## Integrated (branch hm2-release-2026-09-25, NOT pushed, NOT deployed)
- 44477fd4 hordemeridian2: stunning region backdrops (gated daf74bd9). game.js hunk from 1f7051c2 (oversized centred ground tileSprite, ADD blend alpha 0.85) plus hm2_background.js checked out from daf74bd9. git diff daf74bd9 over both files is empty.
- df55b510 hordemeridian2: every weapon evolution reachable (gated d441fc7e). Clean cherry-pick: pickUpgrade weapon level follows draft rank; evolveText cleared on scene shutdown; new hm2_weapons_probe.mjs.

## Probes at df55b510 (load average 11-33 during probes)
- hm2_world.test.mjs: 35 cases, 0 failures
- hm2_weapons_probe.mjs: PASS 40/40, two runs byte-identical
- hm2_m4_probe.mjs: 80 assertions, 0 failed
- hm2_m5_probe.mjs: 50 assertions, 0 failed
- hm2_bestiary_probe.mjs: 50/50 assertions passed
- hm2_m6_probe.mjs: exit 1, 20 PASS, 2 FAIL (chase-cam rotation lag; "x50" combo hero text at scale 0.44 in the census). Both FAIL identically on the pre-integration tree e7a34506, so pre-existing, not caused by either fix.

## Why the lane stopped: campaign literal recapture is vacuous
- HM2_CAPTURE=1 hm2_campaign_probe.mjs (3 contexts): L1 FAIL (majority 2/3 composition but sameStart=false), L5/L10/L15 PASS 2/3. 63/64.
- All four missions captured the SAME literal: {drifter 72, sprinter 68, bulwark 65, proboscis-prime 1, sapper 10, weaver 4}, dmg 82.8198. That is the classic free-play run, not the missions.
- Root cause (probe harness, pre-existing, identical on e7a34506 = deployed tree): deterministicMetric waits a fixed 1500 ms after __HORDE_READY, then sets pendingLevel and starts 'play' while boot is still running and 'title' is queued. Title create (game.js:1029) consumes Game.pendingLevel, so the probe's resetRun() (game.js:3406) sets this.level = null. Verified: level 1/5/10/15 before resetRun, null after, on both trees.
- Verified fix direction: waiting until the title scene is RUNNING (status 5) before setting pendingLevel keeps the level through resetRun (lvl 1/5/10 preserved). This is an instrument change and needs its own gate before literals are recaptured.
- Current SPEC_LITERALS in the probe therefore cannot pass on production either; no recaptured literals were committed.

## Next
1. Probe fix lane: wait for title RUNNING (or boot status >= 8) instead of wait(1500); assert sc.level.id === lid after resetRun so a vacuous metric fails loudly.
2. Recapture on an idle host at the integrated hash, commit, then push origin main (Vercel Git integration deploys).
