import { ButtonItem, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";
import type { WorkaroundState } from "../api/lsfgApi";
import t from "../i18n/i18n";

interface Props {
  state: WorkaroundState;
  disabled?: boolean;
  onChange: (state: WorkaroundState) => Promise<boolean>;
}

const WORKAROUNDS_COLLAPSED_KEY = "lsfg-flatpak-workarounds-collapsed-v1";

export function FlatpakWorkaroundsSection({ state, disabled = false, onChange }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(WORKAROUNDS_COLLAPSED_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [fpsValue, setFpsValue] = useState(state.dxvkFrameRate);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(WORKAROUNDS_COLLAPSED_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    setFpsValue(state.dxvkFrameRate);
  }, [state.dxvkFrameRate]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const update = (field: keyof WorkaroundState, value: boolean | number) => {
    void onChange({ ...state, [field]: value });
  };

  const updateFps = (value: number) => {
    setFpsValue(value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void onChange({ ...state, dxvkFrameRate: value });
    }, 250);
  };

  const fpsLabel = fpsValue > 0 ? `${fpsValue} FPS` : t("CONFIG_BASE_FPS_CAP_OFF", "Off");

  return (
    <>
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
        <ButtonItem
          layout="below"
          bottomSeparator={collapsed ? "standard" : "none"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <RiArrowDownSFill /> : <RiArrowUpSFill />}
        </ButtonItem>
      </PanelSectionRow>
      {!collapsed && (
        <>
          <PanelSectionRow>
            <SliderField
              label={`${t("CONFIG_BASE_FPS_CAP", "Base FPS Cap")} (${fpsLabel})`}
              description={t("CONFIG_BASE_FPS_CAP_DESC", "Base cap for DXVK-backed games before frame generation; 0 disables. Requires app restart to apply.")}
              value={fpsValue}
              min={0}
              max={60}
              step={1}
              onChange={updateFps}
              disabled={disabled}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={t("CONFIG_DISABLE_STEAMDECK_MODE", "Disable Steam Deck Mode")}
              description={t("CONFIG_DISABLE_STEAMDECK_MODE_DESC", "Disables a game-specific Steam Deck compatibility switch. Requires app restart to apply.")}
              checked={state.disableSteamdeckMode}
              onChange={(value) => update("disableSteamdeckMode", value)}
              disabled={disabled}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={t("CONFIG_DISABLE_GAMESCOPE_WSI", "Disable Gamescope WSI")}
              description={t("CONFIG_DISABLE_GAMESCOPE_WSI_DESC", "Adds ENABLE_GAMESCOPE_WSI=0. Requires app restart to apply.")}
              checked={state.disableGamescopeWsi}
              onChange={(value) => update("disableGamescopeWsi", value)}
              disabled={disabled}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={t("CONFIG_DISABLE_HDR", "Disable HDR")}
              description={t("CONFIG_DISABLE_HDR_DESC", "Prevents DXVK from exposing HDR to the app. Requires app restart to apply.")}
              checked={state.disableHdr}
              onChange={(value) => update("disableHdr", value)}
              disabled={disabled}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={t("CONFIG_DISABLE_VKBASALT", "Disable vkBasalt")}
              description={t("CONFIG_DISABLE_VKBASALT_DESC", "Disables vkBasalt which can conflict with LSFG-VK.")}
              checked={state.disableVkbasalt}
              onChange={(value) => update("disableVkbasalt", value)}
              disabled={disabled}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={t("CONFIG_ENABLE_ZINK", "Force Zink for OpenGL Games")}
              description={t("CONFIG_ENABLE_ZINK_DESC", "Uses Mesa's Zink OpenGL-to-Vulkan driver. May cause crashes or freezes. Requires app restart to apply.")}
              checked={state.enableZink}
              onChange={(value) => update("enableZink", value)}
              disabled={disabled}
            />
          </PanelSectionRow>
        </>
      )}
    </>
  );
}
