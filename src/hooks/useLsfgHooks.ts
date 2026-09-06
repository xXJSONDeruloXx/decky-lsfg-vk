import { useState, useEffect, useCallback } from "react";
import {
  checkLsfgVkInstalled,
  getLsfgConfig,
  getLosslessScalingBranchStatus,
  selectLosslessScalingBranch,
  updateLsfgConfigFromObject,
  type ConfigUpdateResult,
  type SteamBranchOperationResult,
  type SteamBranchStatus
} from "../api/lsfgApi";
import { ConfigurationData, getDefaults } from "../config/configSchema";
import { showErrorToast, ToastMessages } from "../utils/toastUtils";

export function useInstallationStatus() {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [installationStatus, setInstallationStatus] = useState<string>("");
  const [losslessScalingInstalled, setLosslessScalingInstalled] = useState<boolean>(false);
  const [losslessScalingStatus, setLosslessScalingStatus] = useState<string>("");
  const [steamBranchStatus, setSteamBranchStatus] = useState<SteamBranchStatus | null>(null);
  const [isSwitchingSteamBranch, setIsSwitchingSteamBranch] = useState<boolean>(false);

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

  const selectLosslessScalingBranchForUser = async (): Promise<SteamBranchOperationResult> => {
    setIsSwitchingSteamBranch(true);
    try {
      const result = await selectLosslessScalingBranch();
      setSteamBranchStatus(result);
      return result;
    } catch (error) {
      const result: SteamBranchOperationResult = {
        success: false,
        message: "",
        error: String(error),
        installed: false,
        manifest_path: undefined,
        selected_branch: undefined,
        current_branch: undefined,
        target_branch: "lsfg-vk",
        needs_switch: false,
        restart_required: false,
        changed: false
      };
      setSteamBranchStatus(result);
      return result;
    } finally {
      setIsSwitchingSteamBranch(false);
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
    isSwitchingSteamBranch,
    selectLosslessScalingBranch: selectLosslessScalingBranchForUser,
    checkInstallation
  };
}

export function useLsfgConfig() {
  const [config, setConfig] = useState<ConfigurationData>(() => getDefaults());

  const loadLsfgConfig = useCallback(async () => {
    try {
      const result = await getLsfgConfig();
      if (result.success && result.config) {
        setConfig(result.config);
      } else {
        console.log("lsfg config not available, using defaults:", result.error);
        setConfig(getDefaults());
      }
    } catch (error) {
      console.error("Error loading lsfg config:", error);
      setConfig(getDefaults());
    }
  }, []);

  const updateConfig = useCallback(async (newConfig: ConfigurationData): Promise<ConfigUpdateResult> => {
    try {
      const result = await updateLsfgConfigFromObject(newConfig);
      if (result.success) {
        setConfig(newConfig);
      } else {
        showErrorToast(
          ToastMessages.CONFIG_UPDATE_ERROR.title, 
          result.error || ToastMessages.CONFIG_UPDATE_ERROR.body
        );
      }
      return result;
    } catch (error) {
      showErrorToast(ToastMessages.CONFIG_UPDATE_ERROR.title, String(error));
      return { success: false, error: String(error) };
    }
  }, []);

  const updateField = useCallback(async (fieldName: keyof ConfigurationData, value: boolean | number | string): Promise<ConfigUpdateResult> => {
    const newConfig = { ...config, [fieldName]: value };
    return updateConfig(newConfig);
  }, [config, updateConfig]);

  useEffect(() => {
    loadLsfgConfig();
  }, []);

  return {
    config,
    setConfig,
    loadLsfgConfig,
    updateConfig,
    updateField
  };
}
