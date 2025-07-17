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
  FLOAT = "float",
  STRING = "string"
}

// Configuration field definition
export interface ConfigField {
  name: string;
  fieldType: ConfigFieldType;
  default: boolean | number | string;
  description: string;
}

// Configuration schema - must match Python CONFIG_SCHEMA
export const CONFIG_SCHEMA: Record<string, ConfigField> = {
  enable: {
    name: "enable",
    fieldType: ConfigFieldType.BOOLEAN,
    default: true,
    description: "enable/disable lsfg on every game"
  },
  
  dll: {
    name: "dll",
    fieldType: ConfigFieldType.STRING,
    default: "/games/Lossless Scaling/Lossless.dll",
    description: "specify where Lossless.dll is stored"
  },
  
  multiplier: {
    name: "multiplier",
    fieldType: ConfigFieldType.INTEGER,
    default: 2,
    description: "change the fps multiplier"
  },
  
  flow_scale: {
    name: "flow_scale",
    fieldType: ConfigFieldType.FLOAT,
    default: 0.8,
    description: "change the flow scale"
  },
  
  performance_mode: {
    name: "performance_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: true,
    description: "toggle performance mode"
  },
  
  hdr_mode: {
    name: "hdr_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "enable hdr in games that support it"
  }
};

// Type-safe configuration data structure
export interface ConfigurationData {
  enable: boolean;
  dll: string;
  multiplier: number;
  flow_scale: number;
  performance_mode: boolean;
  hdr_mode: boolean;
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
  static createArgsFromConfig(config: ConfigurationData): (boolean | number | string)[] {
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
        } else if (fieldDef.fieldType === ConfigFieldType.STRING) {
          (validated as any)[fieldName] = String(value);
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
