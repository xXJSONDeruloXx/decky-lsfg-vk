# Armada / AYN Odin 2 LSFG-VK investigation

This document records reproducible results from testing the Armada Linux port on an AYN Odin 2 Pro. It is intended to give upstream maintainers a complete starting point without requiring the device owner to repeat the same configuration experiments.

## Scope

The reported failure is visual corruption when LSFG-VK generated frames are presented by PEAK. The game renders normally when frame generation is disabled. This report covers the LSFG-VK, Vulkan, Gamescope, and Turnip interaction; unrelated Armada storage, audio, input, and system-maintenance changes are out of scope.

## Test environment

| Component | Observed value |
| --- | --- |
| Device | AYN Odin 2 Pro (Snapdragon 8 Gen 2 / Adreno 740) |
| OS | Armada beta, Fedora 44 userspace |
| Kernel | `7.2.3` aarch64 |
| Vulkan driver | Mesa Turnip `26.2.2-1.fc44.armada` |
| Vulkan device | `Turnip Adreno (TM) 740`, Vulkan API `1.4.354` |
| Gamescope | `3.16.19-257-g77e6ea94+` |
| Gamescope session | `gamescope-session-plus` (Armada package `0~20260820git.39c8351`) |
| Proton | GE-Proton `11-1-aarch64` |
| Game | PEAK, Steam AppID `3527290` |
| Game resolution | `1280x720` |
| LSFG-VK profile | `PEAK`, multiplier `2`, flow scale `0.80`, performance mode enabled |
| Gamescope WSI | Disabled per-game with `ENABLE_GAMESCOPE_WSI=0` |

The installed ARM64 layer is a locally built v2 layer based on the v2.0.0 source. The active diagnostic binary at the time of the final comparison had SHA-256 `203f1c6034376566d571f017d4c7fd7d5e64f6218eb9e811d6b6aab0d018424e`.

## Reproduction

1. Launch PEAK through Armada with the `PEAK` profile active.
2. Use 2× generation with performance mode enabled.
3. Compare the image with LSFG-VK disabled and enabled. A full game restart is used between comparisons.

The relevant active environment is:

```text
LSFGVK_CONFIG=/var/home/armada/.config/lsfg-vk/conf.toml
LSFGVK_PROFILE=PEAK
ENABLE_GAMESCOPE_WSI=0
DXVK_HDR=0
```

The active profile was:

```toml
[[profile]]
name = "PEAK"
active_in = [ "3527290" ]
pacing_mode = "vsync"
multiplier = 2
flow_scale = 0.8
performance_mode = true
override_present_mode = true
preserve_swapchain_image_count = false
```

## Verified observations

- With LSFG-VK disabled, PEAK is visually clean.
- With the layer loaded and the 2× profile active, the usual blocky/corrupt generated-frame artifacts return.
- The layer logs show profile selection, multiplier `2`, Vulkan instance/device hooks, and swapchain interception.
- Gamescope reported approximately 59.6 output FPS during the active 2× run.
- The LSFG-VK standalone benchmark completed successfully on the same device/driver at 1280×720, 2×, performance mode, FP16 disabled: 472.94 base FPS and 945.88 output FPS.
- Therefore the LSFG shader/pipeline can execute on Turnip; the failure is exposed when generated images are inserted into the PEAK/Gamescope swapchain.

The PEAK swapchain trace recorded one swapchain with six images after interception. The application requested present mode `0` (immediate) with a minimum image count of four; the Armada profile then applies the FIFO override.

## Tests that did not resolve the corruption

| Change tested | Result |
| --- | --- |
| Enable Gamescope WSI | Black screen; test stopped |
| Disable Gamescope WSI | Artifacts remained |
| FIFO, mailbox, and immediate present-mode variants | Artifacts remained |
| Sanitize generated-present `pNext`; preserve application `pNext` only for the original frame | Artifacts remained |
| Use optimal transfer layouts for swapchain blits instead of `GENERAL` | Artifacts remained |
| `performance_mode = false` | Artifacts remained; performance fell to roughly 22 FPS |
| Preserve the application swapchain image count | Artifacts remained |
| ARM64 build from upstream v2.0.0-dev source | Artifacts remained |
| Archived v1 ARM64 layer | Could not initialize PEAK; shader extraction failed |

No experimental presentation patch is currently left installed. The device is using the known source-matched v2 ARM64 layer and the WSI-disabled profile baseline.

## Related Armada regression

The symptom appeared after the Armada update that bumped the Gamescope/Gamescope-session stack (recorded locally as Armada commit `21986de`, 2026-09-12). That update also caused transient Steam launch failures (`exit 127`, later `exit 139`) and a Gamescope crash that temporarily returned the device to Desktop Mode. Reboots and restoring the source-matched layer recovered Game Mode, but did not remove the LSFG generated-frame corruption. This correlation is not proof of causation, but makes the compositor/driver update the primary investigation target.

## Current conclusion

This is not currently explained by a missing profile, stale launch option, failed layer load, shader extraction failure, or LSFG benchmark failure. The clean disabled-FG image and repeatable corruption with active FG isolate the problem to the generated-frame presentation path on the Odin's Turnip/Gamescope stack.

Upstream lsfg-vk still tracks virtual swapchain support as an open feature. A virtual swapchain may be relevant because the current layer presents generated frames through the application's swapchain, which is also mediated by Gamescope. This is a hypothesis, not a confirmed fix.

## Suggested next investigation

1. Capture the exact PEAK swapchain format, color space, DRM modifier, and present results on the device.
2. Repeat the same layer test with a known-good Vulkan sample or another game to determine whether the failure is PEAK-specific.
3. Compare the behavior against a pre-update Armada Gamescope/Turnip deployment, if a safe bootable deployment is available.
4. If the issue reproduces outside PEAK, investigate Turnip/Gamescope image ownership and modifier handling before changing LSFG synchronization again.
5. If an AArch64 cross-compiler is available, build instrumented layers from a clean checkout and attach the logs to an upstream report.

Useful upstream references:

- [lsfg-vk v2.0.0 release notes](https://lsfg-vk.dev/blog/release-v2.0.0/)
- [Gamescope compatibility guidance](https://github.com/PancakeTAS/lsfg-vk/wiki/Gamescope-Compatibility/760be621450d283c0ac73b6e65e9bc0d9fb6a14e)
- [Upstream virtual-swapchain discussion](https://github.com/PancakeTAS/lsfg-vk/discussions/498)
