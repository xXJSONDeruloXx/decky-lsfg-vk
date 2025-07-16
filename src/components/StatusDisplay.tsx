import { PanelSectionRow } from "@decky/ui";

interface StatusDisplayProps {
  dllDetected: boolean;
  dllDetectionStatus: string;
  isInstalled: boolean;
  installationStatus: string;
}

export function StatusDisplay({
  dllDetected,
  dllDetectionStatus,
  isInstalled,
  installationStatus
}: StatusDisplayProps) {
  return (
    <PanelSectionRow>
      <div style={{ marginBottom: "8px", fontSize: "14px" }}>
        <div
          style={{
            color: dllDetected ? "#4CAF50" : "#F44336",
            fontWeight: "600",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <span style={{ fontSize: "16px" }}>
            {dllDetected ? "✅" : "❌"}
          </span>
          {dllDetectionStatus}
        </div>
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
