import { ButtonItem, PanelSectionRow } from "@decky/ui";
import type { SteamBranchStatus } from "../api/lsfgApi";

interface StatusDisplayProps {
  isInstalled: boolean;
  installationStatus: string;
  losslessScalingInstalled: boolean;
  losslessScalingStatus: string;
  steamBranchStatus: SteamBranchStatus | null;
  isSwitchingSteamBranch: boolean;
  onSelectLosslessScalingBranch: () => void;
}

export function StatusDisplay({
  isInstalled,
  installationStatus,
  losslessScalingInstalled,
  losslessScalingStatus,
  steamBranchStatus,
  isSwitchingSteamBranch,
  onSelectLosslessScalingBranch
}: StatusDisplayProps) {
  const losslessScalingAppInstalled = losslessScalingInstalled || steamBranchStatus?.installed === true;

  return (
    <>
      <PanelSectionRow>
        <div style={{ marginBottom: "8px", fontSize: "14px" }}>
          <div
            style={{
              color: losslessScalingAppInstalled ? "#4CAF50" : "#F44336",
              fontWeight: "600",
              marginBottom: "6px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span style={{ fontSize: "16px" }}>
              {losslessScalingAppInstalled ? "✅" : "❌"}
            </span>
            {losslessScalingAppInstalled ? "Lossless Scaling Installed" : "Lossless Scaling Not Installed"}
          </div>
          {!losslessScalingAppInstalled && losslessScalingStatus && (
            <div style={{ color: "#B8B8B8", fontSize: "12px", margin: "0 0 6px 22px" }}>
              {losslessScalingStatus}
            </div>
          )}
          <div
            style={{
              color: isInstalled ? "#4CAF50" : "#FF9800",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span style={{ fontSize: "16px" }}>
              {isInstalled ? "✅" : "❌"}
            </span>
            {installationStatus}
          </div>
        </div>
      </PanelSectionRow>

      {steamBranchStatus?.installed && (
        <PanelSectionRow>
          <div style={{ width: "100%" }}>
            <div
              style={{
                color: steamBranchStatus.needs_switch ? "#FF9800" : "#4CAF50",
                fontSize: "12px",
                margin: "0 0 6px 22px"
              }}
            >
              Steam branch: {steamBranchStatus.current_branch || "public"}
              {steamBranchStatus.needs_switch && (
                <div style={{ color: "#B8B8B8", marginTop: "3px" }}>
                  {steamBranchStatus.message}
                </div>
              )}
            </div>
            {steamBranchStatus.needs_switch && (
              <ButtonItem
                layout="below"
                onClick={onSelectLosslessScalingBranch}
                disabled={isSwitchingSteamBranch}
              >
                {isSwitchingSteamBranch ? "Selecting lsfg-vk..." : "Use lsfg-vk Steam branch"}
              </ButtonItem>
            )}
          </div>
        </PanelSectionRow>
      )}
    </>
  );
}
