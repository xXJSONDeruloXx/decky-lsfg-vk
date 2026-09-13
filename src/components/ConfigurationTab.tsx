import { ButtonItem, ConfirmModal, DialogButton, Field, Focusable, PanelSection, PanelSectionRow, gamepadDialogClasses, showModal } from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import type { GameTarget, KnownGameSource } from "../utils/gameTargets";
import { sourceLabel } from "../utils/gameTargets";
import { GameConfigurationControls } from "./GameConfigurationControls";
import { GameConfigurationSelector } from "./GameConfigurationSelector";
import { ProfileDetails } from "./ProfileDetails";

interface ConfigurationTabProps {
  title: string;
  source: KnownGameSource;
  config: ConfigurationData;
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
  onConfigChange: (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
    cleanupLaunchOptions?: boolean,
  ) => Promise<void>;
  onEnable: (appid: string) => Promise<boolean>;
  onEnableAll: (source: KnownGameSource) => Promise<void>;
  bulkOperationBusy: boolean;
  onRepair: (appid: string) => Promise<boolean>;
  onReset: () => Promise<void>;
  onResetAll: (source: KnownGameSource) => Promise<void>;
}

export function ConfigurationTab({
  title,
  source,
  config,
  targets,
  runningGame,
  onSelect,
  onConfigChange,
  onEnable,
  onEnableAll,
  bulkOperationBusy,
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
      <>
        <PanelSection title={title}>
          <GameConfigurationSelector
            targets={targets}
            runningGame={runningGame}
            source={source}
            bulkOperationBusy={bulkOperationBusy}
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
      </>
    );
  }

  const profileLabel = selectedTarget?.name || "Game profile";
  const profileTransport = selectedTarget ? sourceLabel(selectedTarget.source) : sourceLabel(source);
  const profileDescription = selectedTarget
    ? `${profileTransport} · App ID ${selectedTarget.appid} · ${selectedTarget.configured ? "LSFG-VK Enabled" : "LSFG-VK not enabled"}${selectedTarget.source === "unknown" ? " · Bulk actions exclude this profile" : ""}`
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
        && runningGame.source === "steam"
        && selectedTarget?.source === "steam"
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
                aria-label={`Back to ${title}`}
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
            {selectedTarget.source === "unknown" ? (
              <Field
                label="Target source unavailable"
                description="Refresh Steam and try again before enabling this target."
              />
            ) : (
              <Focusable ref={enableRef} noFocusRing>
                <ButtonItem layout="below" onClick={handleProfileAction}>Enable for next launch</ButtonItem>
              </Focusable>
            )}
          </PanelSectionRow>
        )}
      </PanelSection>
      {selectedTarget?.configured && (
        <GameConfigurationControls
          config={config}
          onConfigChange={(field, value) => onConfigChange(field, value, selectedTarget?.source !== "unknown")}
          autoFocusFpsMultiplier={focusFpsMultiplier}
          onFpsMultiplierFocused={clearFpsFocusRequest}
          showWorkarounds={selectedTarget.source !== "unknown"}
          workaroundTarget={selectedTarget.source !== "unknown" ? selectedTarget : undefined}
          onRepairWorkaround={selectedTarget.source !== "unknown" ? () => onRepair(selectedTarget.appid) : undefined}
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
