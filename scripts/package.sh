#!/bin/bash
# Builds "Decky LSFG-VK.zip" in ./out, laid out the way Decky Loader expects.
# The bundled lsfg-vk payload (bin/lsfg-vk-2.0.0.tar.xz) is not tracked in git;
# it is taken from $LSFG_ARCHIVE, ./bin, or the latest published release.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="Decky LSFG-VK"
ARCHIVE="lsfg-vk-2.0.0.tar.xz"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

pnpm build

mkdir -p "$STAGE/$NAME/bin" "$STAGE/$NAME/i18n" out
if [ -n "${LSFG_ARCHIVE:-}" ]; then
  cp "$LSFG_ARCHIVE" "$STAGE/$NAME/bin/$ARCHIVE"
elif [ -f "bin/$ARCHIVE" ]; then
  cp "bin/$ARCHIVE" "$STAGE/$NAME/bin/$ARCHIVE"
else
  tmp="$(mktemp -d)"
  gh release download -R xXJSONDeruloXx/decky-lsfg-vk -p '*.zip' -D "$tmp"
  unzip -q -j "$tmp"/*.zip "$NAME/bin/$ARCHIVE" -d "$STAGE/$NAME/bin"
  rm -rf "$tmp"
fi

cp -r dist py_modules "$STAGE/$NAME/"
cp main.py package.json plugin.json README.md LICENSE "$STAGE/$NAME/"
cp defaults/i18n/*.json "$STAGE/$NAME/i18n/"
find "$STAGE" -name __pycache__ -prune -exec rm -rf {} +

rm -f "out/$NAME.zip"
(cd "$STAGE" && zip -qr "$OLDPWD/out/$NAME.zip" "$NAME")
(cd out && sha256sum "$NAME.zip" > "$NAME.zip.sha256")
echo "Built out/$NAME.zip"
