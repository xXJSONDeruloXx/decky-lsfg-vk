import { useEffect } from "react";
import { PanelSection, showModal, ButtonItem, PanelSectionRow } from "@decky/ui";
import { useInstallationStatus, useDllDetection, useLsfgConfig, useProfileManager } from "../hooks/useLsfgHooks";
import { useInstallationActions } from "../hooks/useInstallationActions";
import { StatusDisplay } from "./StatusDisplay";
import { InstallationButton } from "./InstallationButton";
import { ConfigurationSection } from "./ConfigurationSection";
import { ProfileSelector } from "./ProfileSelector";
import { UsageInstructions } from "./UsageInstructions";
import { WikiButton } from "./WikiButton";
import { ClipboardButton } from "./ClipboardButton";
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

  const { activeProfile, changeProfile } = useProfileManager();

  const { isInstalling, isUninstalling, handleInstall, handleUninstall } = useInstallationActions();

  // Reload config when installation status changes or profile changes
  useEffect(() => {
    if (isInstalled && activeProfile) {
      loadLsfgConfig(activeProfile);
    }
  }, [isInstalled, activeProfile, loadLsfgConfig]);

  // Generic configuration change handler
  const handleConfigChange = async (fieldName: keyof ConfigurationData, value: boolean | number | string, profile: string) => {
    await updateField(fieldName, value, profile);
  };

  const handleProfileChange = async (newProfile: string) => {
    await changeProfile(newProfile);
    // Load config for the new profile
    await loadLsfgConfig(newProfile);
  };

  const onInstall = () => {
    handleInstall(setIsInstalled, setInstallationStatus, () => loadLsfgConfig(activeProfile));
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
      
      <SmartClipboardButton />

      {/* Profile Selection - only show if installed */}
      {isInstalled && (
        <ProfileSelector
          selectedProfile={activeProfile}
          onProfileChange={handleProfileChange}
        />
      )}

      {/* Configuration Section - only show if installed */}
      {isInstalled && (
        <ConfigurationSection
          config={config}
          activeProfile={activeProfile}
          onConfigChange={handleConfigChange}
        />
      )}

      <UsageInstructions config={config} />
      
      <WikiButton />
      <ClipboardButton />
      
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
