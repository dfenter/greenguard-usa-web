# Beastbind Cards

Controls: drag a card from your hand onto the ACTIVE or a BENCH slot, or tap the
card then tap the slot. Drop an evolution onto its pre-evolution. Tap ENERGY then
a beast to charge it, tap an attack row to strike, tap RETREAT then a bench slot
to swap. Every play shows a Confirm and Cancel pair first, and UNDO takes back
anything you have done this turn before you attack. Tap any card twice to open its
full card sheet. Keyboard: arrow keys move focus, Enter or Space activates, U
undoes, E ends the turn, R restarts, Esc cancels or opens the pause menu.

Goal: knock out three beasts to take the prize markers and win the duel. Work up
the fifteen deck Gauntlet, replay any beaten deck in Quick Duel, or take a Draft
run. Packs are earned only by winning; nothing in this game is for sale.

## AAA rebuild

Implemented: a Phaser 3 portrait rebuild with GGKit as the sole lifecycle,
pause, rotate, save, audio and juice layer. The prototype's tuned constants and
content graph survive intact: 3 bench slots, 3 prize markers, 6 card opening hand
with a Stage 1 mulligan guarantee, one energy per turn, 6 energy cap, 12 card hand
cap, evolve only on a later turn than arrival, weakness doubling, bind immunity on
back to back turns, one pack per two wins, at most two copies of a card kept, a
third copy dusted, and five dust to claim any missing card.

New for the uplift: procedurally generated card art (a distinct original beast
silhouette per card with faction motifs), baked card faces at three sizes, a
fourth Storm faction, a fifteen deck Gauntlet, Quick Duel, a ten pick Draft mode,
three deck slots with a validating deck builder, an undo history, a Confirm and
Cancel pre-commit step on every play, legal target highlighting, drag with snap
targets, an animated attack resolution with floating damage counters and knockout
ghosts, five particle systems, three music loops, fifteen sound effects, an
interactive first run tutorial, and the `window.__bb` probe.

### Factions

| Faction | Colour | Beats | Weak to |
|---|---|---|---|
| Ember | orange | Thornwood | Storm |
| Tide | blue | Storm | Thornwood |
| Thornwood | green | Tide | Ember |
| Storm | violet | Ember | Tide |

### Content

| Content | Count |
|---|---:|
| Beast cards | 60 (20 lines of 3 stages) |
| Handler cards | 15 |
| Set total | 75 |
| Gauntlet decks | 15, ending in the champion Warden of the Bind |
| Deck slots | 3, 20 cards each, max 2 copies, min 6 Stage 1 |
| Draft picks | 10 picks of 1 of 3, 2 copies each |
| Modes | Gauntlet, Quick Duel, Draft |

### Gauntlet ladder

| # | Deck | Faction | Archetype | AI skill |
|---:|---|---|---|---:|
| 1 | Sprout Circuit | Thornwood | Swarm | 0.12 |
| 2 | Kindling Camp | Ember | Aggro | 0.20 |
| 3 | Gale Scouts | Storm | Tempo | 0.28 |
| 4 | Bramble Wardens | Thornwood | Tank | 0.34 |
| 5 | Emberfall Rush | Ember | Ramp | 0.40 |
| 6 | Riptide Syndicate | Tide | Disrupt | 0.46 |
| 7 | Voltmane Circuit | Storm | Spread | 0.52 |
| 8 | Deepwater Vigil | Tide | Control | 0.58 |
| 9 | Sootclaw Bruisers | Ember | Midrange | 0.62 |
| 10 | Thornspire Order | Thornwood | Bomb | 0.66 |
| 11 | Skysear Vanguard | Storm | Burst | 0.72 |
| 12 | Rimehold Wardens | Tide | Lock | 0.78 |
| 13 | Aurorine Choir | Storm | Bind | 0.84 |
| 14 | Ashen Congress | Ember | Grind | 0.90 |
| 15 | Warden of the Bind | All | Champion | 1.00 |

Each rung posts its archetype tell before you accept the duel. AI skill gates how
reliably the opponent takes its best line: lethal detection, evolution timing,
energy targeting on the beast closest to a knockout, conditional handler use, and
whether a bomb deck holds a turn for the bigger swing.

### Audio inventory

- Music: `theme_bind` (menus), `theme_duel` (rungs 1 to 14), `theme_champion`
  (the final rung). All lazy loaded, nothing fetched before first interaction.
- Effects: tap, deal, place, energy, hit, crit, ko, retreat, undo, error,
  fanfare, defeat, pack, reveal, rare. Fifteen distinct cues, all MP3.

### Progression and economy

Packs hold 5 cards with posted per slot rates (cards 1 to 3 Common; card 4
Uncommon 75 percent, Rare 25 percent; card 5 Common 50, Uncommon 32, Rare 18).
The odds panel is reachable from the main menu and sits on the pack screen
itself. One pack per two wins, one more for each first clear of a rung, two more
for a completed three win draft run. A third copy of a card becomes one dust and
five dust claims any single missing card, so the 75 card set closes out
deterministically rather than by luck alone. There is no purchase surface of any
kind and no currency that can be bought.

### UI noise law compliance

One transient at a time: the banner, the corner toast and the coach strip are
mutually exclusive and the banner only fires at duel start and duel end. In play
events use a single 30 px corner chip, never a centre banner. The pending play is
shown in the existing centre turn chip rather than adding a new panel. The coach
strip is a 34 px single line under the HUD that fades after about 3 seconds. Hand
cards deliberately carry no fine print: at 78 px wide nothing could reach the 14 px
floor, so the readable copy lives on the active card's attack buttons (50 px tall)
and in the tap to inspect card sheet. Every touch target is at least 44 px, the
lower edge belongs to the hand, and the middle of the board stays the game.

### Save data

`gg-beastbind-cards` holds version, wins, losses, ladder rung, per rung cleared
flags, dust, packs, the collection map, three deck slots, the selected slot,
tutorial step, and draft records. Every field is range checked and every card id
is validated against the card registry before the save is accepted; a failed
check falls back to a fresh profile rather than a broken one.

### Preserved defect fixes

- Pointer press and release are matched by a stable zone key, never object
  identity, because hit zones are rebuilt on every render.
- Pooled UI objects stamp their draw index as depth and the layer sorts once per
  render, so reuse order can never put a panel over its own label.
- No Phaser Graphics object exists in this title. Board chrome, plates, rings,
  orbs, card faces and icons are baked canvas textures; bars are a tinted single
  pixel. Nothing replays a command list per frame and no `Graphics.arc` is used.
- Keyboard edges are bound on window after GGKit is created, so the kit's own
  listeners are never clobbered. Pointer identity is left entirely to Phaser and
  `kit.input.pointers` is never read.
- Card face textures are pre-baked for both decks at duel start and kept in an
  LRU; any pooled image pointing at an evicted texture is parked on the 1 px
  fallback first, so a removed texture is never referenced.
- A knockout can leave a promotion pending during the opponent's turn, so
  promotion has its own input gate separate from the normal turn gate.
- The service worker precache lists only files that exist in this directory.
- Every keyed lookup against dynamic content (card ids, ladder rungs, handler
  effects, evolution chains) has a guarded fallback.

### Verification run in this environment

`node --check` passes on cards.js, engine.js, game.js and sw.js. The title was
booted headless at 390 by 844 with device pixel ratio 2 and driven through a full
duel with synthetic taps: placement, benching, energy attachment, the confirm
step, attacks, opponent turns, knockouts and the result screen all resolve with
zero console errors and zero failed requests. The `window.__bb` probe reports
mode, screen, rung, turn, prize markers, both active health values, collection
size, dust and packs, and accepts `forceMode` (menu, ladder, duel, quick, draft,
packs, collection, deck) plus `forceStage`.

### Deferred

- The 4x CPU throttle frame trace and the deployed URL gate belong to the
  orchestrator's harness run; they were not executed from this lane.
- Draft runs use the ladder decks as opponents rather than drafted opponent
  decks, which keeps the run difficulty legible against the posted tells.
