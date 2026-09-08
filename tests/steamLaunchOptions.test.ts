import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWorkaroundChange,
  applyWorkaroundState,
  cleanupLegacyWrapper,
  getDefaultWorkaroundState,
  isLegacyWrapperToken,
  parseWorkaroundOptions,
  readSteamLaunchOptions,
  updateSteamLaunchOptions,
} from "../src/utils/steamLaunchOptions.ts";

test("maps the supported workarounds to current launch variables", () => {
  const options = applyWorkaroundState('gamemoderun %command% --profile "high quality"', {
    dxvkFrameRate: 30,
    disableGamescopeWsi: true,
    disableSteamdeckMode: true,
    disableVkbasalt: true,
    enableZink: true,
  });

  assert.equal(
    options,
    'ENABLE_GAMESCOPE_WSI=0 SteamDeck=0 DISABLE_VKBASALT=1 MESA_LOADER_DRIVER_OVERRIDE=zink DXVK_CONFIG="dxvk.maxFrameRate = 30" gamemoderun %command% --profile "high quality"',
  );
  assert.deepEqual(parseWorkaroundOptions(options), {
    state: {
      dxvkFrameRate: 30,
      disableGamescopeWsi: true,
      disableSteamdeckMode: true,
      disableVkbasalt: true,
      enableZink: true,
    },
    issues: [],
  });
});

test("uses SteamDeck=0 before %command% without a wrapper", () => {
  assert.equal(
    applyWorkaroundChange("", "disableSteamdeckMode", true),
    "SteamDeck=0 %command%",
  );
});

test("keeps WSI disable opt-in and does not add HDR assignments", () => {
  const defaults = getDefaultWorkaroundState();
  assert.equal(applyWorkaroundState("%command%", defaults), "%command%");
  assert.equal(parseWorkaroundOptions("%command%").state.disableGamescopeWsi, false);
  assert.equal(
    applyWorkaroundChange("%command%", "disableGamescopeWsi", true),
    "ENABLE_GAMESCOPE_WSI=0 %command%",
  );
  assert.equal(
    applyWorkaroundChange("ENABLE_GAMESCOPE_WSI=0 %command%", "disableGamescopeWsi", false),
    "%command%",
  );

  const legacy = parseWorkaroundOptions("ENABLE_GAMESCOPE_WSI=0 DXVK_HDR=0 %command%");
  assert.equal(legacy.state.disableGamescopeWsi, true);
  assert.deepEqual(legacy.issues, []);
  assert.equal(
    applyWorkaroundChange("ENABLE_GAMESCOPE_WSI=0 DXVK_HDR=0 %command%", "disableGamescopeWsi", false),
    "%command%",
  );

  const invalid = parseWorkaroundOptions("ENABLE_GAMESCOPE_WSI=maybe %command%");
  assert.equal(invalid.state.disableGamescopeWsi, false);
  assert.equal(invalid.issues.length, 1);
  const conflicting = parseWorkaroundOptions("DISABLE_GAMESCOPE_WSI=1 ENABLE_GAMESCOPE_WSI=1 %command%");
  assert.equal(conflicting.state.disableGamescopeWsi, true);
  assert.match(conflicting.issues.join(" "), /conflicting/);
});

test("preserves unrelated prefixes, quoted tokens, suffix arguments, and dropped variables", () => {
  const options = applyWorkaroundChange(
    'PROTON_USE_WOW64=1 MANGOHUD=1 MANGOHUD_CONFIG="alpha=0.01" ENABLE_VKBASALT=1 VK_INSTANCE_LAYERS="one:two" FOO="hello world" gamemoderun %command% --flag "two words"',
    "disableSteamdeckMode",
    true,
  );
  assert.equal(
    options,
    'SteamDeck=0 PROTON_USE_WOW64=1 MANGOHUD=1 MANGOHUD_CONFIG="alpha=0.01" ENABLE_VKBASALT=1 VK_INSTANCE_LAYERS="one:two" FOO="hello world" gamemoderun %command% --flag "two words"',
  );
  assert.deepEqual(parseWorkaroundOptions(options).issues, []);

  assert.equal(
    applyWorkaroundChange("FOO=bar --flag", "disableSteamdeckMode", true),
    "SteamDeck=0 FOO=bar %command% --flag",
  );
  assert.equal(
    applyWorkaroundChange("FOO=1 %command% MANGOHUD=1", "disableSteamdeckMode", false),
    "FOO=1 %command% MANGOHUD=1",
  );
  assert.equal(
    applyWorkaroundChange('FOO=bar --literal "%command%"', "disableSteamdeckMode", true),
    'SteamDeck=0 FOO=bar %command% --literal "%command%"',
  );
  assert.equal(
    applyWorkaroundChange("gamemoderun SteamDeck=1 %command%", "disableSteamdeckMode", true),
    "SteamDeck=0 gamemoderun SteamDeck=1 %command%",
  );
  assert.equal(parseWorkaroundOptions("gamemoderun SteamDeck=0 %command%").state.disableSteamdeckMode, false);
});

test("uses DXVK_CONFIG for the base cap and preserves other DXVK settings", () => {
  assert.equal(
    applyWorkaroundChange("%command%", "dxvkFrameRate", 60),
    'DXVK_CONFIG="dxvk.maxFrameRate = 60" %command%',
  );
  assert.equal(parseWorkaroundOptions('DXVK_CONFIG="dxvk.maxFrameRate = 60" %command%').state.dxvkFrameRate, 60);
  assert.equal(
    applyWorkaroundChange(
      'DXVK_CONFIG="dxgi.syncInterval = 0; dxvk.maxFrameRate = 30" %command%',
      "dxvkFrameRate",
      0,
    ),
    'DXVK_CONFIG="dxgi.syncInterval = 0" %command%',
  );
  assert.equal(
    applyWorkaroundChange("DXVK_FRAME_RATE=30 %command%", "dxvkFrameRate", 45),
    'DXVK_CONFIG="dxvk.maxFrameRate = 45" %command%',
  );
  assert.equal(
    applyWorkaroundChange("DXVK_FRAME_RATE=30 %command%", "dxvkFrameRate", 0),
    "%command%",
  );

  const apiSpecific = parseWorkaroundOptions(
    'DXVK_CONFIG="dxgi.maxFrameRate = 30; d3d9.maxFrameRate = 30" %command%',
  );
  assert.equal(apiSpecific.state.dxvkFrameRate, 30);
  assert.deepEqual(apiSpecific.issues, []);
  const partial = parseWorkaroundOptions('DXVK_CONFIG="dxgi.maxFrameRate = 30" %command%');
  assert.equal(partial.state.dxvkFrameRate, 30);
  assert.match(partial.issues.join(" "), /only caps one DirectX API/);
  const conflicting = parseWorkaroundOptions(
    'DXVK_CONFIG="dxgi.maxFrameRate = 30; d3d9.maxFrameRate = 60" %command%',
  );
  assert.equal(conflicting.state.dxvkFrameRate, 0);
  assert.match(conflicting.issues.join(" "), /conflicting/);
});

test("reports invalid and malformed FPS values instead of treating them as off", () => {
  const invalid = parseWorkaroundOptions('DXVK_CONFIG="dxvk.maxFrameRate = 61" %command%');
  assert.equal(invalid.state.dxvkFrameRate, 0);
  assert.match(invalid.issues.join(" "), /outside the supported 0-60 range/);
  const malformed = parseWorkaroundOptions('DXVK_CONFIG="dxvk.maxFrameRate" %command%');
  assert.equal(malformed.state.dxvkFrameRate, 0);
  assert.match(malformed.issues.join(" "), /malformed/);
  const obsolete = parseWorkaroundOptions("DXVK_FRAME_RATE=wat %command%");
  assert.equal(obsolete.state.dxvkFrameRate, 0);
  assert.match(obsolete.issues.join(" "), /obsolete/);
  assert.throws(() => applyWorkaroundChange("%command%", "dxvkFrameRate", 61), /0 to 60/);
  assert.throws(() => applyWorkaroundChange("%command%", "dxvkFrameRate", 1.5), /0 to 60/);
});

test("keeps vkBasalt disable mutually exclusive while preserving the dropped enable flag otherwise", () => {
  assert.equal(
    applyWorkaroundChange("ENABLE_VKBASALT=1 %command%", "disableSteamdeckMode", true),
    "SteamDeck=0 ENABLE_VKBASALT=1 %command%",
  );
  const disabled = applyWorkaroundChange("ENABLE_VKBASALT=1 %command%", "disableVkbasalt", true);
  assert.equal(disabled, "DISABLE_VKBASALT=1 %command%");
  assert.equal(
    applyWorkaroundChange(disabled, "disableVkbasalt", false),
    "%command%",
  );
  const conflict = parseWorkaroundOptions("ENABLE_VKBASALT=1 DISABLE_VKBASALT=1 %command%");
  assert.equal(conflict.state.disableVkbasalt, true);
  assert.match(conflict.issues.join(" "), /conflicting/);
});

test("handles current and legacy Zink forms and reports partial state", () => {
  const enabled = applyWorkaroundChange("%command%", "enableZink", true);
  assert.equal(enabled, "MESA_LOADER_DRIVER_OVERRIDE=zink %command%");
  assert.equal(parseWorkaroundOptions(enabled).state.enableZink, true);

  const legacy = parseWorkaroundOptions(
    "__GLX_VENDOR_LIBRARY_NAME=mesa MESA_LOADER_DRIVER_OVERRIDE=zink GALLIUM_DRIVER=zink %command%",
  );
  assert.equal(legacy.state.enableZink, true);
  assert.deepEqual(legacy.issues, []);

  const partial = parseWorkaroundOptions("__GLX_VENDOR_LIBRARY_NAME=mesa MESA_LOADER_DRIVER_OVERRIDE=zink %command%");
  assert.equal(partial.state.enableZink, true);
  assert.match(partial.issues.join(" "), /partially configured/);
  assert.equal(
    applyWorkaroundChange(
      "__GLX_VENDOR_LIBRARY_NAME=mesa MESA_LOADER_DRIVER_OVERRIDE=zink GALLIUM_DRIVER=zink %command%",
      "enableZink",
      false,
    ),
    "%command%",
  );
});

test("cleans only the known legacy wrapper and preserves launch options", () => {
  assert.equal(
    cleanupLegacyWrapper('FOO=bar ~/lsfg %command% --arg "~/lsfg"'),
    'FOO=bar %command% --arg "~/lsfg"',
  );
  assert.equal(cleanupLegacyWrapper("/home/deck/lsfg %command%"), "%command%");
  assert.equal(
    cleanupLegacyWrapper("DXVK_FRAME_RATE=30 LSFG_PROCESS=decky-lsfg-vk %command%"),
    "DXVK_FRAME_RATE=30 LSFG_PROCESS=decky-lsfg-vk %command%",
  );
  assert.equal(
    cleanupLegacyWrapper("LSFG_PROCESS=decky-lsfg-vk %command%"),
    "LSFG_PROCESS=decky-lsfg-vk %command%",
  );
  assert.equal(isLegacyWrapperToken("/home/kurt/lsfg"), false);
});

test("is idempotent", () => {
  const first = applyWorkaroundChange("gamemoderun %command%", "enableZink", true);
  assert.equal(applyWorkaroundState(first, parseWorkaroundOptions(first).state), first);
  assert.equal(applyWorkaroundChange(first, "enableZink", true), first);
  const capped = applyWorkaroundChange(first, "dxvkFrameRate", 30);
  assert.equal(applyWorkaroundChange(capped, "dxvkFrameRate", 30), capped);
});

test("reads and writes the matching Steam app-details launch-option field", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let normalOptions = "FOO=bar    %command%";
  let shortcutOptions = "--windowed";
  const normalWrites: string[] = [];
  const shortcutWrites: string[] = [];
  const unregisters: number[] = [];

  const windowShim = { setTimeout, clearTimeout };
  const apps = {
    RegisterForAppDetails(appId: number, callback: (details: SteamAppDetails) => void) {
      if (appId === 42) {
        callback({ strLaunchOptions: normalOptions, strShortcutLaunchOptions: "must-not-be-read" });
      } else {
        callback({
          strShortcutExe: "/usr/bin/example-game",
          strShortcutLaunchOptions: shortcutOptions,
          strLaunchOptions: "must-not-be-read",
        });
      }
      return { unregister: () => unregisters.push(appId) };
    },
    SetAppLaunchOptions(appId: number, options: string) {
      assert.equal(appId, 42);
      normalWrites.push(options);
      normalOptions = options.replaceAll(" ", "  ");
    },
    SetShortcutLaunchOptions(appId: number, options: string) {
      assert.equal(appId, 43);
      shortcutWrites.push(options);
      shortcutOptions = options;
    },
  };

  (globalThis as Record<string, unknown>).window = windowShim;
  (globalThis as Record<string, unknown>).SteamClient = { Apps: apps };
  try {
    const normalBefore = await readSteamLaunchOptions(42, false);
    assert.equal(normalBefore.options, "FOO=bar    %command%");
    const normalAfter = await updateSteamLaunchOptions(
      42,
      false,
      (options) => applyWorkaroundChange(options, "disableSteamdeckMode", true),
    );
    assert.equal(normalWrites.length, 1);
    assert.equal(shortcutWrites.length, 0);
    assert.equal(normalAfter.options, "SteamDeck=0  FOO=bar  %command%");

    const shortcutAfter = await updateSteamLaunchOptions(
      43,
      true,
      (options) => applyWorkaroundChange(options, "disableGamescopeWsi", true),
    );
    assert.equal(shortcutWrites.length, 1);
    assert.equal(shortcutWrites[0], "ENABLE_GAMESCOPE_WSI=0 %command% --windowed");
    assert.equal(shortcutAfter.options, shortcutWrites[0]);
    assert.ok(unregisters.includes(42));
    assert.ok(unregisters.includes(43));
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});
