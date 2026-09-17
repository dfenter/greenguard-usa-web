"""Generate the small CC0 tooth-strip kit used by sharklib.mouth.

Run headlessly, for example:
  Blender -b --factory-startup --gpu-backend opengl --python tools/kit_gen_teeth.py -- --out-dir assets/kit
"""

import argparse
import math
import os
import sys

import bpy


def _mesh_strip(name, lower=False, count=10):
    """Create a curved strip of low-poly cones, at most 300 triangles."""
    vertices = []
    faces = []
    sides = 8
    for tooth in range(count):
        u = tooth / float(count - 1)
        x = (u - .5) * .38
        y = .028 * math.sin((u - .5) * math.pi)
        z = 0.0
        radius = .018 if lower else .016
        height = .105 if lower else .115
        ring = len(vertices)
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            vertices.append((x + radius * math.cos(angle), y + radius * math.sin(angle), z))
        tip = len(vertices)
        vertices.append((x, y, z + (height if lower else -height)))
        for side in range(sides):
            faces.append((ring + side, ring + (side + 1) % sides, tip))
        # The base cap makes each tooth a closed component and costs only eight
        # more triangles; 10 teeth + 9 strip quads = 249 triangles.
        centre = len(vertices)
        vertices.append((x, y, z))
        for side in range(sides):
            faces.append((centre, ring + (side + 1) % sides, ring + side))
    # Curved strip rails sit behind the cone bases and are deliberately thin.
    rail = len(vertices)
    for tooth in range(count):
        u = tooth / float(count - 1)
        x = (u - .5) * .38
        y = .028 * math.sin((u - .5) * math.pi)
        vertices.extend([(x, y - .012, .004), (x, y + .012, .004)])
    for tooth in range(count - 1):
        a, b = rail + tooth * 2, rail + (tooth + 1) * 2
        faces.append((a, b, b + 1, a + 1))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj["license"] = "CC0 1.0"
    obj["asset_role"] = "curved tooth strip"
    material = bpy.data.materials.new(name + "_ivory_CC0")
    material.diffuse_color = (.82, .68, .48, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (.82, .68, .48, 1.0)
        bsdf.inputs["Roughness"].default_value = .48
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.material_index = 0
    return obj


def write_strip(path, lower=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = _mesh_strip("teeth_strip_lower" if lower else "teeth_strip_upper", lower=lower)
    # ``use_empty=True`` is not enough to suppress the startup scene on every
    # Blender 3.6 macOS build. Remove its camera/light/cube explicitly so the
    # kit GLB is truly a single strip and cannot leak a two-unit cube into a
    # shark mouth.
    for helper in list(bpy.data.objects):
        # Blender's RNA wrapper equality is not identity-stable across the
        # factory reset/import boundary.  Compare the authored object name so
        # the startup cube can never leak into the exported kit.
        if helper.name != obj.name:
            bpy.data.objects.remove(helper, do_unlink=True)
    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)
    if triangles > 300:
        raise RuntimeError("tooth strip exceeds 300 triangles: %d" % triangles)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_animations=False,
                              export_image_format="JPEG", export_jpeg_quality=90)
    print("WROTE", path, "tris", triangles, "bytes", os.path.getsize(path))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default=os.path.join("assets", "kit"))
    args = parser.parse_args(argv)
    os.makedirs(args.out_dir, exist_ok=True)
    write_strip(os.path.join(args.out_dir, "teeth_strip_upper.glb"), lower=False)
    write_strip(os.path.join(args.out_dir, "teeth_strip_lower.glb"), lower=True)


if __name__ == "__main__":
    main()
