import { Focusable } from "@decky/ui";
import type { FlatpakApp, LsfgConfig } from "../api/lsfgApi";
import type { GameTarget } from "../utils/gameTargets";
import { ConfigurationSection } from "./ConfigurationSection";
import { FpsMultiplierControl } from "./FpsMultiplierControl";
import { NowPlayingSummary } from "./NowPlayingSummary";
import t from "../i18n/i18n";

interface Props {
  app: FlatpakApp;
  launcher: GameTarget | null;
  onConfigChange: (appId: string, config: LsfgConfig) => Promise<boolean>;
}

export function FlatpakNowPlayingTab({ app, launcher, onConfigChange }: Props) {
  if (!app.config) return null;
  const changeConfig = async (
    field: keyof LsfgConfig,
    value: boolean | number | string | string[],
  ) => {
    await onConfigChange(app.app_id, { ...app.config!, [field]: value });
  };

  return (
    <Focusable>
      <NowPlayingSummary
        title={launcher?.name || app.app_name}
        details={[
          launcher
            ? (launcher.source === "nonSteam"
                ? t("FLATPAK_STEAM_SHORTCUT", "Steam shortcut")
                : t("SOURCE_STEAM", "Steam"))
            : t("TAB_FLATPAK", "Flatpak"),
          launcher && launcher.name !== app.app_name
            ? t("FLATPAK_RUNNING_IN", "Running in {name}", { name: app.app_name })
            : null,
          launcher ? t("TAB_FLATPAK", "Flatpak") : null,
          t("NOW_PLAYING_CONTROLS", "Controls: {name} profile", { name: app.app_name }),
        ].filter((detail): detail is string => detail !== null)}
      />
      <FpsMultiplierControl config={app.config} onConfigChange={changeConfig} />
      <ConfigurationSection config={app.config} onConfigChange={changeConfig} />
    </Focusable>
  );
}

