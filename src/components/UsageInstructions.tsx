import { PanelSectionRow } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";

interface UsageInstructionsProps {
  config: ConfigurationData;
}

export function UsageInstructions({ config: _config }: UsageInstructionsProps) {
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
            paddingBottom: "4px",
            color: "white"
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
          Click "Copy Launch Option" button above, then paste it into your Steam game's launch options to enable frame generation with the currently selected profile.
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

      <PanelSectionRow>
        <div
          style={{
            fontSize: "11px",
            lineHeight: "1.3",
            opacity: "0.6",
            marginTop: "8px"
          }}
        >
The configuration is stored in ~/.config/lsfg-vk/conf.toml with separate profiles for different settings. The active profile is determined by the "Profile Selection" above and will be used when launching games.
        </div>
      </PanelSectionRow>
    </>
  );
}