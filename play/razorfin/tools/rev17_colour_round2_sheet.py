#!/usr/bin/env python3
"""Build the rev17 colour round-2 comparison sheet.

Three rows x five species columns: original pilot, round 1 result, round 2
result. Card-scale crops on top (thumbnail of the full 6-view family panel,
scaled down to card size), full-size renders below.

Species/column order: aresrender, snapjaw, artemisstrike, sharkjira/
leviathanrex, thresher. (sharkjira and leviathanrex share one paint recipe
and base render -- leviathanrex is the rendered/baked family; the column is
labelled "sharkjira / leviathanrex".)

Source geometry was measured directly from the two existing review PNGs
(pixel-exact panel/column boundaries via background-color edge detection,
see git history of this file for the probe commands) rather than assumed,
since the two sheets have different sizes and paddings.

Usage: python3 rev17_colour_round2_sheet.py
Reads from play/razorfin/assets/review/, writes rev17_colour_round2.png there.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REVIEW = os.path.normpath(os.path.join(HERE, "..", "assets", "review"))

SPECIES = ["aresrender", "snapjaw", "artemisstrike", "leviathanrex", "thresher"]
LABELS = {
    "aresrender": "aresrender",
    "snapjaw": "snapjaw",
    "artemisstrike": "artemisstrike",
    "leviathanrex": "sharkjira / leviathanrex",
    "thresher": "thresher",
}

# --- rev17_pilot_contact.png (1284x734): 3-col x 2-row family panels ---
PILOT_COLS = [(6, 426), (432, 852), (858, 1278)]
PILOT_ROWS = [(70, 350), (404, 684)]
# grid position (row, col) per species in the pilot sheet
PILOT_POS = {
    "aresrender": (0, 0),
    "artemisstrike": (0, 1),
    "leviathanrex": (0, 2),
    "snapjaw": (1, 0),
    "thresher": (1, 1),
}

# --- rev17_colour_before_after.png (2632x2108): 3-col x 2-row family panels,
#     "after" state is the right half of each panel's turntable pair, so we
#     take the whole panel (it already shows corrected colour only, round 1
#     baked the after state into these renders) ---
R1_PANEL_COLS = [(10, 874), (885, 1748), (1758, 2622)]
R1_PANEL_ROWS = [(144, 737), (828, 1422)]
R1_PANEL_POS = {
    "aresrender": (0, 0),
    "artemisstrike": (0, 1),
    "leviathanrex": (0, 2),
    "snapjaw": (1, 0),
    "thresher": (1, 1),
}

# bottom full-size strip: 5 equal columns, y in [1556, 2068]
R1_STRIP_COLS = [(12, 524), (536, 1048), (1060, 1572), (1584, 2096), (2108, 2620)]
R1_STRIP_ROW = (1556, 2068)
R1_STRIP_ORDER = ["aresrender", "snapjaw", "artemisstrike", "leviathanrex", "thresher"]


def pilot_panel(species):
    im = Image.open(os.path.join(REVIEW, "rev17_pilot_contact.png")).convert("RGB")
    r, c = PILOT_POS[species]
    x0, x1 = PILOT_COLS[c]
    y0, y1 = PILOT_ROWS[r]
    return im.crop((x0, y0, x1, y1))


def r1_panel(species):
    im = Image.open(os.path.join(REVIEW, "rev17_colour_before_after.png")).convert("RGB")
    r, c = R1_PANEL_POS[species]
    x0, x1 = R1_PANEL_COLS[c]
    y0, y1 = R1_PANEL_ROWS[r]
    return im.crop((x0, y0, x1, y1))


def r1_full(species):
    im = Image.open(os.path.join(REVIEW, "rev17_colour_before_after.png")).convert("RGB")
    idx = R1_STRIP_ORDER.index(species)
    x0, x1 = R1_STRIP_COLS[idx]
    y0, y1 = R1_STRIP_ROW
    return im.crop((x0, y0, x1, y1))


def round2_full(species):
    return Image.open(os.path.join(REVIEW, f"{species}_turntable.png")).convert("RGB")


def make_font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size)
    except Exception:
        return ImageFont.load_default()


def main():
    card_w, card_h = 260, 200
    full_w, full_h = 420, 300
    pad = 12
    label_col_w = 180
    row_label_h = 26
    title_h = 50

    n_cols = len(SPECIES)
    col_w = max(card_w, full_w)
    card_row_h = card_h + row_label_h
    full_row_h = full_h + row_label_h

    total_w = label_col_w + n_cols * (col_w + pad) + pad
    total_h = title_h + 3 * (card_row_h + pad) + 30 + 3 * (full_row_h + pad) + pad

    sheet = Image.new("RGB", (total_w, total_h), (18, 18, 22))
    draw = ImageDraw.Draw(sheet)
    font_title = make_font(22)
    font_label = make_font(15)
    font_row = make_font(14)

    draw.text((pad, 12), "rev17 species colour round 2 -- residual B (species colour)", fill=(230, 230, 230), font=font_title)

    def paste_fit(img, box_wh, pos):
        bw, bh = box_wh
        w, h = img.size
        scale = min(bw / w, bh / h)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        resized = img.resize((nw, nh), Image.LANCZOS)
        ox = pos[0] + (bw - nw) // 2
        oy = pos[1] + (bh - nh) // 2
        sheet.paste(resized, (ox, oy))
        return ox, oy, nw, nh

    y = title_h
    card_rows = [
        ("original pilot", pilot_panel),
        ("round 1", r1_panel),
        ("round 2 (new)", round2_full),
    ]
    for row_label, fn in card_rows:
        draw.text((pad, y + card_h // 2 - 8), row_label, fill=(210, 210, 210), font=font_label)
        x = label_col_w
        for sp in SPECIES:
            crop = fn(sp)
            paste_fit(crop, (card_w, card_h), (x, y))
            x += col_w + pad
        y += card_row_h + pad

    # species column headers under the card rows
    x = label_col_w
    for sp in SPECIES:
        draw.text((x, y), LABELS[sp], fill=(190, 190, 190), font=font_row)
        x += col_w + pad
    y += 30

    draw.line([(pad, y), (total_w - pad, y)], fill=(80, 80, 80), width=1)
    y += pad

    full_rows = [
        ("original pilot (full)", pilot_panel),
        ("round 1 (full)", r1_full),
        ("round 2 (full)", round2_full),
    ]
    for row_label, fn in full_rows:
        draw.text((pad, y + full_h // 2 - 8), row_label, fill=(210, 210, 210), font=font_label)
        x = label_col_w
        for sp in SPECIES:
            crop = fn(sp)
            paste_fit(crop, (full_w, full_h), (x, y))
            x += col_w + pad
        y += full_row_h + pad

    out_path = os.path.join(REVIEW, "rev17_colour_round2.png")
    sheet.save(out_path)
    print("wrote", out_path, sheet.size)


if __name__ == "__main__":
    main()
