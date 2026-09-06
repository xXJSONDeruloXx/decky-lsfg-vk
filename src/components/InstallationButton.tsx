import { ButtonItem, PanelSectionRow } from "@decky/ui";
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
  const label = isInstalling
    ? t('INSTALL_INSTALLING', 'Installing...')
    : isUninstalling
      ? t('INSTALL_UNINSTALLING', 'Uninstalling...')
      : isInstalled
        ? t('INSTALL_UNINSTALL_BTN', 'Uninstall LSFG-VK')
        : t('INSTALL_INSTALL_BTN', 'Install LSFG-VK');

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={isInstalled ? onUninstall : onInstall}
        disabled={isInstalling || isUninstalling}
      >
        {label}
      </ButtonItem>
    </PanelSectionRow>
  );
}
