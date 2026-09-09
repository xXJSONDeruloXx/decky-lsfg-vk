declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

interface SteamAppDetails {
  strLaunchOptions?: string;
  strShortcutLaunchOptions?: string;
  strShortcutExe?: string;
}

interface SteamAppDetailsRegistration {
  unregister: () => void;
}

interface SteamApps {
  RegisterForAppDetails(
    appId: number,
    callback: (details: SteamAppDetails) => void,
  ): SteamAppDetailsRegistration;
  SetAppLaunchOptions(appId: number, options: string): void | Promise<void>;
  SetShortcutLaunchOptions(appId: number, options: string): void | Promise<void>;
  SetShortcutExe(appId: number, executable: string): void | Promise<void>;
  GetAllShortcuts?(): Promise<unknown[]>;
}

declare const SteamClient: {
  Apps: SteamApps;
};
