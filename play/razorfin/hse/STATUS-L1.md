# L1 status

Lane: HSE Rev 14 identity shader layer.
Code: `hse/skin_identity.js` plus one import and one call-site hook in `shark3d.js`.

Milestones:

- [x] Read `NOTES-rev14-textured.md`, the full textured path in `shark3d.js`, and `tools/gen_data.py`.
- [x] Added composable identity GLSL and uniform builders keyed by pattern, class, tier, palette, bind-up, and body axis.
- [x] Added hard countershade, procedural stripes/spots/rings/scars/plates, class glow seams, eye tint uniform, and atomic pulse uniform.
- [x] Preserved the existing `:rf-tex1` hook and bind-space varying by wrapping `onBeforeCompile`.
- [x] `node --check hse/skin_identity.js` and `node --check shark3d.js` pass.
- [x] Headless identity gate: 86 rows inspected, 41 textured rows, 41 shader hooks checked, 20 identity uniforms each, 0 identity failures.
- [x] Headless budget gate: max 4 draws and 2,791 triangles, under 100 draws and 55,000 triangles.

Requested selftests:

- `fish`: pass, 8/8
- `meta`: pass, 192/192
- `ui`: pass, 252/252
- `game`: pass, 381/381
- `art3d`: blocked by shared `sawshark` routing carrying a non-textured prop
- Additional all-row build probe: two shared L2 morph-bound failures, `voltaicrex` and `cerberusjaw`

Visual gate:

- The provided CDP lineup script could not bind its localhost server because the managed shell returns `listen EPERM` on both `0.0.0.0` and `127.0.0.1`.
- In-app Browser fallback was unavailable in this session; browser discovery returned no connected browsers, and direct Chrome launch was blocked before startup.
- `evidence/l1_after/` is reserved for the required post-change lineup but contains no claimed L1-after screenshots.
- Existing pre-L1 asset and lineup images were inspected only as context and are not reported as proof of this module.
