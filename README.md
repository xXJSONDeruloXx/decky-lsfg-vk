# Decky Plugin Template [![Chat](https://img.shields.io/badge/chat-on%20discord-7289da.svg)](https://deckbrew.xyz/discord)

Reference example for using [decky-frontend-lib](https://github.com/SteamDeckHomebrew/decky-frontend-lib) (@decky/ui) in a [decky-loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin.

### **Please also refer to the [wiki](https://wiki.deckbrew.xyz/en/user-guide/home#plugin-development) for important information on plugin development and submissions/updates. currently documentation is split between this README and the wiki which is something we are hoping to rectify in the future.**  

## Developers

### Dependencies

This template relies on the user having Node.js v16.14+ and `pnpm` (v9) installed on their system.  
Please make sure to install pnpm v9 to prevent issues with CI during plugin submission.  
`pnpm` can be downloaded from `npm` itself which is recommended.

#### Linux

```bash
sudo npm i -g pnpm@9
```

If you would like to build plugins that have their own custom backends, Docker is required as it is used by the Decky CLI tool.

### Making your own plugin

1. You can fork this repo or utilize the "Use this template" button on Github.
2. In your local fork/own plugin-repository run these commands:
   1. ``pnpm i``
   2. ``pnpm run build``
   - These setup pnpm and build the frontend code for testing.
3. Consult the [decky-frontend-lib](https://github.com/SteamDeckHomebrew/decky-frontend-lib) repository for ways to accomplish your tasks.
   - Documentation and examples are still rough, 
   - Decky loader primarily targets Steam Deck hardware so keep this in mind when developing your plugin.
4. If using VSCodium/VSCode, run the `setup` and `build` and `deploy` tasks. If not using VSCodium etc. you can derive your own makefile or just manually utilize the scripts for these commands as you see fit.

If you use VSCode or it's derivatives (we suggest [VSCodium](https://vscodium.com/)!) just run the `setup` and `build` tasks. It's really that simple.

#### Other important information

Everytime you change the frontend code (`index.tsx` etc) you will need to rebuild using the commands from step 2 above or the build task if you're using vscode or a derivative.

Note: If you are receiving build errors due to an out of date library, you should run this command inside of your repository:

```bash
pnpm update @decky/ui --latest
```

### Backend support

If you are developing with a backend for a plugin and would like to submit it to the [decky-plugin-database](https://github.com/SteamDeckHomebrew/decky-plugin-database) you will need to have all backend code located in ``backend/src``, with backend being located in the root of your git repository.
When building your plugin, the source code will be built and any finished binary or binaries will be output to ``backend/out`` (which is created during CI.)
If your buildscript, makefile or any other build method does not place the binary files in the ``backend/out`` directory they will not be properly picked up during CI and your plugin will not have the required binaries included for distribution.

Example:  
In our makefile used to demonstrate the CI process of building and distributing a plugin backend, note that the makefile explicitly creates the `out` folder (``backend/out``) and then compiles the binary into that folder. Here's the relevant snippet.

```make
hello:
	mkdir -p ./out
	gcc -o ./out/hello ./src/main.c
```

The CI does create the `out` folder itself but we recommend creating it yourself if possible during your build process to ensure the build process goes smoothly.

Note: When locally building your plugin it will be placed into a folder called 'out' this is different from the concept described above.

The out folder is not sent to the final plugin, but is then put into a ``bin`` folder which is found at the root of the plugin's directory.  
More information on the bin folder can be found below in the distribution section below.

### Distribution

We recommend following the instructions found in the [decky-plugin-database](https://github.com/SteamDeckHomebrew/decky-plugin-database) on how to get your plugin up on the plugin store. This is the best way to get your plugin in front of users.
You can also choose to do distribution via a zip file containing the needed files, if that zip file is uploaded to a URL it can then be downloaded and installed via decky-loader.

**NOTE: We do not currently have a method to install from a downloaded zip file in "game-mode" due to lack of a usable file-picking dialog.**

Layout of a plugin zip ready for distribution:
```
pluginname-v1.0.0.zip (version number is optional but recommended for users sake)
   |
   pluginname/ <directory>
   |  |  |
   |  |  bin/ <directory> (optional)
   |  |     |
   |  |     binary (optional)
   |  |
   |  dist/ <directory> [required]
   |      |
   |      index.js [required]
   | 
   package.json [required]
   plugin.json [required]
   main.py {required if you are using the python backend of decky-loader: serverAPI}
   README.md (optional but recommended)
   LICENSE(.md) [required, filename should be roughly similar, suffix not needed]
```

Note regarding licenses: Including a license is required for the plugin store if your chosen license requires the license to be included alongside usage of source-code/binaries!

Standard procedure for licenses is to have your chosen license at the top of the file, and to leave the original license for the plugin-template at the bottom. If this is not the case on submission to the plugin database, you will be asked to fix this discrepancy.

We cannot and will not distribute your plugin on the Plugin Store if it's license requires it's inclusion but you have not included a license to be re-distributed with your plugin in the root of your git repository.
