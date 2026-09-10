import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuickAccessVisible } from "@decky/api";
import { Router } from "@decky/ui";
import { ensureFlatpakSupport, getGameConfigs, getInstalledGames, getWorkaroundState, removeWorkaroundState, repairFlatpakSupport, resetGameConfig, resetAllGameConfigs, setWorkaroundState, updateGameConfig, type GameConfigEntry, type GlobalConfig, type InstalledGame, type WorkaroundState } from "../api/lsfgApi";
import { ConfigurationData, getDefaults } from "../config/configSchema";
import { cleanupLegacySteamLaunchOptions, getDefaultWrapperPath, hasWrapperLaunchIntegration, installWrapperIntegration, isLegacyWrapperToken, readSteamLaunchOptions, removeWrapperIntegration } from "../utils/steamLaunchOptions";
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
        transport: { kind: "host" },
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

function selectShortcutExecutable(
  target: GameTarget,
  ...candidates: Array<string | null | undefined>
): string | undefined {
  const absolute = candidates
    .map((candidate) => candidate?.trim())
    .find((candidate) => candidate && candidate.startsWith("/"));
  if (absolute) return absolute;
  if (target.transport.kind === "flatpak") return "/usr/bin/flatpak";
  return candidates.map((candidate) => candidate?.trim()).find(Boolean);
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
        ...(installed || { appid, name, nonSteam: false, transport: { kind: "host" } }),
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
    for (const game of games) if (!configured.some((item) => item.appid === game.appid)) configured.push({ appid: game.appid, name: game.profile, nonSteam: false, transport: { kind: "host" }, configured: true });
    if (runningGame && !configured.some((game) => game.appid === runningGame.appid)) configured.unshift(runningGame);
    return configured;
  }, [games, installedGames, runningGame]);
  const template = useMemo(() => ({ ...getDefaults(), ...globalConfig }), [globalConfig]);
  const config = games.find((game) => game.appid === selectedAppId)?.config || template;

  const ensureTargetFlatpakSupport = useCallback(async (target: GameTarget): Promise<boolean> => {
    if (target.transport.kind !== "flatpak") return true;
    const result = await ensureFlatpakSupport(target.transport.flatpakAppId);
    if (!result.success || result.support_status !== "ready") {
      showErrorToast(
        "Flatpak support unavailable",
        result.error || result.message || "The required Flatpak runtime extension is not ready",
      );
      return false;
    }
    return true;
  }, []);

  const ensureTargetWorkarounds = useCallback(async (target: GameTarget): Promise<boolean> => {
    if (!installedGames.some((game) => game.appid === target.appid)) return true;
    const appId = Number(target.appid);
    try {
      const existing = await getWorkaroundState(target.appid);
      if (!existing.success) throw new Error(existing.error || "Could not read workaround state");
      const current = await readSteamLaunchOptions(appId, target.nonSteam);
      const wrapperPath = existing.wrapper_path || getDefaultWrapperPath();
      const oldState = existing.state;
      const oldShortcutExe = existing.shortcut_exe || undefined;
      const oldCommandTokenAdded = existing.command_token_added === true;
      const oldTransport = existing.transport || target.transport;
      const usesShortcutTarget = target.nonSteam && target.transport.kind === "flatpak";
      if (usesShortcutTarget && oldState && current.target === wrapperPath && !oldShortcutExe) {
        throw new Error("Managed shortcut Target has no saved original executable");
      }
      if (usesShortcutTarget && oldState && current.target !== wrapperPath && current.target !== oldShortcutExe) {
        throw new Error("Shortcut Target changed externally; refusing to replace it");
      }
      if (usesShortcutTarget && !oldState && current.target === wrapperPath) {
        throw new Error("Shortcut Target is already the managed wrapper but its original Target is unknown");
      }
      const state = oldState || { ...DEFAULT_WORKAROUND_STATE };
      const originalExecutable = usesShortcutTarget
        ? selectShortcutExecutable(
          target,
          oldShortcutExe,
          target.executable,
          current.target,
        )
        : undefined;
      const initialIntegration = usesShortcutTarget
        ? current.target === wrapperPath
        : hasWrapperLaunchIntegration(current.options, wrapperPath);
      const initialStateResult = await setWorkaroundState(
        target.appid,
        state,
        originalExecutable || null,
        oldCommandTokenAdded,
        target.transport,
      );
      if (!initialStateResult.success) throw new Error(initialStateResult.error || "Could not create workaround state");

      let integration: Awaited<ReturnType<typeof installWrapperIntegration>> | null = null;
      try {
        integration = await installWrapperIntegration(
          appId,
          target.nonSteam,
          wrapperPath,
          oldCommandTokenAdded,
          target.transport.kind,
        );
        const finalStateResult = await setWorkaroundState(
          target.appid,
          state,
          usesShortcutTarget
            ? (selectShortcutExecutable(
              target,
              integration.originalExecutable,
              originalExecutable,
              target.executable,
            ) || null)
            : null,
          integration.commandTokenAdded,
          target.transport,
        );
        if (!finalStateResult.success) throw new Error(finalStateResult.error || "Could not finalize workaround state");
        return true;
      } catch (error) {
        let rollbackSucceeded = true;
        if (!initialIntegration && integration) {
          try {
            await removeWrapperIntegration(
              appId,
              target.nonSteam,
              wrapperPath,
              usesShortcutTarget
                ? (selectShortcutExecutable(
                  target,
                  integration?.originalExecutable,
                  originalExecutable,
                  target.executable,
                ) || undefined)
                : undefined,
              integration?.commandTokenAdded ?? oldCommandTokenAdded,
              target.transport.kind,
            );
          } catch (rollbackError) {
            showErrorToast("Workaround rollback failed", asError(rollbackError).message);
            rollbackSucceeded = false;
          }
        }
        if (rollbackSucceeded) {
          const restored = oldState
            ? await setWorkaroundState(
              target.appid,
              oldState,
              oldShortcutExe || null,
              oldCommandTokenAdded,
              oldTransport,
            )
            : await removeWorkaroundState(target.appid);
          if (!restored.success) throw new Error(restored.error || "Could not roll back workaround state");
        }
        throw error;
      }
    } catch (error) {
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
      const usesShortcutTarget = target.nonSteam && target.transport.kind === "flatpak";
      if (existing.state) {
        await removeWrapperIntegration(
          appId,
          target.nonSteam,
          wrapperPath,
          existing.shortcut_exe || undefined,
          existing.command_token_added === true,
          target.transport.kind,
        );
      } else {
        const current = await readSteamLaunchOptions(appId, target.nonSteam);
        if (usesShortcutTarget && (current.target === wrapperPath || isLegacyWrapperToken(current.target))) {
          throw new Error("Shortcut Target is a frame-generation wrapper but its original Target is unknown");
        }
        await cleanupLegacySteamLaunchOptions(appId, target.nonSteam, wrapperPath);
      }
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
    if (!(await ensureTargetFlatpakSupport(target))) return false;
    if (!(await ensureTargetWorkarounds(target))) return false;
    const result = await updateGameConfig(appid, target.name, template);
    if (result.success) await load();
    else await removeTargetWorkarounds(target);
    return result.success;
  }, [ensureTargetFlatpakSupport, ensureTargetWorkarounds, load, removeTargetWorkarounds, targets, template]);
  const enableAll = useCallback(async (): Promise<void> => {
    const available = targets.filter((target) => !target.configured && target.name);
    if (available.length === 0) return;

    for (const target of available) {
      if (!(await ensureTargetFlatpakSupport(target))) return;
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
  }, [ensureTargetFlatpakSupport, ensureTargetWorkarounds, load, removeTargetWorkarounds, targets, template]);
  const repair = useCallback(async (appid: string): Promise<boolean> => {
    const target = targets.find((item) => item.appid === appid);
    if (!target) return false;
    if (target.transport.kind === "flatpak") {
      const support = await repairFlatpakSupport(target.transport.flatpakAppId);
      if (!support.success || support.support_status !== "ready") {
        showErrorToast(
          "Flatpak support unavailable",
          support.error || support.message || "The required Flatpak runtime extension is not ready",
        );
        return false;
      }
    }
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
