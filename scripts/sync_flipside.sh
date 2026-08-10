#!/bin/bash
# Sync FLIPSIDE from canonical repo into the site tree with absolute,
# version-stamped asset URLs (prevents mixed-version module graphs on
# clients that cache across deploys).
set -e
SRC=/Users/lucille/flipside
DST=/Users/lucille/greenguard-usa-web/flipside
V=$(cd "$SRC" && git rev-parse --short HEAD)
rm -rf "$DST"; mkdir "$DST"
cp "$SRC/index.html" "$DST/"
cp -R "$SRC/css" "$SRC/js" "$DST/"
sed -i '' "s|href=\"css/style.css\"|href=\"/flipside/css/style.css?v=$V\"|; s|src=\"js/main.js\"|src=\"/flipside/js/main.js?v=$V\"|" "$DST/index.html"
find "$DST/js" -name '*.js' -exec sed -i '' -E "s|(from '(\./\|\.\./)[^']+\.js)'|\1?v=$V'|g; s|(import\('(\./\|\.\./)[^']+\.js)'|\1?v=$V'|g" {} +
echo "synced flipside @ $V"
