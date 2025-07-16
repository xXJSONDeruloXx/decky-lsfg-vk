import { useEffect } from "react";
import { PanelSection } from "@decky/ui";
import { useInstallationStatus, useDllDetection, useLsfgConfig } from "../hooks/useLsfgHooks";
import { useInstallationActions } from "../hooks/useInstallationActions";
import { StatusDisplay } from "./StatusDisplay";
import { InstallationButton } from "./InstallationButton";
import { ConfigurationSection } from "./ConfigurationSection";
import { UsageInstructions } from "./UsageInstructions";

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
    setters,
    loadLsfgConfig,
    updateConfig
  } = useLsfgConfig();

  const { isInstalling, isUninstalling, handleInstall, handleUninstall } = useInstallationActions();

  // Reload config when installation status changes
  useEffect(() => {
    if (isInstalled) {
      loadLsfgConfig();
    }
  }, [isInstalled, loadLsfgConfig]);

  // Configuration change handlers
  const handleEnableLsfgChange = async (value: boolean) => {
    setters.setEnableLsfg(value);
    await updateConfig(value, config.multiplier, config.flowScale, config.hdr, config.perfMode, config.immediateMode, config.disableVkbasalt);
  };

  const handleMultiplierChange = async (value: number) => {
    setters.setMultiplier(value);
    await updateConfig(config.enableLsfg, value, config.flowScale, config.hdr, config.perfMode, config.immediateMode, config.disableVkbasalt);
  };

  const handleFlowScaleChange = async (value: number) => {
    setters.setFlowScale(value);
    await updateConfig(config.enableLsfg, config.multiplier, value, config.hdr, config.perfMode, config.immediateMode, config.disableVkbasalt);
  };

  const handleHdrChange = async (value: boolean) => {
    setters.setHdr(value);
    await updateConfig(config.enableLsfg, config.multiplier, config.flowScale, value, config.perfMode, config.immediateMode, config.disableVkbasalt);
  };

  const handlePerfModeChange = async (value: boolean) => {
    setters.setPerfMode(value);
    await updateConfig(config.enableLsfg, config.multiplier, config.flowScale, config.hdr, value, config.immediateMode, config.disableVkbasalt);
  };

  const handleImmediateModeChange = async (value: boolean) => {
    setters.setImmediateMode(value);
    await updateConfig(config.enableLsfg, config.multiplier, config.flowScale, config.hdr, config.perfMode, value, config.disableVkbasalt);
  };

  const handleDisableVkbasaltChange = async (value: boolean) => {
    setters.setDisableVkbasalt(value);
    await updateConfig(config.enableLsfg, config.multiplier, config.flowScale, config.hdr, config.perfMode, config.immediateMode, value);
  };

  const onInstall = () => {
    handleInstall(setIsInstalled, setInstallationStatus, loadLsfgConfig);
  };

  const onUninstall = () => {
    handleUninstall(setIsInstalled, setInstallationStatus);
  };

  return (
    <PanelSection>
      <StatusDisplay
        dllDetected={dllDetected}
        dllDetectionStatus={dllDetectionStatus}
        isInstalled={isInstalled}
        installationStatus={installationStatus}
      />

      <InstallationButton
        isInstalled={isInstalled}
        isInstalling={isInstalling}
        isUninstalling={isUninstalling}
        onInstall={onInstall}
        onUninstall={onUninstall}
      />

      {/* Configuration Section - only show if installed */}
      {isInstalled && (
        <ConfigurationSection
          config={config}
          onEnableLsfgChange={handleEnableLsfgChange}
          onMultiplierChange={handleMultiplierChange}
          onFlowScaleChange={handleFlowScaleChange}
          onHdrChange={handleHdrChange}
          onPerfModeChange={handlePerfModeChange}
          onImmediateModeChange={handleImmediateModeChange}
          onDisableVkbasaltChange={handleDisableVkbasaltChange}
        />
      )}

      <UsageInstructions config={config} />
    </PanelSection>
  );
}
