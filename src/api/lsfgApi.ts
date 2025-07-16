import { callable } from "@decky/api";

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

export interface LsfgConfig {
  enable_lsfg: boolean;
  multiplier: number;
  flow_scale: number;
  hdr: boolean;
  perf_mode: boolean;
  immediate_mode: boolean;
  disable_vkbasalt: boolean;
}

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

// API functions
export const installLsfgVk = callable<[], InstallationResult>("install_lsfg_vk");
export const uninstallLsfgVk = callable<[], InstallationResult>("uninstall_lsfg_vk");
export const checkLsfgVkInstalled = callable<[], InstallationStatus>("check_lsfg_vk_installed");
export const checkLosslessScalingDll = callable<[], DllDetectionResult>("check_lossless_scaling_dll");
export const getLsfgConfig = callable<[], ConfigResult>("get_lsfg_config");
export const updateLsfgConfig = callable<
  [boolean, number, number, boolean, boolean, boolean, boolean],
  ConfigUpdateResult
>("update_lsfg_config");
