import { ButtonItem, PanelSectionRow } from "@decky/ui";
import { FaDownload, FaTrash } from "react-icons/fa";

interface InstallationButtonProps {
  isInstalled: boolean;
  isInstalling: boolean;
  isUninstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}

export function InstallationButton({
  isInstalled,
  isInstalling,
  isUninstalling,
  onInstall,
  onUninstall
}: InstallationButtonProps) {
  const renderInstallButtonContent = () => {
    if (isInstalling) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div>{isInstalled ? "Updating..." : "Installing..."}</div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <FaDownload />
        <div>{isInstalled ? "Update LSFG-VK" : "Install / Update LSFG-VK"}</div>
      </div>
    );
  };

  const renderUninstallButtonContent = () => {
    if (isUninstalling) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div>Uninstalling...</div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <FaTrash />
        <div>Uninstall LSFG-VK</div>
      </div>
    );
  };

  return (
    <>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={onInstall}
          disabled={isInstalling || isUninstalling}
        >
          {renderInstallButtonContent()}
        </ButtonItem>
      </PanelSectionRow>

      {isInstalled && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={onUninstall}
            disabled={isInstalling || isUninstalling}
          >
            {renderUninstallButtonContent()}
          </ButtonItem>
        </PanelSectionRow>
      )}
    </>
  );
}
