import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  ToggleField,
  SliderField
} from "@decky/ui";
import {
  callable,
  definePlugin,
  toaster,
} from "@decky/api"
import { useState, useEffect } from "react";
import { FaDownload, FaTrash } from "react-icons/fa";
import { GiPlasticDuck } from "react-icons/gi";

// Function to install lsfg-vk
const installLsfgVk = callable<[], { success: boolean; error?: string; message?: string }>("install_lsfg_vk");

// Function to uninstall lsfg-vk
const uninstallLsfgVk = callable<[], { success: boolean; error?: string; message?: string; removed_files?: string[] }>("uninstall_lsfg_vk");

// Function to check if lsfg-vk is installed
const checkLsfgVkInstalled = callable<[], { installed: boolean; lib_exists: boolean; json_exists: boolean; lib_path: string; json_path: string; error?: string }>("check_lsfg_vk_installed");

// Function to check if Lossless Scaling DLL is available
const checkLosslessScalingDll = callable<[], { detected: boolean; path?: string; source?: string; message?: string; error?: string }>("check_lossless_scaling_dll");

// Function to get lsfg configuration
const getLsfgConfig = callable<[], { success: boolean; config?: { enable_lsfg: boolean; multiplier: number; flow_scale: number; hdr: boolean }; error?: string }>("get_lsfg_config");

// Function to update lsfg configuration
const updateLsfgConfig = callable<[boolean, number, number, boolean], { success: boolean; message?: string; error?: string }>("update_lsfg_config");

function Content() {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [isUninstalling, setIsUninstalling] = useState<boolean>(false);
  const [installationStatus, setInstallationStatus] = useState<string>("");
  const [dllDetected, setDllDetected] = useState<boolean>(false);
  const [dllDetectionStatus, setDllDetectionStatus] = useState<string>("");

  // LSFG configuration state
  const [enableLsfg, setEnableLsfg] = useState<boolean>(true);
  const [multiplier, setMultiplier] = useState<number>(2);
  const [flowScale, setFlowScale] = useState<number>(1.0);
  const [hdr, setHdr] = useState<boolean>(false);

  // Check installation status on component mount
  useEffect(() => {
    const checkInstallation = async () => {
      try {
        const status = await checkLsfgVkInstalled();
        setIsInstalled(status.installed);
        if (status.installed) {
          setInstallationStatus("lsfg-vk is installed");
        } else {
          setInstallationStatus("lsfg-vk is not installed");
        }
      } catch (error) {
        setInstallationStatus("Error checking installation status");
      }
    };

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

    const loadLsfgConfig = async () => {
      try {
        const result = await getLsfgConfig();
        if (result.success && result.config) {
          setEnableLsfg(result.config.enable_lsfg);
          setMultiplier(result.config.multiplier);
          setFlowScale(result.config.flow_scale);
          setHdr(result.config.hdr);
        }
      } catch (error) {
        console.error("Error loading lsfg config:", error);
      }
    };

    checkInstallation();
    checkDllDetection();
    loadLsfgConfig();
  }, []);  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallationStatus("Installing lsfg-vk...");
    
    try {
      const result = await installLsfgVk();
      if (result.success) {
        setIsInstalled(true);
        setInstallationStatus("lsfg-vk installed successfully!");
        toaster.toast({
          title: "Installation Complete",
          body: "lsfg-vk has been installed successfully"
        });
        
        // Reload lsfg config after installation
        try {
          const configResult = await getLsfgConfig();
          if (configResult.success && configResult.config) {
            setEnableLsfg(configResult.config.enable_lsfg);
            setMultiplier(configResult.config.multiplier);
            setFlowScale(configResult.config.flow_scale);
            setHdr(configResult.config.hdr);
          }
        } catch (error) {
          console.error("Error reloading config after install:", error);
        }
      } else {
        setInstallationStatus(`Installation failed: ${result.error}`);
        toaster.toast({
          title: "Installation Failed",
          body: result.error || "Unknown error occurred"
        });
      }
    } catch (error) {
      setInstallationStatus(`Installation failed: ${error}`);
      toaster.toast({
        title: "Installation Failed",
        body: `Error: ${error}`
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    setIsUninstalling(true);
    setInstallationStatus("Uninstalling lsfg-vk...");

    try {
      const result = await uninstallLsfgVk();
      if (result.success) {
        setIsInstalled(false);
        setInstallationStatus("lsfg-vk uninstalled successfully!");
        toaster.toast({
          title: "Uninstallation Complete",
          body: result.message || "lsfg-vk has been uninstalled successfully"
        });
      } else {
        setInstallationStatus(`Uninstallation failed: ${result.error}`);
        toaster.toast({
          title: "Uninstallation Failed",
          body: result.error || "Unknown error occurred"
        });
      }
    } catch (error) {
      setInstallationStatus(`Uninstallation failed: ${error}`);
      toaster.toast({
        title: "Uninstallation Failed",
        body: `Error: ${error}`
      });
    } finally {
      setIsUninstalling(false);
    }
  };

  const updateConfig = async (newEnableLsfg: boolean, newMultiplier: number, newFlowScale: number, newHdr: boolean) => {
    try {
      const result = await updateLsfgConfig(newEnableLsfg, newMultiplier, newFlowScale, newHdr);
      if (result.success) {
        toaster.toast({
          title: "Configuration Updated",
          body: "lsfg script configuration has been updated"
        });
      } else {
        toaster.toast({
          title: "Update Failed", 
          body: result.error || "Failed to update configuration"
        });
      }
    } catch (error) {
      toaster.toast({
        title: "Update Failed",
        body: `Error: ${error}`
      });
    }
  };

  const handleEnableLsfgChange = async (value: boolean) => {
    setEnableLsfg(value);
    await updateConfig(value, multiplier, flowScale, hdr);
  };

  const handleMultiplierChange = async (value: number) => {
    setMultiplier(value);
    await updateConfig(enableLsfg, value, flowScale, hdr);
  };

  const handleFlowScaleChange = async (value: number) => {
    setFlowScale(value);
    await updateConfig(enableLsfg, multiplier, value, hdr);
  };

  const handleHdrChange = async (value: boolean) => {
    setHdr(value);
    await updateConfig(enableLsfg, multiplier, flowScale, value);
  };

  return (
    <PanelSection>
      <PanelSectionRow>
      <div style={{ marginBottom: "8px", fontSize: "14px" }}>
        <div style={{ 
        color: dllDetected ? "#4CAF50" : "#F44336", 
        fontWeight: "bold", 
        marginBottom: "4px" 
        }}>
        {dllDetectionStatus}
        </div>
        <div style={{ 
        color: isInstalled ? "#4CAF50" : "#FF9800" 
        }}>
        Status: {installationStatus}
        </div>
      </div>
      </PanelSectionRow>
      
      <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={isInstalled ? handleUninstall : handleInstall}
        disabled={isInstalling || isUninstalling}
      >
        {isInstalling ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div>Installing...</div>
        </div>
        ) : isUninstalling ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div>Uninstalling...</div>
        </div>
        ) : isInstalled ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FaTrash />
          <div>Uninstall lsfg-vk</div>
        </div>
        ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FaDownload />
          <div>Install lsfg-vk</div>
        </div>
        )}
      </ButtonItem>
      </PanelSectionRow>

      {/* Configuration Section - only show if installed */}
      {isInstalled && (
        <>
          <PanelSectionRow>
            <div style={{ 
              fontSize: "14px", 
              fontWeight: "bold", 
              marginTop: "16px", 
              marginBottom: "8px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
              paddingBottom: "4px"
            }}>
              LSFG Configuration
            </div>
          </PanelSectionRow>

          <PanelSectionRow>
            <ToggleField
              label="Enable LSFG"
              description="Enables the frame generation layer"
              checked={enableLsfg}
              onChange={handleEnableLsfgChange}
            />
          </PanelSectionRow>

          <PanelSectionRow>
            <SliderField
              label="FPS Multiplier"
              description="Traditional FPS multiplier value (2-4)"
              value={multiplier}
              min={2}
              max={4}
              step={1}
              notchCount={3}
              notchLabels={[
                { notchIndex: 0, label: "2" },
                { notchIndex: 1, label: "3" }, 
                { notchIndex: 2, label: "4" }
              ]}
              onChange={handleMultiplierChange}
            />
          </PanelSectionRow>

          <PanelSectionRow>
            <SliderField
              label="Flow Scale"
              description="Lowers the flow scale for performance (0.25-1.0)"
              value={flowScale}
              min={0.25}
              max={1.0}
              step={0.01}
              onChange={handleFlowScaleChange}
            />
          </PanelSectionRow>

          <PanelSectionRow>
            <ToggleField
              label="HDR Mode"
              description="Enable HDR mode (only if using HDR)"
              checked={hdr}
              onChange={handleHdrChange}
            />
          </PanelSectionRow>
        </>
      )}
      
      <PanelSectionRow>
      <div style={{ 
        fontSize: "13px", 
        marginTop: "12px", 
        padding: "8px", 
        backgroundColor: "rgba(255, 255, 255, 0.05)", 
        borderRadius: "4px" 
      }}>
        <div style={{ fontWeight: "bold", marginBottom: "6px" }}>
        Usage Instructions:
        </div>
        <div style={{ marginBottom: "4px" }}>
        Option 1: Use the lsfg script (recommended):
        </div>
        <div style={{ 
        fontFamily: "monospace", 
        backgroundColor: "rgba(0, 0, 0, 0.3)", 
        padding: "4px", 
        borderRadius: "2px",
        fontSize: "12px",
        marginBottom: "6px"
        }}>
        ~/lsfg && %COMMAND%
        </div>
        <div style={{ marginBottom: "4px" }}>
        Option 2: Manual environment variables:
        </div>
        <div style={{ 
        fontFamily: "monospace", 
        backgroundColor: "rgba(0, 0, 0, 0.3)", 
        padding: "4px", 
        borderRadius: "2px",
        fontSize: "12px",
        marginBottom: "6px"
        }}>
        ENABLE_LSFG=1 LSFG_MULTIPLIER={multiplier} %COMMAND%
        </div>
        <div style={{ fontSize: "11px", opacity: 0.8 }}>
        The lsfg script uses your current configuration settings.
        <br />
        • ENABLE_LSFG=1 - Enables frame generation
        <br />
        • LSFG_MULTIPLIER=2-4 - FPS multiplier (start with 2)
        <br />
        • LSFG_FLOW_SCALE=0.25-1.0 - Flow scale (for performance)
        <br />
        • LSFG_HDR=1 - HDR mode (only if using HDR)
        </div>
      </div>
      </PanelSectionRow>
    </PanelSection>
  );
};

export default definePlugin(() => {
  console.log("Lossless Scaling plugin initializing")

  return {
    // The name shown in various decky menus
    name: "Lossless Scaling",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>Lossless Scaling</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <GiPlasticDuck />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("Lossless Scaling unloading")
    },
  };
});
