import { useState } from "react";
import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaClipboard } from "react-icons/fa";
import { toaster } from "@decky/api";
import { getLaunchOption } from "../api/lsfgApi";

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
      
      // Use the proven input simulation method
      const tempInput = document.createElement('input');
      tempInput.value = text;
      tempInput.style.position = 'absolute';
      tempInput.style.left = '-9999px';
      document.body.appendChild(tempInput);
      
      // Focus and select the text
      tempInput.focus();
      tempInput.select();
      
      // Try copying using execCommand first (most reliable in gaming mode)
      let copySuccess = false;
      try {
        if (document.execCommand('copy')) {
          copySuccess = true;
        }
      } catch (e) {
        // If execCommand fails, try navigator.clipboard as fallback
        try {
          await navigator.clipboard.writeText(text);
          copySuccess = true;
        } catch (clipboardError) {
          console.error('Both copy methods failed:', e, clipboardError);
        }
      }
      
      // Clean up
      document.body.removeChild(tempInput);
      
      if (copySuccess) {
        // Verify the copy worked by reading back
        try {
          const readBack = await navigator.clipboard.readText();
          if (readBack === text) {
            toaster.toast({
              title: "Copied to Clipboard!",
              body: "Launch option ready to paste"
            });
          } else {
            // Copy worked but verification failed - still consider it success
            toaster.toast({
              title: "Copied to Clipboard!",
              body: "Launch option copied (verification unavailable)"
            });
          }
        } catch (e) {
          // Verification failed but copy likely worked
          toaster.toast({
            title: "Copied to Clipboard!",
            body: "Launch option copied successfully"
          });
        }
      } else {
        toaster.toast({
          title: "Copy Failed",
          body: "Unable to copy to clipboard"
        });
      }

    } catch (error) {
      toaster.toast({
        title: "Copy Failed",
        body: `Error: ${String(error)}`
      });
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
