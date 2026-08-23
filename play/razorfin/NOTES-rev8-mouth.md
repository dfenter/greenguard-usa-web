# Razorfin Rev 8 mouth pass

Date: 2026-08-23

The Rev 8 Round 2 blocker was the shared face read. The hull, crescent tail,
eye, and identity props were left alone. The mouth assembly now uses one
concave cavity with a low centre and lifted corners, individually placed upper
triangular teeth, and a belly-coloured lower jaw whose top edge is tucked into
the cheek. Tier 5+ keeps the existing articulated jaw object and animation
path; its contour is now a shallow U rather than a straight rail.

## Final mouth numbers

All pixel measurements below are projected at the measured 844x390 CSS
gameplay viewport. Tooth gaps are the model gap projected through the same
camera used for the 2x head crops.

| Row | Dark cavity / head height | Cavity / body length | Corner lift | Teeth | Gap |
|---|---:|---:|---:|---:|---:|
| reef | 44.6% | 0.132L | 0.048L | 7 | 2.1 CSS px |
| greatwhite | 40.6% | 0.132L | 0.048L | 7 | 2.4 CSS px |
| tiger | 40.5% | 0.132L | 0.048L | 7 | 2.3 CSS px |
| hammerhead | 43.0% | 0.132L | 0.048L | 7 | 2.3 CSS px |
| whaleshark | 40.4% | 0.152L | 0.056L | 8 | 3.6 CSS px |
| leviathanrex | 39.6% | 0.160L | 0.058L | 9 | 2.0 CSS px |

Regular rows use a 0.26L mouth, whale shark uses 0.50L, and leviathanrex uses
0.29L. Tooth white coverage remains 60.8-64.6% of the mouth span, with gaps
visible between every tooth in the 2x crops.

## Verification

- `node --check shark3d.js`
- `OUT=shotsM IDS='reef,greatwhite,tiger,hammerhead,whaleshark,leviathanrex' node sharkline.js`
- `node crop-heads-m.js` — final 2x head crops reviewed; all six read grin/open mouth before grille.
- `node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities` — all lanes pass.
- Direct jaw probe: greatwhite jaw rotation changed from `0` closed to `-0.306` anticipation-open and then `0.0154` during snap-close; the jaw remains an integrated belly wedge.

No commit or deploy was made.
