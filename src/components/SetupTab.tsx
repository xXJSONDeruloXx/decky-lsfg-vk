import { ButtonItem, Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import {
  getFlatpakSupportStatus,
  setFlatpakExtensionEnabled,
  type FlatpakExtensionStatus,
  type SteamBranchStatus,
} from "../api/lsfgApi";
import t from "../i18n/i18n";
import { showErrorToast } from "../utils/toastUtils";

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

function FlatpakSupportDiagnostics() {
  const [status, setStatus] = useState<FlatpakExtensionStatus | null>(null);
  const [operation, setOperation] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setStatus(await getFlatpakSupportStatus());
    } catch (error) {
      setStatus({
        success: false,
        message: "",
        error: String(error),
        available: false,
        extension_id: "",
        supported_branches: [],
        installed_branches: [],
      });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!status?.available) return null;

  const setEnabled = async (branch: string, enabled: boolean) => {
    setOperation(`${enabled ? "enable" : "disable"}-${branch}`);
    try {
      const result = await setFlatpakExtensionEnabled(branch, enabled);
      if (!result.success) throw new Error(result.error || result.message || "Flatpak runtime update failed");
      await refresh();
    } catch (error) {
      showErrorToast("Flatpak runtime update failed", String(error));
    } finally {
      setOperation(null);
    }
  };

  return (
    <PanelSection title="Flatpak runtimes">
      <PanelSectionRow>
        <Field
          label="LSFG-VK runtime extensions"
          description={status.message || "Toggle a branch to install or uninstall it."}
        />
      </PanelSectionRow>
      {status.supported_branches.map((branch) => {
        const installed = status.installed_branches.includes(branch);
        const pending = operation?.endsWith(`-${branch}`);
        return (
          <PanelSectionRow key={branch}>
            <ToggleField
              label={branch}
              description={pending ? (operation?.startsWith("enable") ? "Installing..." : "Uninstalling...") : installed ? "Installed" : "Not installed"}
              checked={installed}
              onChange={(enabled) => void setEnabled(branch, enabled)}
              disabled={operation !== null}
            />
          </PanelSectionRow>
        );
      })}
    </PanelSection>
  );
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
      <FlatpakSupportDiagnostics />
    </>
  );
}
