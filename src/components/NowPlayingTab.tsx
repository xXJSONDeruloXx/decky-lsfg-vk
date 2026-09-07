import { ButtonItem, Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { GameTarget } from "../hooks/useGameConfiguration";
import { GameConfigurationControls } from "./GameConfigurationControls";

interface Props {
  game: GameTarget;
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function NowPlayingTab({ game, config, onConfigChange, onRemove }: Props) {
  return (
    <Focusable>
      <PanelSection title="Now Playing">
        <PanelSectionRow>
          <Field
            label={game.name}
            description={`${game.nonSteam ? "Non-Steam" : "Steam"} · App ID ${game.appid} · Profile active`}
          />
        </PanelSectionRow>
      </PanelSection>
      <GameConfigurationControls config={config} onConfigChange={onConfigChange} />
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => void onRemove()}>
          Remove profile
        </ButtonItem>
      </PanelSectionRow>
    </Focusable>
  );
}
