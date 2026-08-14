# Stomp Circuit

Prototype notes are superseded by the AAA rebuild report below.

## AAA rebuild

Implemented:

- Phaser 3 and GGKit are now the only runtime engine and lifecycle/input/save/audio owners. The game uses a 60 Hz fixed-step simulation, bounded FX and popup pools, guarded GGKit saves, visible reduced-motion gating, a themed banner system, and a full same-origin service-worker precache.
- Physical truck handling now has weighty acceleration, suspension compression, slope-following body weight, charge-to-launch big air, analog drag or Q/E air rotation, flip and spin tracking, angle-rated hard/clean/perfect landings, and boost earned from clean landings.
- Cars and buses have readable deformation states, partial squash and full destruction, impact FX, shake, crush scoring, and combo participation. Combo multiplier, decay, crowd energy, announcer banners, and pickup drops are visible in the field.
- Generous field drops include score flares, boost cans, and time extensions. Drops are authored across every arena and are pooled at runtime.
- Structured progression includes Freestyle, Crush Rally, Ramp Gauntlet, and the Final Showcase. Each has a goal, timer, medal tiers, and save-backed unlock chain. `window.__st.state` exposes mode, score, combo, airborne, event, arena, time, boost, crushes, gates, and the force switches.
- The verification switch is readable before boot and by the live scene: set `window.__st.forceEvent` to `freestyle`, `crush-rally`, `ramp-gauntlet`, or `showcase`, and optionally set `window.__st.forceArena` to 0 through 3.
- Four authored arenas are distinct in palette, route rhythm, stunt centerpiece, crush placement, gaps, ramps, crowd density, and discoverable shortcut line.

Arena table:

| Arena | Flow identity | Centerpiece | Secret line |
|---|---|---|---|
| Stadium Bowl | broad stadium rhythm, bowl return, repeated ramp pairs | The Bowl Drop | Upper Deck Cut |
| Junkyard Sprawl | dense wreck rows, scrap kickers, tight gaps | The Magnet Drop | Magnet Tunnel |
| Canyon Rim | long air gaps and high consequence launches | The Rim Break | Ravine Low Line |
| Night Show Ring | neon ring rhythm, light ramps, encore spacing | The Light Loop | Blacklight Line |

Event table:

| Event | Objective | Medal tiers |
|---|---|---|
| Freestyle | score as much as possible in 90 seconds | 9k / 22k / 42k |
| Crush Rally | crush the authored prop row in 75 seconds | 35% / 65% / 100% of the arena row |
| Ramp Gauntlet | clear six line gates in 75 seconds | 2 / 4 / 6 gates |
| Final Showcase | score attack with all systems in 120 seconds | 30k / 70k / 125k |

Deferred:

- No local image or audio binaries were added. Vector art is authored in the renderer, while the existing CC0 MP3 harvest is referenced and fully precached through same-origin paths. A title-local audio copy can replace those references if the deployment pipeline later requires every dependency to live under this folder.
- A full browser feel capture and 4x-throttle frame trace could not be run in this environment. Syntax, payload, and static contract checks were run locally.

## UI declutter

- Cut all live center banners and repeated brand, arena, mode, event-tag, and control-label copy; run outcomes remain on the results screen.
- Shrunk the active HUD to icon-led score/time/combo, compact objective counters, thin combo/boost meters, and icon-only controls.
- Replaced pooled world popups with one top-right chip queue capped at a 1.0s hold, with reduced-motion gating retained.
