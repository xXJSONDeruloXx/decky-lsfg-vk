/**
 * Centralized toast notification utilities
 * Provides consistent success/error messaging patterns
 */

import { toaster } from "@decky/api";
import t from "../i18n/i18n";

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
    get title() { return t('TOAST_INSTALL_SUCCESS_TITLE', 'Installation Complete'); },
    get body() { return t('TOAST_INSTALL_SUCCESS_BODY', 'lsfg-vk has been installed successfully'); }
  },
  INSTALL_ERROR: {
    get title() { return t('TOAST_INSTALL_ERROR_TITLE', 'Installation Failed'); },
    get body() { return t('TOAST_UNKNOWN_ERROR', 'Unknown error occurred'); }
  },
  UNINSTALL_SUCCESS: {
    get title() { return t('TOAST_UNINSTALL_SUCCESS_TITLE', 'Uninstallation Complete'); },
    get body() { return t('TOAST_UNINSTALL_SUCCESS_BODY', 'lsfg-vk has been uninstalled successfully'); }
  },
  UNINSTALL_ERROR: {
    get title() { return t('TOAST_UNINSTALL_ERROR_TITLE', 'Uninstallation Failed'); },
    get body() { return t('TOAST_UNKNOWN_ERROR', 'Unknown error occurred'); }
  },
  CONFIG_UPDATE_ERROR: {
    get title() { return t('TOAST_CONFIG_UPDATE_ERROR_TITLE', 'Update Failed'); },
    get body() { return t('TOAST_CONFIG_UPDATE_ERROR_BODY', 'Failed to update configuration'); }
  },
  CLIPBOARD_SUCCESS: {
    get title() { return t('TOAST_CLIPBOARD_SUCCESS_TITLE', 'Copied to Clipboard!'); },
    get body() { return t('TOAST_CLIPBOARD_SUCCESS_BODY', 'Launch option ready to paste'); }
  },
  CLIPBOARD_ERROR: {
    get title() { return t('TOAST_CLIPBOARD_ERROR_TITLE', 'Copy Failed'); },
    get body() { return t('TOAST_CLIPBOARD_ERROR_BODY', 'Unable to copy to clipboard'); }
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
