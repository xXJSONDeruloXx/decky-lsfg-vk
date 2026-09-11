import { PanelSectionRow, ToggleField, SliderField } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { FLOW_SCALE, PERFORMANCE_MODE, OVERRIDE_PRESENT_MODE, PRESERVE_SWAPCHAIN_IMAGE_COUNT } from "../config/configSchema";

interface ConfigurationSectionProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
}

export function ConfigurationSection({ config, onConfigChange }: ConfigurationSectionProps) {
  return <>
    <PanelSectionRow>
      <SliderField label={`Flow Scale (${Math.round(config.flow_scale * 100)}%)`} value={config.flow_scale} min={0.25} max={1} step={0.01} onChange={(value) => onConfigChange(FLOW_SCALE, value)} />
    </PanelSectionRow>
    <PanelSectionRow>
      <ToggleField label="Performance Mode" checked={config.performance_mode} onChange={(value) => onConfigChange(PERFORMANCE_MODE, value)} />
    </PanelSectionRow>
    <PanelSectionRow>
      <ToggleField label="Present Mode Override" checked={config.override_present_mode} onChange={(value) => onConfigChange(OVERRIDE_PRESENT_MODE, value)} />
    </PanelSectionRow>
    <PanelSectionRow>
      <ToggleField label="Preserve Swapchain Image Count" checked={config.preserve_swapchain_image_count} onChange={(value) => onConfigChange(PRESERVE_SWAPCHAIN_IMAGE_COUNT, value)} />
    </PanelSectionRow>
  </>;
}
