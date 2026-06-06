#!/bin/bash
# Run this from Terminal (not VS Code) — Terminal needs Full Disk Access.
# System Preferences > Security & Privacy > Privacy > Full Disk Access > add Terminal
#
# Exports Apple Photos face tags to faces.json for use in the gallery.
# Output: photos/lib/faces.json  { "filename.jpg": ["Alice", "Bob"], ... }

DB="/Users/lucille/Pictures/Photos Library.photoslibrary/database/Photos.sqlite"
OUT="$(dirname "$0")/../lib/faces.json"

if [ ! -f "$DB" ]; then
  echo "Photos library not found at $DB"
  exit 1
fi

echo "Reading $DB ..."

python3 - "$DB" "$OUT" << 'PYEOF'
import sqlite3, json, sys

db_path, out_path = sys.argv[1], sys.argv[2]

conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
cur = conn.cursor()

# Map asset pk → original filename
cur.execute("""
  SELECT ZASSET.Z_PK, ZADDITIONALASSETATTRIBUTES.ZORIGINALFILENAME
  FROM ZASSET
  JOIN ZADDITIONALASSETATTRIBUTES ON ZADDITIONALASSETATTRIBUTES.ZASSET = ZASSET.Z_PK
  WHERE ZASSET.ZTRASHEDSTATE = 0
""")
asset_names = {row[0]: row[1] for row in cur.fetchall()}

# Map person pk → full name
cur.execute("SELECT Z_PK, ZFULLNAME FROM ZPERSON WHERE ZFULLNAME IS NOT NULL")
person_names = {row[0]: row[1] for row in cur.fetchall()}

# Map face → asset + person (newer schema uses ZDETECTEDFACE)
cur.execute("""
  SELECT ZDETECTEDFACE.ZASSET, ZDETECTEDFACE.ZPERSON
  FROM ZDETECTEDFACE
  WHERE ZDETECTEDFACE.ZPERSON IS NOT NULL
""")

result = {}
for asset_pk, person_pk in cur.fetchall():
  filename = asset_names.get(asset_pk)
  name = person_names.get(person_pk)
  if filename and name:
    result.setdefault(filename, [])
    if name not in result[filename]:
      result[filename].append(name)

conn.close()

with open(out_path, "w") as f:
  json.dump(result, f, indent=2)

people = {}
for names in result.values():
  for n in names:
    people[n] = people.get(n, 0) + 1

print(f"Exported {len(result)} tagged photos, {len(people)} people")
for name, count in sorted(people.items(), key=lambda x: -x[1]):
  print(f"  {name}: {count} photos")
print(f"Written to {out_path}")
PYEOF
