#!/bin/bash
# Пересобрать Resources/AppIcon.icns из головы героя LPC (рисунок делает tools/icon.py в корне репо).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 ../tools/icon.py
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SET="$TMP/AppIcon.iconset"
mkdir -p "$SET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" build/icon-1024.png --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d" build/icon-1024.png --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o Resources/AppIcon.icns
echo "Готово: Resources/AppIcon.icns"
