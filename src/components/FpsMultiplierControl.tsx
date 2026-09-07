import { DialogButton, Focusable, PanelSectionRow } from "@decky/ui";
import { useEffect, useRef } from "react";
import { ConfigurationData } from "../config/configSchema";
import { MULTIPLIER } from "../config/generatedConfigSchema";
import t from "../i18n/i18n";

interface FpsMultiplierControlProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => Promise<void>;
  autoFocus?: boolean;
  onAutoFocus?: () => void;
}

export function FpsMultiplierControl({
  config,
  onConfigChange,
  autoFocus = false,
  onAutoFocus,
}: FpsMultiplierControlProps) {
  const focusableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => {
      const target = focusableRef.current?.querySelector<HTMLElement>(
        '[role="button"], [role="slider"]',
      );
      target?.focus();
      onAutoFocus?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, onAutoFocus]);

  return (
    <PanelSectionRow>
      <Focusable
        ref={focusableRef}
        noFocusRing
        style={{
          marginTop: "6px",
          marginBottom: "6px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        flow-children="horizontal"
      >
        <DialogButton
          style={{
            marginLeft: "0px",
            height: "30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "5px 0px 0px 0px",
            minWidth: "40px",
          }}
          onClick={() => void onConfigChange(MULTIPLIER, Math.max(1, config.multiplier - 1))}
          disabled={config.multiplier <= 1}
        >
          −
        </DialogButton>
        <div
          style={{
            marginLeft: "20px",
            marginRight: "20px",
            fontSize: "16px",
            fontWeight: "bold",
            color: config.multiplier > 4 ? "red" : "white",
            minWidth: "60px",
            textAlign: "center",
          }}
        >
          {config.multiplier < 2 ? t("MULTIPLIER_OFF", "OFF") : `${config.multiplier}X`}
        </div>
        <DialogButton
          style={{
            marginLeft: "0px",
            height: "30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "5px 0px 0px 0px",
            minWidth: "40px",
          }}
          onClick={() => void onConfigChange(MULTIPLIER, Math.min(4, config.multiplier + 1))}
          disabled={config.multiplier >= 4}
        >
          +
        </DialogButton>
      </Focusable>
    </PanelSectionRow>
  );
}
