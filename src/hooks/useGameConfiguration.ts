import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuickAccessVisible } from "@decky/api";
import { Router } from "@decky/ui";
import { getGameConfigs, getInstalledGames, updateGameConfig, resetGameConfig, resetAllGameConfigs, type GameConfigEntry, type GlobalConfig, type InstalledGame } from "../api/lsfgApi";
import { ConfigurationData, getDefaults } from "../config/configSchema";
import { cleanupSteamLaunchOptions } from "../utils/steamLaunchOptions";
import { showErrorToast } from "../utils/toastUtils";

export interface GameTarget extends InstalledGame { configured: boolean; }

async function getSteamShortcuts(): Promise<InstalledGame[]> {
  const apps = (globalThis as any).SteamClient?.Apps;
  if (typeof apps?.GetAllShortcuts !== "function") return [];

  try {
    const shortcuts = await apps.GetAllShortcuts();
    if (!Array.isArray(shortcuts)) return [];
    return shortcuts.flatMap((shortcut: any) => {
      const appid = Number(shortcut?.appid);
      const name = shortcut?.data?.strAppName;
      if (!Number.isInteger(appid) || appid === 0 || typeof name !== "string" || !name) return [];
      return [{ appid: String(appid >>> 0), name, nonSteam: true }];
    });
  } catch {
    return [];
  }
}

function mergeInstalledGames(backendGames: InstalledGame[], shortcutGames: InstalledGame[]) {
  const games = new Map(backendGames.map((game) => [game.appid, game]));
  for (const game of shortcutGames) games.set(game.appid, game);
  return Array.from(games.values());
}

export function useGameConfiguration() {
  const [games, setGames] = useState<GameConfigEntry[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({ dll: "", no_fp16: false });
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [runningGame, setRunningGame] = useState<GameTarget | null>(null);
  const previousRunningAppId = useRef<string | null>(null);
  const previousQuickAccessVisible = useRef<boolean | null>(null);
  const quickAccessVisible = useQuickAccessVisible();

  const load = useCallback(async () => {
    const [result, installed, shortcuts] = await Promise.all([getGameConfigs(), getInstalledGames(), getSteamShortcuts()]);
    if (result.success) {
      setGlobalConfig(result.global_config || { dll: "", no_fp16: false });
      setGames(result.games || []);
    }
    setInstalledGames(mergeInstalledGames(installed.success ? installed.games || [] : [], shortcuts));
    setConfigsLoaded(true);
  }, []);

  useEffect(() => {
    const initialLoad = previousQuickAccessVisible.current === null;
    const becameVisible = quickAccessVisible && previousQuickAccessVisible.current === false;
    previousQuickAccessVisible.current = quickAccessVisible;
    if (initialLoad || becameVisible) void load();
  }, [load, quickAccessVisible]);
  useEffect(() => {
    const poll = () => {
      if (!configsLoaded) return;
      const app = Router.MainRunningApp as any;
      if (!app?.appid) return setRunningGame(null);
      const appid = String(app.appid);
      const installed = installedGames.find((game) => game.appid === appid);
      const name = app.display_name || installed?.name;
      if (!name) return setRunningGame(null);
      setRunningGame((current) => current?.appid === appid ? current : {
        ...(installed || { appid, name, nonSteam: false }),
        name,
        configured: games.some((game) => game.appid === appid),
      });
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => window.clearInterval(interval);
  }, [configsLoaded, games, installedGames]);
  useEffect(() => {
    const appid = runningGame?.appid || null;
    if (appid !== previousRunningAppId.current) {
      previousRunningAppId.current = appid;
      setSelectedAppId(appid || "");
    }
  }, [runningGame?.appid]);

  const targets = useMemo<GameTarget[]>(() => {
    const configured = installedGames.map((game) => ({ ...game, configured: games.some((item) => item.appid === game.appid) }));
    for (const game of games) if (!configured.some((item) => item.appid === game.appid)) configured.push({ appid: game.appid, name: game.profile, nonSteam: false, configured: true });
    if (runningGame && !configured.some((game) => game.appid === runningGame.appid)) configured.unshift(runningGame);
    return configured;
  }, [games, installedGames, runningGame]);
  const template = useMemo(() => ({ ...getDefaults(), ...globalConfig }), [globalConfig]);
  const config = games.find((game) => game.appid === selectedAppId)?.config || template;

  const cleanupTargetLaunchOptions = useCallback(async (target: GameTarget): Promise<boolean> => {
    if (!installedGames.some((game) => game.appid === target.appid)) return true;
    try {
      await cleanupSteamLaunchOptions(Number(target.appid), target.nonSteam);
      return true;
    } catch (error) {
      showErrorToast("Could not update Steam launch options", error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [installedGames]);

  const save = useCallback(async (next: ConfigurationData, cleanupLaunchOptions = false) => {
    const selectedTarget = targets.find((target) => target.appid === selectedAppId);
    if (!selectedTarget?.name) return;
    if (cleanupLaunchOptions && !(await cleanupTargetLaunchOptions(selectedTarget))) return;
    const result = await updateGameConfig(selectedAppId, selectedTarget.name, next);
    if (result.success) await load();
  }, [cleanupTargetLaunchOptions, load, selectedAppId, targets]);

  const enable = useCallback(async (appid: string) => {
    const target = targets.find((item) => item.appid === appid);
    if (!target?.name) return false;
    if (!(await cleanupTargetLaunchOptions(target))) return false;
    const result = await updateGameConfig(appid, target.name, template);
    if (result.success) await load();
    return result.success;
  }, [cleanupTargetLaunchOptions, load, targets, template]);
  const enableAll = useCallback(async (): Promise<void> => {
    const available = targets.filter((target) => !target.configured && target.name);
    if (available.length === 0) return;
    for (const target of available) {
      if (!(await cleanupTargetLaunchOptions(target))) return;
      const result = await updateGameConfig(target.appid, target.name, template);
      if (!result.success) {
        showErrorToast("Could not enable all games", result.error || "A game profile could not be created");
        return;
      }
    }
    await load();
  }, [cleanupTargetLaunchOptions, load, targets, template]);

  const resetSelected = useCallback(async () => {
    if (selectedAppId) {
      const selectedTarget = targets.find((target) => target.appid === selectedAppId);
      if (selectedTarget && !(await cleanupTargetLaunchOptions(selectedTarget))) return;
      const result = await resetGameConfig(selectedAppId);
      if (result.success) {
        setRunningGame((current) => current?.appid === selectedAppId ? { ...current, configured: false } : current);
        setSelectedAppId("");
        await load();
      }
    }
  }, [cleanupTargetLaunchOptions, load, selectedAppId, targets]);
  const resetAll = useCallback(async () => {
    for (const target of targets.filter((item) => item.configured)) {
      if (!(await cleanupTargetLaunchOptions(target))) return;
    }
    const result = await resetAllGameConfigs();
    if (result.success) {
      setRunningGame((current) => current ? { ...current, configured: false } : current);
      setSelectedAppId("");
      await load();
    }
  }, [cleanupTargetLaunchOptions, load, targets]);

  return { config, games, targets, runningGame, selectedAppId, setSelectedAppId, save, enable, enableAll, resetSelected, resetAll, reload: load };
}
