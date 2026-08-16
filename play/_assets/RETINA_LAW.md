# RETINA LAW

Owner bar delta, 2026-08-16, verbatim:

> "everything should be high resolution and more distinct colors no atari
> looking nonsense it is for iphones make the tech shine"

This law is MANDATORY for every title in the fleet and applies alongside
the art bible for the title's genre and alongside UI_LAW.md. It sits at the
same level as the CRUIS'N FLOOR AND CAR LAW in ART_vehicle3d.md: under the
floor is an automatic reject.

## What the measurement actually showed

Before writing this law the whole fleet was measured on an emulated
iPhone-class 3x display (`aaa/harness/retina_audit.mjs`, which reports each
canvas backing store against its CSS box, and counts distinct colours in a
real gameplay frame at full 8-bit precision).

The finding was not what the wording first suggests. Colour depth is
already good: sampled titles run from roughly 4,000 to 168,000 distinct
colours in a gameplay frame, and the flattest single colour typically holds
under 20% of the frame. There is no widespread flat-fill problem.

The actual defect is RESOLUTION, and it is universal. Not one sampled title
rendered at native density. Measured backing-store ratios were 1.0, 1.5,
1.85 and 2.0 against a device ratio of 3.0. Every title is therefore drawn
at between a third and two thirds of the panel's real pixel count and then
upscaled by the device.

That upscale is what produces the look being rejected. Stretching a 1x
frame onto a 3x panel softens every edge, turns fine gradients into visible
steps, and coarsens text and UI chrome. The complaint reads as a colour
complaint but the cause is pixel density, and adding more colours to an
upscaled frame will not fix it.

Two corrections worth recording, because both nearly became false findings:

- A landscape title measured in a portrait viewport shows GGKit's rotate
  gate, and that flat overlay reads as an art defect. Silkwind was briefly
  flagged as "flat, 85 colours" for exactly this reason; measured correctly
  it renders 52,306 colours. ALWAYS drive orientation from the title's own
  manifest.json, never from what the caller typed.
- A frame that is 95% or more a single colour is a loading or gate screen,
  not art. Report it as inconclusive. Scoring it as flat art is how the
  driftlands title screen once got recorded as gameplay evidence.

## The law

1. RENDER AT DEVICE PIXEL RATIO. The canvas backing store must be at least
   `cssWidth * min(devicePixelRatio, 3)`. Cap at 3: beyond that the fill
   cost buys nothing a human can see.

   - Three: `renderer.setPixelRatio(Math.min(devicePixelRatio, 3))`.
   - Phaser 3: the `resolution` config key does NOT do this. It was removed
     after 3.16 and is silently ignored. Size the game in device pixels and
     let CSS scale the canvas back to its intended layout size, so the
     backing store stays dense.
   - Whatever the mechanism, PROVE it: read `canvas.width` against
     `getBoundingClientRect().width` under an emulated 3x device. Assuming
     it worked is how the fleet ended up here.

2. BAKE TEXTURES AT DEVICE SCALE. Canvas textures baked at 1x and scaled up
   defeat requirement 1 for exactly the elements the player reads most,
   which is HUD chrome, panels and text. Bake at the device scale. This
   compounds with the existing BAKE BEFORE YOU BUILD law: bake at the right
   size, and finish baking, before constructing anything against it.

3. TEXT AND UI CHROME MUST BE CRISP. Text rendered into a 1x texture and
   upscaled is the single most visible tell. Vector text or device-scale
   baked text only.

4. HOLD THE COLOUR FLOOR. A gameplay frame should carry thousands of
   distinct colours, and no single colour should hold a large majority of
   it. Most of the fleet already clears this comfortably; it is written
   down so nothing regresses. Large flat single-colour fills are a defect:
   use gradients, subtle noise or dither to kill banding, and lighting that
   varies colour across a surface.

5. DO NOT PAY FOR IT IN FRAME TIME. Tripling pixel count is not free.
   Requirement 1 raises fill cost, so it pairs with
   `render:{antialias:true, antialiasGL:false}` (plain `antialias:true`
   requests MSAA and roughly tripled frame cost on a software rasteriser)
   and with the existing feel budget: 4x-throttle median under 17.5ms, no
   more than 6 frames in 600 over 33ms. A retina title that misses feel has
   traded one reject for another. If the two genuinely conflict on a given
   title, say so in NOTES rather than quietly failing one.

## Acceptance

`node aaa/harness/retina_audit.mjs <port> <slug>` reports `RET-OK` only
when the main canvas reaches the device ratio. `RET-1x` is a fail. Colour
readings marked `[NO GAMEPLAY FRAME - colour reading void]` are not
evidence either way and must be re-run against a real gameplay frame.
