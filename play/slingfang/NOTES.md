Controls: drag back from the glowing fang and release; arrows aim, Space launches; tap a roster orb to select.
Loop: clear 12 enemy formations, bank off walls for phase barriers, bump allies for auras, and retry when vitality empties.
Free: six creatures unlock by stage clears; progress and best score persist locally.

## AAA rebuild

Rebuilt in place 2026-08-10 (fleet F12). The prototype's single-file canvas
build is gone; the title now runs on vendored Phaser 3.87 with GGKit as the
sole lifecycle, input, save and audio implementation. Portrait 390x844,
`<base href="/play/slingfang/">`, Phaser and GGKit loaded from absolute
`/play/_shared/` paths.

### Implemented

**Mechanics.** Drag anywhere in the arena to load the sling; the shot flies
opposite the drag, power scales with pull length. A pooled 40-dot trajectory
preview traces the real path, reflecting off arena walls and live barriers,
and every predicted ricochet gets a pulsing bank marker (gold for a wall, blue
for a barrier) so the bank plan reads BEFORE release. Arrows aim and adjust
power, Space launches on the rising edge (holding it cannot machine-gun, and
Space alone fires without touching the arrows first). Impact escalates with
the combo across five channels at once: particle count, shake magnitude,
hit-stop length, an expanding combo ring, and `playbackRate` climbing the
impact chime. Ally bumps fire an obvious aura: expanding ring burst, post
flash and scale-up, a corner chip, and a velocity kick off the post.

**Loop.** 12 seeded campaign formations plus a 6 leg hand-authored Formation
Rush (its own layouts, not a reshuffle). Medals score three conditions:
shots at or under par, combo at or above target, and no vitality lost. Three
met is gold, two silver, cleared is bronze; the best medal per formation
persists. Drops between formations are deliberately generous per the owner
directive: +34 vitality and +3 free shots in campaign, +40 and +4 in Rush. A
free shot absorbs the whole end-of-shot vitality drain. Vitality empty means
retry the formation with a full pool, never a run wipe.

**World design.** Four authored sets with distinct bank geometry and a
difficulty ramp: Open Field (no barriers, learn the pull), Bank-Shot Canyon
(vertical chutes and gates, barriers only break on a banked shot), Ally
Cluster Yard (field posts mid-field for aura chaining), Slingfang Master
(everything at once, ending on the brood anchor caged behind four barriers).

**Presentation.** Authored atlas: six creatures x three states (idle, launch,
impact), six roster orbs, six ally posts, four enemy family bodies, two
barrier states, the fang anchor, three medal tiers, six HUD marks, five
particle textures. Four pooled particle systems (impact, bank, aura, trail),
two synthesised music stems crossfaded by GGKit (field / rush), twelve
synthesised SFX cues, two CC0 Kenney font subsets. Every asset is original or
ledger-traced; see LICENSES.md. Generators live outside the game directory at
`aaa/harness/sf_tools/`.

**UI_LAW compliance.** One transient at a time: chips queue behind the live
one and a boundary banner clears both the queue and the coach strip. Centre
banners appear only at formation clear, medal, creature unlock, vitality out
and campaign complete, never during live play. In-play events (bank, barrier
down, aura, free shot, roster swap, locked creature) are corner chips at 14px
with a 0.95s hold and a fast fade. The persistent HUD is one 46px top band:
vitality icon plus meter, combo chip only above x2, shots-used against par,
free-shot badge. The coach strip is a single 13px line at the top edge that
fades after about 3s, is centred clear of the 44px pause target, and shows
three lessons across the whole campaign, once each. Roster orbs are 58px
apart in the thumb zone; nothing informational sits below the arena.
Reduced motion disables shake and hit-stop and cuts every particle burst.

### Formation table

Authored coordinates were projected once into the arena play band so the field
fills; the numbers in sf_data.js are final, there is no runtime transform.

| # | id | set | name | par | combo | contents |
|---|---|---|---|---|---|---|
| 1 | f1 | Open Field | First Light | 3 | 3 | 5 mote |
| 2 | f2 | Open Field | Wide Rank | 4 | 4 | 8 mote |
| 3 | f3 | Open Field | Iron Row | 5 | 4 | 7 mote, 2 brute |
| 4 | f4 | Canyon | Narrow Pass | 5 | 4 | 6 mote, 1 warden, 2 barriers |
| 5 | f5 | Canyon | Double Bank | 6 | 5 | 3 mote, 2 warden, 1 brute, 3 barriers |
| 6 | f6 | Canyon | Canyon Gate | 7 | 5 | 3 mote, 3 warden, 2 brute, 3 barriers |
| 7 | f7 | Yard | Sparring Yard | 6 | 6 | 8 mote, 1 brute, 3 posts |
| 8 | f8 | Yard | Cluster Drill | 7 | 7 | 5 mote, 3 brute, 1 warden, 4 posts |
| 9 | f9 | Yard | Yard Siege | 8 | 8 | 5 mote, 3 brute, 2 warden, 2 barriers, 4 posts |
| 10 | f10 | Master | Master's Approach | 8 | 8 | 6 mote, 3 brute, 2 warden, 2 barriers, 3 posts |
| 11 | f11 | Master | Fang Gauntlet | 9 | 8 | 2 mote, 3 brute, 5 warden, 4 barriers, 2 posts |
| 12 | f12 | Master | Slingfang Master | 10 | 10 | brood, 4 warden, 1 brute, 2 mote, 4 barriers, 3 posts |

Formation Rush (hand-authored, back to back, own drops):

| # | id | set | name | par | combo |
|---|---|---|---|---|---|
| 1 | r1 | Open Field | Rush: Break | 3 | 4 |
| 2 | r2 | Canyon | Rush: Chute | 4 | 5 |
| 3 | r3 | Yard | Rush: Yard | 5 | 7 |
| 4 | r4 | Canyon | Rush: Vault | 6 | 7 |
| 5 | r5 | Master | Rush: Gauntlet | 7 | 9 |
| 6 | r6 | Master | Rush: The Master | 9 | 11 |

### Roster table

The active creature always sits in the centre base socket and launches from
there; the other two team members hold the flanking sockets and are the ones
you bump. Field posts in the Yard and Master sets hold the same team,
cycled.

| id | name | passive (while launched) | aura (on bump) | unlocks at |
|---|---|---|---|---|
| flint | Flintling | pierce: 2 damage, never ricochets off a foe | grit: next impact lands double | start |
| split | Splitmaw | split: first impact throws 2 splinters | rend: throws 4 splinters | start |
| pull | Pullpup | magnet: drags nearby foes into the line | tug: hauls nearby foes to the bump | start |
| mend | Mossmender | mend: every kill returns vitality | heal: +22 vitality | 3 cleared |
| spark | Sparkjaw | spark: each wall bank zaps the nearest foe | shock: 2 damage to everything nearby | 6 cleared |
| ward | Wardwisp | ward: recoil costs 60 percent less | shield: damage dampened 6s | 9 cleared |

Enemy families: mote (1 hp), brute (3 hp), warden (2 hp, only damageable on a
banked shot), brood (14 hp, sealed until every barrier is down). Multi-hp foes
carry a damage pip under the sprite; nothing about enemy health lives in the
HUD.

### Verification hook

`window.__sf.state` exposes mode, formation index/id/name, setId, roster,
team, active creature, vitality, combo, bestCombo, shots, freeShots, score,
enemiesLeft, barriersLeft, medals, maxCleared, aiming, launched, banked and
reducedMotion. `forceFormation(n)`, `forceRoster(id)` and `forceMode('rush' |
'campaign')` are readable and callable from the boot fallback (they queue into
PENDING) and from the live scene. `forceRoster` bypasses the progression gate
via a forceUnlock field that syncTeam() honours, so a test switch cannot be
undone by the next team rebuild. The hook reads the same preallocated pools
the renderer uses; there is no shadow list.

### Known-bug-class checks

Preallocated pools with no separate debug view; render state owned by the pool
entry, never stored on a shared entity; no DOM control handlers at all
(controls are drawn in Phaser and read from GGKit's pointer identity map, so
there is nothing to seed at claim time); no camera split; ES-style scene
prototypes rather than plain-config scenes; test switches readable from both
boot fallback and live scene; the sim is a clamped fixed-step accumulator with
max 3 substeps and every game clock advances inside the step, so a degraded
device goes slow-motion and never time-skips; every table lookup goes through
a guarded accessor with a fallback formation/creature/enemy; the coach strip
is a thin fading top-edge line; sw.js precaches only files verified to exist
on disk; the static world is baked into one canvas texture with no large
static Graphics anywhere; no Graphics.arc (rings are atlas frames);
setTextIfChanged plus a matching setTintIfChanged/setVisibleIfChanged guard;
arrow IIFEs closed as `})()` and boot verified by real parse; the draw path
does not rely on a 'postrender' event; no Container.add return value used as a
child reference; no Texture.add source-index misuse; `parent: document.body`
so the canvas actually mounts.

Three real bugs were found and fixed by browser verification rather than
reading: `setScale` after `setDisplaySize` collapsed the boundary banner panel
to its 4px source width and made it invisible; `textures.createCanvas` returns
null for a key already in the manager, so restarting the scene (mode switch,
test hook) threw on `getContext`; and ImageDraw in the asset builder replaces
destination pixels instead of compositing, which greyed every creature
highlight and hollowed out the particle cores.

### Verified

`node --check` clean on game.js, sf_data.js and sw.js. Booted in real Chrome
at 390x844 dpr 2 with zero console errors and zero failed requests across
boot, campaign, Rush, and a reload under prefers-reduced-motion. Driven
end to end: formation cleared, medal awarded and persisted, banner advance,
creature unlock fired at 3 cleared, vitality-out to retry with a restored
pool, keyboard launch, Formation Rush entry, and every world set loaded via
the hook. Gate results: 200, viewport 390, non-black frame, 668 distinct
colours in play (gate wants >64), payload 1011KB of 2500KB, largest file
317KB of 400KB, manifest and icons present, zero console errors, feel median
16.7ms at 4x throttle.

### Deferred

- **Feel spike gate not cleared on this box.** Median is 16.7ms (60fps) but
  the >33ms spike count is 61/600 against a budget of 6/600. This is
  environmental, not a title defect: the machine sat at load average 91 to 215
  during a fleet run, and the accepted flagship horde-meridian measured
  125/600 in the same window minutes apart, worse than this title. A CPU
  profile of the idle play frame put game.js at 0.8% of samples and the
  rasteriser at about 30%, and an in-page A/B showed the same spike floor with
  the scene paused and nothing visible. Needs a re-measure on an uncontended
  box before anyone treats it as a real number.
- **pwa_sw gate is false on localhost** by design; GGKit only registers the
  worker over https, so this needs the deployed URL to verify.
- Per-creature launch and impact animation is a three-frame state swap, not a
  tweened rig. A squash-and-stretch pass on the launch frame would add polish.
- The brood anchor has one behaviour (sealed until barriers fall). A telegraph
  and a second phase would make the finale land harder.
- No per-formation leaderboard or medal replay; only the best medal per
  formation and the two best scores persist.
- Formation Rush has no separate medal set; it scores only.

## Fix round 1

No Critical findings were listed by the review.

Fixed:

- Unbanked barrier contacts no longer count as real wall banks. Warden, brood, aura, and shard protection now share one damage gate.
- Added a short vitality invulnerability window with player blinking after damage.
- Combo now advances on destruction only, decays after a chain window, and multiplies kill score. Formation retries restore the score snapshot from formation start.
- Added a first-formation barrier micro-challenge and an onboarding line that teaches the wall bank.
- Clear banners now show TAP TO CONTINUE, and event chips wait until the tutorial strip has cleared.
- Added staged lethal enemy collapse and eased score popups.
- Aim bands now use the actual launch vector, and sub-minimum pulls hide the preview instead of failing silently.
- Boot-time mode, formation, and roster overrides are consumed before team synchronization. REPLAY FROM FIRST now describes the preserved progression behavior.
- Added brood cage-fall telegraphing and a post-unlock targeted volley.
- Campaign music intensity now follows danger thresholds instead of mode alone.
- Bumped the service worker cache version to 2026-08-11-aaa-fix1.

Rejected:

- Gamepad controls remain deferred because the scoped shared GGKit has no gamepad state API. Adding navigator polling or editing /play/_shared/ggkit.js would violate the title's GGKit-only input rule and the work-only-in-slingfang scope.
- Pointer cancellation remains deferred for the same shared GGKit boundary: its current public map removes both pointerup and pointercancel, so the title cannot distinguish them without a shared-layer API or a raw browser listener.

## Retina pass 2026-08-16

- Before ratio: 1.00x static FIT baseline from the 390x844 design backing store. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3, producing a 1170x2532 backing store for the 390x844 design viewport.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by `GGKit.hiDpi.factor(390, 844)`, shared `GGKit.renderDefaults` merged, and zoom applied in boot, menu, and play scene `create()` methods. All Phaser text uses the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3].
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.
