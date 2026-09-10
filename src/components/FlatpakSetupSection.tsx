import { ButtonItem, Field, PanelSection, PanelSectionRow } from "@decky/ui";
import { useCallback, useEffect, useState } from "react";
import {
  getFlatpakApps,
  prepareFlatpakApp,
  removeFlatpakApp,
  type FlatpakApp,
} from "../api/lsfgApi";
import { showErrorToast } from "../utils/toastUtils";

interface Props {
  enabled: boolean;
}

export function FlatpakSetupSection({ enabled }: Props) {
  const [apps, setApps] = useState<FlatpakApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyApp, setBusyApp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setApps([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const result = await getFlatpakApps();
      if (!result.success) throw new Error(result.error || "Could not list Flatpak applications");
      setApps(result.apps || []);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (app: FlatpakApp) => {
    if (busyApp || (app.prepared && !app.owned)) return;
    setBusyApp(app.app_id);
    try {
      const result = app.prepared
        ? await removeFlatpakApp(app.app_id)
        : await prepareFlatpakApp(app.app_id);
      if (!result.success) throw new Error(result.error || "Flatpak setup failed");
      await load();
    } catch (operationError) {
      const message = operationError instanceof Error ? operationError.message : String(operationError);
      showErrorToast("Flatpak setup failed", message);
    } finally {
      setBusyApp("");
    }
  };

  if (!enabled) return null;

  return (
    <PanelSection title="Flatpak Setup">
      <PanelSectionRow>
        <Field
          label="Flatpak applications"
          description="Prepare an emulator or launcher once. Steam game profiles remain separate."
        />
      </PanelSectionRow>
      {error && (
        <PanelSectionRow>
          <Field label="Flatpak unavailable" description={error} />
        </PanelSectionRow>
      )}
      {apps.map((app) => {
        const busy = busyApp === app.app_id;
        const description = [
          app.app_id,
          app.runtime_branch ? `runtime ${app.runtime_branch}` : null,
          app.error,
        ].filter(Boolean).join(" · ");
        const label = busy
          ? "Working..."
          : app.prepared
            ? app.owned ? "Remove" : "Prepared externally"
            : app.error ? "Unavailable" : "Prepare";
        return (
          <PanelSectionRow key={app.app_id}>
            <Field label={app.app_name} description={description}>
              <ButtonItem
                layout="below"
                disabled={busy || Boolean(app.error) || (app.prepared && !app.owned)}
                onClick={() => void toggle(app)}
              >
                {label}
              </ButtonItem>
            </Field>
          </PanelSectionRow>
        );
      })}
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={loading || Boolean(busyApp)} onClick={() => void load()}>
          {loading ? "Refreshing..." : "Refresh Flatpaks"}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
