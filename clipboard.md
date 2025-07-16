# Copy any of the following to clipboard, and paste into your game's properties > launch commands

## Standard LSFG Launch Command (Recommended)

Uses your plugin configuration settings:

```sh
~/lsfg %command%
```

## Basic Frame Generation Commands

Basic 2x frame generation:
```sh
ENABLE_LSFG=1 LSFG_MULTIPLIER=2 LSFG_FLOW_SCALE=0.8 %command%
```

Basic 3x frame generation:
```sh
ENABLE_LSFG=1 LSFG_MULTIPLIER=3 LSFG_FLOW_SCALE=0.8 %command%
```

Basic 4x frame generation:
```sh
ENABLE_LSFG=1 LSFG_MULTIPLIER=4 LSFG_FLOW_SCALE=0.8 %command%
```

## Performance Optimized Commands

with performance mode and vkbasalt disabled:
```sh
ENABLE_LSFG=1 LSFG_MULTIPLIER=2 LSFG_FLOW_SCALE=0.8 LSFG_PERF_MODE=1 DISABLE_VKBASALT=1 %command%
```

## Individual Environment Variables

Enable LSFG:
```sh
ENABLE_LSFG=1
```

Set frame generation multiplier (2x, 3x, or 4x):
```sh
LSFG_MULTIPLIER=2
```
```sh
LSFG_MULTIPLIER=3
```
```sh
LSFG_MULTIPLIER=4
```

Set flow scale (quality/performance):
```sh
LSFG_FLOW_SCALE=0.8
```

Enable HDR support:
```sh
LSFG_HDR=1
```

Enable performance mode:
```sh
LSFG_PERF_MODE=1
```

Disable vsync (immediate present mode, not recommended in most cases):
```sh
MESA_VK_WSI_PRESENT_MODE=immediate
```

Disable vkbasalt layer (can fix potential black screens):
```sh
DISABLE_VKBASALT=1
```
## Notes

- The `~/lsfg %command%` option uses your plugin's configured settings
- Manual environment variables override plugin settings
- Start with 2x multiplier and adjust based on performance
- Lower flow scale values provide better quality but may impact performance
- HDR mode requires HDR-capable display and game support
- Immediate present mode reduces input lag but may cause screen tearing