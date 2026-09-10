import { ButtonItem, Field, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import {
  getFlatpakSupportStatus,
  setFlatpakExtensionEnabled,
  type FlatpakExtensionStatus,
  type SteamBranchStatus,
} from "../api/lsfgApi";
import { InstallationButton } from "./InstallationButton";
import { StatusDisplay } from "./StatusDisplay";
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
  flatpakRelevant: boolean;
}

function FlatpakSupportDiagnostics({ relevant }: { relevant: boolean }) {
  const [status, setStatus] = useState<FlatpakExtensionStatus | null>(null);
  const [advanced, setAdvanced] = useState(false);
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
    if (relevant) void refresh();
  }, [relevant]);

  if (!relevant || !status?.available) return null;

  const runExtensionOperation = async (version: string, enabled: boolean) => {
    const operationKey = `${enabled ? "enable" : "disable"}-${version}`;
    setOperation(operationKey);
    try {
      const result = await setFlatpakExtensionEnabled(version, enabled);
      if (!result.success) throw new Error(result.error || result.message || "Flatpak runtime update failed");
      await refresh();
    } catch (error) {
      showErrorToast("Flatpak runtime update failed", String(error));
    } finally {
      setOperation(null);
    }
  };

  const handleExtensionToggle = (version: string, enabled: boolean) => {
    void runExtensionOperation(version, enabled);
  };

  return (
    <PanelSection title="Flatpak support">
      <PanelSectionRow>
        <Field
          label="Runtime extension support"
          description={status.message || "Flatpak is available for classified targets."}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => setAdvanced((value) => !value)}>
          {advanced ? "Hide runtime details" : "Show runtime details"}
        </ButtonItem>
      </PanelSectionRow>
      {advanced && (
        <>
          {status.supported_branches.map((branch) => (
            <PanelSectionRow key={branch}>
              <ToggleField
                label={branch}
                description={
                  operation === `enable-${branch}`
                    ? "Installing..."
                    : operation === `disable-${branch}`
                      ? "Uninstalling..."
                      : status.installed_branches.includes(branch)
                        ? "Installed"
                        : "Not installed"
                }
                checked={status.installed_branches.includes(branch)}
                onChange={(enabled) => handleExtensionToggle(branch, enabled)}
                disabled={operation !== null}
              />
            </PanelSectionRow>
          ))}
        </>
      )}
    </PanelSection>
  );
}

export function SetupTab({
  isInstalled,
  installationStatus,
  losslessScalingInstalled,
  losslessScalingStatus,
  steamBranchStatus,
  isInstalling,
  isUninstalling,
  onInstall,
  onUninstall,
  flatpakRelevant,
}: SetupTabProps) {
  return (
    <>
      <PanelSection title="Setup">
        <StatusDisplay
          installationStatus={installationStatus}
          losslessScalingInstalled={losslessScalingInstalled}
          losslessScalingStatus={losslessScalingStatus}
          steamBranchStatus={steamBranchStatus}
        />
        <InstallationButton
          isInstalled={isInstalled}
          isInstalling={isInstalling}
          isUninstalling={isUninstalling}
          onInstall={onInstall}
          onUninstall={onUninstall}
        />
      </PanelSection>
      <FlatpakSupportDiagnostics relevant={flatpakRelevant} />
    </>
  );
}
