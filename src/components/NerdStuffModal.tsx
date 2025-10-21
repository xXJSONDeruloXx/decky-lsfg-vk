import { useState, useEffect } from "react";
import { 
  ModalRoot, 
  Field,
  Focusable,
  DialogControlsSection,
  PanelSectionRow,
  ButtonItem
} from "@decky/ui";
import { getDllStats, DllStatsResult, getConfigFileContent, getLaunchScriptContent, FileContentResult } from "../api/lsfgApi";

interface NerdStuffModalProps {
  closeModal?: () => void;
}

export function NerdStuffModal({ closeModal }: NerdStuffModalProps) {
  const [dllStats, setDllStats] = useState<DllStatsResult | null>(null);
  const [configContent, setConfigContent] = useState<FileContentResult | null>(null);
  const [scriptContent, setScriptContent] = useState<FileContentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load all data in parallel
        const [dllResult, configResult, scriptResult] = await Promise.all([
          getDllStats(),
          getConfigFileContent(),
          getLaunchScriptContent()
        ]);
        
        setDllStats(dllResult);
        setConfigContent(configResult);
        setScriptContent(scriptResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const formatSHA256 = (hash: string) => {
    // Format SHA256 hash for better readability (add spaces every 8 characters)
    return hash.replace(/(.{8})/g, '$1 ').trim();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here if desired
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  return (
    <ModalRoot onCancel={closeModal} onOK={closeModal}>
      {loading && (
        <div>Loading information...</div>
      )}
      
      {error && (
        <div>Error: {error}</div>
      )}
      
      {!loading && !error && (
        <>
          {/* DLL Stats Section */}
          {dllStats && (
            <>
              {!dllStats.success ? (
                <div>{dllStats.error || "Failed to get DLL stats"}</div>
              ) : (
                <div>
                  <Field label="DLL Path">
                    <Focusable
                      onClick={() => dllStats.dll_path && copyToClipboard(dllStats.dll_path)}
                      onActivate={() => dllStats.dll_path && copyToClipboard(dllStats.dll_path)}
                    >
                      {dllStats.dll_path || "Not available"}
                    </Focusable>
                  </Field>
                  
                  <Field label="DLL SHA256 Hash">
                    <Focusable
                      onClick={() => dllStats.dll_sha256 && copyToClipboard(dllStats.dll_sha256)}
                      onActivate={() => dllStats.dll_sha256 && copyToClipboard(dllStats.dll_sha256)}
                    >
                      {dllStats.dll_sha256 ? formatSHA256(dllStats.dll_sha256) : "Not available"}
                    </Focusable>
                  </Field>
                  
                  {dllStats.dll_source && (
                    <Field label="Detection Source">
                      <div>{dllStats.dll_source}</div>
                    </Field>
                  )}
                </div>
              )}
            </>
          )}

          {/* Launch Script Section */}
          {scriptContent && (
            <Field label="Launch Script">
              {!scriptContent.success ? (
                <div>Script not found: {scriptContent.error}</div>
              ) : (
                <div>
                  <div style={{ marginBottom: "8px", fontSize: "0.9em", opacity: 0.8 }}>
                    Path: {scriptContent.path}
                  </div>
                  <Focusable
                    onClick={() => scriptContent.content && copyToClipboard(scriptContent.content)}
                    onActivate={() => scriptContent.content && copyToClipboard(scriptContent.content)}
                  >
                    <pre style={{ 
                      background: "rgba(255, 255, 255, 0.1)", 
                      padding: "8px", 
                      borderRadius: "4px", 
                      fontSize: "0.8em",
                      whiteSpace: "pre-wrap",
                      overflow: "auto",
                      maxHeight: "150px"
                    }}>
                      {scriptContent.content || "No content"}
                    </pre>
                  </Focusable>
                </div>
              )}
            </Field>
          )}

          {/* Config File Section */}
          {configContent && (
            <Field label="Configuration File">
              {!configContent.success ? (
                <div>Config not found: {configContent.error}</div>
              ) : (
                <div>
                  <div style={{ marginBottom: "8px", fontSize: "0.9em", opacity: 0.8 }}>
                    Path: {configContent.path}
                  </div>
                  <Focusable
                    onClick={() => configContent.content && copyToClipboard(configContent.content)}
                    onActivate={() => configContent.content && copyToClipboard(configContent.content)}
                  >
                    <pre style={{ 
                      background: "rgba(255, 255, 255, 0.1)", 
                      padding: "8px", 
                      borderRadius: "4px", 
                      fontSize: "0.8em",
                      whiteSpace: "pre-wrap",
                      overflow: "auto"
                    }}>
                      {configContent.content || "No content"}
                    </pre>
                  </Focusable>
                </div>
              )}
            </Field>
          )}
          
          {/* Close Button */}
          <DialogControlsSection>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={closeModal}
              >
                Close
              </ButtonItem>
            </PanelSectionRow>
          </DialogControlsSection>
        </>
      )}
    </ModalRoot>
  );
}
