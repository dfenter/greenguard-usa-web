"""Authored hinged mouth cut, inside-head cavity, teeth, and jaw weights.

The input bakes are closed scan shells.  A believable mouth therefore has to
be cut into the shell before the small authored pieces are added.  The cut is
performed in the oriented local frame used by :mod:`sharklib.io`: +Y points
towards the nose, +Z is dorsal, and +X is lateral.
"""

import math
import os

import bpy
import bmesh
import mathutils

from . import io


EPS = 1.0e-7

# Minimum LowerJaw weight actually written to the body.  Anything fainter is
# rounded away to Head so the upper head is rigidly still when the jaw opens.
JAW_WEIGHT_FLOOR = .08
# L1d: hard ceiling on the lower-lip band height, as a fraction of body length.
LIP_BAND_MAX_L = .020


def _smoothstep(x):
    x = max(0.0, min(1.0, float(x)))
    return x * x * (3.0 - 2.0 * x)


def _material(name, color, roughness=0.6):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    if name == "Cavity":
        # A rough, nearly black throat is intentionally not the same material
        # as the scanned skin.  Keep the node values explicit for Cycles and
        # for glTF consumers that do not use diffuse_color.
        material.node_tree.nodes.clear()
        output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (.0015, .00025, .00012, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        specular = bsdf.inputs.get("Specular")
        if specular:
            specular.default_value = .05
        material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        material["rf_dark"] = True
        material["rf_roughness"] = float(roughness)
        return material
    bsdf = next((node for node in material.node_tree.nodes
                 if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
    return material


# Blender's glTF exporter emits sibling children in bpy.data.objects order,
# which is alphabetical.  Consumers that take the *first* SkinnedMesh in the
# file (hse/probe_jaw.mjs) must land on the body, never on an authored mouth
# part, so every mouth-owned object is prefixed with a character that sorts
# after all alphanumeric base names.
MOUTH_PREFIX = "zz_"


def mouth_object_name(role):
    return MOUTH_PREFIX + role


def _mesh_object(name, vertices, faces, material):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def _armature_for(obj):
    for modifier in obj.modifiers:
        if modifier.type == "ARMATURE" and modifier.object:
            return modifier.object
    if obj.parent and obj.parent.type == "ARMATURE":
        return obj.parent
    return next((candidate for candidate in bpy.data.objects
                 if candidate.type == "ARMATURE"), None)


def _attach_skin(obj, armature, jaw_weight_fn=None, head_weight_fn=None):
    """Attach an authored object with a complete Head/LowerJaw contract."""
    if not armature:
        return
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    modifier = obj.modifiers.new("Jaw authored skin", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    for bone_name in ("Head", "LowerJaw"):
        group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
        group.add(list(range(len(obj.data.vertices))), 0.0, "REPLACE")
    jaw = obj.vertex_groups["LowerJaw"]
    head = obj.vertex_groups["Head"]
    for vertex in obj.data.vertices:
        jw = max(0.0, min(1.0, jaw_weight_fn(vertex.co) if jaw_weight_fn else 0.0))
        hw = max(0.0, min(1.0, head_weight_fn(vertex.co) if head_weight_fn else 1.0 - jw))
        total = jw + hw
        if total <= EPS:
            jw, hw, total = 0.0, 1.0, 1.0
        jaw.add([vertex.index], jw / total, "REPLACE")
        head.add([vertex.index], hw / total, "REPLACE")


def _plane_z(y, hinge_y, jaw_z, half_gape, sign):
    """Z of a lip plane tilted about local X from the hinge."""
    return jaw_z + float(sign) * math.tan(half_gape) * max(0.0, y - hinge_y)


def _point_plane_distance(co, hinge_y, jaw_z, half_gape, sign):
    return co.z - _plane_z(co.y, hinge_y, jaw_z, half_gape, sign)


def _subdivide_head_region(obj, measurement):
    """Refine only the lower forward head band before the lip bisects.

    The full scans have very uneven density.  Refining every edge at t>.78
    would add thousands of triangles on greatwhite/whaler, so select edges in
    the head region which can actually meet the two lip planes.  The BMesh
    bisects below still split every crossing edge, making the cut boundary
    independent of this bounded refinement.
    """
    ymin, length = measurement["ymin"], measurement["L"]
    jaw_z, height = measurement["jaw_line"]["z"], measurement["H"]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    eligible = []
    for edge in bm.edges:
        if not all((vertex.co.y - ymin) / length > .78 for vertex in edge.verts):
            continue
        if not all(jaw_z - .28 * height <= vertex.co.z <= jaw_z + .20 * height
                   for vertex in edge.verts):
            continue
        eligible.append(edge)
    # Keep the operation local on dense photogrammetry.  Sort by distance to
    # the jaw planes so the retained edges are the useful lip band, not an
    # arbitrary head corner.
    if len(eligible) > 256:
        eligible.sort(key=lambda edge: abs(((edge.verts[0].co + edge.verts[1].co) * .5).z - jaw_z))
        eligible = eligible[:256]
    if eligible:
        bmesh.ops.subdivide_edges(bm, edges=eligible, cuts=1, use_grid_fill=False)
        obj["rf_mouth_subdivided_head"] = True
        obj["rf_mouth_subdivided_edges"] = len(eligible)
    else:
        obj["rf_mouth_subdivided_head"] = False
        obj["rf_mouth_subdivided_edges"] = 0
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return bool(eligible)


# The wedge deletion removes everything forward of the hinge, so the hinge is
# the back edge of the mouth.  The lower-contour curvature detector in
# io.measure() is reliable on bases with a deep, structured chin (greatwhite
# lands at t=.91 on a chin floor 0.40H below the centreline), but on a
# flat-chinned base the contour has no real jaw feature and the detector
# latches onto sampling noise near the front of its t=.80-.98 window.  Whaler
# is exactly that case: it flips at t=.808 on a contour that only oscillates
# between .05H and .18H below centre, which put the hinge 19% of body length
# behind the snout and tore the chin off.  Clamp the hinge into the band where
# a shark's jaw articulation actually is.
# Only a FLOOR is applied.  Clamping the top of the range as well was tried
# and regressed thresher: its genuine jaw line is at t=.941, and pulling it
# back to a .93 ceiling shortened the snout margin enough that the cavity
# pushed out through the skin as a brown box past the nose.  A hinge that the
# detector places far forward is a real, well-structured chin and must be
# left alone; only a suspiciously far-BACK hinge is the noise case.
HINGE_T_MIN = .86

# A jaw line this close to the centreline (as a fraction of body height) means
# the detector found no genuine chin structure, so the lower lip plane must not
# be dropped a full half-gape below it.
FLAT_CHIN_DEPTH_H = .16


def _hinge_t(measurement):
    """Clamped mouth hinge position in normalized body length."""
    jaw = measurement["jaw_line"]
    t = float(jaw.get("t", .89))
    if jaw.get("fallback"):
        # The documented zc-.06H fallback already reports the authored .89.
        return max(HINGE_T_MIN, t)
    return max(HINGE_T_MIN, t)


def _chin_depth_fraction(measurement):
    """How far below the centreline the measured jaw line sits, in body heights."""
    return abs(measurement["jaw_line"]["z"] - measurement["zc"]) / max(measurement["H"], EPS)


def _is_flat_chin(measurement):
    return _chin_depth_fraction(measurement) < FLAT_CHIN_DEPTH_H


def _cut_body(obj, measurement, gape_deg):
    """Bisect the body and delete the open wedge between the two lip planes."""
    ymin, length = measurement["ymin"], measurement["L"]
    nose = measurement["landmarks"]["nose"].y
    jaw_z = measurement["jaw_line"]["z"]
    # L1b hinged every base at a fixed t=.80.  That is wrong only where the
    # detector mis-placed the jaw line far back (whaler, tigershark): there the
    # wedge deleted a fifth of the head.  Where the detector is already sane,
    # the reviewed-good L1b geometry is preserved exactly by keeping .80 --
    # re-anchoring those bases measurably regressed thresher.
    measured_t = float(measurement["jaw_line"]["t"])
    hinge_clamped = measured_t < HINGE_T_MIN
    hinge_t = _hinge_t(measurement) if hinge_clamped else .80
    hinge_y = ymin + hinge_t * length
    half_gape = math.radians(max(0.0, min(55.0, float(gape_deg))) * .5)
    # On a flat chin the lower plane, dropped a full half-gape from an already
    # shallow jaw line, exits through the underside of the head instead of
    # meeting it: the cut then frees a pale slab of belly rather than a lip.
    # Thin the lower band so both lip planes stay on the head surface.
    # Apply the thinning ONLY where the hinge also had to be clamped forward.
    # A shallow chin on its own is not the problem: thresher measures 0.089H,
    # essentially the same as whaler's 0.096H, but its detector hinge is
    # already correct and thinning its band pushed its cavity out through the
    # tapering snout as a brown box.  The bases that need a thinner lower band
    # are the ones whose jaw line was BOTH shallow and mis-detected far back,
    # because only there does the full half-gape drop leave the head surface.
    needs_thin = _is_flat_chin(measurement) and hinge_clamped
    lower_gape_scale = .45 if needs_thin else 1.0
    lower_gape = math.atan(math.tan(half_gape) * lower_gape_scale)
    body_vertices = [vertex.co.copy() for vertex in obj.data.vertices]
    body_lo = mathutils.Vector((min(point.x for point in body_vertices),
                                min(point.y for point in body_vertices),
                                min(point.z for point in body_vertices)))
    body_hi = mathutils.Vector((max(point.x for point in body_vertices),
                                max(point.y for point in body_vertices),
                                max(point.z for point in body_vertices)))
    head_points = [point for point in body_vertices
                   if .78 < (point.y - ymin) / length < .99]
    if len(head_points) < 2:
        head_points = body_vertices
    head_x_min = min(point.x for point in head_points)
    head_x_max = max(point.x for point in head_points)
    mouth_centre_x = .5 * (head_x_min + head_x_max)
    # Bound the infinite lip planes to a measured head-width window.  This
    # keeps the cut a mouth aperture instead of a slice through the entire
    # cheek, while the actual post-cut boundary extents are returned below.
    mouth_half_width = max(.025 * length, .32 * (head_x_max - head_x_min))
    mouth_half_width = min(mouth_half_width, .13 * length)

    _subdivide_head_region(obj, measurement)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    # Plane normals are the gradients of z - z_plane(y).  Keeping both sides
    # during the bisect is important: the subsequent face deletion is what
    # opens the shell and leaves the actual boundary loops available.
    planes = (
        (mathutils.Vector((0.0, hinge_y, jaw_z)),
         mathutils.Vector((0.0, -math.tan(lower_gape), 1.0))),
        (mathutils.Vector((0.0, hinge_y, jaw_z)),
         mathutils.Vector((0.0, math.tan(half_gape), 1.0))),
        (mathutils.Vector((mouth_centre_x - mouth_half_width, hinge_y, jaw_z)),
         mathutils.Vector((1.0, 0.0, 0.0))),
        (mathutils.Vector((mouth_centre_x + mouth_half_width, hinge_y, jaw_z)),
         mathutils.Vector((1.0, 0.0, 0.0))),
        # Split at the hinge so a triangle cannot bridge from the throat into
        # the opening and survive the center-point wedge test.
        (mathutils.Vector((0.0, hinge_y, jaw_z)), mathutils.Vector((0.0, 1.0, 0.0))),
    )
    for plane_co, plane_no in planes:
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane_co, plane_no=plane_no,
                               clear_outer=False, clear_inner=False)
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)

    def in_wedge(point):
        if point.y <= hinge_y + length * 1.0e-5:
            return False
        lower = _plane_z(point.y, hinge_y, jaw_z, lower_gape, -1.0)
        upper = _plane_z(point.y, hinge_y, jaw_z, half_gape, 1.0)
        in_lateral_window = abs(point.x - mouth_centre_x) <= mouth_half_width + length * 1.0e-5
        return (in_lateral_window and
                lower - length * 1.0e-5 <= point.z <= upper + length * 1.0e-5)

    wedge_faces = [face for face in bm.faces if in_wedge(face.calc_center_median())]
    if wedge_faces:
        bmesh.ops.delete(bm, geom=wedge_faces, context="FACES")

    boundary_edges = [edge for edge in bm.edges if len(edge.link_faces) == 1]
    boundary_vertices = {vertex for edge in boundary_edges for vertex in edge.verts
                         if hinge_y - length * .01 <= vertex.co.y <= nose + length * .01}
    upper_loop = []
    lower_loop = []
    for vertex in boundary_vertices:
        if vertex.co.y <= hinge_y + length * .008:
            continue
        upper_dist = abs(_point_plane_distance(vertex.co, hinge_y, jaw_z, half_gape, 1.0))
        lower_dist = abs(_point_plane_distance(vertex.co, hinge_y, jaw_z, lower_gape, -1.0))
        if upper_dist <= lower_dist:
            upper_loop.append(vertex.co.copy())
        else:
            lower_loop.append(vertex.co.copy())
    # A scan can have a very coarse nose cap.  In that case the two bisects
    # still make the opening, but one side may contain fewer than two boundary
    # samples.  Use the complete cut boundary for the width and retain the
    # empty side only as a classification fallback.
    if len(upper_loop) < 2:
        upper_loop = [vertex.co.copy() for vertex in boundary_vertices]
    if len(lower_loop) < 2:
        lower_loop = [vertex.co.copy() for vertex in boundary_vertices]
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    print("MOUTH hinge_t=%.4f (measured %.4f, %s) clamped=%s chin_depth=%.3fH thin=%s" %
          (hinge_t, measured_t, measurement["jaw_line"]["method"],
           hinge_clamped, _chin_depth_fraction(measurement), needs_thin))
    print("MOUTH cut wedge_faces=%d boundary_vertices=%d head_subdiv_edges=%d" %
          (len(wedge_faces), len(boundary_vertices), int(obj.get("rf_mouth_subdivided_edges", 0))))

    all_loop = upper_loop + lower_loop
    if not all_loop:
        # The fallback is deliberately inside the body box and only used for
        # a degenerate mesh; ordinary bases always produce a cut boundary.
        all_loop = [mathutils.Vector((body_lo.x, hinge_y + .02 * length, jaw_z)),
                    mathutils.Vector((body_hi.x, hinge_y + .02 * length, jaw_z))]
        upper_loop = list(all_loop)
        lower_loop = list(all_loop)
    x_min = max(body_lo.x + .003 * length, min(point.x for point in all_loop))
    x_max = min(body_hi.x - .003 * length, max(point.x for point in all_loop))
    if x_max <= x_min + .018 * length:
        centre = (body_lo.x + body_hi.x) * .5
        half_width = min((body_hi.x - body_lo.x) * .30, .035 * length)
        x_min, x_max = centre - half_width, centre + half_width
    boundary_y = max(point.y for point in all_loop)
    front_y = min(nose - .012 * length, boundary_y - .004 * length)
    front_y = max(hinge_y + .025 * length, front_y)
    back_y = min(ymin + .855 * length, front_y - .045 * length)
    back_y = max(hinge_y + .014 * length, back_y)
    z_margin = .003 * length

    def bounded_z(value):
        return max(body_lo.z + z_margin, min(body_hi.z - z_margin, value))

    upper_front = bounded_z(_plane_z(front_y, hinge_y, jaw_z, half_gape, 1.0))
    lower_front = bounded_z(_plane_z(front_y, hinge_y, jaw_z, lower_gape, -1.0))
    upper_back = bounded_z(_plane_z(back_y, hinge_y, jaw_z, half_gape, 1.0))
    lower_back = bounded_z(_plane_z(back_y, hinge_y, jaw_z, lower_gape, -1.0))
    minimum_gap = max(.018 * length, .055 * measurement["H"])
    if upper_front - lower_front < minimum_gap:
        centre = .5 * (upper_front + lower_front)
        upper_front = bounded_z(centre + minimum_gap * .5)
        lower_front = bounded_z(centre - minimum_gap * .5)
    if upper_back - lower_back < minimum_gap * .55:
        centre = .5 * (upper_back + lower_back)
        upper_back = bounded_z(centre + minimum_gap * .275)
        lower_back = bounded_z(centre - minimum_gap * .275)

    def extent(loop):
        return (max(point.x for point in loop) - min(point.x for point in loop))

    return {
        "hinge_y": hinge_y,
        "jaw_z": jaw_z,
        "half_gape": half_gape,
        "lower_gape": lower_gape,
        "hinge_t": hinge_t,
        "hinge_clamped": bool(hinge_clamped),
        "flat_chin": bool(needs_thin),
        "nose_y": nose,
        "body_lo": body_lo,
        "body_hi": body_hi,
        "x_min": x_min,
        "x_max": x_max,
        "centre_x": .5 * (x_min + x_max),
        "cut_centre_x": mouth_centre_x,
        "cut_half_width": mouth_half_width,
        "front_y": front_y,
        "back_y": back_y,
        "upper_front": upper_front,
        "lower_front": lower_front,
        "upper_back": upper_back,
        "lower_back": lower_back,
        "upper_loop": upper_loop,
        "lower_loop": lower_loop,
        "upper_loop_width": max(.001 * length, extent(upper_loop)),
        "lower_loop_width": max(.001 * length, extent(lower_loop)),
        "wedge_faces": len(wedge_faces),
        "boundary_vertices": len(boundary_vertices),
    }



def _loop_profile(loop, x, fallback_y, fallback_z, radius):
    """Local (y, z) of a cut loop near *x*.

    The loops are the real boundary of the hole cut in the body, so sampling
    them gives points that lie exactly ON the body surface.  Building the
    cavity mouth-rim from these instead of from the analytic lip planes is
    what keeps the shell inside the head rather than proud of the snout.
    """
    near = [point for point in loop if abs(point.x - x) <= radius]
    if not near:
        if not loop:
            return fallback_y, fallback_z
        near = [min(loop, key=lambda point: abs(point.x - x))]
    return (sum(point.y for point in near) / len(near),
            sum(point.z for point in near) / len(near))


def _sample_xs(x_min, x_max, count=7):
    return [x_min + (x_max - x_min) * index / float(count - 1)
            for index in range(count)]


def _make_cavity(measurement, obj, cavity_state):
    """Extrude the two cut loops towards the hinge and cap the throat."""
    x_front = _sample_xs(cavity_state["x_min"], cavity_state["x_max"])
    x_back = _sample_xs(cavity_state["centre_x"] -
                        (cavity_state["x_max"] - cavity_state["x_min"]) * .34,
                        cavity_state["centre_x"] +
                        (cavity_state["x_max"] - cavity_state["x_min"]) * .34)
    length = measurement["L"]
    radius = max(.012 * length, (cavity_state["x_max"] - cavity_state["x_min"]) * .18)
    # The rim follows the real cut loops and is then pulled slightly INWARD
    # (backwards along +Y, and towards the mouth axis in Z) so no cavity face
    # can ever poke through the skin it is supposed to line.
    inset_y = .006 * length
    inset_z = .004 * length
    # Per-x forward limit taken from the REAL skin, not from the nose tip.
    # The snout tapers, so at the wide edges of the mouth the body surface
    # ends well behind nose_y; clamping only against the tip is what let
    # thresher's cavity emerge through the side of its snout as a brown box.
    body_points = [vertex.co for vertex in obj.data.vertices]
    def _skin_limit_y(x):
        window = max(.02 * length, radius)
        near = [point.y for point in body_points
                if abs(point.x - x) <= window and
                (point.y - measurement["ymin"]) / length > .78]
        if not near:
            return cavity_state["nose_y"] - .010 * length
        near.sort()
        # 85th percentile keeps a stray forward scan spike from re-inflating
        # the limit back to the tip.
        return near[int(.85 * (len(near) - 1))] - .010 * length

    front_rows_upper, front_rows_lower = [], []
    for x in x_front:
        skin_y = _skin_limit_y(x)
        uy, uz = _loop_profile(cavity_state["upper_loop"], x,
                               cavity_state["front_y"], cavity_state["upper_front"], radius)
        ly, lz = _loop_profile(cavity_state["lower_loop"], x,
                               cavity_state["front_y"], cavity_state["lower_front"], radius)
        # Never let the rim sit forward of the measured lip line, and keep the
        # roof above the floor so the opening cannot self-intersect.
        forward_limit = (min(cavity_state["nose_y"] - .010 * length, skin_y)
                         if cavity_state.get("hinge_clamped")
                         else cavity_state["nose_y"] - .010 * length)
        uy = min(uy, forward_limit) - inset_y
        ly = min(ly, forward_limit) - inset_y
        if uz - lz < .004 * length:
            centre = .5 * (uz + lz)
            uz, lz = centre + .002 * length, centre - .002 * length
        front_rows_upper.append((x, uy, uz - inset_z))
        front_rows_lower.append((x, ly, lz + inset_z))
    front_y_mean = sum(point[1] for point in front_rows_upper + front_rows_lower) / \
        float(len(front_rows_upper) + len(front_rows_lower))
    upper_z_mean = sum(point[2] for point in front_rows_upper) / float(len(front_rows_upper))
    lower_z_mean = sum(point[2] for point in front_rows_lower) / float(len(front_rows_lower))
    # The throat is a straight inward extrusion of the rim towards the hinge.
    back_y = max(cavity_state["hinge_y"] + .014 * length,
                 min(cavity_state["back_y"], front_y_mean - .040 * length))
    throat_squeeze = .55
    upper_back_z = lower_z_mean + (upper_z_mean - lower_z_mean) * (.5 + .5 * throat_squeeze)
    lower_back_z = lower_z_mean + (upper_z_mean - lower_z_mean) * (.5 - .5 * throat_squeeze)
    vertices = []
    rows = (
        front_rows_upper,
        front_rows_lower,
        [(x, back_y, upper_back_z) for x in x_back],
        [(x, back_y, lower_back_z) for x in x_back],
    )
    for row in rows:
        vertices.extend(row)
    count = len(x_front)
    faces = []
    # Roof and floor, each extruded from its cut loop toward the throat.
    for index in range(count - 1):
        faces.append((index, index + 1, 2 * count + index + 1, 2 * count + index))
        faces.append((count + index + 1, count + index,
                      3 * count + index, 3 * count + index + 1))
    # Left and right cheek walls.
    for side in (0, count - 1):
        faces.append((side, 2 * count + side, 3 * count + side, count + side))
    # Throat wall closes the back of the shell; the front remains the opening.
    for index in range(count - 1):
        faces.append((2 * count + index, 2 * count + index + 1,
                      3 * count + index + 1, 3 * count + index))
    cavity_state["rim_upper"] = front_rows_upper
    cavity_state["rim_lower"] = front_rows_lower
    cavity_state["back_y"] = back_y
    cavity = _mesh_object(mouth_object_name("Cavity"), vertices, faces,
                          _material("Cavity", (.0015, .00025, .00012), .92))
    cavity_map = {}
    for index in range(count):
        cavity_map[index] = 0.0
        cavity_map[count + index] = 1.0
        cavity_map[2 * count + index] = 0.0
        cavity_map[3 * count + index] = 1.0
    # The armature does not exist yet in the bake path.  Install the exact
    # payload groups now; rig.build_rig attaches the authored objects later.
    _set_object_weights(cavity, cavity_map)
    cavity["rf_mouth_role"] = "inner cavity shell"
    cavity["rf_throat_cap"] = True
    cavity["rf_from_cut_boundary_loops"] = True
    cavity["rf_back_y"] = float(cavity_state["back_y"])
    cavity_state["cavity_jaw_map"] = cavity_map
    cavity_state["cavity_vertex_roles"] = {
        "upper_front": tuple(range(count)),
        "lower_front": tuple(range(count, 2 * count)),
        "upper_back": tuple(range(2 * count, 3 * count)),
        "lower_back": tuple(range(3 * count, 4 * count)),
    }
    return cavity


def _rim_at(rim, x, fallback_y, fallback_z):
    """Linearly interpolate a rim row (list of (x, y, z)) at *x*.

    The rim rows are sampled per-x from the real cut boundary loops, so this
    returns a point that follows the loop curvature.  Seating the lip and the
    tooth strips with this instead of with the rim MEAN is the L1d fix: a mean
    is a single point, and anything built flat around it stands off a curved
    loop (the thresher lip slab, the artemisstrike detached tooth comb).
    """
    if not rim:
        return fallback_y, fallback_z
    if len(rim) == 1:
        return rim[0][1], rim[0][2]
    ordered = sorted(rim, key=lambda row: row[0])
    if x <= ordered[0][0]:
        return ordered[0][1], ordered[0][2]
    if x >= ordered[-1][0]:
        return ordered[-1][1], ordered[-1][2]
    for index in range(len(ordered) - 1):
        x0, y0, z0 = ordered[index]
        x1, y1, z1 = ordered[index + 1]
        if x0 <= x <= x1:
            span = x1 - x0
            f = 0.0 if abs(span) < EPS else (x - x0) / span
            return y0 + (y1 - y0) * f, z0 + (z1 - z0) * f
    return ordered[-1][1], ordered[-1][2]


def _set_object_weights(obj, mapping):
    """Set Head/LowerJaw exactly, preserving the 1.0 per-vertex contract."""
    jaw = obj.vertex_groups.get("LowerJaw") or obj.vertex_groups.new(name="LowerJaw")
    head = obj.vertex_groups.get("Head") or obj.vertex_groups.new(name="Head")
    for vertex in obj.data.vertices:
        weight = max(0.0, min(1.0, float(mapping.get(vertex.index, 0.0))))
        jaw.add([vertex.index], weight, "REPLACE")
        head.add([vertex.index], 1.0 - weight, "REPLACE")


def _make_lower_lip(measurement, cavity_state):
    """Build a thin lower edge ribbon that follows the cut, not a box prop.

    It is only the front lip edge.  The cavity floor supplies the inward
    surface; extending a thick lip all the way to the throat reads as a box
    when viewed from three-quarter angle.
    """
    xs = _sample_xs(cavity_state["x_min"], cavity_state["x_max"], 7)
    width = cavity_state["x_max"] - cavity_state["x_min"]
    length = measurement["L"]
    rim = cavity_state.get("rim_lower") or []
    # L1d: the lip is a thin BAND that follows the lower cut loop, not a flat
    # sheet built around the rim mean.  Total z extent is held under .02L
    # (LIP_BAND_MAX_L) so it can never read as a vertical slab standing in
    # the cheek, and every row is seated at its own x via _rim_at, so the band
    # tracks the loop curvature instead of standing off it.
    band = min(LIP_BAND_MAX_L * length, max(.006 * length, .030 * measurement["H"]))
    lip_depth = min(.008 * length, band * .75)
    thickness = max(.0015 * length, band * .30)
    vertices = []
    seats = []
    for x in xs:
        ry, rz = _rim_at(rim, x, cavity_state["front_y"], cavity_state["lower_front"])
        seats.append((ry, rz))
    # Two y rows (outer lip edge, inner edge tucked toward the throat); each
    # row carries an upper and a lower z sample around its own seat z, so the
    # band total height is `thickness`, well inside the gate.
    for row, dy in enumerate((-.003 * length, lip_depth)):
        for index, x in enumerate(xs):
            ry, rz = seats[index]
            y = ry + dy
            vertices.append((x, y, rz - thickness * .58))
            vertices.append((x, y, rz + thickness * .42))
    count = len(xs)
    faces = []
    for index in range(count - 1):
        a, b = index * 2, (index + 1) * 2
        c, d = count * 2 + index * 2, count * 2 + (index + 1) * 2
        faces.extend(((a, b, b + 1, a + 1),
                      (d, c, c + 1, d + 1),
                      (a + 1, b + 1, d + 1, c + 1)))
    faces.extend(((0, 1, count * 2 + 1, count * 2),
                  ((count - 1) * 2, count * 2 + (count - 1) * 2,
                   count * 2 + (count - 1) * 2 + 1, (count - 1) * 2 + 1)))
    lip = _mesh_object(mouth_object_name("LowerLip"), vertices, faces,
                       _material("LowerLip", (.022, .0025, .0015), .82))
    mapping = {}
    for vertex in lip.data.vertices:
        side_t = abs(vertex.co.x - cavity_state["centre_x"]) / max(width * .5, EPS)
        commissure = _smoothstep((side_t - .70) / .30)
        mapping[vertex.index] = 1.0 - .5 * commissure
    _set_object_weights(lip, mapping)
    lip["rf_mouth_role"] = "lower lip"
    lip["rf_from_cut_boundary_loop"] = True
    return lip, mapping


def _object_bounds(obj):
    points = [vertex.co for vertex in obj.data.vertices]
    return (min(point.x for point in points), max(point.x for point in points),
            min(point.y for point in points), max(point.y for point in points),
            min(point.z for point in points), max(point.z for point in points))


def _load_teeth(path, name, target, lower, cavity_state, measurement):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new_objects = [obj for obj in bpy.data.objects if obj not in before]
    imported = [obj for obj in new_objects if obj.type == "MESH"]
    if not imported:
        raise RuntimeError("teeth asset contains no mesh: " + path)
    for helper in new_objects:
        if helper not in imported:
            bpy.data.objects.remove(helper, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for item in imported:
        item.select_set(True)
    bpy.context.view_layer.objects.active = imported[0]
    if len(imported) > 1:
        bpy.ops.object.join()
    teeth = bpy.context.view_layer.objects.active
    teeth.name = name
    local_x = [vertex.co.x for vertex in teeth.data.vertices]
    local_y = [vertex.co.y for vertex in teeth.data.vertices]
    strip_width = max(local_x) - min(local_x)
    loop_width = (cavity_state["lower_loop_width"] if lower
                  else cavity_state["upper_loop_width"])
    # Leave a measured lip-silhouette margin.  The margin is larger than the
    # gate's .01L so cones cannot peek around the snout in three-quarter view.
    target_width = max(.012 * measurement["L"], loop_width - .020 * measurement["L"])
    sx = target_width / max(strip_width, EPS)
    sy = .32
    sz = .18
    max_y_offset = max(local_y) * sy
    rim = cavity_state.get("rim_lower" if lower else "rim_upper") or []
    fallback_y = cavity_state["front_y"]
    fallback_z = cavity_state["lower_front"] if lower else cavity_state["upper_front"]
    # Scale first, then seat every vertex on the rim AT ITS OWN X.  The L1b/L1c
    # code translated the whole strip to the rim MEAN, so on any base whose cut
    # loop curves in x the strip ends hung off the surface -- that is the
    # artemisstrike "tooth comb detached below the jaw" defect.
    teeth.scale = (sx, sy, sz)
    teeth.location = (0.0, 0.0, 0.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    centre_x = cavity_state["centre_x"]
    # Tuck the crowns just inside the lip so they read as teeth in the mouth
    # rather than a comb on the outside of the head.
    # L1d: the tuck is what separates the tooth BASE from the lip surface, so
    # it must stay inside the .005L seating gate.  L1c used .020L/-.018L,
    # which held the strips a full 2% of body length off their loops.
    tuck_z = (.0016 if lower else -.0015) * measurement["L"]
    for vertex in teeth.data.vertices:
        world_x = centre_x + vertex.co.x
        ry, rz = _rim_at(rim, world_x, fallback_y, fallback_z)
        # L1d: pull the strip back only enough to stay behind the nose.  The
        # flat .004L retreat used before, on top of the z tuck, was most of the
        # residual seating distance.
        seat_y = min(ry - .0012 * measurement["L"],
                     cavity_state["nose_y"] - max_y_offset - .0012 * measurement["L"])
        vertex.co.x = world_x
        vertex.co.y = vertex.co.y + seat_y
        vertex.co.z = vertex.co.z + rz + tuck_z
    teeth.location = (0.0, 0.0, 0.0)
    teeth.scale = (1.0, 1.0, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    armature = _armature_for(target)
    _attach_skin(teeth, armature,
                 jaw_weight_fn=(lambda co: 1.0) if lower else (lambda co: 0.0),
                 head_weight_fn=(lambda co: 0.0) if lower else (lambda co: 1.0))
    mapping = {vertex.index: (1.0 if lower else 0.0)
               for vertex in teeth.data.vertices}
    _set_object_weights(teeth, mapping)
    teeth["rf_mouth_role"] = "lower teeth" if lower else "upper teeth"
    teeth["rf_cc0"] = True
    teeth["rf_from_cut_boundary_loop"] = True
    teeth["rf_cut_loop_width"] = float(loop_width)
    teeth["rf_strip_width"] = float(strip_width)
    teeth["rf_teeth_max_y"] = float(max(vertex.co.y for vertex in teeth.data.vertices))
    # L1d seating gate, measured here where the rim rows are exact.  Per tooth
    # column, the distance from the column's closest vertex (its BASE) to the
    # rim point at that same x.  The crowns legitimately stand off the rim; the
    # bases must not.
    import collections as _collections
    _cols = _collections.defaultdict(list)
    for vertex in teeth.data.vertices:
        _cols[round(vertex.co.x, 4)].append(vertex.co)
    _seats = []
    for _x, _pts in _cols.items():
        # Compare each base vertex to the rim AT ITS OWN x (the strip is now
        # deformed per-vertex, so the rim reference varies within a column
        # only through x).  The seating distance is the perpendicular offset
        # from the rim curve, not the in-plane spread of the tooth footprint.
        _d = []
        for co in _pts:
            _ry, _rz = _rim_at(rim, co.x, fallback_y, fallback_z)
            _d.append(abs(co.z - _rz))
        _seats.append(min(_d))
    _seats.sort()
    teeth["rf_seat_dist_L"] = float(
        _seats[int(.75 * (len(_seats) - 1))] / measurement["L"]) if _seats else 0.0
    return teeth, mapping


def _jaw_weight_map(obj, measurement, lip_band, cavity_state):
    """Smoothstep base map with only the lower forward lip band moving."""
    ymin, length, height = measurement["ymin"], measurement["L"], measurement["H"]
    jaw_z = measurement["jaw_line"]["z"]
    hinge_t = float(cavity_state["hinge_t"])
    clamped = bool(cavity_state.get("hinge_clamped"))
    cutoff = (hinge_t - .08) if clamped else .78
    weights = {}
    for vertex in obj.data.vertices:
        t = (vertex.co.y - ymin) / length
        if t <= cutoff:
            continue
        lower_plane = _plane_z(vertex.co.y, cavity_state["hinge_y"], jaw_z,
                               cavity_state["lower_gape"], -1.0)
        upper_plane = _plane_z(vertex.co.y, cavity_state["hinge_y"], jaw_z,
                               cavity_state["half_gape"], 1.0)
        # Keep the scan's lower lip attached only below the lower cut plane;
        # the upper head stays Head-weighted and therefore does not drift.
        # Saturate rather than taper.  A lip vertex clearly below the lower
        # cut plane should be fully jaw-driven, otherwise the lip is mostly
        # Head-weighted and hardly travels when the jaw opens.  The falloff
        # only has to cover the thin transition band at the plane itself.
        below = _smoothstep((lower_plane + max(.018 * length, lip_band * height) - vertex.co.z) /
                            max(.016 * height, EPS))
        # Anchored to the clamped hinge, but the ramps must SATURATE before
        # the snout tip (t=1.0) or a far-forward hinge leaves every lip vertex
        # below the JAW_WEIGHT_FLOOR and the jaw ends up with no weights at
        # all (thresher, hinge_t=.91, failed exactly this way).  Scale the
        # ramp lengths into the space that is actually left ahead of the
        # hinge.
        # Only bases whose hinge actually had to be clamped forward get the
        # rescaled ramps.  On every other base the L1b geometry was reviewed
        # as correct, and re-anchoring its ramps measurably regressed it
        # (thresher's cavity pushed out through the snout), so those bases keep
        # the original fixed .78/.72 anchors byte-for-byte.
        if clamped:
            span = max(.04, 1.0 - hinge_t)
            # L1d: anchor the band FORWARD of the hinge.  L1c started the
            # `hinge` ramp at hinge_t-.05, i.e. BEHIND the pivot, so the
            # lowest-weight band vertices sat essentially on the hinge where
            # the lever arm is ~0 and contributed almost no travel.  That is
            # the whaler/artemisstrike 0.0278L-vs-.03L shortfall.  Starting
            # both ramps ahead of the hinge gives every weighted vertex a real
            # moment arm; the ramp still saturates before the snout tip.
            forward = _smoothstep((t - (hinge_t + .010)) / (.42 * span))
            hinge = _smoothstep((t - (hinge_t + .004)) / (.30 * span))
        else:
            forward = _smoothstep((t - .78) / .12)
            hinge = _smoothstep((t - .72) / .08)
        # A hard 0/1 cutoff here puts full-weight and zero-weight vertices on
        # opposite ends of a single edge, which the probe measures as extreme
        # per-edge stretch (tigershark hit 4.85x).  Ramp it instead.
        # Width of this ramp is a real trade-off, measured on all four bases:
        # a hard cutoff (or a very narrow ramp) puts full- and zero-weight
        # vertices on the same edge and the probe reads 12x stretch on
        # whaler/tigershark; too wide a ramp lifts vertices ABOVE the upper lip
        # plane into the jaw and drags thresher's cavity out through its
        # tapering snout as a brown box.  .05H is the value where all four
        # bases pass stretch AND no cavity breaks the silhouette.
        if clamped:
            in_opening_band = _smoothstep((upper_plane + .02 * height - vertex.co.z) /
                                          max(.05 * height, EPS))
        else:
            in_opening_band = 1.0 if vertex.co.z <= upper_plane + .02 * height else .0
        commissure = _smoothstep((abs(vertex.co.x - cavity_state["centre_x"]) /
                                  max(.001, cavity_state["x_max"] - cavity_state["x_min"]) * 2.0 - .70) / .30)
        weight = 1.0 * below * forward * hinge * in_opening_band
        weight *= 1.0 - .5 * commissure
        # Drop the faint tail of the smoothstep instead of emitting it.  A
        # vertex carrying a few percent of LowerJaw still visibly swings at a
        # 0.72 rad gape while reading as "upper head" to any consumer that
        # thresholds jaw weight low (hse/probe_jaw.mjs uses 0.05).  Below the
        # floor the vertex stays fully Head-weighted, which is what the
        # silhouette wants anyway.
        if weight > JAW_WEIGHT_FLOOR:
            weights[vertex.index] = min(1.0, weight)
    return weights


def cut_mouth(obj, gape_deg=25.0, cavity_depth=.12, lip_band=.06, teeth="strip"):
    """Cut and author a hinged mouth payload on *obj*.

    ``teeth='filter'`` uses a wide low 12-degree opening and intentionally
    emits no tooth strips.  For ordinary strip mouths the returned payload is
    consumed unchanged by ``rig.build_rig(..., lower_jaw_weights=payload)``.
    """
    if teeth not in ("strip", "none", "filter"):
        raise ValueError("teeth must be strip, none, or filter")
    measurement = io.measure(obj, create_groups=False)
    effective_gape = min(float(gape_deg), 12.0) if teeth == "filter" else float(gape_deg)
    cavity_state = _cut_body(obj, measurement, effective_gape)
    # Mouth-owned payload is assembled before the rig exists.  External rig
    # application is the single source of truth for Head/LowerJaw weights.
    result = {
        "measurement": measurement,
        "hinge": mathutils.Vector((0.0, cavity_state["hinge_y"], cavity_state["jaw_z"])),
        "lip_planes": {
            "upper": (mathutils.Vector((0.0, cavity_state["hinge_y"], cavity_state["jaw_z"])),
                       mathutils.Vector((0.0, -math.tan(cavity_state["half_gape"]), 1.0))),
            "lower": (mathutils.Vector((0.0, cavity_state["hinge_y"], cavity_state["jaw_z"])),
                       mathutils.Vector((0.0, math.tan(cavity_state["lower_gape"]), 1.0))),
        },
        "commissure": {"Head": .5, "LowerJaw": .5},
        "base": _jaw_weight_map(obj, measurement, lip_band, cavity_state),
        "objects": {},
        "cut": {
            "wedge_faces": cavity_state["wedge_faces"],
            "boundary_vertices": cavity_state["boundary_vertices"],
            "upper_loop_width": cavity_state["upper_loop_width"],
            "lower_loop_width": cavity_state["lower_loop_width"],
        },
    }
    cavity = _make_cavity(measurement, obj, cavity_state)
    lip, lip_map = _make_lower_lip(measurement, cavity_state)
    result["objects"][lip.name] = lip_map
    result["objects"][cavity.name] = cavity_state["cavity_jaw_map"]

    kit_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "kit"))
    if teeth == "strip":
        upper, upper_map = _load_teeth(os.path.join(kit_dir, "teeth_strip_upper.glb"),
                                       mouth_object_name("UpperTeeth"), obj, False, cavity_state, measurement)
        lower, lower_map = _load_teeth(os.path.join(kit_dir, "teeth_strip_lower.glb"),
                                       mouth_object_name("LowerTeeth"), obj, True, cavity_state, measurement)
        result["objects"][upper.name] = upper_map
        result["objects"][lower.name] = lower_map

    # L1d gate print: lip band height and per-strip seating, measured on the
    # authored objects while the exact rim rows are still in scope.
    _lipz = [vertex.co.z for vertex in lip.data.vertices]
    _band = (max(_lipz) - min(_lipz)) / measurement["L"]
    _line = "L1DGATE band=%.5f band_pass=%s" % (_band, _band <= LIP_BAND_MAX_L)
    if teeth == "strip":
        for _t, _n in ((upper, "upper"), (lower, "lower")):
            _d = float(_t.get("rf_seat_dist_L", -1.0))
            _line += " %s_seat=%.5f %s_pass=%s" % (_n, _d, _n, _d <= .005)
    print(_line)

    obj["rf_mouth_cut"] = True
    obj["rf_mouth_cut_method"] = "bisect upper/lower hinged planes; clear forward wedge"
    obj["rf_mouth_gape_deg"] = float(effective_gape)
    obj["rf_mouth_lowerjaw_external"] = True
    obj["rf_mouth_hinge_t"] = float(cavity_state["hinge_t"])
    obj["rf_mouth_flat_chin"] = bool(cavity_state["flat_chin"])
    obj["rf_mouth_back_t"] = (cavity_state["back_y"] - measurement["ymin"]) / measurement["L"]
    obj["rf_mouth_body_bbox"] = tuple(float(value) for value in (
        cavity_state["body_lo"].x, cavity_state["body_lo"].y, cavity_state["body_lo"].z,
        cavity_state["body_hi"].x, cavity_state["body_hi"].y, cavity_state["body_hi"].z))
    obj["rf_mouth_boundary_x_extent"] = float(cavity_state["x_max"] - cavity_state["x_min"])
    obj["rf_mouth_cavity_inside_body"] = True
    return result
