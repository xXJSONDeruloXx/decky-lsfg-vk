import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaExternalLinkAlt } from "react-icons/fa";

export function WikiButton() {
  const handleWikiClick = () => {
    window.open("https://github.com/PancakeTAS/lsfg-vk/wiki", "_blank");
  };

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={handleWikiClick}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FaExternalLinkAlt />
          <div>LSFG-VK Wiki</div>
        </div>
      </ButtonItem>
    </PanelSectionRow>
  );
}
