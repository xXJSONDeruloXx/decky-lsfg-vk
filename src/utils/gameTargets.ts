import type { GameConfigEntry, InstalledGame, WorkaroundApp } from "../api/lsfgApi";

export type GameSource = "steam" | "nonSteam" | "unknown";
export type KnownGameSource = Exclude<GameSource, "unknown">;

export interface GameTarget extends InstalledGame {
  configured: boolean;
  source: GameSource;
}

export function sourceFromNonSteam(nonSteam: boolean): KnownGameSource {
  return nonSteam ? "nonSteam" : "steam";
}

export function getTargetSource(
  appid: string,
  installedGames: InstalledGame[],
  workaroundApps: WorkaroundApp[],
): GameSource {
  const workaround = workaroundApps.find((item) => item.appid === appid);
  if (workaround) return sourceFromNonSteam(workaround.non_steam);

  const installed = installedGames.find((game) => game.appid === appid);
  return installed ? sourceFromNonSteam(installed.nonSteam) : "unknown";
}

export function mergeGameTargets(
  configs: GameConfigEntry[],
  installedGames: InstalledGame[],
  workaroundApps: WorkaroundApp[],
  runningGame: GameTarget | null = null,
): GameTarget[] {
  const configuredIds = new Set(configs.map((game) => game.appid));
  const targets = installedGames.map((game) => {
    const source = getTargetSource(game.appid, installedGames, workaroundApps);
    return {
      ...game,
      nonSteam: source === "nonSteam",
      source,
      configured: configuredIds.has(game.appid),
    };
  });

  for (const game of configs) {
    if (targets.some((target) => target.appid === game.appid)) continue;
    const source = getTargetSource(game.appid, installedGames, workaroundApps);
    targets.push({
      appid: game.appid,
      name: game.profile || `App ${game.appid}`,
      nonSteam: source === "nonSteam",
      source,
      configured: true,
    });
  }

  if (
    runningGame
    && !targets.some((target) => target.appid === runningGame.appid)
    && (runningGame.configured || runningGame.source !== "unknown")
  ) {
    targets.unshift(runningGame);
  }

  return targets;
}

export function targetsForSource(targets: GameTarget[], source: KnownGameSource): GameTarget[] {
  return targets.filter((target) => target.source === source || (target.source === "unknown" && target.configured));
}

export function sourceLabel(source: GameSource): string {
  if (source === "nonSteam") return "Non-Steam";
  if (source === "steam") return "Steam";
  return "Unknown source";
}
