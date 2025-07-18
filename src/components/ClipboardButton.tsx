import { useState } from "react";
import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaClipboard, FaCheck } from "react-icons/fa";
import { getLaunchOption } from "../api/lsfgApi";

export function ClipboardButton() {
  const [copied, setCopied] = useState(false);

  const handleClipboardClick = async () => {
    try {
      // Get the launch option from the backend
      const response = await getLaunchOption();
      const launchOption = response.launch_option;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(launchOption);
      setCopied(true);
      
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy launch option:", error);
    }
  };

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={handleClipboardClick}
        description="Copy the launch option needed for Steam games"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {copied ? <FaCheck style={{ color: "green" }} /> : <FaClipboard />}
          <div>{copied ? "Copied!" : "Copy Launch Option"}</div>
        </div>
      </ButtonItem>
    </PanelSectionRow>
  );
}
