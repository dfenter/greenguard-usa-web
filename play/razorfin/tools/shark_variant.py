"""Blender entry point for the Rev 17 authored-family pipeline.

Usage::

    blender -b --python tools/shark_variant.py -- \
      --recipe tools/recipes/thresher.json

The CLI deliberately imports L1/L2 modules only inside the operation runner.
That makes a pilot recipe runnable while those lanes are still in flight and
gives the final notes an unambiguous list of stubbed operations.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from pathlib import Path

try:
    import bpy
except ImportError:  # pragma: no cover
    bpy = None


ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))
RECIPE_KEYS = ("family", "base", "rows", "budget", "mouth", "head", "fins", "accessories", "paint", "variants", "turntable")
MODULES = (
    "sharklib.io", "sharklib.bake", "sharklib.rig", "sharklib.export", "sharklib.mouth",
    "sharklib.head", "sharklib.fins", "sharklib.accessories",
)


def _log(message):
    print("VARIANT " + message, flush=True)


def _validate_recipe(recipe, source):
    if not isinstance(recipe, dict):
        raise ValueError("%s must contain a JSON object" % source)
    actual = set(recipe)
    expected = set(RECIPE_KEYS)
    missing = [key for key in RECIPE_KEYS if key not in recipe]
    unknown = sorted(actual - expected)
    if missing or unknown:
        raise ValueError("%s top-level schema mismatch; missing=%s unknown=%s" % (source, missing, unknown))
    if not isinstance(recipe["family"], str) or not recipe["family"].strip():
        raise ValueError("family must be a non-empty string")
    if not isinstance(recipe["base"], str) or not recipe["base"].strip():
        raise ValueError("base must be a non-empty string")
    if not isinstance(recipe["rows"], list) or not recipe["rows"]:
        raise ValueError("rows must be a non-empty array")
    if not isinstance(recipe["budget"], dict):
        raise ValueError("budget must be an object")
    for key in ("mouth", "head", "fins", "paint", "turntable"):
        if not isinstance(recipe[key], dict):
            raise ValueError("%s must be an object" % key)
    if not isinstance(recipe["accessories"], list):
        raise ValueError("accessories must be an array")
    if not isinstance(recipe["variants"], list):
        raise ValueError("variants must be an array")
    for index, row in enumerate(recipe["rows"]):
        if isinstance(row, str):
            if not row:
                raise ValueError("rows[%d] cannot be empty" % index)
        elif not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]:
            raise ValueError("rows[%d] must be a string or an object with id" % index)
    return recipe


def _read_recipe(path):
    path = Path(path)
    if not path.is_absolute():
        path = ROOT / path
    with path.open("r", encoding="utf-8") as handle:
        recipe = json.load(handle)
    return _validate_recipe(recipe, str(path)), path


def _optional_modules():
    modules = {}
    for name in MODULES:
        try:
            modules[name.rsplit(".", 1)[-1]] = importlib.import_module(name)
            _log("loaded %s" % name)
        except Exception as exc:
            modules[name.rsplit(".", 1)[-1]] = None
            _log("STUB %s unavailable (%s)" % (name, exc.__class__.__name__))
    return modules


def _operation(module, names, ctx, label):
    """Call the first compatible upstream op, or log a no-op stub."""
    if module is None:
        _log("STUB %s: module missing" % label)
        return None
    for name in names:
        operation = getattr(module, name, None)
        if not callable(operation):
            continue
        for arguments in ((ctx,), (ctx["low"], ctx["recipe"]), (ctx["low"],)):
            try:
                result = operation(*arguments)
                _log("%s via %s.%s" % (label, module.__name__, name))
                if result is not None:
                    return result
                return None
            except TypeError:
                continue
            except Exception as exc:
                _log("WARN %s.%s failed: %s" % (module.__name__, name, exc))
                continue
    _log("STUB %s: no compatible operation" % label)
    return None


def _mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def _load_base(path, orient=False, length=1.0):
    """Import a base mesh.

    ``orient=True`` reproduces the standalone bake path
    (``shark_bake.py`` -> ``io.prepare_source``): flatten world transforms,
    reject junk shells, then ``io.orient`` the result into the frame that
    every downstream op assumes -- +Y nose-to-tail, +Z dorsal, body length
    normalised to *length*.

    This is NOT optional.  ``tigershark.glb`` and ``thresher.glb`` are
    authored nose at -Y; skipping ``io.orient`` leaves ``io.measure`` (which
    takes ``nose = max(y)``) pointing at the TAIL, and ``mouth.cut_mouth``
    then bisects its wedge into the tail instead of the snout.  Verified
    directly: ``io.orient`` prints "flipped nose to +Y" on tigershark and
    thresher and does not on greatwhite_cy or whaler.
    """
    path = Path(path)
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        raise FileNotFoundError(path)
    if orient:
        from sharklib import io as _io
        high, _ = _io.prepare_source(str(path), length=float(length), flip=False)
        high.name = "low"
        for obj in list(bpy.context.scene.objects):
            if obj.type != "MESH":
                bpy.data.objects.remove(obj, do_unlink=True)
        _log("oriented base dims=%s" % (tuple(round(float(v), 4) for v in high.dimensions),))
        return high
    bpy.ops.wm.read_factory_settings(use_empty=True)
    suffix = path.suffix.lower()
    if suffix in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    else:
        raise ValueError("unsupported base format: %s" % suffix)
    for obj in _mesh_objects():
        if obj.animation_data:
            obj.animation_data_clear()
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        obj.parent = None
    meshes = _mesh_objects()
    if not meshes:
        raise RuntimeError("base contains no mesh: %s" % path)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    low = bpy.context.view_layer.objects.active
    low.name = "low"
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    return low


def _duplicate_hi(low):
    hi = low.copy()
    hi.data = low.data.copy()
    hi.name = "hi"
    bpy.context.collection.objects.link(hi)
    hi.hide_render = True
    hi.hide_viewport = True
    hi["rf_hi_duplicate"] = True
    return hi


def _signature(obj):
    return (len(obj.data.vertices), len(obj.data.edges), len(obj.data.polygons))


def _triangles(obj):
    if not obj or obj.type != "MESH":
        return 0
    return int(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons))


def _long_span(obj):
    if not obj or obj.type != "MESH" or not obj.data.vertices:
        return 0.0
    mins = [min(float(vertex.co[axis]) for vertex in obj.data.vertices) for axis in range(3)]
    maxs = [max(float(vertex.co[axis]) for vertex in obj.data.vertices) for axis in range(3)]
    return max(maxs[axis] - mins[axis] for axis in range(3))


def _mouth_triangle_reserve(payload):
    if not isinstance(payload, dict):
        return 0
    names = payload.get("objects", {})
    return sum(_triangles(bpy.data.objects.get(name)) for name in names
               if bpy.data.objects.get(name))


def _normalise_base(recipe):
    base = recipe["base"]
    if base.endswith((".glb", ".gltf", ".fbx", ".obj")):
        return Path(base)
    return Path("assets/models") / (base + ".glb")


MOUTH_TRI_RESERVE = 1100


def _accessory_tri_budget(recipe):
    tris = int((recipe.get("budget") or {}).get("tris", 9000))
    return max(12, int((tris - MOUTH_TRI_RESERVE) / 1.08))


def _cut_mouth(modules, recipe, ctx):
    """Run L1's mouth op on the CURRENT body and record its payload."""
    low = ctx["low"]
    if modules["mouth"] is None or not callable(getattr(modules["mouth"], "cut_mouth", None)):
        _log("STUB sharklib.mouth.cut_mouth: module missing")
        return None
    mouth_cfg = dict(recipe["mouth"])
    teeth = mouth_cfg.pop("teeth", "strip")
    if teeth == "upper_lower":
        teeth = "strip"
    gape = mouth_cfg.pop("gape_deg", mouth_cfg.pop("gape_degrees", 25.0))
    try:
        payload = modules["mouth"].cut_mouth(low, teeth=teeth, **{
            "gape_deg": float(gape),
            **{key: mouth_cfg[key] for key in ("cavity_depth", "lip_band") if key in mouth_cfg}
        })
    except Exception as exc:
        _log("WARN sharklib.mouth.cut_mouth failed: %s" % exc)
        return None
    ctx["lower_jaw_weights"] = payload
    ctx["extras"] = list((payload or {}).get("objects", {}).keys())
    ctx["mouth_triangles"] = _mouth_triangle_reserve(payload)
    _log("mouth triangle reserve=%d base_lip_entries=%d"
         % (ctx["mouth_triangles"], len((payload or {}).get("base") or {})))
    _log("sharklib.mouth.cut_mouth")
    return payload


def _run_recipe(recipe, recipe_path, turntable_only=False):
    modules = _optional_modules()
    from sharklib import finish, paint

    family = recipe["family"]
    output_glb = ROOT / "assets" / "models" / "fam" / (family + ".glb")
    if turntable_only:
        if not output_glb.exists():
            raise FileNotFoundError("turntable-only input missing: %s" % output_glb)
        low = _load_base(output_glb)
        rig = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
        if rig is None:
            _log("STUB turntable-only rig: no armature in GLB")
            rig, _ = finish.rig_family(low)
        rendered = finish._render_turntable(low, rig, family, ROOT, recipe["turntable"])
        _log("turntable-only %s" % json.dumps(rendered, sort_keys=True))
        return rendered

    low = _load_base(ROOT / _normalise_base(recipe), orient=True)
    hi = _duplicate_hi(low)
    ctx = {"recipe": recipe, "recipe_path": str(recipe_path), "root": str(ROOT), "family": family, "low": low, "hi": hi,
           "budget": recipe.get("budget") or {}}
    if os.environ.get("RAZORFIN_SKIP_UPSTREAM") == "1":
        _log("SAFE MODE: skipping landed L1/L2 geometry ops")
        ctx["topology_changed"] = False
        paint_width = int(recipe["paint"].get("resolution", recipe["turntable"].get("texture_resolution", 512)))
        ctx["texture_size"] = paint_width
        ctx["paint_result"] = paint.paint_family(low, recipe, root=ROOT, width=paint_width)
        ctx["turntable"] = recipe["turntable"]
        ctx["rig_module"] = modules["rig"]
        ctx["lower_jaw_weights"] = recipe["mouth"].get("lower_jaw_weights")
        summary = finish.finish_family(ctx)
        _log("DONE SAFE %s" % json.dumps(summary, sort_keys=True))
        return summary
    # The landed L1/L2 APIs are called with their concrete contracts. The
    # generic dispatcher remains for older lane drops and logs a no-op when a
    # module is genuinely absent.
    measurement = None
    if modules["io"] is not None and callable(getattr(modules["io"], "measure", None)):
        try:
            measurement = modules["io"].measure(low, create_groups=True)
            ctx["measurement"] = measurement
            _log("sharklib.io.measure")
        except Exception as exc:
            _log("WARN sharklib.io.measure failed: %s" % exc)
    else:
        _log("STUB sharklib.io.measure: module missing")

    head_cfg = recipe["head"]
    # An EMPTY head block means "leave the head alone".  head.lattice defaults
    # a missing preset to "blunt", so calling it unconditionally silently
    # deformed every family that authored no head mode.
    if not head_cfg.get("mode") and not head_cfg.get("preset"):
        _log("head: no mode requested, skipping lattice")
    elif modules["head"] is not None and callable(getattr(modules["head"], "lattice", None)):
        try:
            head_params = dict(head_cfg)
            head_params.setdefault("preset", head_params.get("mode", "blunt"))
            modules["head"].lattice(low, head_params)
            _log("sharklib.head.lattice")
        except Exception as exc:
            _log("WARN sharklib.head.lattice failed: %s" % exc)
    else:
        _log("STUB sharklib.head.lattice: module missing")

    fin_cfg = recipe["fins"]
    if modules["fins"] is not None:
        if fin_cfg.get("whip_tip") and callable(getattr(modules["fins"], "extrude_tip", None)):
            params = dict(fin_cfg["whip_tip"])
            params.setdefault("group", "caudal_upper")
            fraction = float(params.get("fraction", 0.18))
            scale = float(params.get("scale", 1.0))
            requested_fraction = max(0.0, fraction * scale)
            # Recipe schema: length is fraction * scale, where the result is
            # a fraction of measured body L. Keep the authored whip <= .6L
            # and reserve the final model's <=1.6L silhouette contract.
            current_length = _long_span(low)
            max_model_fraction = max(0.0, (1.60 * current_length - current_length) /
                                    max(current_length, 1.0e-8))
            length_fraction = min(requested_fraction, 0.60, max_model_fraction)
            params["length"] = length_fraction
            params.pop("fraction", None)
            params.pop("scale", None)
            _log("whip length fraction=%.4f requested=%.4f max=%.4f" %
                 (length_fraction, requested_fraction, min(0.60, max_model_fraction)))
            try:
                modules["fins"].extrude_tip(low, params)
                if _long_span(low) > current_length * 1.60 + 1.0e-5:
                    _log("WARN whip bbox span %.4f exceeds 1.6L %.4f" %
                         (_long_span(low), current_length * 1.60))
                _log("sharklib.fins.extrude_tip")
            except Exception as exc:
                _log("WARN sharklib.fins.extrude_tip failed: %s" % exc)
        if fin_cfg.get("dorsal", {}).get("mode") == "sail" and callable(getattr(modules["fins"], "sail", None)):
            try:
                modules["fins"].sail(low, fin_cfg["dorsal"])
                _log("sharklib.fins.sail")
            except Exception as exc:
                _log("WARN sharklib.fins.sail failed: %s" % exc)
    else:
        _log("STUB sharklib.fins: module missing")

    if modules["accessories"] is not None and recipe["accessories"] and callable(getattr(modules["accessories"], "apply_accessories", None)):
        try:
            result = modules["accessories"].apply_accessories(low, {
                "kits": recipe["accessories"],
                # Reserve room for the mouth before L2's decimator so the one
                # joined export stays inside the family triangle budget.  The
                # mouth is now cut AFTER accessories, so its exact triangle
                # count is not known here; MOUTH_TRI_RESERVE is the measured
                # worst case (cavity + lip + two 350-vert tooth strips ~ 900
                # tris across the four pilot bases, rounded up).
                "tri_budget": _accessory_tri_budget(recipe),
            })
            _log("accessory tri_budget=%d mouth_reserve=%d" %
                 (_accessory_tri_budget(recipe), MOUTH_TRI_RESERVE))
            if isinstance(result, tuple) and result:
                low = result[0]
                ctx["low"] = low
                if len(result) > 1 and result[1] is not hi:
                    if hi.name in bpy.data.objects:
                        bpy.data.objects.remove(hi, do_unlink=True)
                    hi = result[1]
                    ctx["hi"] = hi
            _log("sharklib.accessories.apply_accessories")
        except Exception as exc:
            _log("WARN sharklib.accessories.apply_accessories failed: %s" % exc)
    elif modules["accessories"] is None:
        _log("STUB sharklib.accessories: module missing")
    elif not recipe["accessories"]:
        _log("sharklib.accessories: no accessories requested")
    # MOUTH IS CUT LAST.  sharklib.accessories.apply_accessories runs a voxel
    # remesh at L/220 over the whole body after a boolean fuse, and
    # head.lattice + fins.extrude_tip both move body vertices.  Cutting the
    # mouth before any of those destroyed the cut and the authored zz_* pieces
    # -- that is the "head shattered into exploded polygons" symptom on
    # leviathanrex and the misplaced wedge on aresrender.  Nothing after this
    # point edits body topology except the export-time budget decimate, which
    # runs on the joined mesh.
    _cut_mouth(modules, recipe, ctx)

    ctx["topology_changed"] = _signature(low) != _signature(hi)
    if ctx["topology_changed"]:
        # Paint maps are UV-rasterised on the post-op mesh. Finish repeats the
        # check as a guard, but this is the first legal point to re-UV before
        # the world-position map is baked.
        finish.ensure_uv(low, changed=True)

    paint_width = int(recipe["paint"].get("resolution", recipe["turntable"].get("texture_resolution", 512)))
    ctx["texture_size"] = paint_width
    ctx["paint_result"] = paint.paint_family(low, recipe, root=ROOT, width=paint_width)
    ctx["turntable"] = recipe["turntable"]
    ctx["rig_module"] = modules["rig"]
    ctx.setdefault("lower_jaw_weights", recipe["mouth"].get("lower_jaw_weights"))
    summary = finish.finish_family(ctx)
    # High is never exported and can be removed after the normal rebake.
    if hi.name in bpy.data.objects:
        bpy.data.objects.remove(hi, do_unlink=True)
    _log("DONE %s" % json.dumps(summary, sort_keys=True))
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build one Razorfin authored shark family")
    parser.add_argument("--recipe", required=True, help="path to a Rev 17 family recipe JSON")
    parser.add_argument("--turntable-only", action="store_true")
    args = parser.parse_args(argv)
    recipe, path = _read_recipe(args.recipe)
    _log("recipe=%s family=%s" % (path, recipe["family"]))
    return _run_recipe(recipe, path, turntable_only=args.turntable_only)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(argv)
