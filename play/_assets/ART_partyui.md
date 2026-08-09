# AAA Art Bible — Party / UI-driven lane (Rev 1, 2026-08-06)

Titles: Shout It!, Blockborough. Engine: Phaser 3 (Shout It! may ship as
DOM+CSS with Phaser only for confetti/FX if that is cleaner; UI quality
is the product in this lane).

## Look

- Shout It!: bold flat design, oversized rounded type, one loud accent
  color per team, card-deck metaphor with real card physics (drag
  resistance, snap, flip). Confetti burst on correct guesses, full-screen
  color washes on round transitions, circular buzzer timer that squeezes
  and reddens under 5 s. Kenney ui-pack + interface-sounds. Typography:
  system-ui heavyweight is acceptable but must be SET (sizes/weights/
  letter-spacing on a scale), not browser-default.
- Blockborough: cozy iso/ortho tile city: Kenney tiny-town buildings
  (recolored to a pastel-dawn palette), soft drop shadows, day/night
  tint cycle, animated citizens/cars as ambient dots with purpose,
  smooth zoom/pan with inertia. Build placement gets a ghost-preview +
  valid/invalid tint + satisfying place *thunk* (scale-pop + dust puff +
  sfx). Data panels styled as rounded cards with tick-up counters and
  sparkline trends, never raw text dumps.

## Feel (gate-checked)

- Every tap has a response within 1 frame: press-down scale (0.96),
  release pop. UI slides ease-out cubic; celebration pops ease-out back
  (house rule 2).
- Shout It!: pass-the-phone handoff screen with rotate-to-face animation;
  score reveal staggers per team with drumroll.
- Blockborough: milestone celebrations (population thresholds) with
  banner + confetti; disaster/deficit warnings pulse amber, never modal
  spam.

## Audio

- Shout It!: buzzer, tick (accelerating), correct/skip stingers, round
  fanfare, crowd murmur bed (music-jingles + casino-audio sets).
- Blockborough: calm builder loop (freepd ambient), place/demolish/coin
  SFX, day-night transition chime. >=8 SFX each per gate.

## Per-title notes

- Shout It!: 261 original phrases carry over; add >=4 themed decks with
  deck-select art to hit the content gate (>=20 min). Phrase content
  stays original, no licensed catchphrases.
- Blockborough: balance proven to 5000 pop in prototype; carry the sim
  constants; content gate met via milestone ladder + 3 map layouts +
  unlockable building tiers.

## casino, card and idle addendum

Applies to Vault Raiders, Meadow Solitaire, Lantern Bingo, Slice Rush, and
Sporeling Saga. All machines, cards, characters, odds panels, reward language,
and effects are original IP. The UI may be celebratory, but it must remain
truthful, legible, and comfortable for long mobile sessions.

### Trustworthy odds and celebration

- Post every relevant probability before the action: RTP where applicable,
  reel or spin odds, raid outcome odds, pull or forage odds, and whether a
  result is guaranteed, seeded, or skill-dependent. Use plain labels and show
  the denominator or percentage at the point of choice. The odds panel is
  part of the play screen, not buried in credits or settings.
- Near-misses are neutral information. Do not slow, brighten, or frame a loss
  to imply that it was almost a win unless the posted rules define a real
  near-miss state. Never add a false second chance, fake scarcity, or urgent
  purchase prompt after an unlucky result.
- Celebration is proportional to the real outcome. A completed bingo, cleared
  tri-peaks board, meaningful race win, or posted top-tier result can earn a
  full fanfare. A routine collection, small profit, or ordinary idle tick gets
  a compact pop and sound. A loss does not receive win colors, win language,
  or a confetti burst.
- Play-money and progression currency are labeled clearly. Reward screens
  show the actual result, the new total, and the next available action. Give
  players a skip or reduced-motion path for repeated result animations.

### Card faces and backs

- Every card face uses a fixed template: large corner rank or value, clear
  suit or category mark, one central illustration or symbol, and a small
  state badge only when needed. Keep the value readable at the smallest
  intended phone size and maintain a generous touch-safe margin.
- Card backs use a reversible original pattern with no rarity, value, or
  orientation clue. A face-down card must look identical before and after a
  shuffle. Do not use licensed suits, characters, or recognizable branded
  layouts as shortcuts.
- Flip, deal, drag, and snap animations preserve the card's leading edge and
  final resting place. Do not spin cards so quickly that the player loses
  track of identity. Tri-peaks stacks keep visible ranks and playable states
  separate from the decorative meadow layer.
- Bingo cards in Lantern Bingo use the same grid grammar from deal to daub:
  readable numbers, clear marked states, and one unambiguous pattern goal.
  The title's art accent can change by room, but text hierarchy, icon
  placement, and confirmation behavior stay stable.

### Idle numbers and progress

- Idle games use one aggregate number per meaningful collection interval,
  such as +1,240, rather than a stream of tiny digits. Cap simultaneous
  number popups, combine rapid ticks, and let the player inspect the ledger
  for detail. Number fountains are reserved for a real milestone and remain
  short enough not to cover the station, hero, or action button.
- Automation is shown through the world. Staff, stations, crates, fields, or
  companions visibly perform the earned work. A bar or timer states its rate,
  cap, and next threshold; never hide a multiplier inside decorative motion.
- Long-play screens keep a quiet baseline motion and one active focal beat.
  Use staggered counters, soft pulses, and short collection arcs instead of
  constant confetti, flashing borders, or rapid screen-wide number showers.

### Prestige and reset moments

- Before prestige or reset, show a plain summary of what leaves, what stays,
  what is gained, and why the next run is different. The confirm action is
  explicit, reversible until committed where practical, and never disguised
  as a routine collect button.
- The committed reset gets a distinct but calm identity beat: archive the old
  run, reveal the retained legacy, then introduce the new multiplier, tier,
  or branch. Celebration may use a banner, emblem, and short fanfare, but it
  must not imply that erased inventory was a new reward.
- After the reset, return the player to a useful screen with the first next
  action visible. Persist the result through GGKit save validation and keep
  the prestige language consistent in menus, tooltips, and audio.

### Per-title emphasis

- Vault Raiders: show spin and raid odds before both actions, and keep a bot
  raid result visually distinct from a jackpot-style spin result.
- Meadow Solitaire: card faces, deal state, solvability notice, and meadow
  growth reward must remain separate layers; a gamble deal is labeled before
  play.
- Lantern Bingo: card grids, daub streaks, power-ups, and room wins use clear
  pattern states, with a full celebration reserved for an actual bingo.
- Sporeling Saga: forage choices and evolution branches show their odds or
  requirements, while idle progress stays visible as a bounded graph.
- Slice Rush: profits arrive as an aggregate station report, and automation
  prestige shows the floor change before the celebratory reset beat.
