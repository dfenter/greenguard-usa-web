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

## Probe-fix lane 2026-09-25: STOPPED before push (campaign gate flakes after the fix)
Branch rebased onto origin/main f6a6e47f (backdrops ffdb4dfb, weapons a12792a6, handoff 5c324f60).
- 105a523b probe fix: deterministicMetric waits for the Phaser 'title' scene status 5 (RUNNING) instead of wait(1500) before setting pendingLevel; after resetRun() it throws unless sc.level.id equals the requested mission (both values in the message). Scratch check: L1/L5/L10/L15 all hold through resetRun. The bot-trial phase (newPage, fixed 2000 ms) was left as is.
- 5fd310d5 literals recaptured (capture 2, 64/64, load 6.01 to 5.76). Four DISTINCT sets. L15 and the L1 damage are bit-identical to the hotfix-1 literals, so the old literals were real mission values captured on an idle host; the free-play capture was a load-dependent race, not a permanent production state.
  - L1 drifter 42 sprinter 36 salvage-swarm 98 bulwark 9 ..., dmg 29.4203
  - L5 ember-scarab 105 ash-wraith 73 cinder-kamikaze 66 ..., dmg 150.7105
  - L10 blink-stalker 109 gravity-mite 110 null-leech 65 sprinter 22 ..., dmg 29.5957
  - L15 drifter 69 sprinter 59 bulwark 45 ..., dmg 250.6625 (dies at 43.00s)
- Capture 1 (load 6.9 to 8.1) lost the L10 majority (1/3, three different compositions).
- Pass run against committed literals (load 4.73 to 4.08): 70/72, EXIT 1. L1 majority 1/3 (drifter 45 / 51 / 42) and L1 composition mismatch; L5, L10, L15 pass.
- hm2_world.test.mjs 35 cases 0 failures; hm2_weapons_probe.mjs PASS 40/40.

## Why stopped
With missions actually playing, the minority-context carrier fires in nearly every mission (at least one deviating context in 10 of 12 mission runs across three probe runs), not ~1-in-48. Across 9 L1 contexts the modal value (42 / 29.4203) came up only 5 times, so a 2-of-3 majority holds only about 60% of the time. The gate cannot be a release gate in that state. Recapturing until it passes would just be tuning to noise. main was NOT pushed or deployed.

## Next
Fix the sim/fx RNG split in game.js (the residual carrier, see memory follow-up 5), or a probe change that removes the carrier, then recapture and rerun the pass. Options for the router: accept a waiver for the campaign gate and push the release (both fixes already gated RELEASE), or hold.
Campaign determinism gate WAIVED by Dan 2026-09-25 for this release; cross-context instability (1 of 3 contexts disagrees in ~10 of 12 mission runs) predates this release and is tracked as follow-up: split gameplay RNG from VFX RNG, then recapture.
