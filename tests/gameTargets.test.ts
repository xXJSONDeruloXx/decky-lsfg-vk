import assert from "node:assert/strict";
import test from "node:test";
import { getTargetSource, mergeGameTargets, targetsForSource } from "../src/utils/gameTargets.ts";

const config = (appid: string, profile: string) => ({ appid, profile, config: {} });

test("workaround sidecar source wins over current discovery metadata", () => {
  const installed = [{ appid: "123", name: "Shortcut", nonSteam: false }];
  const workarounds = [{ appid: "123", non_steam: true, command_token_added: true }];

  assert.equal(getTargetSource("123", installed, workarounds), "nonSteam");
  assert.equal(mergeGameTargets([config("123", "Shortcut")], installed, workarounds)[0].source, "nonSteam");
});

test("configured profiles without reliable source are unknown", () => {
  const targets = mergeGameTargets([config("456", "Missing Game")], [], []);

  assert.deepEqual(targets[0], {
    appid: "456",
    name: "Missing Game",
    nonSteam: false,
    source: "unknown",
    configured: true,
  });
});

test("unknown configured profiles are visible in both source tabs", () => {
  const targets = mergeGameTargets([
    config("123", "Steam Game"),
    config("456", "Missing Game"),
  ], [
    { appid: "123", name: "Steam Game", nonSteam: false },
    { appid: "789", name: "Shortcut", nonSteam: true },
  ], []);

  const steamTargets = targetsForSource(targets, "steam");
  const nonSteamTargets = targetsForSource(targets, "nonSteam");

  assert.deepEqual(steamTargets.map((target) => target.appid).sort(), ["123", "456"]);
  assert.deepEqual(nonSteamTargets.map((target) => target.appid).sort(), ["456", "789"]);
});

test("direct Flatpak shortcuts remain non-Steam targets", () => {
  const targets = mergeGameTargets([], [
    { appid: "123", name: "Flatpak shortcut", nonSteam: true, isFlatpakShortcut: true },
  ], []);

  assert.equal(targets[0].source, "nonSteam");
  assert.equal(targets[0].isFlatpakShortcut, true);
});
