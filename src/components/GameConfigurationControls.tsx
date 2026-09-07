import { ConfigurationData } from "../config/configSchema";
import { ConfigurationSection } from "./ConfigurationSection";
import { FpsMultiplierControl } from "./FpsMultiplierControl";

interface Props {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  autoFocusFpsMultiplier?: boolean;
  onFpsMultiplierFocused?: () => void;
}

export function GameConfigurationControls({
  config,
  onConfigChange,
  autoFocusFpsMultiplier,
  onFpsMultiplierFocused,
}: Props) {
  return (
    <>
      <FpsMultiplierControl
        config={config}
        onConfigChange={onConfigChange}
        autoFocus={autoFocusFpsMultiplier}
        onAutoFocus={onFpsMultiplierFocused}
      />
      <ConfigurationSection config={config} onConfigChange={onConfigChange} />
    </>
  );
}
