import { toaster } from "@decky/api";
import { t } from "../i18n/i18n";

export interface ToastOptions {
  title: string;
  body: string;
}

const showToast = (title: string, body: string): void => {
  toaster.toast({ title, body });
};
export const showSuccessToast = showToast;
export const showErrorToast = showToast;

export const showErrorToastWithMessage = (title: string, error: unknown): void =>
  showErrorToast(title, error instanceof Error ? error.message : String(error));

export const showInstallSuccessToast = (): void =>
  showSuccessToast(
    t("TOAST_INSTALL_COMPLETE_TITLE", "Installation Complete"),
    t("TOAST_INSTALL_SUCCESS_BODY", "lsfg-vk has been installed successfully")
  );

export const showInstallErrorToast = (error?: string): void =>
  showErrorToast(
    t("TOAST_INSTALL_ERROR_TITLE", "Installation Failed"),
    error || t("TOAST_INSTALL_ERROR_BODY", "Unknown error occurred")
  );

export const showUninstallSuccessToast = (): void =>
  showSuccessToast(
    t("TOAST_UNINSTALL_COMPLETE_TITLE", "Uninstallation Complete"),
    t("TOAST_UNINSTALL_SUCCESS_BODY", "lsfg-vk has been uninstalled successfully")
  );

export const showUninstallErrorToast = (error?: string): void =>
  showErrorToast(
    t("TOAST_UNINSTALL_ERROR_TITLE", "Uninstallation Failed"),
    error || t("TOAST_UNINSTALL_ERROR_BODY", "Unknown error occurred")
  );
