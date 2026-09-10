import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getWorkaroundState,
  removeWorkaroundState,
  setWorkaroundState,
  type WorkaroundState,
} from "../api/lsfgApi";
import {
  getDefaultWrapperPath,
  installWrapperIntegration,
  isWrapperIntegrationInstalled,
  readSteamLaunchOptions,
  removeWrapperIntegration,
  subscribeSteamLaunchOptions,
  type SteamLaunchOptionsSnapshot,
} from "../utils/steamLaunchOptions";
import { showErrorToast } from "../utils/toastUtils";

export type WorkaroundField = keyof WorkaroundState;
export type WorkaroundLoadStatus = "loading" | "ready" | "error";

const SLIDER_DEBOUNCE_MS = 250;

const DEFAULT_WORKAROUND_STATE: WorkaroundState = {
  dxvkFrameRate: 0,
  disableGamescopeWsi: true,
  disableHdr: true,
  disableSteamdeckMode: false,
  disableVkbasalt: false,
  enableZink: false,
};

interface PendingSliderUpdate {
  timer: number;
  value: number;
  waiters: Array<(success: boolean) => void>;
}

export interface WorkaroundSnapshot {
  steam: SteamLaunchOptionsSnapshot;
  state: WorkaroundState;
  wrapperPath: string;
  wrapperOwned: boolean;
  integrationInstalled: boolean;
  commandTokenAdded: boolean;
}

interface PerAppWorkarounds {
  status: WorkaroundLoadStatus;
  snapshot: WorkaroundSnapshot | null;
  refresh: () => Promise<void>;
  update: (field: WorkaroundField, value: boolean | number) => Promise<boolean>;
  error: string | null;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function makeSnapshot(
  steam: SteamLaunchOptionsSnapshot,
  result: Awaited<ReturnType<typeof getWorkaroundState>>,
  nonSteam: boolean,
): WorkaroundSnapshot {
  if (!result.state) throw new Error("Workaround state is not initialized for this profile");
  const wrapperPath = result.wrapper_path || getDefaultWrapperPath();
  return {
    steam,
    state: result.state,
    wrapperPath,
    wrapperOwned: result.wrapper_owned === true,
    integrationInstalled: isWrapperIntegrationInstalled(steam, nonSteam, wrapperPath),
    commandTokenAdded: result.command_token_added === true,
  };
}

async function adoptWorkaroundState(
  appId: string,
  nonSteam: boolean,
  wrapperPath: string,
): Promise<WorkaroundSnapshot> {
  let integration: Awaited<ReturnType<typeof installWrapperIntegration>> | null = null;
  try {
    integration = await installWrapperIntegration(Number(appId), nonSteam, wrapperPath, false);
    const finalized = await setWorkaroundState(
      appId,
      DEFAULT_WORKAROUND_STATE,
      integration.commandTokenAdded,
    );
    if (!finalized.success) throw new Error(finalized.error || "Could not finalize workaround state");
    return makeSnapshot(integration.snapshot, finalized, nonSteam);
  } catch (error) {
    let rollbackSucceeded = true;
    if (integration?.changed) {
      try {
        await removeWrapperIntegration(
          Number(appId),
          nonSteam,
          wrapperPath,
          integration.commandTokenAdded,
        );
      } catch {
        rollbackSucceeded = false;
      }
    }
    if (rollbackSucceeded) {
      const removed = await removeWorkaroundState(appId);
      if (!removed.success) throw new Error(removed.error || "Could not roll back workaround state");
    }
    throw error;
  }
}

export function usePerAppWorkarounds(appId: string, nonSteam: boolean): PerAppWorkarounds {
  const [status, setStatus] = useState<WorkaroundLoadStatus>("loading");
  const [snapshot, setSnapshot] = useState<WorkaroundSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingSliderUpdate = useRef<PendingSliderUpdate | null>(null);
  const numericAppId = Number(appId);

  const loadSnapshot = useCallback(async () => {
    const [result, steam] = await Promise.all([
      getWorkaroundState(appId),
      readSteamLaunchOptions(numericAppId, nonSteam),
    ]);
    if (!result.success) throw new Error(result.error || "Could not read workaround state");
    if (!result.state) {
      return adoptWorkaroundState(
        appId,
        nonSteam,
        result.wrapper_path || getDefaultWrapperPath(),
      );
    }
    return makeSnapshot(steam, result, nonSteam);
  }, [appId, nonSteam, numericAppId]);

  const applySnapshot = useCallback((next: WorkaroundSnapshot) => {
    setSnapshot(next);
    setStatus("ready");
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      applySnapshot(await loadSnapshot());
    } catch (refreshError) {
      const nextError = asError(refreshError);
      setStatus("error");
      setError(nextError.message);
    }
  }, [applySnapshot, loadSnapshot]);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setSnapshot(null);
    setError(null);
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeSteamLaunchOptions(
        numericAppId,
        nonSteam,
        (steam) => {
          if (!active) return;
          setSnapshot((current) => current ? {
            ...current,
            steam,
            integrationInstalled: isWrapperIntegrationInstalled(steam, nonSteam, current.wrapperPath),
          } : current);
        },
        (subscriptionError) => {
          if (!active) return;
          setStatus("error");
          setError(subscriptionError.message);
        },
      );
    } catch (subscriptionError) {
      if (active) {
        setStatus("error");
        setError(asError(subscriptionError).message);
      }
    }
    void loadSnapshot()
      .then((next) => { if (active) applySnapshot(next); })
      .catch((readError) => {
        if (active) {
          setStatus("error");
          setError(asError(readError).message);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySnapshot, loadSnapshot, nonSteam, numericAppId]);

  const persistUpdate = useCallback(async (field: WorkaroundField, value: boolean | number): Promise<boolean> => {
    const current = snapshot;
    if (!current) return false;
    setError(null);
    const nextState = { ...current.state, [field]: value } as WorkaroundState;
    try {
      const result = await setWorkaroundState(
        appId,
        nextState,
        current.commandTokenAdded,
      );
      if (!result.success || !result.state) throw new Error(result.error || "Could not save workaround state");
      applySnapshot({
        ...current,
        state: result.state,
        wrapperPath: result.wrapper_path || current.wrapperPath,
        wrapperOwned: result.wrapper_owned === true,
        commandTokenAdded: result.command_token_added === true,
      });
      return true;
    } catch (updateError) {
      const nextError = asError(updateError);
      setStatus("error");
      setError(nextError.message);
      showErrorToast("Workaround update failed", nextError.message);
      return false;
    }
  }, [appId, applySnapshot, snapshot]);

  const flushSliderUpdate = useCallback(async (): Promise<boolean> => {
    const pending = pendingSliderUpdate.current;
    if (!pending) return true;
    pendingSliderUpdate.current = null;
    clearTimeout(pending.timer);
    const success = await persistUpdate("dxvkFrameRate", pending.value);
    pending.waiters.forEach((resolve) => resolve(success));
    return success;
  }, [persistUpdate]);

  const update = useCallback(async (field: WorkaroundField, value: boolean | number): Promise<boolean> => {
    if (field === "dxvkFrameRate") {
      setError(null);
      return new Promise<boolean>((resolve) => {
        const pending = pendingSliderUpdate.current || { timer: 0, value: 0, waiters: [] };
        window.clearTimeout(pending.timer);
        pending.value = Number(value);
        pending.waiters.push(resolve);
        pending.timer = window.setTimeout(() => { void flushSliderUpdate(); }, SLIDER_DEBOUNCE_MS);
        pendingSliderUpdate.current = pending;
      });
    }
    const sliderSuccess = await flushSliderUpdate();
    if (!sliderSuccess) return false;
    return persistUpdate(field, value);
  }, [flushSliderUpdate, persistUpdate]);

  useEffect(() => () => {
    const pending = pendingSliderUpdate.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingSliderUpdate.current = null;
    pending.waiters.forEach((resolve) => resolve(false));
  }, [numericAppId, nonSteam]);

  return useMemo(() => ({ status, snapshot, refresh, update, error }), [error, refresh, snapshot, status, update]);
}
