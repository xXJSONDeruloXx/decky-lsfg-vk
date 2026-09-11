import { ButtonItem, Field, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { useEffect, useState } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";
import { getDebugFileContents, type DebugFileContent, type DebugFileContentsResult } from "../api/lsfgApi";
import t from "../i18n/i18n";

function usePersistentCollapsed(key: string) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) !== "false";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(collapsed));
    } catch {
      // Persisting the view preference is optional.
    }
  }, [collapsed, key]);

  return [collapsed, () => setCollapsed((value) => !value)] as const;
}

function DebugFileSection({ file }: { file: DebugFileContent }) {
  const [collapsed, toggleCollapsed] = usePersistentCollapsed(`lsfg-debug-file-${file.id}-collapsed-v1`);
  const status = file.exists ? "Present" : "Not present";

  return (
    <>
      <PanelSectionRow>
        <Field
          label={file.label}
          description={`${file.path} · ${status}`}
          bottomSeparator="none"
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <div
          className="LSFG_DebugFileCollapseButton_Container"
          style={{ marginTop: "-2px", marginBottom: "4px" }}
        >
          <ButtonItem
            layout="below"
            bottomSeparator={collapsed ? "standard" : "none"}
            onClick={toggleCollapsed}
          >
            {collapsed ? <RiArrowDownSFill /> : <RiArrowUpSFill />}
          </ButtonItem>
        </div>
      </PanelSectionRow>
      {!collapsed && (
        <PanelSectionRow>
          {file.exists && file.content !== null && file.content !== undefined ? (
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {file.content}
            </pre>
          ) : (
            <Field
              label="File unavailable"
              description={file.error || "The file has not been created yet."}
            />
          )}
        </PanelSectionRow>
      )}
    </>
  );
}

export function ConfigFileTab() {
  const [result, setResult] = useState<DebugFileContentsResult | null>(null);

  useEffect(() => {
    getDebugFileContents().then(setResult).catch((error) => {
      setResult({ success: false, error: String(error) });
    });
  }, []);

  if (!result) {
    return (
      <PanelSection title={t("NERD_CONFIG_FILE", "Config / Debug")}>
        <PanelSectionRow>
          <Spinner />
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <style>
        {`
          .LSFG_DebugFileCollapseButton_Container > div > div > div > button,
          .LSFG_DebugFileCollapseButton_Container > div > div > div > div > button {
            height: 24px !important;
            min-height: 24px !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .LSFG_DebugFileCollapseButton_Container svg {
            display: block;
            margin: 0;
          }
        `}
      </style>
      <PanelSection title={t("NERD_CONFIG_FILE", "Config / Debug")}>
        {result.error && (
          <PanelSectionRow>
            <Field label="Error" description={result.error} />
          </PanelSectionRow>
        )}
        {result.success && result.files?.map((file) => (
          <DebugFileSection key={file.id} file={file} />
        ))}
      </PanelSection>
    </>
  );
}
