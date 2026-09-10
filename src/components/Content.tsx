import { Tabs } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaCube, FaFileAlt, FaGamepad, FaList, FaTools } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import { useFlatpakConfiguration } from "../hooks/useFlatpakConfiguration";
import { useGameConfiguration } from "../hooks/useGameConfiguration";
import { useInstallation } from "../hooks/useLsfgHooks";
import { tabStyles } from "../styles";
import { ConfigFileTab } from "./ConfigFileTab";
import { ConfigurationTab } from "./ConfigurationTab";
import { FlatpakNowPlayingTab } from "./FlatpakNowPlayingTab";
import { FlatpakTab } from "./FlatpakTab";
import { NowPlayingTab } from "./NowPlayingTab";
import { SetupTab } from "./SetupTab";

const tabIcons = {
  nowPlaying: <FaGamepad size={18} />,
  games: <FaList size={18} />,
  flatpak: <FaCube size={18} />,
  configFile: <FaFileAlt size={18} />,
  setup: <FaTools size={18} />,
};

const DEBUG_TAB_VISIBILITY_KEY = "lsfg-debug-tab-visible-v1";

function usePersistentBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? defaultValue : stored === "true";
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}

export function Content() {
  const {
    config,
    runningConfig,
    targets,
    runningGame,
    setSelectedAppId,
    save,
    saveFor,
    enable,
    enableAll,
    repair,
    resetSelected,
    resetAll,
    reload,
  } = useGameConfiguration();
  const {
    isInstalled,
    installationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    isInstalling,
    isUninstalling,
    install,
    uninstall,
  } = useInstallation(reload);
  const setupComplete =
    isInstalled &&
    losslessScalingInstalled &&
    steamBranchStatus?.success === true &&
    steamBranchStatus.installed &&
    !steamBranchStatus.needs_switch;
  const flatpak = useFlatpakConfiguration(setupComplete);
  const [tab, setTab] = useState("Setup");
  const [showDebugTab, setShowDebugTab] = usePersistentBoolean(DEBUG_TAB_VISIBILITY_KEY, true);
  const previousRunningWorkload = useRef<string | null>(null);
  const runningFlatpak = flatpak.runningApp;
  const hasNowPlaying = Boolean(runningGame?.configured || runningFlatpak);
  const runningWorkload = runningGame?.configured
    ? `steam:${runningGame.appid}`
    : runningFlatpak ? `flatpak:${runningFlatpak.app_id}` : null;

  useEffect(() => {
    if (!setupComplete) {
      setTab("Setup");
      return;
    }
    setTab((current) => current === "Setup" ? (hasNowPlaying ? "NowPlaying" : "Games") : current);
  }, [hasNowPlaying, setupComplete]);

  useEffect(() => {
    if (!setupComplete) return;
    const previous = previousRunningWorkload.current;
    previousRunningWorkload.current = runningWorkload;
    if (runningWorkload && runningWorkload !== previous) setTab("NowPlaying");
    else if (!runningWorkload && previous) {
      setTab((current) => current === "NowPlaying" ? "Games" : current);
    }
  }, [runningWorkload, setupComplete]);

  useEffect(() => {
    if (isInstalled) {
      void reload();
      void flatpak.reload();
    }
  }, [isInstalled, reload, flatpak.reload]);

  useEffect(() => {
    if (!showDebugTab && tab === "ConfigFile") setTab("Games");
  }, [showDebugTab, tab]);

  const handleConfigChange = async (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
    cleanupLaunchOptions = false,
  ) => save({ ...config, [fieldName]: value }, cleanupLaunchOptions);

  const setup = (
    <SetupTab
      isInstalled={isInstalled}
      installationStatus={installationStatus}
      losslessScalingInstalled={losslessScalingInstalled}
      losslessScalingStatus={losslessScalingStatus}
      steamBranchStatus={steamBranchStatus}
      isInstalling={isInstalling}
      isUninstalling={isUninstalling}
      onInstall={() => void install()}
      onUninstall={() => void uninstall()}
    />
  );

  const nowPlaying = runningGame?.configured ? (
    <NowPlayingTab
      game={runningGame}
      config={runningConfig}
      onConfigChange={async (field, value) => {
        await saveFor(runningGame.appid, { ...runningConfig, [field]: value }, true);
      }}
    />
  ) : runningFlatpak ? (
    <FlatpakNowPlayingTab
      app={runningFlatpak}
      busy={flatpak.busyAppId === runningFlatpak.app_id}
      onConfigChange={flatpak.updateConfig}
      onWorkaroundChange={flatpak.updateWorkarounds}
    />
  ) : null;

  const tabs = setupComplete
    ? [
        ...(nowPlaying ? [{ id: "NowPlaying", title: tabIcons.nowPlaying, content: nowPlaying }] : []),
        {
          id: "Games",
          title: tabIcons.games,
          content: (
            <ConfigurationTab
              config={config}
              targets={targets}
              runningGame={runningGame}
              showDebugTab={showDebugTab}
              onShowDebugTabChange={setShowDebugTab}
              onSelect={setSelectedAppId}
              onConfigChange={(field, value) => handleConfigChange(field, value, true)}
              onEnable={enable}
              onEnableAll={enableAll}
              onRepair={repair}
              onReset={resetSelected}
              onResetAll={resetAll}
            />
          ),
        },
        {
          id: "Flatpak",
          title: tabIcons.flatpak,
          content: (
            <FlatpakTab
              apps={flatpak.apps}
              runningApp={runningFlatpak}
              loading={flatpak.loading}
              busyAppId={flatpak.busyAppId}
              onRefresh={flatpak.reload}
              onEnable={flatpak.enableApp}
              onRemove={flatpak.removeApp}
              onConfigChange={flatpak.updateConfig}
              onWorkaroundChange={flatpak.updateWorkarounds}
            />
          ),
        },
        ...(showDebugTab ? [{ id: "ConfigFile", title: tabIcons.configFile, content: <ConfigFileTab /> }] : []),
        { id: "Setup", title: tabIcons.setup, content: setup },
      ]
    : [{ id: "Setup", title: tabIcons.setup, content: setup }];

  return (
    <div
      className="lsfg-vk-tabs"
      style={{ height: "95%", width: "300px", position: "fixed", marginTop: "-12px", overflow: "hidden" }}
    >
      <style>{tabStyles}</style>
      <Tabs activeTab={!showDebugTab && tab === "ConfigFile" ? "Games" : tab} onShowTab={setTab} tabs={tabs} />
    </div>
  );
}
