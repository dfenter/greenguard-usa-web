import bpy, sys
path=sys.argv[sys.argv.index("--")+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
body=max((o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("zz_")),key=lambda o:len(o.data.vertices))
cav=bpy.data.objects["zz_Cavity"]
P=lambda o,v:(o.matrix_world @ v.co)
bp=[P(body,v) for v in body.data.vertices]
cp=[P(cav,v) for v in cav.data.vertices]
for i,nm in enumerate("XYZ"):
    print("axis %s body %.4f..%.4f  cavity %.4f..%.4f"%(nm,min(p[i] for p in bp),max(p[i] for p in bp),min(p[i] for p in cp),max(p[i] for p in cp)))
print("body matrix_world:", [tuple(round(x,3) for x in r) for r in body.matrix_world])
