# Why baked photogrammetry sharks come out with torn fins

Evidence (hammerhead, CC0 scan, 897k tris, source render clean: hammerhead_SOURCE_preview.png):

    dec pass 0 782297 -> 15645 (ratio 0.0000)   <- one collapse pass at ratio ~0.02 on a NON-MANIFOLD scan
    dec pass 1 15645 -> 14723
    dec pass 2 14723 -> 14713
    collapse stalled, voxel remesh
    remesh voxel 0.01001 -> 6876                 <- 1 cm voxels on a 1 m shark: fin edges and tail lobes are thinner than a voxel
    Warning: Bone Heat Weighting: failed to find solution for one or more bones   <- disconnected fragments

Result: hammerhead_preview.png shows shredded tail lobes, stub dorsal, holes in the cephalofoil, floating fragments.

## Fix (order of operations, in shark_bake.py's reducer)

1. Voxel-remesh the HIGH mesh FIRST to make it manifold and closed, with a voxel small enough to
   keep fins: ~0.003-0.004 of the long axis (long axis is normalised to 1.0), adaptivity 0.
   This yields ~100-200k tris, watertight, no fragments.
2. Then collapse-decimate the manifold result down to the budget in gentle passes
   (ratio per pass >= 0.1, loop until <= budget * 1.08). Collapse on a manifold mesh keeps thin
   silhouettes; it only shreds on non-manifold soup.
3. Never fall back to a coarse voxel remesh AFTER collapse; that is what dissolves the fins.
4. Keep the existing junk-strip and unlit->EMIT bake as they are; both are correct.

Cheap check after baking: LOW tris count is not enough; render and LOOK at the preview.
