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

function compareRunningProcesses(a: RunningFlatpakApp, b: RunningFlatpakApp): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  const startDifference = numericValue(b.start_time) - numericValue(a.start_time);
  if (startDifference !== 0) return startDifference;
  return numericPid(b.pid) - numericPid(a.pid);
}

export function selectMostRecentRunningFlatpak(
  apps: FlatpakApp[],
  runningApps: RunningFlatpakApp[],
): FlatpakApp | null {
  const newestProcessByApp = new Map<string, RunningFlatpakApp>();
  for (const running of runningApps) {
    const current = newestProcessByApp.get(running.app_id);
    if (!current || compareRunningProcesses(running, current) < 0) {
      newestProcessByApp.set(running.app_id, running);
    }
  }

  const candidates = Array.from(newestProcessByApp.values())
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
    const processDifference = compareRunningProcesses(a.running, b.running);
    if (processDifference !== 0) return processDifference;
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
