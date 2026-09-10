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

export interface GameConfigEntry {
  appid: string;
  profile: string;
  config: LsfgConfig;
}

export interface InstalledGame {
  appid: string;
  name: string;
  nonSteam: boolean;
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
  app_id?: string;
  state?: WorkaroundState | null;
  wrapper_path?: string;
  wrapper_owned?: boolean;
  command_token_added?: boolean;
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

export interface FlatpakApp {
  app_id: string;
  app_name: string;
  runtime?: string | null;
  runtime_branch?: string | null;
  runtime_ready: boolean;
  prepared: boolean;
  owned: boolean;
  enabled: boolean;
  profile: string;
  config?: LsfgConfig | null;
  workarounds: WorkaroundState;
  error?: string | null;
}

export interface RunningFlatpakApp {
  app_id: string;
  active: boolean;
  pid?: string;
}

export interface FlatpakAppsResult extends ApiResult {
  apps?: FlatpakApp[];
}

export interface RunningFlatpakAppsResult extends ApiResult {
  apps?: RunningFlatpakApp[];
}

export interface FlatpakAppResult extends ApiResult, Partial<FlatpakApp> {
  app_id: string;
}

export const installLsfgVk = callable<[], InstallationResult>("install_lsfg_vk");
export const uninstallLsfgVk = callable<[], InstallationResult>("uninstall_lsfg_vk");
export const checkLsfgVkInstalled = callable<[], InstallationStatus>("check_lsfg_vk_installed");
export const getLosslessScalingBranchStatus = callable<[], SteamBranchStatus>("get_lossless_scaling_branch_status");
export const getConfigFileContent = callable<[], FileContentResult>("get_config_file_content");
export const getFlatpakApps = callable<[], FlatpakAppsResult>("get_flatpak_apps");
export const enableFlatpakApp = callable<[string], FlatpakAppResult>("enable_flatpak_app");
export const updateFlatpakConfig = callable<[string, LsfgConfig], FlatpakAppResult>("update_flatpak_config");
export const setFlatpakWorkaroundState = callable<[string, WorkaroundState], WorkaroundStateResult>("set_flatpak_workaround_state");
export const removeFlatpakApp = callable<[string], FlatpakAppResult>("remove_flatpak_app");
export const getRunningFlatpakApps = callable<[], RunningFlatpakAppsResult>("get_running_flatpak_apps");
export const getGameConfigs = callable<[], GameConfigsResult>("get_game_configs");
export const getInstalledGames = callable<[], InstalledGamesResult>("get_installed_games");
export const updateGameConfig = callable<[string, string, LsfgConfig], GameConfigResult>("update_game_config");
export const resetGameConfig = callable<[string], GameConfigResult>("reset_game_config");
export const resetAllGameConfigs = callable<[], GameConfigsResult>("reset_all_game_configs");
export const getWorkaroundState = callable<[string], WorkaroundStateResult>("get_workaround_state");
export const setWorkaroundState = callable<[
  string,
  WorkaroundState,
  boolean,
], WorkaroundStateResult>("set_workaround_state");
export const removeWorkaroundState = callable<[string], WorkaroundStateResult>("remove_workaround_state");
export const getDebugFileContents = callable<[], DebugFileContentsResult>("get_debug_file_contents");
