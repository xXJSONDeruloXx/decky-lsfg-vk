import { ButtonItem, DialogButton, Focusable, PanelSection, PanelSectionRow, gamepadDialogClasses } from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import { GameTarget } from "../hooks/useGameConfiguration";
import { GameConfigurationControls } from "./GameConfigurationControls";
import { GameConfigurationSelector } from "./GameConfigurationSelector";
import { ProfileDetails } from "./ProfileDetails";

interface ConfigurationTabProps {
  config: ConfigurationData;
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  onEnable: (appid: string) => Promise<boolean>;
  onEnableAll: () => Promise<void>;
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
  onEnableAll,
  onReset,
  onResetAll,
}: ConfigurationTabProps) {
  const [detailAppId, setDetailAppId] = useState<string | null>(null);
  const [focusFpsMultiplier, setFocusFpsMultiplier] = useState(false);
  const [focusDetailAction, setFocusDetailAction] = useState<"enable" | "fps" | null>(null);
  const enableRef = useRef<HTMLDivElement>(null);
  const promptedRunningAppId = useRef<string | null>(null);
  const closeDetails = useCallback(() => {
    setFocusFpsMultiplier(false);
    setFocusDetailAction(null);
    setDetailAppId(null);
  }, []);
  const clearFpsFocusRequest = useCallback(() => setFocusFpsMultiplier(false), []);

  useEffect(() => {
    if (!focusDetailAction) return;
    if (focusDetailAction === "fps") {
      setFocusFpsMultiplier(true);
      setFocusDetailAction(null);
      return;
    }
    const frame = requestAnimationFrame(() => {
      enableRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus();
      setFocusDetailAction(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusDetailAction]);

  useEffect(() => {
    if (!runningGame || runningGame.configured) {
      promptedRunningAppId.current = null;
      return;
    }
    if (promptedRunningAppId.current !== runningGame.appid && detailAppId === null) {
      promptedRunningAppId.current = runningGame.appid;
      setFocusDetailAction("enable");
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
            setFocusDetailAction(targets.find((target) => target.appid === appid)?.configured ? "fps" : "enable");
            onSelect(appid);
            setDetailAppId(appid);
          }}
          onEnableAll={onEnableAll}
          onResetAll={onResetAll}
        />
      </PanelSection>
    );
  }

  const profileLabel = selectedTarget?.name || "Game profile";
  const profileDescription = selectedTarget
    ? `${selectedTarget.nonSteam ? "Non-Steam" : "Steam"} · App ID ${selectedTarget.appid} · ${selectedTarget.configured ? "LSFG-VK Enabled" : "LSFG-VK not enabled"}`
    : "Game is no longer available";
  const handleProfileAction = async () => {
    if (selectedTarget?.configured) {
      promptedRunningAppId.current = detailAppId;
      await onReset();
      closeDetails();
    } else if (detailAppId && await onEnable(detailAppId)) {
      setFocusFpsMultiplier(true);
    }
  };

  return (
    <Focusable onCancelButton={closeDetails}>
      <PanelSection>
        <PanelSectionRow>
          <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Focusable noFocusRing style={{ flex: "none" }}>
            <DialogButton
              aria-label="Back to games"
              onClick={closeDetails}
              style={{
                width: "48px",
                minWidth: "48px",
                height: "24px",
                minHeight: "24px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FaArrowLeft />
            </DialogButton>
            </Focusable>
            <div
              className={gamepadDialogClasses.FieldLabel}
              style={{ flex: 1, minWidth: 0, marginLeft: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {profileLabel}
            </div>
          </div>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection>
        {!selectedTarget?.configured && selectedTarget && (
          <PanelSectionRow>
            <Focusable ref={enableRef} noFocusRing>
              <ButtonItem layout="below" onClick={handleProfileAction}>Enable for next launch</ButtonItem>
            </Focusable>
          </PanelSectionRow>
        )}
      </PanelSection>
      {selectedTarget?.configured && (
        <GameConfigurationControls
          config={config}
          onConfigChange={onConfigChange}
          autoFocusFpsMultiplier={focusFpsMultiplier}
          onFpsMultiplierFocused={clearFpsFocusRequest}
        />
      )}
      {selectedTarget?.configured && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={handleProfileAction}>Remove profile</ButtonItem>
        </PanelSectionRow>
      )}
      <ProfileDetails description={profileDescription} />
    </Focusable>
  );
}
