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
  normalizeShortcutTarget,
  normalizeLaunchOptions,
  readSteamLaunchOptions,
  removeWrapperIntegration,
  removeWrapperLaunchOption,
} from "../src/utils/steamLaunchOptions.ts";

const wrapper = "~/.lsfg";

test("normalizes Steam's split direct Flatpak target representation", () => {
  assert.equal(normalizeShortcutTarget("flatpak", "/usr/bin/"), "/usr/bin/flatpak");
  assert.equal(normalizeShortcutTarget("flatpak", "/usr/bin"), "/usr/bin/flatpak");
  assert.equal(normalizeShortcutTarget("flatpak", "/home/deck/"), "flatpak");
});

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

test("normalizes blank and argument-only fields while refusing ambiguous launchers", () => {
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

test("preserves assignments, quoting, suffixes, and unrelated values", () => {
  const options = 'FOO="hello world" VK_INSTANCE_LAYERS="one:two" gamemoderun %command% --flag "two words"';
  assert.equal(
    installWrapperLaunchOption(options, wrapper).options,
    'FOO="hello world" VK_INSTANCE_LAYERS="one:two" gamemoderun ~/.lsfg %command% --flag "two words"',
  );
  assert.equal(removeWrapperLaunchOption(`${wrapper} %command% --arg "${wrapper}"`, wrapper, true), `--arg "${wrapper}"`);
  assert.equal(normalizeLaunchOptions("  FOO=bar   %COMMAND%  --flag "), "FOO=bar %COMMAND% --flag");
});

test("cleans current, legacy, and bare Mako wrappers without touching suffix arguments", () => {
  for (const token of ["~/lsfg", "/home/deck/lsfg", "mako-run", "mako-launch"]) {
    assert.equal(cleanupLegacyWrapper(`FOO=bar ${token} %command% --arg "${token}"`), `FOO=bar %command% --arg "${token}"`);
  }
  assert.equal(cleanupLegacyWrapper(`FOO=bar ${wrapper} %command%`), "FOO=bar %command%");
  assert.equal(isLegacyWrapperToken("/home/kurt/lsfg"), true);
  assert.equal(isLegacyWrapperToken("/opt/tools/lsfg"), false);
  assert.equal(removeWrapperLaunchOption(`FOO=bar ${wrapper} %command% --arg`, wrapper), "FOO=bar %command% --arg");
});

test("removes only old plugin assignments and preserves DXVK settings", () => {
  assert.equal(
    cleanupPluginAssignments(
      'FOO="keep this" ENABLE_GAMESCOPE_WSI=0 DXVK_HDR=0 SteamDeck=0 DISABLE_VKBASALT=1 MESA_LOADER_DRIVER_OVERRIDE=zink DXVK_CONFIG="dxgi.syncInterval = 0; dxvk.maxFrameRate = 30" %command%',
    ),
    'FOO="keep this" DXVK_CONFIG="dxgi.syncInterval = 0" %command%',
  );
  assert.equal(
    cleanupPluginLaunchOptions(`DXVK_FRAME_RATE=30 ${wrapper} %command%`, wrapper),
    "%command%",
  );
  assert.equal(
    cleanupPluginAssignments("PROTON_USE_WOW64=1 MANGOHUD=1 MANGOHUD_CONFIG=alpha %command%"),
    "PROTON_USE_WOW64=1 MANGOHUD=1 MANGOHUD_CONFIG=alpha %command%",
  );
});

test("reads the matching app-details field and installs/removes Steam integration", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let appOptions = "FOO=bar %command%";
  let shortcutOptions = "--windowed";
  let shortcutTarget = "/usr/bin/flatpak";
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
    assert.equal(shortcutWrites.length, 0);

    const shortcut = await installWrapperIntegration(43, true, wrapper, false, { kind: "flatpak" });
    assert.equal(shortcut.originalExecutable, "/usr/bin/flatpak");
    assert.equal(shortcut.snapshot.target, "~/.lsfg /usr/bin/flatpak");
    assert.equal(shortcut.snapshot.options, "--windowed");
    assert.deepEqual(targetWrites, ["~/.lsfg /usr/bin/flatpak"]);
    const restored = await removeWrapperIntegration(43, true, wrapper, shortcut.originalExecutable, false, { kind: "flatpak" });
    assert.equal(restored.target, "/usr/bin/flatpak");
    assert.deepEqual(targetWrites, ["~/.lsfg /usr/bin/flatpak", "/usr/bin/flatpak"]);
    assert.equal(shortcutWrites.length, 0);

    const cleaned = await removeWrapperIntegration(42, false, wrapper, undefined, installed.commandTokenAdded);
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

test("wraps a split direct Flatpak target while preserving its launch arguments", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let shortcutTarget = "flatpak";
  const shortcutOptions = '"run" "--branch=master" "io.github.banjorecomp.banjorecomp"';
  const targetWrites: string[] = [];
  const apps = {
    RegisterForAppDetails(_appId: number, callback: (details: SteamAppDetails) => void) {
      callback({
        strShortcutExe: shortcutTarget,
        strShortcutStartDir: "/usr/bin/",
        strShortcutLaunchOptions: shortcutOptions,
      });
      return { unregister() {} };
    },
    SetShortcutExe(_appId: number, executable: string) {
      targetWrites.push(executable);
      shortcutTarget = executable;
    },
    SetShortcutLaunchOptions() {},
  };
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = { Apps: apps };
  try {
    const installed = await installWrapperIntegration(46, true, wrapper, false, { kind: "flatpak" });
    assert.equal(installed.originalExecutable, "/usr/bin/flatpak");
    assert.equal(installed.snapshot.target, "~/.lsfg /usr/bin/flatpak");
    assert.equal(installed.snapshot.options, shortcutOptions);
    assert.deepEqual(targetWrites, ["~/.lsfg /usr/bin/flatpak"]);

    const restored = await removeWrapperIntegration(46, true, wrapper, installed.originalExecutable, false, { kind: "flatpak" });
    assert.equal(restored.target, "/usr/bin/flatpak");
    assert.deepEqual(targetWrites, ["~/.lsfg /usr/bin/flatpak", "/usr/bin/flatpak"]);
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});

test("uses shortcut launch options for a host shortcut without changing its Target", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  const originalOptions = 'DESKTOPINTEGRATION=1 "/home/deck/AppImages/dusk.appimage"';
  let shortcutOptions = originalOptions;
  let shortcutTarget = "env";
  const shortcutWrites: string[] = [];
  const targetWrites: string[] = [];
  const apps = {
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
  };
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = { Apps: apps };
  try {
    const installed = await installWrapperIntegration(44, true, wrapper, false, { kind: "host" });
    assert.equal(installed.originalExecutable, undefined);
    assert.equal(installed.snapshot.target, "env");
    assert.equal(installed.snapshot.options, 'DESKTOPINTEGRATION=1 ~/.lsfg %command% "/home/deck/AppImages/dusk.appimage"');
    assert.deepEqual(targetWrites, []);
    assert.deepEqual(shortcutWrites, [installed.snapshot.options]);

    const secondInstall = await installWrapperIntegration(44, true, wrapper, false, { kind: "host" });
    assert.equal(secondInstall.snapshot.options, installed.snapshot.options);
    assert.deepEqual(shortcutWrites, [installed.snapshot.options]);

    const restored = await removeWrapperIntegration(44, true, wrapper, undefined, installed.commandTokenAdded, { kind: "host" });
    assert.equal(restored.target, "env");
    assert.equal(restored.options, originalOptions);
    assert.deepEqual(targetWrites, []);
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});

test("treats an EmuDeck-style shell Target as an opaque host shortcut", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  const originalOptions = "~/Emulators/launch-game.sh --game-id foo";
  let shortcutOptions = originalOptions;
  const targetWrites: string[] = [];
  const apps = {
    RegisterForAppDetails(_appId: number, callback: (details: SteamAppDetails) => void) {
      callback({ strShortcutExe: "/usr/bin/bash", strShortcutLaunchOptions: shortcutOptions });
      return { unregister() {} };
    },
    SetShortcutLaunchOptions(_appId: number, options: string) {
      shortcutOptions = options;
    },
    SetShortcutExe(_appId: number, executable: string) {
      targetWrites.push(executable);
    },
  };
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = { Apps: apps };
  try {
    const installed = await installWrapperIntegration(45, true, wrapper, false, { kind: "host" });
    assert.equal(installed.snapshot.target, "/usr/bin/bash");
    assert.equal(installed.snapshot.options, `${wrapper} %command% ${originalOptions}`);
    assert.deepEqual(targetWrites, []);

    const restored = await removeWrapperIntegration(45, true, wrapper, undefined, installed.commandTokenAdded, { kind: "host" });
    assert.equal(restored.target, "/usr/bin/bash");
    assert.equal(restored.options, originalOptions);
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});

test("fails closed when shortcut Target ownership or setters are unavailable", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = {
    Apps: {
      RegisterForAppDetails(_appId: number, callback: (details: SteamAppDetails) => void) {
        callback({ strShortcutExe: _appId === 99 ? "/usr/bin/flatpak" : "garbage", strShortcutLaunchOptions: "" });
        return { unregister() {} };
      },
    },
  };
  try {
    await assert.rejects(installWrapperIntegration(98, true, wrapper, false, { kind: "flatpak" }), /exactly \/usr\/bin\/flatpak/);
    await assert.rejects(installWrapperIntegration(99, true, wrapper, false, { kind: "flatpak" }), /Target API is unavailable/);
    await assert.rejects(removeWrapperIntegration(99, true, wrapper, "/usr/bin/original", false, { kind: "flatpak" }), /Target changed externally/);
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});

test("restores launch options and shortcut Target when a setter fails after changing them", async () => {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousSteamClient = (globalThis as Record<string, unknown>).SteamClient;
  let appOptions = "FOO=bar %command%";
  let shortcutTarget = "/usr/bin/flatpak";
  const appWrites: string[] = [];
  const targetWrites: string[] = [];
  const apps = {
    RegisterForAppDetails(appId: number, callback: (details: SteamAppDetails) => void) {
      callback(appId === 42
        ? { strLaunchOptions: appOptions }
        : { strShortcutExe: shortcutTarget, strShortcutLaunchOptions: "" });
      return { unregister() {} };
    },
    SetAppLaunchOptions(_appId: number, options: string) {
      appWrites.push(options);
      appOptions = options;
      if (options.includes(wrapper)) throw new Error("simulated launch-option write failure");
    },
    SetShortcutExe(_appId: number, executable: string) {
      targetWrites.push(executable);
      shortcutTarget = executable;
      if (executable === "~/.lsfg /usr/bin/flatpak") throw new Error("simulated Target write failure");
    },
  };
  (globalThis as Record<string, unknown>).window = { setTimeout, clearTimeout };
  (globalThis as Record<string, unknown>).SteamClient = { Apps: apps };
  try {
    await assert.rejects(installWrapperIntegration(42, false, wrapper), /simulated launch-option write failure/);
    assert.equal(appOptions, "FOO=bar %command%");
    assert.deepEqual(appWrites, [`FOO=bar ${wrapper} %command%`, "FOO=bar %command%"]);

    await assert.rejects(installWrapperIntegration(43, true, wrapper, false, { kind: "flatpak" }), /simulated Target write failure/);
    assert.equal(shortcutTarget, "/usr/bin/flatpak");
    assert.deepEqual(targetWrites, ["~/.lsfg /usr/bin/flatpak", "/usr/bin/flatpak"]);
  } finally {
    if (previousWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previousWindow;
    if (previousSteamClient === undefined) delete (globalThis as Record<string, unknown>).SteamClient;
    else (globalThis as Record<string, unknown>).SteamClient = previousSteamClient;
  }
});
