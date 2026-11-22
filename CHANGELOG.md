# Changelog

## 0.17.0

### Added
- **Settings summary in the game list**: each enabled game shows its setup, such as "3x · Balanced" or "2x · 65% light model".
- **Use these settings for new games**: saves a game's multiplier, Flow Scale, Performance Mode and quirks as the starting point for every game enabled afterwards (including Enable all). Settings > Advanced > Reset new-game defaults clears it.
- **Reset settings to defaults**: puts one game's tuning back to the new-game defaults without removing its profile or workarounds.

### Fixed
- Uninstalling now also removes the config backups and the saved new-game defaults, so the config folder is no longer left behind.

## 0.16.0

### Added
- **Apply these settings to all games**: in a game's profile, copies its multiplier, Flow Scale, Performance Mode and quirk settings to every other game profile (after a confirmation). Flatpak profiles and per-game workarounds are left alone.
- **Restore previous config**: the plugin now keeps the last three versions of `conf.toml` (a new snapshot at most every 10 minutes, so slider drags don't flood them). Settings > Advanced > Restore previous config swaps back to the newest one, and restoring again swaps forward, so it can always be undone. A backup that no longer parses is never restored.

## 0.15.1

### Changed
- The "Use Stable 30 FPS" button is now a **Smooth pacing target** dropdown: 30 → 60 (60 Hz), 45 → 90 or 30 → 90 (90 Hz OLED). Each sets a steady base cap and the matching multiplier, so frame pacing lands exactly on the screen's refresh rate.
- Added a tip row under the settings for warping/bubbling, tearing and input lag, and clarified that the Quality preset gives the fewest artifacts.

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
