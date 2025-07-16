import { useState, useEffect, useCallback } from "react";
import { toaster } from "@decky/api";
import {
  checkLsfgVkInstalled,
  checkLosslessScalingDll,
  getLsfgConfig,
  updateLsfgConfigFromObject,
  type ConfigUpdateResult
} from "../api/lsfgApi";
import { ConfigurationData, ConfigurationManager } from "../config/configSchema";

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

  const loadLsfgConfig = useCallback(async () => {
    try {
      const result = await getLsfgConfig();
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

  const updateConfig = useCallback(async (newConfig: ConfigurationData): Promise<ConfigUpdateResult> => {
    try {
      const result = await updateLsfgConfigFromObject(newConfig);
      if (result.success) {
        setConfig(newConfig);
      } else {
        toaster.toast({
          title: "Update Failed",
          body: result.error || "Failed to update configuration"
        });
      }
      return result;
    } catch (error) {
      toaster.toast({
        title: "Update Failed",
        body: `Error: ${error}`
      });
      return { success: false, error: String(error) };
    }
  }, []);

  const updateField = useCallback(async (fieldName: keyof ConfigurationData, value: boolean | number): Promise<ConfigUpdateResult> => {
    const newConfig = { ...config, [fieldName]: value };
    return updateConfig(newConfig);
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
