import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses
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

function Content() {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [isUninstalling, setIsUninstalling] = useState<boolean>(false);
  const [installationStatus, setInstallationStatus] = useState<string>("");
  const [dllDetected, setDllDetected] = useState<boolean>(false);
  const [dllDetectionStatus, setDllDetectionStatus] = useState<string>("");

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

    checkInstallation();
    checkDllDetection();
  }, []);

  const handleInstall = async () => {
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

  return (
    <PanelSection title="lsfg-vk Installation">
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
            Add to your game's launch options in Steam:
          </div>
          <div style={{ 
            fontFamily: "monospace", 
            backgroundColor: "rgba(0, 0, 0, 0.3)", 
            padding: "4px", 
            borderRadius: "2px",
            fontSize: "12px",
            marginBottom: "6px"
          }}>
            ENABLE_LSFG=1 LSFG_MULTIPLIER=2 %COMMAND%
          </div>
          <div style={{ fontSize: "11px", opacity: 0.8 }}>
            • ENABLE_LSFG=1 - Enables frame generation
            <br />
            • LSFG_MULTIPLIER=2-4 - FPS multiplier (start with 2)
            <br />
            • LSFG_FLOW_SCALE=1.0 - Flow scale (optional, for performance)
          </div>
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
};

export default definePlugin(() => {
  console.log("lsfg-vk Installer plugin initializing")

  return {
    // The name shown in various decky menus
    name: "lsfg-vk Installer",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>lsfg-vk Installer</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <GiPlasticDuck />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("lsfg-vk Installer unloading")
    },
  };
});
