# HANDOFF: Sketchfab shark lane -> Rev 14 pipeline owner session (2026-08-25 17:05)

Dan: "migrate this work to other session". The originating session (e859ffd7) has STOPPED its
`cline-lane.sh sharks` launcher. Nothing here is running. You own this folder now.

## State
- hammerhead.glb  APPROVED. CC0 scalloped hammerhead (ffishAsia-and-floraZia, uid b68fdc98...),
  6,764 tris, bones Tail3..Head + LowerJaw (+neutral_bone), JPEG diffuse+normal, no clips.
  Preview hammerhead_preview.png inspected: fins/tail/cephalofoil intact.
- mako   : Primary (tubaf.vr) REJECTED, it is a museum jaw/head specimen
           (REJECTED_mako_tubaf_head_only*.{glb,png}, src/mako_REJECTED_tubaf/).
           Alternate (faerbogdan99, CC-BY) downloaded to src/mako/, source render
           mako_SOURCE_preview.png passes whole-shark check. NOT baked yet.
- tiger  : Primary (Nullifiedit, CC-BY) downloaded to src/tiger/, tiger_SOURCE_preview.png passes. NOT baked.
- thresher: Primary (SealifeFan3, CC-BY) downloaded to src/thresher/, thresher_SOURCE_preview.png passes
           (upper caudal lobe modest for a thresher; acceptable). NOT baked.
- REPORT.md = shortlist with uids/authors/licenses (CC-BY picks need attribution in LICENSES.md).

## Tooling in this folder
- fetch.sh            Sketchfab download helper (needs SKETCHFAB_TOKEN from app/.env; never print it)
- shark_bake_local.py Copy of tools/shark_bake.py PATCHED per NOTES-tear.md (voxel-remesh the high mesh
                      first at ~0.0035, then collapse). Your tools/shark_bake.py still has the reducer
                      order that shreds fins on non-manifold scans (evidence in NOTES-tear.md); consider
                      porting the fix.
- validate_glb.py, render_preview.py   header validator and 800px 3/4 preview renderer
- PROMPT-lane.txt     the Cline brief used with ~/bin/cline-lane.sh (rules preamble, 429 auto-relaunch)

## Remaining work
Bake mako, tiger, thresher with shark_bake_local.py (--tris 7000 --tex 2048), validate, render,
LOOK at each preview, then rewrite REPORT.md and wire approved assets into MODEL_FILES/TEXTURED_KEYS
+ data.js sil.model per NOTES-rev14-textured.md. Free Cline pool was saturated 16:49-17:01 (429s);
`nohup ~/bin/cline-lane.sh sharks2 /Users/lucille/greenguard-usa-web <thisdir> <thisdir>/PROMPT-lane.txt &`
resumes it, or bake locally.
