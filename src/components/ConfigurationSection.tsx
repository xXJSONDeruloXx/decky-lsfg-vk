import { PanelSectionRow, ToggleField, SliderField, TextField } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";

interface ConfigurationSectionProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string) => Promise<void>;
}

export function ConfigurationSection({
  config,
  onConfigChange
}: ConfigurationSectionProps) {
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
          LSFG Configuration
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Enable LSFG"
          description="enable/disable lsfg globally (apply before launching games)"
          checked={config.enable}
          onChange={(value) => onConfigChange('enable', value)}
        />
      </PanelSectionRow>

      {/* <PanelSectionRow>
        <TextField
          label="Lossless.dll Path"
          description="specify where Lossless.dll is stored"
          value={config.dll}
          onChange={(e) => onConfigChange('dll', e.target.value)}
        />
      </PanelSectionRow> */}

      <PanelSectionRow>
        <SliderField
          label="FPS Multiplier"
          description="Traditional FPS multiplier value"
          value={config.multiplier}
          min={2}
          max={4}
          step={1}
          notchCount={3}
          notchLabels={[
            { notchIndex: 0, label: "2X" },
            { notchIndex: 1, label: "3X" },
            { notchIndex: 2, label: "4X" }
          ]}
          onChange={(value) => onConfigChange('multiplier', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <SliderField
          label={`Flow Scale ${Math.round(config.flow_scale * 100)}%`}
          description="change the flow scale (lower = faster)"
          value={config.flow_scale}
          min={0.25}
          max={1.0}
          step={0.01}
          onChange={(value) => onConfigChange('flow_scale', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Performance Mode"
          description="use lighter model for FG"
          checked={config.performance_mode}
          onChange={(value) => onConfigChange('performance_mode', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="HDR Mode"
          description="Enables HDR mode (only for games that support HDR)"
          checked={config.hdr_mode}
          onChange={(value) => onConfigChange('hdr_mode', value)}
        />
      </PanelSectionRow>
    </>
  );
}
