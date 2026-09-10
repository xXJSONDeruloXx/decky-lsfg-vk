import { ButtonItem, Field, PanelSection, PanelSectionRow } from "@decky/ui";
import { type SteamBranchStatus } from "../api/lsfgApi";
import t from "../i18n/i18n";
import { FlatpakSetupSection } from "./FlatpakSetupSection";

interface SetupTabProps {
  isInstalled: boolean;
  installationStatus: string;
  losslessScalingInstalled: boolean;
  losslessScalingStatus: string;
  steamBranchStatus: SteamBranchStatus | null;
  isInstalling: boolean;
  isUninstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}

export function SetupTab(props: SetupTabProps) {
  const {
    isInstalled,
    installationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    isInstalling,
    isUninstalling,
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
      <PanelSection title="Setup">
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
      <FlatpakSetupSection enabled={isInstalled} />
    </>
  );
}
