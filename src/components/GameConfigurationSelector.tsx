import { ButtonItem, ConfirmModal, Field, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { GameTarget } from "../hooks/useGameConfiguration";
import { CollapsibleItemGroup, collapsibleItemGroupStyles } from "./CollapsibleItemGroup";

interface Props {
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
  onEnableAll: () => Promise<void>;
  onResetAll: () => Promise<void>;
  focusConfiguredToggle?: boolean;
  onConfiguredToggleFocused?: () => void;
}

const ENABLED_COLLAPSED_KEY = "lsfg-enabled-games-collapsed-v4";
const AVAILABLE_COLLAPSED_KEY = "lsfg-available-games-collapsed-v3";

function usePersistentCollapsed(key: string) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) !== "false";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(collapsed));
    } catch {}
  }, [collapsed, key]);

  return [collapsed, () => setCollapsed((value) => !value)] as const;
}

function targetDescription(game: GameTarget): string {
  return game.nonSteam ? "Non-Steam" : "Steam";
}

export function GameConfigurationSelector({
  targets,
  runningGame,
  onSelect,
  onEnableAll,
  onResetAll,
  focusConfiguredToggle = false,
  onConfiguredToggleFocused,
}: Props) {
  const sortGames = (games: GameTarget[]) => [...games].sort((a, b) => {
    if (a.appid === runningGame?.appid) return -1;
    if (b.appid === runningGame?.appid) return 1;
    return a.name.localeCompare(b.name);
  });
  const enabledGames = sortGames(targets.filter((game) => game.configured));
  const availableGames = sortGames(targets.filter((game) => !game.configured));
  const toItem = (game: GameTarget) => ({
    id: game.appid,
    label: game.name,
    description: targetDescription(game),
  });
  const [enabledCollapsed, toggleEnabled] = usePersistentCollapsed(ENABLED_COLLAPSED_KEY);
  const [availableCollapsed, toggleAvailable] = usePersistentCollapsed(AVAILABLE_COLLAPSED_KEY);
  const enabledToggleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusConfiguredToggle) return;
    const frame = requestAnimationFrame(() => {
      enabledToggleRef.current?.querySelector<HTMLElement>('[role="button"], button')?.focus();
      onConfiguredToggleFocused?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [enabledGames.length, focusConfiguredToggle, onConfiguredToggleFocused]);

  const confirmResetAll = () => {
    showModal(
      <ConfirmModal
        strTitle="Remove all profiles?"
        strOKButtonText="Remove all"
        strCancelButtonText="Cancel"
        onOK={() => void onResetAll()}
        onCancel={() => {}}
      />,
    );
  };

  const confirmEnableAll = () => {
    showModal(
      <ConfirmModal
        strTitle="Enable all available games?"
        strDescription="Create individual LSFG-VK profiles for every available Steam game and non-Steam shortcut. Flatpak profiles are managed separately in the Flatpak tab."
        strOKButtonText="Enable all"
        strCancelButtonText="Cancel"
        onOK={() => void onEnableAll()}
        onCancel={() => {}}
      />,
    );
  };

  return (
    <>
      <style>
        {collapsibleItemGroupStyles}
      </style>
      {targets.length === 0 && (
        <PanelSectionRow>
          <Field label="No installed games" description="Steam has not reported any eligible games" />
        </PanelSectionRow>
      )}
      <CollapsibleItemGroup
        title="Enabled"
        items={enabledGames.map(toItem)}
        collapsed={enabledCollapsed}
        onToggle={toggleEnabled}
        onSelect={onSelect}
        toggleRef={enabledToggleRef}
      />
      <CollapsibleItemGroup
        title="Available"
        items={availableGames.map(toItem)}
        collapsed={availableCollapsed}
        onToggle={toggleAvailable}
        onSelect={onSelect}
      />
      {availableGames.length > 0 && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={confirmEnableAll}>
            Enable all available games
          </ButtonItem>
        </PanelSectionRow>
      )}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={confirmResetAll}
          disabled={!targets.some((target) => target.configured)}
        >
          Remove all profiles
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
}
