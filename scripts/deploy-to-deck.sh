#!/usr/bin/env bash
set -euo pipefail

deck_host="deck@192.168.0.241"
plugin_root="Decky LSFG-VK"
install_path="/home/deck/homebrew/plugins/Decky LSFG-VK"

package_dir="$(mktemp -d "${TMPDIR:-/tmp}/decky-plugin-package.XXXXXX")"
run_id="$(basename "$package_dir")"
remote_archive="/tmp/decky-lsfg-vk-${run_id}.zip"
remote_stage="/tmp/decky-lsfg-vk-stage-${run_id}"
trap 'rm -rf -- "$package_dir"' EXIT INT TERM

pnpm build
./cli/decky plugin build . \
    --output-path "$package_dir" \
    --tmp-output-path "$package_dir/tmp"

package_zip="$(find "$package_dir" -maxdepth 1 -type f -name '*.zip' -print -quit)"
test -n "$package_zip"

scp "$package_zip" "$deck_host:$remote_archive"

remote_script="$(cat <<'REMOTE'
set -euo pipefail

archive="$1"
stage="$2"
install="$3"
plugin_root="$4"

cleanup() {
    rm -rf -- "$archive" "$stage"
}
trap cleanup EXIT INT TERM

mkdir -p -- "$stage"
unzip -q "$archive" -d "$stage"
test -f "$stage/$plugin_root/plugin.json"
test -f "$stage/$plugin_root/dist/index.js"

sudo -v
sudo rm -rf -- "$install"
sudo mv -- "$stage/$plugin_root" "$install"
sudo chown -R deck:deck -- "$install"
sudo systemctl restart plugin_loader.service
sleep 2
sudo chown -R deck:deck -- "$install"

test "$(systemctl is-active plugin_loader.service)" = active
echo "Deck is ready to test"
REMOTE
)"

printf -v remote_command 'bash -c %q -- %q %q %q %q' \
    "$remote_script" "$remote_archive" "$remote_stage" "$install_path" "$plugin_root"

ssh -tt "$deck_host" "$remote_command"
