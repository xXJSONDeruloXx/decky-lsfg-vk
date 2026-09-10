import { ButtonItem, Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useState } from "react";
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
  onRepair: (appid: string) => Promise<boolean>;
}

function targetDescription(game: GameTarget): string {
  if (game.transport.kind === "flatpak") return "Non-Steam · Flatpak";
  return game.nonSteam ? "Non-Steam" : "Steam";
}

export function NowPlayingTab({
  game,
  config,
  onConfigChange,
  onRepair,
}: Props) {
  const [busy, setBusy] = useState(false);
  const supportNeedsRepair =
    game.transport.kind === "flatpak" &&
    game.flatpakSupport?.support_status !== "ready";

  const handleRepair = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRepair(game.appid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Focusable>
      <PanelSection title="Now Playing">
        <PanelSectionRow>
          <Field label={game.name} description={targetDescription(game)} />
        </PanelSectionRow>
      </PanelSection>
      {supportNeedsRepair && (
        <PanelSection>
          <PanelSectionRow>
            <Field
              label="Flatpak support needs repair"
              description={game.flatpakSupport?.error || "The target runtime extension is not ready."}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ButtonItem layout="below" disabled={busy} onClick={() => void handleRepair()}>
              {busy ? "Repairing..." : "Repair Flatpak support"}
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      )}
      <GameConfigurationControls
        config={config}
        onConfigChange={onConfigChange}
        showWorkarounds={false}
      />
    </Focusable>
  );
}
