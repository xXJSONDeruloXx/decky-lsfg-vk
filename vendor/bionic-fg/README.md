# bionic-fg

Standalone Android/Bionic Vulkan frame generation layer.

## What is here

- `libbionic_fg.so`: native framegen runtime and Vulkan implicit layer
- `VK_LAYER_BIONIC_framegen`: intercepts swapchain presentation and injects generated frames
- Android Hardware Buffer sharing between the producer Vulkan device and the framegen device
- Embedded SPIR-V shader bundle with model 0 and model 1 selection
- Optional JNI bootstrap API under `io.github.bionicfg.BionicFGNative`

## Runtime configuration

The Vulkan layer is enabled with `BIONIC_FG_ENABLE=1` and reads a TOML config file.
The config path defaults to `$HOME/.config/bionic-fg/conf.toml` and can be overridden with `BIONIC_FG_CONFIG`.

```sh
BIONIC_FG_ENABLE=1
BIONIC_FG_CONFIG=/path/to/conf.toml # optional
VK_LAYER_PATH=/path/to/implicit_layer.d
```

```toml
version = 1

[global]
enabled = true
multiplier = 2   # 0=off, or 2..4
flow_scale = 0.8 # 0.2..1.0
model = 0        # 0 or 1
```

For backwards compatibility, `BIONIC_FG_MULTIPLIER`, `BIONIC_FG_FLOW_SCALE`, and
`BIONIC_FG_MODEL` are still accepted when the TOML file is missing. If the TOML
file exists, it wins.

The layer polls the config file timestamp during presentation.
- `flow_scale` hot-reloads in place.
- `multiplier` and `model` hot-reload by rebuilding the internal framegen
  context against the already-provisioned AHB outputs and swapchain image pool.
  Setting `multiplier = 0` turns frame generation off without recreating the
  app swapchain.
- `enabled` still returns `VK_ERROR_OUT_OF_DATE_KHR` once so the application
  can recreate its swapchain with or without the layer active.

Install layout expected by the manifest:

```text
.local/lib/libbionic_fg.so
.local/share/vulkan/implicit_layer.d/VkLayer_BIONIC_framegen.json
```

The manifest uses `../../../lib/libbionic_fg.so` relative to `implicit_layer.d`.

## Build

```sh
cmake -S . -B build/android-arm64 \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-26 \
  -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake
cmake --build build/android-arm64 -j
```

### Linux / glibc x86_64

The glibc target omits the Android JNI and AHardwareBuffer entry points and
uses the layer's single-device path with device-local Vulkan images. It still
uses the same embedded shader graph and implicit-layer interception points.

On an x86_64 Linux system with a C++17 compiler, Vulkan headers/loader, CMake,
and pthreads installed:

```sh
./build-linux-x86_64.sh
```

The output is staged at `dist/linux-x86_64/`:

```text
libbionic_fg.so
VkLayer_BIONIC_framegen.json
```

The manifest is intended for:

```text
~/.local/lib/libbionic_fg.so
~/.local/share/vulkan/implicit_layer.d/VkLayer_BIONIC_framegen.json
```

Enable the layer for a test process with `BIONIC_FG_ENABLE=1` and point
`BIONIC_FG_CONFIG` at a compatible `conf.toml` as described above.

## Shaders

The compute shaders are a clean-room reimplementation of the shader *code*:
functional specifications were derived from disassembly of the runtime-traced
shaders, and the GLSL in `cleanroom/glsl/` was written from those
specifications alone, by implementers who did not see the originals, then
compiled with glslc. See `cleanroom/PROCESS.md`.

The numeric weight constants are carried over from the original shaders as
functional parameters — the reimplementation reproduces their behavior
bit-exactly. No third-party compiled shader artifacts are shipped.

## License

GPL-3.0. See `LICENSE`.

Originally written by xXJSONDeruloXx (https://github.com/xXJSONDeruloXx/bionic-fg)
with contributions from The412Banner; extended for GameNative by Utkarsh Dalal.
