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
    .filter((candidate): candidate is { running: RunningFlatpakApp; app: FlatpakApp } => candidate.app !== null);
  const activeCandidates = candidates.filter(({ running }) => running.active);
  const eligibleCandidates = activeCandidates.length > 0
    ? activeCandidates
    : candidates.length === 1
      ? candidates
      : [];

  eligibleCandidates.sort((a, b) => {
    const startDifference = numericValue(b.running.start_time) - numericValue(a.running.start_time);
    if (startDifference !== 0) return startDifference;
    const pidDifference = numericPid(b.running.pid) - numericPid(a.running.pid);
    if (pidDifference !== 0) return pidDifference;
    return a.running.app_id.localeCompare(b.running.app_id);
  });

  return eligibleCandidates[0]?.app || null;
}

export function resolveNowPlayingTarget(
  runningGame: GameTarget | null,
  runningFlatpak: FlatpakApp | null,
): NowPlayingTarget | null {
  if (runningGame && !runningGame.nonSteam) {
    return runningGame.configured ? { kind: "steam", game: runningGame } : null;
  }
  if (runningFlatpak) {
    return { kind: "flatpak", app: runningFlatpak, launcher: runningGame?.nonSteam ? runningGame : null };
  }
  if (runningGame?.configured) return { kind: "steam", game: runningGame };
  return null;
}
