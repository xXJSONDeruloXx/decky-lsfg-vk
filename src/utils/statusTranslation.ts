import { t } from "../i18n/i18n";

export function translateStatus(status: string | null | undefined): string {
  if (!status) return "";
  const s = status.trim();

  if (s === "Lossless Scaling's lsfg-vk.dll is not configured") {
    return t("STATUS_LOSSLESS_SCALING_DLL_NOT_CONFIGURED", s);
  }
  if (s === "Lossless Scaling's lsfg-vk.dll was not found") {
    return t("STATUS_LOSSLESS_SCALING_DLL_NOT_FOUND", s);
  }
  if (s === "Lossless Scaling detected by lsfg-vk") {
    return t("STATUS_LOSSLESS_SCALING_DETECTED", s);
  }
  if (s === "lsfg-vk configuration is not installed") {
    return t("STATUS_LSFG_VK_CONFIG_NOT_INSTALLED", s);
  }
  if (s === "lsfg-vk could not validate its configuration") {
    return t("STATUS_LSFG_VK_CONFIG_VALIDATE_ERROR", s);
  }
  if (
    s === "Lossless Scaling Not Installed" ||
    s === "Lossless Scaling not installed"
  ) {
    return t("STATUS_LOSSLESS_SCALING_NOT_INSTALLED", s);
  }
  if (s === "lsfg-vk Installed" || s === "lsfg-vk installed") {
    return t("STATUS_LSFG_VK_INSTALLED", s);
  }
  if (s === "lsfg-vk Not Installed" || s === "lsfg-vk not installed") {
    return t("STATUS_LSFG_VK_NOT_INSTALLED", s);
  }
  if (s === "Installing lsfg-vk...") {
    return t("STATUS_INSTALLING_LSFG_VK", s);
  }
  if (s === "Uninstalling lsfg-vk...") {
    return t("STATUS_UNINSTALLING_LSFG_VK", s);
  }
  if (
    s === "lsfg-vk uninstalled" ||
    s === "lsfg-vk uninstalled successfully!"
  ) {
    return t("STATUS_LSFG_VK_UNINSTALL_SUCCESS", s);
  }
  if (
    s ===
    "Uninstallation cancelled: could not clean up launch options"
  ) {
    return t("STATUS_UNINSTALL_CANCELLED", s);
  }
  if (s.startsWith("Installation failed: ")) {
    const err = s.replace("Installation failed: ", "");
    return t("STATUS_INSTALLATION_FAILED", s, { error: err });
  }
  if (
    s.startsWith("Uninstall failed: ") ||
    s.startsWith("Uninstallation failed: ")
  ) {
    const err = s.replace(/^Uninstall(ation)? failed: /, "");
    return t("STATUS_UNINSTALLATION_FAILED", s, { error: err });
  }
  if (
    s ===
    "Lossless Scaling is installed but its Steam branch could not be determined"
  ) {
    return t("STATUS_BRANCH_UNDETERMINED", s);
  }
  if (
    s === "Lossless Scaling has the lsfg-vk Steam branch selected"
  ) {
    return t("STATUS_BRANCH_SELECTED", s);
  }
  if (
    s ===
    "Select lsfg-vk in Lossless Scaling's Steam Properties > Betas"
  ) {
    return t("STATUS_SELECT_LSFG_VK_BETAS", s);
  }

  return s;
}
