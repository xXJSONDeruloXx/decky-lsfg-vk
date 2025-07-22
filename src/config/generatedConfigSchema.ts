// src/config/generatedConfigSchema.ts
// Configuration field type enum - matches Python
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

// Configuration schema - auto-generated from Python
export const CONFIG_SCHEMA: Record<string, ConfigField> = {
  dll: {
    name: "dll",
    fieldType: ConfigFieldType.STRING,
    default: "/games/Lossless Scaling/Lossless.dll",
    description: "specify where Lossless.dll is stored"
  },
  multiplier: {
    name: "multiplier",
    fieldType: ConfigFieldType.INTEGER,
    default: 1,
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
    description: "use a lighter model for FG (recommended for most games)"
  },
  hdr_mode: {
    name: "hdr_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "enable HDR mode (only for games that support HDR)"
  },
  experimental_present_mode: {
    name: "experimental_present_mode",
    fieldType: ConfigFieldType.STRING,
    default: "fifo",
    description: "override Vulkan present mode (may cause crashes)"
  },
  dxvk_frame_rate: {
    name: "dxvk_frame_rate",
    fieldType: ConfigFieldType.INTEGER,
    default: 0,
    description: "base framerate cap for DirectX games before frame multiplier"
  },
  enable_wow64: {
    name: "enable_wow64",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "enable PROTON_USE_WOW64=1 for 32-bit games (use with ProtonGE to fix crashing)"
  },
  disable_steamdeck_mode: {
    name: "disable_steamdeck_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "disable Steam Deck mode (unlocks hidden settings in some games)"
  },
  mangohud_workaround: {
    name: "mangohud_workaround",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "Enables a transparent mangohud overlay, sometimes fixes issues with 2X multiplier in game mode"
  },
  disable_vkbasalt: {
    name: "disable_vkbasalt",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "Disables vkBasalt layer which can conflict with LSFG (Reshade, some Decky plugins)"
  },
};

// Type-safe configuration data structure
export interface ConfigurationData {
  dll: string;
  multiplier: number;
  flow_scale: number;
  performance_mode: boolean;
  hdr_mode: boolean;
  experimental_present_mode: string;
  dxvk_frame_rate: number;
  enable_wow64: boolean;
  disable_steamdeck_mode: boolean;
  mangohud_workaround: boolean;
  disable_vkbasalt: boolean;
}

// Helper functions
export function getFieldNames(): string[] {
  return Object.keys(CONFIG_SCHEMA);
}

export function getDefaults(): ConfigurationData {
  return {
    dll: "/games/Lossless Scaling/Lossless.dll",
    multiplier: 1,
    flow_scale: 0.8,
    performance_mode: true,
    hdr_mode: false,
    experimental_present_mode: "fifo",
    dxvk_frame_rate: 0,
    enable_wow64: false,
    disable_steamdeck_mode: false,
    mangohud_workaround: false,
    disable_vkbasalt: false,
  };
}

export function getFieldTypes(): Record<string, ConfigFieldType> {
  return {
    dll: ConfigFieldType.STRING,
    multiplier: ConfigFieldType.INTEGER,
    flow_scale: ConfigFieldType.FLOAT,
    performance_mode: ConfigFieldType.BOOLEAN,
    hdr_mode: ConfigFieldType.BOOLEAN,
    experimental_present_mode: ConfigFieldType.STRING,
    dxvk_frame_rate: ConfigFieldType.INTEGER,
    enable_wow64: ConfigFieldType.BOOLEAN,
    disable_steamdeck_mode: ConfigFieldType.BOOLEAN,
    mangohud_workaround: ConfigFieldType.BOOLEAN,
    disable_vkbasalt: ConfigFieldType.BOOLEAN,
  };
}

