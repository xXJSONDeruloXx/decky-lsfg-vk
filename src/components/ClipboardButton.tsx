import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaBook } from "react-icons/fa";

export function ClipboardButton() {
  const handleClipboardClick = () => {
    window.open("https://github.com/xXJSONDeruloXx/decky-lossless-scaling-vk/wiki/Clipboard", "_blank");
  };

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={handleClipboardClick}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FaBook />
          <div>Plugin Wiki</div>
        </div>
      </ButtonItem>
    </PanelSectionRow>
  );
}
