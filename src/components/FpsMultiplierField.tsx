import { DropdownItem } from "@decky/ui";

interface FpsMultiplierFieldProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}

export function FpsMultiplierField({ 
  label, 
  description, 
  value, 
  onChange 
}: FpsMultiplierFieldProps) {
  // Create dropdown options from 1 (Off) to 20 (20X)
  const options = [];
  
  // Add "Off" option for value 1
  options.push({
    data: 1,
    label: "Off"
  });
  
  // Add 2X through 20X options
  for (let i = 2; i <= 20; i++) {
    options.push({
      data: i,
      label: `${i}X`
    });
  }

  return (
    <DropdownItem
      label={label}
      description={description}
      menuLabel="Select FPS multiplier"
      selectedOption={value}
      onChange={(option) => onChange(option.data)}
      rgOptions={options}
    />
  );
}
