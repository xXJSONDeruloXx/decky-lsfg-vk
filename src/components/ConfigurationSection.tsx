import { PanelSectionRow, ToggleField, SliderField } from "@decky/ui";

interface LsfgConfig {
  enableLsfg: boolean;
  multiplier: number;
  flowScale: number;
  hdr: boolean;
  perfMode: boolean;
  immediateMode: boolean;
}

interface ConfigurationSectionProps {
  config: LsfgConfig;
  onEnableLsfgChange: (value: boolean) => Promise<void>;
  onMultiplierChange: (value: number) => Promise<void>;
  onFlowScaleChange: (value: number) => Promise<void>;
  onHdrChange: (value: boolean) => Promise<void>;
  onPerfModeChange: (value: boolean) => Promise<void>;
  onImmediateModeChange: (value: boolean) => Promise<void>;
}

export function ConfigurationSection({
  config,
  onEnableLsfgChange,
  onMultiplierChange,
  onFlowScaleChange,
  onHdrChange,
  onPerfModeChange,
  onImmediateModeChange
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
          checked={config.enableLsfg}
          onChange={onEnableLsfgChange}
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
          onChange={onMultiplierChange}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <SliderField
          label={`Flow Scale ${Math.round(config.flowScale * 100)}%`}
          description="Lowers the generated frame's resolution"
          value={config.flowScale}
          min={0.25}
          max={1.0}
          step={0.01}
          onChange={onFlowScaleChange}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="HDR Mode"
          description="Enable HDR mode (only if Game supports HDR)"
          checked={config.hdr}
          onChange={onHdrChange}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Performance Mode"
          description="Use lighter model for FG (experimental)"
          checked={config.perfMode}
          onChange={onPerfModeChange}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Immediate Mode"
          description="Disable vsync for reduced input lag"
          checked={config.immediateMode}
          onChange={onImmediateModeChange}
        />
      </PanelSectionRow>
    </>
  );
}
