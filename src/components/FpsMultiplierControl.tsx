import { Focusable, PanelSectionRow, SliderField } from "@decky/ui";
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

  const multiplierLabel = `${config.multiplier}x`;

  return (
    <PanelSectionRow>
      <Focusable ref={focusableRef} noFocusRing>
        <SliderField
          label={`FPS multiplier · ${multiplierLabel}`}
          description={config.multiplier === 1
            ? t("MULTIPLIER_1X_DESC", "1x: no extra frames are generated. Frames pass through lsfg-vk unchanged, which is useful for comparing against 2x or higher.")
            : undefined}
          value={config.multiplier}
          min={1}
          max={6}
          step={1}
          notchCount={6}
          notchLabels={[
            { notchIndex: 0, label: "1X", value: 1 },
            { notchIndex: 1, label: "2X", value: 2 },
            { notchIndex: 2, label: "3X", value: 3 },
            { notchIndex: 3, label: "4X", value: 4 },
            { notchIndex: 4, label: "5X", value: 5 },
            { notchIndex: 5, label: "6X", value: 6 },
          ]}
          notchTicksVisible={true}
          showValue={false}
          onChange={(value) => void onConfigChange(MULTIPLIER, value)}
        />
      </Focusable>
    </PanelSectionRow>
  );
}
