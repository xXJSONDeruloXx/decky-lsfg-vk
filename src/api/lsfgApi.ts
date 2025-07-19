import { callable } from "@decky/api";
import { ConfigurationData, ConfigurationManager } from "../config/configSchema";

// Type definitions for API responses
export interface InstallationResult {
  success: boolean;
  error?: string;
  message?: string;
  removed_files?: string[];
}

export interface InstallationStatus {
  installed: boolean;
  lib_exists: boolean;
  json_exists: boolean;
  script_exists: boolean;
  lib_path: string;
  json_path: string;
  script_path: string;
  error?: string;
}

export interface DllDetectionResult {
  detected: boolean;
  path?: string;
  source?: string;
  message?: string;
  error?: string;
}

export interface DllStatsResult {
  success: boolean;
  dll_path?: string;
  dll_sha256?: string;
  dll_source?: string;
  error?: string;
}

// Use centralized configuration data type
export type LsfgConfig = ConfigurationData;

export interface ConfigResult {
  success: boolean;
  config?: LsfgConfig;
  error?: string;
}

export interface ConfigUpdateResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ConfigSchemaResult {
  field_names: string[];
  field_types: Record<string, string>;
  defaults: ConfigurationData;
}

export interface UpdateCheckResult {
  success: boolean;
  update_available: boolean;
  current_version: string;
  latest_version: string;
  release_notes: string;
  release_date: string;
  download_url: string;
  error?: string;
}

export interface UpdateDownloadResult {
  success: boolean;
  download_path?: string;
  error?: string;
}

export interface LaunchOptionResult {
  launch_option: string;
  instructions: string;
  explanation: string;
}

// API functions
export const installLsfgVk = callable<[], InstallationResult>("install_lsfg_vk");
export const uninstallLsfgVk = callable<[], InstallationResult>("uninstall_lsfg_vk");
export const checkLsfgVkInstalled = callable<[], InstallationStatus>("check_lsfg_vk_installed");
export const checkLosslessScalingDll = callable<[], DllDetectionResult>("check_lossless_scaling_dll");
export const getDllStats = callable<[], DllStatsResult>("get_dll_stats");
export const getLsfgConfig = callable<[], ConfigResult>("get_lsfg_config");
export const getConfigSchema = callable<[], ConfigSchemaResult>("get_config_schema");
export const getLaunchOption = callable<[], LaunchOptionResult>("get_launch_option");

// Updated config function using centralized configuration
export const updateLsfgConfig = callable<
  [string, number, number, boolean, boolean, string, number, boolean, boolean],
  ConfigUpdateResult
>("update_lsfg_config");

// Helper function to create config update from configuration object
export const updateLsfgConfigFromObject = async (config: ConfigurationData): Promise<ConfigUpdateResult> => {
  const args = ConfigurationManager.createArgsFromConfig(config);
  return updateLsfgConfig(...args as [string, number, number, boolean, boolean, string, number, boolean, boolean]);
};

// Self-updater API functions
export const checkForPluginUpdate = callable<[], UpdateCheckResult>("check_for_plugin_update");
export const downloadPluginUpdate = callable<[string], UpdateDownloadResult>("download_plugin_update");
