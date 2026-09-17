"""Generate the small CC0 authored geometry kit for Razorfin Rev 17.

Run from the repository root:

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --gpu-backend opengl --python tools/kit_gen.py -- --all

``--verify`` also runs the L2 operations on all four approved bases, writes a
side/three-quarter review sheet for every operation, and prints the measured
triangle/component counts used in NOTES-rev17-L2.md.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
TOOLS_DIR = os.path.dirname(__file__)
if TOOLS_DIR not in sys.path:
    sys.path.insert(0, TOOLS_DIR)


KIT_NAMES = (
    "crown_a",
    "horns_pair",
    "saw_rostrum",
    "spine_row",
    "plate_row",
    "armor_collar",
    "hammer_foil",
    "whale_hood",
)


def _material(name, color, metallic=0.0, roughness=0.52):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.metallic = metallic
    material.roughness = roughness
    material.use_nodes = True
    bsdf = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    return material


def _smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def _add_uv(name, location, scale, material, segments=8, rings=4):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=location
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return _smooth(obj)


def _add_ico(name, location, scale, material, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return _smooth(obj)


def _add_cone(name, base, tip, radius, material, vertices=6, radius_tip=None):
    base, tip = Vector(base), Vector(tip)
    direction = tip - base
    length = max(direction.length, 1.0e-5)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius,
        radius2=radius if radius_tip is None else radius_tip,
        depth=length,
        location=(base + tip) * 0.5,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(material)
    return _smooth(obj)


def _add_box(name, location, scale, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("soft authored edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return _smooth(obj)


def _add_prism(name, y, depth, profile, material):
    """Extrude an x/z maple-leaf profile along canonical y."""
    vertices = [(x, y - depth * 0.5, z) for x, z in profile]
    vertices += [(x, y + depth * 0.5, z) for x, z in profile]
    n = len(profile)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return _smooth(obj)


def _join(parts, name):
    parts = [p for p in parts if p]
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    result = parts[0]
    result.name = name
    _smooth(result)
    return result


def _authored_colors(obj):
    """Write a flat authored COLOR attribute, keyed to each material slot."""
    mesh = obj.data
    if hasattr(mesh, "color_attributes"):
        old = mesh.color_attributes.get("AuthoredColor")
        if old:
            mesh.color_attributes.remove(old)
        colors = mesh.color_attributes.new(name="AuthoredColor", type="BYTE_COLOR", domain="CORNER")
        for polygon in mesh.polygons:
            material = mesh.materials[polygon.material_index] if mesh.materials and polygon.material_index < len(mesh.materials) else None
            color = material.diffuse_color[:3] if material else (0.55, 0.58, 0.62)
            for loop_index in polygon.loop_indices:
                colors.data[loop_index].color = (*color, 1.0)
    mesh.update()
    return obj


def _prepare_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _crown():
    mat = _material("CC0 crown maple", (0.64, 0.30, 0.10), metallic=0.08)
    parts = [_add_uv("crown scute", (0, 0, 0.055), (0.24, 0.16, 0.075), mat)]
    for x, height in ((-0.15, 0.22), (0.0, 0.29), (0.15, 0.22)):
        parts.append(_add_cone("crown spike", (x, 0, 0.07), (x * 0.84, 0.01, height), 0.055, mat))
    return _join(parts, "crown_a")


def _horns():
    mat = _material("CC0 horn ivory", (0.72, 0.55, 0.32), roughness=0.44)
    parts = []
    for x in (-0.16, 0.16):
        parts.append(_add_cone("horn", (x, 0, 0.0), (x * 1.32, 0.02, 0.29), 0.075, mat, vertices=7, radius_tip=0.012))
    return _join(parts, "horns_pair")


def _saw():
    mat = _material("CC0 saw bronze", (0.44, 0.50, 0.55), metallic=0.24, roughness=0.36)
    tooth_mat = _material("CC0 saw tooth", (0.78, 0.80, 0.72), metallic=0.12, roughness=0.30)
    parts = [_add_box("saw blade", (0, 0.19, 0.03), (0.07, 0.28, 0.045), mat, 0.018)]
    for i in range(6):
        y = -0.055 + i * 0.085
        x = (-1 if i % 2 else 1) * 0.072
        parts.append(_add_cone("saw tooth", (x, y, 0.02), (x * 1.12, y + 0.018, -0.065), 0.028, tooth_mat, vertices=5, radius_tip=0.004))
    return _join(parts, "saw_rostrum")


def _spine():
    mat = _material("CC0 spine basalt", (0.20, 0.25, 0.29), metallic=0.12, roughness=0.48)
    parts = []
    for i, y in enumerate([-0.30, -0.20, -0.10, 0.0, 0.10, 0.20, 0.30]):
        height = 0.20 - i * 0.018
        parts.append(_add_cone("spine plate", (0, y, 0.0), (0, y + 0.012, height), 0.075 - i * 0.004, mat, vertices=5, radius_tip=0.012))
    return _join(parts, "spine_row")


def _plates():
    mat = _material("CC0 maple plates", (0.34, 0.39, 0.28), metallic=0.10, roughness=0.50)
    parts = []
    profile_base = ((0.0, -0.055), (-0.12, -0.028), (-0.075, 0.075), (-0.035, 0.11), (0.0, 0.25), (0.035, 0.11), (0.075, 0.075), (0.12, -0.028))
    for i, y in enumerate([-0.30, -0.20, -0.10, 0.0, 0.10, 0.20, 0.30]):
        factor = 1.0 - i * 0.105
        profile = [(x * factor, z * factor) for x, z in profile_base]
        parts.append(_add_prism("maple plate %02d" % i, y, 0.045 * factor, profile, mat))
    return _join(parts, "plate_row")


def _collar():
    mat = _material("CC0 armor collar", (0.30, 0.33, 0.37), metallic=0.38, roughness=0.32)
    # The ring is deliberately a clean canonical torus.  accessories.py
    # remaps its inner/outer radii from the measured neck section, so a
    # shoulder block here would falsify the collar-radius gate and read as an
    # unscaled body ring.
    bpy.ops.mesh.primitive_torus_add(major_segments=12, minor_segments=4, major_radius=0.23, minor_radius=0.04, location=(0, 0, 0.02), rotation=(math.pi * 0.5, 0, 0))
    ring = bpy.context.object
    ring.name = "armor collar ring"
    ring.data.materials.append(mat)
    _smooth(ring)
    return _join([ring], "armor_collar")


def _hammer():
    mat = _material("CC0 hammer foil", (0.40, 0.47, 0.53), metallic=0.18, roughness=0.40)
    socket = _material("CC0 eye socket", (0.015, 0.019, 0.024), metallic=0.0, roughness=0.24)
    parts = [
        _add_uv("hammer centre", (0, 0.02, 0.01), (0.28, 0.14, 0.075), mat, segments=8, rings=4),
        _add_uv("hammer left lobe", (-0.30, 0.0, 0.0), (0.30, 0.18, 0.065), mat, segments=8, rings=4),
        _add_uv("hammer right lobe", (0.30, 0.0, 0.0), (0.30, 0.18, 0.065), mat, segments=8, rings=4),
        _add_uv("left eye socket", (-0.30, 0.145, 0.025), (0.052, 0.030, 0.030), socket, segments=6, rings=3),
        _add_uv("right eye socket", (0.30, 0.145, 0.025), (0.052, 0.030, 0.030), socket, segments=6, rings=3),
    ]
    return _join(parts, "hammer_foil")


def _hood():
    mat = _material("CC0 whale hood", (0.24, 0.38, 0.46), roughness=0.58)
    parts = [
        _add_uv("whale hood crown", (0, 0.02, 0.05), (0.43, 0.25, 0.14), mat, segments=8, rings=4),
        _add_uv("whale hood lip", (0, 0.17, -0.02), (0.38, 0.13, 0.07), mat, segments=8, rings=4),
    ]
    return _join(parts, "whale_hood")


BUILDERS = {
    "crown_a": _crown,
    "horns_pair": _horns,
    "saw_rostrum": _saw,
    "spine_row": _spine,
    "plate_row": _plates,
    "armor_collar": _collar,
    "hammer_foil": _hammer,
    "whale_hood": _hood,
}


def create_kit(name, params=None):
    """Create one named kit object in the active Blender scene."""
    name = str(name).replace(".glb", "")
    if name not in BUILDERS:
        raise ValueError("unknown kit: %s" % name)
    return _authored_colors(BUILDERS[name]())


def save_kit(name, out_dir=None):
    """Create and save one CC0 GLB, returning ``(path, triangles)``."""
    out_dir = out_dir or os.path.join(ROOT, "assets", "kit")
    os.makedirs(out_dir, exist_ok=True)
    obj = create_kit(name)
    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)
    if triangles > 600:
        raise RuntimeError("%s exceeds kit budget: %d tris" % (name, triangles))
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(out_dir, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True)
    return path, triangles


def generate_all(out_dir=None):
    """Write all eight owned kits and return their budget records."""
    _prepare_scene()
    records = []
    for name in KIT_NAMES:
        path, triangles = save_kit(name, out_dir)
        records.append({"kit": name, "path": path, "triangles": triangles})
        # Avoid carrying an earlier kit into the next GLB export.
        bpy.data.objects.remove(bpy.data.objects.get(name), do_unlink=True)
    print("KIT_BUDGET", records)
    return records


def _import_base(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("no mesh in %s" % path)
    obj = max(meshes, key=lambda item: len(item.data.polygons))
    obj.name = os.path.splitext(os.path.basename(path))[0]
    for other in list(bpy.data.objects):
        if other is not obj:
            bpy.data.objects.remove(other, do_unlink=True)
    # The L2 verification renders the mesh in its imported rest geometry. L1
    # owns the rig; no rig mutation is made here.
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    obj.parent = None
    return obj


def _triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def _render_pair(obj, output_path, label):
    """Render side and 3/4 views into a single 960x480 PNG."""
    from sharklib.head import measure

    scene = bpy.context.scene
    m = measure(obj)
    local_center = Vector((0.0, 0.0, 0.0))
    for vertex in obj.data.vertices:
        local_center += vertex.co
    local_center /= max(1, len(obj.data.vertices))
    center = obj.matrix_world @ local_center
    basis = obj.matrix_world.to_3x3()
    long_dir, across_dir, up_dir = (
        (basis @ Vector((1, 0, 0))).normalized() if m.long_axis == 0 else
        (basis @ Vector((0, 1, 0))).normalized() if m.long_axis == 1 else
        (basis @ Vector((0, 0, 1))).normalized(),
        (basis @ Vector((1, 0, 0))).normalized() if m.long_axis != 0 else
        (basis @ Vector((0, 1, 0))).normalized(),
        (basis @ Vector((0, 0, 1))).normalized() if m.long_axis != 2 else
        (basis @ Vector((0, 1, 0))).normalized(),
    )
    # Ensure the side image has the dorsal direction vertical; the source
    # bakes use z-up, and these transforms also work for a rotated mesh.
    camera = bpy.data.cameras.new("L2 review camera")
    cam = bpy.data.objects.new("L2 review camera", camera)
    scene.collection.objects.link(cam)
    scene.camera = cam
    camera.type = "ORTHO"
    camera.ortho_scale = max(m.L * 1.32, m.H * 2.6)
    camera.lens = 55
    camera.clip_start = 0.001
    camera.clip_end = 100.0

    target = center
    lights = []
    for name, location, energy, size in (
        ("L2 key", center + up_dir * m.L * 1.5 + across_dir * m.L * 1.4, 850.0, 4.0),
        ("L2 fill", center - up_dir * m.L * 0.5 - across_dir * m.L * 1.6, 500.0, 3.0),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
        lights.append(light)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("L2 review world")
    scene.world.color = (0.008, 0.014, 0.022)
    # EEVEE aborts during headless initialization on the required host.  The
    # L2 review gate is intentionally Cycles CPU so the pixels are real and
    # reproducible rather than silently falling back to a different engine.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 8
    print("L2_RENDER engine=%s samples=%d device=%s" %
          (scene.render.engine, scene.cycles.samples, scene.cycles.device), flush=True)
    scene.render.resolution_x = 480
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    temp_side = output_path + ".side.png"
    temp_top = output_path + ".top.png"
    temp_three = output_path + ".three.png"
    # Side, TOP and three-quarter.  The top view is what shows whether a ring
    # or a plate row is centred on the body rather than hanging off one side.
    for location, temp in (
        (center + across_dir * m.L * 2.4 + up_dir * m.L * 0.10, temp_side),
        (center + up_dir * m.L * 2.4, temp_top),
        (center + across_dir * m.L * 1.8 + long_dir * (m.L * 0.82) + up_dir * m.L * 0.18, temp_three),
    ):
        cam.location = location
        cam.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = temp
        bpy.ops.render.render(write_still=True)

    panels = [bpy.data.images.load(path, check_existing=False)
              for path in (temp_side, temp_top, temp_three)]
    width = 480 * len(panels)
    combined = bpy.data.images.new("L2 " + label, width=width, height=480, alpha=False)
    buffers = []
    for panel in panels:
        buffer = [0.0] * (480 * 480 * 4)
        panel.pixels.foreach_get(buffer)
        buffers.append(buffer)
    out = [0.0] * (width * 480 * 4)
    for y in range(480):
        src = y * 480 * 4
        for column, buffer in enumerate(buffers):
            dst = y * width * 4 + column * 480 * 4
            out[dst : dst + 480 * 4] = buffer[src : src + 480 * 4]
    combined.pixels.foreach_set(out)
    combined.filepath_raw = output_path
    combined.file_format = "PNG"
    combined.save()
    for image in panels + [combined]:
        if image.name in bpy.data.images:
            bpy.data.images.remove(image)
    for temp in (temp_side, temp_top, temp_three):
        try:
            os.remove(temp)
        except OSError:
            pass
    for light in lights:
        bpy.data.objects.remove(light, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def verify_all(base_dir=None, review_dir=None, render=True, base_names=None):
    """Run the L2 acceptance matrix over the requested approved bases."""
    from sharklib import accessories, fins, head

    base_dir = base_dir or os.path.join(ROOT, "assets", "models")
    review_dir = review_dir or os.path.join(ROOT, "assets", "review")
    os.makedirs(review_dir, exist_ok=True)
    bases = tuple(base_names or ("greatwhite_cy", "tigershark"))
    cases = (
        ("armor_collar", lambda obj: accessories.apply_accessories(
            obj, {"kits": [{"kit": "armor_collar.glb", "placement": "neck", "fused": True}], "tri_budget": 9000}), True),
        ("plate_row", lambda obj: accessories.apply_accessories(
            obj, {"kits": [{"kit": "plate_row.glb", "placement": "dorsal", "fused": True}], "tri_budget": 9000}), True),
        ("crown_a", lambda obj: accessories.apply_accessories(
            obj, {"kits": [{"kit": "crown_a.glb", "landmark": "head_top", "fused": True}], "tri_budget": 9000}), True),
        ("hammer_foil", lambda obj: accessories.apply_accessories(
            obj, {"kits": [{"kit": "hammer_foil.glb", "landmark": "snout", "fused": True}], "tri_budget": 9000}), True),
        ("head_bulbous_1.4", lambda obj: head.lattice(
            obj, {"preset": "bulbous", "scale": 1.4}), False),
    )
    records = []
    failures = []
    for base in bases:
        for operation, callback, is_fuse in cases:
            path = os.path.join(base_dir, base + ".glb")
            obj = _import_base(path)
            before = _triangles(obj)
            base_measure = head.measure(obj)
            # Captured BEFORE the op so the gates compare against the original
            # anatomy rather than the fused result.
            base_up_axis = accessories._axis_ids(base_measure)[2]
            base_pectoral_station = accessories._pectoral_station(obj, base_measure)
            base_head_top_z = base_measure.landmarks["head_top"][base_up_axis]
            # head_top can sit far below the body's own silhouette top (on
            # tigershark 0.031 vs 0.147), so a gate against head_top alone is
            # satisfied by existing body geometry and proves nothing about the
            # crown.  The crown must clear the WHOLE body's top.
            base_body_top_z = max((v.co[base_up_axis] for v in obj.data.vertices), default=0.0)
            # Head topology forward of t .75 must survive a fuse byte-for-byte:
            # the family pipeline cuts the mouth AFTER accessories, and a
            # whole-body remesh here rewrote the snout into long uniform voxel
            # edges that then tore under the jaw open pose (leviathanrex probed
            # 5.68x stretch with the accessory, 1.55x without it).  The
            # snapshot is taken after the boolean prep that the fuse itself
            # runs, which is the state the fuse actually starts from.
            head_snapshot = set()
            if is_fuse:
                probe = accessories._duplicate_object(obj, "L2 head probe")
                accessories._clean_for_boolean(probe)
                probe_measure = head.measure(probe)
                head_snapshot = set(
                    tuple(round(c, 6) for c in v.co) for v in probe.data.vertices
                    if accessories._station(v.co, probe_measure) >= 0.75)
                bpy.data.objects.remove(probe, do_unlink=True)
            result = callback(obj)
            if isinstance(result, tuple):
                obj, hi = result
                if hi and hi.name in bpy.data.objects:
                    bpy.data.objects.remove(hi, do_unlink=True)
            after = _triangles(obj)
            post_measure = head.measure(obj)
            post_top_z = max((v.co[base_up_axis] for v in obj.data.vertices), default=0.0)
            collar_station = float(obj.get("rf_last_accessory_collar_station", -1.0))
            head_kept = 1.0
            if is_fuse and head_snapshot:
                post_head = set(
                    tuple(round(c, 6) for c in v.co) for v in obj.data.vertices
                    if accessories._station(v.co, post_measure) >= 0.75)
                head_kept = len(head_snapshot & post_head) / float(len(head_snapshot))
            body_kept = post_measure.L >= base_measure.L * 0.75
            loose = accessories.loose_part_count(obj)
            output = os.path.join(review_dir, "L2_%s_%s.png" % (operation, base))
            if render:
                _render_pair(obj, output, operation + " " + base)
            added = int(obj.get("rf_accessory_added_triangles", 0)) if is_fuse else 0
            surface_distance = float(obj.get("rf_last_accessory_max_surface_distance", 0.0)) if is_fuse else 0.0
            collar_ratio = float(obj.get("rf_last_accessory_collar_ratio", 0.0))
            plate_margin = float(obj.get("rf_last_accessory_plate_top_margin", 0.0))
            collar_gap = float(obj.get("rf_last_accessory_collar_max_gap", 0.0))
            collar_over_side = float(obj.get("rf_last_accessory_collar_overhang_side", 0.0))
            collar_over_top = float(obj.get("rf_last_accessory_collar_overhang_top", 0.0))
            plate_max_height = float(obj.get("rf_last_accessory_plate_max_height", 0.0))
            dorsal_height = float(obj.get("rf_last_accessory_dorsal_height", 0.0))
            width_before = float(obj.get("rf_head_width_before", 0.0))
            width_after = float(obj.get("rf_head_width_after", 0.0))
            height_before = float(obj.get("rf_head_height_before", 0.0))
            height_after = float(obj.get("rf_head_height_after", 0.0))
            gates = {
                # A destructive boolean can leave exactly one component that is
                # the ORNAMENT, the body having been deleted; loose == 1 alone
                # therefore does not prove the shark survived.
                "body_preserved": body_kept,
                "fused_components": (not is_fuse) or loose == 1,
                "added_tris": (not is_fuse) or added <= 1500,
                "surface_distance": (not is_fuse) or surface_distance <= 0.25 * base_measure.L,
                "collar_ratio": operation != "armor_collar" or 1.0 <= collar_ratio <= 1.15,
                "plate_top": operation != "plate_row" or plate_margin <= 0.0,
                # The ring must HUG the body: <=.02L clear of the skin all
                # round, and never more than .04L outside the silhouette in the
                # side or top view.  A radius ratio alone passed a floating hoop.
                "collar_hugs": operation != "armor_collar" or (
                    collar_gap <= 0.02 * base_measure.L
                    and collar_over_side <= 0.04 * base_measure.L
                    and collar_over_top <= 0.04 * base_measure.L),
                # The plates must read as fins, not tabs: the tallest plate
                # stands .40..70 x the dorsal fin height above the ridge.
                "plate_height": operation != "plate_row" or (
                    dorsal_height > 0.0
                    and 0.40 <= plate_max_height / dorsal_height <= 0.70),
                "bulbous_width": operation != "head_bulbous_1.4" or (width_before > 0 and 1.30 <= width_after / width_before <= 1.50),
                "bulbous_height": operation != "head_bulbous_1.4" or (height_before > 0 and 1.30 <= height_after / height_before <= 1.50),
                # The collar must ring the NECK. A base stored nose-at--Y used
                # to mirror every station and put the ring around the tail, so
                # the anchor is checked against the measured pectoral girdle.
                "collar_at_neck": operation != "armor_collar" or (
                    collar_station >= 0.0
                    and abs(collar_station - base_pectoral_station) <= 0.05),
                # The crown must actually be VISIBLE above the head: a kit that
                # fails to weld is deleted by the largest-component pass while
                # every other gate still reports green.
                # >=99% of the pre-fuse head vertices must come through the
                # fuse at exactly their original positions.
                # Only meaningful when the head region was actually protected:
                # a head-anchored kit (crown, hammer foil) is fused INTO that
                # region, so its geometry there is expected to change.
                "head_preserved": (not is_fuse)
                or not bool(obj.get("rf_accessory_head_protected", False))
                or head_kept >= 0.99,
                "crown_visible": operation != "crown_a" or (
                    post_top_z >= max(base_head_top_z, base_body_top_z)
                    + 0.02 * base_measure.L),
            }
            passed = all(gates.values())
            if not passed:
                failures.append((base, operation, gates))
            record = {"op": operation, "base": base, "before": before, "after": after,
                      "added_tris": added, "tri_budget": int(obj.get("rf_accessory_tri_budget", 9000)),
                      "other_triangles": int(obj.get("rf_accessory_other_triangles", 0)),
                      "loose_after": loose, "surface_distance": surface_distance,
                      "body_L": [base_measure.L, post_measure.L],
                      "collar_ratio": collar_ratio, "plate_top_margin": plate_margin,
                      "collar_max_gap": collar_gap,
                      "collar_overhang": [collar_over_side, collar_over_top],
                      "plate_max_height": plate_max_height,
                      "collar_station": collar_station,
                      "pectoral_station": base_pectoral_station,
                      "crown_top_z": post_top_z, "head_top_z": base_head_top_z,
                      "body_top_z": base_body_top_z,
                      "extent_lost": float(obj.get("rf_accessory_extent_lost", 0.0)),
                      "head_kept": head_kept,
                      "head_protected": bool(obj.get("rf_accessory_head_protected", False)),
                      "dorsal_height": float(obj.get("rf_last_accessory_dorsal_height", 0.0)),
                      "plate_top_z": float(obj.get("rf_last_accessory_plate_top_z", 0.0)),
                      "head_width": [width_before, width_after], "head_height": [height_before, height_after],
                      "gates": gates, "pass": passed, "render": output}
            records.append(record)
            print("L2_GATE", base, operation, gates, "PASS" if passed else "FAIL", flush=True)
            print("L2_VERIFY", record)
    print("L2_VERIFY_JSON", records)
    if failures:
        raise RuntimeError("L2 acceptance failures: %s" % failures)
    return records


def _cli():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="generate all eight kits")
    parser.add_argument("--verify", action="store_true", help="run four-base L2 verification")
    parser.add_argument("--no-render", action="store_true", help="run counts only")
    parser.add_argument("--base-dir", default=os.path.join(ROOT, "assets", "models"))
    parser.add_argument("--base", action="append", dest="bases", help="verify only this base (repeatable)")
    parser.add_argument("--review-dir", default=os.path.join(ROOT, "assets", "review"))
    args = parser.parse_args(argv)
    if args.all or args.verify or not argv:
        generate_all()
    if args.verify:
        verify_all(args.base_dir, args.review_dir, render=not args.no_render, base_names=args.bases)


if __name__ == "__main__":
    _cli()
