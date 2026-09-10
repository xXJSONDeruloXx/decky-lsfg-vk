import { Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import type { FlatpakApp, LsfgConfig, WorkaroundState } from "../api/lsfgApi";
import { ConfigurationSection } from "./ConfigurationSection";
import { FlatpakWorkaroundsSection } from "./FlatpakWorkaroundsSection";
import { FpsMultiplierControl } from "./FpsMultiplierControl";

interface Props {
  app: FlatpakApp;
  busy: boolean;
  onConfigChange: (appId: string, config: LsfgConfig) => Promise<boolean>;
  onWorkaroundChange: (appId: string, state: WorkaroundState) => Promise<boolean>;
}

export function FlatpakNowPlayingTab({ app, busy, onConfigChange, onWorkaroundChange }: Props) {
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
          <Field label={app.app_name} description={`Flatpak · ${app.app_id}`} />
        </PanelSectionRow>
      </PanelSection>
      <FpsMultiplierControl config={app.config} onConfigChange={changeConfig} />
      <ConfigurationSection config={app.config} onConfigChange={changeConfig} />
      <FlatpakWorkaroundsSection
        state={app.workarounds}
        disabled={busy}
        onChange={(state) => onWorkaroundChange(app.app_id, state)}
      />
    </Focusable>
  );
}
