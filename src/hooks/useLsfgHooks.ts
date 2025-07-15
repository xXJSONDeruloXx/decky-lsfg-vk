import { useState, useEffect } from "react";
import { toaster } from "@decky/api";
import {
  checkLsfgVkInstalled,
  checkLosslessScalingDll,
  getLsfgConfig,
  updateLsfgConfig,
  type ConfigUpdateResult
} from "../api/lsfgApi";

export function useInstallationStatus() {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [installationStatus, setInstallationStatus] = useState<string>("");

  const checkInstallation = async () => {
    try {
      const status = await checkLsfgVkInstalled();
      setIsInstalled(status.installed);
      if (status.installed) {
        setInstallationStatus("lsfg-vk is installed");
      } else {
        setInstallationStatus("lsfg-vk is not installed");
      }
      return status.installed;
    } catch (error) {
      setInstallationStatus("Error checking installation status");
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
        setDllDetectionStatus(`Lossless Scaling App detected (${result.source})`);
      } else {
        setDllDetectionStatus(result.message || "Lossless Scaling App not detected");
      }
    } catch (error) {
      setDllDetectionStatus("Error checking Lossless Scaling App");
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
  const [enableLsfg, setEnableLsfg] = useState<boolean>(true);
  const [multiplier, setMultiplier] = useState<number>(2);
  const [flowScale, setFlowScale] = useState<number>(0.8);
  const [hdr, setHdr] = useState<boolean>(false);
  const [perfMode, setPerfMode] = useState<boolean>(true);
  const [immediateMode, setImmediateMode] = useState<boolean>(false);

  const loadLsfgConfig = async () => {
    try {
      const result = await getLsfgConfig();
      if (result.success && result.config) {
        setEnableLsfg(result.config.enable_lsfg);
        setMultiplier(result.config.multiplier);
        setFlowScale(result.config.flow_scale);
        setHdr(result.config.hdr);
        setPerfMode(result.config.perf_mode);
        setImmediateMode(result.config.immediate_mode);
        console.log("Loaded lsfg config:", result.config);
      } else {
        console.log("lsfg config not available, using defaults:", result.error);
      }
    } catch (error) {
      console.error("Error loading lsfg config:", error);
    }
  };

  const updateConfig = async (
    newEnableLsfg: boolean,
    newMultiplier: number,
    newFlowScale: number,
    newHdr: boolean,
    newPerfMode: boolean,
    newImmediateMode: boolean
  ): Promise<ConfigUpdateResult> => {
    try {
      const result = await updateLsfgConfig(
        newEnableLsfg,
        newMultiplier,
        newFlowScale,
        newHdr,
        newPerfMode,
        newImmediateMode
      );
      if (!result.success) {
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
  };

  useEffect(() => {
    loadLsfgConfig();
  }, []);

  return {
    config: {
      enableLsfg,
      multiplier,
      flowScale,
      hdr,
      perfMode,
      immediateMode
    },
    setters: {
      setEnableLsfg,
      setMultiplier,
      setFlowScale,
      setHdr,
      setPerfMode,
      setImmediateMode
    },
    loadLsfgConfig,
    updateConfig
  };
}
