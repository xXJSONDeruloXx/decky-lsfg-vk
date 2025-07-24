import { useState, useEffect } from "react";
import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaClipboard, FaCheck } from "react-icons/fa";
import { getLaunchOption } from "../api/lsfgApi";
import { showClipboardErrorToast } from "../utils/toastUtils";
import { copyWithVerification } from "../utils/clipboardUtils";

export function SmartClipboardButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Reset success state after 3 seconds
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showSuccess]);

  const getLaunchOptionText = async (): Promise<string> => {
    try {
      const result = await getLaunchOption();
      return result.launch_option || "~/lsfg %command%";
    } catch (error) {
      return "~/lsfg %command%";
    }
  };

  const copyToClipboard = async () => {
    if (isLoading || showSuccess) return;
    
    setIsLoading(true);
    try {
      const text = await getLaunchOptionText();
      const { success, verified } = await copyWithVerification(text);
      
      if (success) {
        // Show success feedback in the button instead of toast
        setShowSuccess(true);
        if (!verified) {
          // Copy worked but verification failed - still show success
          console.log('Copy verification failed but copy likely worked');
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
        disabled={isLoading || showSuccess}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {showSuccess ? (
            <FaCheck style={{ 
              color: "#4CAF50" // Green color for success
            }} />
          ) : isLoading ? (
            <FaClipboard style={{ 
              animation: "pulse 1s ease-in-out infinite",
              opacity: 0.7 
            }} />
          ) : (
            <FaClipboard />
          )}
          <div style={{ 
            color: showSuccess ? "#4CAF50" : "inherit",
            fontWeight: showSuccess ? "bold" : "normal"
          }}>
            {showSuccess ? "Copied to clipboard" : isLoading ? "Copying..." : "Copy Launch Option"}
          </div>
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
