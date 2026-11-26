import { DropdownItem, Field, PanelSectionRow, ToggleField, SliderField } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { FLOW_SCALE, PERFORMANCE_MODE, OVERRIDE_PRESENT_MODE, PRESERVE_SWAPCHAIN_IMAGE_COUNT } from "../config/configSchema";
import t from "../i18n/i18n";
import { PRESETS, detectPreset } from "../utils/presets";

interface ConfigurationSectionProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  simple?: boolean;
}

const CUSTOM_PRESET = "custom";

export function ConfigurationSection({ config, onConfigChange, simple = false }: ConfigurationSectionProps) {
  const activePreset = detectPreset(config);
  const presetDescription = PRESETS.find((preset) => preset.id === activePreset);

  const applyPreset = async (id: string) => {
    const preset = PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    await onConfigChange(FLOW_SCALE, preset.values.flow_scale);
    await onConfigChange(PERFORMANCE_MODE, preset.values.performance_mode);
  };

  return <>
    {!simple && <PanelSectionRow>
      <DropdownItem
        label={t("PRESET_LABEL", "Quality preset")}
        description={presetDescription
          ? t(presetDescription.descriptionKey, presetDescription.description)
          : t("PRESET_CUSTOM_DESC", "Flow Scale and Performance Mode are set by hand below.")}
        rgOptions={[
          ...PRESETS.map((preset) => ({ data: preset.id, label: t(preset.labelKey, preset.label) })),
          ...(activePreset ? [] : [{ data: CUSTOM_PRESET, label: t("PRESET_CUSTOM", "Custom") }]),
        ]}
        selectedOption={activePreset ?? CUSTOM_PRESET}
        onChange={(option) => void applyPreset(String(option.data))}
      />
    </PanelSectionRow>}
    <PanelSectionRow>
      <SliderField
        label={`${t("CONFIG_FLOW_SCALE", "Flow Scale")} (${Math.round(config.flow_scale * 100)}%)`}
        description={t("CONFIG_FLOW_SCALE_DESC", "Resolution used to track motion between frames. Lower is faster and lighter on the GPU; higher gives cleaner generated frames.")}
        value={config.flow_scale}
        min={0.25}
        max={1}
        step={0.01}
        onChange={(value) => onConfigChange(FLOW_SCALE, value)}
      />
    </PanelSectionRow>
    <PanelSectionRow>
      <ToggleField
        label={t("CONFIG_PERFORMANCE_MODE", "Performance Mode")}
        description={t("CONFIG_PERFORMANCE_MODE_DESC", "Uses a much lighter frame generation model with a small quality cost. Recommended on handhelds.")}
        checked={config.performance_mode}
        onChange={(value) => onConfigChange(PERFORMANCE_MODE, value)}
      />
    </PanelSectionRow>
    {!simple && <>
    <PanelSectionRow>
      <ToggleField
        label={t("CONFIG_PRESENT_MODE_OVERRIDE", "Present Mode Override")}
        description={t("CONFIG_PRESENT_MODE_OVERRIDE_DESC", "Forces Vsync (FIFO), which frame pacing needs to stay even. Leave on unless a game misbehaves.")}
        checked={config.override_present_mode}
        onChange={(value) => onConfigChange(OVERRIDE_PRESENT_MODE, value)}
      />
    </PanelSectionRow>
    <PanelSectionRow>
      <ToggleField
        label={t("CONFIG_PRESERVE_SWAPCHAIN", "Preserve Swapchain Image Count")}
        description={t("CONFIG_PRESERVE_SWAPCHAIN_DESC", "Keeps the game's own swapchain size. Turn on only if a Vulkan game crashes on launch; it can make pacing less smooth.")}
        checked={config.preserve_swapchain_image_count}
        onChange={(value) => onConfigChange(PRESERVE_SWAPCHAIN_IMAGE_COUNT, value)}
      />
    </PanelSectionRow>
    <PanelSectionRow>
      <Field
        label={t("TIPS_LABEL", "Seeing warping, blur or tearing?")}
        description={t("TIPS_DESC", "Warping and bubbling: use the Quality preset and a higher base FPS (40+ looks best). Tearing: keep Present Mode Override on. Laggy or uneven: pick a Smooth pacing target in Workarounds and keep the GPU below 100%.")}
        focusable
      />
    </PanelSectionRow>
    </>}
  </>;
}
