# Orchestrator finding: Epaulette Shark thumbnail fails to bake on the FIRST screen

Evidence: qa/2026-09-17/playability/plainload_menu.png (the only real rendered
frame captured during this entire QA pass, from the cold plain-load probe).

## What is visible
In the Tier 1 row, three cards render:
  Reef Shark      correct 3D shark thumbnail
  Epaulette Shark a flat tan/gold tile reading "ES"
  Cookiecutter    correct 3D shark thumbnail

"ES" is the monogram placeholder, not art. ui3d.js:358-365 defines monogram(),
returning the first letter of each of the first two words. ui3d.js:708 renders
it into a card ONLY when S.thumbs[tk(id)] has no URL, meaning the 3D thumbnail
bake produced nothing for that shark. The surrounding comments (ui3d.js:716-725,
799, 847) confirm the design intent: bake a tiny 3D render per card, and never
let a bake failure break the menu, fall back to a tinted monogram.

So the fallback is working as designed. The defect is that it is being TRIGGERED
at all, for one shark, on the default first screen every player sees.

## Why it matters more than a one-card cosmetic bug
1. It is on the opening menu at tier 1, the first thing any player, and Dan,
   sees. Two neighbours bake fine, so the flat "ES" tile reads as broken.
2. It is the second cheapest shark (150 coins), so it is one of the first
   purchases a new player considers.
3. The data is NOT the problem. All three tier-1 sharks have well-formed sil
   entries. Epaulette uses model "whaler" with head "blunt" while both working
   neighbours use model "thresher". That correlation points at the whaler model
   or the blunt head path in the thumbnail bake, and it suggests every other
   shark using model "whaler" may be affected too, which was never checked
   because no harness existed to render the full roster.

## Status and next step
Confirmed from a real frame plus source. NOT root-caused. The obvious next step
is to render all 86 cards and count how many fall back to a monogram. That needs
the harness this gate could not run, which is exactly why "rebuild the harness"
is the top-ranked fix. A whole-roster monogram audit should be the first thing
the restored harness is pointed at.

## RESOLVED by orchestrator: this is DESIGNED behaviour, not a bug
I rebuilt a working harness (see ../harness/README.md) and measured the whole
roster live at ?unlockall=1. Findings, in order:

MEASURED: of 86 sharks, 32 bake a real thumbnail and 54 render a monogram.
That is 63 percent of the roster, far beyond the single card I first spotted.

ROOT CAUSE, measured not guessed: all 54 come back with
group.userData.rfWithheld === true. Exactly 0 are "loading", 0 error, 0 fail a
byte cap. The counts are 32 buildable / 54 withheld / 0 loading / 0 error.

WHY: shark3d.js:3756-3764. requestTemplate(base) deliberately returns null for a
textured base at the MENU, to protect the iOS texture-memory budget (the same
budget whose violation caused the 2026-08-19 iPhone crash). The code then hides
the placeholder and sets rfWithheld so that ui3d.bakeThumb() produces nothing
and the card falls back to its monogram. The comment block at shark3d.js:3749-3757
says so explicitly and even names this exact symptom: "the Epaulette Shark card
baked a yellow box", which is the very card I flagged. This was a KNOWN, FIXED
issue, and the monogram is the intended result.

So my earlier "whaler model" hypothesis was WRONG. The split is textured-vs-not,
not by mesh family. Retracted.

## What remains genuinely worth raising with Dan
The mechanism is correct and the iOS caution is right. The QUESTION is whether
the outcome is acceptable, and that is a judgement call, not a defect:

63 percent of the roster menu is flat two-letter monograms rather than sharks,
including the marquee names a player is working toward: Great White, Megalodon,
Tiger, Bull, Hammerhead, Whale Shark, Dunkleosteus. The roster screen is the
main expression of progression, the thing that makes a player want the next
shark. Right now most of it is typography.

That directly undercuts the "sense of growth" the fun lane rated weak, and it
is a plausible contributor to Dan's standing "static / atari-flat" complaint,
since the menu is the screen he sees first and longest.

Worth noting the tension: thumbnails are baked at a tiny 112x90 (ui3d.js:740),
which is exactly the "thumb variant" sizing introduced by the 2026-08-19 crash
fix (measured then at 29.8MB menu). The withholding is a SECOND, stricter layer
on top of that. It may now be over-conservative. A cheap middle path worth
testing: bake untextured or low-res geometry for withheld rows so the card shows
a shark silhouette rather than letters, at a fraction of the texture cost.

Status: fully root-caused, no code defect, open design question for Dan.
Evidence: qa/2026-09-17/playability/plainload_menu.png and the live roster
audit reproduced independently by the orchestrator.
