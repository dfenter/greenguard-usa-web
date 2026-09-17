import bpy,sys,mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[sys.argv.index("--")+1])
body=max((o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("zz_")),key=lambda o:len(o.data.vertices))
cav=bpy.data.objects["zz_Cavity"]
import bmesh
bm=bmesh.new(); bm.from_mesh(body.data); bm.transform(body.matrix_world)
bvh=mathutils.bvhtree.BVHTree.FromBMesh(bm)
# for each cavity vertex, is it inside the body shell? cast ray toward body centre
pts=[body.matrix_world@v.co for v in body.data.vertices]
mid=mathutils.Vector([ (min(p[i] for p in pts)+max(p[i] for p in pts))*.5 for i in range(3)])
out=0; tot=0
worst=0
for v in cav.data.vertices:
    w=cav.matrix_world@v.co
    d=(mid-w); n=d.normalized()
    hit=bvh.ray_cast(w, n)
    tot+=1
    # if ray toward centre hits the shell, the point is OUTSIDE
    if hit[0] is not None:
        out+=1
        worst=max(worst,hit[3])
print("cavity verts outside body surface: %d / %d  (max depth outside %.4f)"%(out,tot,worst))
# same for teeth
for nm in ("zz_UpperTeeth","zz_LowerTeeth"):
    o=bpy.data.objects.get(nm)
    if not o: continue
    oo=0; tt=0; wz=0
    for v in o.data.vertices:
        w=o.matrix_world@v.co
        n=(mid-w).normalized()
        h=bvh.ray_cast(w,n); tt+=1
        if h[0] is not None: oo+=1; wz=max(wz,h[3])
    print("%s verts outside body: %d / %d (max %.4f)"%(nm,oo,tt,wz))
