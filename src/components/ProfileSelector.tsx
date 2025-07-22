import { PanelSectionRow, DropdownItem } from "@decky/ui";

interface ProfileSelectorProps {
  selectedProfile: string;
  onProfileChange: (profile: string) => void;
}

export function ProfileSelector({ selectedProfile, onProfileChange }: ProfileSelectorProps) {
  return (
    <PanelSectionRow>
      <div
        style={{
          fontSize: "14px",
          fontWeight: "bold",
          marginTop: "8px",
          marginBottom: "8px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
          paddingBottom: "4px",
          color: "white"
        }}
      >
        Profile Selection
      </div>
      <DropdownItem
        label="Active Profile"
        description="Select which profile to use when launching games"
        menuLabel="Select profile"
        selectedOption={selectedProfile}
        onChange={(value) => onProfileChange(value.data)}
        rgOptions={[
          { data: "default", label: "Default" },
          { data: "second", label: "Second" }
        ]}
      />
    </PanelSectionRow>
  );
}
