import bpy,sys,os
sys.path.insert(0,os.path.abspath("tools"))
argv=sys.argv[sys.argv.index("--")+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
o=max([x for x in bpy.data.objects if x.type=='MESH' and 'zz_' not in x.name],key=lambda x:len(x.data.vertices))
print("HINGE_T",argv[0].split('/')[-1],o.get("rf_mouth_hinge_t"),"flat",o.get("rf_mouth_flat_chin"))
