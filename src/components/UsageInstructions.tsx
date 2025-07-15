import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaExternalLinkAlt } from "react-icons/fa";

interface ConfigType {
  enableLsfg: boolean;
  multiplier: number;
  flowScale: number;
  hdr: boolean;
  perfMode: boolean;
  immediateMode: boolean;
}

interface UsageInstructionsProps {
  config: ConfigType;
}

export function UsageInstructions({ config }: UsageInstructionsProps) {
  // Build manual environment variables string based on current config
  const buildManualEnvVars = (): string => {
    const envVars: string[] = [];
    
    if (config.enableLsfg) {
      envVars.push("ENABLE_LSFG=1");
    }
    
    // Always include multiplier and flow_scale if LSFG is enabled, as they have defaults
    if (config.enableLsfg) {
      envVars.push(`LSFG_MULTIPLIER=${config.multiplier}`);
      envVars.push(`LSFG_FLOW_SCALE=${config.flowScale}`);
    }
    
    if (config.hdr) {
      envVars.push("LSFG_HDR=1");
    }
    
    if (config.perfMode) {
      envVars.push("LSFG_PERF_MODE=1");
    }
    
    if (config.immediateMode) {
      envVars.push("MESA_VK_WSI_PRESENT_MODE=immediate");
    }
    
    return envVars.length > 0 ? `${envVars.join(" ")} %command%` : "%command%";
  };

  const handleWikiClick = () => {
    window.open("https://github.com/PancakeTAS/lsfg-vk/wiki", "_blank");
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

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleWikiClick}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaExternalLinkAlt />
            <div>LSFG-VK Wiki</div>
          </div>
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
}
