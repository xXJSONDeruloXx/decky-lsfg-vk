import { ButtonItem, ConfirmModal, Field, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import {
  getFlatpakSupportStatus,
  removePluginOwnedFlatpakExtensions,
  type FlatpakExtensionStatus,
  type SteamBranchStatus,
} from "../api/lsfgApi";
import { InstallationButton } from "./InstallationButton";
import { StatusDisplay } from "./StatusDisplay";

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
  const [busy, setBusy] = useState(false);

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

  const confirmCleanup = () => {
    showModal(
      <ConfirmModal
        strTitle="Remove plugin-installed Flatpak extensions?"
        strDescription="Shared runtime branches recorded as installed by this plugin will be removed. Existing unowned branches are preserved."
        strOKButtonText="Remove extensions"
        strCancelButtonText="Cancel"
        onOK={async () => {
          setBusy(true);
          try {
            await removePluginOwnedFlatpakExtensions();
            await refresh();
          } finally {
            setBusy(false);
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
              <Field
                label={branch}
                description={
                  status.installed_branches.includes(branch)
                    ? "Installed" + (status.owned_branches.includes(branch) ? " · plugin-owned" : "")
                    : "Not installed"
                }
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
              disabled={busy || status.ownership_uncertain || status.owned_branches.length === 0}
              onClick={confirmCleanup}
            >
              {busy ? "Removing..." : "Remove plugin-installed extensions"}
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
