"""Render an ~800px 3/4-view preview PNG of a baked shark GLB (Blender headless).

  blender -b --python render_preview.py -- --in shark.glb --out shark_preview.png
"""
import bpy, sys, os, argparse, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='inp', required=True)
ap.add_argument('--out', required=True)
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.inp)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 800
scene.render.resolution_y = 600
scene.render.image_settings.file_format = 'PNG'

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bb = [o.matrix_world @ __import__('mathutils').Vector(c) for c in meshes[0].bound_box] \
    if False else None
import mathutils
pts = []
for o in meshes:
    for c in o.bound_box:
        pts.append(o.matrix_world @ mathutils.Vector(c))
ymin = min(p.y for p in pts); ymax = max(p.y for p in pts)
zmin = min(p.z for p in pts); zmax = max(p.z for p in pts)
xc = sum(p.x for p in pts) / len(pts)
yc = (ymin + ymax) / 2; zc = (zmin + zmax) / 2
L = ymax - ymin

# key light + fill
key = bpy.data.lights.new('key', 'SUN'); key.energy = 3.0
ko = bpy.data.objects.new('key', key); scene.collection.objects.link(ko)
ko.rotation_euler = (math.radians(55), 0, math.radians(-30))
fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 300.0; fill.size = 3.0
fo = bpy.data.objects.new('fill', fill); scene.collection.objects.link(fo)
fo.location = (-L, -L * 0.8, L * 0.6)
fo.rotation_euler = (math.radians(65), 0, math.radians(-60))

# 3/4 view camera looking at the head (+Y end) from front-starboard-above
cam = bpy.data.cameras.new('cam'); cam.lens = 60
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
d = L * 1.35
co.location = (d * 0.7, yc + d * 0.85, zc + d * 0.45)
direction = mathutils.Vector((xc, yc + L * 0.15, zc)) - co.location
co.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.camera = co

world = bpy.data.worlds.new('w'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.10, 0.14, 1)
scene.world = world

scene.render.filepath = a.out
bpy.ops.render.render(write_still=True)
print('PREVIEW WROTE', a.out, os.path.getsize(a.out), 'bytes')