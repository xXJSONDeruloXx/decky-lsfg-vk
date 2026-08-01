#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/vendor/bionic-fg"
BUILD_DIR="${BIONIC_FG_BUILD_DIR:-$SOURCE_DIR/build/linux-x86_64}"
OUTPUT_DIR="${BIONIC_FG_OUTPUT_DIR:-$ROOT_DIR/out/bionic-fg-x86_64}"
PACKAGE_PATH="${BIONIC_FG_PACKAGE_PATH:-$ROOT_DIR/out/bionic-fg-x86_64.zip}"

if [[ -f "$BUILD_DIR/CMakeCache.txt" ]]; then
    cached_source="$(sed -n 's/^CMAKE_HOME_DIRECTORY:INTERNAL=//p' "$BUILD_DIR/CMakeCache.txt")"
    if [[ "$cached_source" != "$SOURCE_DIR" ]]; then
        rm -rf "$BUILD_DIR"
    fi
fi

cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR" \
    --parallel "${CMAKE_BUILD_PARALLEL_LEVEL:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')}"

LIBRARY_PATH="$BUILD_DIR/libbionic_fg.so"
MANIFEST_PATH="$SOURCE_DIR/VkLayer_BIONIC_framegen.json"
if [[ ! -f "$LIBRARY_PATH" ]]; then
    printf 'Build did not produce %s\n' "$LIBRARY_PATH" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/libbionic_fg.so" "$OUTPUT_DIR/VkLayer_BIONIC_framegen.json" "$PACKAGE_PATH"
cp "$LIBRARY_PATH" "$OUTPUT_DIR/libbionic_fg.so"
cp "$MANIFEST_PATH" "$OUTPUT_DIR/VkLayer_BIONIC_framegen.json"

if command -v file >/dev/null 2>&1; then
    file "$OUTPUT_DIR/libbionic_fg.so"
fi

if command -v zip >/dev/null 2>&1; then
    (
        cd "$OUTPUT_DIR"
        zip -q -j "$PACKAGE_PATH" libbionic_fg.so VkLayer_BIONIC_framegen.json
    )
    printf 'Package: %s\n' "$PACKAGE_PATH"
else
    printf 'zip is not installed; staged files remain in %s\n' "$OUTPUT_DIR"
fi

printf 'Library: %s\nManifest: %s\n' \
    "$OUTPUT_DIR/libbionic_fg.so" "$OUTPUT_DIR/VkLayer_BIONIC_framegen.json"
