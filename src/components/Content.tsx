import { useEffect } from "react";
import { PanelSection, showModal, ButtonItem, PanelSectionRow } from "@decky/ui";
import { useInstallationStatus } from "../hooks/useLsfgHooks";
import { useGameConfiguration } from "../hooks/useGameConfiguration";
import { useInstallationActions } from "../hooks/useInstallationActions";
import { StatusDisplay } from "./StatusDisplay";
import { InstallationButton } from "./InstallationButton";
import { ConfigurationSection } from "./ConfigurationSection";
import { GameConfigurationSelector } from "./GameConfigurationSelector";
import { UsageInstructions } from "./UsageInstructions";
import { SmartClipboardButton } from "./SmartClipboardButton";
import { FgmodClipboardButton } from "./FgmodClipboardButton";
import { FpsMultiplierControl } from "./FpsMultiplierControl";
import { NerdStuffModal } from "./NerdStuffModal";
import { FlatpaksModal } from "./FlatpaksModal";
import { ConfigurationData } from "../config/configSchema";
import t from '../i18n/i18n';

export function Content() {
  const {
    isInstalled,
    installationStatus,
    setIsInstalled,
    setInstallationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    checkInstallation
  } = useInstallationStatus();

  const { config, targets, runningGame, selectedAppId, setSelectedAppId, save, resetSelected, resetAll, reload } = useGameConfiguration();

  const { isInstalling, isUninstalling, handleInstall, handleUninstall } = useInstallationActions();

  useEffect(() => {
    if (isInstalled) void reload();
  }, [isInstalled, reload]);

  const handleConfigChange = async (fieldName: keyof ConfigurationData, value: boolean | number | string | string[]) => {
    await save({ ...config, [fieldName]: value });
  };

  const onInstall = () => {
    handleInstall(setIsInstalled, setInstallationStatus, reload, checkInstallation);
  };

  const onUninstall = () => {
    handleUninstall(setIsInstalled, setInstallationStatus, checkInstallation);
  };

  const handleShowNerdStuff = () => {
    showModal(<NerdStuffModal />);
  };

  const handleShowFlatpaks = () => {
    showModal(<FlatpaksModal />);
  };

  return (
    <PanelSection>
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
            isInstalled={isInstalled}
            installationStatus={installationStatus}
            losslessScalingInstalled={losslessScalingInstalled}
            losslessScalingStatus={losslessScalingStatus}
            steamBranchStatus={steamBranchStatus}
          />
        </>
      )}

      {isInstalled && (
        <>
          <PanelSectionRow>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginTop: "8px",
                marginBottom: "6px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
                paddingBottom: "3px",
                color: "white"
              }}
            >
              {t('CONTENT_FPS_MULTIPLIER', 'FPS Multiplier')}
            </div>
          </PanelSectionRow>

          <FpsMultiplierControl
            config={config}
            onConfigChange={handleConfigChange}
          />
        </>
      )}

      {isInstalled && (
        <GameConfigurationSelector targets={targets} runningGame={runningGame} selectedAppId={selectedAppId} onSelect={setSelectedAppId} onReset={resetSelected} onResetAll={resetAll} />
      )}

      {isInstalled && (
        <ConfigurationSection
          config={config}
          onConfigChange={handleConfigChange}
        />
      )}

      {isInstalled && (
        <>
          <SmartClipboardButton />
          <FgmodClipboardButton />
        </>
      )}

      <UsageInstructions />

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleShowNerdStuff}
        >
          {t('CONTENT_NERD_STUFF', 'Nerd Stuff')}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleShowFlatpaks}
        >
          {t('CONTENT_FLATPAK_SETUP', 'Flatpak Setup')}
        </ButtonItem>
      </PanelSectionRow>

      {isInstalled && (
        <>
          <StatusDisplay
            isInstalled={isInstalled}
            installationStatus={installationStatus}
            losslessScalingInstalled={losslessScalingInstalled}
            losslessScalingStatus={losslessScalingStatus}
            steamBranchStatus={steamBranchStatus}
          />

          <InstallationButton
            isInstalled={isInstalled}
            isInstalling={isInstalling}
            isUninstalling={isUninstalling}
            onInstall={onInstall}
            onUninstall={onUninstall}
          />
        </>
      )}
    </PanelSection>
  );
}
