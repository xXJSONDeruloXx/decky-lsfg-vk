import { PanelSectionRow, ButtonItem } from "@decky/ui";

interface Props {
  profiles: string[];
  currentProfile: string;
  onSelect: (profile: string) => void;
  onCreate: (name: string) => void;
}

export function ProfileSelector({ profiles, currentProfile, onSelect, onCreate }: Props) {
  const handleCreate = () => {
    const name = window.prompt("Enter profile name");
    if (name) {
      onCreate(name);
    }
  };

  return (
    <PanelSectionRow>
      <select
        value={currentProfile}
        onChange={(e) => onSelect(e.target.value)}
        style={{ marginRight: "8px" }}
      >
        {profiles.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <ButtonItem layout="below" onClick={handleCreate}>
        Add Profile
      </ButtonItem>
    </PanelSectionRow>
  );
}
