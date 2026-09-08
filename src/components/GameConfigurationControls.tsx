import { ConfigurationData } from "../config/configSchema";
import type { GameTarget } from "../hooks/useGameConfiguration";
import { ConfigurationSection } from "./ConfigurationSection";
import { FpsMultiplierControl } from "./FpsMultiplierControl";
import { WorkaroundsSection } from "./WorkaroundsSection";

interface Props {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  autoFocusFpsMultiplier?: boolean;
  onFpsMultiplierFocused?: () => void;
  showWorkarounds?: boolean;
  workaroundTarget?: Pick<GameTarget, "appid" | "nonSteam">;
}

export function GameConfigurationControls({
  config,
  onConfigChange,
  autoFocusFpsMultiplier,
  onFpsMultiplierFocused,
  showWorkarounds = false,
  workaroundTarget,
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
      {showWorkarounds && workaroundTarget && (
        <WorkaroundsSection appId={workaroundTarget.appid} nonSteam={workaroundTarget.nonSteam} />
      )}
    </>
  );
}
