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
    steamBranchStatus,
    isInstalling,
    isUninstalling,
    install,
    uninstall,
  } = useInstallation(reload);
  const [tab, setTab] = useState("Setup");
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
    setTab((current) => current === "Setup" ? (runningGame ? "NowPlaying" : "Games") : current);
  }, [runningGame?.appid, setupComplete]);

  useEffect(() => {
    if (!setupComplete) return;
    const appid = runningGame?.appid || null;
    const previous = previousRunningAppId.current;
    previousRunningAppId.current = appid;
    if (appid && appid !== previous) setTab("NowPlaying");
    else if (!appid && previous) {
      setTab((current) => current === "NowPlaying" ? "Games" : current);
    }
  }, [runningGame?.appid, runningGame?.configured, setupComplete]);

  useEffect(() => {
    if (isInstalled) void reload();
  }, [isInstalled, reload]);

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
      flatpakRelevant={targets.some((target) => target.transport.kind === "flatpak")}
    />
  );

  const tabs = setupComplete
    ? [
        ...(runningGame ? [{
          id: "NowPlaying",
          title: tabIcons.nowPlaying,
          content: (
            <NowPlayingTab
              game={runningGame}
              config={config}
              onConfigChange={(field, value) => handleConfigChange(field, value)}
              onEnable={enable}
              onRepair={repair}
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
        { id: "ConfigFile", title: tabIcons.configFile, content: <ConfigFileTab /> },
        { id: "Setup", title: tabIcons.setup, content: setup },
      ]
    : [{ id: "Setup", title: tabIcons.setup, content: setup }];

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
