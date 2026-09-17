import { ButtonItem, DialogButton, Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { type GlobalConfig, type SteamBranchStatus } from "../api/lsfgApi";
import t from "../i18n/i18n";
import { showBranchSetupModal } from "./BranchSetupModal";

interface SettingsTabProps {
  isInstalled: boolean;
  setupComplete: boolean;
  installationStatus: string;
  losslessScalingInstalled: boolean;
  losslessScalingStatus: string;
  steamBranchStatus: SteamBranchStatus | null;
  isInstalling: boolean;
  isUninstalling: boolean;
  globalConfig: GlobalConfig;
  showDebugTab: boolean;
  onGlobalConfigChange: (config: GlobalConfig) => Promise<boolean>;
  onShowDebugTabChange: (value: boolean) => void;
  onInstall: () => void;
  onUninstall: () => void;
}

export function SettingsTab(props: SettingsTabProps) {
  const {
    isInstalled,
    setupComplete,
    installationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    isInstalling,
    isUninstalling,
    globalConfig,
    showDebugTab,
    onGlobalConfigChange,
    onShowDebugTabChange,
    onInstall,
    onUninstall,
  } = props;
  const setupIncomplete = isInstalled && !setupComplete;
  const branchSetupIncomplete = Boolean(
    setupIncomplete && steamBranchStatus?.installed && steamBranchStatus.needs_switch,
  );
  const selectedBranch = steamBranchStatus?.selected_branch || "the current";
  const targetBranch = steamBranchStatus?.target_branch || "lsfg-vk";
  const buttonLabel = isInstalling
    ? t("INSTALL_INSTALLING", "Installing...")
    : isUninstalling
      ? t("INSTALL_UNINSTALLING", "Uninstalling...")
      : isInstalled
        ? t("INSTALL_UNINSTALL_BTN", "Uninstall LSFG-VK")
        : t("INSTALL_INSTALL_BTN", "Install LSFG-VK");

  return (
    <>
      <PanelSection title="Settings">
        {setupIncomplete && (
          <PanelSectionRow>
            <div
              role="alert"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px",
                border: "1px solid #e55353",
                borderRadius: "4px",
                background: "rgba(128, 24, 24, 0.32)",
                color: "#ffd7d7",
              }}
            >
              <div style={{ fontWeight: 600 }}>Setup incomplete</div>
              <div style={{ marginTop: "6px", lineHeight: 1.35 }}>
                {branchSetupIncomplete ? (
                  <>Lossless Scaling is on <strong>{selectedBranch}</strong>. Select the <strong>{targetBranch}</strong> branch before launching games.</>
                ) : (
                  <>Lossless Scaling is installed, but its LSFG-VK runtime is not ready yet.</>
                )}
              </div>
              {branchSetupIncomplete && (
                <DialogButton
                  onClick={showBranchSetupModal}
                  style={{ width: "100%", marginTop: "10px" }}
                >
                  Learn more
                </DialogButton>
              )}
            </div>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <Field
            label="Lossless Scaling"
            description={losslessScalingInstalled ? "Installed" : losslessScalingStatus || "Not installed"}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label="LSFG-VK" description={installationStatus} />
        </PanelSectionRow>
        {steamBranchStatus?.installed && !setupIncomplete && (
          <PanelSectionRow>
            <Field
              label="Steam branch"
              description={`${steamBranchStatus.selected_branch || "public"}${steamBranchStatus.needs_switch ? ` - ${steamBranchStatus.message}` : ""}`}
            />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={isInstalled ? onUninstall : onInstall}
            disabled={isInstalling || isUninstalling}
          >
            {buttonLabel}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      {isInstalled && (
        <>
          <PanelSection title="Global settings">
            <PanelSectionRow>
              <ToggleField
                label="FP16 Acceleration"
                checked={!globalConfig.no_fp16}
                onChange={(value) => void onGlobalConfigChange({ ...globalConfig, no_fp16: !value })}
              />
            </PanelSectionRow>
          </PanelSection>
          <PanelSection title="Advanced">
            <PanelSectionRow>
              <ToggleField
                label="Show config file tab"
                checked={showDebugTab}
                onChange={onShowDebugTabChange}
              />
            </PanelSectionRow>
          </PanelSection>
        </>
      )}
    </>
  );
}
