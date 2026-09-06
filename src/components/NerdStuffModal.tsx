import { useState, useEffect } from "react";
import { 
  ModalRoot, 
  Field,
  Focusable,
  DialogControlsSection,
  PanelSectionRow,
  ButtonItem
} from "@decky/ui";
import {
  getConfigFileContent,
  getLaunchScriptContent,
  FileContentResult,
} from "../api/lsfgApi";
import t from '../i18n/i18n';

interface NerdStuffModalProps {
  closeModal?: () => void;
}

export function NerdStuffModal({ closeModal }: NerdStuffModalProps) {
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
        const [configResult, scriptResult] = await Promise.all([
          getConfigFileContent(),
          getLaunchScriptContent(),
        ]);
        
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
        <div>{t('NERD_LOADING', 'Loading information...')}</div>
      )}
      
      {error && (
        <div>Error: {error}</div>
      )}
      
      {!loading && !error && (
        <>
          {/* Launch Script Section */}
          {scriptContent && (
            <Field label={t('NERD_LAUNCH_SCRIPT', 'Launch Script')}>
              {!scriptContent.success ? (
                <div>{t('NERD_SCRIPT_NOT_FOUND_PREFIX', 'Script not found:')} {scriptContent.error}</div>
              ) : (
                <div>
                  <div style={{ marginBottom: "8px", fontSize: "0.9em", opacity: 0.8 }}>
                    {t('NERD_PATH_PREFIX', 'Path:')} {scriptContent.path}
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
                      {scriptContent.content || t('NERD_NO_CONTENT', 'No content')}
                    </pre>
                  </Focusable>
                </div>
              )}
            </Field>
          )}

          {/* Config File Section */}
          {configContent && (
            <Field label={t('NERD_CONFIG_FILE', 'Configuration File')}>
              {!configContent.success ? (
                <div>{t('NERD_CONFIG_NOT_FOUND_PREFIX', 'Config not found:')} {configContent.error}</div>
              ) : (
                <div>
                  <div style={{ marginBottom: "8px", fontSize: "0.9em", opacity: 0.8 }}>
                    {t('NERD_PATH_PREFIX', 'Path:')} {configContent.path}
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
                      {configContent.content || t('NERD_NO_CONTENT', 'No content')}
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
                {t('NERD_CLOSE', 'Close')}
              </ButtonItem>
            </PanelSectionRow>
          </DialogControlsSection>
        </>
      )}
    </ModalRoot>
  );
}
