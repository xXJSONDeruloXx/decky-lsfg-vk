import React, { useState, useEffect } from 'react';
import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  Field,
  Focusable
} from '@decky/ui';
import { checkForPluginUpdate, downloadPluginUpdate, UpdateCheckResult, UpdateDownloadResult } from '../api/lsfgApi';

interface PluginUpdateCheckerProps {
  // Add any props if needed
}

interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseDate: string;
  downloadUrl: string;
}

export const PluginUpdateChecker: React.FC<PluginUpdateCheckerProps> = () => {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloadResult, setDownloadResult] = useState<UpdateDownloadResult | null>(null);

  // Auto-hide error messages after 5 seconds
  useEffect(() => {
    if (updateError) {
      const timer = setTimeout(() => {
        setUpdateError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [updateError]);

  const handleCheckForUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    setUpdateInfo(null);
    setDownloadResult(null); // Clear previous download result

    try {
      const result: UpdateCheckResult = await checkForPluginUpdate();
      
      if (result.success) {
        setUpdateInfo({
          updateAvailable: result.update_available,
          currentVersion: result.current_version,
          latestVersion: result.latest_version,
          releaseNotes: result.release_notes,
          releaseDate: result.release_date,
          downloadUrl: result.download_url
        });

        // Simple console log instead of toast since showToast may not be available
        if (result.update_available) {
          console.log("Update available!", `Version ${result.latest_version} is now available.`);
        } else {
          console.log("Up to date!", "You have the latest version installed.");
        }
      } else {
        setUpdateError(result.error || "Failed to check for updates");
      }
    } catch (error) {
      setUpdateError(`Error checking for updates: ${error}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.downloadUrl) return;

    setDownloadingUpdate(true);
    setUpdateError(null);
    setDownloadResult(null);

    try {
      const result: UpdateDownloadResult = await downloadPluginUpdate(updateInfo.downloadUrl);
      
      if (result.success) {
        setDownloadResult(result);
        console.log("✓ Download complete!", `Plugin downloaded to ${result.download_path}`);
      } else {
        setUpdateError(result.error || "Failed to download update");
      }
    } catch (error) {
      setUpdateError(`Error downloading update: ${error}`);
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const getStatusMessage = () => {
    if (!updateInfo) return null;

    if (updateInfo.updateAvailable) {
      if (downloadResult?.success) {
        return "✓ v" + updateInfo.latestVersion + " downloaded - ready to install";
      } else {
        return "Update available: v" + updateInfo.latestVersion;
      }
    } else {
      return "Up to date (v" + updateInfo.currentVersion + ")";
    }
  };

  return (
    <PanelSection title="PLUGIN UPDATES">
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleCheckForUpdate}
          disabled={checkingUpdate}
          description={getStatusMessage()}
        >
          {checkingUpdate ? 'Checking for updates...' : 'Check for Updates'}
        </ButtonItem>
      </PanelSectionRow>

      {updateInfo && updateInfo.updateAvailable && !downloadResult?.success && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={handleDownloadUpdate}
            disabled={downloadingUpdate}
            description={`Download version ${updateInfo.latestVersion}`}
          >
            {downloadingUpdate ? 'Downloading...' : 'Download Update'}
          </ButtonItem>
        </PanelSectionRow>
      )}

      {downloadResult?.success && (
        <>
          <PanelSectionRow>
            <Field label="Download Complete!">
              <Focusable>
                File saved to: {downloadResult.download_path}
              </Focusable>
            </Field>
          </PanelSectionRow>
          
          <PanelSectionRow>
            <Field label="Installation Instructions:">
              <Focusable>
                1. Go to Decky Loader settings
                <br />2. Click "Developer" tab
                <br />3. Click "Uninstall" next to "Lossless Scaling"
                <br />4. Click "Install from ZIP"
                <br />5. Select the downloaded file
                <br />6. Restart Steam or reload plugins
              </Focusable>
            </Field>
          </PanelSectionRow>
        </>
      )}

      {updateError && (
        <PanelSectionRow>
          <Field label="Error:">
            <Focusable>
              {updateError}
            </Focusable>
          </Field>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};
