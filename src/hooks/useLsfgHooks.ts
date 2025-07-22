import { useState, useEffect, useCallback } from "react";
import {
  checkLsfgVkInstalled,
  checkLosslessScalingDll,
  getLsfgConfig,
  updateLsfgConfigFromObject,
  getActiveProfile,
  type ConfigUpdateResult
} from "../api/lsfgApi";
import { ConfigurationData, ConfigurationManager } from "../config/configSchema";
import { showErrorToast, ToastMessages } from "../utils/toastUtils";

export function useInstallationStatus() {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [installationStatus, setInstallationStatus] = useState<string>("");

  const checkInstallation = async () => {
    try {
      const status = await checkLsfgVkInstalled();
      setIsInstalled(status.installed);
      if (status.installed) {
        setInstallationStatus("lsfg-vk Installed");
      } else {
        setInstallationStatus("lsfg-vk Not Installed");
      }
      return status.installed;
    } catch (error) {
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
    checkInstallation
  };
}

export function useDllDetection() {
  const [dllDetected, setDllDetected] = useState<boolean>(false);
  const [dllDetectionStatus, setDllDetectionStatus] = useState<string>("");

  const checkDllDetection = async () => {
    try {
      const result = await checkLosslessScalingDll();
      setDllDetected(result.detected);
      if (result.detected) {
        setDllDetectionStatus("Lossless Scaling Installed");
      } else {
        setDllDetectionStatus("Lossless Scaling Not Installed");
      }
    } catch (error) {
      setDllDetectionStatus("Lossless Scaling Not Installed");
    }
  };

  useEffect(() => {
    checkDllDetection();
  }, []);

  return {
    dllDetected,
    dllDetectionStatus
  };
}

export function useLsfgConfig() {
  // Use centralized configuration for initial state
  const [config, setConfig] = useState<ConfigurationData>(() => ConfigurationManager.getDefaults());

  const loadLsfgConfig = useCallback(async (profile: string = "default") => {
    try {
      const result = await getLsfgConfig(profile);
      if (result.success && result.config) {
        setConfig(result.config);
      } else {
        console.log("lsfg config not available, using defaults:", result.error);
        setConfig(ConfigurationManager.getDefaults());
      }
    } catch (error) {
      console.error("Error loading lsfg config:", error);
      setConfig(ConfigurationManager.getDefaults());
    }
  }, []);

  const updateConfig = useCallback(async (newConfig: ConfigurationData, profile: string = "default"): Promise<ConfigUpdateResult> => {
    try {
      const result = await updateLsfgConfigFromObject(newConfig, profile);
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

  const updateField = useCallback(async (fieldName: keyof ConfigurationData, value: boolean | number | string, profile: string = "default"): Promise<ConfigUpdateResult> => {
    const newConfig = { ...config, [fieldName]: value };
    return updateConfig(newConfig, profile);
  }, [config, updateConfig]);

  useEffect(() => {
    loadLsfgConfig();
  }, []); // Empty dependency array to prevent infinite loop

  return {
    config,
    setConfig,
    loadLsfgConfig,
    updateConfig,
    updateField
  };
}

export function useProfileManager() {
  const [activeProfile, setActiveProfile] = useState<string>("default");
  const [isLoading, setIsLoading] = useState(true);

  const loadActiveProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getActiveProfile();
      if (result.success) {
        setActiveProfile(result.profile);
      } else {
        console.warn("Failed to get active profile:", result.error);
        setActiveProfile("default");
      }
    } catch (error) {
      console.error("Error loading active profile:", error);
      setActiveProfile("default");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const changeProfile = useCallback(async (newProfile: string) => {
    setActiveProfile(newProfile);
    // The profile change will take effect on the next game launch
    // We don't need to update the script immediately
  }, []);

  useEffect(() => {
    loadActiveProfile();
  }, [loadActiveProfile]);

  return {
    activeProfile,
    isLoading,
    loadActiveProfile,
    changeProfile
  };
}
