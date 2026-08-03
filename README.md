# Decky LSFG-VK

> **Note:**  
> This is an **unofficial community plugin**. It is independently developed and **not officially supported** by the creators of Lossless Scaling or lsfg-vk. For support, please use the [decky-lsfg-vk Discord Channel](https://discord.gg/TwvHdVucC3).


<p align="center">
   <img src="assets/decky-lossless-logo.png" alt="decky-lsfg-vk Logo" width="200"/>
</p>
<p align="center">
   <a href="https://ko-fi.com/B0B71HZTAX" target="_blank" rel="noopener noreferrer">
      <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi"/>
   </a>
</p>


## What is this?

A Decky plugin that streamlines the installation of **lsfg-vk** ([Lossless Scaling Frame Generation Vulkan layer](https://github.com/PancakeTAS/lsfg-vk)) on Steam Deck, allowing you to use the Lossless Scaling frame generation features on Linux with a controller friendly UI in SteamOS, Bazzite, or any other Linux platform compatible with Decky Loader.

> The v2 x86_64 layer uses the rebuilt fork prerelease [`v2.0.0-decky.3`](https://github.com/xXJSONDeruloXx/lsfg-vk/releases/tag/v2.0.0-decky.3); the Flatpak payloads remain pinned to [`v2.0.0-decky.2`](https://github.com/xXJSONDeruloXx/lsfg-vk/releases/tag/v2.0.0-decky.2), and the Armada/aarch64 layer uses the rebuilt ARM-port prerelease [`v2.0.0-decky.3-arm64`](https://github.com/xXJSONDeruloXx/lsfg-vk-arm64/releases/tag/v2.0.0-decky.3-arm64).

## Installation

1. **Download the plugin** from the [releases tab](https://github.com/xXJSONDeruloXx/decky-lsfg-vk/releases)
   - Download the "decky-lsfg-vk.zip" file to your Steam Deck
2. **Install manually through Decky**:
   - In Game Mode, go to the settings cog in the top right of the Decky Loader tab
   - Enable "Developer Mode"
   - Go to "Developer" tab and select "Install Plugin from Zip"
   - Select the downloaded "decky-lsfg-vk.zip" file

## How to Use

1. **Purchase and install** [Lossless Scaling](https://store.steampowered.com/app/993090/Lossless_Scaling/) from Steam
2. **Open the plugin** from the Decky menu
3. **Click "Install lsfg-vk"** to automatically set up the lsfg-vk vulkan layer
4. **Configure settings** using the plugin's UI - adjust FPS multiplier, flow scale, performance mode, FP16, automatic profile matching, and optional GPU selection
5. **Apply launch option** to games you want to use frame generation with:
   - Add `~/lsfg %command%` to your game's launch options in Steam Properties
   - Or use the "Launch Option Clipboard" button in the plugin to copy the command
6. **Launch your game** - frame generation will activate automatically using your plugin configuration

## Configuration Options

The plugin provides several configuration options to optimize frame generation for your games:

### Core Settings
- **FPS Multiplier**: Choose between 2x, 3x, or 4x frame generation
- **Flow Scale**: Adjust motion estimation quality (lower = better performance, higher = better quality)
- **Performance Mode**: Uses a lighter processing model
- **Allow FP16**: Enable half-precision acceleration; disable it for older NVIDIA GPUs
- **Active In**: Optionally match a profile to executable names, Wine executables, or process names
- **Automatic Profile Matching**: Explicitly let lsfg-vk choose an `Active In` profile; otherwise the Decky-selected profile is always forced
- **GPU**: Optionally select the GPU by name, vendor/device ID, or PCI bus ID
- **Disable Frame Generation**: Disable the layer for the next launch without creating an invalid 1x profile

## Feedback and Support

For per-game feedback and community support, please join the [decky-lsfg-vk Discord Channel](https://discord.gg/TwvHdVucC3)

## Troubleshooting

**Frame generation not working?**
- Ensure you've added `~/lsfg %command%` to your game's launch options
- Check that the Lossless Scaling DLL was detected correctly in the plugin
- Try enabling Performance Mode if you're experiencing crashes
- Disable **Automatic Profile Matching** to force the profile selected in Decky, even when it has an `Active In` value
- Make sure your game is running in fullscreen mode for best results

**Performance issues?**
- Lower the Flow Scale setting for better performance
- Enable Performance Mode (recommended for most games)
- Try reducing the FPS multiplier from 4x to 2x or 3x
- Consider using the experimental FPS limit feature for DirectX games

## What it does

The plugin:
- Downloads checksum-pinned x86_64 or Armada/aarch64 lsfg-vk v2 assets from the owner-fork release to `~/.local/lib/`
- Bundles checksum-pinned lsfg-vk v2 Flatpak extensions for runtimes 23.08, 24.08, and 25.08, and installs the selected local bundle
- Updates already-installed user Flatpak runtimes and migrates the plugin's legacy app overrides when the native layer is updated
- Records existing Flatpak runtime commits and rolls back already-updated runtimes when a multi-runtime migration fails, when Flatpak permits it
- Configures the v2 Vulkan layer in `~/.local/share/vulkan/implicit_layer.d/`
- Migrates the existing `~/.config/lsfg-vk/conf.toml` from v1 to v2 automatically on layer update, retaining a one-time `.v1.bak` backup
- Automatically detects your Lossless Scaling DLL installation
- Provides an easy-to-use interface to configure frame generation settings:
  - **FPS Multiplier**: Choose 2x, 3x, or 4x frame generation
  - **Flow Scale**: Adjust motion estimation quality vs performance
  - **Performance Mode**: Use lighter processing for better performance
  - **FP16, Active In, GPU, and explicit automatic matching**: Use v2 profile parameters without ambiguous profile selection
  - **Launch workarounds**: Preserve existing DXVK, Gamescope, Zink, MangoHud, and vkBasalt launch options
- **Hot-reloading**: Multiplier, flow scale, and performance-mode changes are reloaded while games run; other changes may require a swapchain recreation or restart
- Easy uninstallation that removes all installed files when no longer needed

## Credits

- **[PancakeTAS](https://github.com/PancakeTAS/lsfg-vk)** for creating the lsfg-vk Vulkan compatibility layer
- **[Lossless Scaling](https://store.steampowered.com/app/993090/Lossless_Scaling/)** developers for the original frame generation technology
- **[Deck Wizard](https://www.youtube.com/@DeckWizard)**  - Extensive community support including comprehensive guides, promotional content, thorough testing and feedback, custom artworks, and tutorial videos. His passionate advocacy and continuous support have been instrumental in this plugin's success.
- The **Decky Loader** team for the plugin framework
- Community contributors and testers for feedback and bug reports
