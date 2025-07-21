import { useEffect } from "react";
import { PanelSection, showModal, ButtonItem, PanelSectionRow } from "@decky/ui";
import { useInstallationStatus, useDllDetection, useLsfgConfig } from "../hooks/useLsfgHooks";
import { useInstallationActions } from "../hooks/useInstallationActions";
import { StatusDisplay } from "./StatusDisplay";
import { InstallationButton } from "./InstallationButton";
import { ConfigurationSection } from "./ConfigurationSection";
import { UsageInstructions } from "./UsageInstructions";
import { WikiButton } from "./WikiButton";
import { SmartClipboardButton } from "./SmartClipboardButton";
import { PluginUpdateChecker } from "./PluginUpdateChecker";
import { NerdStuffModal } from "./NerdStuffModal";
import { ConfigurationData } from "../config/configSchema";

export function Content() {
  const {
    isInstalled,
    installationStatus,
    setIsInstalled,
    setInstallationStatus
  } = useInstallationStatus();

  const { dllDetected, dllDetectionStatus } = useDllDetection();

  const {
    config,
    loadLsfgConfig,
    updateField
  } = useLsfgConfig();

  const { isInstalling, isUninstalling, handleInstall, handleUninstall } = useInstallationActions();

  // Reload config when installation status changes
  useEffect(() => {
    if (isInstalled) {
      loadLsfgConfig();
    }
  }, [isInstalled, loadLsfgConfig]);

  // Generic configuration change handler
  const handleConfigChange = async (fieldName: keyof ConfigurationData, value: boolean | number | string) => {
    await updateField(fieldName, value);
  };

  const onInstall = () => {
    handleInstall(setIsInstalled, setInstallationStatus, loadLsfgConfig);
  };

  const onUninstall = () => {
    handleUninstall(setIsInstalled, setInstallationStatus);
  };

  const handleShowNerdStuff = () => {
    showModal(<NerdStuffModal />);
  };

  return (
    <PanelSection>
      <InstallationButton
        isInstalled={isInstalled}
        isInstalling={isInstalling}
        isUninstalling={isUninstalling}
        onInstall={onInstall}
        onUninstall={onUninstall}
      />

      <StatusDisplay
        dllDetected={dllDetected}
        dllDetectionStatus={dllDetectionStatus}
        isInstalled={isInstalled}
        installationStatus={installationStatus}
      />

      {/* Configuration Section - only show if installed */}
      {isInstalled && (
        <ConfigurationSection
          config={config}
          onConfigChange={handleConfigChange}
        />
      )}

      <UsageInstructions config={config} />
      
      <WikiButton />
      <SmartClipboardButton />
      
      {/* Plugin Update Checker */}
      <PluginUpdateChecker />      {/* Nerd Stuff Button */}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleShowNerdStuff}
        >
          Nerd Stuff
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
