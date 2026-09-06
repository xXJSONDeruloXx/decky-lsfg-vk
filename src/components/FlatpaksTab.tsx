import { useEffect, useState } from "react";
import {
  ConfirmModal,
  Field,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  showModal,
} from "@decky/ui";
import {
  checkFlatpakExtensionStatus,
  FlatpakApp,
  FlatpakAppInfo,
  FlatpakExtensionStatus,
  getFlatpakApps,
  installFlatpakExtension,
  removeFlatpakAppOverride,
  setFlatpakAppOverride,
  uninstallFlatpakExtension,
} from "../api/lsfgApi";
import { showErrorToast } from "../utils/toastUtils";
import t from "../i18n/i18n";

const runtimeVersions = [
  { version: "23.08", key: "installed_23_08" },
  { version: "24.08", key: "installed_24_08" },
  { version: "25.08", key: "installed_25_08" },
] as const;

interface RuntimeRowProps {
  version: string;
  installed: boolean;
  busy: boolean;
  onAction: () => void;
}

function RuntimeRow({ version, installed, busy, onAction }: RuntimeRowProps) {
  return (
    <PanelSectionRow>
      <ToggleField
        label={`Runtime ${version}`}
        description={busy ? "Updating..." : installed ? t("FLATPAK_INSTALLED", "Installed") : t("FLATPAK_NOT_INSTALLED", "Not installed")}
        checked={installed}
        onChange={() => onAction()}
        disabled={busy}
      />
    </PanelSectionRow>
  );
}

interface AppRowProps {
  app: FlatpakApp;
  busy: boolean;
  onToggle: () => void;
}

function AppRow({ app, busy, onToggle }: AppRowProps) {
  const configured = app.has_filesystem_override && app.has_env_override;
  const partial = app.has_filesystem_override || app.has_env_override;
  const status = configured
    ? t("FLATPAK_STATUS_CONFIGURED", "Configured")
    : partial
      ? t("FLATPAK_STATUS_PARTIAL", "Partial")
      : t("FLATPAK_STATUS_NO_OVERRIDES", "No overrides");

  return (
    <PanelSectionRow>
      <ToggleField
        label={app.app_name || app.app_id}
        description={`${app.app_id} - ${status}`}
        checked={configured}
        onChange={onToggle}
        disabled={busy}
      />
    </PanelSectionRow>
  );
}

export function FlatpaksTab() {
  const [extensionStatus, setExtensionStatus] = useState<FlatpakExtensionStatus | null>(null);
  const [apps, setApps] = useState<FlatpakAppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [nextStatus, nextApps] = await Promise.all([
        checkFlatpakExtensionStatus(),
        getFlatpakApps(),
      ]);
      setExtensionStatus(nextStatus);
      setApps(nextApps);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runExtensionOperation = async (version: string, installed: boolean) => {
    const action = installed ? "uninstall" : "install";
    setOperation(`${action}-${version}`);
    setError(null);
    try {
      const result = installed
        ? await uninstallFlatpakExtension(version)
        : await installFlatpakExtension(version);
      if (!result.success) throw new Error(result.error || result.message);
      setExtensionStatus(await checkFlatpakExtensionStatus());
    } catch (operationError) {
      const message = String(operationError);
      setError(message);
      showErrorToast("Flatpak operation failed", message);
    } finally {
      setOperation(null);
    }
  };

  const confirmExtensionOperation = (version: string, installed: boolean) => {
    if (!installed) {
      void runExtensionOperation(version, false);
      return;
    }
    showModal(
      <ConfirmModal
        strTitle={t("FLATPAK_UNINSTALL_TITLE", "Uninstall Runtime Extension")}
        strDescription={`${t("FLATPAK_UNINSTALL_CONFIRM_PREFIX", "Are you sure you want to uninstall the")} ${version} ${t("FLATPAK_UNINSTALL_CONFIRM_SUFFIX", "runtime extension?")}`}
        onOK={() => void runExtensionOperation(version, true)}
        onCancel={() => {}}
      />,
    );
  };

  const toggleApp = async (app: FlatpakApp) => {
    const configured = app.has_filesystem_override && app.has_env_override;
    setOperation(`app-${app.app_id}`);
    setError(null);
    try {
      const result = configured
        ? await removeFlatpakAppOverride(app.app_id)
        : await setFlatpakAppOverride(app.app_id);
      if (!result.success) throw new Error(result.error || result.message);
      setApps(await getFlatpakApps());
    } catch (operationError) {
      const message = String(operationError);
      setError(message);
      showErrorToast("Flatpak override failed", message);
    } finally {
      setOperation(null);
    }
  };

  if (loading) {
    return <PanelSection title="Runtimes" spinner />;
  }

  return (
    <>
      <PanelSection title="Runtimes">
        {error && <PanelSectionRow><Field label={t("FLATPAK_OPERATION_ERROR", "Operation failed")} description={error} /></PanelSectionRow>}
        {extensionStatus?.success ? runtimeVersions.map(({ version, key }) => (
          <RuntimeRow
            key={version}
            version={version}
            installed={extensionStatus[key]}
            busy={operation === `${extensionStatus[key] ? "uninstall" : "install"}-${version}`}
            onAction={() => confirmExtensionOperation(version, extensionStatus[key])}
          />
        )) : <PanelSectionRow><Field label={t("FLATPAK_ERROR", "Error")} description={extensionStatus?.error || error || t("FLATPAK_ERROR_STATUS", "Failed to check extension status")} /></PanelSectionRow>}
      </PanelSection>

      <PanelSection title="Applications">
        {apps?.success ? apps.apps.length ? apps.apps.map((app) => (
          <AppRow
            key={app.app_id}
            app={app}
            busy={operation === `app-${app.app_id}`}
            onToggle={() => void toggleApp(app)}
          />
        )) : <PanelSectionRow><Field label={t("FLATPAK_NO_APPS", "No Flatpak Apps Found")} description={t("FLATPAK_NO_APPS_DESC", "No Flatpak applications are currently installed")} /></PanelSectionRow> : <PanelSectionRow><Field label={t("FLATPAK_ERROR", "Error")} description={apps?.error || error || t("FLATPAK_ERROR_APPS", "Failed to load Flatpak applications")} /></PanelSectionRow>}
      </PanelSection>
    </>
  );
}
