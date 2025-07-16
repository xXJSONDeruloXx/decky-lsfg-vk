import React, { useState, useEffect } from 'react';
import {
  ButtonItem,
  PanelSection
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
        return (
          <div style={{ color: 'lightgreen', marginTop: '5px' }}>
            ✓ v{updateInfo.latestVersion} downloaded - ready to install
          </div>
        );
      } else {
        return (
          <div style={{ color: 'orange', marginTop: '5px' }}>
            Update available: v{updateInfo.latestVersion}
          </div>
        );
      }
    } else {
      return (
        <div style={{ color: 'lightgreen', marginTop: '5px' }}>
          Up to date (v{updateInfo.currentVersion})
        </div>
      );
    }
  };

  return (
    <PanelSection title="Plugin Updates">
      <ButtonItem
        layout="below"
        onClick={handleCheckForUpdate}
        disabled={checkingUpdate}
        description={getStatusMessage()}
      >
        {checkingUpdate ? 'Checking for updates...' : 'Check for Updates'}
      </ButtonItem>

      {updateInfo && updateInfo.updateAvailable && !downloadResult?.success && (
        <ButtonItem
          layout="below"
          onClick={handleDownloadUpdate}
          disabled={downloadingUpdate}
          description={`Download version ${updateInfo.latestVersion}`}
        >
          {downloadingUpdate ? 'Downloading...' : 'Download Update'}
        </ButtonItem>
      )}

      {downloadResult?.success && (
        <div style={{ 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: 'rgba(0, 255, 0, 0.1)', 
          borderRadius: '4px',
          border: '1px solid rgba(0, 255, 0, 0.3)'
        }}>
          <div style={{ color: 'lightgreen', fontWeight: 'bold', marginBottom: '5px' }}>
            ✓ Download Complete!
          </div>
          <div style={{ fontSize: '12px', marginBottom: '10px' }}>
            File saved to: {downloadResult.download_path}
          </div>
          <div style={{ fontSize: '12px' }}>
            <strong>Installation Instructions:</strong>
            <ol style={{ paddingLeft: '20px', marginTop: '5px' }}>
              <li>Go to Decky Loader settings</li>
              <li>Click "Developer" tab</li>
              <li>Click "Uninstall" next to "Lossless Scaling"</li>
              <li>Click "Install from ZIP"</li>
              <li>Select the downloaded file</li>
              <li>Restart Steam or reload plugins</li>
            </ol>
          </div>
        </div>
      )}

      {updateError && (
        <div style={{ 
          color: 'red', 
          marginTop: '10px', 
          padding: '8px', 
          backgroundColor: 'rgba(255, 0, 0, 0.1)', 
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {updateError}
        </div>
      )}
    </PanelSection>
  );
};
