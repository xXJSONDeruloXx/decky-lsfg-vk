import { useState, useEffect } from "react";
import { PanelSectionRow } from "@decky/ui";
import { FaClipboard, FaEye } from "react-icons/fa";

export function ClipboardDisplay() {
  const [clipboardContent, setClipboardContent] = useState<string>("");
  const [isReading, setIsReading] = useState(false);

  const readClipboard = async () => {
    if (isReading) return; // Prevent concurrent reads
    
    setIsReading(true);
    try {
      console.log("ClipboardDisplay: Attempting to read clipboard...");
      
      if (!navigator.clipboard) {
        console.log("ClipboardDisplay: navigator.clipboard not available");
        setClipboardContent("Clipboard API not available");
        return;
      }
      
      if (!navigator.clipboard.readText) {
        console.log("ClipboardDisplay: navigator.clipboard.readText not available");
        setClipboardContent("Clipboard read not supported");
        return;
      }
      
      console.log("ClipboardDisplay: Calling navigator.clipboard.readText()...");
      const content = await navigator.clipboard.readText();
      console.log("ClipboardDisplay: Successfully read clipboard:", content.length, "characters");
      setClipboardContent(content);
    } catch (error) {
      // This is expected if user hasn't granted clipboard permissions
      // or if we're in a context where reading isn't allowed
      console.log("ClipboardDisplay: Error reading clipboard:", error);
      console.log("ClipboardDisplay: Error name:", (error as Error).name);
      console.log("ClipboardDisplay: Error message:", (error as Error).message);
      
      // More specific error messages based on error type
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
            setClipboardContent("Clipboard access denied - check permissions");
            break;
          case 'NotFoundError':
            setClipboardContent("No clipboard data found");
            break;
          case 'SecurityError':
            setClipboardContent("Clipboard access blocked by security policy");
            break;
          default:
            setClipboardContent(`Clipboard error: ${error.name}`);
        }
      } else {
        setClipboardContent("Unable to read clipboard");
      }
    } finally {
      setIsReading(false);
    }
  };

  // Read clipboard on mount and then every 3 seconds
  useEffect(() => {
    readClipboard();
    
    const interval = setInterval(() => {
      readClipboard();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const truncateText = (text: string, maxLength: number = 60) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const displayText = truncateText(clipboardContent);

  return (
    <PanelSectionRow>
      <div style={{ 
        padding: "8px", 
        backgroundColor: "rgba(255, 255, 255, 0.05)", 
        borderRadius: "4px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        marginBottom: "8px"
      }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "8px",
          marginBottom: "4px"
        }}>
          <FaClipboard style={{ color: "#888", fontSize: "12px" }} />
          <div style={{ 
            fontSize: "12px", 
            fontWeight: "bold", 
            color: "#888",
            textTransform: "uppercase"
          }}>
            Current Clipboard
          </div>
          {isReading && (
            <FaEye style={{ 
              color: "#888", 
              fontSize: "10px",
              animation: "pulse 1s ease-in-out infinite"
            }} />
          )}
        </div>
        <div style={{ 
          fontSize: "11px", 
          color: clipboardContent.includes("error") || 
                 clipboardContent.includes("denied") || 
                 clipboardContent.includes("not available") || 
                 clipboardContent.includes("not supported") ||
                 clipboardContent.includes("blocked") ||
                 clipboardContent === "Unable to read clipboard"
            ? "#ff6b6b" 
            : "#fff",
          fontFamily: "monospace",
          wordBreak: "break-word",
          lineHeight: "1.3",
          minHeight: "14px"
        }}>
          {displayText || "Reading clipboard..."}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
      `}</style>
    </PanelSectionRow>
  );
}
