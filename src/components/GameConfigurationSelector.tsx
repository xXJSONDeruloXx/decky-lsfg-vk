import { ButtonItem, ConfirmModal, Field, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useRef, useState, type RefObject } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";
import { GameTarget } from "../hooks/useGameConfiguration";

interface Props {
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
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
    } catch {
      // Persisting the view preference is optional.
    }
  }, [collapsed, key]);

  return [collapsed, () => setCollapsed((value) => !value)] as const;
}

function targetDescription(game: GameTarget): string {
  if (game.transport.kind === "flatpak") return "Non-Steam · Flatpak";
  return game.nonSteam ? "Non-Steam" : "Steam";
}

function GameGroup({
  title,
  games,
  collapsed,
  onToggle,
  onSelect,
  toggleRef,
}: {
  title: string;
  games: GameTarget[];
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (appid: string) => void;
  toggleRef?: RefObject<HTMLDivElement>;
}) {
  if (games.length === 0) return null;

  return (
    <>
      <PanelSectionRow>
        <Field label={title + " (" + games.length + ")"} bottomSeparator="none" />
      </PanelSectionRow>
      <PanelSectionRow>
        <div
          ref={toggleRef}
          className="LSFG_GameGroupCollapseButton_Container"
          style={{ marginTop: "-2px", marginBottom: "4px" }}
        >
          <ButtonItem
            layout="below"
            bottomSeparator={collapsed ? "standard" : "none"}
            onClick={onToggle}
          >
            {collapsed ? <RiArrowDownSFill /> : <RiArrowUpSFill />}
          </ButtonItem>
        </div>
      </PanelSectionRow>
      {!collapsed && games.map((game) => (
        <PanelSectionRow key={game.appid}>
          <Field
            label={game.name}
            description={targetDescription(game)}
            onActivate={() => onSelect(game.appid)}
            highlightOnFocus
          />
        </PanelSectionRow>
      ))}
    </>
  );
}

export function GameConfigurationSelector({
  targets,
  runningGame,
  onSelect,
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

  return (
    <>
      {targets.length === 0 && (
        <PanelSectionRow>
          <Field label="No installed games" description="Steam has not reported any eligible games" />
        </PanelSectionRow>
      )}
      <GameGroup
        title="Enabled"
        games={enabledGames}
        collapsed={enabledCollapsed}
        onToggle={toggleEnabled}
        onSelect={onSelect}
        toggleRef={enabledToggleRef}
      />
      <GameGroup
        title="Available"
        games={availableGames}
        collapsed={availableCollapsed}
        onToggle={toggleAvailable}
        onSelect={onSelect}
      />
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
