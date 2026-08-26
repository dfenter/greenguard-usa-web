#!/bin/bash
# Fetch a Sketchfab model's glTF archive and unpack it into src/<species>/
# Usage: ./fetch.sh <species> <uid>
# Reads SKETCHFAB_TOKEN from /Users/lucille/greenguard-usa-web/app/.env.
# Never prints the token.
set -euo pipefail
SPECIES="$1"; MODEL_UID="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
TOK="$(sed -n 's/^SKETCHFAB_TOKEN=//p' /Users/lucille/greenguard-usa-web/app/.env | head -1 | tr -d '"' )"
[ -n "$TOK" ] || { echo "no token found"; exit 1; }
DIR="$HERE/src/$SPECIES"
mkdir -p "$DIR"
curl -sS -H "Authorization: Token $TOK" "https://api.sketchfab.com/v3/models/$MODEL_UID/download" -o "$DIR/dl.json"
URL="$(python3 -c "
import json,sys
j=json.load(open('$DIR/dl.json'))
if 'gltf' not in j or not j['gltf'].get('url'): sys.exit('no gltf archive offered')
print(j['gltf']['url'])
")"
echo "$SPECIES ($UID): glTF archive $(python3 -c "import json;print(json.load(open('$DIR/dl.json'))['gltf']['size'])") bytes"
curl -sS "$URL" -o "$DIR/archive.zip"
rm -rf "$DIR/unpacked" && mkdir -p "$DIR/unpacked"
unzip -q -o "$DIR/archive.zip" -d "$DIR/unpacked"
echo "--- unpacked ---"; find "$DIR/unpacked" -type f | sed "s|$DIR/||" 
