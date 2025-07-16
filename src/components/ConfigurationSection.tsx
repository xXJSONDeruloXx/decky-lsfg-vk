import { PanelSectionRow, ToggleField, SliderField } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";

interface ConfigurationSectionProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number) => Promise<void>;
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
          description="Enables the frame generation layer"
          checked={config.enable_lsfg}
          onChange={(value) => onConfigChange('enable_lsfg', value)}
        />
      </PanelSectionRow>

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
          description="Lowers the internal motion estimation resolution"
          value={config.flow_scale}
          min={0.25}
          max={1.0}
          step={0.01}
          onChange={(value) => onConfigChange('flow_scale', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="HDR Mode"
          description="Enable HDR mode (only if Game supports HDR)"
          checked={config.hdr}
          onChange={(value) => onConfigChange('hdr', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Performance Mode"
          description="Use lighter model for FG"
          checked={config.perf_mode}
          onChange={(value) => onConfigChange('perf_mode', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Immediate Mode"
          description="Reduce input lag (Experimental, will cause issues in many games)"
          checked={config.immediate_mode}
          onChange={(value) => onConfigChange('immediate_mode', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <SliderField
          label={`Game Frame Cap ${config.frame_cap === 0 ? "(Disabled)" : `(${config.frame_cap} FPS)`}`}
          description="Limit base game FPS (0 = disabled)"
          value={config.frame_cap}
          min={0}
          max={60}
          step={1}
          onChange={(value) => onConfigChange('frame_cap', value)}
        />
      </PanelSectionRow>

      {/* <PanelSectionRow>
        <ToggleField
          label="Disable vkbasalt"
          description="Some plugins add vkbasalt layer, which can break lsfg. Toggling on fixes this"
          checked={config.disable_vkbasalt}
          onChange={(value) => onConfigChange('disable_vkbasalt', value)}
        />
      </PanelSectionRow> */}
    </>
  );
}
