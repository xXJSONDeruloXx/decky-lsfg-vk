import { PanelSectionRow } from "@decky/ui";
import t from '../i18n/i18n';

export function UsageInstructions() {
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
          {t('USAGE_TITLE', 'Usage Instructions')}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          style={{
            fontSize: "12px",
            lineHeight: "1.4",
            opacity: "0.8",
            whiteSpace: "pre-wrap"
          }}
        >
          {t('USAGE_DESC', 'Click "Copy Launch Option" button, then paste it into your Steam game\'s launch options to enable frame generation.')}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          style={{
        fontSize: "12px",
        lineHeight: "1.4",
        opacity: "0.8",
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        padding: "8px",
        borderRadius: "4px",
        fontFamily: "monospace",
        marginTop: "8px",
        marginBottom: "8px",
        textAlign: "center"
          }}
        >
          <strong>~/lsfg %command%</strong>
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          style={{
            fontSize: "11px",
            lineHeight: "1.3",
            opacity: "0.6",
            marginTop: "8px"
          }}
        >
          {t('USAGE_CONFIG_NOTE', 'The configuration is stored in ~/.config/lsfg-vk/conf.toml and hot-reloads while games are running.')}
        </div>
      </PanelSectionRow>
    </>
  );
}
