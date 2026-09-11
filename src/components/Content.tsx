import { Tabs } from "@decky/ui";
import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { FaCube, FaExternalLinkAlt, FaFileAlt, FaGamepad, FaSteam, FaTools } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import { useFlatpakConfiguration } from "../hooks/useFlatpakConfiguration";
import { useGameConfiguration } from "../hooks/useGameConfiguration";
import { useInstallation } from "../hooks/useLsfgHooks";
import { tabStyles } from "../styles";
import { targetsForSource } from "../utils/gameTargets";
import { resolveNowPlayingTarget, type NowPlayingTarget } from "../utils/nowPlaying";
import { ConfigFileTab } from "./ConfigFileTab";
import { ConfigurationTab } from "./ConfigurationTab";
import { FlatpakNowPlayingTab } from "./FlatpakNowPlayingTab";
import { FlatpakTab } from "./FlatpakTab";
import { NowPlayingTab } from "./NowPlayingTab";
import { SettingsTab } from "./SettingsTab";

const tabIcons = {
  nowPlaying: <FaGamepad size={18} />,
  steam: <FaSteam size={18} />,
  nonSteam: <FaExternalLinkAlt size={18} />,
  flatpak: <FaCube size={18} />,
  configFile: <FaFileAlt size={18} />,
  settings: <FaTools size={18} />,
};

const DEBUG_TAB_VISIBILITY_KEY = "lsfg-debug-tab-visible-v1";
type GameTabId = "Steam" | "NonSteam" | "Flatpak";

function tabForNowPlaying(target: NowPlayingTarget | null): GameTabId {
  if (!target) return "Steam";
  if (target.kind === "flatpak") return target.launcher?.source === "nonSteam" ? "NonSteam" : "Flatpak";
  return target.game.source === "nonSteam" ? "NonSteam" : "Steam";
}

function usePersistentBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? defaultValue : stored === "true";
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}

export function Content() {
  const {
    config,
    runningConfig,
    globalConfig,
    targets,
    runningGame,
    setSelectedAppId,
    save,
    saveFor,
    updateGlobal,
    enable,
    enableAll,
    bulkOperationBusy,
    repair,
    resetSelected,
    resetAll,
    cleanupAllWorkarounds,
    reload,
  } = useGameConfiguration();
  const {
    isInstalled,
    installationStatus,
    losslessScalingInstalled,
    losslessScalingStatus,
    steamBranchStatus,
    isInstalling,
    isUninstalling,
    install,
    uninstall,
  } = useInstallation(reload, cleanupAllWorkarounds);
  const setupComplete =
    isInstalled &&
    losslessScalingInstalled &&
    steamBranchStatus?.success === true &&
    steamBranchStatus.installed &&
    !steamBranchStatus.needs_switch;
  const flatpak = useFlatpakConfiguration(setupComplete);
  const [tab, setTab] = useState("Settings");
  const [showDebugTab, setShowDebugTab] = usePersistentBoolean(DEBUG_TAB_VISIBILITY_KEY, false);
  const [contentFocused, setContentFocused] = useState(false);
  const previousRunningWorkload = useRef<string | null>(null);
  const previousNowPlayingTab = useRef<GameTabId>("Steam");
  const runningFlatpak = flatpak.runningApp;
  const nowPlayingTarget = resolveNowPlayingTarget(runningGame, runningFlatpak);
  const hasNowPlaying = Boolean(nowPlayingTarget);
  const runningWorkload = nowPlayingTarget
    ? nowPlayingTarget.kind === "flatpak"
      ? `flatpak:${nowPlayingTarget.app.app_id}:${nowPlayingTarget.launcher?.appid ?? ""}`
      : `${nowPlayingTarget.game.source}:${nowPlayingTarget.game.appid}`
    : null;
  const steamTargets = targetsForSource(targets, "steam");
  const nonSteamTargets = targetsForSource(targets, "nonSteam");

  useEffect(() => {
    if (!setupComplete) {
      setTab("Settings");
      return;
    }
    setTab((current) => current === "Settings" ? (hasNowPlaying ? "NowPlaying" : "Steam") : current);
  }, [hasNowPlaying, setupComplete]);

  useEffect(() => {
    if (!setupComplete) return;
    const previous = previousRunningWorkload.current;
    previousRunningWorkload.current = runningWorkload;
    if (runningWorkload && runningWorkload !== previous) {
      previousNowPlayingTab.current = tabForNowPlaying(nowPlayingTarget);
      setTab("NowPlaying");
    }
    else if (!runningWorkload && previous) {
      setTab((current) => current === "NowPlaying" ? previousNowPlayingTab.current : current);
    }
  }, [runningWorkload, setupComplete]);

  useEffect(() => {
    if (isInstalled) {
      void reload();
      void flatpak.reload();
    }
  }, [isInstalled, reload, flatpak.reload]);

  useEffect(() => {
    if (!showDebugTab && tab === "ConfigFile") setTab(setupComplete ? "Steam" : "Settings");
  }, [setupComplete, showDebugTab, tab]);

  const handleConfigChange = async (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
    cleanupLaunchOptions = false,
  ) => {
    await save({ ...config, [fieldName]: value }, cleanupLaunchOptions);
  };

  const settings = (
    <SettingsTab
      isInstalled={isInstalled}
      installationStatus={installationStatus}
      losslessScalingInstalled={losslessScalingInstalled}
      losslessScalingStatus={losslessScalingStatus}
      steamBranchStatus={steamBranchStatus}
      isInstalling={isInstalling}
      isUninstalling={isUninstalling}
      globalConfig={globalConfig}
      showDebugTab={showDebugTab}
      onGlobalConfigChange={updateGlobal}
      onShowDebugTabChange={setShowDebugTab}
      onInstall={() => void install()}
      onUninstall={() => void uninstall()}
    />
  );

  const tabContent = (content: ReactNode) => (
    <div className="lsfg-vk-tab-content">{content}</div>
  );

  const nowPlaying = nowPlayingTarget?.kind === "flatpak" ? (
    <FlatpakNowPlayingTab
      app={nowPlayingTarget.app}
      launcher={nowPlayingTarget.launcher}
      onConfigChange={flatpak.updateConfig}
    />
  ) : nowPlayingTarget ? (
    <NowPlayingTab
      game={nowPlayingTarget.game}
      config={runningConfig}
      onConfigChange={async (field, value) => {
        await saveFor(nowPlayingTarget.game.appid, { ...runningConfig, [field]: value }, true);
      }}
    />
  ) : null;

  const tabs = setupComplete
    ? [
        ...(nowPlaying ? [{ id: "NowPlaying", title: tabIcons.nowPlaying, content: tabContent(nowPlaying) }] : []),
        {
          id: "Steam",
          title: tabIcons.steam,
          content: tabContent(
            <ConfigurationTab
              title="Steam games"
              source="steam"
              config={config}
              targets={steamTargets}
              runningGame={runningGame}
              onSelect={setSelectedAppId}
              onConfigChange={handleConfigChange}
              onEnable={enable}
              onEnableAll={enableAll}
              bulkOperationBusy={bulkOperationBusy}
              onRepair={repair}
              onReset={resetSelected}
              onResetAll={resetAll}
            />,
          ),
        },
        {
          id: "NonSteam",
          title: tabIcons.nonSteam,
          content: tabContent(
            <ConfigurationTab
              title="Non-Steam games"
              source="nonSteam"
              config={config}
              targets={nonSteamTargets}
              runningGame={runningGame}
              onSelect={setSelectedAppId}
              onConfigChange={handleConfigChange}
              onEnable={enable}
              onEnableAll={enableAll}
              bulkOperationBusy={bulkOperationBusy}
              onRepair={repair}
              onReset={resetSelected}
              onResetAll={resetAll}
            />
          ),
        },
        {
          id: "Flatpak",
          title: tabIcons.flatpak,
          content: tabContent(
            <FlatpakTab
              apps={flatpak.apps}
              runningApp={runningFlatpak}
              loading={flatpak.loading}
              busyAppId={flatpak.busyAppId}
              onRefresh={flatpak.reload}
              onEnable={flatpak.enableApp}
              onEnableAll={flatpak.enableAll}
              onRemove={flatpak.removeApp}
              onRemoveAll={flatpak.removeAll}
              onConfigChange={flatpak.updateConfig}
              onWorkaroundChange={flatpak.updateWorkarounds}
            />,
          ),
        },
        ...(showDebugTab ? [{ id: "ConfigFile", title: tabIcons.configFile, content: tabContent(<ConfigFileTab />) }] : []),
        { id: "Settings", title: tabIcons.settings, content: tabContent(settings) },
      ]
    : [{ id: "Settings", title: tabIcons.settings, content: tabContent(settings) }];

  const availableTabIds = new Set(tabs.map(({ id }) => id));
  const activeTab = availableTabIds.has(tab) ? tab : setupComplete ? "Steam" : "Settings";
  const handleFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    const focusedElement = event.target as HTMLElement | null;
    setContentFocused(!focusedElement?.closest?.('[role="tab"]'));
  };

  return (
    <div
      className={`lsfg-vk-tabs${contentFocused ? " lsfg-vk-tabs--content-focused" : ""}`}
      style={{ height: "95%", width: "300px", position: "fixed", marginTop: "-12px", overflow: "hidden" }}
      onFocusCapture={handleFocusCapture}
    >
      <style>{tabStyles}</style>
      <Tabs
        activeTab={activeTab}
        onShowTab={(nextTab: string) => {
          if (availableTabIds.has(nextTab)) setTab(nextTab);
        }}
        tabs={tabs}
      />
    </div>
  );
}
