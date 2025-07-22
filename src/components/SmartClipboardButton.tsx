import { useState } from "react";
import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaClipboard } from "react-icons/fa";
import { getLaunchOption } from "../api/lsfgApi";
import { showClipboardSuccessToast, showClipboardErrorToast, showSuccessToast } from "../utils/toastUtils";
import { copyWithVerification } from "../utils/clipboardUtils";

export function SmartClipboardButton() {
  const [isLoading, setIsLoading] = useState(false);

  const getLaunchOptionText = async (): Promise<string> => {
    try {
      const result = await getLaunchOption();
      return result.launch_option || "~/lsfg %command%";
    } catch (error) {
      return "~/lsfg %command%";
    }
  };

  const copyToClipboard = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const text = await getLaunchOptionText();
      const { success, verified } = await copyWithVerification(text);
      
      if (success) {
        if (verified) {
          showClipboardSuccessToast();
        } else {
          showSuccessToast("Copied to Clipboard!", "Launch option copied (verification unavailable)");
        }
      } else {
        showClipboardErrorToast();
      }

    } catch (error) {
      showClipboardErrorToast();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={copyToClipboard}
        disabled={isLoading}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isLoading ? (
            <FaClipboard style={{ 
              animation: "pulse 1s ease-in-out infinite",
              opacity: 0.7 
            }} />
          ) : (
            <FaClipboard />
          )}
          <div>{isLoading ? "Copying..." : "Copy Launch Option"}</div>
        </div>
      </ButtonItem>
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.7; }
          50% { opacity: 1; }
          100% { opacity: 0.7; }
        }
      `}</style>
    </PanelSectionRow>
  );
}
