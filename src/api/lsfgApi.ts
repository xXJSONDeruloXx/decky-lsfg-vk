import { callable } from "@decky/api";
import { ConfigurationData } from "../config/configSchema";

interface ApiResult {
  success: boolean;
  message?: string;
  error?: string | null;
}

export interface InstallationResult extends ApiResult {
  removed_files?: string[];
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
  | { kind: "flatpak"; flatpakAppId: string };
export type FlatpakTargetSupportStatus = "ready" | "needs-runtime" | "unsupported" | "error";

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
  flatpakSupport?: FlatpakTargetSupport;
}

export interface GlobalConfig {
  dll: string;
  no_fp16: boolean;
}

export interface FlatpakTargetSupport extends ApiResult {
  flatpak_app_id?: string;
  runtime?: string | null;
  runtime_branch?: string | null;
  support_status: FlatpakTargetSupportStatus;
  extension_installed: boolean;
  installed_branches: string[];
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

export interface FlatpakExtensionStatus extends ApiResult {
  message: string;
  available: boolean;
  extension_id: string;
  supported_branches: string[];
  installed_branches: string[];
}

export interface FlatpakExtensionToggleResult extends ApiResult {
  message: string;
  runtime_branch: string;
  enabled: boolean;
  installed: boolean;
}

export const installLsfgVk = callable<[], InstallationResult>("install_lsfg_vk");
export const uninstallLsfgVk = callable<[], InstallationResult>("uninstall_lsfg_vk");
export const checkLsfgVkInstalled = callable<[], InstallationStatus>("check_lsfg_vk_installed");
export const getLosslessScalingBranchStatus = callable<[], SteamBranchStatus>("get_lossless_scaling_branch_status");
export const getConfigFileContent = callable<[], FileContentResult>("get_config_file_content");
export const getFlatpakSupportStatus = callable<[], FlatpakExtensionStatus>("get_flatpak_support_status");
export const ensureFlatpakSupport = callable<[string], FlatpakTargetSupport>("ensure_flatpak_support");
export const repairFlatpakSupport = callable<[string], FlatpakTargetSupport>("repair_flatpak_support");
export const setFlatpakExtensionEnabled = callable<[string, boolean], FlatpakExtensionToggleResult>("set_flatpak_extension_enabled");
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
