import { useEffect, useState } from "react";
import { Field, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { getConfigFileContent, FileContentResult } from "../api/lsfgApi";
import t from "../i18n/i18n";

export function ConfigFileTab() {
  const [result, setResult] = useState<FileContentResult | null>(null);

  useEffect(() => {
    getConfigFileContent().then(setResult).catch((error) => {
      setResult({ success: false, error: String(error) });
    });
  }, []);

  if (!result) {
    return (
      <PanelSection title={t("NERD_CONFIG_FILE", "Configuration File")}>
        <PanelSectionRow>
          <Spinner />
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title={t("NERD_CONFIG_FILE", "Configuration File")}>
      {result.error && (
        <PanelSectionRow>
          <Field label="Error" description={result.error} />
        </PanelSectionRow>
      )}
      {result.success && result.content && (
        <>
          <PanelSectionRow>
            <Field label="Config file" description={result.path} />
          </PanelSectionRow>
          <PanelSectionRow>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {result.content}
            </pre>
          </PanelSectionRow>
        </>
      )}
    </PanelSection>
  );
}
