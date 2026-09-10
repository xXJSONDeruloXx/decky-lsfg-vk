import { useEffect, useState } from "react";
import {
  checkLsfgVkInstalled,
  getLosslessScalingBranchStatus,
  installLsfgVk,
  uninstallLsfgVk,
  type SteamBranchStatus,
} from "../api/lsfgApi";
import {
  showInstallErrorToast,
  showInstallSuccessToast,
  showUninstallErrorToast,
  showUninstallSuccessToast,
} from "../utils/toastUtils";

export function useInstallation(reloadConfig?: () => Promise<void>) {
  const [isInstalled, setIsInstalled] = useState(false);
  const [installationStatus, setInstallationStatus] = useState("");
  const [losslessScalingInstalled, setLosslessScalingInstalled] = useState(false);
  const [losslessScalingStatus, setLosslessScalingStatus] = useState("");
  const [steamBranchStatus, setSteamBranchStatus] = useState<SteamBranchStatus | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);

  const checkInstallation = async () => {
    try {
      setSteamBranchStatus(await getLosslessScalingBranchStatus());
    } catch (error) {
      console.error("Error checking Lossless Scaling Steam branch:", error);
      setSteamBranchStatus(null);
    }

    try {
      const status = await checkLsfgVkInstalled();
      setIsInstalled(status.installed);
      setLosslessScalingInstalled(status.lossless_scaling_installed);
      setLosslessScalingStatus(status.lossless_scaling_status || "Lossless Scaling Not Installed");
      setInstallationStatus(status.installed ? "lsfg-vk Installed" : "lsfg-vk Not Installed");
      return status.installed;
    } catch {
      setSteamBranchStatus(null);
      setLosslessScalingInstalled(false);
      setLosslessScalingStatus("Lossless Scaling Not Installed");
      setInstallationStatus("lsfg-vk Not Installed");
      return false;
    }
  };

  useEffect(() => {
    void checkInstallation();
  }, []);

  const install = async () => {
    setIsInstalling(true);
    setInstallationStatus("Installing lsfg-vk...");
    try {
      const result = await installLsfgVk();
      if (!result.success) {
        setInstallationStatus(`Installation failed: ${result.error}`);
        showInstallErrorToast(result.error ?? undefined);
        return;
      }
      setIsInstalled(true);
      setInstallationStatus("lsfg-vk installed");
      showInstallSuccessToast();
      await reloadConfig?.();
      await checkInstallation();
    } catch (error) {
      setInstallationStatus(`Installation failed: ${error}`);
      showInstallErrorToast(String(error));
    } finally {
      setIsInstalling(false);
    }
  };

  const uninstall = async () => {
    setIsUninstalling(true);
    setInstallationStatus("Uninstalling lsfg-vk...");
    try {
      const result = await uninstallLsfgVk();
      if (!result.success) {
        setInstallationStatus(`Uninstallation failed: ${result.error}`);
        showUninstallErrorToast(result.error ?? undefined);
        return;
      }
      setIsInstalled(false);
      setInstallationStatus("lsfg-vk uninstalled successfully!");
      await checkInstallation();
      showUninstallSuccessToast();
    } catch (error) {
      setInstallationStatus(`Uninstallation failed: ${error}`);
      showUninstallErrorToast(String(error));
    } finally {
      setIsUninstalling(false);
    }
  };

  return {
    isInstalled,
    installationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    isInstalling,
    isUninstalling,
    install,
    uninstall,
    checkInstallation,
  };
}
