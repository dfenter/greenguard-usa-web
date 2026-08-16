# Touchline Eleven

Five a side arcade football. You defend the left goal and attack the right one.

Drag from the player on the ball and release to pass along that line; the
predicted receiver lights up before your finger leaves the glass. Swipe hard
toward the right goal to shoot, and the longer the swipe the more power. Curve
the swipe and the ball bends. Tap a team mate to take control of them. Hold the
sprint button to burst, and press tackle near their carrier, or hold it for a
slide.

Keyboard: arrows or WASD to run, Shift to sprint, J to pass, K to shoot, Space
to tackle, Q or Tab to switch player, P or Escape to pause, R to restart.

Win the season by taking twelve league fixtures and the knockout final. Quick
Match has four difficulty tiers across five grounds. Skill Drills are nine
timed rounds of target accuracy, dribble slalom and penalty shootout. Squad
players and medals are earned by playing, never bought.

## AAA rebuild

Rebuilt 2026-08-13 on Phaser 3 with GGKit as the sole implementation of
lifecycle, pause, rotate, pointer identity, saves, audio buses, loading and the
juice budget. The 2026-08-05 prototype is the design document: its tuned
constants, control grammar and content graph carry over, restaged from a 390 x
700 portrait board to a 960 x 480 landscape pitch.

### Implemented

| Area | What shipped |
|---|---|
| Engine | Phaser 3.87 from `/play/_shared/phaser.min.js`, absolute paths, `<base href="/play/touchline-eleven/">` |
| Lifecycle | GGKit pause/resume/restart, visibility pause, landscape rotate overlay, guarded save with schema validation (`v: 3`) |
| Control | Floating left stick, drag to aim, swipe to shoot, hold to sprint, tap a team mate to switch, tap or hold the tackle button for a standing tackle or a slide |
| Ball | Rolling resistance per ground, Magnus curve from swipe curvature, board rebounds, post strikes, body deflections, first touch weighted by technique |
| Keepers | Both goals have a keeper that projects the flight onto the goal line, commits, and either claims or parries; parried balls stay live |
| Shape | Roles are keeper, two backs, playmaker, striker; opposition styles are park, wing, press and counter; a faint offside line is drawn while we hold the ball and a forward pass to a player beyond the second last defender is whistled |
| Modes | Season, Quick Match, Skill Drills |
| Art | Every pixel baked into canvas textures at load or venue change: pitch, stands, crowd bands, floodlight pools, weather tint, markings, goal nets, four figure sheets, ball, HUD chrome, buttons, medals, crest, menu backdrop |
| Audio | Three looping music beds and fourteen distinct SFX, synthesized to 22 kHz mono WAV object URLs at load and played through the GGKit music and sfx buses |
| PWA | `manifest.json`, 192 and 512 icons, favicon, `sw.js` from `_shared/sw-template.js` with a precache list of files that all exist |
| Verify hook | `window.__te.state` (one preallocated record) plus `window.__te.forceMode` / `forceStage`, honoured at boot and live |

### Content

| Item | Count | Detail |
|---|---|---|
| Season fixtures | 13 | Twelve league games in rating order plus a knockout final at Aurelia Arena |
| Opposition clubs | 12 | Ratings 0.86 to 1.13, four AI styles, own kit colour plus a pattern |
| Venues | 5 | Ashfield Park (clear), Harbour Lamps (dew), Saltmarsh Reach (wind), Kestrel Hollow (rain), Aurelia Arena (cup final) |
| Weather effects | 4 | Ball roll retention 0.25 dry, 0.28 windy, 0.36 dewy, 0.44 wet; wind adds a slow lateral gust |
| Quick tiers | 4 | Friendly 0.80, Contested 0.96, Fierce 1.12, Elite 1.30 |
| Skill drills | 9 | Target accuracy, dribble slalom, penalty shootout, three rounds each, later rounds gated on clearing the one before |
| Squad | 8 | Five start named, Tamsin Vale at three league wins, Cobalt Reyes at fixture 7, Mica Thorne on reaching the final |
| Per season form | 8 | Drifts 0.85 to 1.15 on results, goals and clean sheets, and scales pace, power and technique |
| Medals | 4 tiers | Match medals by margin and clean sheet, drill medals by hits, lap time or penalties scored |
| Music | 3 loops | `anthem` (menus), `matchday` (league and quick), `pressure` (the final) |
| SFX | 14 | pass, kick, trap, tackle, slide, post, save, goal, concede, whistle, chip, tap, medal, unlock |
| Particle systems | 6 | Turf divots, contact sparks, shockwave rings, celebration confetti, sprint dust, venue weather |
| Player animation states | 6 | idle, three frame run cycle, kick, slide, cheer |

Time to exhaust: 13 season matches at three minutes is roughly 39 minutes, the
nine drill rounds add about eight, and Quick Match is unbounded. The first ever
match runs a five step interactive tutorial in the thin coach strip.

### Preserved prototype behaviour

- Ball rolling resistance is still `v *= pow(0.25, dt)` on a dry ground.
- Pass speed is the prototype's 240 base plus a 0.55 lead term toward the read
  receiver; shot power is still `350 + power * 50`. Both are multiplied by
  1.864, the ratio of this pitch's goal to goal run to the prototype's.
- Kick cooldowns 0.22 pass and 0.38 shot, carrier cooldowns 0.25 and 0.45.
- Possession is taken when the ball is slow and inside the pickup radius; the
  kicker cannot immediately re-collect.
- Swipe curvature is still the signed area accumulated along the drag path.
- Three minute matches, a goal restart pause, and no paid gate anywhere.
- Save data is still validated field by field and falls back to a clean file.

### UI noise law compliance

- One transient at a time. Corner chips queue, never stack, hold 1.0 s and fade.
- The 60 percent centre banner fires only at run boundaries: kick off, a goal,
  full time, a drill result.
- Coach text is a single line in a 40 px strip at the top edge that fades after
  three seconds.
- The persistent HUD is one broadcast band with score, clock, matchup and a
  stamina meter. There is no label where an icon or a bar already says it; the
  prototype's floating TIRED popup became the stamina meter.
- Effective text is 17 px or larger at the 844 x 390 reference frame, the two
  action buttons are 100 design units across (about 81 css px), and the thumb
  corners carry only controls.

### Known limitations

- The pitch is a five a side board: the touchlines rebound rather than putting
  the ball out for a throw. That is the prototype's behaviour and it keeps the
  three minute match moving.
- Offside is enforced on the pass that plays a team mate in, not continuously.
- Other clubs' league results are simulated from a seeded generator rather than
  played out, so the table moves deterministically for a given season.
- Audio is synthesized at load into object URLs, so nothing is cached offline by
  the service worker for it; the first frame after a cold offline load rebuilds
  the same buffers locally in about 200 ms.
- The design space is 960 x 480; a 4:3 tablet letterboxes top and bottom.
