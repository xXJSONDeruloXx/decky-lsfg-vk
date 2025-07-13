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
            fontWeight: "bold",
            marginBottom: "4px"
          }}
        >
          {dllDetectionStatus}
        </div>
        <div
          style={{
            color: isInstalled ? "#4CAF50" : "#FF9800"
          }}
        >
          Status: {installationStatus}
        </div>
      </div>
    </PanelSectionRow>
  );
}
