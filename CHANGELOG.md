# Changelog

## 0.15.0

### Added
- Quality preset dropdown (Quality, Balanced, Low latency) that sets Flow Scale and Performance Mode together; shows "Custom" when values don't match a preset.
- "Use Stable 30 FPS" button in the per-game Workarounds section: sets a 30 FPS base cap with 2x frame generation for an even 60 FPS.
- The Base FPS Cap now shows the resulting output frame rate for the current multiplier.
- Plain-language descriptions for Flow Scale, Performance Mode, Present Mode Override and Preserve Swapchain Image Count.

### Changed
- Added `scripts/package.sh` to build the installable zip and a CI workflow that builds and runs the tests on every PR.
- Reworded the Flow Scale, Performance Mode and Base FPS Cap descriptions.

### Fixed
- Reinstalling no longer silently discards profiles when `conf.toml` can't be parsed (for example after a hand-edit typo). A copy is saved as `conf.toml.bak-<timestamp>` before defaults are written.
- A damaged or incomplete lsfg-vk archive is now rejected before any installed file is replaced, instead of leaving a half-updated install.
