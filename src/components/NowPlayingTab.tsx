import { Focusable } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { GameTarget } from "../hooks/useGameConfiguration";
import { GameConfigurationControls } from "./GameConfigurationControls";
import { NowPlayingSummary } from "./NowPlayingSummary";

interface Props {
  game: GameTarget;
  config: ConfigurationData;
  onConfigChange: (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
  ) => Promise<void>;
}

function targetDescription(game: GameTarget): string {
  return game.nonSteam ? "Non-Steam" : "Steam";
}

export function NowPlayingTab({
  game,
  config,
  onConfigChange,
}: Props) {
  return (
    <Focusable>
      <NowPlayingSummary
        title={game.name}
        details={[targetDescription(game), `Controls: ${game.name} profile`]}
      />
      <GameConfigurationControls
        config={config}
        onConfigChange={onConfigChange}
        showWorkarounds={false}
      />
    </Focusable>
  );
}
