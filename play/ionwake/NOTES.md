# Ionwake

## AAA build

Implemented:

- New landscape Three.js title at `/play/ionwake/`, using the import-map `three` module and the shared GGRacer adapter without changing `play/_shared/`.
- GGKit owns lifecycle, pause, input identity, save data, audio registration, settings, and PWA registration.
- Fixed-step anti-gravity handling with analog drift steering, lean, boost and shield energy sharing, wall scrape damage, rival contact damage, sparks, magnetic edge assist, pit recharge, free dash plates, jump ramps, landing quality, and generous energy orbs.
- Seven AI rivals with different aggression and skill values, racing-line bias, and rubber-band speed control.
- Grand Prix, Time Attack with a translucent pace ghost after a saved best, and Survival with field reduction each lap.
- Three cups, cup points, cup-end podium screen, bronze/silver/gold results, medal progression, six machines, four stat dimensions, and three saved livery choices.
- First-run tutorial is a single fading top strip. Active HUD is limited to speed, lap, position, energy, boost state, and one transient chip.
- Hovercraft rendering is title-side: multi-part specular shells, tinted canopies, fins, lights, emissive engines, glowing repulsor pools, energy-wall shimmer, feature pads, and pooled sparks. Shared GGRacer supplies spline geometry, dense environments, camera, speed FX, FOV ramp, minimap data, and quality scaling.
- Nine authored spline tracks with signature set pieces and feature metadata.
- GGKit-routed synthesized audio names include two music stems plus UI, boost, scrape, contact, pickup, dash, landing, lap, countdown, and podium SFX.
- `window.__iw = { state, forceTrack, forceCup, forceRace }` is created before track loading and remains live during the scene. Query-string force switches are also accepted.
- `index.html`, manifest, SVG icon, SVG favicon, and service worker are self-contained. The service worker precache contains only real files.

Machine table:

| Machine | Unlock medals | Top speed | Accel | Shield | Boost drain |
|---|---:|---:|---:|---:|---:|
| Lumen K2 | 0 | 252 | 34 | 100 | 28 |
| Vanta Arc | 2 | 270 | 31 | 88 | 34 |
| Cobalt Rise | 4 | 244 | 40 | 112 | 24 |
| Ember Vector | 6 | 282 | 30 | 78 | 38 |
| Prism Wake | 8 | 261 | 37 | 94 | 30 |
| Null Comet | 10 | 291 | 27 | 66 | 44 |

Cup table:

| Cup | Tracks | Signature |
|---|---|---|
| First Light | Voltspire, Cinder Highroad, Mirror Orbit | Night switchbacks, canyon jump gap, orbital sweeper |
| Red Shift | Neon Artery, Suncut Switchbacks, Halo Dive | City chicane, banked hairpins, elevation dive |
| Black Vector | Blackline Crest, Ion Reef, Last Light Ring | Split-route crest, coastal reef pylons, final launch ring |

Track table:

| Track | Theme | Authored set piece |
|---|---|---|
| Voltspire Switchbacks | Night city | Neon tower canyon and three hard switchbacks |
| Cinder Highroad | Desert dusk | Canyon high-road jump gap |
| Mirror Orbit | Night city dusk | Long banked orbital sweeper |
| Neon Artery | Night city | Dense elevated city chicane chain |
| Suncut Switchbacks | Desert noon | Sawtooth canyon hairpins |
| Halo Dive | Alpine dusk | Ridge crest into a long dive |
| Blackline Crest | Alpine night | Over-under crest split metadata |
| Ion Reef | Coastal dusk | Tidal superstructure and reef pylons |
| Last Light Ring | Night city | Cathedral dive and launch rail |

Deferred:

- In-browser smoke test and 4x-throttle median could not run in this sandbox. The local preview server was blocked from binding, and no browser connection was available.
- Audio is intentionally compact synthesized WAV data for the offline payload. A longer authored soundtrack pass can replace the two stem motifs without changing the GGKit routing.
