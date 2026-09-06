import { Tabs } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaFileAlt, FaGamepad, FaLayerGroup, FaTools } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import { tabStyles } from "../styles";
import { useGameConfiguration } from "../hooks/useGameConfiguration";
import { useInstallationActions } from "../hooks/useInstallationActions";
import { useInstallationStatus } from "../hooks/useLsfgHooks";
import { ConfigFileTab } from "./ConfigFileTab";
import { ConfigurationTab } from "./ConfigurationTab";
import { FlatpaksTab } from "./FlatpaksTab";
import { SetupTab } from "./SetupTab";

const tabIcons = {
  configuration: <FaGamepad size={18} />,
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
    selectedAppId,
    setSelectedAppId,
    save,
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

  useEffect(() => {
    setTab(setupComplete ? "Configuration" : "Setup");
  }, [setupComplete]);

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
        {
          id: "Configuration",
          title: tabIcons.configuration,
          content: (
            <ConfigurationTab
              config={config}
              targets={targets}
              runningGame={runningGame}
              selectedAppId={selectedAppId}
              onSelect={setSelectedAppId}
              onConfigChange={handleConfigChange}
              onReset={resetSelected}
              onResetAll={resetAll}
            />
          ),
        },
        { id: "Flatpak", title: tabIcons.flatpak, content: <FlatpaksTab /> },
        { id: "ConfigFile", title: tabIcons.configFile, content: <ConfigFileTab /> },
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
