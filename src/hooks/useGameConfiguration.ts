import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Router } from "@decky/ui";
import { getGameConfigs, getInstalledGames, updateGameConfig, updateLsfgConfig, resetGameConfig, resetAllGameConfigs, type GameConfigEntry, type InstalledGame } from "../api/lsfgApi";
import { ConfigurationData, getDefaults } from "../config/configSchema";

export interface GameTarget extends InstalledGame { configured: boolean; }

export function useGameConfiguration() {
  const [defaultConfig, setDefaultConfig] = useState<ConfigurationData>(getDefaults());
  const [games, setGames] = useState<GameConfigEntry[]>([]);
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [runningGame, setRunningGame] = useState<GameTarget | null>(null);
  const autoSelected = useRef(false);

  const load = useCallback(async () => {
    const [result, installed] = await Promise.all([getGameConfigs(), getInstalledGames()]);
    if (result.success) {
      setDefaultConfig(result.default || getDefaults());
      setGames(result.games || []);
    }
    if (installed.success) setInstalledGames(installed.games || []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const poll = () => {
      const app = Router.MainRunningApp as any;
      if (!app?.appid) return setRunningGame(null);
      const appid = String(app.appid);
      const installed = installedGames.find((game) => game.appid === appid);
      const name = app.display_name || installed?.name;
      if (!name) return setRunningGame(null);
      setRunningGame({
        ...(installed || { appid, name, nonSteam: false }),
        name,
        configured: games.some((game) => game.appid === appid),
      });
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => window.clearInterval(interval);
  }, [games, installedGames]);
  useEffect(() => {
    if (!autoSelected.current && runningGame) {
      autoSelected.current = true;
      setSelectedAppId(runningGame.appid);
    }
  }, [runningGame]);

  const targets = useMemo<GameTarget[]>(() => {
    const configured = installedGames.map((game) => ({ ...game, configured: games.some((item) => item.appid === game.appid) }));
    for (const game of games) if (!configured.some((item) => item.appid === game.appid)) configured.push({ appid: game.appid, name: game.profile, nonSteam: false, configured: true });
    if (runningGame && !configured.some((game) => game.appid === runningGame.appid)) configured.unshift(runningGame);
    return configured;
  }, [games, installedGames, runningGame]);
  const selected = selectedAppId ? games.find((game) => game.appid === selectedAppId)?.config : defaultConfig;
  const config = selected || defaultConfig;

  const save = useCallback(async (next: ConfigurationData) => {
    if (!selectedAppId) {
      const result = await updateLsfgConfig(next);
      if (result.success) setDefaultConfig(next);
      return;
    }
    const selectedTarget = targets.find((target) => target.appid === selectedAppId);
    if (!selectedTarget?.name) return;
    const result = await updateGameConfig(selectedAppId, selectedTarget.name, next);
    if (result.success) await load();
  }, [load, selectedAppId, targets]);

  const resetSelected = useCallback(async () => {
    if (selectedAppId) { await resetGameConfig(selectedAppId); setSelectedAppId(""); await load(); }
  }, [load, selectedAppId]);
  const resetAll = useCallback(async () => { await resetAllGameConfigs(); setSelectedAppId(""); await load(); }, [load]);

  return { config, defaultConfig, games, targets, runningGame, selectedAppId, setSelectedAppId, save, resetSelected, resetAll, reload: load };
}
