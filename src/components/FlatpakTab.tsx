import { ButtonItem, ConfirmModal, DialogButton, Field, Focusable, PanelSection, PanelSectionRow, gamepadDialogClasses, showModal } from "@decky/ui";
import { useCallback, useMemo, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import type { FlatpakApp, LsfgConfig, WorkaroundState } from "../api/lsfgApi";
import t from "../i18n/i18n";
import { CollapsibleItemGroup, collapsibleItemGroupStyles, usePersistentCollapsed } from "./CollapsibleItemGroup";
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
  onEnableAll: () => Promise<void>;
  onRemove: (appId: string) => Promise<boolean>;
  onRemoveAll: () => Promise<void>;
  onConfigChange: (appId: string, config: LsfgConfig) => Promise<boolean>;
  onWorkaroundChange: (appId: string, state: WorkaroundState) => Promise<boolean>;
}

const ENABLED_COLLAPSED_KEY = "lsfg-flatpak-enabled-collapsed-v2";
const AVAILABLE_COLLAPSED_KEY = "lsfg-flatpak-available-collapsed-v2";

export function FlatpakTab({
  apps,
  runningApp,
  loading,
  busyAppId,
  onRefresh,
  onEnable,
  onEnableAll,
  onRemove,
  onRemoveAll,
  onConfigChange,
  onWorkaroundChange,
}: Props) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const selected = useMemo(
    () => selectedAppId ? apps.find((app) => app.app_id === selectedAppId) || null : null,
    [apps, selectedAppId],
  );
  const close = useCallback(() => setSelectedAppId(null), []);
  const [enabledCollapsed, toggleEnabled] = usePersistentCollapsed(ENABLED_COLLAPSED_KEY);
  const [availableCollapsed, toggleAvailable] = usePersistentCollapsed(AVAILABLE_COLLAPSED_KEY);

  const enabledApps = useMemo(
    () => apps.filter((app) => app.enabled).sort((a, b) => a.app_name.localeCompare(b.app_name)),
    [apps],
  );
  const availableApps = useMemo(
    () => apps.filter((app) => !app.enabled).sort((a, b) => a.app_name.localeCompare(b.app_name)),
    [apps],
  );
  const enableableApps = useMemo(
    () => availableApps.filter((app) => !(app.prepared && !app.owned) && !app.error),
    [availableApps],
  );
  const confirmEnableAll = () => {
    showModal(
      <ConfirmModal
        strTitle={t("FLATPAK_ENABLE_ALL_TITLE", "Enable all available Flatpaks?")}
        strDescription={t("FLATPAK_ENABLE_ALL_DESC", "Create individual LSFG-VK profiles for every Flatpak app this plugin can manage. Apps prepared externally or unavailable will be skipped.")}
        strOKButtonText={t("MODAL_ENABLE_ALL_CONFIRM", "Enable all")}
        strCancelButtonText={t("MODAL_CANCEL", "Cancel")}
        onOK={() => void onEnableAll()}
        onCancel={() => {}}
      />,
    );
  };
  const confirmRemoveAll = () => {
    showModal(
      <ConfirmModal
        strTitle={t("FLATPAK_REMOVE_ALL_TITLE", "Remove all Flatpak profiles?")}
        strOKButtonText={t("MODAL_REMOVE_ALL_CONFIRM", "Remove all")}
        strCancelButtonText={t("MODAL_CANCEL", "Cancel")}
        onOK={() => void onRemoveAll()}
        onCancel={() => {}}
      />,
    );
  };
  const itemFor = (app: FlatpakApp) => ({
    id: app.app_id,
    label: app.app_name,
    description: `${app.app_id} · ${app.prepared && !app.owned ? t("FLATPAK_PREPARED_EXTERNALLY", "Prepared externally") : t("FLATPAK_AVAILABLE", "Available")}`,
  });

  if (!selectedAppId) {
    return (
      <PanelSection title={t("TAB_FLATPAK", "Flatpak")}>
        <style>{collapsibleItemGroupStyles}</style>
        <CollapsibleItemGroup
          title={t("SECTION_ENABLED", "Enabled")}
          items={enabledApps.map((app) => ({
            id: app.app_id,
            label: app.app_name,
            description: `${app.app_id}${app.app_id === runningApp?.app_id ? ` · ${t("FLATPAK_RUNNING", "Running")}` : ""}`,
          }))}
          collapsed={enabledCollapsed}
          onToggle={toggleEnabled}
          onSelect={setSelectedAppId}
        />
        <CollapsibleItemGroup
          title={t("SECTION_AVAILABLE", "Available")}
          items={availableApps.map(itemFor)}
          collapsed={availableCollapsed}
          onToggle={toggleAvailable}
          onSelect={setSelectedAppId}
        />
        {enableableApps.length > 0 && (
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={loading || Boolean(busyAppId)}
              onClick={confirmEnableAll}
            >
              {t("FLATPAK_ENABLE_ALL_BTN", "Enable all available Flatpaks")}
            </ButtonItem>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={loading || Boolean(busyAppId) || enabledApps.length === 0}
            onClick={confirmRemoveAll}
          >
            {t("FLATPAK_REMOVE_ALL_BTN", "Remove all profiles")}
          </ButtonItem>
        </PanelSectionRow>
        {apps.length === 0 && !loading && (
          <PanelSectionRow>
            <Field label={t("FLATPAK_NO_APPS_FOUND", "No Flatpak applications found")} />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={loading || Boolean(busyAppId)} onClick={() => void onRefresh()}>
            {loading ? t("FLATPAK_REFRESHING", "Refreshing...") : t("FLATPAK_REFRESH_BTN", "Refresh Flatpaks")}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (!selected) {
    return (
      <PanelSection title={t("TAB_FLATPAK", "Flatpak")}>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={close}>{t("FLATPAK_BACK_BTN", "Back")}</ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label={t("FLATPAK_APP_UNINSTALLED", "Flatpak application is no longer installed")} />
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
    selected.app_id === runningApp?.app_id ? t("FLATPAK_RUNNING", "Running") : null,
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
                aria-label={t("FLATPAK_BACK_TO_FLATPAKS", "Back to Flatpaks")}
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
              {busy ? t("FLATPAK_ENABLING", "Enabling...") : external ? t("FLATPAK_PREPARED_EXTERNALLY", "Prepared externally") : t("FLATPAK_ENABLE_BTN", "Enable LSFG-VK")}
            </ButtonItem>
          </PanelSectionRow>
          {selected.error && (
            <PanelSectionRow>
              <Field label={t("FLATPAK_UNAVAILABLE", "Unavailable")} description={selected.error} />
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
              {busy ? t("FLATPAK_REMOVING", "Removing...") : t("FLATPAK_REMOVE_BTN", "Remove Flatpak profile")}
            </ButtonItem>
          </PanelSectionRow>
        </>
      )}
      <ProfileDetails description={profileDescription} />
    </Focusable>
  );
}
