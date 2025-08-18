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
  profiles?: string[];
  current_profile?: string;
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

export interface FileContentResult {
  success: boolean;
  content?: string;
  path?: string;
  error?: string;
}

// Profile management interfaces
export interface ProfilesResult {
  success: boolean;
  profiles?: string[];
  current_profile?: string;
  message?: string;
  error?: string;
}

export interface ProfileResult {
  success: boolean;
  profile_name?: string;
  message?: string;
  error?: string;
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
export const getConfigFileContent = callable<[], FileContentResult>("get_config_file_content");
export const getLaunchScriptContent = callable<[], FileContentResult>("get_launch_script_content");

// Updated config function using object-based configuration (single source of truth)
export const updateLsfgConfig = callable<
  [ConfigurationData],
  ConfigUpdateResult
>("update_lsfg_config");

// Legacy helper function for backward compatibility
export const updateLsfgConfigFromObject = async (config: ConfigurationData): Promise<ConfigUpdateResult> => {
  return updateLsfgConfig(config);
};

// Self-updater API functions
export const checkForPluginUpdate = callable<[], UpdateCheckResult>("check_for_plugin_update");
export const downloadPluginUpdate = callable<[string], UpdateDownloadResult>("download_plugin_update");

// Profile management API functions
export const getProfiles = callable<[], ProfilesResult>("get_profiles");
export const createProfile = callable<[string, string?], ProfileResult>("create_profile");
export const deleteProfile = callable<[string], ProfileResult>("delete_profile");
export const renameProfile = callable<[string, string], ProfileResult>("rename_profile");
export const setCurrentProfile = callable<[string], ProfileResult>("set_current_profile");
export const updateProfileConfig = callable<[string, ConfigurationData], ConfigUpdateResult>("update_profile_config");
