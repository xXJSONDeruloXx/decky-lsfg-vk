# Lossless Scaling for Steam Deck
A Decky plugin that streamlines the installation of **lsfg-vk** ([Lossless Scaling Frame Generation Vulkan layer](https://github.com/PancakeTAS/lsfg-vk)) on Steam Deck, allowing you to use the Lossless Scaling app on Linux.

## What is this?

This plugin automates the installation of lsfg-vk, a compatibility layer that allows the Windows-only [Lossless Scaling](https://store.steampowered.com/app/993090/Lossless_Scaling/) app to work on Linux systems like Steam Deck. Lossless Scaling provides frame generation and upscaling features for games.

<img width="581" height="893" alt="image" src="https://github.com/user-attachments/assets/23931a7f-b496-4d41-bde4-3dfbb4ba7d4b" />


## Installation

### Manual Installation (Current Method)
**Note:** This plugin is not yet available on the Decky Plugin Store.

1. **Download the plugin** from the [latest release](https://github.com/xXJSONDeruloXx/decky-lossless-scaling-vk/releases/tag/Latest)
   - Download the "Lossless Scaling.zip" file to your Steam Deck
2. **Install manually through Decky**:
   - In Game Mode, go to the settings cog in the top right of the Decky Loader tab
   - Enable "Developer Mode"
   - Go to "Developer" tab and select "Install Plugin from Zip"
   - Select the downloaded "Lossless Scaling.zip" file

### Future Installation
- This plugin will be available through the Decky Plugin Store once approved

## How to Use

1. **Purchase and install** [Lossless Scaling](https://store.steampowered.com/app/993090/Lossless_Scaling/) from Steam
2. **Open the plugin** from the Decky menu
3. **Click "Install lsfg-vk"** to automatically set up the compatibility layer
4. **Configure settings** using the plugin's UI controls:
   - Enable/disable LSFG
   - Set FPS multiplier (2-4)
   - Adjust flow scale (0.25-1.0) 
   - Toggle HDR mode
   - Toggle immediate mode (disable vsync)
5. **Apply launch commands** to the game you want to use frame generation with:
   - **Option 1 (Recommended)**: `~/lsfg %COMMAND%` - Uses your plugin configuration
   - **Option 2**: Manual environment variables like `ENABLE_LSFG=1 LSFG_MULTIPLIER=2 %COMMAND%`

## Feedback and Support

For per-game feedback and community support, check out the [Lossless Scaling Discord](https://discord.gg/losslessscaling).

## What it does

The plugin:
- Extracts the lsfg-vk library to `~/.local/lib/`
- Installs the Vulkan layer configuration to `~/.local/share/vulkan/implicit_layer.d/`
- Creates an executable `lsfg` script in the home directory with configurable settings
- Provides a user-friendly interface to configure LSFG settings (enable/disable, multiplier, flow scale, HDR, immediate mode)
- Automatically updates the `lsfg` script when settings are changed
- Provides easy uninstallation by removing these files when no longer needed

## Credits

[PancakeTAS](https://github.com/PancakeTAS/lsfg-vk) for creating the lsfg-vk compatibility layer.
