import { ButtonItem, Field, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [focusFpsMultiplier, setFocusFpsMultiplier] = useState(false);
  const [focusBackToGames, setFocusBackToGames] = useState(false);
  const backToGamesRef = useRef<HTMLDivElement>(null);
  const promptedRunningAppId = useRef<string | null>(null);
  const closeDetails = useCallback(() => {
    setFocusFpsMultiplier(false);
    setFocusBackToGames(false);
    setDetailAppId(null);
  }, []);
  const clearFpsFocusRequest = useCallback(() => setFocusFpsMultiplier(false), []);

  useEffect(() => {
    if (!focusBackToGames) return;
    const frame = requestAnimationFrame(() => {
      backToGamesRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus();
      setFocusBackToGames(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusBackToGames]);

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
            setFocusBackToGames(true);
            onSelect(appid);
            setDetailAppId(appid);
          }}
          onResetAll={onResetAll}
        />
      </PanelSection>
    );
  }

  const profileLabel = selectedTarget?.name || "Game profile";
  const profileDescription = selectedTarget
    ? `${selectedTarget.nonSteam ? "Non-Steam" : "Steam"} · App ID ${selectedTarget.appid} · ${selectedTarget.configured ? "Configured" : "Not configured"}`
    : "Game is no longer available";

  return (
    <Focusable onCancelButton={closeDetails}>
      <PanelSection title="Game Profile">
        <PanelSectionRow>
          <Field label={profileLabel} description={profileDescription} />
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable ref={backToGamesRef} noFocusRing>
            <ButtonItem layout="below" onClick={closeDetails}>Back to games</ButtonItem>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
      {selectedTarget?.configured && (
        <GameConfigurationControls
          config={config}
          onConfigChange={onConfigChange}
          autoFocusFpsMultiplier={focusFpsMultiplier}
          onFpsMultiplierFocused={clearFpsFocusRequest}
        />
      )}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={async () => {
            if (selectedTarget?.configured) {
              promptedRunningAppId.current = detailAppId;
              await onReset();
              closeDetails();
            } else if (detailAppId) {
              if (await onEnable(detailAppId)) setFocusFpsMultiplier(true);
            }
          }}
        >
          {selectedTarget?.configured ? "Remove profile" : "Enable for next launch"}
        </ButtonItem>
      </PanelSectionRow>
    </Focusable>
  );
}
