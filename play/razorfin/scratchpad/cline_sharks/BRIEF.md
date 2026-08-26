# Cline lane: source textured shark assets from Sketchfab and bake them for Razorfin

Repo: /Users/lucille/greenguard-usa-web ; game: play/razorfin/ (three.js browser shark game, 86-shark roster).
Existing bake tool (READ IT FIRST, it defines the rig/orientation/export contract):
  play/razorfin/tools/shark_bake.py  (run headless: /Applications/Blender.app/Contents/MacOS/Blender -b --python play/razorfin/tools/shark_bake.py -- --in hi.glb --out low.glb --tris 7000 --tex 2048 --name <id>)
Loader contract notes: play/razorfin/NOTES-rev14-textured.md
Shipping reference: play/razorfin/assets/models/textured_test.glb (first baked asset; greatwhite row uses it).

## Goal
Find high-quality, CLEARLY LICENSED (CC0 or CC-BY, downloadable) shark models on Sketchfab, download them, run each through shark_bake.py, and deliver game-ready GLBs for these 4 species (distinct silhouettes):
  1. hammerhead (scalloped or smooth hammerhead)
  2. mako
  3. tiger
  4. thresher
If a species has no usable model, substitute the closest real species and say so in REPORT.md.

## Sketchfab
- Search API needs no auth: https://api.sketchfab.com/v3/search?type=models&q=<query>&downloadable=true  (also try licenses filter; known CC0 photogrammetry user: ffishAsia-and-floraZia).
- Download (GET https://api.sketchfab.com/v3/models/<uid>/download) needs an account API token in header `Authorization: Token <token>`. Look for one in env var SKETCHFAB_API_TOKEN or SKETCHFAB_TOKEN; if none is set, STOP after producing a shortlist (uid, name, author, license, face count, URL) in REPORT.md and say the token is missing. Do not try to log in via browser.
- Prefer glTF download format. Photogrammetry with 1-2M faces is fine; shark_bake.py decimates and bakes. If a local Cycles bake is too slow, reduce bake samples via the script's options rather than skipping the bake.
- Record every source's license + author + URL in REPORT.md exactly as Sketchfab reports it (attribution is required for CC-BY).

## Outputs (write ONLY here, do not edit any game .js/.html/data files)
play/razorfin/scratchpad/cline_sharks/src/<species>/     (original download, unmodified)
play/razorfin/scratchpad/cline_sharks/<species>.glb        (baked output of shark_bake.py)
play/razorfin/scratchpad/cline_sharks/<species>_preview.png (3/4 view Blender render, ~800px)
play/razorfin/scratchpad/cline_sharks/REPORT.md            (per species: source uid/author/license/URL, input faces, output tris, texture sizes, bone list, bounding box, known flaws, exact regenerate command)

## Rules
- Do not modify anything outside play/razorfin/scratchpad/cline_sharks/. Do not git commit.
- Do not install software. Blender 3.6 + Python 3 + curl are available.
- Validate every output GLB: parse the glTF JSON header (mesh count, node/bone names incl. LowerJaw, image count and MIME) and confirm tri count <= 7000 and textures are JPEG.
- Work species by species; finish and validate one before starting the next.
- Final message: what was produced, what failed, and whether the token was available.
