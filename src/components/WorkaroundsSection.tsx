import { ButtonItem, Field, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";
import { usePerAppWorkarounds } from "../hooks/usePerAppWorkarounds";
import t from "../i18n/i18n";
import type { WorkaroundField } from "../hooks/usePerAppWorkarounds";

interface WorkaroundsSectionProps {
  appId: string;
  nonSteam: boolean;
  onRepair?: () => Promise<boolean>;
}

const WORKAROUNDS_COLLAPSED_KEY = "lsfg-workarounds-collapsed-v2";
type ToggleWorkaroundField = Exclude<WorkaroundField, "dxvkFrameRate">;

const TOGGLE_ROWS: readonly {
  field: ToggleWorkaroundField;
  labelKey: string;
  label: string;
  descriptionKey: string;
  description: string;
}[] = [
  {
    field: "disableSteamdeckMode",
    labelKey: "CONFIG_DISABLE_STEAMDECK_MODE",
    label: "Disable Steam Deck Mode",
    descriptionKey: "CONFIG_DISABLE_STEAMDECK_MODE_DESC",
    description: "Disables a game-specific Steam Deck compatibility switch. Requires game restart to apply.",
  },
  {
    field: "disableGamescopeWsi",
    labelKey: "CONFIG_DISABLE_GAMESCOPE_WSI",
    label: "Disable Gamescope WSI",
    descriptionKey: "CONFIG_DISABLE_GAMESCOPE_WSI_DESC",
    description: "Adds ENABLE_GAMESCOPE_WSI=0. Requires game restart to apply.",
  },
  {
    field: "disableHdr",
    labelKey: "CONFIG_DISABLE_HDR",
    label: "Disable HDR",
    descriptionKey: "CONFIG_DISABLE_HDR_DESC",
    description: "Prevents DXVK from exposing HDR to the game. Requires game restart to apply.",
  },
  {
    field: "disableVkbasalt",
    labelKey: "CONFIG_DISABLE_VKBASALT",
    label: "Disable vkBasalt",
    descriptionKey: "CONFIG_DISABLE_VKBASALT_DESC",
    description: "Disables vkBasalt layer which can conflict with LSFG (Reshade, some Decky plugins)",
  },
  {
    field: "enableZink",
    labelKey: "CONFIG_ENABLE_ZINK",
    label: "Force Zink for OpenGL Games",
    descriptionKey: "CONFIG_ENABLE_ZINK_DESC",
    description: "Uses Mesa's Zink OpenGL-to-Vulkan driver. May cause crashes or freezes with some games. Requires game restart to apply.",
  },
];

function usePersistentCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(WORKAROUNDS_COLLAPSED_KEY);
      return saved !== null ? JSON.parse(saved) === true : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(WORKAROUNDS_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      // Persisting the view preference is optional.
    }
  }, [collapsed]);

  return [collapsed, () => setCollapsed((value) => !value)] as const;
}

export function WorkaroundsSection({ appId, nonSteam, onRepair }: WorkaroundsSectionProps) {
  const [collapsed, toggleCollapsed] = usePersistentCollapsed();
  const { status, snapshot, refresh, update, error } = usePerAppWorkarounds(appId, nonSteam);
  const [repairing, setRepairing] = useState(false);
  const state = snapshot?.state;
  const controlsDisabled = status !== "ready" || state === undefined || snapshot?.wrapperOwned !== true || snapshot.integrationInstalled !== true;
  const [fpsValue, setFpsValue] = useState<number | null>(null);
  const effectiveFpsValue = fpsValue ?? state?.dxvkFrameRate ?? 0;
  const fpsLabel = effectiveFpsValue > 0
    ? `${effectiveFpsValue} FPS`
    : t("CONFIG_BASE_FPS_CAP_OFF", "Off");

  const handleRepair = async () => {
    if (!onRepair || repairing) return;
    setRepairing(true);
    try {
      if (await onRepair()) await refresh();
    } finally {
      setRepairing(false);
    }
  };

  useEffect(() => {
    setFpsValue(state?.dxvkFrameRate ?? null);
  }, [state?.dxvkFrameRate, status]);

  return (
    <>
      <style>
        {`
        .LSFG_WorkaroundsCollapseButton_Container > div > div > div > button,
        .LSFG_WorkaroundsCollapseButton_Container > div > div > div > div > button {
          height: 24px !important;
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        `}
      </style>
      <PanelSectionRow>
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            marginTop: "8px",
            marginBottom: "6px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
            paddingBottom: "3px",
            color: "white",
          }}
        >
          {t("CONFIG_WORKAROUNDS_TITLE", "Workarounds")}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div className="LSFG_WorkaroundsCollapseButton_Container" style={{ marginTop: "-2px", marginBottom: "4px" }}>
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
        <>
          {status === "loading" && (
            <PanelSectionRow>
              <Field label="Reading launch options..." />
            </PanelSectionRow>
          )}
          {status === "error" && (
            <>
              <PanelSectionRow>
                <Field
                  label="Launch options unavailable"
                  description={error || "Steam did not provide readable launch options."}
                />
              </PanelSectionRow>
              <PanelSectionRow>
                <ButtonItem layout="below" onClick={() => void refresh()}>Retry</ButtonItem>
              </PanelSectionRow>
            </>
          )}
          {status === "ready" && snapshot && (!snapshot.wrapperOwned || !snapshot.integrationInstalled) && (
            <>
              <PanelSectionRow>
                <Field label="Wrapper needs to be reinstalled" />
              </PanelSectionRow>
              {onRepair && (
                <PanelSectionRow>
                  <ButtonItem layout="below" disabled={repairing} onClick={() => void handleRepair()}>
                    {repairing ? "Reinstalling..." : "Reinstall wrapper"}
                  </ButtonItem>
                </PanelSectionRow>
              )}
            </>
          )}

          <PanelSectionRow>
            <SliderField
              label={`${t("CONFIG_BASE_FPS_CAP", "Base FPS Cap")} (${fpsLabel})`}
              description={t("CONFIG_BASE_FPS_CAP_DESC", "Base cap for DXVK-backed games before frame generation; 0 disables. Requires game restart to apply.")}
              value={effectiveFpsValue}
              min={0}
              max={60}
              step={1}
              onChange={(value) => {
                setFpsValue(value);
                void update("dxvkFrameRate", value);
              }}
              disabled={controlsDisabled}
            />
          </PanelSectionRow>
          {TOGGLE_ROWS.map((row) => (
            <PanelSectionRow key={row.field}>
              <ToggleField
                label={t(row.labelKey, row.label)}
                description={t(row.descriptionKey, row.description)}
                checked={Boolean(state?.[row.field])}
                onChange={(value) => void update(row.field, value)}
                disabled={controlsDisabled}
              />
            </PanelSectionRow>
          ))}
        </>
      )}
    </>
  );
}
