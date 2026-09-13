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
  TerminateApp(appId: string, param1: boolean): void;
  GetAllShortcuts?(): Promise<unknown[]>;
}

declare const SteamClient: {
  Apps: SteamApps;
};
