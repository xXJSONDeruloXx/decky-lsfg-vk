import { ButtonItem, ConfirmModal, Field, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useRef } from "react";
import type { GameTarget, KnownGameSource } from "../utils/gameTargets";
import { sourceLabel } from "../utils/gameTargets";
import { CollapsibleItemGroup, collapsibleItemGroupStyles, usePersistentCollapsed } from "./CollapsibleItemGroup";

interface Props {
  targets: GameTarget[];
  runningGame: GameTarget | null;
  source: KnownGameSource;
  bulkOperationBusy: boolean;
  onSelect: (appid: string) => void;
  onEnableAll: (source: KnownGameSource) => Promise<void>;
  onResetAll: (source: KnownGameSource) => Promise<void>;
  focusConfiguredToggle?: boolean;
  onConfiguredToggleFocused?: () => void;
}

const ENABLED_COLLAPSED_KEY = "lsfg-enabled-games-collapsed-v4";
const AVAILABLE_COLLAPSED_KEY = "lsfg-available-games-collapsed-v3";

function targetDescription(game: GameTarget): string {
  return game.source === "unknown"
    ? "Unknown source · excluded from bulk actions"
    : sourceLabel(game.source);
}

export function GameConfigurationSelector({
  targets,
  runningGame,
  source,
  bulkOperationBusy,
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
  const enableableGames = availableGames.filter((game) => game.source === source);
  const removableGames = enabledGames.filter((game) => game.source === source);
  const sourceName = source === "nonSteam" ? "non-Steam shortcuts" : "Steam games";
  const emptyDescription = source === "nonSteam"
    ? "Steam has not reported any eligible non-Steam shortcuts"
    : "Steam has not reported any eligible installed games";
  const toItem = (game: GameTarget) => ({
    id: game.appid,
    label: game.name,
    description: targetDescription(game),
  });
  const [enabledCollapsed, toggleEnabled] = usePersistentCollapsed(`${ENABLED_COLLAPSED_KEY}-${source}`);
  const [availableCollapsed, toggleAvailable] = usePersistentCollapsed(`${AVAILABLE_COLLAPSED_KEY}-${source}`);
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
        strTitle={`Remove all ${sourceName} profiles?`}
        strOKButtonText="Remove all"
        strCancelButtonText="Cancel"
        onOK={() => void onResetAll(source)}
        onCancel={() => {}}
      />,
    );
  };

  const confirmEnableAll = () => {
    showModal(
      <ConfirmModal
        strTitle={`Enable all available ${sourceName}?`}
        strDescription={`Create individual LSFG-VK profiles for every available ${sourceName}. Unknown-source profiles are excluded. Flatpak profiles are managed separately in the Flatpak tab.`}
        strOKButtonText="Enable all"
        strCancelButtonText="Cancel"
        onOK={() => void onEnableAll(source)}
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
          <Field label={`No ${sourceName} found`} description={emptyDescription} />
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
      {enableableGames.length > 0 && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={confirmEnableAll} disabled={bulkOperationBusy}>
            {`Enable all ${sourceName}`}
          </ButtonItem>
        </PanelSectionRow>
      )}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={confirmResetAll}
          disabled={bulkOperationBusy || removableGames.length === 0}
        >
          {`Remove all ${sourceLabel(source)} profiles`}
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
}
