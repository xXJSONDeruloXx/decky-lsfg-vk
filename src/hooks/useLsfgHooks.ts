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
  const [enableLsfg, setEnableLsfg] = useState<boolean>(true);
  const [multiplier, setMultiplier] = useState<number>(2);
  const [flowScale, setFlowScale] = useState<number>(0.8);
  const [hdr, setHdr] = useState<boolean>(false);
  const [perfMode, setPerfMode] = useState<boolean>(true);
  const [immediateMode, setImmediateMode] = useState<boolean>(false);
  const [disableVkbasalt, setDisableVkbasalt] = useState<boolean>(true);
  const [frameCap, setFrameCap] = useState<number>(0);

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
        setDisableVkbasalt(result.config.disable_vkbasalt);
        setFrameCap(result.config.frame_cap);
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
    newImmediateMode: boolean,
    newDisableVkbasalt: boolean,
    newFrameCap: number
  ): Promise<ConfigUpdateResult> => {
    try {
      const result = await updateLsfgConfig(
        newEnableLsfg,
        newMultiplier,
        newFlowScale,
        newHdr,
        newPerfMode,
        newImmediateMode,
        newDisableVkbasalt,
        newFrameCap
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
      immediateMode,
      disableVkbasalt,
      frameCap
    },
    setters: {
      setEnableLsfg,
      setMultiplier,
      setFlowScale,
      setHdr,
      setPerfMode,
      setImmediateMode,
      setDisableVkbasalt,
      setFrameCap
    },
    loadLsfgConfig,
    updateConfig
  };
}
