import { useState } from "react";
import { PanelSectionRow, ButtonItem, Field, Focusable } from "@decky/ui";
import { FaClipboard, FaFlask, FaRocket, FaCog, FaTerminal } from "react-icons/fa";
import { toaster } from "@decky/api";
import { getLaunchOption, copyToSystemClipboard } from "../api/lsfgApi";

interface ExperimentResult {
  success: boolean;
  method: string;
  error?: string;
  details?: string;
}

export function ClipboardExperiments() {
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const addResult = (result: ExperimentResult) => {
    setResults(prev => [...prev, { ...result, timestamp: Date.now() }]);
  };

  const getLaunchOptionText = async (): Promise<string> => {
    try {
      const result = await getLaunchOption();
      return result.launch_option || "~/lsfg %command%";
    } catch (error) {
      return "~/lsfg %command%";
    }
  };

  // Approach 1: Direct Navigator Clipboard API
  const testDirectClipboard = async () => {
    setIsLoading("direct");
    try {
      const text = await getLaunchOptionText();
      await navigator.clipboard.writeText(text);
      
      // Test if it actually worked by reading back
      const readBack = await navigator.clipboard.readText();
      const success = readBack === text;
      
      addResult({
        success,
        method: "Direct Navigator Clipboard",
        details: success ? `Successfully copied: "${text}"` : `Mismatch: wrote "${text}", read "${readBack}"`
      });

      if (success) {
        toaster.toast({
          title: "Clipboard Success!",
          body: "Direct navigator.clipboard API worked"
        });
      }
    } catch (error) {
      addResult({
        success: false,
        method: "Direct Navigator Clipboard",
        error: String(error)
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Approach 2: CEF Browser with Data URL
  const testDataUrlApproach = async () => {
    setIsLoading("dataurl");
    try {
      const text = await getLaunchOptionText();
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Clipboard Helper</title>
          <style>
            body { 
              font-family: 'Motiva Sans', Arial, sans-serif; 
              background: #1e2328; 
              color: white; 
              padding: 20px; 
              text-align: center; 
            }
            .content { background: #2a475e; padding: 20px; border-radius: 8px; margin: 20px; }
            .success { color: #66bb6a; font-weight: bold; }
            .error { color: #f44336; font-weight: bold; }
            code { background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="content">
            <h2>🚀 Clipboard Automation Test</h2>
            <p>Attempting to copy launch option: <code>${text}</code></p>
            <div id="status">Working...</div>
            <div id="details"></div>
            <button onclick="window.close()" style="margin-top: 20px; padding: 8px 16px;">Close</button>
          </div>
          <script>
            (async function() {
              const statusEl = document.getElementById('status');
              const detailsEl = document.getElementById('details');
              const textToCopy = ${JSON.stringify(text)};
              
              try {
                await navigator.clipboard.writeText(textToCopy);
                
                // Verify it worked
                const readBack = await navigator.clipboard.readText();
                if (readBack === textToCopy) {
                  statusEl.innerHTML = '<span class="success">✅ Success! Text copied to clipboard</span>';
                  detailsEl.innerHTML = 'The launch option is now in your clipboard. You can close this window.';
                } else {
                  statusEl.innerHTML = '<span class="error">⚠️ Partial Success</span>';
                  detailsEl.innerHTML = 'Text was written but verification failed. Check clipboard manually.';
                }
              } catch (error) {
                statusEl.innerHTML = '<span class="error">❌ Failed</span>';
                detailsEl.innerHTML = 'Error: ' + error.message;
              }
            })();
          </script>
        </body>
        </html>
      `;

      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
      window.open(dataUrl, '_blank');
      
      addResult({
        success: true,
        method: "Data URL Browser Window",
        details: "Opened data URL with auto-copy script"
      });
    } catch (error) {
      addResult({
        success: false,
        method: "Data URL Browser Window",
        error: String(error)
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Approach 3: Focused Element + Selection + Input API
  const testInputSimulation = async () => {
    setIsLoading("input");
    try {
      const text = await getLaunchOptionText();
      
      // Create a temporary input element
      const tempInput = document.createElement('input');
      tempInput.value = text;
      tempInput.style.position = 'absolute';
      tempInput.style.left = '-9999px';
      document.body.appendChild(tempInput);
      
      // Focus and select the text
      tempInput.focus();
      tempInput.select();
      
      // Try different copy methods
      let copySuccess = false;
      let method = '';
      
      // Method 1: execCommand (deprecated but might work)
      try {
        if (document.execCommand('copy')) {
          copySuccess = true;
          method = 'execCommand';
        }
      } catch (e) {}
      
      // Method 2: Navigator clipboard on selected text
      if (!copySuccess) {
        try {
          await navigator.clipboard.writeText(text);
          copySuccess = true;
          method = 'navigator.clipboard';
        } catch (e) {}
      }
      
      // Clean up
      document.body.removeChild(tempInput);
      
      if (copySuccess) {
        // Verify
        try {
          const readBack = await navigator.clipboard.readText();
          const verified = readBack === text;
          addResult({
            success: verified,
            method: `Input Simulation (${method})`,
            details: verified ? "Successfully copied and verified" : "Copy worked but verification failed"
          });
        } catch (e) {
          addResult({
            success: true,
            method: `Input Simulation (${method})`,
            details: "Copy appeared to work but couldn't verify"
          });
        }
      } else {
        addResult({
          success: false,
          method: "Input Simulation",
          error: "All copy methods failed"
        });
      }
    } catch (error) {
      addResult({
        success: false,
        method: "Input Simulation",
        error: String(error)
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Approach 4: Backend Clipboard
  const testBackendClipboard = async () => {
    setIsLoading("backend");
    try {
      const text = await getLaunchOptionText();
      
      const result = await copyToSystemClipboard(text);
      
      if (result.success) {
        addResult({
          success: true,
          method: `Backend System Clipboard (${result.method})`,
          details: result.message || "Successfully copied to system clipboard"
        });
        
        toaster.toast({
          title: "Clipboard Success!",
          body: `Copied using ${result.method}`
        });
      } else {
        addResult({
          success: false,
          method: "Backend System Clipboard",
          error: result.error || "Unknown error"
        });
      }
    } catch (error) {
      addResult({
        success: false,
        method: "Backend System Clipboard", 
        error: String(error)
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Approach 5: Hybrid approach with immediate feedback
  const testHybridApproach = async () => {
    setIsLoading("hybrid");
    try {
      const text = await getLaunchOptionText();
      
      // Try direct first
      let directWorked = false;
      try {
        await navigator.clipboard.writeText(text);
        const readBack = await navigator.clipboard.readText();
        directWorked = readBack === text;
      } catch (e) {}
      
      if (directWorked) {
        addResult({
          success: true,
          method: "Hybrid (Direct Success)",
          details: "Direct clipboard API worked, no browser needed"
        });
        
        toaster.toast({
          title: "Clipboard Success!",
          body: "Launch option copied to clipboard"
        });
      } else {
        // Fall back to optimized browser approach
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Quick Copy</title>
            <style>
              body { font-family: system-ui; background: #1a1a1a; color: white; padding: 20px; }
              .container { max-width: 400px; margin: 0 auto; text-align: center; }
              .success { color: #4CAF50; }
              button { padding: 12px 24px; font-size: 16px; margin: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h3>🚀 Clipboard Helper</h3>
              <p>Copying: <strong>${text}</strong></p>
              <div id="status">⏳ Working...</div>
              <button onclick="copyAndClose()" id="copyBtn">Copy & Close</button>
              <button onclick="window.close()">Just Close</button>
            </div>
            <script>
              const textToCopy = ${JSON.stringify(text)};
              let copied = false;
              
              async function autoCopy() {
                try {
                  await navigator.clipboard.writeText(textToCopy);
                  document.getElementById('status').innerHTML = '<span class="success">✅ Copied successfully!</span>';
                  copied = true;
                  setTimeout(() => window.close(), 1500);
                } catch (e) {
                  document.getElementById('status').innerHTML = '❌ Auto-copy failed. Use button below.';
                }
              }
              
              async function copyAndClose() {
                try {
                  await navigator.clipboard.writeText(textToCopy);
                  window.close();
                } catch (e) {
                  alert('Copy failed: ' + e.message);
                }
              }
              
              // Auto-copy on load
              autoCopy();
            </script>
          </body>
          </html>
        `;
        
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
        window.open(dataUrl, '_blank', 'width=500,height=300');
        
        addResult({
          success: true,
          method: "Hybrid (Browser Fallback)",
          details: "Direct failed, opened optimized browser window"
        });
      }
    } catch (error) {
      addResult({
        success: false,
        method: "Hybrid Approach",
        error: String(error)
      });
    } finally {
      setIsLoading(null);
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <>
      <PanelSectionRow>
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            marginTop: "16px",
            marginBottom: "8px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
            paddingBottom: "4px",
            color: "white"
          }}
        >
          🧪 Clipboard Automation Experiments
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{ fontSize: "12px", opacity: 0.8, marginBottom: "8px" }}>
          Testing different approaches to automate clipboard access in Steam Deck gaming mode:
        </div>
      </PanelSectionRow>

      {/* Test Buttons */}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={testDirectClipboard}
          disabled={isLoading === "direct"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaClipboard />
            <div>Test Direct Clipboard API</div>
            {isLoading === "direct" && <div>⏳</div>}
          </div>
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={testDataUrlApproach}
          disabled={isLoading === "dataurl"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaRocket />
            <div>Test Data URL Browser</div>
            {isLoading === "dataurl" && <div>⏳</div>}
          </div>
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={testInputSimulation}
          disabled={isLoading === "input"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaCog />
            <div>Test Input Simulation</div>
            {isLoading === "input" && <div>⏳</div>}
          </div>
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={testBackendClipboard}
          disabled={isLoading === "backend"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaTerminal />
            <div>Test Backend Clipboard</div>
            {isLoading === "backend" && <div>⏳</div>}
          </div>
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={testHybridApproach}
          disabled={isLoading === "hybrid"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaFlask />
            <div>Test Hybrid Approach (Recommended)</div>
            {isLoading === "hybrid" && <div>⏳</div>}
          </div>
        </ButtonItem>
      </PanelSectionRow>

      {/* Results Section */}
      {results.length > 0 && (
        <>
          <PanelSectionRow>
            <Field
              label={`Test Results (${results.length})`}
              bottomSeparator="none"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "12px", opacity: 0.8 }}>
                  {results.filter(r => r.success).length} successful, {results.filter(r => !r.success).length} failed
                </div>
                <ButtonItem
                  layout="inline"
                  onClick={clearResults}
                >
                  Clear
                </ButtonItem>
              </div>
            </Field>
          </PanelSectionRow>

          {results.slice(-5).map((result, index) => (
            <PanelSectionRow key={index}>
              <Focusable>
                <div style={{
                  padding: "8px",
                  backgroundColor: result.success ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)",
                  borderLeft: `3px solid ${result.success ? "#4CAF50" : "#f44336"}`,
                  borderRadius: "4px",
                  fontSize: "11px"
                }}>
                  <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                    {result.success ? "✅" : "❌"} {result.method}
                  </div>
                  {result.details && (
                    <div style={{ color: "#4CAF50", marginBottom: "2px" }}>
                      {result.details}
                    </div>
                  )}
                  {result.error && (
                    <div style={{ color: "#f44336" }}>
                      Error: {result.error}
                    </div>
                  )}
                </div>
              </Focusable>
            </PanelSectionRow>
          ))}
        </>
      )}
    </>
  );
}
