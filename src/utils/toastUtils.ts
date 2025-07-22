/**
 * Centralized toast notification utilities
 * Provides consistent success/error messaging patterns
 */

import { toaster } from "@decky/api";

export interface ToastOptions {
  title: string;
  body: string;
}

/**
 * Show a success toast notification
 */
export function showSuccessToast(title: string, body: string): void {
  toaster.toast({
    title,
    body
  });
}

/**
 * Show an error toast notification
 */
export function showErrorToast(title: string, body: string): void {
  toaster.toast({
    title,
    body
  });
}

/**
 * Standard success messages for common operations
 */
export const ToastMessages = {
  INSTALL_SUCCESS: {
    title: "Installation Complete",
    body: "lsfg-vk has been installed successfully"
  },
  INSTALL_ERROR: {
    title: "Installation Failed",
    body: "Unknown error occurred"
  },
  UNINSTALL_SUCCESS: {
    title: "Uninstallation Complete", 
    body: "lsfg-vk has been uninstalled successfully"
  },
  UNINSTALL_ERROR: {
    title: "Uninstallation Failed",
    body: "Unknown error occurred"
  },
  CONFIG_UPDATE_ERROR: {
    title: "Update Failed",
    body: "Failed to update configuration"
  },
  CLIPBOARD_SUCCESS: {
    title: "Copied to Clipboard!",
    body: "Launch option ready to paste"
  },
  CLIPBOARD_ERROR: {
    title: "Copy Failed",
    body: "Unable to copy to clipboard"
  }
} as const;

/**
 * Show a toast with dynamic error message
 */
export function showErrorToastWithMessage(title: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  showErrorToast(title, errorMessage);
}

/**
 * Show installation success toast
 */
export function showInstallSuccessToast(): void {
  showSuccessToast(ToastMessages.INSTALL_SUCCESS.title, ToastMessages.INSTALL_SUCCESS.body);
}

/**
 * Show installation error toast
 */
export function showInstallErrorToast(error?: string): void {
  showErrorToast(ToastMessages.INSTALL_ERROR.title, error || ToastMessages.INSTALL_ERROR.body);
}

/**
 * Show uninstallation success toast
 */
export function showUninstallSuccessToast(): void {
  showSuccessToast(ToastMessages.UNINSTALL_SUCCESS.title, ToastMessages.UNINSTALL_SUCCESS.body);
}

/**
 * Show uninstallation error toast
 */
export function showUninstallErrorToast(error?: string): void {
  showErrorToast(ToastMessages.UNINSTALL_ERROR.title, error || ToastMessages.UNINSTALL_ERROR.body);
}

/**
 * Show clipboard success toast
 */
export function showClipboardSuccessToast(): void {
  showSuccessToast(ToastMessages.CLIPBOARD_SUCCESS.title, ToastMessages.CLIPBOARD_SUCCESS.body);
}

/**
 * Show clipboard error toast
 */
export function showClipboardErrorToast(): void {
  showErrorToast(ToastMessages.CLIPBOARD_ERROR.title, ToastMessages.CLIPBOARD_ERROR.body);
}
