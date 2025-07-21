import { useState } from "react";
import { PanelSectionRow, ButtonItem } from "@decky/ui";
import { FaClipboard, FaRocket } from "react-icons/fa";
import { toaster } from "@decky/api";
import { getLaunchOption, copyToSystemClipboard } from "../api/lsfgApi";

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
      
      // Strategy 1: Try direct navigator.clipboard first (fastest)
      let directSuccess = false;
      try {
        await navigator.clipboard.writeText(text);
        // Verify it worked
        const readBack = await navigator.clipboard.readText();
        directSuccess = readBack === text;
      } catch (e) {
        // Direct clipboard failed, will try alternatives
      }

      if (directSuccess) {
        toaster.toast({
          title: "Copied to Clipboard!",
          body: "Launch option ready to paste"
        });
        return;
      }

      // Strategy 2: Try backend system clipboard
      try {
        const result = await copyToSystemClipboard(text);
        if (result.success) {
          toaster.toast({
            title: "Copied to Clipboard!",
            body: `Using ${result.method || "system clipboard"}`
          });
          return;
        }
      } catch (e) {
        // Backend failed, fall back to browser
      }

      // Strategy 3: Fall back to optimized browser window
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Quick Copy - Steam Deck Clipboard Helper</title>
          <style>
            body { 
              font-family: 'Motiva Sans', system-ui, sans-serif; 
              background: linear-gradient(135deg, #1e2328 0%, #2a475e 100%); 
              color: white; 
              padding: 20px; 
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .container { 
              background: rgba(42, 71, 94, 0.9);
              padding: 30px; 
              border-radius: 12px; 
              text-align: center; 
              box-shadow: 0 8px 32px rgba(0,0,0,0.3);
              border: 1px solid rgba(255,255,255,0.1);
              max-width: 500px;
              width: 100%;
            }
            h2 { 
              margin-top: 0; 
              color: #66c0f4; 
              font-size: 24px;
            }
            .launch-option {
              background: rgba(0,0,0,0.3);
              padding: 15px;
              border-radius: 8px;
              font-family: 'Fira Code', 'Courier New', monospace;
              font-size: 16px;
              margin: 20px 0;
              word-break: break-all;
              border: 1px solid rgba(102, 192, 244, 0.3);
            }
            .status { 
              margin: 20px 0; 
              font-size: 16px; 
              min-height: 24px;
            }
            .success { color: #66bb6a; }
            .error { color: #f44336; }
            button { 
              background: linear-gradient(135deg, #417a9b 0%, #67c1f5 100%);
              color: white;
              border: none;
              padding: 12px 24px; 
              font-size: 16px; 
              border-radius: 6px;
              cursor: pointer;
              margin: 8px;
              transition: all 0.2s;
              font-family: inherit;
            }
            button:hover { 
              background: linear-gradient(135deg, #4e8bb8 0%, #7bc8f7 100%);
              transform: translateY(-1px);
            }
            button:active {
              transform: translateY(0px);
            }
            .close-timer {
              font-size: 14px;
              opacity: 0.7;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>🚀 Steam Deck Clipboard Helper</h2>
            <div>Copy this launch option for your Steam games:</div>
            <div class="launch-option">${text}</div>
            <div id="status" class="status">⏳ Copying to clipboard...</div>
            <div>
              <button onclick="copyAndClose()" id="copyBtn">Copy & Close</button>
              <button onclick="window.close()">Close</button>
            </div>
            <div class="close-timer" id="timer"></div>
          </div>
          <script>
            const textToCopy = ${JSON.stringify(text)};
            let copied = false;
            let autoCloseTimer = null;
            
            async function autoCopy() {
              try {
                await navigator.clipboard.writeText(textToCopy);
                // Verify it worked
                const readBack = await navigator.clipboard.readText();
                if (readBack === textToCopy) {
                  document.getElementById('status').innerHTML = '<span class="success">✅ Successfully copied to clipboard!</span>';
                  copied = true;
                  startAutoClose();
                } else {
                  document.getElementById('status').innerHTML = '<span class="error">⚠️ Copy may have failed - use button below</span>';
                }
              } catch (e) {
                document.getElementById('status').innerHTML = '<span class="error">❌ Auto-copy failed - click "Copy & Close" below</span>';
              }
            }
            
            async function copyAndClose() {
              try {
                await navigator.clipboard.writeText(textToCopy);
                const readBack = await navigator.clipboard.readText();
                if (readBack === textToCopy) {
                  window.close();
                } else {
                  alert('Copy verification failed. Please try again or copy manually.');
                }
              } catch (e) {
                alert('Copy failed: ' + e.message);
              }
            }
            
            function startAutoClose() {
              let seconds = 3;
              const timerEl = document.getElementById('timer');
              timerEl.textContent = \`Window will close in \${seconds} seconds...\`;
              
              autoCloseTimer = setInterval(() => {
                seconds--;
                if (seconds <= 0) {
                  clearInterval(autoCloseTimer);
                  window.close();
                } else {
                  timerEl.textContent = \`Window will close in \${seconds} seconds...\`;
                }
              }, 1000);
            }
            
            // Auto-copy on load
            window.addEventListener('load', autoCopy);
          </script>
        </body>
        </html>
      `;

      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
      window.open(dataUrl, '_blank', 'width=600,height=400,scrollbars=no,resizable=yes');
      
      toaster.toast({
        title: "Browser Helper Opened",
        body: "Clipboard helper window opened with auto-copy"
      });

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
          {isLoading ? <FaRocket style={{ animation: "spin 1s linear infinite" }} /> : <FaClipboard />}
          <div>{isLoading ? "Copying..." : "Smart Clipboard Copy"}</div>
        </div>
      </ButtonItem>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PanelSectionRow>
  );
}
