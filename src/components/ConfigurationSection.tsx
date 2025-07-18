import { PanelSectionRow, ToggleField, SliderField, DropdownItem } from "@decky/ui";
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
            paddingBottom: "4px",
            color: "white"
          }}
        >
          LSFG Configuration
        </div>
      </PanelSectionRow>

      {/* <PanelSectionRow>
        <ToggleField
          label="Enable LSFG"
          description="Enables lsfg globally (apply before launching games)"
          checked={config.enable}
          onChange={(value) => onConfigChange('enable', value)}
        />
      </PanelSectionRow> */}

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
          min={1}
          max={4}
          step={1}
          notchCount={4}
          notchLabels={[
            { notchIndex: 1, label: "OFF" },
            { notchIndex: 2, label: "2X" },
            { notchIndex: 3, label: "3X" },
            { notchIndex: 4, label: "4X" }
          ]}
          onChange={(value) => onConfigChange('multiplier', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <SliderField
          label={`Flow Scale ${Math.round(config.flow_scale * 100)}%`}
          description="Lowers internal motion estimation resolution, improving performance slightly"
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
          description="Uses a lighter model for FG (Recommended for most games)"
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
          Experimental Features
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <DropdownItem
          label="Override Vulkan present mode"
          description="Select a specific Vulkan presentation mode for better performance or compatibility (may cause crashes)"
          menuLabel="Select presentation mode"
          selectedOption={config.experimental_present_mode}
          onChange={(value) => onConfigChange('experimental_present_mode', value.data)}
          rgOptions={[
            { data: "", label: "Default" },
            { data: "fifo", label: "FIFO" },
            { data: "vsync", label: "VSync" },
            { data: "mailbox", label: "Mailbox" },
            { data: "immediate", label: "Immediate" }
          ]}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <SliderField
          label={`FPS Limit${config.experimental_fps_limit > 0 ? ` (${config.experimental_fps_limit} FPS)` : ' (Off)'}`}
          description="Base framerate cap for DirectX games, before frame multiplier (requires game re-launch)"
          value={config.experimental_fps_limit}
          min={0}
          max={60}
          step={1}
          onChange={(value) => onConfigChange('experimental_fps_limit', value)}
        />
      </PanelSectionRow>

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
          Environment Variables (Requires Re-launch)
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Enable WOW64 for 32-bit games"
          description="Enables PROTON_USE_WOW64=1 for 32-bit games (use with ProtonGE to fix crashing)"
          checked={config.enable_wow64}
          onChange={(value) => onConfigChange('enable_wow64', value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Disable Steam Deck Mode"
          description="Disables Steam Deck mode (unlocks hidden settings in some games)"
          checked={config.disable_steamdeck_mode}
          onChange={(value) => onConfigChange('disable_steamdeck_mode', value)}
        />
      </PanelSectionRow>
    </>
  );
}
