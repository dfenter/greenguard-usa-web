#!/usr/bin/env python3
"""Stack the five pilot turntables into one review contact sheet.

Rev 18 lane 7: the sheet was previously produced ad hoc, so it could not be
regenerated deterministically after a rebake. This script is the recipe.

  python3 hse/make_contact_sheet.py [out.png]

Each family contributes its assets/review/<fam>_turntable.png (itself a 3x2
grid of 000/090/180/270/mouth_closed/mouth_open), labelled with the family
name. The sheet carries a NOT APPROVED banner: nothing in this pilot has been
signed off, and a sheet that does not say so invites being mistaken for one.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

FAMILIES = ["aresrender", "artemisstrike", "leviathanrex", "snapjaw", "thresher"]
HERE = Path(__file__).resolve().parent
REVIEW = HERE.parent / "assets" / "review"
BAND = 34          # label strip above each family's row
HEADER = 46        # top banner
BG = (28, 30, 34)
FG = (232, 234, 238)
WARN = (236, 160, 90)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else REVIEW / "rev18_pilot_contact.png"
    tiles = []
    for family in FAMILIES:
        path = REVIEW / (family + "_turntable.png")
        if not path.exists():
            raise SystemExit("missing turntable: %s" % path)
        tiles.append((family, Image.open(path).convert("RGB")))

    width = max(img.width for _, img in tiles)
    height = HEADER + sum(img.height + BAND for _, img in tiles)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)

    draw.text((14, 14), "Razorfin Rev 18 pilot contact sheet", fill=FG)
    draw.text((14, 28), "NOT APPROVED", fill=WARN)

    y = HEADER
    for family, img in tiles:
        draw.text((14, y + 10), family, fill=FG)
        y += BAND
        sheet.paste(img, (0, y))
        y += img.height

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print("contact sheet: %s (%dx%d)" % (out, sheet.width, sheet.height))


if __name__ == "__main__":
    main()
