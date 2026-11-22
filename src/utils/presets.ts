export type PresetId = "quality" | "balanced" | "low_latency";

export interface PresetValues {
  flow_scale: number;
  performance_mode: boolean;
}

export interface PresetDefinition {
  id: PresetId;
  labelKey: string;
  label: string;
  descriptionKey: string;
  description: string;
  values: PresetValues;
}

export const STABLE_BASE_FPS = 30;
export const STABLE_MULTIPLIER = 2;

export const PRESETS: readonly PresetDefinition[] = [
  {
    id: "quality",
    labelKey: "PRESET_QUALITY",
    label: "Quality",
    descriptionKey: "PRESET_QUALITY_DESC",
    description: "Full-resolution motion estimation with the standard model. Cleanest image, heaviest on the GPU.",
    values: { flow_scale: 1, performance_mode: false },
  },
  {
    id: "balanced",
    labelKey: "PRESET_BALANCED",
    label: "Balanced",
    descriptionKey: "PRESET_BALANCED_DESC",
    description: "80% motion estimation with the standard model. A good starting point for most games.",
    values: { flow_scale: 0.8, performance_mode: false },
  },
  {
    id: "low_latency",
    labelKey: "PRESET_LOW_LATENCY",
    label: "Low latency",
    descriptionKey: "PRESET_LOW_LATENCY_DESC",
    description: "50% motion estimation with the lighter model. Frames are generated faster, which shortens the delay frame generation adds and saves battery. Slightly softer motion.",
    values: { flow_scale: 0.5, performance_mode: true },
  },
];

/** Returns the preset matching the current config, or null for custom values. */
export function detectPreset(config: PresetValues): PresetId | null {
  const match = PRESETS.find(
    (preset) =>
      Math.abs(preset.values.flow_scale - config.flow_scale) < 0.005 &&
      preset.values.performance_mode === config.performance_mode,
  );
  return match ? match.id : null;
}

/** Frame rate the screen receives once frame generation is active. */
export function outputFps(baseFpsCap: number, multiplier: number): number | null {
  if (!Number.isFinite(baseFpsCap) || baseFpsCap <= 0) return null;
  return Math.round(baseFpsCap * Math.max(1, multiplier));
}

/**
 * Base cap that makes cap x multiplier equal the display refresh rate, which
 * is what vsync pacing needs to stay even. Null when it doesn't divide cleanly
 * into a usable cap (1-60 FPS).
 */
export function suggestBaseCap(refreshHz: number, multiplier: number): number | null {
  if (!Number.isFinite(refreshHz) || refreshHz <= 0 || multiplier < 2) return null;
  const cap = refreshHz / multiplier;
  if (!Number.isInteger(cap) || cap < 1 || cap > 60) return null;
  return cap;
}
