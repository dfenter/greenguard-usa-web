import bpy,sys,mathutils,bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[sys.argv.index("--")+1])
body=max((o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("zz_")),key=lambda o:len(o.data.vertices))
bm=bmesh.new(); bm.from_mesh(body.data); bm.transform(body.matrix_world)
bvh=mathutils.bvhtree.BVHTree.FromBMesh(bm)
pts=[body.matrix_world@v.co for v in body.data.vertices]
mid=mathutils.Vector([(min(p[i] for p in pts)+max(p[i] for p in pts))*.5 for i in range(3)])
def ray_inside(w):
    # parity test along +X: odd number of crossings => inside
    d=mathutils.Vector((1,0,0)); n=0; o=w.copy()
    for _ in range(64):
        h=bvh.ray_cast(o,d)
        if h[0] is None: break
        n+=1; o=h[0]+d*1e-5
    return n%2==1
print("body centre inside?",ray_inside(mid))
tail=mathutils.Vector((0,min(p.y for p in pts)+0.05,0))
print("tail point inside?",ray_inside(tail))
far=mid+mathutils.Vector((10,10,10))
print("far point inside?",ray_inside(far))
cav=bpy.data.objects["zz_Cavity"]
ins=sum(1 for v in cav.data.vertices if ray_inside(cav.matrix_world@v.co))
print("cavity verts INSIDE: %d / %d"%(ins,len(cav.data.vertices)))
for nm in ("zz_UpperTeeth","zz_LowerTeeth"):
    o=bpy.data.objects[nm]
    i=sum(1 for v in o.data.vertices if ray_inside(o.matrix_world@v.co))
    print("%s INSIDE: %d / %d"%(nm,i,len(o.data.vertices)))
