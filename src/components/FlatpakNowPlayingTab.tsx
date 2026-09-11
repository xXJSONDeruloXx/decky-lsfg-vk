import { Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import type { FlatpakApp, LsfgConfig } from "../api/lsfgApi";
import type { GameTarget } from "../hooks/useGameConfiguration";
import { ConfigurationSection } from "./ConfigurationSection";
import { FpsMultiplierControl } from "./FpsMultiplierControl";

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
      <PanelSection title="Now Playing">
        <PanelSectionRow>
          <Field
            label={launcher?.name || app.app_name}
            description={launcher
              ? `${launcher.nonSteam ? "Steam shortcut" : "Steam"} · Running in ${app.app_name} · Flatpak`
              : `Flatpak · ${app.app_id}`}
          />
        </PanelSectionRow>
        {launcher && (
          <PanelSectionRow>
            <Field label="Controls" description={`${app.app_name} profile · ${app.app_id}`} />
          </PanelSectionRow>
        )}
      </PanelSection>
      <FpsMultiplierControl config={app.config} onConfigChange={changeConfig} />
      <ConfigurationSection config={app.config} onConfigChange={changeConfig} />
    </Focusable>
  );
}
