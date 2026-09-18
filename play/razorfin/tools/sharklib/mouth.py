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
import mathutils.kdtree

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
    # Parenting via assignment (rather than bpy.ops.object.parent_set) leaves
    # matrix_parent_inverse at whatever it was before -- usually identity for
    # a freshly created object, but if the armature is not at world origin
    # that silently double-transforms every mouth object away from the mesh
    # it was seated against.  Set it explicitly so seating is never at the
    # mercy of the armature's own transform.
    obj.matrix_parent_inverse = armature.matrix_world.inverted()
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
    # sy/sz were fixed constants (.32/.18) independent of body scale.  The kit
    # strip is authored in its own absolute units (strip_width ~= .38); sx
    # compresses that down to the measured mouth width in body-length units,
    # but a fixed sy/sz left the crown-height and arc-bulge axes uncompressed
    # by the same ratio, so on a normalized (L=1) body the strip's own local Y
    # bulge and Z crown height overshot the cavity rim by several times the
    # seating gate -- the floating tooth-strip defect (present on every
    # family, confirmed on snapjaw and artemisstrike: bind-pose LowerTeeth sat
    # ~0.02L above the lower lip band instead of tucked against it). Scale Y
    # and Z proportionally to sx so the strip keeps its authored shape but is
    # sized consistently with how much X was compressed to fit the mouth.
    sy = sx
    sz = sx
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


# --- JW-3: ramp width floor (hse/JAW-WEIGHT-SPEC.md) -------------------------
#
# A smoothstep of width d contributes at most 1.5 * e / d to |dW| across an
# edge of length e, since max|smoothstep'| = 1.5.  JW-1 allows
# |dW| <= 2 * e / (arm * theta), so every ramp must satisfy
#
#     d  >=  0.75 * arm * theta
#
# independent of e: the edge length cancels, which is why this is a property of
# the SHAPE and not of the tessellation.  theta is the real open travel,
# 25 deg = 0.4363 rad (hse/jaw_gate_config.mjs).
#
# BUT a ramp also has to FIT.  Lane 4 first shipped this as one constant sized
# for the worst arm (aresrender p90 0.209 L -> 0.068 L) and that silently
# destroyed two families: the weighted band is only ~0.03 L deep in z, so a
# 0.068 L z-ramp never saturates, every value landed under JAW_WEIGHT_FLOOR,
# and artemisstrike + leviathanrex exported with NO jaw weight at all.  Their
# stretch read a perfect 1.000x because the jaw had stopped moving -- the exact
# shape of false pass this pipeline has been bitten by before.
#
# So the floor is a REQUEST, clamped to the space the ramp actually has:
# widening past roughly a third of the band trades the cliff for a band that
# cannot saturate, which the lower-lip classifier reads as "no lower lip".
# Where the clamp binds, the residual cliff is handled downstream by
# _limit_weight_gradient rather than by pretending the ramp fits.
#
# JW-4: a function of geometry and travel only.  Never scaled by
# gape_degrees / half_gape / lower_gape.
# NOT derived at runtime from arm/theta, which is a known weakness: it is a
# literal sized from one family's measured arm.  Lane 4's gate flagged this and
# it is honest to say so here -- see hse/JAW-WEIGHT-SPEC.md section 6, which
# also records that the arms this was sized from were themselves measured with
# a bad hinge.  Treat as provisional; the real fix is decimator-side.
JAW_RAMP_REQUEST_L = .068
# Fraction of the available opening a ramp may occupy.  A ramp must SATURATE
# inside its band or every value falls under JAW_WEIGHT_FLOOR and the jaw stops
# moving (lane 4 attempt 1 did exactly this to two families, and their stretch
# then read a perfect 1.000x because nothing moved).  A third leaves room for
# the plateau the lower-lip classifier needs; it is not otherwise derived.
JAW_RAMP_BAND_FRACTION = .34


def _ramp_width(length, height, fraction_of_height, available=None):
    """Smoothstep width honouring the JW-3 floor, clamped to available space.

    ``available`` is the extent (in scene units) the ramp has to work with; the
    width is never allowed past ``JAW_RAMP_BAND_FRACTION`` of it, so the ramp
    always saturates inside its own band.
    """
    want = max(JAW_RAMP_REQUEST_L * length, fraction_of_height * height)
    if available is not None and available > EPS:
        want = min(want, JAW_RAMP_BAND_FRACTION * available)
    return max(want, fraction_of_height * height * .5, EPS)


def _jaw_weight_field(co, measurement, lip_band, cavity_state):
    """LowerJaw weight for ONE point, as a pure function of position.

    This is a continuous scalar field over the oriented local frame.  It knows
    nothing about topology: no vertex indices, no edge lengths, no per-base
    branches.  Everything it needs comes from the measured landmarks
    (``measurement``) and the cut geometry (``cavity_state``), both of which are
    derived from the shape of the animal rather than from how densely the scan
    happens to be tessellated there.

    Sampling this field directly on a post-remesh mesh is what Rev 17 did, and
    it is the defect: the field has a steep gradient across the lip seam, so a
    remesh that changes edge density inside that gradient puts very different
    weights on the two ends of a physically tiny edge and the skinning gate
    reads it as extreme stretch.  The field is therefore evaluated ONCE on the
    pristine pre-accessory mesh and projected forward; see
    :func:`snapshot_jaw_field` and :func:`_project_jaw_weights`.
    """
    ymin, length, height = measurement["ymin"], measurement["L"], measurement["H"]
    jaw_z = measurement["jaw_line"]["z"]
    hinge_t = float(cavity_state["hinge_t"])
    t = (co.y - ymin) / length

    # JW-2: everything aft of the hinge is skull and never moves, but that is
    # expressed by the `forward` and `hinge` ramps below, which already reach
    # exactly 0 there.  Rev 18 lane 4 removed a `return 0.0` branch that sat
    # here: a hard step of |dW| = 1.0 across whichever edge crossed it.
    # Measured, it suppressed no weight on any pilot (both ramps were already
    # 0 wherever it fired), so removing it is a no-op on today's geometry --
    # but it was one ramp-position change away from becoming a live cliff that
    # no downstream cap could see.  The field now has no branches at all.

    lower_plane = _plane_z(co.y, cavity_state["hinge_y"], jaw_z,
                           cavity_state["lower_gape"], -1.0)
    upper_plane = _plane_z(co.y, cavity_state["hinge_y"], jaw_z,
                           cavity_state["half_gape"], 1.0)

    # Below the lower lip plane -> jaw.  Saturates quickly: a vertex clearly
    # under the cut is fully jaw-driven, the ramp only spans the seam itself.
    # The band has to be thick enough that the probe's lower-lip classifier
    # (jaw weight > .4, lowest 15% of head height) finds its required minimum
    # of 6 vertices on every base; a hairline band reads as "no lower lip".
    # Rev 18 lane 3: the ramp WIDTH must be resolvable by the mesh.  At
    # .016*H this smoothstep completed inside a single edge on the denser
    # bases -- snapjaw's jaw-weight histogram was bimodal (7695 verts at ~0,
    # 143 at ~1, almost nothing between), so the field was continuous in
    # theory and a step in practice.  An interpolated projection cannot
    # recover a gradient the source field never resolved, which is why lane
    # 3's first pass moved snapjaw least.  Widening the ramp gives the
    # transition several edges to live on, so both the projection and the
    # gradient cap have something real to work with.
    # Space available to the z-ramps: the opening between the two lip planes at
    # this y, which is what both ramps have to live inside.
    opening = max(upper_plane - lower_plane, .02 * height)

    below = _smoothstep((lower_plane + max(.030 * length, lip_band * height) - co.z) /
                        _ramp_width(length, height, .060, opening))

    # Forward of the hinge -> jaw, with the ramp scaled into the space that
    # actually exists ahead of the hinge so it always saturates before the
    # snout tip regardless of where the detector put the hinge.  Both ramps
    # start FORWARD of the pivot so every weighted vertex has a real moment
    # arm; a band sitting on the hinge itself has lever arm ~0 and produces no
    # travel no matter how high its weight is.  They also have to SATURATE
    # early enough to leave a plateau of fully jaw-driven vertices rather than
    # a single peak, for the same >=6 vertex reason.
    span = max(.04, 1.0 - hinge_t)
    forward = _smoothstep((t - (hinge_t + .010)) / (.30 * span))
    hinge = _smoothstep((t - (hinge_t + .004)) / (.18 * span))

    # Under the upper lip plane -> inside the opening.  Always a ramp, never a
    # hard cutoff: a step here would put full-weight and zero-weight vertices
    # on opposite ends of one edge.  Rev 18 lane 4 measured this as THE
    # stepping term on snapjaw (per-term delta 0.265 across a 0.004 L pair,
    # against 0.073 for every other term), which is why lane 3's widening of
    # `below` alone left snapjaw's histogram bimodal.  The width is not a free
    # shape decision: JW-3 floors it.
    in_opening_band = _smoothstep((upper_plane + .02 * height - co.z) /
                                  _ramp_width(length, height, .05, opening))

    # Soften towards the corners of the mouth so the commissure does not tear.
    commissure = _smoothstep((abs(co.x - cavity_state["centre_x"]) /
                              max(.001, cavity_state["x_max"] - cavity_state["x_min"]) * 2.0 - .70) / .30)

    weight = below * forward * hinge * in_opening_band
    weight *= 1.0 - .5 * commissure
    return min(1.0, max(0.0, weight))


def _jaw_weight_terms(co, measurement, lip_band, cavity_state):
    """Every factor of :func:`_jaw_weight_field`, separately, for diagnosis."""
    ymin, length, height = measurement["ymin"], measurement["L"], measurement["H"]
    jaw_z = measurement["jaw_line"]["z"]
    hinge_t = float(cavity_state["hinge_t"])
    t = (co.y - ymin) / length
    lower_plane = _plane_z(co.y, cavity_state["hinge_y"], jaw_z,
                           cavity_state["lower_gape"], -1.0)
    upper_plane = _plane_z(co.y, cavity_state["hinge_y"], jaw_z,
                           cavity_state["half_gape"], 1.0)
    span = max(.04, 1.0 - hinge_t)
    return {
        "t": t,
        "below": _smoothstep((lower_plane + max(.030 * length, lip_band * height) - co.z) /
                             _ramp_width(length, height, .060, max(upper_plane - lower_plane, .02 * height))),
        "forward": _smoothstep((t - (hinge_t + .010)) / (.30 * span)),
        "hinge": _smoothstep((t - (hinge_t + .004)) / (.18 * span)),
        "in_opening_band": _smoothstep((upper_plane + .02 * height - co.z) /
                                       _ramp_width(length, height, .05, max(upper_plane - lower_plane, .02 * height))),
        "commissure": _smoothstep((abs(co.x - cavity_state["centre_x"]) /
                                   max(.001, cavity_state["x_max"] - cavity_state["x_min"])
                                   * 2.0 - .70) / .30),
    }


def _dump_jaw_terms(points, source_weights, measurement, lip_band, cavity_state):
    """Write every source point's per-term factor values as CSV.

    Diagnosis only, enabled by RAZORFIN_JAW_TERM_DUMP=<path>.  Lets a lane see
    WHICH factor steps across a short edge instead of guessing at ramp widths.
    """
    target = os.environ.get("RAZORFIN_JAW_TERM_DUMP")
    if not target or target == "1":
        target = "/tmp/rf_jaw_terms.csv"
    keys = ("t", "below", "forward", "hinge", "in_opening_band", "commissure")
    with open(target, "w") as handle:
        handle.write("i,x,y,z,w," + ",".join(keys) + "\n")
        for index, point in enumerate(points):
            terms = _jaw_weight_terms(point, measurement, lip_band, cavity_state)
            handle.write("%d,%.6f,%.6f,%.6f,%.6f," % (
                index, point.x, point.y, point.z, source_weights[index]))
            handle.write(",".join("%.6f" % terms[key] for key in keys) + "\n")
    print("MOUTH jaw term dump -> %s (%d points)" % (target, len(points)))


def snapshot_jaw_field(obj):
    """Record the body's PRE-accessory, PRE-lattice vertex positions.

    Returned dict is opaque to callers; hand it back to :func:`cut_mouth` as
    ``field_snapshot``.  Taking it costs one coordinate copy and is the whole
    mechanism that decouples jaw weights from later topology edits.
    """
    if not obj or obj.type != "MESH":
        return None
    # Rev 18 lane 3: the snapshot now carries TRIANGLES as well as points.
    # Nearest-point-on-triangle with barycentric blending needs the source
    # connectivity; a point cloud can only ever answer "which vertex", which is
    # the snap that manufactured the cliffs.  Polygons are triangulated by fan
    # here rather than at lookup time so the hot loop stays flat.
    tris = []
    for poly in obj.data.polygons:
        loop = list(poly.vertices)
        for k in range(1, len(loop) - 1):
            tris.append((loop[0], loop[k], loop[k + 1]))
    return {
        "points": [vertex.co.copy() for vertex in obj.data.vertices],
        "tris": tris,
        "source": obj.name,
    }


# How many candidate source triangles to test per target vertex.  The KDTree is
# built over centroids, so the true closest triangle is not always the closest
# centroid -- a long thin triangle can have a far centroid and a near edge.
# Eight is comfortably past the point where the winner stops changing on these
# meshes and still costs about one second per family.
_PROJECT_CANDIDATES = 8


def _closest_on_tri(p, a, b, c):
    """Closest point to ``p`` on triangle ``abc``, as barycentric coords.

    Returns ``(u, v, w, dist_sq)`` with ``u + v + w == 1``, all non-negative:
    the standard Ericson region test, including the three vertex regions and
    the three edge regions, so a query point off the side of the triangle
    resolves onto the correct edge rather than collapsing to a corner.
    """
    ab = b - a
    ac = c - a
    ap = p - a
    d1 = ab.dot(ap)
    d2 = ac.dot(ap)
    if d1 <= 0.0 and d2 <= 0.0:
        return 1.0, 0.0, 0.0, (p - a).length_squared
    bp = p - b
    d3 = ab.dot(bp)
    d4 = ac.dot(bp)
    if d3 >= 0.0 and d4 <= d3:
        return 0.0, 1.0, 0.0, (p - b).length_squared
    vc = d1 * d4 - d3 * d2
    if vc <= 0.0 and d1 >= 0.0 and d3 <= 0.0:
        denom = d1 - d3
        v = d1 / denom if abs(denom) > EPS else 0.0
        q = a + ab * v
        return 1.0 - v, v, 0.0, (p - q).length_squared
    cp = p - c
    d5 = ab.dot(cp)
    d6 = ac.dot(cp)
    if d6 >= 0.0 and d5 <= d6:
        return 0.0, 0.0, 1.0, (p - c).length_squared
    vb = d5 * d2 - d1 * d6
    if vb <= 0.0 and d2 >= 0.0 and d6 <= 0.0:
        denom = d2 - d6
        w = d2 / denom if abs(denom) > EPS else 0.0
        q = a + ac * w
        return 1.0 - w, 0.0, w, (p - q).length_squared
    va = d3 * d6 - d5 * d4
    if va <= 0.0 and (d4 - d3) >= 0.0 and (d5 - d6) >= 0.0:
        denom = (d4 - d3) + (d5 - d6)
        w = (d4 - d3) / denom if abs(denom) > EPS else 0.0
        q = b + (c - b) * w
        return 0.0, 1.0 - w, w, (p - q).length_squared
    denom = va + vb + vc
    if abs(denom) <= EPS:
        return 1.0, 0.0, 0.0, (p - a).length_squared
    v = vb / denom
    w = vc / denom
    q = a + ab * v + ac * w
    return 1.0 - v - w, v, w, (p - q).length_squared


def _interpolate_from_tris(obj, points, tris, source_weights):
    """Project the snapshot weight field onto the current mesh, smoothly.

    THE DEFECT THIS REPLACES.  The previous projection snapped each current
    vertex to its nearest SNAPSHOT VERTEX and copied that vertex's weight
    verbatim.  The snapshot field is continuous, but a nearest-vertex lookup
    samples it through a Voronoi partition, so the projected field is piecewise
    CONSTANT with discontinuities on the Voronoi boundaries.  Two current
    vertices a few 1e-3 L apart that happen to fall either side of such a
    boundary inherit weights from two different source vertices, and if the
    field varies steeply between them -- which it does by design, that is the
    jaw seam -- the edge between them carries the full difference.  That is
    exactly the 0.000/0.936 and 0.992/0.344 pairs the dumps kept finding: not
    remesh noise, but the snap quantising a smooth field onto a coarse cell
    structure.  No post-hoc gradient cap can repair it, because by the time the
    cap runs the information needed to interpolate has already been thrown
    away; lane 2 proved that empirically.

    The fix is to sample the source field where it is actually defined: on the
    source SURFACE, not at its vertices.  For each current vertex, find the
    closest point on the nearest source triangles and blend the three corner
    weights by that point's barycentric coordinates.  The result is C0
    continuous across the whole source surface, so the weight difference across
    a current edge is now bounded by the field's variation over that edge's own
    (short) length rather than by a Voronoi cell's worth of it.  Seam awareness
    is inherent: a triangle spanning the seam interpolates across it instead of
    picking a side.

    JAW_INTERIOR_PIN semantics are preserved: interpolation is a convex
    combination, so a point inside a fully jaw-weighted region still reads 1.0
    and stays above the pin; only the flank, where the source corners disagree,
    is smoothed -- which is the intent.
    """
    tree = mathutils.kdtree.KDTree(len(tris))
    centroid_third = 1.0 / 3.0
    for index, (ia, ib, ic) in enumerate(tris):
        centroid = (points[ia] + points[ib] + points[ic]) * centroid_third
        tree.insert(centroid, index)
    tree.balance()

    dense = [0.0] * len(obj.data.vertices)
    for vertex in obj.data.vertices:
        co = vertex.co
        best_d2 = None
        best_value = 0.0
        for _, tri_index, _ in tree.find_n(co, _PROJECT_CANDIDATES):
            ia, ib, ic = tris[tri_index]
            u, v, w, d2 = _closest_on_tri(co, points[ia], points[ib], points[ic])
            if best_d2 is None or d2 < best_d2:
                best_d2 = d2
                best_value = (u * source_weights[ia]
                              + v * source_weights[ib]
                              + w * source_weights[ic])
        dense[vertex.index] = min(1.0, max(0.0, best_value))
    return dense


def _project_jaw_weights(obj, snapshot, measurement, lip_band, cavity_state):
    """Weights for the CURRENT mesh, projected from the pre-op mesh.

    The field is evaluated on the snapshot's vertices -- the topology it was
    authored against -- and every current vertex then samples that field on the
    snapshot SURFACE, by barycentric interpolation at the closest point of the
    nearest source triangle (see :func:`_interpolate_from_tris`).  Sampling a
    surface rather than a point cloud is what makes the projected field
    continuous; the older nearest-VERTEX snap quantised it onto Voronoi cells
    and so put a full weight cliff on whichever current edge happened to cross
    a cell boundary.

    Falls back to direct evaluation when no snapshot is available (the
    standalone shark_bake path, where nothing edits topology before the cut).
    """
    points = (snapshot or {}).get("points") or []
    if not points:
        return {vertex.index: value
                for vertex in obj.data.vertices
                for value in (_jaw_weight_field(vertex.co, measurement, lip_band, cavity_state),)
                if value > JAW_WEIGHT_FLOOR}

    source_weights = [_jaw_weight_field(point, measurement, lip_band, cavity_state)
                      for point in points]

    if os.environ.get("RAZORFIN_JAW_TERM_DUMP"):
        _dump_jaw_terms(points, source_weights, measurement, lip_band, cavity_state)

    tris = (snapshot or {}).get("tris") or []
    if tris:
        dense = _interpolate_from_tris(obj, points, tris, source_weights)
    else:
        # Legacy snapshot with no connectivity: fall back to the old snap.
        tree = mathutils.kdtree.KDTree(len(points))
        for index, point in enumerate(points):
            tree.insert(point, index)
        tree.balance()
        dense = [0.0] * len(obj.data.vertices)
        for vertex in obj.data.vertices:
            _, nearest, _ = tree.find(vertex.co)
            if nearest is not None:
                dense[vertex.index] = source_weights[nearest]

    dense = _limit_weight_gradient(obj, dense, measurement, cavity_state)

    weights = {}
    for index, value in enumerate(dense):
        # Same floor as before: a vertex carrying a few percent of LowerJaw
        # still visibly swings at a 0.72 rad gape while reading as "upper head"
        # to any consumer that thresholds jaw weight low (probe_jaw uses 0.05).
        if value > JAW_WEIGHT_FLOOR:
            weights[index] = value
    return weights


# How far a point may travel, as a fraction of an edge's own rest length,
# before that edge reads as torn.  probe_jaw fails an edge above 3.0x; the
# budget below is deliberately well under that so the projected band still has
# room to round off without touching the gate.
EDGE_STRETCH_BUDGET = 1.6

# A vertex at or above this weight is band INTERIOR, not flank: it is already
# essentially fully jaw-driven, so there is no gradient at it to round off and
# the relaxation must not pull it down.  Sits above the probe's jw>.4 lower-lip
# classifier so a pinned vertex always still counts as lower lip.
JAW_INTERIOR_PIN = .55


def _limit_weight_gradient(obj, dense, measurement, cavity_state):
    """Cap how much LowerJaw weight may change across any ONE mesh edge.

    Stretch is a per-edge quantity: the probe divides an edge's posed length by
    its rest length.  A large weight difference across a PHYSICALLY SHORT edge
    is what produces an extreme ratio, because the two endpoints follow the jaw
    by very different amounts while starting almost on top of each other.  That
    is the defect the whole escalation is about, and no distance-based band
    rule can see it: band width is measured in body lengths, stretch is
    measured in edge lengths, and a remesh changes the second without changing
    the first.

    So bound it directly and on the mesh the gate actually measures.  For each
    edge, the endpoints' weight difference is allowed to be at most
    ``EDGE_STRETCH_BUDGET * (rest_length / L) / arm``, where ``arm`` is the
    hinge-to-midpoint distance normalised by ``L`` (the lever through which a
    unit of weight becomes travel).  Both terms are dimensionless.  A short
    edge, or one far out on the jaw, therefore gets a tighter cap than a long
    edge near the pivot, automatically and on every base.  Weights are relaxed
    downward only, so the band keeps its shape and its peak stays where
    ``_jaw_weight_field`` put it; only the steep flank is rounded off.

    One rule, no per-base constants: replaces the L1b-L1e stack rather than
    re-creating it in another form.
    """
    mesh = obj.data
    if not mesh.edges or not dense:
        return dense
    hinge_y = float(cavity_state["hinge_y"])
    jaw_z = float(cavity_state["jaw_z"])
    length = max(measurement["L"], EPS)

    edges = []
    for edge in mesh.edges:
        a, b = edge.vertices
        if a >= len(dense) or b >= len(dense):
            continue
        ca, cb = mesh.vertices[a].co, mesh.vertices[b].co
        rest = (ca - cb).length
        if rest < EPS:
            continue
        # Lever arm at the edge midpoint, normalised by body length so the cap
        # is scale free.
        mid_y = .5 * (ca.y + cb.y)
        mid_z = .5 * (ca.z + cb.z)
        arm = math.hypot(mid_y - hinge_y, mid_z - jaw_z) / length
        if arm < EPS:
            continue
        # Only edges that touch the band can be the steep ones; an edge with
        # two zero-weight endpoints has nothing to relax and never will, since
        # relaxation is downward-only.  Skipping them keeps this pass
        # proportional to the mouth rather than to the whole body.
        if dense[a] <= 0.0 and dense[b] <= 0.0:
            continue
        allowed = EDGE_STRETCH_BUDGET * (rest / length) / arm
        edges.append((a, b, min(1.0, allowed)))

    # Relax until every edge is inside its cap.  Each sweep pulls the HIGHER
    # endpoint down to the cap, so the sequence is monotonically decreasing and
    # bounded below by zero: it converges.  The iteration limit is a guard, not
    # a tuning knob; these meshes settle in a handful of sweeps.
    # PIN the interior of the band.  Relaxation is a diffusion: left free, it
    # propagates inward from the band's outer flank and drags the whole band
    # down to a low plateau.  Measured on leviathanrex, that put every band
    # vertex at .376-.423, just under the probe's jw>.4 lower-lip classifier,
    # so a band of 36 real vertices was scored as 4.  The steep flank is the
    # only part that needs rounding; a vertex that is already essentially
    # fully jaw-driven is not on a gradient and must keep its weight, or the
    # lip stops being a lip.
    pinned = [value >= JAW_INTERIOR_PIN for value in dense]

    # Relaxation only ever lowers the HIGHER endpoint, so an edge whose higher
    # endpoint is pinned can never be brought inside its cap, no matter how
    # many sweeps run.  Such an edge is a consequence of the pin decision, not
    # a failure of the relaxation, and counting its excess into the residual
    # made the loop burn all 24 sweeps and report converged=False even when
    # every SATISFIABLE edge had settled to zero.  Measured 2026-09-17 on the
    # rebaked families: thresher 547 of 2455 edges structurally unsatisfiable
    # (374 with BOTH ends pinned), snapjaw 365 of 959 (289 both) - and with
    # those excluded the residual over the satisfiable edges was exactly
    # 0.000000 on both.  The reported non-convergence was entirely pinned
    # edges.  So the convergence test now runs over satisfiable edges only,
    # everything that can be capped still is, and the unsatisfiable count is
    # reported separately rather than being hidden inside the residual.
    #
    # Note the predicate is "higher endpoint pinned", which is strictly wider
    # than "both endpoints pinned": if only the LOWER end is pinned the higher
    # end is still free to come down, so that edge is satisfiable.
    sweeps, worst, unsatisfiable = 0, 0.0, 0
    for sweeps in range(1, 25):
        worst = 0.0
        unsatisfiable = 0
        for a, b, allowed in edges:
            delta = dense[a] - dense[b]
            excess = abs(delta) - allowed
            if excess <= 0.0:
                continue
            if delta > 0.0:
                if pinned[a]:
                    unsatisfiable += 1
                    continue
                worst = max(worst, excess)
                dense[a] = dense[b] + allowed
            else:
                if pinned[b]:
                    unsatisfiable += 1
                    continue
                worst = max(worst, excess)
                dense[b] = dense[a] + allowed
        if worst <= 1.0e-4:
            break
    print("MOUTH gradient cap edges=%d sweeps=%d residual=%.6f converged=%s "
          "pinned_unsatisfiable=%d"
          % (len(edges), sweeps, worst, worst <= 1.0e-4, unsatisfiable),
          flush=True)
    return dense


def cut_mouth(obj, gape_deg=25.0, cavity_depth=.12, lip_band=.06, teeth="strip",
              field_snapshot=None):
    """Cut and author a hinged mouth payload on *obj*.

    ``field_snapshot`` is the value returned by :func:`snapshot_jaw_field` on
    this body BEFORE any accessory fuse / remesh / lattice ran.  When given,
    LowerJaw weights are projected from it rather than resampled on the final
    topology; see :func:`_project_jaw_weights`.  Omit it only when nothing
    edits topology between measure and cut.

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
        "base": _project_jaw_weights(obj, field_snapshot, measurement,
                                    lip_band, cavity_state),
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
