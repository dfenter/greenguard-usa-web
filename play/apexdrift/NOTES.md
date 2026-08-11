## AAA build

### Implemented

- Original landscape arcade racer built on the GGRacer shared engine with GGKit as the only lifecycle, input, save, and audio owner.
- Fixed-step drift simulation with tap-brake and flick entry, analog steering response, stable angle control, style scoring, proximity chains, clean-exit speed carry, wall taps with sparks, drafting slipstream, catch-up rivals, nitro charges, and on-track pickups.
- Three Grand Prix cups with three races each, podium boundary results, Time Attack ghost, Drift Trial style medals, first-run tutorial strip, garage progression, six stat-tradeoff cars, and livery palettes.
- Dense sunset, alpine, coastal, and neon-city presentation through nine authored GGRacer spline tracks. Local generated synthwave stems and SFX are registered through GGKit audio.
- Minimal live HUD for speed, lap, position, nitro pips, and drift score. Safe-area landscape layout, reduced-motion browser CSS, manifest, icons, favicon, offline worker, boot fallback, and live `window.__ad` state with force switches are included.
- Static verification passed: every title JavaScript file passes `node --check`, all track and manifest JSON parses, every service-worker precache path exists, and the title payload is below 2.5 MB with no file above 400 KB.

### Cars

| Car | Tradeoff | Livery |
| --- | --- | --- |
| Sunset GT | Balanced grip and speed | Solar |
| Violet Comet | More drift angle, less grip | Ultraviolet |
| Coast Runner | High grip, lower top speed | Aqua Flash |
| Cobalt R | High top speed, lighter grip | Blue Hour |
| Sunset Pro | Very high drift angle | Hotline |
| Night Phantom | Highest speed and angle, lowest grip | Electric Noir |

### Cups

| Cup | Races | Geography |
| --- | --- | --- |
| Coastline Cup | Tideglass 180, Sunline Causeway, Harbor Rise | Seaside highway, bay, port deck |
| Summit Cup | Cobalt Switchback, Summit Run, Cliffside Needle | Switchback ladder, high road, cliff bridge |
| Neon Cup | Neon Overpass, Metro Spiral, Midnight Boulevard | Tunnel, stacked overpass, city loop |

### Tracks

| Track JSON | Signature |
| --- | --- |
| tideglass-180.json | Seaside highway with long 180 sweeper |
| sunline-causeway.json | Bay causeway sweeper and gantries |
| harbor-rise.json | Harbor cranes and elevated rise |
| cobalt-switchback.json | Mountain pass switchback ladder |
| summit-run.json | High road and summit gate |
| cliffside-needle.json | Needle bridge and cliff cut |
| neon-overpass.json | Tunnel mouth and stacked overpass |
| metro-spiral.json | Descending inner city spiral |
| midnight-boulevard.json | Neon boulevard and tunnel switch |

### Deferred

- In-app browser WebGL smoke test, local HTTP smoke test, and 4x-throttle median capture could not run because no browser backend was available and sandbox socket binding was denied in this environment.
- Split-route geometry is deferred because the current GGRacer track schema exposes authored spline circuits but no route-branch primitive.
