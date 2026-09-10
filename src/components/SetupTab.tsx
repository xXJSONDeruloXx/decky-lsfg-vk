import { ButtonItem, Field, PanelSection, PanelSectionRow } from "@decky/ui";
import { type FlatpakExtensionStatus, type SteamBranchStatus } from "../api/lsfgApi";
import t from "../i18n/i18n";

interface SetupTabProps {
  isInstalled: boolean;
  installationStatus: string;
  losslessScalingInstalled: boolean;
  losslessScalingStatus: string;
  flatpakStatus: FlatpakExtensionStatus | null;
  steamBranchStatus: SteamBranchStatus | null;
  isInstalling: boolean;
  isUninstalling: boolean;
  isRepairingFlatpak: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onRepairFlatpak: () => void;
}

export function SetupTab(props: SetupTabProps) {
  const {
    isInstalled,
    installationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    flatpakStatus,
    steamBranchStatus,
    isInstalling,
    isUninstalling,
    isRepairingFlatpak,
    onInstall,
    onUninstall,
    onRepairFlatpak,
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
      <PanelSectionRow>
        <Field
          label="Flatpak support"
          description={
            !flatpakStatus
              ? "Status unavailable"
              : !flatpakStatus.available
                ? "Flatpak is not available"
                : flatpakStatus.ready
                  ? "Configured for 23.08, 24.08, and 25.08"
                  : flatpakStatus.error || "Needs repair"
          }
        />
      </PanelSectionRow>
      {flatpakStatus?.available && !flatpakStatus.ready && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={onRepairFlatpak}
            disabled={isRepairingFlatpak || isInstalling || isUninstalling}
          >
            {isRepairingFlatpak ? "Repairing Flatpak support..." : "Repair Flatpak support"}
          </ButtonItem>
        </PanelSectionRow>
      )}
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
  );
}
