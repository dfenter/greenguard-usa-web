# Razorfin Rev 8 adversarial art review

Date: 2026-08-23

Evidence reviewed: the supplied `shots8` gameplay renders for `reef`, `tiger`,
`hammerhead`, `greatwhite`, `whaleshark`, and `leviathanrex`, plus valid-ID
pantheon spot checks for `zeusfin`, `poseidonrex`, `hadesmaw`, `athenajaw`,
`heracrown`, and `typhonmaw`.

## Verdict

**REWORK - do not ship the Rev 8 shark art yet.**

The restart succeeded at the hull level. These are no longer pointed
racecars or boats: the shared body has a chunky teardrop mass, a blunt front,
a readable forked tail, and saturated body families. The measured hull ranges
in `NOTES-rev8-restart.md` also sit inside the Rev 8 proportion gate.

The face still misses the game's most important visual bar. Across the set,
the eye is a pale sphere that sits proud of the head like a googly or stalked
part, and the white tooth strip is a flat rectangle with evenly spaced dark
slots. At gameplay distance that strip reads as a grille, zipper, or bumper
before it reads as a mouth. The separate lower jaw and special front props
then make the animal feel assembled from parts. Color and pantheon props are
often distinct, but they cannot rescue a shared face that fails the one-second
cartoon-shark read.

This is a focused face and attachment rework, not a request to restart the
canonical hull again.

## At-a-glance shot audit

Legend: `PASS` clears the visual bar, `PARTIAL` is recognizable but not robust,
and `FAIL` breaks the gameplay read.

| Shot | At a glance: cartoon shark or something else? | Fat teardrop mass | Blunt snout | Grin + tooth band reads as mouth | Eye reads as charming cartoon eye | One coherent animal | Species / pantheon identity |
|---|---|---:|---:|---:|---:|---:|---:|
| `reef` | **PARTIAL** - shark body, toy/robot face | PASS, lower edge | PASS | **FAIL** - grille strip | **FAIL** - detached googly unit | PARTIAL | PASS as baseline shark, face weakens it |
| `tiger` | **PARTIAL** - green shark body, mechanical fish face | PASS | PASS | **FAIL** - grille strip | **FAIL** - detached googly unit | PARTIAL | PARTIAL/PASS - broad stripes survive |
| `hammerhead` | **FAIL** - box-nose shark/boat rather than hammerhead | PASS | PARTIAL - blunt but prop-led | **FAIL** - grille strip | **FAIL** - detached googly unit | **FAIL** - foil reads as a front block | **FAIL** - hammer cue is not screen-legible |
| `greatwhite` | **PARTIAL** - shark outline, robot-toy face | PASS | PASS | **FAIL** - grille strip | **FAIL** - detached googly unit | PARTIAL | PASS as generic shark, weak great-white character |
| `whaleshark` | **PARTIAL** - whale-shark bulk with bumper-like mouth | PASS, heavy row | PASS | **FAIL** - grille strip | **FAIL** - detached googly unit | PARTIAL | PARTIAL - bulk and spots survive, feeder mouth does not |
| `leviathanrex` | **PARTIAL** - kaiju fish/armored monster; shark is secondary | PASS, heavy row | PASS | **FAIL** - grille strip | **FAIL** - detached googly unit | PARTIAL | PASS as kaiju identity, PARTIAL as shark identity |

The fresh pantheon checks show that color and contour props are present: the
lightning/crown, water spots, void treatment, hammer treatment, and kaiju
spines are not disappearing. They are not a ship pass because several props
compete with or replace the face, and the shared mouth/eye failure remains on
every pantheon row.

## Rev 8 gate status

- **Canonical body:** PASS at the silhouette level. The body is materially
  fatter and rounder than Rev 7, with a full belly and no pointed prow read.
  Keep the current shared hull; do not solve this by making each head a new
  hull archetype.
- **Tail:** PASS in the supplied stills. The caudal silhouette now has two
  lobes and a concave notch at gameplay scale. Do not regress the welded,
  crescent-tail proportions while fixing the face.
- **Color and pattern:** PASS overall. Tiger bands and the special-row color
  families survive without relying on the ability button.
- **Face:** FAIL. This is the blocking gate.
- **One-animal integration:** PARTIAL. The jaw, tooth strip, eye mount, and
  hammer/kaiju props still read as attached pieces in the front third.
- **Motion:** not rescored from these stills. The prior Rev 7 motion evidence
  remains a separate gate; this review is rejecting the static gameplay read.

## Numbered blockers and numeric prescriptions

### 1. Rebuild the tooth strip into an unmistakable open mouth

**Observed:** Every shot uses the same straight white band with dark
rectangular interruptions. It looks like a vent, zipper, or bumper. The lower
jaw is a separate hard-edged slab, so the viewer does not see a dark mouth
cavity with a grin.

**Prescription:** Keep the mouth underslung, but make the cavity the dominant
shape:

- Mouth opening width: `0.20-0.30L`.
- Visible dark cavity height: `0.10-0.16L`; the cavity must occupy at least
  `60%` of the mouth interior in the neutral frame.
- Corners must turn upward by `0.03-0.05L` so the read is a grin, not a slot.
- Use `6-10` individually separated triangular teeth. Each tooth should have
  a visible gap; white tooth pixels should cover `60-85%` of the mouth span,
  never a solid rectangular rail.
- At the `844x390` gameplay baseline, the cavity must survive at a minimum of
  `24 CSS px` wide by `8 CSS px` high, with no tooth or slot smaller than
  `2 CSS px` in its primary direction.
- The lighter lower jaw must overlap the cheek by at least `0.08L`, sit
  `0.04-0.09L` below the cavity, and read as belly material rather than a
  black-edged attachment.

**Acceptance:** In a neutral still with UI and ability FX ignored, a reviewer
must call the feature a mouth/grin before calling it a grille or zipper.

### 2. Anchor the eye in the head instead of mounting a googly sphere

**Observed:** The eye is large enough to notice, but the pale sphere and its
connector sit outside the cheek volume. It has charm as a prop, not as a
cartoon shark eye. The same defect appears in the baseline and pantheon rows.

**Prescription:** Preserve the exaggerated eye, but give it a socket and a
face relationship:

- Near-eye diameter: `0.10-0.14L`, projecting to `10-18 CSS px` at the
  gameplay baseline.
- Iris diameter: `0.45-0.55` of the sclera diameter; retain a catchlight at
  `0.12-0.20` of the eye diameter.
- Embed the eye into a rounded cheek socket. Any visible stalk/connector must
  be at most `0.015L` and at most `2 CSS px`; no visible gap may remain between
  socket and eye.
- Put a small brow or upper-lid overlap across `10-20%` of the eye so it is
  anchored to the head and aimed slightly forward, not floating on a pole.
- Keep the eye on the head side, above the mouth corner, with the front third
  of the body remaining a continuous dome around it.

**Acceptance:** At one-second gameplay glance distance, the eye must read as
a charming embedded cartoon eye, not a googly ornament or a sensor mounted on
the hull.

### 3. Integrate the jaw, cheek, and front props into one animal

**Observed:** The body is now one coherent mass, but the face is not. The
lower jaw is a rectangular block, the mouth rail floats above it, and the eye
mount is detached. On `hammerhead`, the forehead foil reads as a boxy prow.
These hard-chine and attachment cues recreate the old boat/vehicle failure in
the most visible part of the shark.

**Prescription:**

- Keep the first `0.30L` as one rounded head/cheek volume. No flat front chine
  may run longer than `0.10L`.
- The jaw and cheek must overlap by at least `0.08L`; at rest, no visible
  separation or background slit may exceed `1 CSS px`.
- Keep the shared mid-body cross-section round-to-oval with
  `radiusZ >= 0.80 * radiusY`; retain the thick peduncle join at
  `>= 0.10L`.
- Limit the contour outline to a `1-2 CSS px` edge. It must not fill the
  underside of the jaw or tail and create a second dark object.
- Keep pectorals in the `0.10-0.14L` range and use the same resolved body
  palette family for jaw, fin, and tail accents. Do not let a prop become a
  second hull.

**Acceptance:** A small silhouette thumbnail must trace one continuous animal
from tail through cheek and jaw, with no detachable block at the face.

### 4. Restore the species and pantheon cues without sacrificing the face

**Observed:** Tiger is close: its broad stripes survive. Whale bulk and
spots survive, and the pantheon spot checks retain strong color/crown/spine
identity. `hammerhead` is the clear failure: its foil collapses into a
rectangular front extension instead of a hammer silhouette. `leviathanrex` and
the pantheon kaiju rows are identifiable as monsters, but their spikes and FX
can overpower the shared shark face.

**Prescription:**

- Hammerhead: make the screen-horizontal foil span `0.42-0.56L`, thickness
  `0.10-0.16L`, and overlap the head by at least `0.12L`. It must sit across
  the forehead/side behind the eye, not terminate as a box at the snout.
- Whale shark: keep the front head at `1.4-1.7x` the Great White head height,
  with a feeding opening of `0.50-0.60L`; retain `6-10` visible flank spots
  with at least `0.25` value contrast from the flank.
- Tiger: preserve the current seven broad bands; each should remain
  `0.045-0.060L` wide with at least `0.25` flank-to-mark value contrast.
- Pantheon rows: each primary identity cue must remain at least
  `18x10 CSS px` and `2%` of visible hull area in a neutral still, without
  ability FX. No identity prop may occlude more than `25%` of the eye or mouth
  region. Keep the face contrast at least `0.25` in value from adjacent prop
  material.
- Kaiju crown/spines may be loud, but the eye and mouth must remain the first
  two face landmarks. Do not use emissive bloom to hide a weak base mesh.

**Acceptance:** At a `128 CSS px`-wide silhouette thumbnail, the hammer still
looks hammer-shaped, the whale still looks broad-mouthed, tiger still looks
striped, and pantheon rows retain their hero cue while the shared eye and
mouth remain readable.

## Ship criteria for the next art review

Re-submit neutral gameplay stills at the same camera and scale. The next pass
ships only when all of these are true:

1. All six supplied rows pass the one-second cartoon-shark read.
2. The mouth is called a grin/mouth, not a grille, by an adversarial reviewer
   in every still.
3. The eye is embedded and charming in every still, with no visible stalk or
   detached socket.
4. The current canonical body and crescent tail remain intact.
5. Hammerhead, Whale Shark, Tiger, and the pantheon hero cues survive a small
   silhouette thumbnail without ability FX.

## Round 2 verdict

**REWORK**

The single remaining ship blocker is the shared mouth read. In the fresh
neutral gameplay stills, the black opening and white triangular teeth still
collapse into a shallow, straight tooth band; at a one-second glance it can
still be called a vent or grille before it is called an open grin. That fails
the mouth criterion and keeps the face from clearing the cartoon-shark read.

**Narrow prescription:** keep the current hull, crescent tail, eye, and
identity treatments; rework only the mouth assembly. Make the dark cavity
visibly taller and curve both corners upward, inset 6-10 individually
separated triangular teeth inside it with gaps visible at 844x390 gameplay
scale, and tuck the belly-colored lower jaw into the cheek so the result is
one open grin rather than a straight rail over a detached slab. Re-submit the
same neutral rows and pass only when every mouth reads as a grin before a
grille in a one-second glance.

## Round 3 verdict

**SHIP**

The mouth-only blocker is cleared. In all six neutral gameplay rows, the dark cavity
reads as an open grin before a grille: the corners lift, the opening has visible
height, and the individually separated triangular teeth remain legible at gameplay
scale. The reef head crop confirms the same read at close range.
