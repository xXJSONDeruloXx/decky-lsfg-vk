import { Field, PanelSectionRow } from "@decky/ui";
import type { SteamBranchStatus } from "../api/lsfgApi";

interface StatusDisplayProps {
  installationStatus: string;
  losslessScalingInstalled: boolean;
  losslessScalingStatus: string;
  steamBranchStatus: SteamBranchStatus | null;
}

export function StatusDisplay({
  installationStatus,
  losslessScalingInstalled,
  losslessScalingStatus,
  steamBranchStatus
}: StatusDisplayProps) {
  const losslessScalingAppInstalled = losslessScalingInstalled || steamBranchStatus?.installed === true;

  return (
    <>
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
    </>
  );
}
