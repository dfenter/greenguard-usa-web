Controls: tap water to set a course; drag the TRIM ring to angle the sail.
Keyboard: arrows steer/trim; WASD also steers/trims; E docks, R restarts.
Loop: sail between docks, buy low, sell high, and upgrade the hull with gold.
Storm cells give a speed boost but can spill cargo.
Goals: reach 1,000 gold, 5,000 gold, and the flagship hull; progress autosaves.

## AAA rebuild

### Implemented

- Rebuilt the prototype as a procedural Three.js r160 sailing world using GGKit for lifecycle pause/resume, per-pointer input, guarded save data, audio buses, settings, loader, and PWA registration.
- Added authored 3D hull tiers from Cutter through Flagship, sail liveries, wind arrows, live telltales, visible sail luff, trim-driven speed and heel, spring chase camera, blob shadow, pooled wake and spray, storm rain and lightning, dock glide scoring, and reduced-motion gates.
- Added generous gold caches, cargo bonus crates, wind-boost lanes, escalating market volatility, four trade goods, hull capacity upgrades, and route unlock medals.
- Added `window.__th = { state, forceEvent, forceStorm, triggerEvent }`. The live state exposes mode, gold, hull, region, cargo, storm, and boost values. Switches also accept `window.__th.forceEvent = 'cache'`, `window.__th.forceStorm = true`, or the corresponding fields on `window.__th.state`.
- Added manifest, 512px icon, 192px icon, favicon, local procedural MP3 cues, and a versioned service worker with complete existing-file precache.

### Region table

| Region | Identity and flow | Landmark | Shortcut and hazards |
|---|---|---|---|
| Lumen Coast | Harbor town coast and low-risk starting waters | Lighthouse Point | South channel buoys, coastal reef teeth |
| Gale Straits | Narrow storm lanes and high-speed risk | Breakwater Wreck | Reef shortcut through the squall corridor |
| Sunken Archipelago | Dense reef islands with the best Brineglass prices | Floating Market | East channel shortcut, staggered reefs |
| Bluewater Lane | Open ocean trade lane with broad reaches | Trade Beacon | Long wind lane, scattered outer reefs |

### Route table

| Route | Dock circuit | Medal basis and unlock |
|---|---|---|
| Coastal Run | Lumen Coast to Sunken Archipelago and back | Profit and 120, 95, 75 second tiers. Unlocks Deep Trade after any medal |
| Deep Trade | Lumen Coast, Gale Straits, Sunken Archipelago, Bluewater Lane, Lumen Coast | Profit and 260, 210, 175 second tiers. Unlocks Cargo Rush after any medal |
| Cargo Rush | Bluewater Lane to Gale Straits | Premium Brineglass delivery with 100, 80, 65 second tiers. Completes the route chain |

### Deferred

- Browser and WebGL visual smoke test could not run in the available environment. `node --check` passed for all title JavaScript, manifest parsing passed, service-worker precache paths all exist, and the current title payload is 660,191 bytes.

## Fix round 1

### Fixed findings

- CRITICAL touch course input: canvas pointer events now keep their GGKit pointer zone and use pointer capture.
- CRITICAL touch trim input: the trim ring now registers a GGKit `trim` pointer and updates during drag.
- CRITICAL malformed saves: angle normalization is modulo based and save validation bounds every persisted numeric field.
- CRITICAL primitive-adjacent environment: islands, docks, landmarks, and the vessel now have richer authored procedural layers, foliage, shore bands, rails, canopies, lanterns, and contact accents.
- CRITICAL player animation states: the vessel now exposes readable IDLE, SAILING, BOOST, STORM RUN, and DOCKED poses with distinct sail, flag, lantern, bob, and contact behavior.
- MAJOR paused keyboard actions: raw key actions now stop while GGKit is paused, and focused form controls do not trigger docking.
- MAJOR active route persistence: route id, leg, timer, trade profit, and delivery cargo persist through GGKit saves and validated reloads.
- MAJOR route medals: medal profit now comes only from route trade transactions, with the route reward applied afterward.
- MAJOR Cargo Rush delivery: the charter requires four Brineglass units and consumes them at the destination.
- MAJOR wind model: wind speed now scales sailing speed as well as the HUD readout.
- MAJOR audio coverage: added two 12-second looping MP3 music beds and twelve distinct MP3 SFX, all routed through GGKit audio buses.
- MAJOR first-run tutorial: the persisted five-step tutorial advances from course setting through trim, docking, buying, and selling.
- MAJOR content depth: added six persistent charter contracts with progress, rewards, claim buttons, and progress hooks across routes, storms, caches, glides, sales, and upgrades.
- MAJOR loader progress: boot now waits for local SFX preload before continuing, while music remains lazy until first interaction.
- MAJOR menus: added a title screen, visible pause and resume, settings restart, fullscreen, and persistent music and SFX volume controls.
- MAJOR 390px UX: reflowed the HUD and dock panel, enlarged primary touch targets, and made the trim ring touch-safe.
- MAJOR impact feel: reef and storm contacts now use GGKit hit-stop and shake, pooled contact rings, spring boat pulse, camera dip, and velocity lookahead.
- MAJOR save invariants: medal, contract, route, cargo, vessel, RNG, and pickup values are range checked and cargo totals cannot exceed hold capacity.
- MAJOR victory state: victory now persists and permits post-goal free sailing and docking without clearing the completed state.
- MAJOR determinism: storm cargo loss uses a persisted simulation RNG; Math.random remains limited to cosmetic FX variation.
- MAJOR reduced motion: water, rain, wake, spray, lightning, telltales, boost rings, FOV kick, and impact juice are gated consistently.
- MAJOR volume settings: GGKit music and SFX sliders are exposed in the settings shell and persist through GGKit preferences.
- MINOR background save: added visibility and pagehide save guards.
- MINOR restart music: reset now restores wind music and clears render keys.
- MINOR dock quality: distance is now part of the glide score.
- MINOR FX budget: wake, spray, and rain pools are 16 each and share geometry and materials.

### Rejected findings

- CRITICAL AAA evidence staging: the requested `review_evidence/aaa/tide-harbor/` destination is outside the user-authorized title directory, and no browser target was available to generate valid visual evidence. No out-of-scope files were created.
- MINOR gamepad mapping: GGKit exposes no gamepad input API, and title-side polling would violate the sole-GGKit input rule. The title screen explicitly documents touch and keyboard controls only.

### Verification

- `node --check play/tide-harbor/game.js` passed.
- `node --check play/tide-harbor/sw.js` passed.
- Manifest parsing, MP3-only audio checks, service-worker path checks, no-em-dash scan, payload, and per-file size checks passed.
- Payload is 660,191 bytes excluding NOTES.md and LICENSES.md. Every shipped file is below 400 KB. `sw.js` is version `aaa-rebuild-20260810-2`.

## UI declutter

- Cut the live tagline, repeated HUD labels, region flavor copy, wind-mode text, trim label, and always-on contract stack from active play; routes and contracts now live behind the compact route-board toggle, and market state remains in the dock panel.
- Shrunk the HUD to icon-led gold, hull, cargo, time, wind, speed, and route meters; changed pause/resume to icons and kept controls and reduced-motion gates intact.
- Moved every in-play banner and coach callout out of center stage into one queued corner chip capped at 1.0s, with tutorial steps using one thin top strip that fades after about 3s.
