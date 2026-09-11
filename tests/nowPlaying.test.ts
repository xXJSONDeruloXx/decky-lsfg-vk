import assert from "node:assert/strict";
import test from "node:test";
import { resolveNowPlayingTarget, selectMostRecentRunningFlatpak } from "../src/utils/nowPlaying.ts";

const flatpak = (app_id: string, app_name = app_id) => ({
  app_id,
  app_name,
  runtime_ready: true,
  prepared: true,
  owned: true,
  enabled: true,
  profile: `flatpak:${app_id}`,
  workarounds: {
    dxvkFrameRate: 0,
    disableGamescopeWsi: true,
    disableHdr: true,
    disableSteamdeckMode: false,
    disableVkbasalt: false,
    enableZink: false,
  },
});

const game = (nonSteam = true, configured = true) => ({
  appid: "123456",
  name: nonSteam ? "1080 Snowboarding" : "Native Game",
  nonSteam,
  configured,
});

test("selects the newest active managed Flatpak", () => {
  const apps = [flatpak("org.example.old"), flatpak("org.example.new")];
  const running = [
    { app_id: "org.example.old", active: true, pid: "100", start_time: 500 },
    { app_id: "org.example.new", active: true, pid: "200", start_time: 600 },
  ];

  assert.equal(selectMostRecentRunningFlatpak(apps, running)?.app_id, "org.example.new");
});

test("prefers active Flatpak status before process age", () => {
  const apps = [flatpak("org.example.running"), flatpak("org.example.active")];
  const running = [
    { app_id: "org.example.running", active: false, pid: "900", start_time: 900 },
    { app_id: "org.example.active", active: true, pid: "100", start_time: 100 },
  ];

  assert.equal(selectMostRecentRunningFlatpak(apps, running)?.app_id, "org.example.active");
});

test("deduplicates multiple process rows for one managed Flatpak", () => {
  const apps = [flatpak("com.heroicgameslauncher.hgl")];
  const running = [
    { app_id: "com.heroicgameslauncher.hgl", active: false, pid: "228081", start_time: null },
    { app_id: "com.heroicgameslauncher.hgl", active: false, pid: "228116", start_time: null },
  ];

  assert.equal(selectMostRecentRunningFlatpak(apps, running)?.app_id, "com.heroicgameslauncher.hgl");
});

test("Flatpak runtime wins while a Steam shortcut is running", () => {
  const target = resolveNowPlayingTarget(game(true), flatpak("org.libretro.RetroArch", "RetroArch"));

  assert.equal(target?.kind, "flatpak");
  assert.equal(target?.kind === "flatpak" ? target.launcher?.name : null, "1080 Snowboarding");
});

test("native Steam game wins over an unrelated Flatpak", () => {
  assert.equal(resolveNowPlayingTarget(game(false), flatpak("org.example.Game"))?.kind, "steam");
});

test("unconfigured native Steam game blocks unrelated Flatpak Now Playing", () => {
  assert.equal(resolveNowPlayingTarget(game(false, false), flatpak("org.example.Game")), null);
});

test("direct Flatpak launch creates a Flatpak Now Playing target", () => {
  const target = resolveNowPlayingTarget(null, flatpak("org.example.Game"));

  assert.equal(target?.kind, "flatpak");
  assert.equal(target?.kind === "flatpak" ? target.launcher : null, null);
});

test("multiple inactive Flatpaks do not create an arbitrary Now Playing target", () => {
  const apps = [flatpak("org.example.one"), flatpak("org.example.two")];
  const running = [
    { app_id: "org.example.one", active: false, pid: "100", start_time: 500 },
    { app_id: "org.example.two", active: false, pid: "200", start_time: 600 },
  ];

  assert.equal(selectMostRecentRunningFlatpak(apps, running), null);
});

test("one inactive Flatpak remains a usable fallback", () => {
  const apps = [flatpak("org.example.one")];
  const running = [{ app_id: "org.example.one", active: false, pid: "100", start_time: 500 }];

  assert.equal(selectMostRecentRunningFlatpak(apps, running)?.app_id, "org.example.one");
});

test("configured Steam target remains the fallback", () => {
  const target = resolveNowPlayingTarget(game(false), null);

  assert.equal(target?.kind, "steam");
});

test("unconfigured Steam target has no Now Playing controls", () => {
  assert.equal(resolveNowPlayingTarget(game(false, false), null), null);
});
