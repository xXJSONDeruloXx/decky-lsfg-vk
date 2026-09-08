import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyWorkaroundChange,
  parseWorkaroundOptions,
  readSteamLaunchOptions,
  subscribeSteamLaunchOptions,
  updateSteamLaunchOptions,
  type ParsedWorkaroundOptions,
  type SteamLaunchOptionsSnapshot,
  type WorkaroundField,
} from "../utils/steamLaunchOptions";
import { showErrorToast } from "../utils/toastUtils";

export type WorkaroundLoadStatus = "loading" | "ready" | "error";

const SLIDER_DEBOUNCE_MS = 250;

interface PendingSliderUpdate {
  timer: number;
  value: number;
  waiters: Array<(success: boolean) => void>;
}

interface WorkaroundSnapshot {
  steam: SteamLaunchOptionsSnapshot;
  parsed: ParsedWorkaroundOptions;
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

function makeSnapshot(steam: SteamLaunchOptionsSnapshot): WorkaroundSnapshot {
  return { steam, parsed: parseWorkaroundOptions(steam.options) };
}

export function usePerAppWorkarounds(appId: string, nonSteam: boolean): PerAppWorkarounds {
  const [status, setStatus] = useState<WorkaroundLoadStatus>("loading");
  const [snapshot, setSnapshot] = useState<WorkaroundSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingSliderUpdate = useRef<PendingSliderUpdate | null>(null);
  const numericAppId = Number(appId);

  const applySnapshot = useCallback((steam: SteamLaunchOptionsSnapshot) => {
    setSnapshot(makeSnapshot(steam));
    setStatus("ready");
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      applySnapshot(await readSteamLaunchOptions(numericAppId, nonSteam));
    } catch (refreshError) {
      const nextError = asError(refreshError);
      setStatus("error");
      setError(nextError.message);
    }
  }, [applySnapshot, nonSteam, numericAppId]);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setSnapshot(null);
    setError(null);

    const handleSnapshot = (nextSnapshot: SteamLaunchOptionsSnapshot) => {
      if (!active) return;
      applySnapshot(nextSnapshot);
    };
    const handleSubscriptionError = (subscriptionError: Error) => {
      if (!active) return;
      setStatus("error");
      setError(subscriptionError.message);
    };

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeSteamLaunchOptions(
        numericAppId,
        nonSteam,
        handleSnapshot,
        handleSubscriptionError,
      );
    } catch (subscriptionError) {
      handleSubscriptionError(asError(subscriptionError));
    }

    void readSteamLaunchOptions(numericAppId, nonSteam)
      .then((nextSnapshot) => {
        if (active) applySnapshot(nextSnapshot);
      })
      .catch((readError) => {
        if (active) handleSubscriptionError(asError(readError));
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySnapshot, nonSteam, numericAppId]);

  const persistUpdate = useCallback(async (field: WorkaroundField, value: boolean | number): Promise<boolean> => {
    setError(null);
    try {
      const nextSnapshot = await updateSteamLaunchOptions(
        numericAppId,
        nonSteam,
        (options) => applyWorkaroundChange(options, field, value),
      );
      applySnapshot(nextSnapshot);
      return true;
    } catch (updateError) {
      const nextError = asError(updateError);
      setStatus("error");
      setError(nextError.message);
      showErrorToast("Workaround update failed", nextError.message);
      return false;
    }
  }, [applySnapshot, nonSteam, numericAppId]);

  const flushSliderUpdate = useCallback(async (): Promise<boolean> => {
    const pending = pendingSliderUpdate.current;
    if (!pending) return true;

    pendingSliderUpdate.current = null;
    window.clearTimeout(pending.timer);
    const success = await persistUpdate("dxvkFrameRate", pending.value);
    pending.waiters.forEach((resolve) => resolve(success));
    return success;
  }, [persistUpdate]);

  const update = useCallback(async (field: WorkaroundField, value: boolean | number): Promise<boolean> => {
    if (field === "dxvkFrameRate") {
      setError(null);
      return new Promise<boolean>((resolve) => {
        const pending = pendingSliderUpdate.current ?? { timer: 0, value: 0, waiters: [] };
        window.clearTimeout(pending.timer);
        pending.value = Number(value);
        pending.waiters.push(resolve);
        pending.timer = window.setTimeout(() => {
          void flushSliderUpdate();
        }, SLIDER_DEBOUNCE_MS);
        pendingSliderUpdate.current = pending;
      });
    }

    const sliderSuccess = await flushSliderUpdate();
    if (!sliderSuccess) return false;
    return persistUpdate(field, value);
  }, [flushSliderUpdate, persistUpdate]);

  useEffect(() => {
    return () => {
      const pending = pendingSliderUpdate.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingSliderUpdate.current = null;
      pending.waiters.forEach((resolve) => resolve(false));
    };
  }, [numericAppId, nonSteam]);

  return useMemo(() => ({ status, snapshot, refresh, update, error }), [error, refresh, snapshot, status, update]);
}
