import { ButtonItem, DialogButton, Field, Focusable, PanelSection, PanelSectionRow, gamepadDialogClasses } from "@decky/ui";
import { useCallback, useMemo, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import type { FlatpakApp, LsfgConfig, WorkaroundState } from "../api/lsfgApi";
import { ConfigurationSection } from "./ConfigurationSection";
import { FlatpakWorkaroundsSection } from "./FlatpakWorkaroundsSection";
import { FpsMultiplierControl } from "./FpsMultiplierControl";
import { ProfileDetails } from "./ProfileDetails";

interface Props {
  apps: FlatpakApp[];
  runningApp: FlatpakApp | null;
  loading: boolean;
  busyAppId: string;
  onRefresh: () => Promise<void>;
  onEnable: (appId: string) => Promise<boolean>;
  onRemove: (appId: string) => Promise<boolean>;
  onConfigChange: (appId: string, config: LsfgConfig) => Promise<boolean>;
  onWorkaroundChange: (appId: string, state: WorkaroundState) => Promise<boolean>;
}

export function FlatpakTab({
  apps,
  runningApp,
  loading,
  busyAppId,
  onRefresh,
  onEnable,
  onRemove,
  onConfigChange,
  onWorkaroundChange,
}: Props) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const selected = useMemo(
    () => selectedAppId ? apps.find((app) => app.app_id === selectedAppId) || null : null,
    [apps, selectedAppId],
  );
  const close = useCallback(() => setSelectedAppId(null), []);

  if (!selectedAppId) {
    return (
      <PanelSection title="Flatpak">
        <PanelSectionRow>
          <Field
            label="Flatpak applications"
            description="Enable LSFG-VK directly for a Flatpak. Steam shortcuts and launcher scripts are not modified."
          />
        </PanelSectionRow>
        {apps.map((app) => {
          const status = app.enabled
            ? app.app_id === runningApp?.app_id ? "Enabled · Running" : "Enabled"
            : app.prepared && !app.owned ? "Prepared externally" : "Available";
          return (
            <PanelSectionRow key={app.app_id}>
              <Field
                label={app.app_name}
                description={`${app.app_id} · ${status}`}
                onActivate={() => setSelectedAppId(app.app_id)}
                highlightOnFocus
              />
            </PanelSectionRow>
          );
        })}
        {apps.length === 0 && !loading && (
          <PanelSectionRow>
            <Field label="No Flatpak applications found" />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={loading || Boolean(busyAppId)} onClick={() => void onRefresh()}>
            {loading ? "Refreshing..." : "Refresh Flatpaks"}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (!selected) {
    return (
      <PanelSection title="Flatpak">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={close}>Back</ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label="Flatpak application is no longer installed" />
        </PanelSectionRow>
      </PanelSection>
    );
  }

  const busy = busyAppId === selected.app_id;
  const config = selected.config;
  const external = selected.prepared && !selected.owned;
  const profileDescription = [
    selected.app_id,
    selected.runtime_branch ? `runtime ${selected.runtime_branch}` : null,
    selected.enabled ? `profile ${selected.profile}` : null,
    selected.app_id === runningApp?.app_id ? "Running" : null,
  ].filter(Boolean).join(" · ");

  const changeConfig = async (
    field: keyof LsfgConfig,
    value: boolean | number | string | string[],
  ) => {
    if (!config) return;
    await onConfigChange(selected.app_id, { ...config, [field]: value });
  };

  return (
    <Focusable onCancelButton={close}>
      <PanelSection>
        <PanelSectionRow>
          <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Focusable noFocusRing style={{ flex: "none" }}>
              <DialogButton
                aria-label="Back to Flatpaks"
                onClick={close}
                style={{
                  width: "48px",
                  minWidth: "48px",
                  height: "24px",
                  minHeight: "24px",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FaArrowLeft />
              </DialogButton>
            </Focusable>
            <div
              className={gamepadDialogClasses.FieldLabel}
              style={{ flex: 1, minWidth: 0, marginLeft: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {selected.app_name}
            </div>
          </div>
        </PanelSectionRow>
      </PanelSection>
      {!selected.enabled && (
        <PanelSection>
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={busy || external || Boolean(selected.error)}
              onClick={() => void onEnable(selected.app_id)}
            >
              {busy ? "Enabling..." : external ? "Prepared externally" : "Enable LSFG-VK"}
            </ButtonItem>
          </PanelSectionRow>
          {selected.error && (
            <PanelSectionRow>
              <Field label="Unavailable" description={selected.error} />
            </PanelSectionRow>
          )}
        </PanelSection>
      )}
      {selected.enabled && config && (
        <>
          <FpsMultiplierControl config={config} onConfigChange={changeConfig} />
          <ConfigurationSection config={config} onConfigChange={changeConfig} />
          <FlatpakWorkaroundsSection
            state={selected.workarounds}
            disabled={busy}
            onChange={(state) => onWorkaroundChange(selected.app_id, state)}
          />
          <PanelSectionRow>
            <ButtonItem layout="below" disabled={busy} onClick={() => void onRemove(selected.app_id)}>
              {busy ? "Removing..." : "Remove Flatpak profile"}
            </ButtonItem>
          </PanelSectionRow>
        </>
      )}
      <ProfileDetails description={profileDescription} />
    </Focusable>
  );
}
