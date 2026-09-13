import { ButtonItem, Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { type GlobalConfig, type SteamBranchStatus } from "../api/lsfgApi";
import t from "../i18n/i18n";

interface SettingsTabProps {
  isInstalled: boolean;
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
  const losslessScalingAppInstalled = losslessScalingInstalled || steamBranchStatus?.installed === true;
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
        <PanelSectionRow>
          <Field
            label="Lossless Scaling"
            description={losslessScalingAppInstalled ? "Installed" : losslessScalingStatus || "Not installed"}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label="LSFG-VK" description={installationStatus} />
        </PanelSectionRow>
        {steamBranchStatus?.installed && (
          <PanelSectionRow>
            <Field
              label="Steam branch"
              description={`${steamBranchStatus.current_branch || "public"}${steamBranchStatus.needs_switch ? ` - ${steamBranchStatus.message}` : ""}`}
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
