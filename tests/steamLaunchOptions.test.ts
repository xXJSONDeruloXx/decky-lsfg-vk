import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupPluginAssignments,
  cleanupPluginLaunchOptions,
  cleanupLegacyWrapper,
  hasWrapperLaunchIntegration,
  installWrapperIntegration,
  installWrapperLaunchOption,
  isLegacyWrapperToken,
  normalizeLaunchOptions,
  readSteamLaunchOptions,
  removeWrapperIntegration,
  removeWrapperLaunchOption,
} from "../src/utils/steamLaunchOptions.ts";

const wrapper = "~/.lsfg";

test("inserts one wrapper immediately before an existing command macro", () => {
  assert.deepEqual(installWrapperLaunchOption('gamemoderun %command% --profile "high quality"', wrapper), {
    options: 'gamemoderun ~/.lsfg %command% --profile "high quality"',
    commandTokenAdded: false,
  });
  assert.equal(hasWrapperLaunchIntegration(`gamemoderun ${wrapper} %command%`, wrapper), true);
  assert.deepEqual(installWrapperLaunchOption(`gamemoderun ${wrapper} %command%`, wrapper), {
    options: `gamemoderun ${wrapper} %command%`,
    commandTokenAdded: false,
  });
});

test("normalizes blank, malformed, and argument-only launch fields", () => {
  assert.deepEqual(installWrapperLaunchOption("", wrapper), {
    options: `${wrapper} %command%`,
    commandTokenAdded: true,
  });
  assert.deepEqual(installWrapperLaunchOption("FOO=bar --windowed", wrapper), {
    options: `FOO=bar ${wrapper} %command% --windowed`,
    commandTokenAdded: true,
  });
  assert.deepEqual(installWrapperLaunchOption("gamemoderun --windowed", wrapper), {
    options: `${wrapper} %command% gamemoderun --windowed`,
    commandTokenAdded: true,
  });
  assert.deepEqual(installWrapperLaunchOption('"%command%"', wrapper), {
    options: `${wrapper} %command%`,
    commandTokenAdded: false,
  });
  assert.deepEqual(installWrapperLaunchOption(`${wrapper} %command`, wrapper), {
    options: `${wrapper} %command%`,
    commandTokenAdded: false,
  });
  assert.deepEqual(installWrapperLaunchOption(`${wrapper} --windowed`, wrapper), {
    options: `${wrapper} %command% --windowed`,
    commandTokenAdded: true,
  });
});

test("preserves assignments quoting suffixes and released wrapper cleanup", () => {
  const options = 'FOO="hello world" VK_INSTANCE_LAYERS="one:two" gamemoderun %command% --flag "two words"';
  assert.equal(
    installWrapperLaunchOption(options, wrapper).options,
    'FOO="hello world" VK_INSTANCE_LAYERS="one:two" gamemoderun ~/.lsfg %command% --flag "two words"',
  );
  assert.equal(removeWrapperLaunchOption(`${wrapper} %command% --arg "${wrapper}"`, wrapper, true), `--arg "${wrapper}"`);
  assert.equal(normalizeLaunchOptions("  FOO=bar   %COMMAND%  --flag "), "FOO=bar %COMMAND% --flag");
  for (const token of ["~/lsfg", "/home/deck/lsfg", "mako-run", "mako-launch"]) {
    assert.equal(cleanupLegacyWrapper(`FOO=bar ${token} %command% --arg "${token}"`), `FOO=bar %command% --arg "${token}"`);
  }
  assert.equal(isLegacyWrapperToken("/home/kurt/lsfg"), true);
  assert.equal(isLegacyWrapperToken("/opt/tools/lsfg"), false);
});

test("removes only managed assignments and preserves unrelated values", () => {
  assert.equal(
    cleanupPluginAssignments(
      'FOO="keep this" ENABLE_GAMESCOPE_WSI=0 DXVK_HDR=0 SteamDeck=0 DISABLE_VKBASALT=1 MESA_LOADER_DRIVER_OVERRIDE=zink DXVK_CONFIG="dxgi.syncInterval = 0; dxvk.maxFrameRate = 30" %command%',
    ),
    'FOO="keep this" DXVK_CONFIG="dxgi.syncInterval = 0" %command%',
  );
  assert.equal(cleanupPluginLaunchOptions(`DXVK_FRAME_RATE=30 ${wrapper} %command%`, wrapper), "%command%");
  assert.equal(
    cleanupPluginAssignments("PROTON_USE_WOW64=1 MANGOHUD=1 MANGOHUD_CONFIG=alpha %command%"),
    "PROTON_USE_WOW64=1 MANGOHUD=1 MANGOHUD_CONFIG=alpha %command%",
  );
});

test("uses launch options for Steam and non-Steam shortcuts without a Target API", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let appOptions = "FOO=bar %command%";
  let shortcutOptions = "--windowed";
  const appWrites: string[] = [];
  const shortcutWrites: string[] = [];
  const unregisters: number[] = [];
  const apps = {
    RegisterForAppDetails(appId: number, callback: (details: SteamAppDetails) => void) {
      callback(appId === 42
        ? { strLaunchOptions: appOptions, strShortcutLaunchOptions: "wrong-field" }
        : { strShortcutLaunchOptions: shortcutOptions, strLaunchOptions: "wrong-field" });
      return { unregister: () => unregisters.push(appId) };
    },
    SetAppLaunchOptions(appId: number, options: string) {
      assert.equal(appId, 42);
      appWrites.push(options);
      appOptions = options.replaceAll(" ", "  ");
    },
    SetShortcutLaunchOptions(appId: number, options: string) {
      assert.equal(appId, 43);
      shortcutWrites.push(options);
      shortcutOptions = options;
    },
  };
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = { Apps: apps };
  try {
    const normal = await readSteamLaunchOptions(42, false);
    assert.equal(normal.options, "FOO=bar %command%");
    const installed = await installWrapperIntegration(42, false, wrapper);
    assert.equal(installed.snapshot.options, `FOO=bar ${wrapper} %command%`.replaceAll(" ", "  "));
    assert.equal(installed.commandTokenAdded, false);
    assert.equal(appWrites.length, 1);

    const shortcut = await installWrapperIntegration(43, true, wrapper);
    assert.equal(shortcut.snapshot.options, `~/.lsfg %command% --windowed`);
    assert.deepEqual(shortcutWrites, [`~/.lsfg %command% --windowed`]);

    const restored = await removeWrapperIntegration(43, true, wrapper, shortcut.commandTokenAdded);
    assert.equal(restored.options, "--windowed");

    const cleaned = await removeWrapperIntegration(42, false, wrapper, installed.commandTokenAdded);
    assert.equal(cleaned.options, "FOO=bar %command%".replaceAll(" ", "  "));
    assert.ok(unregisters.includes(42));
    assert.ok(unregisters.includes(43));
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});

test("AppImage EmuDeck and direct Flatpak shortcuts all stay launch-option based", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  const cases = [
    {
      options: 'DESKTOPINTEGRATION=1 "/home/deck/AppImages/dusk.appimage"',
      expected: 'DESKTOPINTEGRATION=1 ~/.lsfg %command% "/home/deck/AppImages/dusk.appimage"',
    },
    {
      options: "",
      expected: "~/.lsfg %command%",
    },
    {
      options: "run org.example.Game",
      expected: "~/.lsfg %command% run org.example.Game",
    },
  ];
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  try {
    for (const [index, item] of cases.entries()) {
      let shortcutOptions = item.options;
      const shortcutWrites: string[] = [];
      (globalThis as Record<string, unknown>).SteamClient = {
        Apps: {
          RegisterForAppDetails(_appId: number, callback: (details: SteamAppDetails) => void) {
            callback({ strShortcutLaunchOptions: shortcutOptions });
            return { unregister() {} };
          },
          SetShortcutLaunchOptions(_appId: number, options: string) {
            shortcutWrites.push(options);
            shortcutOptions = options;
          },
        },
      };
      const installed = await installWrapperIntegration(100 + index, true, wrapper);
      assert.equal(installed.snapshot.options, item.expected);
      assert.deepEqual(shortcutWrites, [item.expected]);
      const restored = await removeWrapperIntegration(100 + index, true, wrapper, installed.commandTokenAdded);
      assert.equal(restored.options, item.options);
    }
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});

test("launch option write failure rolls back the original value", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let appOptions = "FOO=bar %command%";
  const writes: string[] = [];
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = {
    Apps: {
      RegisterForAppDetails(_appId: number, callback: (details: SteamAppDetails) => void) {
        callback({ strLaunchOptions: appOptions });
        return { unregister() {} };
      },
      SetAppLaunchOptions(_appId: number, options: string) {
        writes.push(options);
        appOptions = options;
        if (options.includes(wrapper)) throw new Error("simulated launch option failure");
      },
    },
  };
  try {
    await assert.rejects(installWrapperIntegration(42, false, wrapper), /simulated launch option failure/);
    assert.equal(appOptions, "FOO=bar %command%");
    assert.deepEqual(writes, [`FOO=bar ${wrapper} %command%`, "FOO=bar %command%"]);
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});
