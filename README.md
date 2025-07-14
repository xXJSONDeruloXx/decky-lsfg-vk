# Lossless Scaling for Steam Deck

⚠️ **Unofficial Community Plugin**: This Decky Loader plugin is an independent project and is **not officially supported** by the creators of Lossless Scaling or lsfg-vk. Support is provided separately via the [Plugin Support Discord](YOUR_DISCORD_LINK_HERE).

A demo & install tutorial is available here:

<a href="https://www.youtube.com/watch?v=0KCXxhD-Y8s&embeds_referring_euri=https%3A%2F%2Fwww.reddit.com%2F&embeds_referring_origin=https%3A%2F%2Fwww.reddit.com&source_ve_path=MjM4NTE" target="_blank">
  <img src="https://img.youtube.com/vi/0KCXxhD-Y8s/0.jpg" alt="Demo & Install Tutorial" width="400"/>
</a>

## What is this?

A Decky plugin that streamlines the installation of **lsfg-vk** ([Lossless Scaling Frame Generation Vulkan layer](https://github.com/PancakeTAS/lsfg-vk)) on Steam Deck, allowing you to use the Lossless Scaling features on Linux with a controller friendly UI in SteamOS or Bazzite. 

## Installation

**Note:** This plugin is not yet available on the Decky Plugin Store, it is in an experimental state, and likely to change drastically pending a full store release. 

1. **Download the plugin** from the [latest release](https://github.com/xXJSONDeruloXx/decky-lossless-scaling-vk/releases/tag/Latest)
   - Download the "Lossless Scaling.zip" file to your Steam Deck
2. **Install manually through Decky**:
   - In Game Mode, go to the settings cog in the top right of the Decky Loader tab
   - Enable "Developer Mode"
   - Go to "Developer" tab and select "Install Plugin from Zip"
   - Select the downloaded "Lossless Scaling.zip" file

## How to Use

1. **Purchase and install** [Lossless Scaling](https://store.steampowered.com/app/993090/Lossless_Scaling/) from Steam
2. **Open the plugin** from the Decky menu
3. **Click "Install lsfg-vk"** to automatically set up the compatibility layer
4. **Configure settings** using the plugin's UI.
5. **Apply launch commands** to the game you want to use frame generation with:
   - **Option 1 (Recommended)**: `~/lsfg %COMMAND%` - Uses your plugin configuration
      - **Option 2**: Manual environment variables like `ENABLE_LSFG=1 LSFG_MULTIPLIER=2 %COMMAND%`
      - See the [LSFG-VK WIKI](https://github.com/PancakeTAS/lsfg-vk/wiki/Configuring-lsfg%E2%80%90vk) for more information on each available environment variable

## Feedback and Support

For per-game feedback and community support, check out the UPCOMING DISCORD LINK HERE

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
  
Special thanks to <a href="https://www.youtube.com/@DeckWizard" target="_blank">Deck Wizard</a> for the video tutorial.
