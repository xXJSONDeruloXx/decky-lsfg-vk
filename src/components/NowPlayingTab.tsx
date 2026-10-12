import { Focusable } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import type { GameTarget } from "../utils/gameTargets";
import { GameConfigurationControls } from "./GameConfigurationControls";
import { NowPlayingSummary } from "./NowPlayingSummary";
import t from "../i18n/i18n";

interface Props {
  game: GameTarget;
  config: ConfigurationData;
  onConfigChange: (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
  ) => Promise<void>;
}

function targetDescription(game: GameTarget): string {
  if (game.source === "nonSteam") return t("SOURCE_NON_STEAM", "Non-Steam");
  if (game.source === "steam") return t("SOURCE_STEAM", "Steam");
  return t("SOURCE_UNKNOWN", "Unknown source");
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
        details={[
          targetDescription(game),
          t("NOW_PLAYING_CONTROLS", "Controls: {name} profile", { name: game.name }),
        ]}
      />
      <GameConfigurationControls
        config={config}
        onConfigChange={onConfigChange}
        showWorkarounds={false}
      />
    </Focusable>
  );
}

