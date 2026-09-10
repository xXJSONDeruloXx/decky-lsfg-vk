import { useCallback, useEffect, useMemo, useState } from "react";
import {
  enableFlatpakApp,
  getFlatpakApps,
  getRunningFlatpakApps,
  removeFlatpakApp,
  setFlatpakWorkaroundState,
  updateFlatpakConfig,
  type FlatpakApp,
  type LsfgConfig,
  type RunningFlatpakApp,
  type WorkaroundState,
} from "../api/lsfgApi";
import { showErrorToast } from "../utils/toastUtils";

export function useFlatpakConfiguration(enabled: boolean) {
  const [apps, setApps] = useState<FlatpakApp[]>([]);
  const [runningApps, setRunningApps] = useState<RunningFlatpakApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAppId, setBusyAppId] = useState("");

  const reload = useCallback(async () => {
    if (!enabled) {
      setApps([]);
      return;
    }
    setLoading(true);
    try {
      const result = await getFlatpakApps();
      if (!result.success) throw new Error(result.error || "Could not list Flatpak applications");
      setApps(result.apps || []);
    } catch (error) {
      showErrorToast("Flatpak unavailable", error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const pollRunning = useCallback(async () => {
    if (!enabled) {
      setRunningApps([]);
      return;
    }
    try {
      const result = await getRunningFlatpakApps();
      if (result.success) setRunningApps(result.apps || []);
    } catch {}
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void pollRunning();
    if (!enabled) return;
    const interval = window.setInterval(() => void pollRunning(), 2000);
    return () => window.clearInterval(interval);
  }, [enabled, pollRunning]);

  const operate = useCallback(async (appId: string, operation: () => Promise<{ success: boolean; error?: string | null }>) => {
    if (busyAppId) return false;
    setBusyAppId(appId);
    try {
      const result = await operation();
      if (!result.success) throw new Error(result.error || "Flatpak operation failed");
      await reload();
      await pollRunning();
      return true;
    } catch (error) {
      showErrorToast("Flatpak operation failed", error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusyAppId("");
    }
  }, [busyAppId, pollRunning, reload]);

  const enableApp = useCallback((appId: string) => operate(appId, () => enableFlatpakApp(appId)), [operate]);
  const removeApp = useCallback((appId: string) => operate(appId, () => removeFlatpakApp(appId)), [operate]);
  const updateConfig = useCallback(
    (appId: string, config: LsfgConfig) => operate(appId, () => updateFlatpakConfig(appId, config)),
    [operate],
  );
  const updateWorkarounds = useCallback(
    (appId: string, state: WorkaroundState) => operate(appId, () => setFlatpakWorkaroundState(appId, state)),
    [operate],
  );

  const runningApp = useMemo(() => {
    if (runningApps.length === 0) return null;
    const running = runningApps.find((app) => app.active) || (runningApps.length === 1 ? runningApps[0] : null);
    if (!running) return null;
    return apps.find((app) => app.app_id === running.app_id) || null;
  }, [apps, runningApps]);

  return {
    apps,
    runningApps,
    runningApp,
    loading,
    busyAppId,
    reload,
    enableApp,
    removeApp,
    updateConfig,
    updateWorkarounds,
  };
}
