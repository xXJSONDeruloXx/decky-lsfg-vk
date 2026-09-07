import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Router } from "@decky/ui";
import { getGameConfigs, getInstalledGames, updateGameConfig, resetGameConfig, resetAllGameConfigs, type GameConfigEntry, type GlobalConfig, type InstalledGame } from "../api/lsfgApi";
import { ConfigurationData, getDefaults } from "../config/configSchema";

export interface GameTarget extends InstalledGame { configured: boolean; }

export function useGameConfiguration() {
  const [games, setGames] = useState<GameConfigEntry[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({ dll: "", no_fp16: false });
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [runningGame, setRunningGame] = useState<GameTarget | null>(null);
  const previousRunningAppId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [result, installed] = await Promise.all([getGameConfigs(), getInstalledGames()]);
    if (result.success) {
      setGlobalConfig(result.global_config || { dll: "", no_fp16: false });
      setGames(result.games || []);
    }
    if (installed.success) setInstalledGames(installed.games || []);
    setConfigsLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);
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

  const save = useCallback(async (next: ConfigurationData) => {
    const selectedTarget = targets.find((target) => target.appid === selectedAppId);
    if (!selectedTarget?.name) return;
    const result = await updateGameConfig(selectedAppId, selectedTarget.name, next);
    if (result.success) await load();
  }, [load, selectedAppId, targets]);

  const enable = useCallback(async (appid: string) => {
    const target = targets.find((item) => item.appid === appid);
    if (!target?.name) return false;
    const result = await updateGameConfig(appid, target.name, template);
    if (result.success) await load();
    return result.success;
  }, [load, targets, template]);

  const resetSelected = useCallback(async () => {
    if (selectedAppId) {
      const result = await resetGameConfig(selectedAppId);
      if (result.success) {
        setRunningGame((current) => current?.appid === selectedAppId ? { ...current, configured: false } : current);
        setSelectedAppId("");
        await load();
      }
    }
  }, [load, selectedAppId]);
  const resetAll = useCallback(async () => {
    const result = await resetAllGameConfigs();
    if (result.success) {
      setRunningGame((current) => current ? { ...current, configured: false } : current);
      setSelectedAppId("");
      await load();
    }
  }, [load]);

  return { config, games, targets, runningGame, selectedAppId, setSelectedAppId, save, enable, resetSelected, resetAll, reload: load };
}
