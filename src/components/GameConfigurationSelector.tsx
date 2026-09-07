import { ButtonItem, ConfirmModal, Field, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";
import { GameTarget } from "../hooks/useGameConfiguration";

interface Props {
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
  onResetAll: () => Promise<void>;
}

const CONFIGURED_COLLAPSED_KEY = "lsfg-configured-games-collapsed";
const AVAILABLE_COLLAPSED_KEY = "lsfg-available-games-collapsed";

function usePersistentCollapsed(key: string) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === "true";
    } catch {
      return false;
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

function GameGroup({
  title,
  games,
  collapsed,
  onToggle,
  onSelect,
}: {
  title: string;
  games: GameTarget[];
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (appid: string) => void;
}) {
  if (games.length === 0) return null;

  return (
    <>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator={collapsed ? "standard" : "none"}
          onClick={onToggle}
        >
          {collapsed ? <RiArrowDownSFill /> : <RiArrowUpSFill />} {title} ({games.length})
        </ButtonItem>
      </PanelSectionRow>
      {!collapsed && games.map((game) => (
        <PanelSectionRow key={game.appid}>
          <Field
            label={game.name}
            description={game.nonSteam ? "Non-Steam" : "Steam"}
            onActivate={() => onSelect(game.appid)}
            highlightOnFocus
          />
        </PanelSectionRow>
      ))}
    </>
  );
}

export function GameConfigurationSelector({ targets, runningGame, onSelect, onResetAll }: Props) {
  const sortGames = (games: GameTarget[]) => [...games].sort((a, b) => {
    if (a.appid === runningGame?.appid) return -1;
    if (b.appid === runningGame?.appid) return 1;
    return a.name.localeCompare(b.name);
  });
  const configuredGames = sortGames(targets.filter((game) => game.configured));
  const availableGames = sortGames(targets.filter((game) => !game.configured));
  const [configuredCollapsed, toggleConfigured] = usePersistentCollapsed(CONFIGURED_COLLAPSED_KEY);
  const [availableCollapsed, toggleAvailable] = usePersistentCollapsed(AVAILABLE_COLLAPSED_KEY);
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
        title="Configured"
        games={configuredGames}
        collapsed={configuredCollapsed}
        onToggle={toggleConfigured}
        onSelect={onSelect}
      />
      <GameGroup
        title="Available games"
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
