# Transit Dash
Controls: swipe left/right = change track, swipe up (or tap) = vault, swipe down = slide. Keyboard: arrows/WASD, Space = vault, P/Esc = pause, R = restart, M = mute.
Loop: 3-lane endless run through a seeded daily transit route: vault rail cars, slide under barriers, dodge signal blocks, hit green ramps for the high-value rooftop coin arc.
Pickups: magnet, grind board (absorbs one hit), double fare. Stumble once and the inspector tails you for 13s; stumble again while he's there and you're caught.
Missions: 3 daily mission chains run in the background; clearing one banks tokens AND rotates the live route theme (rail yard -> rooftop line -> deep tunnel), which regenerates the track ahead.
Persistence: best distance, banked tokens, mission tiers and current route theme are stored in localStorage.

## AAA rebuild

Implemented: Phaser 3 from `/play/_shared/` with GGKit as the lifecycle, input,
save, audio and juice owner. The runner now uses fixed-step physics, buffered
lane and vertical inputs, a 0.12s lane commit window, forgiving hit regions,
near-miss flash, shielded damage, hit-stop, shake, instant restart, rail grind,
trains, barriers, gaps, crates, ramps, tokens and magnet, jetpack, shield and
boost power-ups. The UI follows UI_LAW with one corner toast, a fading coach
strip, compact icon HUD, thumb-safe controls and boundary-only center results.

Content tables: 42 authored chunks through four line identities: dawn yards,
neon underground, elevated river and harbour terminus. The tables include
animated birds, crowds, signs, ferries and trains, four music stems, 16 SFX,
20 rerolling missions, 8 token-unlocked characters, 6 token-unlocked boards,
daily seeded personal-best rows and Time Attack. Persistence is GGKit-validated
and includes scores, tokens, missions, unlocks, loadout and daily results.

Deferred: a real browser first-frame render and hook-driven browser probe could
not run because no browser target or private local server was available in this
environment. Isolated runner verification did confirm the authored content
counts plus mid-air lane buffering and buffered landing roll execution.
