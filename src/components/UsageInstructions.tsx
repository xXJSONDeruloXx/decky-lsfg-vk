import { PanelSectionRow } from "@decky/ui";

interface UsageInstructionsProps {
  multiplier: number;
}

export function UsageInstructions({ multiplier }: UsageInstructionsProps) {
  return (
    <PanelSectionRow>
      <div
        style={{
          fontSize: "13px",
          marginTop: "12px",
          padding: "8px",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderRadius: "4px"
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "6px" }}>
          Usage Instructions:
        </div>
        <div style={{ marginBottom: "4px" }}>
          Option 1: Use the lsfg script (recommended):
        </div>
        <div
          style={{
            fontFamily: "monospace",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            padding: "4px",
            borderRadius: "2px",
            fontSize: "12px",
            marginBottom: "6px"
          }}
        >
          ~/lsfg %COMMAND%
        </div>
        <div style={{ marginBottom: "4px" }}>
          Option 2: Manual environment variables:
        </div>
        <div
          style={{
            fontFamily: "monospace",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            padding: "4px",
            borderRadius: "2px",
            fontSize: "12px",
            marginBottom: "6px"
          }}
        >
          ENABLE_LSFG=1 LSFG_MULTIPLIER={multiplier} %COMMAND%
        </div>
        <div style={{ fontSize: "11px", opacity: 0.8 }}>
          The lsfg script uses your current configuration settings.
          <br />
          • ENABLE_LSFG=1 - Enables frame generation
          <br />
          • LSFG_MULTIPLIER=2-4 - FPS multiplier (start with 2)
          <br />
          • LSFG_FLOW_SCALE=0.25-1.0 - Flow scale (for performance)
          <br />
          • LSFG_HDR=1 - HDR mode (only if using HDR)
          <br />
          • MESA_VK_WSI_PRESENT_MODE=immediate - Disable vsync
        </div>
      </div>
    </PanelSectionRow>
  );
}
