import { ConfigurationData } from "../config/configSchema";
import { ConfigurationSection } from "./ConfigurationSection";
import { FpsMultiplierControl } from "./FpsMultiplierControl";

interface Props {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
}

export function GameConfigurationControls({ config, onConfigChange }: Props) {
  return (
    <>
      <FpsMultiplierControl config={config} onConfigChange={onConfigChange} />
      <ConfigurationSection config={config} onConfigChange={onConfigChange} />
    </>
  );
}
