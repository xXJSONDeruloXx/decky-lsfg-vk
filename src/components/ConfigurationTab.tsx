import { PanelSection } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { GameTarget } from "../hooks/useGameConfiguration";
import { ConfigurationSection } from "./ConfigurationSection";
import { FgmodClipboardButton } from "./FgmodClipboardButton";
import { FpsMultiplierControl } from "./FpsMultiplierControl";
import { GameConfigurationSelector } from "./GameConfigurationSelector";
import t from "../i18n/i18n";

interface ConfigurationTabProps {
  config: ConfigurationData;
  targets: GameTarget[];
  runningGame: GameTarget | null;
  selectedAppId: string;
  onSelect: (appid: string) => void;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  onReset: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

export function ConfigurationTab({
  config,
  targets,
  runningGame,
  selectedAppId,
  onSelect,
  onConfigChange,
  onReset,
  onResetAll,
}: ConfigurationTabProps) {
  return (
    <>
      <PanelSection title={t("CONTENT_FPS_MULTIPLIER", "FPS Multiplier")}>
        <FpsMultiplierControl config={config} onConfigChange={onConfigChange} />
      </PanelSection>
      <PanelSection title="Game Profile">
        <GameConfigurationSelector
          targets={targets}
          runningGame={runningGame}
          selectedAppId={selectedAppId}
          onSelect={onSelect}
          onReset={onReset}
          onResetAll={onResetAll}
        />
      </PanelSection>
      <PanelSection title="Options">
        <ConfigurationSection config={config} onConfigChange={onConfigChange} />
      </PanelSection>
      <PanelSection>
        <FgmodClipboardButton />
      </PanelSection>
    </>
  );
}
