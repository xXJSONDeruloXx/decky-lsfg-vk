import { ButtonItem, ConfirmModal, Field, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";
import { GameTarget } from "../hooks/useGameConfiguration";

interface Props {
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
  onEnableAll: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

const CONFIGURED_COLLAPSED_KEY = "lsfg-configured-games-collapsed-v3";
const AVAILABLE_COLLAPSED_KEY = "lsfg-available-games-collapsed-v2";

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
        <Field label={`${title} (${games.length})`} bottomSeparator="none" />
      </PanelSectionRow>
      <PanelSectionRow>
        <div
          className="LSFG_GameGroupCollapseButton_Container"
          style={{ marginTop: "-2px", marginBottom: "4px" }}
        >
          <ButtonItem
            layout="below"
            bottomSeparator={collapsed ? "standard" : "none"}
            onClick={onToggle}
          >
            {collapsed ? (
              <RiArrowDownSFill />
            ) : (
              <RiArrowUpSFill />
            )}
          </ButtonItem>
        </div>
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

export function GameConfigurationSelector({ targets, runningGame, onSelect, onEnableAll, onResetAll }: Props) {
  const sortGames = (games: GameTarget[]) => [...games].sort((a, b) => {
    if (a.appid === runningGame?.appid) return -1;
    if (b.appid === runningGame?.appid) return 1;
    return a.name.localeCompare(b.name);
  });
  const configuredGames = sortGames(targets.filter((game) => game.configured));
  const availableGames = sortGames(targets.filter((game) => !game.configured));
  const configuredSteamGames = configuredGames.filter((game) => !game.nonSteam);
  const configuredNonSteamGames = configuredGames.filter((game) => game.nonSteam);
  const availableSteamGames = availableGames.filter((game) => !game.nonSteam);
  const availableNonSteamGames = availableGames.filter((game) => game.nonSteam);
  const [configuredCollapsed, toggleConfigured] = usePersistentCollapsed(CONFIGURED_COLLAPSED_KEY);
  const [configuredNonSteamCollapsed, toggleConfiguredNonSteam] = usePersistentCollapsed(`${CONFIGURED_COLLAPSED_KEY}-non-steam`);
  const [availableCollapsed, toggleAvailable] = usePersistentCollapsed(AVAILABLE_COLLAPSED_KEY);
  const [availableNonSteamCollapsed, toggleAvailableNonSteam] = usePersistentCollapsed(`${AVAILABLE_COLLAPSED_KEY}-non-steam`);
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
        strDescription="Create individual LSFG-VK profiles for every available game using the plugin defaults."
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
        {`
          .LSFG_GameGroupCollapseButton_Container > div > div > div > button,
          .LSFG_GameGroupCollapseButton_Container > div > div > div > div > button {
            height: 24px !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .LSFG_GameGroupCollapseButton_Container svg {
            display: block;
            margin: 0;
          }
        `}
      </style>
      {targets.length === 0 && (
        <PanelSectionRow>
          <Field label="No installed games" description="Steam has not reported any eligible games" />
        </PanelSectionRow>
      )}
      {availableGames.length > 0 && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={confirmEnableAll}>
            Enable all available games
          </ButtonItem>
        </PanelSectionRow>
      )}
      <GameGroup
        title="LSFG-VK Enabled"
        games={configuredSteamGames}
        collapsed={configuredCollapsed}
        onToggle={toggleConfigured}
        onSelect={onSelect}
      />
      <GameGroup
        title="LSFG-VK Enabled (Non-Steam)"
        games={configuredNonSteamGames}
        collapsed={configuredNonSteamCollapsed}
        onToggle={toggleConfiguredNonSteam}
        onSelect={onSelect}
      />
      <GameGroup
        title="Available games"
        games={availableSteamGames}
        collapsed={availableCollapsed}
        onToggle={toggleAvailable}
        onSelect={onSelect}
      />
      <GameGroup
        title="Available games (Non-Steam)"
        games={availableNonSteamGames}
        collapsed={availableNonSteamCollapsed}
        onToggle={toggleAvailableNonSteam}
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
