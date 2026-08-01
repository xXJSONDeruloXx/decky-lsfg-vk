#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${BIONIC_FG_BUILD_DIR:-$ROOT_DIR/build/linux-x86_64}"
OUTPUT_DIR="${BIONIC_FG_OUTPUT_DIR:-$ROOT_DIR/dist/linux-x86_64}"

if [[ -f "$BUILD_DIR/CMakeCache.txt" ]]; then
    cached_source="$(sed -n 's/^CMAKE_HOME_DIRECTORY:INTERNAL=//p' "$BUILD_DIR/CMakeCache.txt")"
    if [[ "$cached_source" != "$ROOT_DIR" ]]; then
        rm -rf "$BUILD_DIR"
    fi
fi

cmake -S "$ROOT_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR" \
    --parallel "${CMAKE_BUILD_PARALLEL_LEVEL:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')}"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/libbionic_fg.so" "$OUTPUT_DIR/VkLayer_BIONIC_framegen.json"
cp "$BUILD_DIR/libbionic_fg.so" "$OUTPUT_DIR/libbionic_fg.so"
cp "$ROOT_DIR/VkLayer_BIONIC_framegen.json" "$OUTPUT_DIR/VkLayer_BIONIC_framegen.json"

if command -v file >/dev/null 2>&1; then
    file "$OUTPUT_DIR/libbionic_fg.so"
fi
printf 'Library: %s\nManifest: %s\n' \
    "$OUTPUT_DIR/libbionic_fg.so" "$OUTPUT_DIR/VkLayer_BIONIC_framegen.json"
