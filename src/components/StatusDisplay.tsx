import { PanelSectionRow } from "@decky/ui";

interface StatusDisplayProps {
  isInstalled: boolean;
  installationStatus: string;
  losslessScalingInstalled: boolean;
  losslessScalingStatus: string;
}

export function StatusDisplay({
  isInstalled,
  installationStatus,
  losslessScalingInstalled,
  losslessScalingStatus
}: StatusDisplayProps) {
  return (
    <PanelSectionRow>
      <div style={{ marginBottom: "8px", fontSize: "14px" }}>
        <div
          style={{
            color: losslessScalingInstalled ? "#4CAF50" : "#F44336",
            fontWeight: "600",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <span style={{ fontSize: "16px" }}>
            {losslessScalingInstalled ? "✅" : "❌"}
          </span>
          {losslessScalingInstalled ? "Lossless Scaling Installed" : "Lossless Scaling Not Installed"}
        </div>
        {!losslessScalingInstalled && losslessScalingStatus && (
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
  );
}
