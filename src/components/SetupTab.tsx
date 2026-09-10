import { ButtonItem, ConfirmModal, Field, PanelSection, PanelSectionRow, ToggleField, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import {
  getFlatpakSupportStatus,
  removePluginOwnedFlatpakExtensions,
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
        owned_branches: [],
        ownership_uncertain: false,
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

  const confirmDisable = (version: string) => {
    showModal(
      <ConfirmModal
        strTitle={`Disable Flatpak runtime ${version}?`}
        strDescription="Only runtime extensions installed by this plugin can be removed. Pre-existing extensions are preserved."
        strOKButtonText="Disable"
        strCancelButtonText="Cancel"
        onOK={() => void runExtensionOperation(version, false)}
        onCancel={() => {}}
      />,
    );
  };

  const handleExtensionToggle = (version: string, enabled: boolean) => {
    const installed = status.installed_branches.includes(version);
    const owned = status.owned_branches.includes(version);
    if (!enabled && installed && !owned) {
      showErrorToast(
        "Flatpak runtime preserved",
        `${version} was not installed by this plugin, so it will remain installed.`,
      );
      void refresh();
      return;
    }
    if (!enabled && installed && owned) {
      confirmDisable(version);
      return;
    }
    void runExtensionOperation(version, enabled);
  };

  const confirmCleanup = () => {
    showModal(
      <ConfirmModal
        strTitle="Remove plugin-installed Flatpak extensions?"
        strDescription="Shared runtime branches recorded as installed by this plugin will be removed. Existing unowned branches are preserved."
        strOKButtonText="Remove extensions"
        strCancelButtonText="Cancel"
        onOK={async () => {
          setOperation("cleanup");
          try {
            const result = await removePluginOwnedFlatpakExtensions();
            if (!result.success) throw new Error(result.error || result.message || "Flatpak cleanup failed");
            await refresh();
          } catch (error) {
            showErrorToast("Flatpak cleanup failed", String(error));
          } finally {
            setOperation(null);
          }
        }}
        onCancel={() => {}}
      />,
    );
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
                        ? status.owned_branches.includes(branch)
                          ? "Installed · plugin-owned"
                          : "Installed · pre-existing (preserved)"
                        : "Not installed"
                }
                checked={status.installed_branches.includes(branch)}
                onChange={(enabled) => handleExtensionToggle(branch, enabled)}
                disabled={operation !== null || status.ownership_uncertain}
              />
            </PanelSectionRow>
          ))}
          {status.ownership_uncertain && (
            <PanelSectionRow>
              <Field label="Ownership metadata is uncertain" description="Cleanup is disabled until the metadata is repaired." />
            </PanelSectionRow>
          )}
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={operation !== null || status.ownership_uncertain || status.owned_branches.length === 0}
              onClick={confirmCleanup}
            >
              {operation === "cleanup" ? "Removing..." : "Remove plugin-installed extensions"}
            </ButtonItem>
          </PanelSectionRow>
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
