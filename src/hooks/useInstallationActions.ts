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
    reloadConfig?: () => Promise<void>,
    reloadStatus?: () => Promise<boolean>
  ) => {
    setIsInstalling(true);
    setInstallationStatus("Installing lsfg-vk...");

    try {
      const result = await installLsfgVk();
      if (result.success) {
        setIsInstalled(true);
        setInstallationStatus("lsfg-vk installed");
        showInstallSuccessToast();

        // Reload lsfg config after installation
        if (reloadConfig) {
          await reloadConfig();
        }
        if (reloadStatus) {
          await reloadStatus();
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
    setInstallationStatus: (value: string) => void,
    reloadStatus?: () => Promise<boolean>
  ) => {
    setIsUninstalling(true);
    setInstallationStatus("Uninstalling lsfg-vk...");

    try {
      const result = await uninstallLsfgVk();
      if (result.success) {
        setIsInstalled(false);
        setInstallationStatus("lsfg-vk uninstalled successfully!");
        if (reloadStatus) {
          await reloadStatus();
        }
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
