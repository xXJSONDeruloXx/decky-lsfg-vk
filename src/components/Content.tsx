import { Tabs } from "@decky/ui";
import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { FaCube, FaFileAlt, FaGamepad, FaList, FaTools } from "react-icons/fa";
import { ConfigurationData } from "../config/configSchema";
import { useFlatpakConfiguration } from "../hooks/useFlatpakConfiguration";
import { useGameConfiguration } from "../hooks/useGameConfiguration";
import { useInstallation } from "../hooks/useLsfgHooks";
import { tabStyles } from "../styles";
import { resolveNowPlayingTarget } from "../utils/nowPlaying";
import { ConfigFileTab } from "./ConfigFileTab";
import { ConfigurationTab } from "./ConfigurationTab";
import { FlatpakNowPlayingTab } from "./FlatpakNowPlayingTab";
import { FlatpakTab } from "./FlatpakTab";
import { NowPlayingTab } from "./NowPlayingTab";
import { SetupTab } from "./SetupTab";

const tabIcons = {
  nowPlaying: <FaGamepad size={18} />,
  games: <FaList size={18} />,
  flatpak: <FaCube size={18} />,
  configFile: <FaFileAlt size={18} />,
  setup: <FaTools size={18} />,
};

const DEBUG_TAB_VISIBILITY_KEY = "lsfg-debug-tab-visible-v1";

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
    targets,
    runningGame,
    setSelectedAppId,
    save,
    saveFor,
    enable,
    enableAll,
    repair,
    resetSelected,
    resetAll,
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
  } = useInstallation(reload);
  const setupComplete =
    isInstalled &&
    losslessScalingInstalled &&
    steamBranchStatus?.success === true &&
    steamBranchStatus.installed &&
    !steamBranchStatus.needs_switch;
  const flatpak = useFlatpakConfiguration(setupComplete);
  const [tab, setTab] = useState("Setup");
  const [showDebugTab, setShowDebugTab] = usePersistentBoolean(DEBUG_TAB_VISIBILITY_KEY, true);
  const [contentFocused, setContentFocused] = useState(false);
  const previousRunningWorkload = useRef<string | null>(null);
  const runningFlatpak = flatpak.runningApp;
  const nowPlayingTarget = resolveNowPlayingTarget(runningGame, runningFlatpak);
  const hasNowPlaying = Boolean(nowPlayingTarget);
  const runningWorkload = nowPlayingTarget
    ? nowPlayingTarget.kind === "flatpak"
      ? `flatpak:${nowPlayingTarget.app.app_id}:${nowPlayingTarget.launcher?.appid ?? ""}`
      : `steam:${nowPlayingTarget.game.appid}`
    : null;

  useEffect(() => {
    if (!setupComplete) {
      setTab("Setup");
      return;
    }
    setTab((current) => current === "Setup" ? (hasNowPlaying ? "NowPlaying" : "Games") : current);
  }, [hasNowPlaying, setupComplete]);

  useEffect(() => {
    if (!setupComplete) return;
    const previous = previousRunningWorkload.current;
    previousRunningWorkload.current = runningWorkload;
    if (runningWorkload && runningWorkload !== previous) setTab("NowPlaying");
    else if (!runningWorkload && previous) {
      setTab((current) => current === "NowPlaying" ? "Games" : current);
    }
  }, [runningWorkload, setupComplete]);

  useEffect(() => {
    if (isInstalled) {
      void reload();
      void flatpak.reload();
    }
  }, [isInstalled, reload, flatpak.reload]);

  useEffect(() => {
    if (!showDebugTab && tab === "ConfigFile") setTab("Games");
  }, [showDebugTab, tab]);

  const handleConfigChange = async (
    fieldName: keyof ConfigurationData,
    value: boolean | number | string | string[],
    cleanupLaunchOptions = false,
  ) => {
    await save({ ...config, [fieldName]: value }, cleanupLaunchOptions);
  };

  const setup = (
    <SetupTab
      isInstalled={isInstalled}
      installationStatus={installationStatus}
      losslessScalingInstalled={losslessScalingInstalled}
      losslessScalingStatus={losslessScalingStatus}
      steamBranchStatus={steamBranchStatus}
      isInstalling={isInstalling}
      isUninstalling={isUninstalling}
      onInstall={() => void install()}
      onUninstall={() => void uninstall()}
    />
  );

  const tabContent = (content: ReactNode) => (
    <div className="lsfg-vk-tab-content">{content}</div>
  );

  const nowPlaying = nowPlayingTarget?.kind === "steam" ? (
    <NowPlayingTab
      game={nowPlayingTarget.game}
      config={runningConfig}
      onConfigChange={async (field, value) => {
        await saveFor(nowPlayingTarget.game.appid, { ...runningConfig, [field]: value }, true);
      }}
    />
  ) : nowPlayingTarget?.kind === "flatpak" ? (
    <FlatpakNowPlayingTab
      app={nowPlayingTarget.app}
      launcher={nowPlayingTarget.launcher}
      onConfigChange={flatpak.updateConfig}
    />
  ) : null;

  const tabs = setupComplete
    ? [
        ...(nowPlaying ? [{ id: "NowPlaying", title: tabIcons.nowPlaying, content: tabContent(nowPlaying) }] : []),
        {
          id: "Games",
          title: tabIcons.games,
          content: tabContent(
            <ConfigurationTab
              config={config}
              targets={targets}
              runningGame={runningGame}
              showDebugTab={showDebugTab}
              onShowDebugTabChange={setShowDebugTab}
              onSelect={setSelectedAppId}
              onConfigChange={(field, value) => handleConfigChange(field, value, true)}
              onEnable={enable}
              onEnableAll={enableAll}
              onRepair={repair}
              onReset={resetSelected}
              onResetAll={resetAll}
            />,
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
              onRemove={flatpak.removeApp}
              onConfigChange={flatpak.updateConfig}
              onWorkaroundChange={flatpak.updateWorkarounds}
            />,
          ),
        },
        ...(showDebugTab ? [{ id: "ConfigFile", title: tabIcons.configFile, content: tabContent(<ConfigFileTab />) }] : []),
        { id: "Setup", title: tabIcons.setup, content: tabContent(setup) },
      ]
    : [{ id: "Setup", title: tabIcons.setup, content: tabContent(setup) }];

  const availableTabIds = new Set(tabs.map(({ id }) => id));
  const activeTab = availableTabIds.has(tab) ? tab : setupComplete ? "Games" : "Setup";
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
