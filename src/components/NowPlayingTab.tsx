import { Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { GameTarget } from "../hooks/useGameConfiguration";
import { GameConfigurationControls } from "./GameConfigurationControls";

interface Props {
  game: GameTarget;
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
}

export function NowPlayingTab({ game, config, onConfigChange }: Props) {
  return (
    <Focusable>
      <PanelSection>
        <PanelSectionRow>
          <Field
            label={game.name}
            description={`${game.nonSteam ? "Non-Steam" : "Steam"} | App ID ${game.appid}`}
          />
        </PanelSectionRow>
      </PanelSection>
      <GameConfigurationControls config={config} onConfigChange={onConfigChange} />
    </Focusable>
  );
}
