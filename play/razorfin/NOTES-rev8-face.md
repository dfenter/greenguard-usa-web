# Rev 8 face pass

Date: 2026-08-23

Scope: `shark3d.js` only, plus this audit. The canonical Rev 8 teardrop hull,
crescent tail, bend contract, and existing identity systems were preserved.

The required gameplay render loop was run after each face batch:

```sh
cd /Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin
OUT=shotsFace IDS='reef,tiger,hammerhead,greatwhite,whaleshark,leviathanrex,zeusfin,typhonmaw' node sharkline.js
```

The final captures are 844x390 CSS px at DPR 2. Head regions were cropped and
resampled to 2x for the close audit. The thumbnail proxy audit was also run
for all eight rows:

```sh
SOURCE=shotsFace THUMBS=shotsFace-silhouette-thumbs node silhouette-thumb-audit.mjs
```

## Changes

- Replaced the old tooth rail with a dominant dark, extruded mouth cavity. The
  cavity polygon has a 1.05x height envelope and raised corners; the grin line
  uses the same upward corner curve. The general mouth is `.26L`, kaiju is
  `.29L`, and whale shark is `.50L`.
- The mouth uses individually separated upper triangular teeth: 7 on the
  general face, 8 on whale shark, and 9 on kaiju. Their white span coverage is
  approximately `.835`, `.672`, and `.807` respectively. There is no flat
  white rectangle and no duplicate lower tooth row.
- Added a belly-colored lower-jaw wedge under the cavity. Tiered animated jaws
  are constrained to `.92` of the shared mouth width and `.60` of the mouth
  height, so they remain a shallow cheek continuation. The old dark jaw edge
  shell was removed.
- Rebuilt the eye as a shallow dome seated in a rounded dark cheek socket.
  Proud offset is `.012L`; iris diameter is `.52` of sclera diameter; the
  catchlight is `.16` of eye diameter; an integrated upper lid/brow overlaps
  the upper eye. No stalk or gap remains.
- Re-mounted the hammer foil as a tapered, screen-horizontal `.52L` span with
  `.12L` thickness and a rooted bridge. It sits above/behind the eye and no
  longer reads as a boxy snout extension.
- Replaced whale shark's vertical baleen fence with one curved lower baleen
  lip. The broad `.50L` feeding opening and 8 flank spots remain.
- Retained tiger's seven broad bands, kaiju spines, and pantheon props while
  ensuring the shared eye and mouth remain visible landmarks.

## Gameplay-distance face audit

Judgment is from neutral gameplay stills and 2x head crops, with UI and
ability FX ignored for the face call.

| Row | Honest result |
|---|---|
| `reef` | PASS. The black cavity, upward grin, seven separated teeth, socketed eye, and belly jaw are legible at gameplay distance. |
| `tiger` | PASS. Seven broad stripe bands remain visible; the common mouth and embedded eye are not replaced by the pattern. |
| `hammerhead` | PASS, qualified. The tapered forehead foil is visibly hammer-shaped in the thumbnail and no longer occludes the eye. It remains a deliberately graphic foil rather than a naturalistic hammerhead wing. |
| `greatwhite` | PASS, qualified. The open mouth and eye read first; the animated lower jaw now stays shallow and belly-colored under the cavity. |
| `whaleshark` | PASS, qualified. The broad feeding opening, spots, and single curved baleen lip survive; the former vertical grille/fence is gone. The wide lower jaw is intentionally prominent for the whale-shark feeding cue. |
| `leviathanrex` | PASS, qualified. The kaiju crown/spines remain loud, but the eye and mouth are still the first two face landmarks. |
| `zeusfin` | PASS. Crown/lightning identity remains visible without occluding the shared face. |
| `typhonmaw` | PASS. Storm-spine/dark-palette identity remains visible and the shared open-mouth/eye read survives. |

## Verification

- `node --check shark3d.js`: pass.
- Full suite: `world 195/195`, `game 282/282`, `art3d 7/7`, `fish 7/7`,
  `fx 0/0`, `ui 238/238`, `meta 170/170`, `abilities 0/0`.
- `gates3d.js`: `errs: []`; shelf and kaiju browser probes completed with
  welded geometry, bend, outline, draw, and resource gates green.
- Art3D selftest remained green across the full 85-definition roster, including
  the `<4600` triangle ceiling, winding/bend/outline contracts, and late-roster
  compact draw contract.

No git commit was made.
