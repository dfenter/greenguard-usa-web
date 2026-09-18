"""Razorfin armature, stations, and skin weights."""

import bpy
import mathutils


STATIONS = [("Tail3", 0.00), ("Tail2", 0.12), ("Tail1", 0.24), ("Spine2", 0.38),
            ("Spine1", 0.52), ("Neck", 0.66), ("Head", 0.80), ("Nose", 1.00)]
SPINE_ORDER = ["Tail3", "Tail2", "Tail1", "Spine2", "Spine1", "Neck", "Head"]


def audit_weights(obj):
    groups = obj.vertex_groups
    invalid = 0
    orphan = 0
    max_sum_error = 0.0
    for vertex in obj.data.vertices:
        total = sum(max(0.0, group.weight) for group in vertex.groups)
        max_sum_error = max(max_sum_error, abs(total - 1.0))
        if total <= 1e-8:
            orphan += 1
        for group in vertex.groups:
            if group.group >= len(groups) or group.weight < -1e-5:
                invalid += 1
    return {"vertices": len(obj.data.vertices), "invalid": invalid,
            "orphans": orphan, "maxSumError": max_sum_error}


def _apply_external_weights(mesh, supplied, jaw_name="LowerJaw"):
    """Apply mouth.py's per-vertex weights without invoking the old heuristic."""
    if supplied is None:
        return False
    data = supplied.get("base", supplied) if isinstance(supplied, dict) else supplied
    if not isinstance(data, dict):
        raise TypeError("external LowerJaw weights must be a vertex->weight map or payload with base")
    jaw = mesh.vertex_groups.get(jaw_name) or mesh.vertex_groups.new(name=jaw_name)
    head = mesh.vertex_groups.get("Head")
    for index, value in data.items():
        index = int(index)
        if index < 0 or index >= len(mesh.data.vertices):
            continue
        weight = max(0.0, min(1.0, float(value)))
        vertex = mesh.data.vertices[index]
        other_weights = [(group.group, group.weight) for group in vertex.groups
                         if group.group != jaw.index]
        other_sum = sum(max(0.0, old_weight) for _, old_weight in other_weights)
        jaw.add([index], weight, "REPLACE")
        if other_sum > 1e-8:
            scale = (1.0 - weight) / other_sum
            for group_index, old_weight in other_weights:
                mesh.vertex_groups[group_index].add([index], max(0.0, old_weight) * scale, "REPLACE")
        else:
            jaw.add([index], 1.0, "REPLACE")
    # Mouth-owned objects carry their own maps in the payload. They are added
    # after the main object is rigged and are intentionally not mixed into the
    # legacy mesh's analytic spine weights.
    return True


def _attach_external_object(obj, rig, mapping):
    """Skin a mouth-owned cavity/teeth object after the rig exists."""
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    modifier = obj.modifiers.new("Jaw authored skin", "ARMATURE")
    modifier.object = rig
    obj.parent = rig
    for name in ("Head", "LowerJaw"):
        group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        group.add(list(range(len(obj.data.vertices))), 0.0, "REPLACE")
    jaw = obj.vertex_groups["LowerJaw"]
    head = obj.vertex_groups["Head"]
    for index, value in mapping.items():
        index = int(index)
        if index < 0 or index >= len(obj.data.vertices):
            continue
        weight = max(0.0, min(1.0, float(value)))
        jaw.add([index], weight, "REPLACE")
        head.add([index], 1.0 - weight, "REPLACE")


def _apply_legacy_jaw_band(low, ymin, L, zc, H):
    vg = low.vertex_groups.get("LowerJaw") or low.vertex_groups.new(name="LowerJaw")
    head = low.vertex_groups.get("Head")
    zcut = zc - H * .06
    for vertex in low.data.vertices:
        t = (vertex.co.y - ymin) / L
        if t <= .76 or vertex.co.z >= zcut:
            continue
        wy = min(1.0, (t - .76) / .06)
        wz = min(1.0, (zcut - vertex.co.z) / (H * .10))
        weight = wy * wz
        if weight <= .01:
            continue
        vg.add([vertex.index], weight, "REPLACE")
        if head:
            try:
                head.add([vertex.index], 1.0 - weight, "REPLACE")
            except RuntimeError:
                pass


def build_rig(low, name, lower_jaw_weights=None, measurement=None):
    """Build the legacy eight-bone rig.

    ``lower_jaw_weights`` is the mouth.py payload. When present, it is applied
    after bone heat/analytic spine weights and the legacy LowerJaw band is not
    used. With the default ``None`` path the old algorithm is byte-for-byte in
    the same order and retains its original behavior.
    """
    bb = [mathutils.Vector(c) for c in low.bound_box]
    ymin = min(c.y for c in bb)
    ymax = max(c.y for c in bb)
    zmin = min(c.z for c in bb)
    zmax = max(c.z for c in bb)
    L = ymax - ymin
    zc = (zmin + zmax) / 2
    H = zmax - zmin
    armature = bpy.data.armatures.new(name + "_arm")
    rig = bpy.data.objects.new(name + "_rig", armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    previous = None
    for index in range(len(STATIONS) - 1):
        bone_name, t0 = STATIONS[index]
        t1 = STATIONS[index + 1][1]
        bone = armature.edit_bones.new(bone_name)
        bone.head = (0, ymin + L * t0, zc)
        bone.tail = (0, ymin + L * t1, zc)
        if previous:
            bone.parent = previous
            bone.use_connect = True
        previous = bone
    jaw = armature.edit_bones.new("LowerJaw")
    jaw.head = (0, ymin + L * .80, zc - H * .18)
    jaw.tail = (0, ymin + L * .98, zc - H * .22)
    jaw.parent = armature.edit_bones["Head"]
    # JAW BIND ROLL: none, on every path (lane A6, 2026-09-17).
    #
    # Mouth-authored rigs used to take `jaw.roll = pi` so that glTF local +X
    # rotated the jaw ventrally, letting shark3d.js hinge with a hardcoded
    # `+rotateX`. It works, but it makes the LowerJaw the ONE bone in the
    # chain whose bind rotation is not near-identity: measured on the shipped
    # bakes, every other bone exports (0,0,0,1) while LowerJaw exports
    # ~(0,-0.999,0.036,0), a ~pi rotation.
    #
    # That is the root cause of the thresher jaw-stretch defect. The gate and
    # the game measure rest with the jaw at its BIND quaternion, and posing a
    # ~pi rotation collapses vertex pairs straddling the jaw seam - 1074 of
    # them on thresher against 91-435 elsewhere. Blender's bind pose has the
    # jaw at identity, so the pipeline literally could not see the lengths the
    # gate measures, and three lanes of cap work could not reach them.
    #
    # With roll 0 the bind is (-0.033,0,0,0.999), near-identity like the rest
    # of the chain, the two bases agree, and rest lengths measured in Blender
    # are the rest lengths the gate reads. The ventral direction simply moves
    # from local +X to local -X, which shark3d.js compensates for with
    # JAW_HINGE_SIGN; hse/rig_morph.js needs no change because it already
    # MEASURES which sign opens the jaw rather than assuming one.
    bpy.ops.object.mode_set(mode="OBJECT")
    low.vertex_groups.clear()
    for modifier in list(low.modifiers):
        if modifier.type == "ARMATURE":
            low.modifiers.remove(modifier)
    low.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    weighted = set()
    for vertex in low.data.vertices:
        if any(group.weight > 0.0 for group in vertex.groups):
            weighted.add(vertex.index)
    orphan_count = len(low.data.vertices) - len(weighted)
    orphan_fraction = orphan_count / max(1, len(low.data.vertices))
    print("WEIGHTS bone-heat covered %d/%d verts" % (len(weighted), len(low.data.vertices)))
    if orphan_fraction > .05:
        centres = [(bone_name, ymin + L * ((STATIONS[index][1] + STATIONS[index + 1][1]) / 2))
                   for index, bone_name in enumerate(SPINE_ORDER)]
        for bone_name in SPINE_ORDER:
            group = low.vertex_groups.get(bone_name)
            if group:
                low.vertex_groups.remove(group)
        groups = {bone_name: low.vertex_groups.new(name=bone_name) for bone_name in SPINE_ORDER}
        for vertex in low.data.vertices:
            y = vertex.co.y
            if y <= centres[0][1]:
                groups[centres[0][0]].add([vertex.index], 1.0, "REPLACE")
                continue
            if y >= centres[-1][1]:
                groups[centres[-1][0]].add([vertex.index], 1.0, "REPLACE")
                continue
            for index in range(len(centres) - 1):
                y0, y1 = centres[index][1], centres[index + 1][1]
                if y0 <= y <= y1:
                    t = (y - y0) / max(1e-9, y1 - y0)
                    t = t * t * (3 - 2 * t)
                    groups[centres[index][0]].add([vertex.index], 1.0 - t, "REPLACE")
                    groups[centres[index + 1][0]].add([vertex.index], t, "REPLACE")
                    break
        print("WEIGHTS bone heat unreliable (%.0f%% orphaned), used analytic spine weights" %
              (orphan_fraction * 100))
    if lower_jaw_weights is None:
        _apply_legacy_jaw_band(low, ymin, L, zc, H)
    else:
        _apply_external_weights(low, lower_jaw_weights)
        print("WEIGHTS applied externally supplied LowerJaw payload")
        if isinstance(lower_jaw_weights, dict):
            for object_name, mapping in lower_jaw_weights.get("objects", {}).items():
                mouth_object = bpy.data.objects.get(object_name)
                if mouth_object and mouth_object.type == "MESH":
                    _attach_external_object(mouth_object, rig, mapping)
    return rig, {"ymin": ymin, "L": L, "zc": zc, "H": H,
                 "stations": tuple(STATIONS), "weights": audit_weights(low)}
