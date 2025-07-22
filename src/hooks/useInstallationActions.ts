import { useState } from "react";
import { installLsfgVk, uninstallLsfgVk } from "../api/lsfgApi";
import { 
  showInstallSuccessToast, 
  showInstallErrorToast,
  showUninstallSuccessToast, 
  showUninstallErrorToast 
} from "../utils/toastUtils";

export function useInstallationActions() {
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [isUninstalling, setIsUninstalling] = useState<boolean>(false);

  const handleInstall = async (
    setIsInstalled: (value: boolean) => void,
    setInstallationStatus: (value: string) => void,
    reloadConfig?: () => Promise<void>
  ) => {
    setIsInstalling(true);
    setInstallationStatus("Installing lsfg-vk...");

    try {
      const result = await installLsfgVk();
      if (result.success) {
        setIsInstalled(true);
        setInstallationStatus("lsfg-vk installed successfully!");
        showInstallSuccessToast();

        // Reload lsfg config after installation
        if (reloadConfig) {
          await reloadConfig();
        }
      } else {
        setInstallationStatus(`Installation failed: ${result.error}`);
        showInstallErrorToast(result.error);
      }
    } catch (error) {
      setInstallationStatus(`Installation failed: ${error}`);
      showInstallErrorToast(String(error));
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async (
    setIsInstalled: (value: boolean) => void,
    setInstallationStatus: (value: string) => void
  ) => {
    setIsUninstalling(true);
    setInstallationStatus("Uninstalling lsfg-vk...");

    try {
      const result = await uninstallLsfgVk();
      if (result.success) {
        setIsInstalled(false);
        setInstallationStatus("lsfg-vk uninstalled successfully!");
        showUninstallSuccessToast();
      } else {
        setInstallationStatus(`Uninstallation failed: ${result.error}`);
        showUninstallErrorToast(result.error);
      }
    } catch (error) {
      setInstallationStatus(`Uninstallation failed: ${error}`);
      showUninstallErrorToast(String(error));
    } finally {
      setIsUninstalling(false);
    }
  };

  return {
    isInstalling,
    isUninstalling,
    handleInstall,
    handleUninstall
  };
}
