# Bionic FG glibc experiment

This branch vendors the `main` snapshot of
[bionic-fg](https://github.com/xXJSONDeruloXx/bionic-fg) and adds a Linux/glibc
build mode for an x86_64 Vulkan implicit layer.

The vendored snapshot is based on upstream `main` at `9a81c36`; the matching
source changes are also available on bionic-fg branch
`agent/glibc-x86_64-layer`.

The Android implementation uses AHardwareBuffer imports and JNI. The glibc
variant omits JNI/AHardwareBuffer and uses the existing single-device path:
swapchain images are copied into device-local frame inputs, the embedded compute
graph runs on the application device, and generated images are copied back into
the application swapchain. The source layer remains gated by
`BIONIC_FG_ENABLE=1`.

## Build

On an x86_64 Linux/glibc environment with CMake, Vulkan headers/loader, a C++17
compiler, pthreads, and `zip` installed:

```sh
./scripts/build_bionic_fg_x86_64.sh
```

The build stages:

```text
out/bionic-fg-x86_64/libbionic_fg.so
out/bionic-fg-x86_64/VkLayer_BIONIC_framegen.json
out/bionic-fg-x86_64.zip
```

The manifest expects the standard per-user Vulkan layout:

```text
~/.local/lib/libbionic_fg.so
~/.local/share/vulkan/implicit_layer.d/VkLayer_BIONIC_framegen.json
```

For a manual smoke test, copy those two files into place, create a Bionic FG
configuration, and launch a Vulkan application with:

```sh
export BIONIC_FG_ENABLE=1
export BIONIC_FG_CONFIG="$HOME/.config/bionic-fg/conf.toml"
export VK_LAYER_PATH="$HOME/.local/share/vulkan/implicit_layer.d"
```

```toml
version = 1

[global]
enabled = true
multiplier = 2
flow_scale = 0.8
model = 0
```

This is intentionally a native-layer build experiment. The existing Decky
installer and UI still manage `lsfg-vk`; a follow-up branch should decide how a
runtime selector, configuration namespace, and architecture/package selection
should be exposed after testing the layer on real x86_64 Vulkan hardware.

## Validation notes

The produced library should be an x86-64 ELF shared object linked against the
system Vulkan loader and glibc. A successful build alone does not establish
frame-generation correctness; validation still requires a real x86_64 Vulkan
driver, a swapchain application, and inspection of the layer logs/artifacts.
