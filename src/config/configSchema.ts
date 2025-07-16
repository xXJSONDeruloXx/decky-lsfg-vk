/**
 * Centralized configuration schema for lsfg-vk frontend.
 * 
 * This mirrors the Python configuration schema to ensure consistency
 * between frontend and backend configuration handling.
 */

// Configuration field type enum
export enum ConfigFieldType {
  BOOLEAN = "boolean",
  INTEGER = "integer",
  FLOAT = "float"
}

// Configuration field definition
export interface ConfigField {
  name: string;
  fieldType: ConfigFieldType;
  default: boolean | number;
  description: string;
  scriptTemplate: string;
  scriptComment?: string;
}

// Configuration schema - must match Python CONFIG_SCHEMA
export const CONFIG_SCHEMA: Record<string, ConfigField> = {
  enable_lsfg: {
    name: "enable_lsfg",
    fieldType: ConfigFieldType.BOOLEAN,
    default: true,
    description: "Enables the frame generation layer",
    scriptTemplate: "export ENABLE_LSFG={value}",
    scriptComment: "# export ENABLE_LSFG=1"
  },
  
  multiplier: {
    name: "multiplier",
    fieldType: ConfigFieldType.INTEGER,
    default: 2,
    description: "Traditional FPS multiplier value",
    scriptTemplate: "export LSFG_MULTIPLIER={value}"
  },
  
  flow_scale: {
    name: "flow_scale",
    fieldType: ConfigFieldType.FLOAT,
    default: 0.8,
    description: "Lowers the internal motion estimation resolution",
    scriptTemplate: "export LSFG_FLOW_SCALE={value}"
  },
  
  hdr: {
    name: "hdr",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "Enable HDR mode (only if Game supports HDR)",
    scriptTemplate: "export LSFG_HDR={value}",
    scriptComment: "# export LSFG_HDR=1"
  },
  
  perf_mode: {
    name: "perf_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: true,
    description: "Use lighter model for FG",
    scriptTemplate: "export LSFG_PERF_MODE={value}",
    scriptComment: "# export LSFG_PERF_MODE=1"
  },
  
  immediate_mode: {
    name: "immediate_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "Reduce input lag (Experimental, will cause issues in many games)",
    scriptTemplate: "export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync",
    scriptComment: "# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync"
  },
  
  disable_vkbasalt: {
    name: "disable_vkbasalt",
    fieldType: ConfigFieldType.BOOLEAN,
    default: true,
    description: "Some plugins add vkbasalt layer, which can break lsfg. Toggling on fixes this",
    scriptTemplate: "export DISABLE_VKBASALT={value}",
    scriptComment: "# export DISABLE_VKBASALT=1"
  },
  
  frame_cap: {
    name: "frame_cap",
    fieldType: ConfigFieldType.INTEGER,
    default: 0,
    description: "Limit base game FPS (0 = disabled)",
    scriptTemplate: "export DXVK_FRAME_RATE={value}",
    scriptComment: "# export DXVK_FRAME_RATE=60"
  }
};

// Type-safe configuration data structure
export interface ConfigurationData {
  enable_lsfg: boolean;
  multiplier: number;
  flow_scale: number;
  hdr: boolean;
  perf_mode: boolean;
  immediate_mode: boolean;
  disable_vkbasalt: boolean;
  frame_cap: number;
}

// Centralized configuration manager
export class ConfigurationManager {
  /**
   * Get default configuration values
   */
  static getDefaults(): ConfigurationData {
    const defaults = {} as ConfigurationData;
    Object.values(CONFIG_SCHEMA).forEach(field => {
      (defaults as any)[field.name] = field.default;
    });
    return defaults;
  }

  /**
   * Get ordered list of configuration field names
   */
  static getFieldNames(): string[] {
    return Object.keys(CONFIG_SCHEMA);
  }

  /**
   * Get field type mapping
   */
  static getFieldTypes(): Record<string, ConfigFieldType> {
    return Object.values(CONFIG_SCHEMA).reduce((acc, field) => {
      acc[field.name] = field.fieldType;
      return acc;
    }, {} as Record<string, ConfigFieldType>);
  }

  /**
   * Create ordered arguments array from configuration object
   */
  static createArgsFromConfig(config: ConfigurationData): (boolean | number)[] {
    return this.getFieldNames().map(fieldName => 
      config[fieldName as keyof ConfigurationData]
    );
  }

  /**
   * Validate configuration object against schema
   */
  static validateConfig(config: Partial<ConfigurationData>): ConfigurationData {
    const defaults = this.getDefaults();
    const validated = { ...defaults };

    Object.entries(CONFIG_SCHEMA).forEach(([fieldName, fieldDef]) => {
      const value = config[fieldName as keyof ConfigurationData];
      if (value !== undefined) {
        // Type validation
        if (fieldDef.fieldType === ConfigFieldType.BOOLEAN) {
          (validated as any)[fieldName] = Boolean(value);
        } else if (fieldDef.fieldType === ConfigFieldType.INTEGER) {
          (validated as any)[fieldName] = parseInt(String(value), 10);
        } else if (fieldDef.fieldType === ConfigFieldType.FLOAT) {
          (validated as any)[fieldName] = parseFloat(String(value));
        }
      }
    });

    return validated;
  }

  /**
   * Get configuration field definition
   */
  static getFieldDef(fieldName: string): ConfigField | undefined {
    return CONFIG_SCHEMA[fieldName];
  }

  /**
   * Get all field definitions
   */
  static getAllFieldDefs(): ConfigField[] {
    return Object.values(CONFIG_SCHEMA);
  }
}
