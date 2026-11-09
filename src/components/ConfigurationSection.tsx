import { PanelSectionRow, ToggleField, SliderField } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { FLOW_SCALE, PERFORMANCE_MODE, OVERRIDE_PRESENT_MODE, PRESERVE_SWAPCHAIN_IMAGE_COUNT } from "../config/configSchema";
import t from "../i18n/i18n";

interface ConfigurationSectionProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
}

export function ConfigurationSection({ config, onConfigChange }: ConfigurationSectionProps) {
  return <>
    <PanelSectionRow>
      <SliderField
        label={t("CONFIG_FLOW_SCALE_WITH_VALUE", "Flow Scale ({value}%)", { value: Math.round(config.flow_scale * 100) })}
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
        checked={config.performance_mode}
        onChange={(value) => onConfigChange(PERFORMANCE_MODE, value)}
      />
    </PanelSectionRow>
    <PanelSectionRow>
      <ToggleField
        label={t("CONFIG_OVERRIDE_PRESENT_MODE", "Present Mode Override")}
        checked={config.override_present_mode}
        onChange={(value) => onConfigChange(OVERRIDE_PRESENT_MODE, value)}
      />
    </PanelSectionRow>
    <PanelSectionRow>
      <ToggleField
        label={t("CONFIG_PRESERVE_SWAPCHAIN_IMAGE_COUNT", "Preserve Swapchain Image Count")}
        checked={config.preserve_swapchain_image_count}
        onChange={(value) => onConfigChange(PRESERVE_SWAPCHAIN_IMAGE_COUNT, value)}
      />
    </PanelSectionRow>
  </>;
}

