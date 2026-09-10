import { callable } from "@decky/api";
import { ConfigurationData } from "../config/configSchema";

interface ApiResult {
  success: boolean;
  message?: string;
  error?: string | null;
}

export interface FlatpakCleanupResult extends ApiResult {
  removed_branches?: string[];
  preserved_branches?: string[];
  removed_filesystem_grants?: string[];
  preserved_filesystem_grants?: string[];
  ownership_uncertain?: boolean;
}

export interface InstallationResult extends ApiResult {
  removed_files?: string[];
  flatpak_cleanup?: FlatpakCleanupResult;
}

export interface InstallationStatus {
  installed: boolean;
  lossless_scaling_installed: boolean;
  lossless_scaling_status: string;
  error?: string;
}

export interface SteamBranchStatus extends ApiResult {
  message: string;
  installed: boolean;
  manifest_path?: string;
  selected_branch?: string;
  current_branch?: string;
  target_branch: string;
  needs_switch: boolean;
  restart_required: boolean;
}

export type LsfgConfig = ConfigurationData;
export type TargetTransport =
  | { kind: "host" }
  | { kind: "flatpak" };

export interface GameConfigEntry {
  appid: string;
  profile: string;
  config: LsfgConfig;
}

export interface InstalledGame {
  appid: string;
  name: string;
  nonSteam: boolean;
  transport: TargetTransport;
  executable?: string;
  arguments?: string;
  startDir?: string;
}

export interface GlobalConfig {
  dll: string;
  no_fp16: boolean;
}

export interface WorkaroundState {
  dxvkFrameRate: number;
  disableGamescopeWsi: boolean;
  disableHdr: boolean;
  disableSteamdeckMode: boolean;
  disableVkbasalt: boolean;
  enableZink: boolean;
}

export interface WorkaroundStateResult extends ApiResult {
  appid?: string;
  state?: WorkaroundState | null;
  wrapper_path?: string;
  wrapper_owned?: boolean;
  shortcut_exe?: string | null;
  command_token_added?: boolean;
  transport?: TargetTransport | null;
}

export interface GameConfigsResult extends ApiResult {
  global_config?: GlobalConfig;
  games?: GameConfigEntry[];
}

export interface GameConfigResult extends ApiResult {
  appid?: string;
  exists?: boolean;
  config?: LsfgConfig;
}

export interface InstalledGamesResult extends ApiResult {
  games?: InstalledGame[];
}

export interface FileContentResult extends ApiResult {
  content?: string;
  path?: string;
}

export interface DebugFileContent {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  content?: string | null;
  error?: string | null;
}

export interface DebugFileContentsResult extends ApiResult {
  files?: DebugFileContent[];
}

export interface FlatpakExtensionStatus extends ApiResult {
  message: string;
  available: boolean;
  ready: boolean;
  extension_id: string;
  supported_branches: string[];
  installed_branches: string[];
  filesystem_grants: Array<{
    path: string;
    present: boolean;
    read_only: boolean;
  }>;
  missing_filesystem_grants: string[];
  plugin_owned_branches?: string[];
  plugin_owned_filesystems?: string[];
}

export const installLsfgVk = callable<[], InstallationResult>("install_lsfg_vk");
export const uninstallLsfgVk = callable<[], InstallationResult>("uninstall_lsfg_vk");
export const checkLsfgVkInstalled = callable<[], InstallationStatus>("check_lsfg_vk_installed");
export const getLosslessScalingBranchStatus = callable<[], SteamBranchStatus>("get_lossless_scaling_branch_status");
export const getConfigFileContent = callable<[], FileContentResult>("get_config_file_content");
export const getFlatpakSupportStatus = callable<[], FlatpakExtensionStatus>("get_flatpak_support_status");
export const ensureFlatpakSupport = callable<[], FlatpakExtensionStatus>("ensure_flatpak_support");
export const repairFlatpakSupport = callable<[], FlatpakExtensionStatus>("repair_flatpak_support");
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
export const getDebugFileContents = callable<[], DebugFileContentsResult>("get_debug_file_contents");
