import { ButtonItem, Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { ConfigurationData } from "../config/configSchema";
import { GameTarget } from "../hooks/useGameConfiguration";
import { GameConfigurationControls } from "./GameConfigurationControls";
import { GameConfigurationSelector } from "./GameConfigurationSelector";

interface ConfigurationTabProps {
  config: ConfigurationData;
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  onEnable: (appid: string) => Promise<boolean>;
  onReset: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

export function ConfigurationTab({
  config,
  targets,
  runningGame,
  onSelect,
  onConfigChange,
  onEnable,
  onReset,
  onResetAll,
}: ConfigurationTabProps) {
  const [detailAppId, setDetailAppId] = useState<string | null>(null);
  const promptedRunningAppId = useRef<string | null>(null);

  useEffect(() => {
    if (!runningGame || runningGame.configured) {
      promptedRunningAppId.current = null;
      return;
    }
    if (promptedRunningAppId.current !== runningGame.appid && detailAppId === null) {
      promptedRunningAppId.current = runningGame.appid;
      setDetailAppId(runningGame.appid);
    }
  }, [detailAppId, runningGame?.appid, runningGame?.configured]);

  const selectedTarget = detailAppId ? targets.find((target) => target.appid === detailAppId) : null;

  if (detailAppId === null) {
    return (
      <PanelSection title="Games">
        <GameConfigurationSelector
          targets={targets}
          runningGame={runningGame}
          onSelect={(appid) => {
            onSelect(appid);
            setDetailAppId(appid);
          }}
          onResetAll={onResetAll}
        />
      </PanelSection>
    );
  }

  const profileLabel = selectedTarget?.name || "Game profile";
  const running = selectedTarget?.appid === runningGame?.appid;
  const profileDescription = selectedTarget
    ? `${selectedTarget.nonSteam ? "Non-Steam" : "Steam"} · App ID ${selectedTarget.appid} · ${selectedTarget.configured ? running && !runningGame?.configured ? "Profile saved · applies next launch" : "Profile active" : "Not configured · changes apply next launch"}`
    : "Game is no longer available";

  return (
    <Focusable onCancelButton={() => setDetailAppId(null)}>
      <PanelSection title="Game Profile">
        <PanelSectionRow>
          <Field label={profileLabel} description={profileDescription} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => setDetailAppId(null)}>Back to games</ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      <GameConfigurationControls config={config} onConfigChange={onConfigChange} />
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={async () => {
            if (selectedTarget?.configured) {
              promptedRunningAppId.current = detailAppId;
              await onReset();
              setDetailAppId(null);
            } else if (detailAppId) {
              await onEnable(detailAppId);
            }
          }}
        >
          {selectedTarget?.configured ? "Remove profile" : "Enable for next launch"}
        </ButtonItem>
      </PanelSectionRow>
    </Focusable>
  );
}
