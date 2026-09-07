import { PanelSectionRow, SliderField } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { MULTIPLIER } from "../config/generatedConfigSchema";
import t from "../i18n/i18n";

interface FpsMultiplierControlProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
}

export function FpsMultiplierControl({
  config,
  onConfigChange
}: FpsMultiplierControlProps) {
  const multiplierLabel = config.multiplier === 1
    ? t("MULTIPLIER_OFF", "Off")
    : `${config.multiplier}x`;

  return (
    <PanelSectionRow>
      <SliderField
        label={`FPS multiplier · ${multiplierLabel}`}
        value={config.multiplier}
        min={1}
        max={4}
        step={1}
        notchCount={4}
        showValue={false}
        onChange={(value) => void onConfigChange(MULTIPLIER, value)}
      />
    </PanelSectionRow>
  );
}
