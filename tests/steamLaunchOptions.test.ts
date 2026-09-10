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

test("normalizes blank and argument-only shortcut fields", () => {
  assert.deepEqual(installWrapperLaunchOption("", wrapper), {
    options: `${wrapper} %command%`,
    commandTokenAdded: true,
  });
  assert.deepEqual(installWrapperLaunchOption("FOO=bar --windowed", wrapper), {
    options: `FOO=bar ${wrapper} %command% --windowed`,
    commandTokenAdded: true,
  });
  assert.throws(() => installWrapperLaunchOption("gamemoderun --windowed", wrapper), /refusing to guess/);
  assert.throws(() => installWrapperLaunchOption('"%command%"', wrapper), /refusing to guess/);
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

test("uses launch options for Steam and MAKO-style Target wrapping for direct Flatpak", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let appOptions = "FOO=bar %command%";
  let shortcutOptions = "--windowed";
  let shortcutTarget = '"flatpak"';
  const appWrites: string[] = [];
  const shortcutWrites: string[] = [];
  const targetWrites: string[] = [];
  const unregisters: number[] = [];
  const apps = {
    RegisterForAppDetails(appId: number, callback: (details: SteamAppDetails) => void) {
      callback(appId === 42
        ? { strLaunchOptions: appOptions, strShortcutLaunchOptions: "wrong-field" }
        : { strShortcutExe: shortcutTarget, strShortcutLaunchOptions: shortcutOptions, strLaunchOptions: "wrong-field" });
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
    SetShortcutExe(appId: number, executable: string) {
      assert.equal(appId, 43);
      targetWrites.push(executable);
      shortcutTarget = executable;
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

    const shortcut = await installWrapperIntegration(43, true, wrapper, false, true);
    assert.equal(shortcut.snapshot.target, '~/.lsfg "/usr/bin/flatpak"');
    assert.deepEqual(targetWrites, ['~/.lsfg "/usr/bin/flatpak"']);
    assert.equal(shortcut.snapshot.options, "--windowed");
    assert.deepEqual(shortcutWrites, []);

    const second = await installWrapperIntegration(43, true, wrapper, false, true);
    assert.equal(second.changed, false);
    assert.deepEqual(targetWrites, ['~/.lsfg "/usr/bin/flatpak"']);

    const restored = await removeWrapperIntegration(43, true, wrapper, false, true);
    assert.equal(restored.target, "/usr/bin/flatpak");
    assert.deepEqual(targetWrites, ['~/.lsfg "/usr/bin/flatpak"', "/usr/bin/flatpak"]);

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

test("AppImage and EmuDeck script shortcuts stay launch-option based", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  const cases = [
    {
      target: "env",
      options: 'DESKTOPINTEGRATION=1 "/home/deck/AppImages/dusk.appimage"',
      expected: 'DESKTOPINTEGRATION=1 ~/.lsfg %command% "/home/deck/AppImages/dusk.appimage"',
    },
    {
      target: '"/home/deck/Emulation/tools/launchers/retroarch.sh" -L core rom.z64',
      options: "",
      expected: "~/.lsfg %command%",
    },
  ];
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  try {
    for (const [index, item] of cases.entries()) {
      let shortcutTarget = item.target;
      let shortcutOptions = item.options;
      const targetWrites: string[] = [];
      const shortcutWrites: string[] = [];
      (globalThis as Record<string, unknown>).SteamClient = {
        Apps: {
          RegisterForAppDetails(_appId: number, callback: (details: SteamAppDetails) => void) {
            callback({ strShortcutExe: shortcutTarget, strShortcutLaunchOptions: shortcutOptions });
            return { unregister() {} };
          },
          SetShortcutLaunchOptions(_appId: number, options: string) {
            shortcutWrites.push(options);
            shortcutOptions = options;
          },
          SetShortcutExe(_appId: number, executable: string) {
            targetWrites.push(executable);
            shortcutTarget = executable;
          },
        },
      };
      const installed = await installWrapperIntegration(100 + index, true, wrapper, false, false);
      assert.equal(installed.snapshot.target, item.target);
      assert.equal(installed.snapshot.options, item.expected);
      assert.deepEqual(targetWrites, []);
      assert.deepEqual(shortcutWrites, [item.expected]);
      const restored = await removeWrapperIntegration(100 + index, true, wrapper, installed.commandTokenAdded, false);
      assert.equal(restored.target, item.target);
      assert.equal(restored.options, item.options);
      assert.deepEqual(targetWrites, []);
    }
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});

test("direct Flatpak fails closed and rolls Target writes back", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let shortcutTarget = "/usr/bin/flatpak";
  const targetWrites: string[] = [];
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = {
    Apps: {
      RegisterForAppDetails(_appId: number, callback: (details: SteamAppDetails) => void) {
        callback({ strShortcutExe: shortcutTarget, strShortcutLaunchOptions: "" });
        return { unregister() {} };
      },
      SetShortcutExe(_appId: number, executable: string) {
        targetWrites.push(executable);
        shortcutTarget = executable;
        if (executable.startsWith(wrapper)) throw new Error("simulated Target write failure");
      },
    },
  };
  try {
    await assert.rejects(installWrapperIntegration(43, true, wrapper, false, true), /simulated Target write failure/);
    assert.equal(shortcutTarget, "/usr/bin/flatpak");
    assert.deepEqual(targetWrites, ['~/.lsfg "/usr/bin/flatpak"', "/usr/bin/flatpak"]);

    shortcutTarget = "garbage";
    await assert.rejects(installWrapperIntegration(43, true, wrapper, false, true), /supported direct Flatpak/);
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});
