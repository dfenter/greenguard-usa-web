"""High-to-low reduction, EMIT diffuse transfer, and tangent normal baking."""

import math

import bpy


def tris_of(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def apply_mod(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def clean(obj, weld=1e-5):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=weld)
    bpy.ops.mesh.delete_loose()
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def reduce_mesh(high, target, length):
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    bpy.context.view_layer.objects.active = high
    bpy.ops.object.duplicate()
    low = bpy.context.view_layer.objects.active
    low.name = high.name if high.name != "high" else "low"
    # Keep the caller's name after duplication; the legacy caller overwrites it.
    low.data.materials.clear()
    source_tris = tris_of(low)
    weld = length * 0.0006 if source_tris > 200000 else (
        length * 0.0002 if source_tris > 40000 else 0.0)
    clean(low, weld=weld if weld > 0 else 1e-6)
    print("LOW weld %.5f" % weld)
    n = tris_of(low)
    print("LOW after weld", n)
    if n > 20000:
        want = 150000
        low.data.calc_loop_triangles()
        area = sum(triangle.area for triangle in low.data.loop_triangles)
        remesh = low.modifiers.new("rm", "REMESH")
        remesh.mode = "VOXEL"
        remesh.adaptivity = 0.0
        voxel = max(length * 0.0012, min(length * 0.010, math.sqrt(area / max(1, want))))
        for _ in range(2):
            remesh.voxel_size = voxel
            evaluated = low.evaluated_get(bpy.context.evaluated_depsgraph_get())
            evaluated_mesh = evaluated.to_mesh()
            tri_count = len(evaluated_mesh.loop_triangles) if evaluated_mesh else 0
            evaluated.to_mesh_clear()
            if 90000 <= tri_count <= 220000 or tri_count == 0:
                break
            voxel = max(length * 0.0012,
                        min(length * 0.010, voxel * math.sqrt(tri_count / float(want))))
        remesh.voxel_size = voxel
        apply_mod(low, remesh)
        print("  pre-collapse voxel remesh %.5f -> %d tris (manifold)" % (voxel, tris_of(low)))

    pass_index = 0
    while tris_of(low) > target * 1.08:
        n = tris_of(low)
        decimate = low.modifiers.new("dec", "DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.use_collapse_triangulate = True
        decimate.ratio = max(0.34, min(0.95, (target * 0.97) / n))
        apply_mod(low, decimate)
        print("  dec pass %d %d -> %d (ratio %.4f)" %
              (pass_index, n, tris_of(low), decimate.ratio))
        pass_index += 1
        if pass_index > 20:
            print("  WARNING: collapse loop hit pass cap")
            break
    n = tris_of(low)
    if n > target * 1.08:
        decimate = low.modifiers.new("dec", "DECIMATE")
        decimate.use_collapse_triangulate = True
        decimate.ratio = max(0.1, (target * 0.99) / n)
        apply_mod(low, decimate)
    clean(low)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("LOW tris", tris_of(low), "dims", tuple(round(v, 3) for v in low.dimensions))
    return low


def _base_color_source(mat):
    if not mat or not mat.use_nodes:
        return ("RGB", list(mat.diffuse_color) if mat else [0.5, 0.5, 0.5, 1.0])
    tree = mat.node_tree
    best = None
    for node in tree.nodes:
        if node.type != "TEX_IMAGE" or not node.image:
            continue
        name = (node.image.name or "").lower()
        if any(key in name for key in ("normal", "metallicroughness", "roughness", "occlusion", "orm", "_arm")):
            continue
        if node.image.colorspace_settings.name == "Non-Color":
            continue
        score = 2 if any(key in name for key in ("basecolor", "diffuse", "albedo")) else 1
        if node.outputs["Color"].links:
            score += 2
        if best is None or score > best[0]:
            best = (score, node)
    if best:
        return ("TEX", best[1])
    for node in tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return ("RGB", list(node.inputs["Base Color"].default_value))
        if node.type == "EMISSION":
            return ("RGB", list(node.inputs["Color"].default_value))
    return ("RGB", list(mat.diffuse_color))


def rebuild_emission_materials(high):
    """Make every high slot a faithful, lighting-free source for EMIT baking."""
    if not high.data.materials:
        mat = bpy.data.materials.new("highmat")
        mat.use_nodes = True
        high.data.materials.append(mat)
    for slot_index, slot in enumerate(high.material_slots):
        kind, payload = _base_color_source(slot.material)
        flat = bpy.data.materials.new("emit_%d" % slot_index)
        flat.use_nodes = True
        tree = flat.node_tree
        tree.nodes.clear()
        output = tree.nodes.new("ShaderNodeOutputMaterial")
        emission = tree.nodes.new("ShaderNodeEmission")
        emission.inputs["Strength"].default_value = 1.0
        tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
        if kind == "TEX":
            old = payload
            tex = tree.nodes.new("ShaderNodeTexImage")
            tex.image = old.image
            tex.interpolation = old.interpolation
            tex.extension = old.extension
            tex.image.colorspace_settings.name = "sRGB"
            uv_node = tree.nodes.new("ShaderNodeUVMap")
            source_uv = ""
            if old.inputs["Vector"].is_linked:
                source_node = old.inputs["Vector"].links[0].from_node
                if source_node.type == "UVMAP":
                    source_uv = source_node.uv_map
            uv_node.uv_map = source_uv or (high.data.uv_layers[0].name if high.data.uv_layers else "")
            tree.links.new(uv_node.outputs["UV"], tex.inputs["Vector"])
            tree.links.new(tex.outputs["Color"], emission.inputs["Color"])
            print("SLOT %d tex %s %s" % (slot_index, old.image.name, tuple(old.image.size)))
        else:
            emission.inputs["Color"].default_value = (payload + [1, 1, 1, 1])[:4]
            print("SLOT %d flat %s" % (slot_index, tuple(round(v, 3) for v in payload[:3])))
        slot.material = flat
    if high.data.color_attributes and all(
            not any(n.type == "TEX_IMAGE" for n in slot.material.node_tree.nodes)
            for slot in high.material_slots):
        color_attribute = high.data.color_attributes[0].name
        for slot in high.material_slots:
            emission = next(n for n in slot.material.node_tree.nodes if n.type == "EMISSION")
            vertex_color = slot.material.node_tree.nodes.new("ShaderNodeVertexColor")
            vertex_color.layer_name = color_attribute
            slot.material.node_tree.links.new(vertex_color.outputs["Color"], emission.inputs["Color"])
        print("VCOL using", color_attribute)


def flatten_dorsal_luminance(image, obj, strength=1.0, target=0.5, desat=0.0):
    """Copy the legacy opt-in UV-space low-frequency luminance correction."""
    import numpy as np

    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    rgb = pixels[:, :, :3]

    def to_linear(c):
        return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

    def to_srgb(c):
        c = np.clip(c, 0.0, None)
        return np.where(c <= 0.0031308, c * 12.92, 1.055 * (c ** (1 / 2.4)) - 0.055)

    coords = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", coords)
    coords = coords.reshape(-1, 3)
    extents = coords.max(axis=0) - coords.min(axis=0)
    long_axis = int(np.argmax(extents))
    best_axis, best_asym = None, -1.0
    for axis in range(3):
        if axis == long_axis:
            continue
        delta = coords[:, axis] - np.median(coords[:, axis])
        asym = abs(int((delta > 0).sum()) - int((delta < 0).sum())) / max(1, len(coords))
        if asym > best_asym:
            best_axis, best_asym = axis, asym
    up = coords[:, best_axis]
    low, high = np.percentile(up, 2), np.percentile(up, 98)
    vertex_t = np.clip((up - low) / max(1e-9, high - low), 0.0, 1.0)
    obj.data.calc_loop_triangles()
    uv = obj.data.uv_layers.active.data
    tmap = np.full((height, width), -1.0, dtype=np.float32)
    for tri in obj.data.loop_triangles:
        points = []
        for loop_index, vertex_index in zip(tri.loops, tri.vertices):
            u, v = uv[loop_index].uv
            points.append((u * (width - 1), (1.0 - v) * (height - 1), vertex_t[vertex_index]))
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        x0, x1 = max(0, int(math.floor(min(xs)))), min(width - 1, int(math.ceil(max(xs))))
        y0, y1 = max(0, int(math.floor(min(ys)))), min(height - 1, int(math.ceil(max(ys))))
        if x1 < x0 or y1 < y0:
            continue
        (ax, ay, at), (bx, by, bt), (cx, cy, ct) = points
        denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denominator) < 1e-12:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        xx, yy = xx.astype(np.float32), yy.astype(np.float32)
        l1 = ((by - cy) * (xx - cx) + (cx - bx) * (yy - cy)) / denominator
        l2 = ((cy - ay) * (xx - cx) + (ax - cx) * (yy - cy)) / denominator
        l3 = 1.0 - l1 - l2
        mask = (l1 >= -0.002) & (l2 >= -0.002) & (l3 >= -0.002)
        if mask.any():
            block = tmap[y0:y1 + 1, x0:x1 + 1]
            block[mask] = (l1 * at + l2 * bt + l3 * ct)[mask]
            tmap[y0:y1 + 1, x0:x1 + 1] = block
    body = tmap >= 0.0
    if body.sum() < 64:
        print("FLATLUM skipped: UV rasterisation covered only %d texels" % body.sum())
        return
    nb = 24
    vertex_bins = np.clip((vertex_t * nb).astype(np.int32), 0, nb - 1)
    vertex_count = np.bincount(vertex_bins, minlength=nb).astype(np.float64)
    texel_count = np.bincount(np.clip((tmap[body] * nb).astype(np.int32), 0, nb - 1), minlength=nb).astype(np.float64)
    weights = np.where(texel_count > 0, vertex_count / np.maximum(texel_count, 1.0), 0.0)
    if weights.max() > 0:
        weights /= weights.max()
    weights = np.where(vertex_count < 12, 0.0, weights)
    linear = to_linear(rgb)
    luminance = .2126 * linear[:, :, 0] + .7152 * linear[:, :, 1] + .0722 * linear[:, :, 2]
    bins = np.clip((tmap * nb).astype(np.int32), 0, nb - 1)
    indices = np.arange(nb)
    kernel = np.array([1, 2, 3, 2, 1], dtype=np.float64)
    kernel /= kernel.sum()

    def profile(values):
        sums = np.zeros(nb, dtype=np.float64)
        counts = np.zeros(nb, dtype=np.float64)
        np.add.at(sums, bins[body], values[body])
        np.add.at(counts, bins[body], 1.0)
        valid = (counts > 8) & (weights > 0)
        if valid.sum() < 4:
            return None
        filled = np.interp(indices, indices[valid], sums[valid] / counts[valid])
        return np.convolve(np.pad(filled, 2, mode="edge"), kernel, mode="valid")

    initial = profile(luminance)
    if initial is None:
        print("FLATLUM skipped: too few populated bins")
        return
    for _ in range(4):
        current = .2126 * linear[:, :, 0] + .7152 * linear[:, :, 1] + .0722 * linear[:, :, 2]
        fitted = profile(current)
        if fitted is None:
            break
        weight_sum = float(weights.sum())
        overall = float((fitted * weights).sum() / weight_sum) if weight_sum > 1e-9 else float(fitted.mean())
        ramp = np.maximum(np.interp(np.clip(tmap, 0, 1) * (nb - 1), indices, fitted), 1e-4)
        gain = np.clip(overall / ramp, .30, 3.5)
        gain = 1.0 + (gain - 1.0) * strength
        linear *= np.where(body, gain, 1.0)[:, :, None]
    final_luminance = .2126 * linear[:, :, 0] + .7152 * linear[:, :, 1] + .0722 * linear[:, :, 2]
    fitted = profile(final_luminance)
    weight_sum = float(weights.sum())
    current_mean = float((fitted * weights).sum() / weight_sum) if fitted is not None and weight_sum > 1e-9 else float(np.mean(final_luminance[body]))
    if current_mean > 1e-6:
        linear *= to_linear(np.array([float(target)], dtype=np.float32))[0] / current_mean
    output = to_srgb(linear)
    if desat > 0.0:
        lum = .2126 * linear[:, :, 0] + .7152 * linear[:, :, 1] + .0722 * linear[:, :, 2]
        neutral = to_srgb(np.repeat(lum[:, :, None], 3, axis=2))
        output = output * (1.0 - np.where(body[:, :, None], desat, 0.0)) + neutral * np.where(body[:, :, None], desat, 0.0)
    output = np.clip(output, 0.0, 1.0)
    pixels[:, :, :3] = output
    image.pixels[:] = pixels.reshape(-1).tolist()
    print("FLATLUM up_ax=%d texels=%d" % (best_axis, int(body.sum())))


def bake_mesh(high, low, name, texture_size, length, flatlum=False, flatlum_mean=.5, desat=0.0):
    """Bake low mesh textures from high and remove the temporary high mesh."""
    diffuse = bpy.data.images.new(name + "_diffuse", texture_size, texture_size)
    diffuse.generated_color = (.5, .5, .5, 1.0)
    normal = bpy.data.images.new(name + "_normal", texture_size, texture_size, float_buffer=False)
    normal.colorspace_settings.name = "Non-Color"
    normal.generated_color = (.5, .5, 1.0, 1.0)
    material = bpy.data.materials.new(name + "_mat")
    material.use_nodes = True
    tree = material.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    diffuse_node = tree.nodes.new("ShaderNodeTexImage")
    diffuse_node.image = diffuse
    normal_node = tree.nodes.new("ShaderNodeTexImage")
    normal_node.image = normal
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(diffuse_node.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = .45
    bsdf.inputs["Metallic"].default_value = 0.0
    low.data.materials.clear()
    low.data.materials.append(material)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 4
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 8
    scene.render.bake.cage_extrusion = length * .02
    scene.render.bake.max_ray_distance = length * .05
    scene.render.use_bake_multires = False
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low

    def bake(target, **kwargs):
        for node in tree.nodes:
            node.select = False
        target.select = True
        tree.nodes.active = target
        bpy.ops.object.bake(**kwargs)

    bake(diffuse_node, type="EMIT", use_selected_to_active=True)
    pixels = list(diffuse.pixels)
    lit = sum(1 for index in range(0, len(pixels), 4) if pixels[index] + pixels[index + 1] + pixels[index + 2] > .02)
    coverage = lit / (len(pixels) / 4)
    mean = sum(pixels[index] + pixels[index + 1] + pixels[index + 2] for index in range(0, len(pixels), 4)) / (len(pixels) / 4 * 3)
    print("BAKE diffuse coverage %.3f mean %.4f" % (coverage, mean))
    if coverage < .15:
        scene.render.bake.cage_extrusion = length * .08
        scene.render.bake.max_ray_distance = length * .15
        bake(diffuse_node, type="EMIT", use_selected_to_active=True)
        pixels = list(diffuse.pixels)
        lit = sum(1 for index in range(0, len(pixels), 4) if pixels[index] + pixels[index + 1] + pixels[index + 2] > .02)
        print("BAKE diffuse retry coverage %.3f" % (lit / (len(pixels) / 4)))
    if flatlum or desat > 0.0:
        try:
            flatten_dorsal_luminance(diffuse, low, strength=1.0 if flatlum else 0.0,
                                     target=flatlum_mean, desat=desat)
        except Exception as error:
            import traceback
            traceback.print_exc()
            print("FLATLUM FAILED, keeping raw bake:", error)
    bake(normal_node, type="NORMAL", use_selected_to_active=True, normal_space="TANGENT")
    diffuse.pack()
    normal.pack()
    bpy.data.objects.remove(high, do_unlink=True)
    return low, diffuse, normal
