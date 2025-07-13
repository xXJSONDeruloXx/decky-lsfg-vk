#!/bin/bash

# sync-py-modules.sh
# Script to keep py_modules/lsfg_vk in sync with development changes

echo "Syncing py_modules/lsfg_vk..."

# Remove old py_modules content
rm -rf py_modules/lsfg_vk/__pycache__ 2>/dev/null

# Copy updated files (excluding cache)
rsync -av --exclude="__pycache__" lsfg_vk/ py_modules/lsfg_vk/ 2>/dev/null || {
    echo "Note: lsfg_vk/ directory not found - this is expected after cleanup"
    echo "py_modules/lsfg_vk/ is now the primary development location"
}

echo "py_modules sync complete"
