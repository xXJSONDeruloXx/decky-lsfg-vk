import { callable } from "@decky/api";
import { ConfigurationData } from "../config/configSchema";

// Type definitions for API responses
export interface InstallationResult {
  success: boolean;
  error?: string;
  message?: string;
  removed_files?: string[];
}

export interface InstallationStatus {
  installed: boolean;
  lossless_scaling_installed: boolean;
  lossless_scaling_status: string;
  error?: string;
}

export interface SteamBranchStatus {
  success: boolean;
  message: string;
  error?: string;
  installed: boolean;
  manifest_path?: string;
  selected_branch?: string;
  current_branch?: string;
  target_branch: string;
  needs_switch: boolean;
  restart_required: boolean;
}

// Use centralized configuration data type
export type LsfgConfig = ConfigurationData;

export interface ConfigUpdateResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface GameConfigEntry {
  appid: string;
  profile: string;
  config: LsfgConfig;
}
export type TargetTransport =
  | { kind: "host" }
  | { kind: "flatpak"; flatpakAppId: string };

export type FlatpakTargetSupportStatus = "ready" | "needs-runtime" | "unsupported" | "error";

export interface FlatpakTargetSupport {
  success: boolean;
  message?: string;
  error?: string | null;
  flatpak_app_id?: string;
  runtime?: string | null;
  runtime_branch?: string | null;
  support_status: FlatpakTargetSupportStatus;
  extension_installed: boolean;
  installed_branches: string[];
}

export interface InstalledGame {
  appid: string;
  name: string;
  nonSteam: boolean;
  transport: TargetTransport;
  executable?: string;
  arguments?: string;
  startDir?: string;
  flatpakSupport?: FlatpakTargetSupport;
}
export interface InstalledGamesResult { success: boolean; games?: InstalledGame[]; error?: string; }
export interface GlobalConfig { dll: string; no_fp16: boolean; }

export interface GameConfigsResult {
  success: boolean;
  global_config?: GlobalConfig;
  games?: GameConfigEntry[];
  error?: string;
}

export interface GameConfigResult extends ConfigUpdateResult {
  appid?: string;
  exists?: boolean;
  config?: LsfgConfig;
}

export interface WorkaroundState {
  dxvkFrameRate: number;
  disableGamescopeWsi: boolean;
  disableHdr: boolean;
  disableSteamdeckMode: boolean;
  disableVkbasalt: boolean;
  enableZink: boolean;
}

export interface WorkaroundStateResult {
  success: boolean;
  message?: string;
  error?: string;
  appid?: string;
  state?: WorkaroundState | null;
  wrapper_path?: string;
  wrapper_owned?: boolean;
  shortcut_exe?: string | null;
  command_token_added?: boolean;
  transport?: TargetTransport | null;
}

export interface FileContentResult {
  success: boolean;
  content?: string;
  path?: string;
  error?: string;
}

export interface FlatpakExtensionStatus {
  success: boolean;
  message: string;
  error?: string | null;
  available: boolean;
  extension_id: string;
  supported_branches: string[];
  installed_branches: string[];
  owned_branches: string[];
  ownership_uncertain: boolean;
}

export interface FlatpakCleanupResult {
  success: boolean;
  message: string;
  error?: string | null;
  removed_branches: string[];
  preserved_branches: string[];
  ownership_uncertain: boolean;
}

// API functions
export const installLsfgVk = callable<[], InstallationResult>("install_lsfg_vk");
export const uninstallLsfgVk = callable<[], InstallationResult>("uninstall_lsfg_vk");
export const checkLsfgVkInstalled = callable<[], InstallationStatus>("check_lsfg_vk_installed");
export const getLosslessScalingBranchStatus = callable<[], SteamBranchStatus>("get_lossless_scaling_branch_status");
export const getConfigFileContent = callable<[], FileContentResult>("get_config_file_content");

export const getFlatpakSupportStatus = callable<[], FlatpakExtensionStatus>("get_flatpak_support_status");
export const ensureFlatpakSupport = callable<[string], FlatpakTargetSupport>("ensure_flatpak_support");
export const repairFlatpakSupport = callable<[string], FlatpakTargetSupport>("repair_flatpak_support");
export const removePluginOwnedFlatpakExtensions = callable<
  [],
  FlatpakCleanupResult
>("remove_plugin_owned_flatpak_extensions");

export const getGameConfigs = callable<[], GameConfigsResult>("get_game_configs");
export const getInstalledGames = callable<[], InstalledGamesResult>("get_installed_games");
export const updateGameConfig = callable<[string, string, LsfgConfig], GameConfigResult>("update_game_config");
export const resetGameConfig = callable<[string], GameConfigResult>("reset_game_config");
export const resetAllGameConfigs = callable<[], GameConfigsResult>("reset_all_game_configs");
export const getWorkaroundState = callable<[string], WorkaroundStateResult>("get_workaround_state");
export const setWorkaroundState = callable<[
  string,
  WorkaroundState,
  string | null | undefined,
  boolean,
  TargetTransport | null | undefined,
], WorkaroundStateResult>("set_workaround_state");
export const removeWorkaroundState = callable<[string], WorkaroundStateResult>("remove_workaround_state");
