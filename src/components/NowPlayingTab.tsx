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
  onEnable: (appid: string) => Promise<boolean>;
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
  onEnable,
  onRepair,
}: Props) {
  const [busy, setBusy] = useState(false);
  const supportNeedsRepair =
    game.configured &&
    game.transport.kind === "flatpak" &&
    game.flatpakSupport?.support_status !== "ready";

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onEnable(game.appid);
    } finally {
      setBusy(false);
    }
  };

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
      {!game.configured && (
        <PanelSection>
          <PanelSectionRow>
            <Field
              label="LSFG-VK is available"
              description="This target is not enabled yet. Create its AppID profile before the next launch."
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ButtonItem layout="below" disabled={busy} onClick={() => void handleEnable()}>
              {busy ? "Enabling..." : "Enable LSFG-VK"}
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      )}
      {game.configured && supportNeedsRepair && (
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
      {game.configured && (
        <GameConfigurationControls
          config={config}
          onConfigChange={onConfigChange}
          showWorkarounds={false}
        />
      )}
    </Focusable>
  );
}
