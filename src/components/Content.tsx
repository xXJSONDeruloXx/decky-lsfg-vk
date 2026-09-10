import { Tabs } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaFileAlt, FaGamepad, FaList, FaTools } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import { useGameConfiguration } from "../hooks/useGameConfiguration";
import { useInstallation } from "../hooks/useLsfgHooks";
import { tabStyles } from "../styles";
import { ConfigFileTab } from "./ConfigFileTab";
import { ConfigurationTab } from "./ConfigurationTab";
import { NowPlayingTab } from "./NowPlayingTab";
import { SetupTab } from "./SetupTab";

const tabIcons = {
  nowPlaying: <FaGamepad size={18} />,
  games: <FaList size={18} />,
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
    } catch {
      // Persisting the visibility preference is optional.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

export function Content() {
  const {
    config,
    targets,
    runningGame,
    setSelectedAppId,
    save,
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
    flatpakStatus,
    steamBranchStatus,
    isInstalling,
    isUninstalling,
    isRepairingFlatpak,
    install,
    uninstall,
    repairFlatpak,
  } = useInstallation(reload);
  const [tab, setTab] = useState("Setup");
  const [showDebugTab, setShowDebugTab] = usePersistentBoolean(DEBUG_TAB_VISIBILITY_KEY, true);
  const previousRunningAppId = useRef<string | null>(null);
  const setupComplete =
    isInstalled &&
    losslessScalingInstalled &&
    steamBranchStatus?.success === true &&
    steamBranchStatus.installed &&
    !steamBranchStatus.needs_switch;

  useEffect(() => {
    if (!setupComplete) {
      setTab("Setup");
      return;
    }
    setTab((current) => current === "Setup" ? (runningGame?.configured ? "NowPlaying" : "Games") : current);
  }, [runningGame?.appid, runningGame?.configured, setupComplete]);

  useEffect(() => {
    if (!setupComplete) return;
    const appid = runningGame?.appid || null;
    const previous = previousRunningAppId.current;
    previousRunningAppId.current = appid;
    if (appid && appid !== previous) setTab(runningGame?.configured ? "NowPlaying" : "Games");
    else if (!appid && previous) {
      setTab((current) => current === "NowPlaying" ? "Games" : current);
    }
  }, [runningGame?.appid, runningGame?.configured, setupComplete]);

  useEffect(() => {
    if (isInstalled) void reload();
  }, [isInstalled, reload]);

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
      flatpakStatus={flatpakStatus}
      steamBranchStatus={steamBranchStatus}
      isInstalling={isInstalling}
      isUninstalling={isUninstalling}
      isRepairingFlatpak={isRepairingFlatpak}
      onInstall={() => void install()}
      onUninstall={() => void uninstall()}
      onRepairFlatpak={() => void repairFlatpak()}
    />
  );

  const tabs = setupComplete
    ? [
        ...(runningGame?.configured ? [{
          id: "NowPlaying",
          title: tabIcons.nowPlaying,
          content: (
            <NowPlayingTab
              game={runningGame}
              config={config}
              onConfigChange={(field, value) => handleConfigChange(field, value)}
            />
          ),
        }] : []),
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
