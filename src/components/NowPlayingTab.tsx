import { Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { GameTarget } from "../hooks/useGameConfiguration";
import { GameConfigurationControls } from "./GameConfigurationControls";

interface Props {
  game: GameTarget;
  config: ConfigurationData;
  onConfigChange: (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
  ) => Promise<void>;
}

function targetDescription(game: GameTarget): string {
  if (game.directFlatpak) return "Non-Steam · Direct Flatpak";
  return game.nonSteam ? "Non-Steam" : "Steam";
}

export function NowPlayingTab({
  game,
  config,
  onConfigChange,
}: Props) {
  return (
    <Focusable>
      <PanelSection title="Now Playing">
        <PanelSectionRow>
          <Field label={game.name} description={targetDescription(game)} />
        </PanelSectionRow>
      </PanelSection>
      <GameConfigurationControls
        config={config}
        onConfigChange={onConfigChange}
        showWorkarounds={false}
      />
    </Focusable>
  );
}
