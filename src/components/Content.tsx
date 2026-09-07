import { Tabs } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaFileAlt, FaGamepad, FaLayerGroup, FaList, FaTools } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import { tabStyles } from "../styles";
import { useGameConfiguration } from "../hooks/useGameConfiguration";
import { useInstallationActions } from "../hooks/useInstallationActions";
import { useInstallationStatus } from "../hooks/useLsfgHooks";
// import { ConfigFileTab } from "./ConfigFileTab";
import { ConfigurationTab } from "./ConfigurationTab";
import { FlatpaksTab } from "./FlatpaksTab";
import { NowPlayingTab } from "./NowPlayingTab";
import { SetupTab } from "./SetupTab";

const tabIcons = {
  nowPlaying: <FaGamepad size={18} />,
  configuration: <FaList size={18} />,
  flatpak: <FaLayerGroup size={18} />,
  configFile: <FaFileAlt size={18} />,
  setup: <FaTools size={18} />,
};

export function Content() {
  const {
    isInstalled,
    installationStatus,
    setIsInstalled,
    setInstallationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    checkInstallation,
  } = useInstallationStatus();
  const {
    config,
    targets,
    runningGame,
    setSelectedAppId,
    save,
    enable,
    resetSelected,
    resetAll,
    reload,
  } = useGameConfiguration();
  const { isInstalling, isUninstalling, handleInstall, handleUninstall } = useInstallationActions();
  const [tab, setTab] = useState("Setup");
  const setupComplete =
    isInstalled &&
    losslessScalingInstalled &&
    steamBranchStatus?.success === true &&
    steamBranchStatus.installed &&
    !steamBranchStatus.needs_switch;
  const previousRunningState = useRef<{ appid: string; configured: boolean } | null>(null);

  useEffect(() => {
    if (!setupComplete) {
      setTab("Setup");
      return;
    }
    setTab((current) => current === "Setup" ? (runningGame?.configured ? "NowPlaying" : "Configuration") : current);
  }, [runningGame?.configured, setupComplete]);

  useEffect(() => {
    if (!setupComplete) return;
    const current = runningGame ? { appid: runningGame.appid, configured: runningGame.configured } : null;
    const previous = previousRunningState.current;
    previousRunningState.current = current;
    if (current?.appid && (current.appid !== previous?.appid || current.configured !== previous?.configured)) {
      setTab(current.configured ? "NowPlaying" : "Configuration");
    } else if (!current && previous) {
      setTab((currentTab) => currentTab === "NowPlaying" ? "Configuration" : currentTab);
    }
  }, [runningGame?.appid, runningGame?.configured, setupComplete]);

  useEffect(() => {
    if (isInstalled) void reload();
  }, [isInstalled, reload]);

  const handleConfigChange = async (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
  ) => {
    await save({ ...config, [fieldName]: value });
  };

  const onInstall = () => {
    void handleInstall(setIsInstalled, setInstallationStatus, reload, checkInstallation);
  };

  const onUninstall = () => {
    void handleUninstall(setIsInstalled, setInstallationStatus, checkInstallation);
  };

  const setupContent = (
    <SetupTab
      isInstalled={isInstalled}
      installationStatus={installationStatus}
      losslessScalingInstalled={losslessScalingInstalled}
      losslessScalingStatus={losslessScalingStatus}
      steamBranchStatus={steamBranchStatus}
      isInstalling={isInstalling}
      isUninstalling={isUninstalling}
      onInstall={onInstall}
      onUninstall={onUninstall}
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
              onConfigChange={handleConfigChange}
              onRemove={resetSelected}
            />
          ),
        }] : []),
        {
          id: "Configuration",
          title: tabIcons.configuration,
          content: (
            <ConfigurationTab
              config={config}
              targets={targets}
              runningGame={runningGame}
              onSelect={setSelectedAppId}
              onConfigChange={handleConfigChange}
              onEnable={enable}
              onReset={resetSelected}
              onResetAll={resetAll}
            />
          ),
        },
        { id: "Flatpak", title: tabIcons.flatpak, content: <FlatpaksTab /> },
        // Keep the configuration-file view available for future use without exposing it in the UI.
        // { id: "ConfigFile", title: tabIcons.configFile, content: <ConfigFileTab /> },
        { id: "Setup", title: tabIcons.setup, content: setupContent },
      ]
    : [
        { id: "Setup", title: tabIcons.setup, content: setupContent },
      ];

  return (
    <div
      className="lsfg-vk-tabs"
      style={{ height: "95%", width: "300px", position: "fixed", marginTop: "-12px", overflow: "hidden" }}
    >
      <style>{tabStyles}</style>
      <Tabs activeTab={tab} onShowTab={setTab} tabs={tabs} />
    </div>
  );
}
