import { useState, useEffect, useCallback } from "react";
import {
  getProfiles,
  createProfile,
  deleteProfile,
  renameProfile,
  setCurrentProfile,
  updateProfileConfig,
  type ProfilesResult,
  type ProfileResult,
  type ConfigUpdateResult
} from "../api/lsfgApi";
import { ConfigurationData } from "../config/configSchema";
import { showSuccessToast, showErrorToast } from "../utils/toastUtils";
import t from "../i18n/i18n";

export function useProfileManagement() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [currentProfile, setCurrentProfileState] = useState<string>("decky-lsfg-vk");
  const [isLoading, setIsLoading] = useState(false);

  // Load profiles on hook initialization
  const loadProfiles = useCallback(async () => {
    try {
      const result: ProfilesResult = await getProfiles();
      if (result.success && result.profiles) {
        setProfiles(result.profiles);
        if (result.current_profile) {
          setCurrentProfileState(result.current_profile);
        }
        return result;
      } else {
        console.error("Failed to load profiles:", result.error);
        showErrorToast(t('PROFILE_LOAD_FAILED', 'Failed to load profiles'), result.error || t('COMMON_UNKNOWN_ERROR', 'Unknown error'));
        return result;
      }
    } catch (error) {
      console.error("Error loading profiles:", error);
      showErrorToast(t('PROFILE_LOAD_ERROR', 'Error loading profiles'), String(error));
      return { success: false, error: String(error) };
    }
  }, []);

  // Create a new profile
  const handleCreateProfile = useCallback(async (profileName: string, sourceProfile?: string) => {
    setIsLoading(true);
    try {
      const result: ProfileResult = await createProfile(profileName, sourceProfile || currentProfile);
      if (result.success) {
        // Use the normalized name returned from backend (spaces converted to dashes)
        const actualProfileName = result.profile_name || profileName;
        showSuccessToast(t('PROFILE_CREATED', 'Profile created'), `${t('PROFILE_CREATED_PREFIX', 'Created profile:')} ${actualProfileName}`);
        await loadProfiles();
        return result;
      } else {
        console.error("Failed to create profile:", result.error);
        showErrorToast(t('PROFILE_CREATE_FAILED', 'Failed to create profile'), result.error || t('COMMON_UNKNOWN_ERROR', 'Unknown error'));
        return result;
      }
    } catch (error) {
      console.error("Error creating profile:", error);
      showErrorToast(t('PROFILE_CREATE_ERROR', 'Error creating profile'), String(error));
      return { success: false, error: String(error) };
    } finally {
      setIsLoading(false);
    }
  }, [currentProfile, loadProfiles]);

  // Delete a profile
  const handleDeleteProfile = useCallback(async (profileName: string) => {
    if (profileName === "decky-lsfg-vk") {
      showErrorToast(t('PROFILE_CANNOT_DELETE_TITLE', 'Cannot delete default profile'), t('PROFILE_CANNOT_DELETE_MSG', 'The default profile cannot be deleted'));
      return { success: false, error: "Cannot delete default profile" };
    }

    setIsLoading(true);
    try {
      const result: ProfileResult = await deleteProfile(profileName);
      if (result.success) {
        showSuccessToast(t('PROFILE_DELETED', 'Profile deleted'), `${t('PROFILE_DELETED_PREFIX', 'Deleted profile:')} ${profileName}`);
        await loadProfiles();
        // If we deleted the current profile, it should have switched to default
        if (currentProfile === profileName) {
          setCurrentProfileState("decky-lsfg-vk");
        }
        return result;
      } else {
        console.error("Failed to delete profile:", result.error);
        showErrorToast(t('PROFILE_DELETE_FAILED', 'Failed to delete profile'), result.error || t('COMMON_UNKNOWN_ERROR', 'Unknown error'));
        return result;
      }
    } catch (error) {
      console.error("Error deleting profile:", error);
      showErrorToast(t('PROFILE_DELETE_ERROR', 'Error deleting profile'), String(error));
      return { success: false, error: String(error) };
    } finally {
      setIsLoading(false);
    }
  }, [currentProfile, loadProfiles]);

  // Rename a profile
  const handleRenameProfile = useCallback(async (oldName: string, newName: string) => {
    if (oldName === "decky-lsfg-vk") {
      showErrorToast(t('PROFILE_CANNOT_RENAME_TITLE', 'Cannot rename default profile'), t('PROFILE_CANNOT_RENAME_MSG', 'The default profile cannot be renamed'));
      return { success: false, error: "Cannot rename default profile" };
    }

    setIsLoading(true);
    try {
      const result: ProfileResult = await renameProfile(oldName, newName);
      if (result.success) {
        // Use the normalized name returned from backend (spaces converted to dashes)
        const actualNewName = result.profile_name || newName;
        showSuccessToast(t('PROFILE_RENAMED', 'Profile renamed'), `${t('PROFILE_RENAMED_PREFIX', 'Renamed profile to:')} ${actualNewName}`);
        await loadProfiles();
        // Update current profile if it was renamed
        if (currentProfile === oldName) {
          setCurrentProfileState(actualNewName);
        }
        return result;
      } else {
        console.error("Failed to rename profile:", result.error);
        showErrorToast(t('PROFILE_RENAME_FAILED', 'Failed to rename profile'), result.error || t('COMMON_UNKNOWN_ERROR', 'Unknown error'));
        return result;
      }
    } catch (error) {
      console.error("Error renaming profile:", error);
      showErrorToast(t('PROFILE_RENAME_ERROR', 'Error renaming profile'), String(error));
      return { success: false, error: String(error) };
    } finally {
      setIsLoading(false);
    }
  }, [currentProfile, loadProfiles]);

  // Set the current active profile
  const handleSetCurrentProfile = useCallback(async (profileName: string) => {
    setIsLoading(true);
    try {
      const result: ProfileResult = await setCurrentProfile(profileName);
      if (result.success) {
        setCurrentProfileState(profileName);
        showSuccessToast(t('PROFILE_SWITCHED', 'Profile switched'), `${t('PROFILE_SWITCHED_PREFIX', 'Switched to profile:')} ${profileName}`);
        return result;
      } else {
        console.error("Failed to switch profile:", result.error);
        showErrorToast(t('PROFILE_SWITCH_FAILED', 'Failed to switch profile'), result.error || t('COMMON_UNKNOWN_ERROR', 'Unknown error'));
        return result;
      }
    } catch (error) {
      console.error("Error switching profile:", error);
      showErrorToast(t('PROFILE_SWITCH_ERROR', 'Error switching profile'), String(error));
      return { success: false, error: String(error) };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update configuration for a specific profile
  const handleUpdateProfileConfig = useCallback(async (profileName: string, config: ConfigurationData) => {
    setIsLoading(true);
    try {
      const result: ConfigUpdateResult = await updateProfileConfig(profileName, config);
      if (result.success) {
        return result;
      } else {
        console.error("Failed to update profile config:", result.error);
        showErrorToast(t('PROFILE_UPDATE_FAILED', 'Failed to update profile config'), result.error || t('COMMON_UNKNOWN_ERROR', 'Unknown error'));
        return result;
      }
    } catch (error) {
      console.error("Error updating profile config:", error);
      showErrorToast(t('PROFILE_UPDATE_ERROR', 'Error updating profile config'), String(error));
      return { success: false, error: String(error) };
    } finally {
      setIsLoading(false);
    }
  }, [currentProfile]);

  // Initialize profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  return {
    profiles,
    currentProfile,
    isLoading,
    loadProfiles,
    createProfile: handleCreateProfile,
    deleteProfile: handleDeleteProfile,
    renameProfile: handleRenameProfile,
    setCurrentProfile: handleSetCurrentProfile,
    updateProfileConfig: handleUpdateProfileConfig
  };
}
