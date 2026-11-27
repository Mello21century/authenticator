#!/bin/sh
# Regenerate every app icon from one 1024x1024 source. Usage: design/logo/apply.sh [source.png]  (macOS: sips + swift)
set -e
cd "$(dirname "$0")/../.."
SRC=${1:-design/logo/space-authenticator-icon-slate.png}
swift design/logo/macicon.swift "$SRC" apps/desktop/build/icon.png
for f in icon android-icon-foreground splash-icon; do cp "$SRC" apps/mobile/assets/$f.png; done
sips -z 48 48 "$SRC" --out apps/mobile/assets/favicon.png >/dev/null
for s in 192 512; do sips -z $s $s "$SRC" --out apps/web/public/icon-$s.png >/dev/null; done
sips -z 180 180 "$SRC" --out apps/web/public/apple-touch-icon.png >/dev/null
sips -z 256 256 "$SRC" --out apps/web/public/logo.png >/dev/null
sips -z 64 64 "$SRC" --out apps/web/public/favicon.png >/dev/null
for s in 16 32 48 128; do sips -z $s $s "$SRC" --out apps/extension/icons/icon-$s.png >/dev/null; done
sips -z 32 32 "$SRC" --out apps/desktop/build/tray.png >/dev/null
echo "icons updated from $SRC"
