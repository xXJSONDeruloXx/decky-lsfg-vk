import { toaster } from "@decky/api";

export interface ToastOptions {
  title: string;
  body: string;
}

const showToast = (title: string, body: string): void => {
  toaster.toast({ title, body });
};
export const showSuccessToast = showToast;
export const showErrorToast = showToast;

export const ToastMessages = {
  INSTALL_SUCCESS: {
    title: "Installation Complete",
    body: "lsfg-vk has been installed successfully",
  },
  INSTALL_ERROR: {
    title: "Installation Failed",
    body: "Unknown error occurred",
  },
  UNINSTALL_SUCCESS: {
    title: "Uninstallation Complete",
    body: "lsfg-vk has been uninstalled successfully",
  },
  UNINSTALL_ERROR: {
    title: "Uninstallation Failed",
    body: "Unknown error occurred",
  },
  CONFIG_UPDATE_ERROR: {
    title: "Update Failed",
    body: "Failed to update configuration",
  },
} as const;

export const showErrorToastWithMessage = (title: string, error: unknown): void =>
  showErrorToast(title, error instanceof Error ? error.message : String(error));

export const showInstallSuccessToast = (): void =>
  showSuccessToast(ToastMessages.INSTALL_SUCCESS.title, ToastMessages.INSTALL_SUCCESS.body);

export const showInstallErrorToast = (error?: string): void =>
  showErrorToast(ToastMessages.INSTALL_ERROR.title, error || ToastMessages.INSTALL_ERROR.body);

export const showUninstallSuccessToast = (): void =>
  showSuccessToast(ToastMessages.UNINSTALL_SUCCESS.title, ToastMessages.UNINSTALL_SUCCESS.body);

export const showUninstallErrorToast = (error?: string): void =>
  showErrorToast(ToastMessages.UNINSTALL_ERROR.title, error || ToastMessages.UNINSTALL_ERROR.body);
