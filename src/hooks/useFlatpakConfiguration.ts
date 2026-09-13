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
import { selectMostRecentRunningFlatpak } from "../utils/nowPlaying";
import { showErrorToast } from "../utils/toastUtils";

type FlatpakOperationResult = {
  success: boolean;
  error?: string | null;
  config?: LsfgConfig | null;
  state?: WorkaroundState | null;
};

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

  const operate = useCallback(async (
    appId: string,
    operation: () => Promise<FlatpakOperationResult>,
    refresh = true,
  ): Promise<FlatpakOperationResult> => {
    if (busyAppId) return { success: false };
    setBusyAppId(appId);
    try {
      const result = await operation();
      if (!result.success) throw new Error(result.error || "Flatpak operation failed");
      if (refresh) {
        await reload();
        await pollRunning();
      }
      return result;
    } catch (error) {
      showErrorToast("Flatpak operation failed", error instanceof Error ? error.message : String(error));
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      setBusyAppId("");
    }
  }, [busyAppId, pollRunning, reload]);

  const enableApp = useCallback(async (appId: string) => (
    await operate(appId, () => enableFlatpakApp(appId))
  ).success, [operate]);
  const removeApp = useCallback(async (appId: string) => (
    await operate(appId, () => removeFlatpakApp(appId))
  ).success, [operate]);
  const enableAll = useCallback(async (): Promise<void> => {
    if (busyAppId) return;
    const available = apps.filter((app) => (
      !app.enabled && !(app.prepared && !app.owned) && !app.error
    ));
    for (const app of available) {
      const result = await operate(app.app_id, () => enableFlatpakApp(app.app_id), false);
      if (!result.success) break;
    }
    await reload();
    await pollRunning();
  }, [apps, busyAppId, operate, pollRunning, reload]);
  const removeAll = useCallback(async (): Promise<void> => {
    if (busyAppId) return;
    for (const app of apps.filter((item) => item.enabled)) {
      const result = await operate(app.app_id, () => removeFlatpakApp(app.app_id), false);
      if (!result.success) break;
    }
    await reload();
    await pollRunning();
  }, [apps, busyAppId, operate, pollRunning, reload]);
  const updateConfig = useCallback(
    async (appId: string, config: LsfgConfig) => {
      const result = await operate(appId, () => updateFlatpakConfig(appId, config), false);
      if (result.success) {
        setApps((current) => current.map((app) => (
          app.app_id === appId ? { ...app, config: result.config || config } : app
        )));
      }
      return result.success;
    },
    [operate],
  );
  const updateWorkarounds = useCallback(
    async (appId: string, state: WorkaroundState) => {
      const result = await operate(appId, () => setFlatpakWorkaroundState(appId, state), false);
      if (result.success) {
        setApps((current) => current.map((app) => (
          app.app_id === appId ? { ...app, workarounds: result.state || state } : app
        )));
      }
      return result.success;
    },
    [operate],
  );

  const runningApp = useMemo(() => selectMostRecentRunningFlatpak(apps, runningApps), [apps, runningApps]);

  return {
    apps,
    runningApps,
    runningApp,
    loading,
    busyAppId,
    reload,
    enableApp,
    enableAll,
    removeApp,
    removeAll,
    updateConfig,
    updateWorkarounds,
  };
}
