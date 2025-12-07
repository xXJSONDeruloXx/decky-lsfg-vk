import { useState, useEffect } from "react";
import {
  PanelSectionRow,
  Dropdown,
  DropdownOption,
  showModal,
  ConfirmModal,
  Field,
  DialogButton,
  ButtonItem,
  ModalRoot,
  TextField,
  Focusable,
  AppOverview,
  Router
} from "@decky/ui";
import { RiArrowDownSFill, RiArrowUpSFill, RiEditLine, RiDeleteBinLine } from "react-icons/ri";
import { 
  getProfiles, 
  createProfile, 
  deleteProfile, 
  renameProfile, 
  setCurrentProfile,
  ProfilesResult,
  ProfileResult
} from "../api/lsfgApi";
import { showSuccessToast, showErrorToast } from "../utils/toastUtils";

const PROFILES_COLLAPSED_KEY = 'lsfg-profiles-collapsed';

interface TextInputModalProps {
  title: string;
  description: string;
  defaultValue?: string;
  okText?: string;
  cancelText?: string;
  onOK: (value: string) => void;
  closeModal?: () => void;
}

function TextInputModal({ 
  title, 
  description, 
  defaultValue = "", 
  okText = "OK", 
  cancelText = "Cancel", 
  onOK, 
  closeModal 
}: TextInputModalProps) {
  const [value, setValue] = useState(defaultValue);

  const handleOK = () => {
    if (value.trim()) {
      onOK(value);
      closeModal?.();
    }
  };

  return (
    <ModalRoot>
      <div style={{ padding: "16px", minWidth: "400px" }}>
        <h2 style={{ marginBottom: "16px" }}>{title}</h2>
        <p style={{ marginBottom: "24px" }}>{description}</p>
        
        <div style={{ marginBottom: "24px" }}>
          <Field 
            label="Name"
            childrenLayout="below"
            childrenContainerWidth="max"
          >
            <TextField
              value={value}
              onChange={(e) => setValue(e?.target?.value || "")}
              style={{ width: "100%" }}
            />
          </Field>
        </div>
        
        <Focusable
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "16px"
          }}
          flow-children="horizontal"
        >
          <DialogButton onClick={closeModal}>
            {cancelText}
          </DialogButton>
          <DialogButton 
            onClick={handleOK} 
            disabled={!value.trim()}
          >
            {okText}
          </DialogButton>
        </Focusable>
      </div>
    </ModalRoot>
  );
}

interface ProfileManagementProps {
  currentProfile?: string;
  onProfileChange?: (profileName: string) => void;
}

export function ProfileManagement({ currentProfile, onProfileChange }: ProfileManagementProps) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>(currentProfile || "decky-lsfg-vk");
  const [isLoading, setIsLoading] = useState(false);
  const [mainRunningApp, setMainRunningApp] = useState<AppOverview | undefined>(undefined);
  
  // Initialize with localStorage value, fallback to false (expanded) if not found
  const [profilesCollapsed, setProfilesCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(PROFILES_COLLAPSED_KEY);
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Persist profiles collapse state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(PROFILES_COLLAPSED_KEY, JSON.stringify(profilesCollapsed));
    } catch (error) {
      console.warn('Failed to save profiles collapse state:', error);
    }
  }, [profilesCollapsed]);

  // Load profiles on component mount
  useEffect(() => {
    loadProfiles();
  }, []);

  // Update selected profile when prop changes
  useEffect(() => {
    if (currentProfile) {
      setSelectedProfile(currentProfile);
    }
  }, [currentProfile]);

  // Poll for running app every 2 seconds
  useEffect(() => {
    const checkRunningApp = () => {
      setMainRunningApp(Router.MainRunningApp);
    };

    // Check immediately
    checkRunningApp();

    // Set up polling interval
    const interval = setInterval(checkRunningApp, 2000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  const loadProfiles = async () => {
    try {
      const result: ProfilesResult = await getProfiles();
      if (result.success && result.profiles) {
        setProfiles(result.profiles);
        if (result.current_profile) {
          setSelectedProfile(result.current_profile);
        }
      } else {
        console.error("Failed to load profiles:", result.error);
        showErrorToast("Failed to load profiles", result.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error loading profiles:", error);
      showErrorToast("Error loading profiles", String(error));
    }
  };

  const handleProfileChange = async (profileName: string) => {
    setIsLoading(true);
    try {
      const result: ProfileResult = await setCurrentProfile(profileName);
      if (result.success) {
        setSelectedProfile(profileName);
        showSuccessToast("Profile switched", `Switched to profile: ${profileName}`);
        onProfileChange?.(profileName);
      } else {
        console.error("Failed to switch profile:", result.error);
        showErrorToast("Failed to switch profile", result.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error switching profile:", error);
      showErrorToast("Error switching profile", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProfile = () => {
    showModal(
      <TextInputModal
        title="Create New Profile"
        description="Enter a name for the new profile. The current profile's settings will be copied."
        okText="Create"
        cancelText="Cancel"
        onOK={(name: string) => {
          if (name.trim()) {
            createNewProfile(name.trim());
          }
        }}
      />
    );
  };

  const createNewProfile = async (profileName: string) => {
    setIsLoading(true);
    try {
      const result: ProfileResult = await createProfile(profileName, selectedProfile);
      if (result.success) {
        // Use the normalized name returned from backend (spaces converted to dashes)
        const actualProfileName = result.profile_name || profileName;
        showSuccessToast("Profile created", `Created profile: ${actualProfileName}`);
        await loadProfiles();
        // Automatically switch to the newly created profile using the normalized name
        await handleProfileChange(actualProfileName);
      } else {
        console.error("Failed to create profile:", result.error);
        showErrorToast("Failed to create profile", result.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error creating profile:", error);
      showErrorToast("Error creating profile", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProfile = () => {
    if (selectedProfile === "decky-lsfg-vk") {
      showErrorToast("Cannot delete default profile", "The default profile cannot be deleted");
      return;
    }

    showModal(
      <ConfirmModal
        strTitle="Delete Profile"
        strDescription={`Are you sure you want to delete the profile "${selectedProfile}"? This action cannot be undone.`}
        strOKButtonText="Delete"
        strCancelButtonText="Cancel"
        onOK={() => deleteSelectedProfile()}
      />
    );
  };

  const deleteSelectedProfile = async () => {
    setIsLoading(true);
    try {
      const result: ProfileResult = await deleteProfile(selectedProfile);
      if (result.success) {
        showSuccessToast("Profile deleted", `Deleted profile: ${selectedProfile}`);
        await loadProfiles();
        // If we deleted the current profile, it should have switched to default
        setSelectedProfile("decky-lsfg-vk");
        onProfileChange?.("decky-lsfg-vk");
      } else {
        console.error("Failed to delete profile:", result.error);
        showErrorToast("Failed to delete profile", result.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error deleting profile:", error);
      showErrorToast("Error deleting profile", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDropdownChange = (option: DropdownOption) => {
    if (option.data === "__NEW_PROFILE__") {
      handleCreateProfile();
    } else {
      handleProfileChange(option.data);
    }
  };

  const handleRenameProfile = () => {
    if (selectedProfile === "decky-lsfg-vk") {
      showErrorToast("Cannot rename default profile", "The default profile cannot be renamed");
      return;
    }

    showModal(
      <TextInputModal
        title="Rename Profile"
        description={`Enter a new name for the profile "${selectedProfile}".`}
        defaultValue={selectedProfile}
        okText="Rename"
        cancelText="Cancel"
        onOK={(newName: string) => {
          if (newName.trim() && newName.trim() !== selectedProfile) {
            renameSelectedProfile(newName.trim());
          }
        }}
      />
    );
  };

  const renameSelectedProfile = async (newName: string) => {
    setIsLoading(true);
    try {
      const result: ProfileResult = await renameProfile(selectedProfile, newName);
      if (result.success) {
        // Use the normalized name returned from backend (spaces converted to dashes)
        const actualNewName = result.profile_name || newName;
        showSuccessToast("Profile renamed", `Renamed profile to: ${actualNewName}`);
        await loadProfiles();
        setSelectedProfile(actualNewName);
        onProfileChange?.(actualNewName);
      } else {
        console.error("Failed to rename profile:", result.error);
        showErrorToast("Failed to rename profile", result.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error renaming profile:", error);
      showErrorToast("Error renaming profile", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const profileOptions: DropdownOption[] = [
    ...profiles.map((profile: string) => ({
      data: profile,
      label: profile === "decky-lsfg-vk" ? "Default" : profile
    })),
    {
      data: "__NEW_PROFILE__",
      label: "New Profile"
    }
  ];

  return (
    <>
      <style>
        {`
        .LSFG_ProfilesCollapseButton_Container > div > div > div > button {
          height: 10px !important;
        }
        .LSFG_ProfilesCollapseButton_Container > div > div > div > div > button {
          height: 10px !important;
        }
        `}
      </style>

      {/* Display currently running game info - always visible */}
      {mainRunningApp && (
        <PanelSectionRow>
          <div style={{ 
            padding: "8px 12px", 
            backgroundColor: "rgba(0, 255, 0, 0.1)", 
            borderRadius: "4px",
            border: "1px solid rgba(0, 255, 0, 0.3)",
            fontSize: "13px"
          }}>
            <strong>{mainRunningApp.display_name}</strong> running. Close game to change profile.
          </div>
        </PanelSectionRow>
      )}

      <PanelSectionRow>
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            marginTop: "8px",
            marginBottom: "6px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
            paddingBottom: "3px",
            color: "white"
          }}
        >
          Profile: {selectedProfile === "decky-lsfg-vk" ? "Default" : selectedProfile}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div
          className="LSFG_ProfilesCollapseButton_Container"
          style={{ marginTop: "-2px", marginBottom: "4px" }}
        >
          <ButtonItem
            layout="below"
            bottomSeparator={profilesCollapsed ? "standard" : "none"}
            onClick={() => setProfilesCollapsed(!profilesCollapsed)}
          >
            {profilesCollapsed ? (
              <RiArrowDownSFill
                style={{ transform: "translate(0, -13px)", fontSize: "1.5em" }}
              />
            ) : (
              <RiArrowUpSFill
                style={{ transform: "translate(0, -12px)", fontSize: "1.5em" }}
              />
            )}
          </ButtonItem>
        </div>
      </PanelSectionRow>

      {!profilesCollapsed && (
        <>
          <PanelSectionRow>
            <Field
              label=""
              childrenLayout="below"
              childrenContainerWidth="max"
              bottomSeparator="none"
            >
              <Dropdown
                rgOptions={profileOptions}
                selectedOption={selectedProfile}
                onChange={handleDropdownChange}
                disabled={isLoading || !!mainRunningApp}
              />
            </Field>
          </PanelSectionRow>
          
          <PanelSectionRow>
            <Focusable
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "0",
                margin: "0",
                marginTop: "8px"
              }}
              flow-children="horizontal"
            >
              <DialogButton
                style={{
                  height: "40px",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px",
                  minWidth: "0",
                }}
                onClick={handleRenameProfile}
                disabled={isLoading || selectedProfile === "decky-lsfg-vk" || !!mainRunningApp}
              >
                <RiEditLine size={20} />
              </DialogButton>
              
              <DialogButton
                style={{
                  height: "40px",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px",
                  minWidth: "0",
                }}
                onClick={handleDeleteProfile}
                disabled={isLoading || selectedProfile === "decky-lsfg-vk" || !!mainRunningApp}
              >
                <RiDeleteBinLine size={20} />
              </DialogButton>
            </Focusable>
          </PanelSectionRow>
        </>
      )}
    </>
  );
}
