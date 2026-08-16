# AAA Art Bible — Arcade 2D lane (Rev 1, 2026-08-06)

Titles: Horde Meridian (pilot), Skyfall Command, Ace Vector, Lunker Lake.
Engine: Phaser 3 (vendored). House motion language applies; this is the
JUICE lane — these genres live on feedback density.

## Look

High-contrast neon-on-dark for the action titles, painterly-calm for
Lunker Lake. Every frame must clear the >64-distinct-color gate through
gradients, glows, and particle color ramps, not noise.

- Horde Meridian: dark ground with subtle tile texture, neon
  enemies/projectiles with additive glow (Phaser ADD blend), XP gems
  with bloom-like pulse. Kenney pixel-shmup + particle-pack sheets,
  recolored. Enemy waves must read by silhouette + color family.
- Skyfall Command: night-city skyline silhouette layers (parallax),
  MIRV trails as tapered additive ribbons, explosions as the hero VFX:
  multi-stage (flash, fireball ramp, ring, smoke puffs, screen shake).
  Kenney particle-pack.
- Ace Vector: clean vector-glow dogfighting: ships as crisp sprites with
  engine trails, tracer fire, lead-pursuit indicator styled as HUD
  glass; clouds as soft parallax billboards.
- Lunker Lake: the outlier: warm dawn palette, layered water with
  animated specular ribbons, depth gradient underwater, fish from Kenney
  fish-pack, line tension rendered as a bending rod + taut-line shimmer.

## Feel (gate-checked)

- Hit-stop + shake on every kill class; bigger for elites/bosses (house
  budgets). Enemy death = flash + burst + score popup (ease-out-back).
- Player damage: red vignette pulse + brief invulnerability blink.
- Waves/levels announced with slide-in banners; combo/multiplier chips
  animate on change.
- >=2 particle systems per title is the floor; this lane should run 4-6
  (pooled, Phaser particle emitters).

## Audio

Action titles: driving electronic loop + intensity layer that fades in
above a danger threshold (ggkit music crossfade between stems). Lunker:
ambient lake loop + reel clicks + splash + catch fanfare. SFX >=8 each.

## Per-title notes

- Horde Meridian (PILOT, sets the 2D bar): prototype draft-upgrade
  system + gem cap logic carried verbatim; uplift = sprite fleet, glow
  rendering, upgrade-card UI with real layout/art, boss telegraphs.
- Skyfall Command: queued-fire race fix from run 1 must survive the
  rebuild (regression-check in review).
- Ace Vector: health-underflow fix likewise.
- Lunker Lake: touch ownership + save validation fixes likewise.

## sports note

Applies to Touchline Eleven and Pennant Nine. Keep the pitch, court, and
diamond palette calm enough for original team colors to read. Use team color
on jerseys, player rings, roster chips, and scoreboard marks, then pair it
with numbers, silhouettes, or patterns so team identity never depends on
color alone. Field lines, bases, goals, and the ball get a high-contrast
neutral treatment that remains visible under stadium tint and celebration
effects.

The ball is always the first moving object to find: give it a clean outline,
short contact shadow, and a restrained speed trail only during fast travel.
Do not bury it under player glows, grass particles, or crowd effects. Frame
the safe-area HUD like a compact broadcast package with score, clock or
inning, period state, and the current matchup in a stable top band. Keep the
playfield open; momentary callouts can slide in below the band and clear
quickly. Crowd, flags, stadium lights, scoreboard panels, and contextual
chants provide ambience and juice, but never change the gameplay read or
pretend an ordinary play was a championship moment.

---

## RETINA LAW APPLIES (owner bar delta 2026-08-16)

"everything should be high resolution and more distinct colors no atari
looking nonsense it is for iphones make the tech shine"

See play/_assets/RETINA_LAW.md, which is MANDATORY and sits at the same
level as this bible. Headline: the fleet was measured on an emulated 3x
iPhone display and NOT ONE title rendered at native density (ratios of 1.0
to 2.0 against a device ratio of 3.0). Colour depth is already good fleet
wide; the defect is pixel density, and the upscale is what makes the art
look coarse. Render at min(devicePixelRatio, 3), bake textures at device
scale, keep text vector or device-scale baked, and do not pay for it in
frame time.
