#!/bin/sh
# Downloads every PixelLab asset listed in ids.txt into <dir> (no account key needed: the asset id
# is the key). Needs network access to api.pixellab.ai and backblaze.pixellab.ai.
# Usage: sh tools/pixellab/fetch.sh <dir>   then   python3 tools/pixellab/build_library.py <dir>
set -e
out=${1:?usage: fetch.sh <dir>}
mkdir -p "$out"
grep -v '^#' "$(dirname "$0")/ids.txt" | awk -v o="$out" '{
  b = "https://api.pixellab.ai/mcp"
  if ($1 == "object") print b "/objects/" $2 "/spritesheet " o "/object_" $2 ".zip"
  else if ($1 == "character") print b "/characters/" $2 "/download " o "/character_" $2 ".zip"
  else if ($1 == "tiles") print b "/tiles-pro/" $2 "/download " o "/tiles_" $2 ".zip"
  else if ($1 == "tileset") { print b "/tilesets/" $2 "/image?inline=true " o "/tileset_" $2 ".png"; print b "/tilesets/" $2 "/metadata " o "/tileset_" $2 ".json" }
  else if ($1 == "ui") print b "/ui-assets/" $2 "/download " o "/ui_" $2 ".zip"
}' | xargs -P 12 -n 2 sh -c 'curl -sSfL --retry 3 -o "$1" "$0" || echo "failed: $0"'
