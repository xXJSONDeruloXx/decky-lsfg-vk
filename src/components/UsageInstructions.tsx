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
            ? "Add the launch option below (or use \"Launch Option Clipboard\") to Steam games to activate frame generation."
            : "LSFG is disabled. Enable it above and add the launch option to activate frame generation."
          }
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          style={{
        fontSize: "12px",
        lineHeight: "1.4",
        opacity: "0.8",
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        padding: "8px",
        borderRadius: "4px",
        fontFamily: "monospace",
        marginTop: "8px",
        marginBottom: "8px",
        textAlign: "center"
          }}
        >
          <strong>~/lsfg %command%</strong>
        </div>
      </PanelSectionRow>

      {/* <PanelSectionRow>
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
• HDR Mode: ${config.hdr_mode ? "Yes" : "No"}
• Present Mode: ${config.experimental_present_mode || "Default (FIFO)"}
• FPS Limit: ${config.experimental_fps_limit > 0 ? `${config.experimental_fps_limit} FPS` : "Off"}`}
        </div>
      </PanelSectionRow> */}

      <PanelSectionRow>
        <div
          style={{
            fontSize: "11px",
            lineHeight: "1.3",
            opacity: "0.6",
            marginTop: "8px"
          }}
        >
The configuration is stored in ~/.config/lsfg-vk/conf.toml and hot-reloads while games are running.
        </div>
      </PanelSectionRow>
    </>
  );
}
