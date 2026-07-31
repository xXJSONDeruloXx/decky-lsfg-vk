// src/config/generatedConfigSchema.ts
// Configuration field type enum - matches Python
export enum ConfigFieldType {
  BOOLEAN = "boolean",
  INTEGER = "integer",
  FLOAT = "float",
  STRING = "string"
}

// Field name constants for type-safe access
export const DLL = "dll" as const;
export const ALLOW_FP16 = "allow_fp16" as const;
export const MULTIPLIER = "multiplier" as const;
export const FLOW_SCALE = "flow_scale" as const;
export const PERFORMANCE_MODE = "performance_mode" as const;
export const PACING = "pacing" as const;
export const ACTIVE_IN = "active_in" as const;
export const USE_NATIVE_MATCHING = "use_native_matching" as const;
export const GPU = "gpu" as const;
export const DISABLE_LSFGVK = "disable_lsfgvk" as const;
export const DXVK_FRAME_RATE = "dxvk_frame_rate" as const;
export const ENABLE_WOW64 = "enable_wow64" as const;
export const DISABLE_STEAMDECK_MODE = "disable_steamdeck_mode" as const;
export const MANGOHUD_WORKAROUND = "mangohud_workaround" as const;
export const DISABLE_VKBASALT = "disable_vkbasalt" as const;
export const FORCE_ENABLE_VKBASALT = "force_enable_vkbasalt" as const;
export const ENABLE_WSI = "enable_wsi" as const;
export const ENABLE_ZINK = "enable_zink" as const;

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
    default: "",
    description: "optional full path to Lossless.dll; leave blank for automatic discovery"
  },
  allow_fp16: {
    name: "allow_fp16",
    fieldType: ConfigFieldType.BOOLEAN,
    default: true,
    description: "allow FP16 acceleration (disable on older NVIDIA GPUs)"
  },
  multiplier: {
    name: "multiplier",
    fieldType: ConfigFieldType.INTEGER,
    default: 2,
    description: "frame generation multiplier"
  },
  flow_scale: {
    name: "flow_scale",
    fieldType: ConfigFieldType.FLOAT,
    default: 0.9,
    description: "motion-estimation resolution scale"
  },
  performance_mode: {
    name: "performance_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "use the lighter frame-generation model"
  },
  pacing: {
    name: "pacing",
    fieldType: ConfigFieldType.STRING,
    default: "none",
    description: "frame pacing mode (currently only none is supported)"
  },
  active_in: {
    name: "active_in",
    fieldType: ConfigFieldType.STRING,
    default: "",
    description: "optional executable or process names, separated by commas"
  },
  use_native_matching: {
    name: "use_native_matching",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "let lsfg-vk choose a profile from Active In instead of forcing the selected profile"
  },
  gpu: {
    name: "gpu",
    fieldType: ConfigFieldType.STRING,
    default: "",
    description: "optional GPU name, vendor:device ID, or PCI bus ID"
  },
  disable_lsfgvk: {
    name: "disable_lsfgvk",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "disable lsfg-vk on the next game launch"
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
    description: "enable PROTON_USE_WOW64=1 for 32-bit games"
  },
  disable_steamdeck_mode: {
    name: "disable_steamdeck_mode",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "disable Steam Deck mode"
  },
  mangohud_workaround: {
    name: "mangohud_workaround",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "enable a transparent MangoHud overlay workaround"
  },
  disable_vkbasalt: {
    name: "disable_vkbasalt",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "disable vkBasalt for games where it conflicts with lsfg-vk"
  },
  force_enable_vkbasalt: {
    name: "force_enable_vkbasalt",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "force-enable vkBasalt for games that require it"
  },
  enable_wsi: {
    name: "enable_wsi",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "enable the Gamescope WSI layer"
  },
  enable_zink: {
    name: "enable_zink",
    fieldType: ConfigFieldType.BOOLEAN,
    default: false,
    description: "enable Zink for OpenGL games"
  },
};

// Type-safe configuration data structure
export interface ConfigurationData {
  dll: string;
  allow_fp16: boolean;
  multiplier: number;
  flow_scale: number;
  performance_mode: boolean;
  pacing: string;
  active_in: string;
  use_native_matching: boolean;
  gpu: string;
  disable_lsfgvk: boolean;
  dxvk_frame_rate: number;
  enable_wow64: boolean;
  disable_steamdeck_mode: boolean;
  mangohud_workaround: boolean;
  disable_vkbasalt: boolean;
  force_enable_vkbasalt: boolean;
  enable_wsi: boolean;
  enable_zink: boolean;
}

// Helper functions
export function getFieldNames(): string[] {
  return Object.keys(CONFIG_SCHEMA);
}

export function getDefaults(): ConfigurationData {
  return {
    dll: "",
    allow_fp16: true,
    multiplier: 2,
    flow_scale: 0.9,
    performance_mode: false,
    pacing: "none",
    active_in: "",
    use_native_matching: false,
    gpu: "",
    disable_lsfgvk: false,
    dxvk_frame_rate: 0,
    enable_wow64: false,
    disable_steamdeck_mode: false,
    mangohud_workaround: false,
    disable_vkbasalt: false,
    force_enable_vkbasalt: false,
    enable_wsi: false,
    enable_zink: false,
  };
}

export function getFieldTypes(): Record<string, ConfigFieldType> {
  return {
    dll: ConfigFieldType.STRING,
    allow_fp16: ConfigFieldType.BOOLEAN,
    multiplier: ConfigFieldType.INTEGER,
    flow_scale: ConfigFieldType.FLOAT,
    performance_mode: ConfigFieldType.BOOLEAN,
    pacing: ConfigFieldType.STRING,
    active_in: ConfigFieldType.STRING,
    use_native_matching: ConfigFieldType.BOOLEAN,
    gpu: ConfigFieldType.STRING,
    disable_lsfgvk: ConfigFieldType.BOOLEAN,
    dxvk_frame_rate: ConfigFieldType.INTEGER,
    enable_wow64: ConfigFieldType.BOOLEAN,
    disable_steamdeck_mode: ConfigFieldType.BOOLEAN,
    mangohud_workaround: ConfigFieldType.BOOLEAN,
    disable_vkbasalt: ConfigFieldType.BOOLEAN,
    force_enable_vkbasalt: ConfigFieldType.BOOLEAN,
    enable_wsi: ConfigFieldType.BOOLEAN,
    enable_zink: ConfigFieldType.BOOLEAN,
  };
}

