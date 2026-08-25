"""Razorfin shark asset pipeline (Blender 3.6, headless).

  blender -b --python tools/shark_bake.py -- --in model.glb --out sharky_gw.glb \
      --tris 7000 --tex 2048 [--name greatwhite]

Imports a high-poly textured shark (glTF/OBJ/FBX), decimates to the tri
budget, bakes the source diffuse + a normal map from the high mesh onto
the low mesh (2K atlas), builds a nose->tail spine armature plus a Head and
LowerJaw bone with automatic weights, and exports a GLB with the same bone
names shark3d.js already consumes (Head, LowerJaw, Neck, Spine*, Tail*).
"""
import bpy, sys, os, math, argparse

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='inp', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--tris', type=int, default=7000)
ap.add_argument('--tex', type=int, default=2048)
ap.add_argument('--name', default='shark')
ap.add_argument('--length', type=float, default=1.0, help='target length (nose->tail) in scene units')
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(a.inp)[1].lower()
if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=a.inp)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=a.inp)
elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=a.inp)
else: raise SystemExit('unsupported input ' + ext)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
if not meshes: raise SystemExit('no mesh in input')
# Flatten: apply transforms, join into one high mesh, drop any armature.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
for o in meshes:
    for m in list(o.modifiers):
        if m.type == 'ARMATURE': o.modifiers.remove(m)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1: bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
high.name = 'high'
for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o)

# Orient: longest axis -> +Y (nose at +Y), height -> +Z. We assume the
# source is either Y-forward or X-forward; pick by bbox extents.
import mathutils
def _longest(o):
    d = o.dimensions; return max(range(3), key=lambda i: d[i])
bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); bpy.context.view_layer.objects.active = high
high.rotation_mode = 'XYZ'
ax = _longest(high)
print('ORIENT longest axis', ax, tuple(round(v,3) for v in high.dimensions))
if ax == 0: high.rotation_euler = (0, 0, math.radians(90))
elif ax == 2: high.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(rotation=True)
# Height must be the Z extent (sharks are taller than they are wide).
if high.dimensions.x > high.dimensions.z:
    high.rotation_euler = (0, math.radians(90), 0)
    bpy.ops.object.transform_apply(rotation=True)
print('ORIENT after', tuple(round(v,3) for v in high.dimensions))
bpy.ops.object.transform_apply(rotation=True)
# Normalise length and center.
L = high.dimensions.y
s = a.length / L
high.scale = (s, s, s)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
high.location = (0, 0, 0)
bpy.ops.object.transform_apply(location=True)
print('HIGH tris', sum(len(p.vertices) - 2 for p in high.data.polygons), 'dims', tuple(round(v, 3) for v in high.dimensions))

# Low mesh: duplicate + decimate to the budget.
bpy.ops.object.duplicate()
low = bpy.context.view_layer.objects.active
low.name = a.name
tri_count = sum(len(p.vertices) - 2 for p in low.data.polygons)
ratio = min(1.0, a.tris / max(1, tri_count))
if ratio < 1.0:
    mod = low.modifiers.new('dec', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.mesh.faces_shade_smooth()
# New UVs for the bake atlas.
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
bpy.ops.object.mode_set(mode='OBJECT')
print('LOW tris', sum(len(p.vertices) - 2 for p in low.data.polygons))

# Bake material on the low mesh.
img_d = bpy.data.images.new(a.name + '_diffuse', a.tex, a.tex)
img_n = bpy.data.images.new(a.name + '_normal', a.tex, a.tex, float_buffer=False)
img_n.colorspace_settings.name = 'Non-Color'
mat = bpy.data.materials.new(a.name + '_mat'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex_d = nt.nodes.new('ShaderNodeTexImage'); tex_d.image = img_d
tex_n = nt.nodes.new('ShaderNodeTexImage'); tex_n.image = img_n
nmap = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tex_d.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tex_n.outputs['Color'], nmap.inputs['Color'])
nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = 0.45
low.data.materials.clear(); low.data.materials.append(mat)

# High mesh must have a material for the diffuse bake; if it has textures
# they are baked through; if only vertex colors, wire those.
if not high.data.materials:
    hm = bpy.data.materials.new('highmat'); hm.use_nodes = True
    if high.data.color_attributes:
        vc = hm.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = high.data.color_attributes[0].name
        hm.node_tree.links.new(vc.outputs['Color'], hm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    high.data.materials.append(hm)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 4; scene.cycles.device = 'CPU'
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = a.length * 0.03
scene.render.bake.max_ray_distance = a.length * 0.06
bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); low.select_set(True)
bpy.context.view_layer.objects.active = low
for node in nt.nodes: node.select = False
tex_d.select = True; nt.nodes.active = tex_d
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True)
tex_d.select = False; tex_n.select = True; nt.nodes.active = tex_n
bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, normal_space='TANGENT')
for img in (img_d, img_n): img.pack()
bpy.data.objects.remove(high)

# Armature: nose (+Y) -> tail (-Y) spine chain + Head/LowerJaw, matching the
# Sharky bone vocabulary shark3d.js reads.
L = low.dimensions.y; ymax = low.bound_box[0][1] + L; ymin = low.bound_box[0][1]
zc = (low.bound_box[0][2] + low.bound_box[0][2] + low.dimensions.z) / 2
arm = bpy.data.armatures.new(a.name + '_arm'); rig = bpy.data.objects.new(a.name + '_rig', arm)
bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
stations = [('Tail3', 0.00), ('Tail2', 0.12), ('Tail1', 0.24), ('Spine2', 0.38), ('Spine1', 0.52), ('Neck', 0.66), ('Head', 0.80), ('Nose', 1.00)]
prev = None
for i in range(len(stations) - 1):
    name, t0 = stations[i]; t1 = stations[i + 1][1]
    b = arm.edit_bones.new(name)
    b.head = (0, ymin + L * t0, zc); b.tail = (0, ymin + L * t1, zc)
    if prev: b.parent = prev; b.use_connect = True
    prev = b
jaw = arm.edit_bones.new('LowerJaw')
jaw.head = (0, ymin + L * 0.78, zc - low.dimensions.z * 0.18); jaw.tail = (0, ymin + L * 0.98, zc - low.dimensions.z * 0.22)
jaw.parent = arm.edit_bones['Head']
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# Lower-jaw weights: vertices in the head span below the mouth line.
vg = low.vertex_groups.get('LowerJaw') or low.vertex_groups.new(name='LowerJaw')
hd = low.vertex_groups.get('Head')
for v in low.data.vertices:
    y = (v.co.y - ymin) / L; z = v.co.z
    if y > 0.78 and z < zc - low.dimensions.z * 0.08:
        vg.add([v.index], 1.0, 'REPLACE')
        if hd: hd.remove([v.index])

bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); rig.select_set(True)
for act in list(bpy.data.actions): bpy.data.actions.remove(act)
bpy.ops.export_scene.gltf(filepath=a.out, export_format='GLB', use_selection=True, export_apply=True, export_animations=False,
                          export_image_format='JPEG', export_jpeg_quality=85, export_skins=True, export_yup=True)
print('WROTE', a.out, os.path.getsize(a.out), 'bytes')
