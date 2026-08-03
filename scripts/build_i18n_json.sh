#!/bin/bash

TARGET_DIR="defaults/i18n"

# Check if the directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory $TARGET_DIR not found."
    exit 1
fi

# Use jq to merge files
jq -n '
  reduce inputs as $i ( {}; . + { (input_filename | split("/") | last | split(".json")[0]): $i } )
' "$TARGET_DIR"/*.json > './src/i18n/languages.json'