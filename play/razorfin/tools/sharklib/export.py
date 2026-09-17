"""glTF/GLB export helpers."""

import os

import bpy


def export_glb(low, rig, path, extras=None):
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    rig.select_set(True)
    for extra in (extras or {}).get("objects", {}):
        obj = bpy.data.objects.get(extra) if isinstance(extra, str) else extra
        if obj:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=False, export_animations=False,
                              export_image_format="JPEG", export_jpeg_quality=85,
                              export_skins=True, export_yup=True)
    size = os.path.getsize(path)
    print("LOW final tris", _tri_count(low), "dims", tuple(round(v, 4) for v in low.dimensions))
    print("WROTE", path, size, "bytes")
    return path


def _tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)
