"""Finalise, rig, export, and render an authored Razorfin family.

L1's rig/export modules can provide richer implementations when they are
available.  This module keeps a small Blender 3.6-compatible fallback so the
pilot recipes are runnable in a fresh checkout, and logs that fallback rather
than silently pretending an upstream operation happened.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

try:
    import bpy
    import mathutils
    from mathutils import Vector
except ImportError:  # pragma: no cover
    bpy = None
    mathutils = None
    Vector = None


BONE_NAMES = ("Tail3", "Tail2", "Tail1", "Spine2", "Spine1", "Neck", "Head", "LowerJaw")


def _triangles(obj):
    if not obj or obj.type != "MESH":
        return 0
    return int(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons))


def _bbox(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


def _topology_signature(obj):
    if not obj or obj.type != "MESH":
        return None
    return (len(obj.data.vertices), len(obj.data.edges), len(obj.data.polygons))


def topology_changed(hi, low):
    return _topology_signature(hi) != _topology_signature(low)


def ensure_uv(obj, changed=False):
    """Re-UV edited topology, keeping an existing authored UV when possible."""
    if not obj or obj.type != "MESH":
        return False
    if not changed and obj.data.uv_layers:
        return False
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    previous = bpy.context.view_layer.objects.active
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.006)
        bpy.ops.object.mode_set(mode="OBJECT")
        print("FINISH UV smart_project topology_changed=%s" % bool(changed))
        return True
    except Exception as exc:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
        print("FINISH WARN UV re-UV skipped: %s" % exc)
        return False
    finally:
        if previous and previous.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = previous


def _normal_material(obj, normal_image):
    material = obj.active_material
    if material is None:
        material = bpy.data.materials.new(obj.name + "_finish_mat")
        material.use_nodes = True
        obj.data.materials.append(material)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        output = next((node for node in nodes if node.type == "OUTPUT_MATERIAL"), None) or nodes.new("ShaderNodeOutputMaterial")
        links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    tex = next((node for node in nodes if node.name == "RF_FamilyNormal"), None) or nodes.new("ShaderNodeTexImage")
    tex.name = "RF_FamilyNormal"
    tex.label = "Razorfin EMIT + NORMAL rebake"
    tex.image = normal_image
    tex.image.colorspace_settings.name = "Non-Color"
    normal = next((node for node in nodes if node.type == "NORMAL_MAP" and node.name == "RF_FamilyNormalMap"), None)
    normal = normal or nodes.new("ShaderNodeNormalMap")
    normal.name = "RF_FamilyNormalMap"
    links.new(tex.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def rebake_emit_normal(low, hi, resolution=512):
    """Rebake EMIT and NORMAL from the preserved ``hi`` duplicate.

    The Cycles calls are opt-in because the pilot's deterministic CPU paint
    path is faster and Blender 3.6's headless EEVEE context cannot bake.  The
    exact calls and selected-to-active setup are retained for a production
    verification run via ``RAZORFIN_EMIT_BAKE=1``.
    """
    normal_image = None
    for slot in low.material_slots:
        material = slot.material
        if not material or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type != "TEX_IMAGE" or not node.image:
                continue
            name = (node.name + " " + node.image.name).lower()
            if "normal" in name or "nrm" in name:
                normal_image = node.image
                break
        if normal_image is not None:
            break
    attempted = os.environ.get("RAZORFIN_EMIT_BAKE") == "1"
    baked = False
    if attempted and normal_image is not None:
        scene = bpy.context.scene
        old_engine = scene.render.engine
        old_materials = list(low.data.materials)
        try:
            emit = bpy.data.materials.new(low.name + "_temporary_emit_rebake")
            emit.use_nodes = True
            nodes = emit.node_tree.nodes
            links = emit.node_tree.links
            nodes.clear()
            output = nodes.new("ShaderNodeOutputMaterial")
            emission = nodes.new("ShaderNodeEmission")
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = normal_image
            tex.select = True
            nodes.active = tex
            links.new(tex.outputs["Color"], emission.inputs["Color"])
            links.new(emission.outputs["Emission"], output.inputs["Surface"])
            low.data.materials.clear()
            low.data.materials.append(emit)
            bpy.ops.object.select_all(action="DESELECT")
            hi.select_set(True)
            low.select_set(True)
            bpy.context.view_layer.objects.active = low
            scene.render.engine = "CYCLES"
            # Explicit EMIT transfer from the hi duplicate. This is the same
            # lighting-free contract as shark_bake.py's diffuse bake.
            bpy.ops.object.bake(type="EMIT", use_selected_to_active=True, margin=4)
            # NORMAL rebake immediately follows, targeting the normal image.
            bpy.ops.object.bake(type="NORMAL", use_selected_to_active=True,
                                normal_space="TANGENT", margin=4)
            baked = True
        except Exception as exc:  # pragma: no cover - depends on local Cycles build.
            print("FINISH WARN EMIT+NORMAL rebake unavailable: %s" % exc)
        finally:
            low.data.materials.clear()
            for material in old_materials:
                low.data.materials.append(material)
            scene.render.engine = old_engine
    if not baked:
        if normal_image is not None:
            print("FINISH STUB EMIT+NORMAL rebake: hi duplicate retained; imported normal reused")
        else:
            print("FINISH STUB EMIT+NORMAL rebake: hi duplicate retained; no normal image allocated")
    if normal_image is not None:
        _normal_material(low, normal_image)
    return {"image": normal_image, "attempted": attempted, "baked": baked}


def _load_external_weights(value):
    if not value:
        return {}
    if isinstance(value, dict):
        value = value.get("base", value)
        if not isinstance(value, dict):
            return {}
        return {int(key): float(weight) for key, weight in value.items()}
    path = Path(value)
    if not path.exists():
        print("FINISH WARN external LowerJaw weights not found: %s" % path)
        return {}
    try:
        payload = json.loads(path.read_text())
        if isinstance(payload, dict) and "weights" in payload:
            payload = payload["weights"]
        return {int(key): float(weight) for key, weight in payload.items()}
    except Exception as exc:
        print("FINISH WARN external LowerJaw weights unreadable: %s" % exc)
        return {}


def _remove_armature_from_mesh(obj):
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    obj.parent = None
    obj.vertex_groups.clear()


def _fallback_rig(low, external_weights=None):
    """Analytic fallback rig with the exact family bone contract."""
    _remove_armature_from_mesh(low)
    for armature in [o for o in list(bpy.data.objects) if o.type == "ARMATURE" and o.name.startswith(low.name + "_")]:
        bpy.data.objects.remove(armature, do_unlink=True)
    coords = np.asarray([[vertex.co.x, vertex.co.y, vertex.co.z] for vertex in low.data.vertices], dtype=np.float32)
    if len(coords) == 0:
        raise RuntimeError("cannot rig empty mesh")
    ext = coords.max(axis=0) - coords.min(axis=0)
    body_axis = int(np.argmax(ext))
    lo = float(coords[:, body_axis].min())
    hi = float(coords[:, body_axis].max())
    length = max(1.0e-6, hi - lo)
    cross = [axis for axis in range(3) if axis != body_axis]
    cross_center = np.median(coords[:, cross], axis=0)
    dorsal_axis = cross[int(np.argmax(ext[cross]))]
    dorsal_center = float(np.median(coords[:, dorsal_axis]))
    up_sign = 1.0 if float(np.percentile(coords[:, dorsal_axis] - dorsal_center, 98)) >= float(np.percentile(dorsal_center - coords[:, dorsal_axis], 98)) else -1.0

    data = bpy.data.armatures.new(low.name + "_arm")
    rig = bpy.data.objects.new(low.name + "_rig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    stations = (0.00, 0.12, 0.24, 0.38, 0.52, 0.66, 0.80, 1.00)
    previous = None
    for name, t0, t1 in zip(BONE_NAMES[:7], stations[:-1], stations[1:]):
        bone = data.edit_bones.new(name)
        head = [0.0, 0.0, 0.0]
        tail = [0.0, 0.0, 0.0]
        head[body_axis] = lo + length * t0
        tail[body_axis] = lo + length * t1
        head[dorsal_axis] = dorsal_center
        tail[dorsal_axis] = dorsal_center
        bone.head = head
        bone.tail = tail
        if previous:
            bone.parent = previous
            bone.use_connect = True
        previous = bone
    jaw = data.edit_bones.new("LowerJaw")
    jhead = [0.0, 0.0, 0.0]
    jtail = [0.0, 0.0, 0.0]
    jhead[body_axis] = lo + length * 0.76
    jtail[body_axis] = lo + length * 0.98
    jhead[dorsal_axis] = dorsal_center - up_sign * float(ext[dorsal_axis]) * 0.16
    jtail[dorsal_axis] = dorsal_center - up_sign * float(ext[dorsal_axis]) * 0.20
    jaw.head = jhead
    jaw.tail = jtail
    jaw.parent = data.edit_bones["Head"]
    bpy.ops.object.mode_set(mode="OBJECT")

    for name in BONE_NAMES:
        low.vertex_groups.new(name=name)
    external_weights = _load_external_weights(external_weights)
    stations_named = list(zip(BONE_NAMES[:7], stations))
    orphan = 0
    lower_group = low.vertex_groups["LowerJaw"]
    for vertex in low.data.vertices:
        index = vertex.index
        t = max(0.0, min(1.0, (float(vertex.co[body_axis]) - lo) / length))
        if index in external_weights:
            lower_group.add([index], max(0.0, min(1.0, external_weights[index])), "REPLACE")
            if external_weights[index] >= 0.999:
                continue
        assigned = False
        for (name0, t0), (name1, t1) in zip(stations_named[:-1], stations_named[1:]):
            if t0 <= t <= t1:
                blend = (t - t0) / max(1.0e-7, t1 - t0)
                blend = blend * blend * (3.0 - 2.0 * blend)
                low.vertex_groups[name0].add([index], 1.0 - blend, "REPLACE")
                low.vertex_groups[name1].add([index], blend, "ADD")
                assigned = True
                break
        if not assigned:
            low.vertex_groups["Tail3" if t < 0.12 else "Head"].add([index], 1.0, "REPLACE")
        # Lower lip/cavity approximation for a scan before the mouth module
        # lands: only the lower head band receives this weight.
        lower_t = t > 0.76
        lower_side = float(vertex.co[dorsal_axis]) < dorsal_center - up_sign * float(ext[dorsal_axis]) * 0.05
        if lower_t and lower_side:
            weight = min(0.78, max(0.0, (t - 0.76) / 0.20))
            lower_group.add([index], weight, "REPLACE")
    modifier = low.modifiers.new("RazorfinArmature", "ARMATURE")
    modifier.object = rig
    low.parent = rig
    return rig, orphan


def rig_family(low, external_weights=None, rig_module=None, measurement=None):
    """Use L1's rig op when available, otherwise retain a logged fallback."""
    if rig_module:
        for name in ("rig_family", "build_rig", "rig"):
            operation = getattr(rig_module, name, None)
            if not callable(operation):
                continue
            calls = (
                ((low,), {"name": low.name, "lower_jaw_weights": external_weights, "measurement": measurement}),
                ((low, low.name), {"lower_jaw_weights": external_weights, "measurement": measurement}),
                ((low,), {"external_weights": external_weights}),
                ((low,), {}),
            )
            for args, kwargs in calls:
                try:
                    result = operation(*args, **kwargs)
                    if result:
                        print("FINISH rig via sharklib.rig.%s" % name)
                        # L1's build_rig returns (armature_object, audit).
                        # Older drops may return the object directly.
                        if isinstance(result, tuple) and result and hasattr(result[0], "type"):
                            audit = result[1] if len(result) > 1 else 0
                            return result[0], audit
                        return result, 0
                except TypeError:
                    continue
                except Exception as exc:
                    print("FINISH WARN rig op %s failed: %s" % (name, exc))
                    break
    print("FINISH STUB sharklib.rig: analytic eight-bone fallback")
    return _fallback_rig(low, external_weights)


def _repair_orphan_weights(low):
    """Cover vertices L1's bone-heat fallback can leave unweighted."""
    spine = tuple(BONE_NAMES[:7])
    groups = {name: low.vertex_groups.get(name) for name in spine}
    available = [(name, group) for name, group in groups.items() if group is not None]
    if not available:
        return 0
    coords = np.asarray([[vertex.co.x, vertex.co.y, vertex.co.z] for vertex in low.data.vertices], dtype=np.float32)
    ext = coords.max(axis=0) - coords.min(axis=0)
    axis = int(np.argmax(ext))
    lo = float(coords[:, axis].min()); length = max(1.0e-7, float(ext[axis]))
    stations = np.asarray((0.06, 0.18, 0.30, 0.45, 0.59, 0.73, 0.90), dtype=np.float32)
    repaired = 0
    for vertex in low.data.vertices:
        if any(item.weight > 0.0001 for item in vertex.groups):
            continue
        t = max(0.0, min(1.0, (float(vertex.co[axis]) - lo) / length))
        index = int(np.argmin(np.abs(stations - t)))
        available[index][1].add([vertex.index], 1.0, "REPLACE")
        repaired += 1
    if repaired:
        print("FINISH repaired orphan weights=%d" % repaired)
    return repaired


def _export(low, rig, path, extras=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    rig.select_set(True)
    for extra in extras or []:
        obj = bpy.data.objects.get(extra) if isinstance(extra, str) else extra
        if obj and obj.type == "MESH":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = low
    kwargs = dict(filepath=str(path), export_format="GLB", use_selection=True,
                  export_apply=False, export_animations=False,
                  export_image_format="JPEG", export_jpeg_quality=85,
                  export_skins=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        # Blender 4 renamed/removed a few export options; preserve the flags
        # accepted by the installed build while keeping the plan's defaults.
        kwargs.pop("export_jpeg_quality", None)
        bpy.ops.export_scene.gltf(**kwargs)
    return path.stat().st_size if path.exists() else 0


def _join_mouth_objects(low, extras):
    """Join authored mouth meshes into the one exported skinned body.

    L1 skins Cavity/LowerLip/UpperTeeth/LowerTeeth with the same armature and
    named Head/LowerJaw groups. Blender's mesh join preserves those groups,
    materials, and the active body's armature modifier; exporting the joined
    object yields one skinned glTF mesh with per-material primitives, which is
    the shape the runtime primitive merger expects.
    """
    names = [str(value) for value in (extras or [])]
    mouth = [bpy.data.objects.get(name) for name in names]
    mouth = [obj for obj in mouth if obj and obj.type == "MESH" and obj != low]
    if not mouth:
        return low, []
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    for obj in mouth:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = low
    try:
        bpy.ops.object.join()
    except Exception as exc:
        bpy.ops.object.select_all(action="DESELECT")
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        raise RuntimeError("mouth mesh join failed: %s" % exc)
    low["rf_mouth_joined"] = True
    low["rf_mouth_joined_objects"] = ",".join(names)
    print("FINISH joined mouth meshes=%s" % ",".join(names), flush=True)

    # The mouth cut leaves a few SHORT edges whose two endpoints sit on
    # opposite sides of the jaw-weight gradient.  Those are the only edges the
    # S3 stretch gate can trip: the gate is a pure length RATIO, so an edge a
    # few ten-thousandths of a body length long that swings even slightly
    # reports a huge multiple, while a real tear would show up as a large
    # absolute separation.
    #
    # Collapse ONLY that intersection - short AND straddling the gradient.  A
    # plain length-thresholded remove_doubles is the wrong tool here: at the
    # threshold needed to catch these, ~37% of the mesh is within range (dense
    # scan topology), and welding it destroys the authored mouth.
    # The threshold has to be relative to the mesh's OWN edge-length
    # distribution, not a fixed fraction of body length.  On a family that went
    # through accessories the body has been voxel-remeshed to a near-uniform
    # edge length, and a flat 0.005L then matches a quarter of every edge in
    # the mesh: aresrender lost 1,431 of 5,504 verts (26%) to this pass, which
    # is what tore its head open.  Use a low percentile of the real edge
    # lengths, hard-capped at the old value, so only genuine slivers qualify.
    dims = [float(value) for value in low.dimensions]
    limit = max(dims) * 0.005 if max(dims) > 0 else 0.0
    try:
        _lengths = np.asarray([
            (low.data.vertices[e.vertices[0]].co - low.data.vertices[e.vertices[1]].co).length
            for e in low.data.edges], dtype=np.float32)
        if _lengths.size:
            # A body that went through accessories has been voxel-remeshed, and
            # the remesh leaves far more degenerate jaw-seam geometry than a
            # plain scan does (isolated: leviathanrex probes 1.55x stretch with
            # its plate_row removed and 13.8x with it, so the tearing edges are
            # produced by L2's remesh, not by the mouth cut).  Those meshes need
            # a wider sliver window; a plain scan keeps the tight one.
            # A wider window was tried on the remeshed bodies (p8) and rejected:
            # on leviathanrex it collapsed 657 edges / 512 verts and still left
            # 9.96x stretch, because the tearing edges are full-length edges the
            # remesh created across the jaw-weight gradient, not slivers.
            _pct = 3.0
            limit = min(limit, float(np.percentile(_lengths, _pct)))
            print("FINISH sliver limit=%.6f (p%g of %d edges, cap %.6f, remeshed=%s)"
                  % (limit, _pct, _lengths.size, max(dims) * 0.005,
                     bool(low.get("rf_accessory_fused"))), flush=True)
    except Exception as exc:
        print("FINISH WARN adaptive sliver limit unavailable: %s" % exc, flush=True)
    if os.environ.get("RAZORFIN_NO_COLLAPSE") == "1":
        print("FINISH sliver collapse DISABLED by RAZORFIN_NO_COLLAPSE", flush=True)
        limit = 0.0
    jaw_group = low.vertex_groups.get("LowerJaw")
    if limit > 0.0 and jaw_group is not None:
        before = len(low.data.vertices)
        try:
            import bmesh

            jaw_weight = {}
            for vertex in low.data.vertices:
                jaw_weight[vertex.index] = next(
                    (float(item.weight) for item in vertex.groups
                     if item.group == jaw_group.index), 0.0)

            mesh = bmesh.new()
            mesh.from_mesh(low.data)
            mesh.verts.ensure_lookup_table()
            targets = []
            for edge in mesh.edges:
                if edge.calc_length() >= limit:
                    continue
                a = jaw_weight.get(edge.verts[0].index, 0.0)
                b = jaw_weight.get(edge.verts[1].index, 0.0)
                # Both ends must actually move (otherwise the edge is rigid and
                # cannot stretch), and at least one end must be part-weighted,
                # which is what makes the two ends travel different distances.
                if max(a, b) > 0.05 and min(a, b) < 0.95:
                    targets.append(edge)
            if targets:
                bmesh.ops.collapse(mesh, edges=targets, uvs=True)
                mesh.to_mesh(low.data)
                low.data.update()
                print("FINISH collapsed %d jaw-seam slivers (<%.6f) verts %d -> %d"
                      % (len(targets), limit, before, len(low.data.vertices)), flush=True)
            else:
                print("FINISH no jaw-seam slivers under %.6f" % limit, flush=True)
            mesh.free()
        except Exception as exc:
            print("FINISH WARN sliver collapse skipped: %s" % exc, flush=True)
    return low, names


def _normalize_joined_mouth_skin(low, authored_base=None, island_weights=None):
    """Make the joined mouth a rigid jaw island, KEEPING the authored body lip.

    The authored mouth islands (Cavity/LowerLip/UpperTeeth/LowerTeeth) are
    pinned fully to LowerJaw so they swing as one rigid piece.  The original
    scan vertices keep the LowerJaw weights that ``mouth._jaw_weight_map``
    authored and ``rig._apply_external_weights`` applied: that forward lower
    lip band is exactly what the S3 probe measures as the moving lower lip on
    the body primitive, so stripping it (as an earlier revision did) left the
    body with zero jaw influence and the probe reported "no vertices weighted
    to LowerJaw".

    Only *stray* jaw weight is cleaned up - scan vertices behind the hinge or
    above the jaw line that the legacy bone-heat pass can leave faintly
    jaw-weighted.  Those are the ones that show up as upper-head drift and
    edge stretch, and they are identified geometrically rather than by
    removing every body weight.
    """
    if not low or low.type != "MESH":
        return {"mouth": 0, "body_jaw_removed": 0, "z_drop": 0.0}
    mouth_slots = set()
    for slot_index, slot in enumerate(low.material_slots):
        name = (slot.material.name if slot.material else "").lower()
        if any(tag in name for tag in ("cavity", "lowerlip", "lowerteeth", "upperteeth", "teeth_strip")):
            mouth_slots.add(slot_index)
    mouth_vertices = set()
    for polygon in low.data.polygons:
        if polygon.material_index in mouth_slots:
            mouth_vertices.update(polygon.vertices)
    if not mouth_vertices:
        return {"mouth": 0, "body_jaw_removed": 0, "z_drop": 0.0}

    jaw = low.vertex_groups.get("LowerJaw") or low.vertex_groups.new(name="LowerJaw")
    head = low.vertex_groups.get("Head") or low.vertex_groups.new(name="Head")
    group_map = {group.index: group for group in low.vertex_groups}

    coords = np.asarray([[float(vertex.co.x), float(vertex.co.y), float(vertex.co.z)]
                         for vertex in low.data.vertices], dtype=np.float32)

    # The authored body lip band comes from mouth._jaw_weight_map, applied to
    # the LowerJaw VERTEX GROUP by rig._apply_external_weights before the seam
    # weld runs.  The weld renumbers vertices, so the payload's original
    # indices are stale here; the vertex group is not, and it is the same
    # information.  Anything already carrying real LowerJaw weight on the body
    # is the authored lower lip and must be preserved -- that band is exactly
    # what the S3 probe measures on the body primitive.
    protected = set()
    protected_weights = {}
    for vertex in low.data.vertices:
        for item in vertex.groups:
            if item.group == jaw.index and item.weight > 0.05:
                protected.add(vertex.index)
                # Only the SCAN vertices form the body lip band the probe
                # measures on the body primitive.  The authored zz_* islands
                # are already pinned near 1.0, so including them made the
                # rescale below a no-op on exactly the families that needed it.
                if vertex.index not in mouth_vertices:
                    protected_weights[vertex.index] = float(item.weight)
                break

    # Normalise the authored body lip band so its STRONGEST vertex reaches 1.0.
    #
    # mouth._jaw_weight_map (L1, not owned by this lane) produces a band whose
    # peak weight varies a lot with the base: on greatwhite_cy/tigershark-blunt
    # it saturates near 1.0, but on the whaler and on a head-latticed tigershark
    # it peaks around .35-.5, so the lip barely travels when LowerJaw rotates
    # and hse/probe_jaw.mjs reports lower-lip movement below its .03L floor.
    #
    # This rescales, it does not re-author: the band's SHAPE (which vertices
    # move, and their relative amounts) is exactly what mouth.py decided, and
    # the smoothstep falloff at the hinge that keeps the seam from tearing is
    # preserved because every weight is multiplied by the same factor.  Vertices
    # outside the band are untouched, so no jaw weight bleeds into the skull.
    if protected_weights:
        _peak = max(protected_weights.values())
        if 0.0 < _peak < 0.995:
            _gain = 1.0 / _peak
            for _index, _weight in protected_weights.items():
                _scaled = max(0.0, min(1.0, _weight * _gain))
                jaw.add([_index], _scaled, "REPLACE")
                head.add([_index], 1.0 - _scaled, "REPLACE")
                protected_weights[_index] = _scaled
            print("FINISH lip band gain=%.3f peak %.3f -> 1.000 over %d verts"
                  % (_gain, _peak, len(protected_weights)), flush=True)
        else:
            print("FINISH lip band peak=%.3f already saturated (%d verts)"
                  % (_peak, len(protected_weights)), flush=True)

    # The join concatenates each mouth object's vertices after the body's, in
    # the order they were selected, so the authored per-object maps are
    # re-indexed onto the joined mesh by walking that same order.
    island_map = {}
    if isinstance(island_weights, dict):
        ordered = sorted(mouth_vertices)
        cursor = 0
        for _name, mapping in island_weights.items():
            if not isinstance(mapping, dict):
                continue
            size = len(mapping)
            chunk = ordered[cursor:cursor + size]
            for local, joined_index in enumerate(chunk):
                try:
                    island_map[joined_index] = float(mapping.get(local, mapping.get(str(local), 0.0)))
                except (TypeError, ValueError):
                    island_map[joined_index] = 0.0
            cursor += size

    body_jaw_removed = 0
    for vertex in low.data.vertices:
        index = vertex.index
        if index in mouth_vertices:
            # The authored islands are NOT uniformly jaw-weighted: mouth.py
            # gives the cavity's upper ring and the lip's commissure a Head
            # share on purpose, so the roof of the mouth stays with the skull
            # while the floor swings.  Forcing the whole island to 1.0 tore the
            # seam (the S3 stretch gate caught it at 3.9x), so the authored
            # weight is honoured and only the Head remainder is rebuilt.
            weight = island_map.get(index)
            if weight is None:
                weight = 1.0
            weight = max(0.0, min(1.0, float(weight)))
            for group in group_map.values():
                if group.index not in (jaw.index, head.index):
                    try:
                        group.remove([index])
                    except RuntimeError:
                        pass
            jaw.add([index], weight, "REPLACE")
            head.add([index], 1.0 - weight, "REPLACE")
            continue
        jaw_weight = next((float(item.weight) for item in vertex.groups
                           if item.group == jaw.index), 0.0)
        if jaw_weight <= 0.0001:
            continue
        # Authored lip band: keep the mouth module's weight untouched.
        if index in protected:
            continue
        # Stray legacy weight outside the lip envelope: drop it and
        # renormalize whatever the vertex still belongs to.
        old = [(item.group, max(0.0, float(item.weight)))
               for item in vertex.groups if item.group != jaw.index and item.weight > 0.0001]
        try:
            jaw.remove([index])
        except RuntimeError:
            pass
        if not old:
            head.add([index], 1.0, "REPLACE")
            body_jaw_removed += 1
            continue
        total = sum(weight for _, weight in old)
        if total <= 1.0e-8:
            head.add([index], 1.0, "REPLACE")
            body_jaw_removed += 1
            continue
        for group_index, weight in old:
            group = group_map.get(group_index)
            if group:
                group.add([index], weight / total, "REPLACE")
        body_jaw_removed += 1

    # NOTE: an earlier revision narrowed the body laterally here because the
    # S3 probe inferred "up" as the second-largest bbox axis and picked the
    # shark's width.  S3 now infers the vertical from the jaw-vs-head centroid
    # separation, so that correction is gone: these bases keep their real
    # proportions.
    coords = np.asarray([[float(vertex.co.x), float(vertex.co.y), float(vertex.co.z)]
                         for vertex in low.data.vertices], dtype=np.float32)
    ext = coords.max(axis=0) - coords.min(axis=0)
    lateral_scale = 1.0
    z_drop = 0.0
    low["rf_mouth_jaw_vertices"] = len(mouth_vertices)
    low["rf_body_lowerjaw_removed"] = body_jaw_removed
    low["rf_mouth_z_drop"] = float(z_drop)
    low["rf_lateral_scale"] = float(lateral_scale)
    print("FINISH normalized mouth skin mouth=%d body_jaw_removed=%d z_drop=%.5f" %
          (len(mouth_vertices), body_jaw_removed, z_drop), flush=True)
    return {"mouth": len(mouth_vertices), "body_jaw_removed": body_jaw_removed, "z_drop": z_drop}


def _world_frame(obj):
    verts = np.asarray([[*(obj.matrix_world @ vertex.co)] for vertex in obj.data.vertices], dtype=np.float32)
    lo = verts.min(axis=0); hi = verts.max(axis=0); ext = hi - lo
    axis = int(np.argmax(ext))
    direction = np.zeros(3, dtype=np.float32); direction[axis] = 1.0
    centre = (lo + hi) * 0.5
    world_up = np.asarray((0.0, 0.0, 1.0), dtype=np.float32)
    if abs(float(np.dot(direction, world_up))) > 0.92:
        world_up = np.asarray((0.0, 1.0, 0.0), dtype=np.float32)
    radial1 = np.cross(direction, world_up); radial1 /= max(1.0e-7, np.linalg.norm(radial1))
    radial2 = np.cross(direction, radial1); radial2 /= max(1.0e-7, np.linalg.norm(radial2))
    return centre, direction, radial1, radial2, ext


def _look_at(camera, position, target):
    camera.location = tuple(float(x) for x in position)
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def _make_light(name, kind, energy, color, location, size=4.0):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if hasattr(data, "shape"):
        data.shape = "DISK"
        data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    return light


def _render_turntable(low, rig, family, root, turntable_cfg=None):
    """Render four quarter-turns plus closed/open mouth frames and compose."""
    turntable_cfg = turntable_cfg or {}
    review = Path(root) / "assets" / "review"
    review.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    print("FINISH render stage=start", flush=True)
    requested_engine = os.environ.get("RAZORFIN_RENDER_ENGINE", "CYCLES")
    try:
        if requested_engine in {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}:
            scene.render.engine = requested_engine
        else:
            scene.render.engine = "CYCLES"
    except Exception:
        scene.render.engine = "CYCLES"
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = int(turntable_cfg.get("cycles_samples", 8))
        scene.cycles.device = "CPU"
        print("FINISH STUB EEVEE headless OpenGL render: using Cycles CPU", flush=True)
    scene.render.resolution_x = int(turntable_cfg.get("resolution", 512))
    scene.render.resolution_y = int(turntable_cfg.get("resolution", 512))
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.exposure = float(turntable_cfg.get("exposure", 0.0))
    try:
        scene.view_settings.view_transform = "Standard"
    except Exception:
        pass
    print("FINISH render stage=settings engine=%s" % scene.render.engine, flush=True)
    if scene.world is None:
        scene.world = bpy.data.worlds.new(family + "_turntable_world")
    # #3a4046 expressed as linear scene values, with Standard view transform.
    background_srgb = np.asarray((0x3a / 255.0, 0x40 / 255.0, 0x46 / 255.0), dtype=np.float32)
    background_linear = np.where(background_srgb <= 0.04045,
                                  background_srgb / 12.92,
                                  ((background_srgb + 0.055) / 1.055) ** 2.4)
    scene.world.color = tuple(float(value) for value in background_linear)
    scene.world.use_nodes = True
    if scene.world.use_nodes:
        background = next((node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND"), None)
        if background:
            background.inputs["Color"].default_value = (*[float(value) for value in background_linear], 1.0)
            background.inputs["Strength"].default_value = 1.0
    centre, direction, radial1, radial2, ext = _world_frame(low)
    camera_data = bpy.data.cameras.new(family + "_turntable_camera")
    camera = bpy.data.objects.new(family + "_turntable_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    print("FINISH render stage=camera_ready", flush=True)
    camera_data.lens = float(turntable_cfg.get("lens", 54.0))
    # The sheet cells are square, so pin the sensor to the horizontal axis;
    # with AUTO the effective FOV depends on the render aspect and the framing
    # maths silently disagrees with what is rendered.
    camera_data.sensor_fit = "HORIZONTAL"
    target_fill = float(turntable_cfg.get("fill_fraction", 0.80))
    sensor_half_angle = math.atan(float(camera_data.sensor_width) / (2.0 * camera_data.lens))
    # Frame on the body's LONG axis: side-on that is the frame width, and it is
    # the dimension the reviewer is judging.  ``ext`` also carries the whip tip
    # and any dorsal accessory, so this is the true silhouette, not just the
    # torso.
    radius = float(max(ext) / max(2.0 * target_fill * math.tan(sensor_half_angle), 1.0e-6))
    light_radius = float(max(ext) * 1.8)
    # Blender area-light energy is watts, so the illuminance falls off with the
    # square of the distance.  ``light_radius`` scales with the model, so fixed
    # wattages made small families blow out to white while large ones went
    # dark.  Scale the energies with the placement distance instead: the
    # key/fill/rim RATIO is the authored look, and the absolute level is tuned
    # once so a mid-grey hide renders as mid-grey.
    watt = float(turntable_cfg.get("key_watts_per_unit2", 15.0)) * (light_radius ** 2)
    lights = [
        _make_light(family + "_key", "AREA", watt, (1.0, 0.93, 0.86), centre + radial1 * light_radius * 0.72 + radial2 * light_radius * 0.25, max(ext) * 0.7),
        _make_light(family + "_fill", "AREA", watt * 0.38, (0.72, 0.82, 1.0), centre - radial1 * light_radius * 0.55 + radial2 * light_radius * 0.10, max(ext) * 0.9),
        _make_light(family + "_rim", "AREA", watt * 0.55, (0.78, 0.88, 1.0), centre + direction * light_radius * 0.40 + radial2 * light_radius * 0.78, max(ext) * 0.5),
    ]
    print("FINISH render lights key=%.1fW radius=%.4f" % (watt, light_radius), flush=True)
    for light in lights:
        light.rotation_euler = (Vector(centre) - light.location).to_track_quat("-Z", "Y").to_euler()
    print("FINISH render stage=lights_ready", flush=True)
    # World-space positions of the authored mouth, used to aim the close-ups.
    mouth_world = None
    try:
        mouth_slots = {i for i, slot in enumerate(low.material_slots)
                       if slot.material and any(tag in slot.material.name.lower() for tag in
                                                ("cavity", "lowerlip", "lowerteeth", "upperteeth", "teeth_strip"))}
        if mouth_slots:
            picked = set()
            for polygon in low.data.polygons:
                if polygon.material_index in mouth_slots:
                    picked.update(polygon.vertices)
            if picked:
                mouth_world = np.asarray([[*(low.matrix_world @ low.data.vertices[i].co)]
                                          for i in sorted(picked)], dtype=np.float32)
    except Exception as exc:
        print("FINISH WARN mouth close-up target unavailable: %s" % exc, flush=True)

    labels = ["000", "090", "180", "270", "mouth_closed", "mouth_open"]
    paths = []
    jaw_bone = rig.pose.bones.get("LowerJaw") if rig and rig.type == "ARMATURE" else None
    for index, label in enumerate(labels):
        if index < 4:
            camera_data.lens = float(turntable_cfg.get("lens", 54.0))
            angle = math.radians(index * 90.0)
            position = centre + radial1 * math.cos(angle) * radius + radial2 * math.sin(angle) * radius + direction * (radius * 0.04)
            target = centre
        else:
            open_jaw = index == 5
            if jaw_bone:
                jaw_bone.rotation_mode = "XYZ"
                jaw_bone.rotation_euler = (math.radians(25.0 if open_jaw else 0.0), 0.0, 0.0)
            camera_data.lens = float(turntable_cfg.get("close_lens", 70.0))
            # Aim at the ACTUAL mouth geometry rather than assuming which end
            # of the body axis the head is on: guessing +0.38L pointed the
            # close-up at the tail on these bases.  The mouth materials give
            # the true head centre and its real extent, so the head genuinely
            # fills the frame.
            close_target = np.asarray(centre, dtype=np.float32)
            close_span = float(max(ext)) * 0.30
            if mouth_world is not None and len(mouth_world):
                close_target = mouth_world.mean(axis=0)
                mouth_ext = mouth_world.max(axis=0) - mouth_world.min(axis=0)
                # The mouth's own bbox is a few percent of L, so framing on it
                # alone filled the cell with lip geometry and no head. Frame
                # the HEAD: at least 0.30L, so the reviewer can judge whether
                # the mouth is in the right place on the animal.
                close_span = float(max(float(mouth_ext.max()) * 2.2,
                                       float(max(ext)) * 0.30))
            close_tan = math.tan(math.atan(float(camera_data.sensor_width) /
                                           (2.0 * camera_data.lens)))
            close_radius = close_span / max(2.0 * target_fill * close_tan, 1.0e-6)
            position = close_target + radial1 * close_radius + radial2 * close_radius * 0.12
            target = close_target
        _look_at(camera, position, target)
        path = review / (".%s_%s.png" % (family, label))
        scene.render.filepath = str(path)
        print("FINISH render stage=frame label=%s" % label, flush=True)
        try:
            bpy.ops.render.render(write_still=True)
        except Exception as exc:
            print("FINISH WARN render %s failed: %s" % (label, exc))
        if path.exists():
            paths.append(path)
    if jaw_bone:
        jaw_bone.rotation_euler = (0.0, 0.0, 0.0)

    cell = int(scene.render.resolution_x)
    sheet = np.zeros((cell * 2, cell * 3, 4), dtype=np.float32)
    sheet[..., :3] = background_linear
    sheet[..., 3] = 1.0
    for index, path in enumerate(paths[:6]):
        try:
            image = bpy.data.images.load(str(path), check_existing=False)
            sw, sh = [int(x) for x in image.size]
            pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape(sh, sw, 4)
            h = min(cell, sh); w = min(cell, sw)
            # Blender pixel buffers are bottom-up, so sheet row 0 is the BOTTOM
            # of the saved PNG.  Place the frames from the bottom up to keep the
            # reviewer's reading order: 000/090/180 across the top, then
            # 270/mouth_closed/mouth_open across the bottom.
            row = 1 - (index // 3); col = index % 3
            sheet[row * cell:row * cell + h, col * cell:col * cell + w] = pixels[:h, :w]
            bpy.data.images.remove(image)
        except Exception as exc:
            print("FINISH WARN compose %s failed: %s" % (path, exc))
    output = review / (family + "_turntable.png")
    image = bpy.data.images.new(family + "_turntable", cell * 3, cell * 2, alpha=True, float_buffer=False)
    _set_image_pixels(image, sheet)
    image.filepath_raw = str(output)
    image.file_format = "PNG"
    image.save(filepath=str(output))
    for light in lights:
        bpy.data.objects.remove(light, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    for path in paths:
        try:
            path.unlink()
        except OSError:
            pass
    return {"path": str(output), "bytes": output.stat().st_size if output.exists() else 0, "frames": labels}


def _set_image_pixels(image, array):
    flat = np.ascontiguousarray(array, dtype=np.float32).reshape(-1)
    try:
        image.pixels.foreach_set(flat)
    except AttributeError:
        image.pixels = flat.tolist()
    image.update()


def _matte_mouth_materials(low):
    """Knock the specular off the authored mouth materials.

    WORKAROUND for L1 (``sharklib/mouth.py``, which this lane does not own):
    ``_material()`` gives Cavity ``Specular = .05`` and imports the tooth kit
    with its authored ivory material untouched.  Under the turntable key light
    the thin lip ribbon and the flat tooth facets return one uniform mirror
    highlight each, which reads on the sheet as white slabs floating off the
    head -- i.e. the "teeth detached from the body" symptom.  The geometry is
    correct (verified: every mouth object's world bbox sits inside the head at
    y .33-.43L); only the shading was wrong.

    Retint here rather than in mouth.py so the standalone bake path keeps its
    parity behaviour.
    """
    if not low or low.type != "MESH":
        return 0
    touched = 0
    for slot in low.material_slots:
        material = slot.material
        if not material:
            continue
        name = (material.name or "").lower()
        if not any(tag in name for tag in ("cavity", "lowerlip", "teeth")):
            continue
        if not material.use_nodes:
            continue
        principled = next((node for node in material.node_tree.nodes
                           if node.type == "BSDF_PRINCIPLED"), None)
        if principled is None:
            continue
        if "Roughness" in principled.inputs:
            principled.inputs["Roughness"].default_value = 0.86
        for key in ("Specular", "Specular IOR Level"):
            if key in principled.inputs:
                principled.inputs[key].default_value = 0.02
        for key in ("Metallic", "Sheen Weight", "Coat Weight"):
            if key in principled.inputs:
                principled.inputs[key].default_value = 0.0
        if "teeth" in name and "Base Color" in principled.inputs:
            # Real shark teeth are bone/ivory, not a white emitter.
            principled.inputs["Base Color"].default_value = (0.62, 0.60, 0.55, 1.0)
        touched += 1
    print("FINISH matte mouth materials=%d" % touched, flush=True)
    return touched


def finish_family(ctx):
    """Run the finish contract and print/return the JSON budget summary."""
    _root = Path(ctx.get("root") or os.getcwd())
    family = str(ctx["family"])
    low = ctx["low"]
    hi = ctx.get("hi") or low
    print("FINISH stage=start", flush=True)
    changed = bool(ctx.get("topology_changed", topology_changed(hi, low)))
    ensure_uv(low, changed=changed)
    print("FINISH stage=uv_ready", flush=True)
    rebake = rebake_emit_normal(low, hi, resolution=int(ctx.get("texture_size", 512)))
    print("FINISH stage=normal_ready", flush=True)
    rig, orphan = rig_family(low, ctx.get("lower_jaw_weights"), ctx.get("rig_module"), ctx.get("measurement"))
    low, joined_mouth = _join_mouth_objects(low, ctx.get("extras"))
    ctx["extras"] = []
    _payload = ctx.get("lower_jaw_weights")
    _authored_base = _payload.get("base") if isinstance(_payload, dict) else None
    _island_weights = _payload.get("objects") if isinstance(_payload, dict) else None
    _normalize_joined_mouth_skin(low, _authored_base, _island_weights)
    _repair_orphan_weights(low)
    _matte_mouth_materials(low)
    print("FINISH stage=rig_ready", flush=True)

    # Final budget guard.  The accessory pass reserves room for the mouth, but
    # a family with no accessories (thresher) never goes through it, and the
    # whip extrusion adds geometry after that reservation.  Decimate the joined
    # mesh down to the recipe budget as the last step before export; the
    # armature modifier and vertex groups survive a COLLAPSE decimate.
    tri_budget = int((ctx.get("budget") or {}).get("tris", 9000))
    if os.environ.get("RAZORFIN_NO_BUDGET_DECIMATE") == "1":
        print("FINISH budget decimate DISABLED", flush=True)
        tri_budget = 0
    current_tris = _triangles(low)
    if tri_budget > 0 and current_tris > tri_budget:
        ratio = float(tri_budget) / float(current_tris)
        modifier = low.modifiers.new("RazorfinBudget", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        previous = bpy.context.view_layer.objects.active
        bpy.context.view_layer.objects.active = low
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            print("FINISH budget decimate ratio=%.4f tris %d -> %d (budget %d)"
                  % (ratio, current_tris, _triangles(low), tri_budget), flush=True)
        except Exception as exc:
            print("FINISH WARN budget decimate failed: %s" % exc, flush=True)
        finally:
            if previous and previous.name in bpy.data.objects:
                bpy.context.view_layer.objects.active = previous

    output = _root / "assets" / "models" / "fam" / (family + ".glb")
    glb_bytes = _export(low, rig, output, ctx.get("extras"))
    print("FINISH stage=export_ready", flush=True)
    turntable = _render_turntable(low, rig, family, _root, ctx.get("turntable"))
    lo, hi_bbox = _bbox(low)
    bones = [bone.name for bone in rig.data.bones] if rig and rig.type == "ARMATURE" else []
    orphan = 0
    if low.data.vertices:
        for vertex in low.data.vertices:
            if not any(group.weight > 0.0001 for group in vertex.groups):
                orphan += 1
    texture_bytes = int(sum(item.get("bytes", 0) for item in ctx.get("paint_result", {}).get("rows", [])))
    summary = {
        "family": family,
        "tris": _triangles(low),
        "glb_bytes": int(glb_bytes),
        "texture_bytes": texture_bytes,
        "bone_set": bones,
        "orphan_weights": int(orphan),
        "bbox": {
            "min": [round(float(value), 6) for value in lo],
            "max": [round(float(value), 6) for value in hi_bbox],
            "size": [round(float(value), 6) for value in (hi_bbox - lo)],
        },
        "rebake": {"attempted": rebake["attempted"], "baked": rebake["baked"]},
        "turntable": turntable,
    }
    print("BUDGET %s" % json.dumps(summary, sort_keys=True))
    return summary
