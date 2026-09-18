# M0 font comparison and decision

Reference frame 390x844, hangar MODS tab, plus a 13px/12px glyph plate at 3x.

## Shots
- hangar_mods_chakra.png (Chakra Petch Bold)
- hangar_mods_rajdhani.png (Rajdhani Bold)
- hangar_mods_exo2.png (Exo 2 Bold)
- glyph_compare_13px.png (all three, 13px label copy + 12px micro + ambiguous-glyph row)

## Baseline problem
The inherited face (Kenney Future, CC0) is a squared pixel display font. At 13px it
renders X as H, so the CODEX tab literally read "CODEH", and its body blurbs needed
setScale shrink down to roughly 10px to fit. Both defects are visible in the
pre-change baseline.

## Result: DISPLAY = Chakra Petch Bold (OFL 1.1)
Chosen on the 13px plate. It has the largest x-height and the widest apertures of
the three, and it is the only candidate whose digit 1 carries a base serif, so the
Il1| run stays separable and O vs 0 stays distinct. Those are the glyphs that carry
gem costs and tier counts in the hangar, so ambiguity there is a real misread.

Rajdhani is rejected: it is a condensed face, and at 13px the Il1| run collapses into
four near-identical bars. It also sets much narrower, which reads cramped in a card.

Exo 2 is rejected as the runner-up: legible and close to Chakra, but slightly tighter
apertures and a weaker 1, with no offsetting advantage.

## Result: BODY = Inter Regular (OFL 1.1)
Inter is designed for UI at small sizes, has a tall x-height that pairs with Chakra,
and stays even in colour at 12px to 15px. IBM Plex Sans was subset as a fallback and
is not shipped.

Both faces are subset to ASCII plus the punctuation the game uses, instanced to a
single weight, and self-hosted as woff2. Licenses ship at assets/OFL-ChakraPetch.txt
and assets/OFL-Inter.txt and are recorded in LICENSES.md.
