import { PanelSectionRow } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";

interface UsageInstructionsProps {
  config: ConfigurationData;
}

export function UsageInstructions({ config }: UsageInstructionsProps) {
  // Build manual environment variables string based on current config
  const buildManualEnvVars = (): string => {
    const envVars: string[] = [];
    
    if (config.enable_lsfg) {
      envVars.push("ENABLE_LSFG=1");
    }
    
    // Always include multiplier and flow_scale if LSFG is enabled, as they have defaults
    if (config.enable_lsfg) {
      envVars.push(`LSFG_MULTIPLIER=${config.multiplier}`);
      envVars.push(`LSFG_FLOW_SCALE=${config.flow_scale}`);
    }
    
    if (config.hdr) {
      envVars.push("LSFG_HDR=1");
    }
    
    if (config.perf_mode) {
      envVars.push("LSFG_PERF_MODE=1");
    }
    
    if (config.immediate_mode) {
      envVars.push("MESA_VK_WSI_PRESENT_MODE=immediate");
    }
    
    if (config.disable_vkbasalt) {
      envVars.push("DISABLE_VKBASALT=1");
    }
    
    if (config.frame_cap > 0) {
      envVars.push(`DXVK_FRAME_RATE=${config.frame_cap}`);
    }
    
    return envVars.length > 0 ? `${envVars.join(" ")} %command%` : "%command%";
  };

  return (
    <>
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
            ~/lsfg %command%
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
            {buildManualEnvVars()}
          </div>
        </div>
      </PanelSectionRow>
    </>
  );
}
