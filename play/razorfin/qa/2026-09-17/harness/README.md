# Probe scripts written during the 2026-09-17 QA gate

The harness files named in the QA brief (verify.js, playprobe.js, diveprobe.js,
orientprobe.js, memprobe.js) do NOT exist at HEAD. Five of six QA sections were
therefore source-analysis only, and the single highest-ranked fix coming out of
this gate is to restore a canonical harness.

These scripts were written from scratch during the gate and are preserved here
as the starting point for that work. They are copies; the originals were left in
play/razorfin/scratchpad/ and are untracked.

  qaserve.mjs      local static server, sends the Service-Worker-Allowed: /play/
                   header that the game requires
  qashot.mjs       screenshot helper, re-sends the CDP screenOrientation
                   landscapePrimary override after every capture (puppeteer
                   drops it, which otherwise produces false rotate-overlay
                   evidence)
  plainload.mjs    cold plain-load probe that taps only real buttons. This is
                   the probe class that would have caught the 2026-08-20
                   boot-menu regression, which shipped because every other
                   probe entered runs programmatically via scene.start
  perfprobe.mjs    frame-time sampler, supports a CDP CPU throttle multiplier
  stability10.mjs  10-minute unattended run, samples heap and frame count every
                   30s and captures console errors

Known gap: a fresh puppeteer probe against the local serve returned a solid
black frame with 16 console 404s, likely missing three.js or GLB assets outside
the local serve root. Resolving that asset path issue is prerequisite to getting
real frames out of any rebuilt harness.

## Root cause of the fun lane's black frame (orchestrator, resolved)
The fun lane reported a solid black frame with 16 console 404s and blamed
"missing three.js/GLB assets outside the local serve root". The assets are NOT
missing. The playability lane rendered the menu correctly from the same tree.

The two lanes used DIFFERENT servers with different roots:
  plainload.mjs -> qaserve.mjs, root = worktree root, URL /play/razorfin/  WORKED
  qashot.mjs    -> its own inline server, root = <worktree>/play,
                   URL /razorfin/?unlockall=1                              BLACK

qashot.mjs is internally consistent (its ROOT is /play, so /razorfin/ is the
correct path for it, and its MIME map is actually the better of the two, it
handles .glb, .bin, .png and .json properly). The breakage is the HTML base tag:
index.html declares <base href="/play/razorfin/">, so every relative asset
resolves to /play/razorfin/<file> REGARDLESS of how the server is rooted. Under
a server rooted at /play, that URL maps to <worktree>/play/play/razorfin/<file>,
which does not exist. The document itself loads (the server appends index.html),
which is why a page appeared at all, but all 47 .glb, 27 .bin and 20 .png
references 404 and the canvas stays black.

Fix: serve from the WORKTREE ROOT and request /play/razorfin/ with the trailing
slash, matching the base tag and the production path. Do not re-root the server
at /play. This is the single most important thing to get right when rebuilding
the harness, because it silently produces a plausible-looking black frame rather
than an obvious error, and it already caused one lane to file a wrong diagnosis
this session.
