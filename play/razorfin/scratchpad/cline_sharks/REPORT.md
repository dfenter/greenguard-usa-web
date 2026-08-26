# Cline lane report: textured shark assets for Razorfin

**Status: STOPPED at shortlist stage — Sketchfab API token missing.**

Neither `SKETCHFAB_API_TOKEN` nor `SKETCHFAB_TOKEN` was set in the
environment, so per BRIEF.md no downloads were attempted and no bakes were
run. Everything below comes from the unauthenticated search API
(`https://api.sketchfab.com/v3/search?type=models&q=...&downloadable=true`),
which reports license labels and face counts without auth.

## To resume

1. `export SKETCHFAB_API_TOKEN=<token>`
2. For each uid below:
   `curl -H "Authorization: Token $SKETCHFAB_API_TOKEN" https://api.sketchfab.com/v3/models/<uid>/download`
   (prefer the glTF archive), unpack into
   `play/razorfin/scratchpad/cline_sharks/src/<species>/`, then run:

       /Applications/Blender.app/Contents/MacOS/Blender -b --python play/razorfin/tools/shark_bake.py -- \
         --in play/razorfin/scratchpad/cline_sharks/src/<species>/<model>.glb \
         --out play/razorfin/scratchpad/cline_sharks/<species>.glb \
         --tris 7000 --tex 2048 --name <species>

   then validate the GLB per BRIEF.md and render an ~800px 3/4-view preview PNG.
   Licenses are copied verbatim from Sketchfab's search API `license.label`.
   Model page URLs use the canonical form `https://sketchfab.com/models/<uid>`.

## Shortlist

### 1. Hammerhead (target species available — no substitution needed)

| Pick | uid | Name | Author | License | Faces |
|---|---|---|---|---|---|
| **Primary** | `b68fdc989ba74bec9495ac907995739e` | CC0 アカシュモクザメ 🦈 ♀ Scalloped Hammerhead Shark | ffishAsia-and-floraZia | CC0 Public Domain | 897,206 |
| Alternate | `5de0eec2e8e0462f9a856124761e0ed8` | CC0 アカシュモクザメ 🦈 ♀ Scalloped Hammerhead Shark | ffishAsia-and-floraZia | CC0 Public Domain | 830,940 |
| Alternate | `3d1e1898e87c4187bbf3e6a264a9f933` | CC0 シロシュモクザメ 🦈 ♂ Smooth Hammerhead Shark | ffishAsia-and-floraZia | CC0 Public Domain | 1,811,912 |

All three are photogrammetry from the known-good CC0 user; primary is the
lower-face scalloped hammerhead (same silhouette family the roster expects).

### 2. Mako

| Pick | uid | Name | Author | License | Faces |
|---|---|---|---|---|---|
| **Primary** | `e4abb10165a846b8b7fb760b1f13ad9c` | Mako shark | tubaf.vr | CC Attribution | 310,223 |
| Alternate | `0ec4d184c6ea4a6a8704f56cc2ba6e78` | Shortfin mako shark | faerbogdan99 | CC Attribution | 150,000 |
| Alternate | `c72d5aa230074d5ba4f681e4e39ce3d7` | Mako Shark / Tubarão-Mako | arribadaclub | CC Attribution | 49,362 |

Note: the best-known mako scans (`Model 62A/62B - Shortfin Mako` by
DigitalLife3D, uids `d5727703…` / `a6b68fcf…`, 27,524 faces) are **CC
Attribution-NonCommercial**, which does not meet the brief's CC0/CC-BY bar;
excluded. Attribution strings must be recorded in REPORT.md when one of the
CC-BY picks is downloaded.

### 3. Tiger

| Pick | uid | Name | Author | License | Faces |
|---|---|---|---|---|---|
| **Primary** | `b74e252a508d406490ecef3bde602e2f` | Tiger Shark (Galeocerdo Cuvier) | Nullifiedit | CC Attribution | 148,151 |
| Alternate | `8a19770317984b4a9628934acd587a67` | Tiger Shark | intervirtual | CC Attribution | 106,080 |
| Alternate | `c66fcefe159244bf93bee4dcf25287f7` | Tiger Shark | VulpesDesigns | CC Attribution | 36,160 |

`splasq`'s Tiger Shark / Thresher Shark results are "Free Standard" license,
not CC — excluded. Museum jaw scans are jaws only — excluded.

### 4. Thresher (weakest category — substitution likely)

No CC0/CC-BY photogrammetry thresher exists on Sketchfab today. Best
CC-BY options are hand-modeled/sculpted:

| Pick | uid | Name | Author | License | Faces |
|---|---|---|---|---|---|
| **Primary** | `b193a4cd16024e8d9efb19314129bf33` | Pelagic Thresher Shark | SealifeFan3 | CC Attribution | 16,715 |
| Alternate | `8cec073a919743038fd4a69fde7fe245` | Thresher Shark - High to Low Poly Sculpt | ALHipwell | CC Attribution | 9,820 |
| Caveat | `25798dae029248f68359adbfed08a966` | Hsw Thresher Shark | hsejira | CC Attribution | 3,968 |

Caveats:
- `hsejira`'s "Hsw" series (also a Mako and a Tiger Shark by the same user)
  look like game-asset extractions; the declared CC-BY may not cover the
  underlying design. Use only if the primaries fail inspection.
- If none of these pass visual inspection after download, the closest real
  substitute within the clearly-licensed pool is ffishAsia-and-floraZia's
  **Blue Shark, Prionace glauca** (`f2af470413744d109c5e1d6fad8fe992`,
  CC0 Public Domain, 1,125,234 faces) — long body plus elongated tail-fin
  mass reads closest to a thresher silhouette among their catalog. This would
  be a substitution to note in the roster data owner's lane.

## What failed / what exists so far

- Nothing was downloaded, baked, rendered, or validated — blocked solely on
  the missing API token (BRIEF.md says do not log in via browser).
- No files outside this scratchpad directory were touched; nothing committed.
