import bpy, sys
argv = sys.argv[sys.argv.index("--")+1:]
for path in argv:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = {o.name: o for o in bpy.context.scene.objects if o.type == "MESH"}
    body = None
    for n, o in meshes.items():
        if n.startswith("zz_") or "teeth" in n.lower() or "Teeth" in n:
            continue
        if body is None or len(o.data.vertices) > len(body.data.vertices):
            body = o
    def bnds(o):
        pts = [o.matrix_world @ v.co for v in o.data.vertices]
        return (min(p.x for p in pts), max(p.x for p in pts),
                min(p.y for p in pts), max(p.y for p in pts),
                min(p.z for p in pts), max(p.z for p in pts))
    bx0,bx1,by0,by1,bz0,bz1 = bnds(body)
    L = by1-by0
    nose_y = by1
    cav = meshes.get("zz_Cavity")
    cx0,cx1,cy0,cy1,cz0,cz1 = bnds(cav)
    teeth = [o for n,o in meshes.items() if "teeth" in n.lower()]
    tmax = max(bnds(t)[3] for t in teeth) if teeth else float("-nan")
    def tris(o):
        o.data.calc_loop_triangles(); return len(o.data.loop_triangles)
    added = tris(cav) + sum(tris(t) for t in teeth) + (tris(meshes["zz_LowerLip"]) if "zz_LowerLip" in meshes else 0)
    inside = (cx0>=bx0-1e-6 and cx1<=bx1+1e-6 and cy0>=by0-1e-6 and cy1<=by1+1e-6 and cz0>=bz0-1e-6 and cz1<=bz1+1e-6)
    print("GATE %s body=%s L=%.4f nose_y=%.4f" % (path.split("/")[-1], body.name, L, nose_y))
    print("  cavity_bbox_inside_body: %s  (cav y %.4f..%.4f z %.4f..%.4f x %.4f..%.4f | body y %.4f..%.4f z %.4f..%.4f x %.4f..%.4f)"
          % (inside, cy0,cy1,cz0,cz1,cx0,cx1, by0,by1,bz0,bz1,bx0,bx1))
    print("  cavity_max_y<=nose: %s (%.4f <= %.4f)" % (cy1 <= nose_y+1e-6, cy1, nose_y))
    print("  teeth_max_y<=nose+.01L: %s (%.4f <= %.4f)" % (tmax <= nose_y+.01*L+1e-6, tmax, nose_y+.01*L))
    print("  back_y<=ymin+.86L: %s (%.4f <= %.4f)" % (cy0 <= by0+.86*L+1e-6, cy0, by0+.86*L))
    print("  added_tris(cav+teeth+lip)=%d  <=700: %s" % (added, added<=700))
