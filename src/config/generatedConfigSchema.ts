export enum ConfigFieldType { BOOLEAN = "boolean", INTEGER = "integer", FLOAT = "float", STRING = "string", ARRAY = "array" }

export const DLL = "dll" as const;
export const NO_FP16 = "no_fp16" as const;
export const ACTIVE_IN = "active_in" as const;
export const PACING_MODE = "pacing_mode" as const;
export const MULTIPLIER = "multiplier" as const;
export const FLOW_SCALE = "flow_scale" as const;
export const PERFORMANCE_MODE = "performance_mode" as const;
export const OVERRIDE_PRESENT_MODE = "override_present_mode" as const;
export const PRESERVE_SWAPCHAIN_IMAGE_COUNT = "preserve_swapchain_image_count" as const;

export interface ConfigField { name: string; fieldType: ConfigFieldType; default: boolean | number | string | string[]; description: string; }
export interface ConfigurationData {
  dll: string; no_fp16: boolean; active_in: string[]; pacing_mode: string; multiplier: number;
  flow_scale: number; performance_mode: boolean; override_present_mode: boolean; preserve_swapchain_image_count: boolean;
}
export const CONFIG_SCHEMA: Record<string, ConfigField> = {
  dll: { name: "dll", fieldType: ConfigFieldType.STRING, default: "", description: "Override the lsfg-vk.dll path" },
  no_fp16: { name: "no_fp16", fieldType: ConfigFieldType.BOOLEAN, default: false, description: "Disable FP16 acceleration" },
  active_in: { name: "active_in", fieldType: ConfigFieldType.ARRAY, default: [], description: "Steam AppID or executable identifiers" },
  pacing_mode: { name: "pacing_mode", fieldType: ConfigFieldType.STRING, default: "vsync", description: "Frame pacing mode" },
  multiplier: { name: "multiplier", fieldType: ConfigFieldType.INTEGER, default: 2, description: "Frame generation multiplier" },
  flow_scale: { name: "flow_scale", fieldType: ConfigFieldType.FLOAT, default: 0.8, description: "Motion estimation resolution scale" },
  performance_mode: { name: "performance_mode", fieldType: ConfigFieldType.BOOLEAN, default: false, description: "Use the lighter frame generation model" },
  override_present_mode: { name: "override_present_mode", fieldType: ConfigFieldType.BOOLEAN, default: true, description: "Override present mode" },
  preserve_swapchain_image_count: { name: "preserve_swapchain_image_count", fieldType: ConfigFieldType.BOOLEAN, default: false, description: "Preserve the swapchain image count" },
};
export function getFieldNames(): string[] { return Object.keys(CONFIG_SCHEMA); }
export function getDefaults(): ConfigurationData { return { dll: "", no_fp16: false, active_in: [], pacing_mode: "vsync", multiplier: 2, flow_scale: 0.8, performance_mode: false, override_present_mode: true, preserve_swapchain_image_count: false }; }
export function getFieldTypes(): Record<string, ConfigFieldType> { return Object.fromEntries(Object.entries(CONFIG_SCHEMA).map(([key, value]) => [key, value.fieldType])); }
