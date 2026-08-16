# UI Noise Law (owner directive 2026-08-10, applies to EVERY /play title)

Owner verdict on the fleet: "way too many banners and text on the screens,
you can't see anything." Screen real estate belongs to the GAME. Text and
banners are seasoning, not the meal.

## The rules

1. ONE transient element at a time. Banners/toasts/callouts queue; they
   never stack or overlap. A new one replaces or waits, never piles on.
2. During active play, transient UI covers at most 10 percent of the play
   area. The 60-percent-width center banner is BANNED during live gameplay;
   center-stage banners are allowed only at run boundaries (run start
   countdown, run end, medal ceremony, level clear).
3. In-play events (pickup, combo, unlock progress, wave change) use small
   corner/edge toasts or chips near the relevant HUD element: max ~24px
   text height, max 1.0s hold, fast fade, reduced-motion aware.
4. Persistent HUD: one compact primary line or corner cluster. Icons and
   meters over words. No label text where an icon or bar already says it.
   If a label repeats every run (SCORE, FUEL), shrink it or drop it.
5. Tutorial/coach text: one thin strip (max ~48px) at the top edge, one
   line, fades to near-transparent after ~3s. Never centered, never
   covering controls, never more than one concurrent instruction.
6. No always-on flavor text, watermark taglines, or mode descriptions
   during play. Menus can breathe; gameplay cannot.
7. Every removal keeps the INFORMATION if it matters: fold it into an
   existing meter, icon state, or the pause/results screens.

## Mobile first (these games are PHONE games)

8. Design and judge every screen at 390x844 portrait or 844x390
   landscape, dpr 2, with THUMBS ON THE SCREEN: assume the bottom
   corners and lower edge are covered by the player's hands. Nothing
   informational may live under the thumb zones or within ~16px of
   touch controls.
9. Small screen means the 10 percent transient budget is a hard cap,
   not a target. If in doubt, cut it.
10. Text sizes: minimum ~14px effective (28px at dpr 2) for anything
    the player must read; anything smaller is decoration and should
    probably be deleted. No paragraphs during play, ever.
11. Respect safe-area insets (notch, home bar). HUD hugs the top edge;
    controls hug the corners; the middle of the screen belongs to the
    game.
12. Touch targets stay >=44px even after decluttering; shrinking UI
    never shrinks hit areas.

## Test

Screenshot any 10 random seconds of active play: a player should be able
to see the playfield, their avatar, and threats with nothing important
occluded. If a screenshot looks like a UI demo, it fails.

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
