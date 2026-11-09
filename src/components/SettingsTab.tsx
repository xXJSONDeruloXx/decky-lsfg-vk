import { ButtonItem, DialogButton, Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { type GlobalConfig, type SteamBranchStatus } from "../api/lsfgApi";
import t from "../i18n/i18n";
import { showBranchSetupModal } from "./BranchSetupModal";
import { translateStatus } from "../utils/statusTranslation";

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
      <PanelSection title={t("SETTINGS_TITLE", "Settings")}>
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
              <div style={{ fontWeight: 600 }}>{t("SETTINGS_SETUP_INCOMPLETE", "Setup incomplete")}</div>
              <div style={{ marginTop: "6px", lineHeight: 1.35 }}>
                {branchSetupIncomplete ? (
                  <>{t("SETTINGS_BRANCH_NOTICE", "Lossless Scaling is on {selectedBranch}. Select the {targetBranch} branch before launching games.", { selectedBranch, targetBranch })}</>
                ) : (
                  <>{t("SETTINGS_NOT_READY_NOTICE", "Lossless Scaling is installed, but its LSFG-VK runtime is not ready yet.")}</>
                )}
              </div>
              {branchSetupIncomplete && (
                <DialogButton
                  onClick={showBranchSetupModal}
                  style={{ width: "100%", marginTop: "10px" }}
                >
                  {t("SETTINGS_LEARN_MORE", "Learn more")}
                </DialogButton>
              )}
            </div>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <Field
            label={t("SETTINGS_LOSSLESS_SCALING", "Lossless Scaling")}
            description={losslessScalingInstalled ? t("SETTINGS_INSTALLED", "Installed") : translateStatus(losslessScalingStatus) || t("SETTINGS_NOT_INSTALLED", "Not installed")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label={t("SETTINGS_LSFG_VK", "LSFG-VK")} description={translateStatus(installationStatus)} />
        </PanelSectionRow>
        {steamBranchStatus?.installed && !setupIncomplete && (
          <PanelSectionRow>
            <Field
              label={t("SETTINGS_STEAM_BRANCH", "Steam branch")}
              description={`${steamBranchStatus.selected_branch || "public"}${steamBranchStatus.needs_switch ? ` - ${translateStatus(steamBranchStatus.message)}` : ""}`}
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
          <PanelSection title={t("SETTINGS_GLOBAL_TITLE", "Global settings")}>
            <PanelSectionRow>
              <ToggleField
                label={t("SETTINGS_FP16", "FP16 Acceleration")}
                checked={!globalConfig.no_fp16}
                onChange={(value) => void onGlobalConfigChange({ ...globalConfig, no_fp16: !value })}
              />
            </PanelSectionRow>
          </PanelSection>
          <PanelSection title={t("SETTINGS_ADVANCED_TITLE", "Advanced")}>
            <PanelSectionRow>
              <ToggleField
                label={t("SETTINGS_SHOW_CONFIG_FILE_TAB", "Show config file tab")}
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
