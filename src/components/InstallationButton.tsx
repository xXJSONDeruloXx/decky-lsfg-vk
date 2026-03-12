import { ButtonItem, PanelSectionRow } from "@decky/ui";
import { FaDownload, FaTrash } from "react-icons/fa";
import t from '../i18n/i18n';

interface InstallationButtonProps {
  isInstalled: boolean;
  isInstalling: boolean;
  isUninstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}

export function InstallationButton({
  isInstalled,
  isInstalling,
  isUninstalling,
  onInstall,
  onUninstall
}: InstallationButtonProps) {
  const renderButtonContent = () => {
    if (isInstalling) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div>{t('INSTALL_INSTALLING', 'Installing...')}</div>
        </div>
      );
    }

    if (isUninstalling) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div>{t('INSTALL_UNINSTALLING', 'Uninstalling...')}</div>
        </div>
      );
    }

    if (isInstalled) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FaTrash />
          <div>{t('INSTALL_UNINSTALL_BTN', 'Uninstall LSFG-VK')}</div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <FaDownload />
        <div>{t('INSTALL_INSTALL_BTN', 'Install LSFG-VK')}</div>
      </div>
    );
  };

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={isInstalled ? onUninstall : onInstall}
        disabled={isInstalling || isUninstalling}
      >
        {renderButtonContent()}
      </ButtonItem>
    </PanelSectionRow>
  );
}
