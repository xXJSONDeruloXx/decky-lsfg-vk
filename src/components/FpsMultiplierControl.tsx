import { PanelSectionRow, DialogButton, Focusable } from "@decky/ui";
import { ConfigurationData } from "../config/configSchema";
import { MULTIPLIER } from "../config/generatedConfigSchema";

interface FpsMultiplierControlProps {
  config: ConfigurationData;
  onConfigChange: (fieldName: keyof ConfigurationData, value: boolean | number | string) => Promise<void>;
}

export function FpsMultiplierControl({
  config,
  onConfigChange
}: FpsMultiplierControlProps) {
  return (
    <PanelSectionRow>
      <Focusable
        style={{
          marginTop: "6px",
          marginBottom: "6px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
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
          onClick={() => onConfigChange(MULTIPLIER, Math.max(2, config.multiplier - 1))}
          disabled={config.multiplier <= 2}
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
            textAlign: "center"
          }}
        >
          {`${config.multiplier}X`}
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
          onClick={() => onConfigChange(MULTIPLIER, Math.min(4, config.multiplier + 1))}
          disabled={config.multiplier >= 4}
        >
          +
        </DialogButton>
      </Focusable>
    </PanelSectionRow>
  );
}
