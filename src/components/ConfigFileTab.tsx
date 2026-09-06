import { useEffect, useState } from "react";
import { Field, Focusable, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { getConfigFileContent, FileContentResult } from "../api/lsfgApi";
import t from "../i18n/i18n";

export function ConfigFileTab() {
  const [result, setResult] = useState<FileContentResult | null>(null);

  const copy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Clipboard access is unavailable in some Deck UI contexts.
    }
  };

  useEffect(() => {
    getConfigFileContent().then(setResult).catch((error) => {
      setResult({ success: false, error: String(error) });
    });
  }, []);

  if (!result) {
    return (
      <PanelSection title={t("NERD_CONFIG_FILE", "Configuration File")}>
        <PanelSectionRow><Spinner /></PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title={t("NERD_CONFIG_FILE", "Configuration File")}>
      <PanelSectionRow>
        <Field label={result.path || t("NERD_CONFIG_FILE", "Configuration File")} description={result.error || "Tap the file to copy it."}>
          {result.success && result.content && (
            <Focusable onActivate={() => void copy(result.content || "")}>
              <pre style={{ maxHeight: "420px", overflow: "auto", whiteSpace: "pre-wrap", fontSize: "12px" }}>
                {result.content}
              </pre>
            </Focusable>
          )}
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
