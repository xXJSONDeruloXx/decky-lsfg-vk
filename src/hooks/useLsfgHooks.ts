import { useState, useEffect } from "react";
import {
  checkLsfgVkInstalled,
  getLosslessScalingBranchStatus,
  type SteamBranchStatus
} from "../api/lsfgApi";

export function useInstallationStatus() {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [installationStatus, setInstallationStatus] = useState<string>("");
  const [losslessScalingInstalled, setLosslessScalingInstalled] = useState<boolean>(false);
  const [losslessScalingStatus, setLosslessScalingStatus] = useState<string>("");
  const [steamBranchStatus, setSteamBranchStatus] = useState<SteamBranchStatus | null>(null);

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
      if (status.installed) {
        setInstallationStatus("lsfg-vk Installed");
      } else {
        setInstallationStatus("lsfg-vk Not Installed");
      }
      return status.installed;
    } catch (error) {
      setSteamBranchStatus(null);
      setLosslessScalingInstalled(false);
      setLosslessScalingStatus("Lossless Scaling Not Installed");
      setInstallationStatus("lsfg-vk Not Installed");
      return false;
    }
  };

  useEffect(() => {
    checkInstallation();
  }, []);

  return {
    isInstalled,
    installationStatus,
    setIsInstalled,
    setInstallationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    checkInstallation
  };
}
