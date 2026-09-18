#!/usr/bin/env python3
"""
Generates 9 new ship hull frames (3 classes x 3 marks) and adds them into
the EXISTING atlas.png / atlas.json without disturbing any existing frame.

Run with zero args from play/hordemeridian2/:
    python3 tools/build_hulls.py

Additive only: loads the current atlas, finds free 64x64 slots (unclaimed by
any existing frame rect AND fully transparent in the source pixels), draws
the new sprites into those slots, and writes both files back. If 9 slots do
not fit in the existing 1024x1024 canvas, the canvas height is expanded to
1024x1536 (original pixels copied unchanged to the top, so every existing
frame's absolute x/y stays valid).

Idempotent: if a frame name already exists in atlas.json, its existing slot
is reused (redrawn at the same coordinates) instead of allocating a new one.
"""

import json
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.dirname(HERE)
ATLAS_PNG = os.path.join(GAME_DIR, "assets", "atlas.png")
ATLAS_JSON = os.path.join(GAME_DIR, "assets", "atlas.json")

SLOT = 64
CANVAS_W = 1024
CANVAS_H_BASE = 1024
CANVAS_H_EXPANDED = 1536

FRAME_NAMES = [
    "hull_warden_mk1", "hull_warden_mk2", "hull_warden_mk3",
    "hull_recon_mk1", "hull_recon_mk2", "hull_recon_mk3",
    "hull_vector_mk1", "hull_vector_mk2", "hull_vector_mk3",
]


def find_free_slots(img, claimed_rects, count, grid_step=8):
    """Scan a grid of candidate 64x64 top-left points, skip any that overlap
    a claimed rect or contain non-transparent pixels, return `count` slots."""
    w, h = img.size
    px = img.load()
    slots = []

    def overlaps_claimed(x, y):
        for (cx, cy, cw, ch) in claimed_rects:
            if x < cx + cw and x + SLOT > cx and y < cy + ch and y + SLOT > cy:
                return True
        return False

    def overlaps_chosen(x, y):
        for (sx, sy) in slots:
            if x < sx + SLOT and x + SLOT > sx and y < sy + SLOT and y + SLOT > sy:
                return True
        return False

    def fully_transparent(x, y):
        # sample a coarse grid within the slot for speed, then confirm
        for yy in range(y, y + SLOT, 4):
            for xx in range(x, x + SLOT, 4):
                if px[xx, yy][3] != 0:
                    return False
        # full confirm
        for yy in range(y, y + SLOT):
            for xx in range(x, x + SLOT):
                if px[xx, yy][3] != 0:
                    return False
        return True

    for y in range(0, h - SLOT + 1, grid_step):
        for x in range(0, w - SLOT + 1, grid_step):
            if overlaps_claimed(x, y) or overlaps_chosen(x, y):
                continue
            if not fully_transparent(x, y):
                continue
            slots.append((x, y))
            if len(slots) >= count:
                return slots
    return slots


def draw_warden(draw, ox, oy, mark):
    """Broad, heavy, armoured, wide shoulders. Points right (+x)."""
    g = ox, oy
    light = (235, 235, 240, 255)
    mid = (185, 188, 195, 255)
    dark = (110, 113, 120, 255)
    outline = (60, 62, 68, 255)

    # wide wings/shoulders
    draw.polygon([
        (ox+10, oy+14), (ox+30, oy+8), (ox+34, oy+24), (ox+14, oy+30),
    ], fill=mid, outline=outline)
    draw.polygon([
        (ox+10, oy+50), (ox+30, oy+56), (ox+34, oy+40), (ox+14, oy+34),
    ], fill=mid, outline=outline)

    # main hull - broad hexagonal body
    body = [
        (ox+16, oy+32), (ox+24, oy+18), (ox+44, oy+16),
        (ox+56, oy+26), (ox+56, oy+38), (ox+44, oy+48),
        (ox+24, oy+46),
    ]
    draw.polygon(body, fill=light, outline=outline)

    # cockpit facet
    draw.polygon([
        (ox+30, oy+26), (ox+42, oy+24), (ox+46, oy+32), (ox+38, oy+38), (ox+28, oy+36),
    ], fill=dark, outline=outline)

    # nose
    draw.polygon([(ox+56, oy+30), (ox+62, oy+32), (ox+56, oy+34)], fill=mid, outline=outline)

    # engine glows
    draw.ellipse([ox+12, oy+28, ox+18, oy+36], fill=(220, 220, 225, 255), outline=outline)

    if mark >= 2:
        # extra armour plate on shoulders
        draw.polygon([(ox+8, oy+18), (ox+18, oy+14), (ox+20, oy+22), (ox+10, oy+26)], fill=dark, outline=outline)
        draw.polygon([(ox+8, oy+46), (ox+18, oy+50), (ox+20, oy+42), (ox+10, oy+38)], fill=dark, outline=outline)
        draw.line([ox+24, oy+20, ox+44, oy+18], fill=outline, width=1)
    if mark >= 3:
        # second engine nacelle pair + heavier prow
        draw.rectangle([ox+6, oy+26, ox+13, oy+30], fill=mid, outline=outline)
        draw.rectangle([ox+6, oy+34, ox+13, oy+38], fill=mid, outline=outline)
        draw.polygon([(ox+56, oy+26), (ox+62, oy+28), (ox+60, oy+32), (ox+62, oy+36), (ox+56, oy+38)],
                     fill=light, outline=outline)
        draw.ellipse([ox+10, oy+29, ox+15, oy+35], fill=(245, 245, 248, 255), outline=outline)


def draw_recon(draw, ox, oy, mark):
    """Slim, swept, long nose, small profile. Points right."""
    light = (235, 235, 240, 255)
    mid = (185, 188, 195, 255)
    dark = (110, 113, 120, 255)
    outline = (60, 62, 68, 255)

    # slim swept wings
    draw.polygon([(ox+22, oy+24), (ox+8, oy+16), (ox+26, oy+28)], fill=mid, outline=outline)
    draw.polygon([(ox+22, oy+40), (ox+8, oy+48), (ox+26, oy+36)], fill=mid, outline=outline)

    # narrow elongated body with long nose
    body = [
        (ox+18, oy+30), (ox+22, oy+26), (ox+50, oy+29), (ox+60, oy+32),
        (ox+50, oy+35), (ox+22, oy+38),
    ]
    draw.polygon(body, fill=light, outline=outline)

    # cockpit stripe
    draw.polygon([(ox+26, oy+29), (ox+38, oy+28), (ox+40, oy+32), (ox+38, oy+36), (ox+26, oy+35)],
                 fill=dark, outline=outline)

    # tail fin
    draw.polygon([(ox+18, oy+30), (ox+12, oy+22), (ox+20, oy+30)], fill=mid, outline=outline)
    draw.polygon([(ox+18, oy+38), (ox+12, oy+46), (ox+20, oy+38)], fill=mid, outline=outline)

    draw.ellipse([ox+14, oy+30, ox+19, oy+34], fill=(220, 220, 225, 255), outline=outline)

    if mark >= 2:
        draw.polygon([(ox+30, oy+27), (ox+34, oy+24), (ox+36, oy+27)], fill=dark, outline=outline)
        draw.line([ox+22, oy+30, ox+50, oy+30], fill=outline, width=1)
    if mark >= 3:
        # longer nose spike + winglets
        draw.polygon([(ox+58, oy+31), (ox+63, oy+32), (ox+58, oy+33)], fill=light, outline=outline)
        draw.polygon([(ox+24, oy+22), (ox+30, oy+18), (ox+28, oy+26)], fill=dark, outline=outline)
        draw.polygon([(ox+24, oy+42), (ox+30, oy+46), (ox+28, oy+38)], fill=dark, outline=outline)


def draw_vector(draw, ox, oy, mark):
    """Angular, aggressive, forward-raked wings, spindly. Points right."""
    light = (235, 235, 240, 255)
    mid = (185, 188, 195, 255)
    dark = (110, 113, 120, 255)
    outline = (60, 62, 68, 255)

    # forward-raked angular wings (swept toward nose)
    draw.polygon([(ox+14, oy+18), (ox+36, oy+10), (ox+38, oy+26), (ox+22, oy+28)], fill=mid, outline=outline)
    draw.polygon([(ox+14, oy+46), (ox+36, oy+54), (ox+38, oy+38), (ox+22, oy+36)], fill=mid, outline=outline)

    # spindly angular fuselage
    body = [
        (ox+20, oy+32), (ox+28, oy+24), (ox+50, oy+27), (ox+58, oy+32),
        (ox+50, oy+37), (ox+28, oy+40),
    ]
    draw.polygon(body, fill=light, outline=outline)

    # angular cockpit
    draw.polygon([(ox+30, oy+28), (ox+40, oy+27), (ox+42, oy+32), (ox+36, oy+36)], fill=dark, outline=outline)

    # spike tail
    draw.polygon([(ox+20, oy+32), (ox+10, oy+30), (ox+20, oy+34)], fill=dark, outline=outline)

    draw.ellipse([ox+15, oy+29, ox+20, oy+35], fill=(220, 220, 225, 255), outline=outline)

    if mark >= 2:
        draw.polygon([(ox+12, oy+16), (ox+18, oy+12), (ox+18, oy+20)], fill=dark, outline=outline)
        draw.polygon([(ox+12, oy+48), (ox+18, oy+52), (ox+18, oy+44)], fill=dark, outline=outline)
    if mark >= 3:
        # extra wingtip blades + longer spike
        draw.polygon([(ox+34, oy+8), (ox+40, oy+6), (ox+38, oy+13)], fill=light, outline=outline)
        draw.polygon([(ox+34, oy+56), (ox+40, oy+58), (ox+38, oy+51)], fill=light, outline=outline)
        draw.polygon([(ox+56, oy+30), (ox+62, oy+32), (ox+56, oy+34)], fill=mid, outline=outline)


DRAW_FN = {
    "warden": draw_warden,
    "recon": draw_recon,
    "vector": draw_vector,
}


def draw_hull(img, x, y, cls, mark):
    draw = ImageDraw.Draw(img)
    DRAW_FN[cls](draw, x, y, mark)


def main():
    img = Image.open(ATLAS_PNG).convert("RGBA")
    with open(ATLAS_JSON) as f:
        data = json.load(f)

    frames = data["frames"]
    original_names = set(frames.keys())

    reused = []
    to_allocate = []
    for name in FRAME_NAMES:
        if name in frames:
            reused.append(name)
        else:
            to_allocate.append(name)

    # Determine claimed rects from all currently-known frames (before we add new ones)
    claimed = [(v["frame"]["x"], v["frame"]["y"], v["frame"]["w"], v["frame"]["h"])
               for v in frames.values()]

    canvas_expanded = img.height > CANVAS_H_BASE

    new_slots = []
    if to_allocate:
        slots = find_free_slots(img, claimed, len(to_allocate))
        if len(slots) < len(to_allocate):
            # expand canvas
            if img.height < CANVAS_H_EXPANDED:
                expanded = Image.new("RGBA", (CANVAS_W, CANVAS_H_EXPANDED), (0, 0, 0, 0))
                expanded.paste(img, (0, 0))
                img = expanded
                canvas_expanded = True
            slots = find_free_slots(img, claimed, len(to_allocate))
        new_slots = slots

    # Draw reused frames (redraw at existing coords, deterministic -> idempotent)
    for name in reused:
        f = frames[name]["frame"]
        parts = name.split("_")
        cls = parts[1]
        mark = int(parts[2][2])
        # clear slot to transparent first for determinism, then redraw
        clear = Image.new("RGBA", (f["w"], f["h"]), (0, 0, 0, 0))
        img.paste(clear, (f["x"], f["y"]))
        draw_hull(img, f["x"], f["y"], cls, mark)

    # Draw newly allocated frames
    for name, (x, y) in zip(to_allocate, new_slots):
        parts = name.split("_")
        cls = parts[1]
        mark = int(parts[2][2])
        draw_hull(img, x, y, cls, mark)
        frames[name] = {
            "frame": {"x": x, "y": y, "w": SLOT, "h": SLOT},
            "sourceSize": {"w": SLOT, "h": SLOT},
            "spriteSourceSize": {"x": 0, "y": 0, "w": SLOT, "h": SLOT},
            "rotated": False,
            "trimmed": False,
        }

    img.save(ATLAS_PNG)
    with open(ATLAS_JSON, "w") as f:
        json.dump(data, f, indent=2, sort_keys=False)
        f.write("\n")

    print(f"Canvas size: {img.width}x{img.height} (expanded: {canvas_expanded})")
    print(f"Frames reused (existing slot redrawn): {reused}")
    print(f"Frames newly allocated: {list(zip(to_allocate, new_slots))}")
    print(f"Total frames in atlas.json: {len(frames)}")
    print(f"Original frame count preserved: {len(original_names)}")


if __name__ == "__main__":
    main()
