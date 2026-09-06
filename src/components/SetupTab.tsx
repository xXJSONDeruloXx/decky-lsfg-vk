import { PanelSection } from "@decky/ui";
import type { SteamBranchStatus } from "../api/lsfgApi";
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
}: SetupTabProps) {
  return (
    <PanelSection title="Setup">
      <StatusDisplay
        isInstalled={isInstalled}
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
  );
}
