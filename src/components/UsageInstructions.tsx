import { PanelSectionRow } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";

interface UsageInstructionsProps {
  config: ConfigurationData;
}

export function UsageInstructions({ config }: UsageInstructionsProps) {
  return (
    <>
      <PanelSectionRow>
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            marginTop: "16px",
            marginBottom: "8px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
            paddingBottom: "4px"
          }}
        >
          Usage Instructions
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          style={{
            fontSize: "12px",
            lineHeight: "1.4",
            opacity: "0.8",
            whiteSpace: "pre-wrap"
          }}
        >
          {config.enable 
            ? "LSFG is enabled globally. The layer will be active for all games automatically. No launch arguments needed."
            : "LSFG is disabled. Enable it above to activate frame generation for all games."
          }
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          style={{
            fontSize: "12px",
            lineHeight: "1.4",
            opacity: "0.8",
            whiteSpace: "pre-wrap"
          }}
        >
          {`Current Configuration:
• Enable: ${config.enable ? "Yes" : "No"}
• DLL Path: ${config.dll}
• Multiplier: ${config.multiplier}x
• Flow Scale: ${Math.round(config.flow_scale * 100)}%
• Performance Mode: ${config.performance_mode ? "Yes" : "No"}
• HDR Mode: ${config.hdr_mode ? "Yes" : "No"}`}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          style={{
            fontSize: "11px",
            lineHeight: "1.3",
            opacity: "0.6",
            marginTop: "8px"
          }}
        >
          The configuration is stored in ~/.config/lsfg-vk/conf.toml and applies to all games globally.
        </div>
      </PanelSectionRow>
    </>
  );
}
