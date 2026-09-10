import { ButtonItem, ConfirmModal, DialogButton, Focusable, PanelSection, PanelSectionRow, gamepadDialogClasses, showModal } from "@decky/ui";
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
  onRepair: (appid: string) => Promise<boolean>;
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
  onRepair,
  onReset,
  onResetAll,
}: ConfigurationTabProps) {
  const [detailAppId, setDetailAppId] = useState<string | null>(null);
  const [focusFpsMultiplier, setFocusFpsMultiplier] = useState(false);
  const [focusDetailAction, setFocusDetailAction] = useState<"enable" | "fps" | null>(null);
  const [focusConfiguredToggle, setFocusConfiguredToggle] = useState(false);
  const enableRef = useRef<HTMLDivElement>(null);
  const closeDetails = useCallback(() => {
    setFocusFpsMultiplier(false);
    setFocusDetailAction(null);
    setDetailAppId(null);
  }, []);
  const clearFpsFocusRequest = useCallback(() => setFocusFpsMultiplier(false), []);
  const clearConfiguredToggleFocusRequest = useCallback(() => setFocusConfiguredToggle(false), []);

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

  const selectedTarget = detailAppId ? targets.find((target) => target.appid === detailAppId) : null;

  if (detailAppId === null) {
    return (
      <PanelSection title="Games">
        <GameConfigurationSelector
          targets={targets}
          runningGame={runningGame}
          onSelect={(appid) => {
            setFocusConfiguredToggle(false);
            setFocusDetailAction(targets.find((target) => target.appid === appid)?.configured ? "fps" : "enable");
            onSelect(appid);
            setDetailAppId(appid);
          }}
          onEnableAll={onEnableAll}
          onResetAll={onResetAll}
          focusConfiguredToggle={focusConfiguredToggle}
          onConfiguredToggleFocused={clearConfiguredToggleFocusRequest}
        />
      </PanelSection>
    );
  }

  const profileLabel = selectedTarget?.name || "Game profile";
  const profileTransport = selectedTarget
    ? selectedTarget.transport.kind === "flatpak"
      ? "Non-Steam · Flatpak"
      : selectedTarget.nonSteam ? "Non-Steam" : "Steam"
    : "Game";
  const profileDescription = selectedTarget
    ? `${profileTransport} · App ID ${selectedTarget.appid} · ${selectedTarget.configured ? "LSFG-VK Enabled" : "LSFG-VK not enabled"}`
    : "Game is no longer available";
  const enableProfile = async (appid: string, quitRunningGame = false) => {
    if (!(await onEnable(appid))) return;
    if (quitRunningGame) SteamClient.Apps.TerminateApp(appid, false);
    setFocusFpsMultiplier(true);
  };
  const handleProfileAction = async () => {
    if (selectedTarget?.configured) {
      await onReset();
      setFocusConfiguredToggle(true);
      closeDetails();
    } else if (detailAppId) {
      const isRunningUnconfigured = runningGame?.appid === detailAppId
        && runningGame.nonSteam === false
        && runningGame.transport.kind === "host"
        && selectedTarget?.nonSteam === false
        && selectedTarget?.transport.kind === "host"
        && !runningGame.configured;
      if (isRunningUnconfigured) {
        showModal(
          <ConfirmModal
            strTitle="Game is running"
            strDescription="Quit the game now so LSFG-VK is used on its next launch?"
            strOKButtonText="Quit and enable"
            strCancelButtonText="Enable without quitting"
            onOK={() => void enableProfile(detailAppId, true)}
            onCancel={() => void enableProfile(detailAppId)}
          />,
        );
      } else {
        await enableProfile(detailAppId);
      }
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
      {selectedTarget?.configured && selectedTarget.transport.kind === "flatpak" && selectedTarget.flatpakSupport?.support_status !== "ready" && (
        <PanelSection>
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={() => void onRepair(selectedTarget.appid)}
            >
              Repair Flatpak support
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      )}
      {selectedTarget?.configured && (
        <GameConfigurationControls
          config={config}
          onConfigChange={onConfigChange}
          autoFocusFpsMultiplier={focusFpsMultiplier}
          onFpsMultiplierFocused={clearFpsFocusRequest}
          showWorkarounds
          workaroundTarget={selectedTarget || undefined}
          onRepairWorkaround={selectedTarget ? () => onRepair(selectedTarget.appid) : undefined}
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
