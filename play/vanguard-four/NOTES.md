# Vanguard Four

Controls: drag anywhere on the left/open area = floating move stick; STRIKE button = attack (tap or hold to combo); SUPER button when the meter is full; tap a teammate portrait to take control of that hero.
Keyboard: WASD/arrows move, J or Space strike, K super, 1-4 swap hero, M mute.
Loop: clear wave rooms of 5 enemy types with 4 heroes (blade dash, gravity fist, arc lantern, storm chain); the 3 you aren't driving fight as bots and revive downed allies. A Warden boss guards every 5th room.
Fail: all four heroes down ends the run; tap to redeploy instantly. Score = rooms cleared + kills, best persisted in localStorage.
Tech: plain canvas + vanilla JS, no build step, no network, relative script paths only.

## AAA rebuild

Implemented: Phaser 3 portrait rebuild with GGKit lifecycle/input/save/audio, fixed-step seeded Vanguard Run, hero Trials with unlock chain, Finale Assault unlock after a Warden clear, four authored room identities plus finale chamber, Warden telegraphs and dodge windows, strike tap/hold combo finishers, screen-wide hero supers, instant control transfer cues, bot ally revive channels, generous orb/health/score drops, pooled entities and particles, authored procedural hero state sheets, big room/Warden/medal banners, reduced-motion gating, PWA precache, and the `window.__vf` probe.

Room table: Entry Courtyard = open sightlines and husk/skitter contact; Collapsing Foundry = lobbers and sappers in pressure lanes plus a discoverable mint Rescue Relay side room; Storm Rampart = skitter/bracer cross-fire; Warden Arena = every fifth Vanguard Run room with ring or sweep telegraphs; Finale Assault Chamber = three-room end sequence.

Hero table: Rhea = Blade Dash / Vector Rush; Oro = Gravity Fist / Singularity; Nia = Arc Lantern / Sunlit Arc; Kito = Storm Chain / Chain Reaction.

Deferred: an authored CC0 Warden roar cut from the harvested audio packs is deferred because `/play/_assets/` contains no audio files; the shipped Warden roar is a procedural MP3 cue. Browser visual/performance capture was not available in this shell.

## Fix round 1

- Fixed critical authored-art floor with original SVG hero, enemy, room, pickup, hazard, projectile, and FX assets.
- Fixed critical formation tactics with Line, Vanguard, and Orbit modes, touch and keyboard commands, formation feedback, and bot formation goals.
- Fixed critical role depth with Rhea dash, Oro pull, Nia ranged arc and heal, Kito chain attacks, role supers, and cross-hero synergy.
- Fixed hold-to-combo chaining and the finisher window.
- Fixed first-60-second onboarding for movement, strike, swap, formation, role synergy, and Super timing.
- Fixed menu overlap and added visible, separated Run, Trial, and Finale deployment bands with hero selection.
- Fixed floating movement activation across the open left arena and preserved pointer ownership by initial zone.
- Fixed standard gamepad movement, strike, Super, formation, pause, and restart mappings.
- Fixed player-facing pause and guarded restart controls.
- Fixed wipe and result activation to require fresh pointer or keyboard edges after input is cleared.
- Fixed meaningful room terrain collision, distinct Finale room sets, phase progression, and Trial goal enforcement.
- Fixed Bracer rear-angle mitigation with an absolute angle comparison.
- Fixed combo decay, score multiplier application, single-count combat chains, and medal chain tracking.
- Fixed enemy stun so stunned enemies stop movement and attacks.
- Fixed audio coverage with a danger music crossfade and distinct role, formation, hurt, pickup, and combat cues.
- Fixed particle differentiation with pooled authored slash, spark, burst, ring, link, pickup, flare, hazard, and bolt visuals.
- Fixed combat feedback with hit-stop, score popups, staged death FX, and a red damage vignette.
- Fixed timed hero animation frames and enlarged critical mobile labels and roster hit targets.
- Fixed best-score flushing on kills, wipe, room clear, and terminal completion.
- Fixed finisher slowdown cleanup with an explicit finisher timer.
- Fixed roster swap hit area to a 52px vertical target.
- Fixed fleet identity from F8 to F2 and bumped the service-worker cache version.
- No findings rejected.
- Verification: `node --check game.js`, `node --check sw.js`, manifest JSON parse, cache asset audit, and payload/file-size audit passed.

## Boot repair

- Fixed the FX preload callback context so Phaser reaches `create` and the first menu frame renders.
- Guarded Storm Chain chaining when no first target is in range, keeping play free of runtime exceptions.
- Verification: lifecycle trace passes preload, create, menu render, run start, and 360 play frames with no exception.

## UI declutter

- Cut live center banners, score popups, revive countdown copy, mode/logo/flavor labels, and repeated control captions; room-clear medal messaging remains only at the level boundary and full outcomes remain on results.
- Shrunk in-play events to one queued top-edge chip at a time, held under 1 second with reduced-motion gating; tutorial copy is one thin fading strip.
- Collapsed active HUD to room/score icons, a super meter, hero portraits with health bars, formation state, and icon controls; moved roster interaction into the compact top portrait row.
- Verification: `node --check game.js` and `node --check sw.js` pass; browser screenshot smoke capture was unavailable in this shell.
