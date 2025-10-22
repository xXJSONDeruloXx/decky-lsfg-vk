/**
 * Configuration schema and management for LSFG VK plugin
 * 
 * This file re-exports auto-generated configuration constants from generatedConfigSchema.ts
 * and provides the ConfigurationManager class for handling configuration operations.
 */

import { callable } from "@decky/api";
import type { ConfigurationData } from './generatedConfigSchema';
import { getDefaults } from './generatedConfigSchema';
import { updateLsfgConfig } from "../api/lsfgApi";

export {
  ConfigFieldType,
  ConfigField,
  CONFIG_SCHEMA,
  ConfigurationData,
  getFieldNames,
  getDefaults,
  getFieldTypes,
  DLL, NO_FP16, MULTIPLIER, FLOW_SCALE, PERFORMANCE_MODE, HDR_MODE,
  EXPERIMENTAL_PRESENT_MODE, DXVK_FRAME_RATE, ENABLE_WOW64,
  DISABLE_STEAMDECK_MODE, MANGOHUD_WORKAROUND, DISABLE_VKBASALT,
  FORCE_ENABLE_VKBASALT, ENABLE_WSI, ENABLE_ZINK
} from './generatedConfigSchema';

/**
 * Configuration management class
 * Handles CRUD operations for plugin configuration
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private _config: ConfigurationData | null = null;

  private getConfiguration = callable<[], { success: boolean; data?: ConfigurationData; error?: string }>("get_configuration");
  private resetConfiguration = callable<[], { success: boolean; data?: ConfigurationData; error?: string }>("reset_configuration");

  private constructor() {}

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get default configuration values
   */
  static getDefaults(): ConfigurationData {
    return getDefaults();
  }

  /**
   * Load configuration from backend
   */
  async loadConfig(): Promise<ConfigurationData> {
    try {
      const result = await this.getConfiguration();
      if (result.success && result.data) {
        this._config = result.data;
        return this._config;
      } else {
        throw new Error(result.error || 'Failed to load configuration');
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      throw error;
    }
  }

  /**
   * Save configuration to backend
   */
  async saveConfig(config: ConfigurationData): Promise<void> {
    try {
      const result = await updateLsfgConfig(config);
      if (result.success) {
        this._config = config;
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      throw error;
    }
  }

  /**
   * Update a single configuration field
   */
  async updateField(fieldName: keyof ConfigurationData, value: any): Promise<void> {
    if (!this._config) {
      await this.loadConfig();
    }
    
    const updatedConfig = {
      ...this._config!,
      [fieldName]: value
    };
    
    await this.saveConfig(updatedConfig);
  }

  /**
   * Get current configuration (cached)
   */
  getConfig(): ConfigurationData | null {
    return this._config;
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults(): Promise<ConfigurationData> {
    try {
      const result = await this.resetConfiguration();
      if (result.success && result.data) {
        this._config = result.data;
        return this._config;
      } else {
        throw new Error(result.error || 'Failed to reset configuration');
      }
    } catch (error) {
      console.error('Error resetting configuration:', error);
      throw error;
    }
  }
}

export const configManager = ConfigurationManager.getInstance();
