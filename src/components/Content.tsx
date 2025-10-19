import { useEffect } from "react";
import { PanelSection, showModal, ButtonItem, PanelSectionRow } from "@decky/ui";
import { useInstallationStatus, useDllDetection, useLsfgConfig } from "../hooks/useLsfgHooks";
import { useProfileManagement } from "../hooks/useProfileManagement";
import { useInstallationActions } from "../hooks/useInstallationActions";
import { StatusDisplay } from "./StatusDisplay";
import { InstallationButton } from "./InstallationButton";
import { ConfigurationSection } from "./ConfigurationSection";
import { ProfileManagement } from "./ProfileManagement";
import { UsageInstructions } from "./UsageInstructions";
import { WikiButton } from "./WikiButton";
import { ClipboardButton } from "./ClipboardButton";
import { SmartClipboardButton } from "./SmartClipboardButton";
import { FgmodClipboardButton } from "./FgmodClipboardButton";
// import { ClipboardDisplay } from "./ClipboardDisplay";
// import { PluginUpdateChecker } from "./PluginUpdateChecker";
import { NerdStuffModal } from "./NerdStuffModal";
import FlatpaksModal from "./FlatpaksModal";
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

  const {
    currentProfile,
    updateProfileConfig,
    loadProfiles
  } = useProfileManagement();

  const { isInstalling, isUninstalling, handleInstall, handleUninstall } = useInstallationActions();

  // Reload config when installation status changes
  useEffect(() => {
    if (isInstalled) {
      loadLsfgConfig();
    }
  }, [isInstalled, loadLsfgConfig]);

  // Generic configuration change handler
  const handleConfigChange = async (fieldName: keyof ConfigurationData, value: boolean | number | string) => {
    // If we have a current profile, update that profile specifically
    if (currentProfile) {
      const newConfig = { ...config, [fieldName]: value };
      const result = await updateProfileConfig(currentProfile, newConfig);
      if (result.success) {
        // Reload config to reflect the changes from the backend
        await loadLsfgConfig();
      }
    } else {
      // Fallback to the original method for backward compatibility
      await updateField(fieldName, value);
    }
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

  const handleShowFlatpaks = () => {
    showModal(<FlatpaksModal />);
  };

  return (
    <PanelSection>
      {/* Show installation components at top when not fully installed */}
      {!isInstalled && (
        <>
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
        </>
      )}
      
      {/* Clipboard buttons - only show if installed */}
      {isInstalled && (
        <>
          {/* <ClipboardDisplay /> */}
          <SmartClipboardButton />
          <FgmodClipboardButton />
        </>
      )}

      {/* Profile Management - only show if installed */}
      {isInstalled && (
        <ProfileManagement
          currentProfile={currentProfile}
          onProfileChange={async () => {
            await loadProfiles();
            await loadLsfgConfig();
          }}
        />
      )}

      {/* Configuration Section - only show if installed */}
      {isInstalled && (
        <ConfigurationSection
          config={config}
          onConfigChange={handleConfigChange}
        />
      )}

      {/* Usage instructions - always visible for user guidance */}
      <UsageInstructions config={config} />
      
      {/* Wiki and clipboard buttons - always available for documentation */}
      <WikiButton />
      <ClipboardButton />
      
      {/* Plugin Update Checker */}
      {/* <PluginUpdateChecker /> */}
      
      {/* Show installation components at bottom when fully installed */}
      {isInstalled && (
        <>
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
        </>
      )}

      {/* Nerd Stuff Button */}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleShowNerdStuff}
        >
          Nerd Stuff
        </ButtonItem>
      </PanelSectionRow>

      {/* Flatpaks Button */}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleShowFlatpaks}
        >
          Flatpaks
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
