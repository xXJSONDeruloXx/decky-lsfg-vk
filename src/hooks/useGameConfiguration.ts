import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuickAccessVisible } from "@decky/api";
import { Router } from "@decky/ui";
import { getGameConfigs, getInstalledGames, getWorkaroundState, removeWorkaroundState, resetGameConfig, resetAllGameConfigs, setWorkaroundState, updateGameConfig, type GameConfigEntry, type GlobalConfig, type InstalledGame, type WorkaroundState } from "../api/lsfgApi";
import { ConfigurationData, getDefaults } from "../config/configSchema";
import { getDefaultWrapperPath, installWrapperIntegration, removeWrapperIntegration } from "../utils/steamLaunchOptions";
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
      return [{
        appid: String(appid >>> 0),
        name,
        nonSteam: true,
      }];
    });
  } catch {
    return [];
  }
}

function mergeInstalledGames(backendGames: InstalledGame[], shortcutGames: InstalledGame[]) {
  const games = new Map(backendGames.map((game) => [game.appid, game]));
  for (const game of shortcutGames) {
    const existing = games.get(game.appid);
    games.set(game.appid, existing ? { ...existing, name: game.name, nonSteam: true } : game);
  }
  return Array.from(games.values());
}

const DEFAULT_WORKAROUND_STATE: WorkaroundState = {
  dxvkFrameRate: 0,
  disableGamescopeWsi: true,
  disableHdr: true,
  disableSteamdeckMode: false,
  disableVkbasalt: false,
  enableZink: false,
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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

  const ensureTargetWorkarounds = useCallback(async (target: GameTarget): Promise<boolean> => {
    if (!installedGames.some((game) => game.appid === target.appid)) return true;
    const appId = Number(target.appid);
    let integration: Awaited<ReturnType<typeof installWrapperIntegration>> | null = null;
    let newState = false;
    let stateWriteAttempted = false;
    let wrapperPath = getDefaultWrapperPath();
    try {
      const existing = await getWorkaroundState(target.appid);
      if (!existing.success) throw new Error(existing.error || "Could not read workaround state");
      wrapperPath = existing.wrapper_path || getDefaultWrapperPath();
      const state = existing.state || { ...DEFAULT_WORKAROUND_STATE };
      const commandTokenAdded = existing.command_token_added === true;
      newState = !existing.state;
      integration = await installWrapperIntegration(
        appId,
        target.nonSteam,
        wrapperPath,
        commandTokenAdded,
      );
      stateWriteAttempted = true;
      const saved = await setWorkaroundState(
        target.appid,
        state,
        integration.commandTokenAdded,
      );
      if (!saved.success) throw new Error(saved.error || "Could not save workaround state");
      return true;
    } catch (error) {
      let rollbackSucceeded = true;
      if (integration?.changed) {
        try {
          await removeWrapperIntegration(
            appId,
            target.nonSteam,
            wrapperPath,
            integration.commandTokenAdded,
          );
        } catch (rollbackError) {
          showErrorToast("Workaround rollback failed", asError(rollbackError).message);
          rollbackSucceeded = false;
        }
      }
      if (rollbackSucceeded && newState && stateWriteAttempted) {
        const restored = await removeWorkaroundState(target.appid);
        if (!restored.success) {
          showErrorToast("Workaround rollback failed", restored.error || "Could not roll back workaround state");
          rollbackSucceeded = false;
        }
      }
      showErrorToast("Could not initialize workarounds", asError(error).message);
      return false;
    }
  }, [installedGames]);

  const removeTargetWorkarounds = useCallback(async (target: GameTarget): Promise<boolean> => {
    if (!installedGames.some((game) => game.appid === target.appid)) return true;
    const appId = Number(target.appid);
    try {
      const existing = await getWorkaroundState(target.appid);
      if (!existing.success) throw new Error(existing.error || "Could not read workaround state");
      const wrapperPath = existing.wrapper_path || getDefaultWrapperPath();
      await removeWrapperIntegration(
        appId,
        target.nonSteam,
        wrapperPath,
        existing.command_token_added === true,
      );
      const removed = await removeWorkaroundState(target.appid);
      if (!removed.success) throw new Error(removed.error || "Could not remove workaround state");
      return true;
    } catch (error) {
      showErrorToast("Could not clean up game workarounds", asError(error).message);
      return false;
    }
  }, [installedGames]);

  const save = useCallback(async (next: ConfigurationData, cleanupLaunchOptions = false) => {
    const selectedTarget = targets.find((target) => target.appid === selectedAppId);
    if (!selectedTarget?.name) return;
    // The profile owns its wrapper integration.  Keep this check on every
    // configuration save so an external edit is detected before the profile
    // is changed; toggles update the sidecar only.
    if (cleanupLaunchOptions && !(await ensureTargetWorkarounds(selectedTarget))) return;
    const result = await updateGameConfig(selectedAppId, selectedTarget.name, next);
    if (result.success) await load();
  }, [ensureTargetWorkarounds, load, selectedAppId, targets]);

  const enable = useCallback(async (appid: string) => {
    const target = targets.find((item) => item.appid === appid);
    if (!target?.name) return false;
    if (!(await ensureTargetWorkarounds(target))) return false;
    const result = await updateGameConfig(appid, target.name, template);
    if (result.success) await load();
    else await removeTargetWorkarounds(target);
    return result.success;
  }, [ensureTargetWorkarounds, load, removeTargetWorkarounds, targets, template]);
  const enableAll = useCallback(async (): Promise<void> => {
    const available = targets.filter((target) => !target.configured && target.name);
    if (available.length === 0) return;

    for (const target of available) {
      if (!(await ensureTargetWorkarounds(target))) return;
      const result = await updateGameConfig(target.appid, target.name, template);
      if (!result.success) {
        await removeTargetWorkarounds(target);
        showErrorToast(
          "Could not enable all games",
          result.error || `Could not create a profile for ${target.name}`,
        );
        return;
      }
    }
    await load();
  }, [ensureTargetWorkarounds, load, removeTargetWorkarounds, targets, template]);
  const repair = useCallback(async (appid: string): Promise<boolean> => {
    const target = targets.find((item) => item.appid === appid);
    if (!target) return false;
    const success = await ensureTargetWorkarounds(target);
    if (success) await load();
    return success;
  }, [ensureTargetWorkarounds, load, targets]);

  const resetSelected = useCallback(async () => {
    if (selectedAppId) {
      const selectedTarget = targets.find((target) => target.appid === selectedAppId);
      if (selectedTarget && !(await removeTargetWorkarounds(selectedTarget))) return;
      const result = await resetGameConfig(selectedAppId);
      if (result.success) {
        setRunningGame((current) => current?.appid === selectedAppId ? { ...current, configured: false } : current);
        setSelectedAppId("");
        await load();
      }
    }
  }, [load, removeTargetWorkarounds, selectedAppId, targets]);
  const resetAll = useCallback(async () => {
    for (const target of targets.filter((item) => item.configured)) {
      if (!(await removeTargetWorkarounds(target))) return;
    }
    const result = await resetAllGameConfigs();
    if (result.success) {
      setRunningGame((current) => current ? { ...current, configured: false } : current);
      setSelectedAppId("");
      await load();
    }
  }, [load, removeTargetWorkarounds, targets]);

  return { config, games, targets, runningGame, selectedAppId, setSelectedAppId, save, enable, enableAll, repair, resetSelected, resetAll, reload: load };
}
