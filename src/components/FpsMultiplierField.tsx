import { SliderField, ToggleField, PanelSectionRow } from "@decky/ui";

interface FpsMultiplierFieldProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  unlock: boolean;
  onUnlockChange: (unlock: boolean) => void;
}

export function FpsMultiplierField({ 
  label, 
  description, 
  value, 
  onChange,
  unlock,
  onUnlockChange
}: FpsMultiplierFieldProps) {
  
  // Define notch labels based on unlock state
  const getNotchLabels = () => {
    if (unlock) {
      // 10 notches: Off, 2X, 3X, 4X, 5X, 6X, 7X, 8X, 9X, 10X
      return [
        { notchIndex: 0, label: "OFF", value: 1 },
        { notchIndex: 1, label: "2X", value: 2 },
        { notchIndex: 2, label: "3X", value: 3 },
        { notchIndex: 3, label: "4X", value: 4 },
        { notchIndex: 4, label: "5X", value: 5 },
        { notchIndex: 5, label: "6X", value: 6 },
        { notchIndex: 6, label: "7X", value: 7 },
        { notchIndex: 7, label: "8X", value: 8 },
        { notchIndex: 8, label: "9X", value: 9 },
        { notchIndex: 9, label: "10X", value: 10 }
      ];
    } else {
      // 4 notches: Off, 2X, 3X, 4X (original)
      return [
        { notchIndex: 0, label: "OFF", value: 1 },
        { notchIndex: 1, label: "2X", value: 2 },
        { notchIndex: 2, label: "3X", value: 3 },
        { notchIndex: 3, label: "4X", value: 4 }
      ];
    }
  };

  // Ensure value is within bounds when unlock state changes
  const handleUnlockChange = (newUnlockState: boolean) => {
    onUnlockChange(newUnlockState);
    
    // If disabling unlock and current value is > 4, reset to 4
    if (!newUnlockState && value > 4) {
      onChange(4);
    }
  };

  const maxValue = unlock ? 10 : 4;
  const notchCount = unlock ? 10 : 4;

  return (
    <>
      <PanelSectionRow>
        <ToggleField
          label="Unlock higher FPS Multipliers (Unstable)"
          description="Enable multipliers up to 10X (may cause crashes or poor performance)"
          checked={unlock}
          onChange={handleUnlockChange}
        />
      </PanelSectionRow>
      
      <PanelSectionRow>
        <SliderField
          label={label}
          description={description}
          value={value}
          min={1}
          max={maxValue}
          step={1}
          notchCount={notchCount}
          notchLabels={getNotchLabels()}
          showValue={false}
          notchTicksVisible={true}
          onChange={onChange}
        />
      </PanelSectionRow>
    </>
  );
}
