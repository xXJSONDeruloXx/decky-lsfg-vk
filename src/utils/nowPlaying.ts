import type { FlatpakApp, RunningFlatpakApp } from "../api/lsfgApi";
import type { GameTarget } from "../hooks/useGameConfiguration";

export type NowPlayingTarget =
  | {
      kind: "flatpak";
      app: FlatpakApp;
      launcher: GameTarget | null;
    }
  | {
      kind: "steam";
      game: GameTarget;
    };

function numericValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function numericPid(value: string | undefined): number {
  return value && /^\d+$/.test(value) ? Number(value) : -1;
}

export function selectMostRecentRunningFlatpak(
  apps: FlatpakApp[],
  runningApps: RunningFlatpakApp[],
): FlatpakApp | null {
  const candidates = runningApps
    .map((running) => ({
      running,
      app: apps.find((app) => app.app_id === running.app_id) || null,
    }))
    .filter((candidate): candidate is { running: RunningFlatpakApp; app: FlatpakApp } => candidate.app !== null)
    .sort((a, b) => {
      if (a.running.active !== b.running.active) return a.running.active ? -1 : 1;
      const startDifference = numericValue(b.running.start_time) - numericValue(a.running.start_time);
      if (startDifference !== 0) return startDifference;
      const pidDifference = numericPid(b.running.pid) - numericPid(a.running.pid);
      if (pidDifference !== 0) return pidDifference;
      return a.running.app_id.localeCompare(b.running.app_id);
    });

  return candidates[0]?.app || null;
}

export function resolveNowPlayingTarget(
  runningGame: GameTarget | null,
  runningFlatpak: FlatpakApp | null,
): NowPlayingTarget | null {
  if (runningFlatpak) {
    return { kind: "flatpak", app: runningFlatpak, launcher: runningGame };
  }
  if (runningGame?.configured) return { kind: "steam", game: runningGame };
  return null;
}
