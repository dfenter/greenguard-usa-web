import bpy,sys,mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[sys.argv.index("--")+1])
body=max((o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("zz_")),key=lambda o:len(o.data.vertices))
cav=bpy.data.objects["zz_Cavity"]
B=[body.matrix_world@v.co for v in body.data.vertices]
C=[cav.matrix_world@v.co for v in cav.data.vertices]
for i,n in enumerate("XYZ"):
    print("%s body %8.4f..%8.4f  cavity %8.4f..%8.4f"%(n,min(p[i] for p in B),max(p[i] for p in B),min(p[i] for p in C),max(p[i] for p in C)))
cc=mathutils.Vector((sum(p.x for p in C)/len(C),sum(p.y for p in C)/len(C),sum(p.z for p in C)/len(C)))
print("cavity centre",tuple(round(x,4) for x in cc))
print("body centre",tuple(round((min(p[i] for p in B)+max(p[i] for p in B))/2,4) for i in range(3)))
