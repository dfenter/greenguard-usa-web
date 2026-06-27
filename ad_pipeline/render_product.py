#!/usr/bin/env python3
"""
GreenGuard USA — Blender headless product render script.

Run on worker:
    ~/blender/blender --background --python /tmp/gg_ad/render_product.py
"""

import bpy, math
import mathutils
from pathlib import Path

STL_SHELL = "/tmp/gg_ad/assets/shell_monolith.stl"
OUT_DIR   = Path("/tmp/gg_ad/renders")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Scene helpers ─────────────────────────────────────────────────────────────

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

def import_stl(path):
    try:
        bpy.ops.wm.stl_import(filepath=str(path))   # Blender 4.x
    except AttributeError:
        bpy.ops.preferences.addon_enable(module="io_mesh_stl")
        bpy.ops.import_mesh.stl(filepath=str(path))
    obj = bpy.context.active_object
    print(f"  Imported: {obj.name}  scale={obj.scale[:]}")
    return obj

def world_bbox(obj):
    """Return (xmin,xmax,ymin,ymax,zmin,zmax) in world coordinates."""
    corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    xs = [v.x for v in corners]; ys = [v.y for v in corners]; zs = [v.z for v in corners]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)

def make_material_matte_black():
    mat = bpy.data.materials.new("MonolithBlack")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    pbr = nodes.new('ShaderNodeBsdfPrincipled')
    pbr.inputs['Base Color'].default_value = (0.018, 0.018, 0.018, 1.0)  # near-black
    pbr.inputs['Roughness'].default_value  = 0.55
    pbr.inputs['Metallic'].default_value   = 0.25
    try:    pbr.inputs['Specular IOR Level'].default_value = 0.3
    except: pbr.inputs['Specular'].default_value           = 0.3
    links.new(pbr.outputs['BSDF'], out.inputs['Surface'])
    return mat

def setup_world(sun_elevation_deg=22):
    world = bpy.context.scene.world
    world.use_nodes = True
    wn = world.node_tree.nodes
    wl = world.node_tree.links
    wn.clear()
    wo  = wn.new('ShaderNodeOutputWorld')
    bg  = wn.new('ShaderNodeBackground')
    sky = wn.new('ShaderNodeTexSky')
    sky.sky_type        = 'HOSEK_WILKIE'
    sky.sun_elevation   = math.radians(sun_elevation_deg)
    sky.sun_rotation    = math.radians(150)
    sky.turbidity       = 3.5
    sky.ground_albedo   = 0.3
    wl.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.4
    wl.new(bg.outputs['Background'], wo.inputs['Surface'])

def setup_lights(cx, cy, cz, max_dim):
    d = max_dim
    # Key — warm golden, front-left high
    bpy.ops.object.light_add(type='AREA', location=(cx - d, cy - d * 1.2, cz + d * 1.5))
    key = bpy.context.active_object
    key.data.energy = max_dim * 300
    key.data.color  = (1.0, 0.85, 0.55)
    key.data.size   = max_dim * 1.2
    key.rotation_euler = (math.radians(45), 0, math.radians(-40))

    # Fill — cool blue, opposite side
    bpy.ops.object.light_add(type='AREA', location=(cx + d * 0.8, cy - d * 0.5, cz + d * 0.6))
    fill = bpy.context.active_object
    fill.data.energy = max_dim * 60
    fill.data.color  = (0.55, 0.68, 1.0)
    fill.data.size   = max_dim * 2.0

    # Rim — warm from behind
    bpy.ops.object.light_add(type='AREA', location=(cx, cy + d * 1.0, cz + d * 0.8))
    rim = bpy.context.active_object
    rim.data.energy = max_dim * 120
    rim.data.color  = (1.0, 0.78, 0.4)
    rim.data.size   = max_dim * 0.7
    rim.rotation_euler = (math.radians(-55), 0, 0)

def set_camera(loc, target_pt, lens_mm):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    cam.data.lens = lens_mm
    # Point camera at target
    direction = mathutils.Vector(target_pt) - mathutils.Vector(loc)
    rot_quat  = direction.to_track_quat('-Z', 'Y')
    cam.rotation_euler = rot_quat.to_euler()
    bpy.context.scene.camera = cam
    return cam

def configure_render(alpha=False, samples=64):
    scene = bpy.context.scene
    scene.render.engine        = 'CYCLES'
    scene.cycles.device        = 'CPU'
    scene.cycles.samples       = samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser      = 'OPENIMAGEDENOISE'
    scene.render.resolution_x  = 1280
    scene.render.resolution_y  = 720
    scene.cycles.tile_size     = 64
    scene.render.image_settings.file_format  = 'PNG'
    scene.render.image_settings.compression  = 15
    scene.render.film_transparent            = alpha
    scene.render.image_settings.color_mode   = 'RGBA' if alpha else 'RGB'

def render_to(out_path):
    bpy.context.scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    print(f"  ✓ {out_path.name}  {out_path.stat().st_size // 1024} KB")

# ── Per-shot render function ──────────────────────────────────────────────────

def render_shot(out_path, cam_offset_fn, lens_mm, alpha=False, overhead_light=False):
    """
    Import → material → move to origin → measure bounds → place camera → render.
    cam_offset_fn(cx, cy, cz, W, D, H, max_dim) → (cam_loc, cam_target)
    """
    clear_scene()
    obj = import_stl(STL_SHELL)
    obj.data.materials.append(make_material_matte_black())

    # ── Move object so its bottom sits at Z=0 ──
    x0, x1, y0, y1, z0, z1 = world_bbox(obj)
    obj.location.z -= z0   # shift down so zmin=0
    # Re-measure after move
    x0, x1, y0, y1, z0, z1 = world_bbox(obj)
    W = x1 - x0; D = y1 - y0; H = z1     # H = total height (zmin is now 0)
    cx = (x0 + x1) / 2; cy = (y0 + y1) / 2
    max_dim = max(W, D, H)
    print(f"  World bounds: W={W:.3f}  D={D:.3f}  H={H:.3f}  max={max_dim:.3f}")

    # ── World / ground ──
    if not alpha:
        setup_world()
        bpy.ops.mesh.primitive_plane_add(size=max_dim * 14, location=(cx, cy, 0))
        gnd = bpy.context.active_object
        m = bpy.data.materials.new("Ground")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs['Base Color'].default_value = (0.06, 0.16, 0.02, 1.0)
        m.node_tree.nodes["Principled BSDF"].inputs['Roughness'].default_value = 0.95
        gnd.data.materials.append(m)

    # ── Lights ──
    if overhead_light:
        bpy.ops.object.light_add(type='AREA', location=(cx, cy, H * 2.5))
        lgt = bpy.context.active_object
        lgt.data.energy = max_dim * 800
        lgt.data.color  = (1.0, 0.92, 0.80)
        lgt.data.size   = max_dim * 1.5
        lgt.rotation_euler = (math.radians(180), 0, 0)
        setup_lights(cx, cy, H / 2, max_dim * 0.4)  # softer fills
    else:
        setup_lights(cx, cy, H / 2, max_dim)

    # ── Camera ──
    cam_loc, cam_target = cam_offset_fn(cx, cy, H / 2, W, D, H, max_dim)
    configure_render(alpha=alpha)
    set_camera(cam_loc, cam_target, lens_mm)
    print(f"  Camera: {tuple(round(v,2) for v in cam_loc)}  →  {tuple(round(v,2) for v in cam_target)}")

    render_to(out_path)


# ── Shot definitions ──────────────────────────────────────────────────────────

# Shot 3 — hero wide: camera 2× product height away, low angle, slightly offset
def cam_wide(cx, cy, cz, W, D, H, md):
    dist = md * 1.8
    return (cx + dist * 0.55, cy - dist * 0.90, H * 0.62), (cx, cy, H * 0.40)

# Shot 4 — CO₂ base macro: very close, tight on lower 12% of trap
def cam_macro(cx, cy, cz, W, D, H, md):
    dist = W * 0.5
    return (cx + dist * 0.9, cy - dist * 0.9, H * 0.10), (cx, cy, H * 0.06)

# Shot 6 — top-down: directly above looking straight down
def cam_topdown(cx, cy, cz, W, D, H, md):
    return (cx, cy - 0.001, H * 1.65), (cx, cy, H * 0.95)

# Shot 7 alpha — RGBA transparent for composite
def cam_alpha(cx, cy, cz, W, D, H, md):
    dist = md * 1.5
    return (cx + dist * 0.45, cy - dist * 0.85, H * 0.52), (cx, cy, H * 0.38)


print("\n=== Shot 3: hero wide ===")
render_shot(OUT_DIR / "shot03_wide.png",   cam_wide,    lens_mm=42)

print("\n=== Shot 4: CO₂ base macro ===")
render_shot(OUT_DIR / "shot04_macro.png",  cam_macro,   lens_mm=85)

print("\n=== Shot 6: top-down intake ===")
render_shot(OUT_DIR / "shot06_topdown.png", cam_topdown, lens_mm=80, overhead_light=True)

print("\n=== Shot 7: alpha composite ===")
render_shot(OUT_DIR / "shot07_alpha.png",  cam_alpha,   lens_mm=55, alpha=True)

print("\n=== All renders complete ===")
for f in sorted(OUT_DIR.iterdir()):
    print(f"  {f.name}  {f.stat().st_size // 1024} KB")
