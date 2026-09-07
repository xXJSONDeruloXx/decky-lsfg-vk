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
export interface InstalledGame { appid: string; name: string; nonSteam: boolean; }
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

export interface FileContentResult {
  success: boolean;
  content?: string;
  path?: string;
  error?: string;
}

// Flatpak management interfaces
export interface FlatpakExtensionStatus {
  success: boolean;
  message: string;
  error?: string;
  installed_23_08: boolean;
  installed_24_08: boolean;
  installed_25_08: boolean;
}

export interface FlatpakApp {
  app_id: string;
  app_name: string;
  has_filesystem_override: boolean;
  has_env_override: boolean;
}

export interface FlatpakAppInfo {
  success: boolean;
  message: string;
  error?: string;
  apps: FlatpakApp[];
  total_apps: number;
}

export interface FlatpakOperationResult {
  success: boolean;
  message: string;
  error?: string;
  app_id?: string;
  operation?: string;
}

// API functions
export const installLsfgVk = callable<[], InstallationResult>("install_lsfg_vk");
export const uninstallLsfgVk = callable<[], InstallationResult>("uninstall_lsfg_vk");
export const checkLsfgVkInstalled = callable<[], InstallationStatus>("check_lsfg_vk_installed");
export const getLosslessScalingBranchStatus = callable<[], SteamBranchStatus>("get_lossless_scaling_branch_status");
export const getConfigFileContent = callable<[], FileContentResult>("get_config_file_content");

// Flatpak management API functions
export const checkFlatpakExtensionStatus = callable<[], FlatpakExtensionStatus>("check_flatpak_extension_status");
export const installFlatpakExtension = callable<[string], FlatpakOperationResult>("install_flatpak_extension");
export const uninstallFlatpakExtension = callable<[string], FlatpakOperationResult>("uninstall_flatpak_extension");
export const getFlatpakApps = callable<[], FlatpakAppInfo>("get_flatpak_apps");
export const setFlatpakAppOverride = callable<[string], FlatpakOperationResult>("set_flatpak_app_override");
export const removeFlatpakAppOverride = callable<[string], FlatpakOperationResult>("remove_flatpak_app_override");

export const getGameConfigs = callable<[], GameConfigsResult>("get_game_configs");
export const getInstalledGames = callable<[], InstalledGamesResult>("get_installed_games");
export const updateGameConfig = callable<[string, string, LsfgConfig], GameConfigResult>("update_game_config");
export const resetGameConfig = callable<[string], GameConfigResult>("reset_game_config");
export const resetAllGameConfigs = callable<[], GameConfigsResult>("reset_all_game_configs");
