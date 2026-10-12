import { ButtonItem, ConfirmModal, Field, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useRef } from "react";
import type { GameTarget, KnownGameSource } from "../utils/gameTargets";
import { CollapsibleItemGroup, collapsibleItemGroupStyles, usePersistentCollapsed } from "./CollapsibleItemGroup";
import t from "../i18n/i18n";

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
  if (game.isFlatpakShortcut) return t("FLATPAK_USE_TAB", "Non-Steam | Use Flatpak Tab");
  if (game.source === "unknown") return t("SOURCE_UNKNOWN_EXCLUDED", "Unknown source · excluded from bulk actions");
  if (game.source === "nonSteam") return t("SOURCE_NON_STEAM", "Non-Steam");
  if (game.source === "steam") return t("SOURCE_STEAM", "Steam");
  return t("SOURCE_UNKNOWN", "Unknown source");
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
  const enableableGames = availableGames.filter((game) => game.source === source && !game.isFlatpakShortcut);
  const removableGames = enabledGames.filter((game) => game.source === source && !game.isFlatpakShortcut);
  const sourceName = source === "nonSteam"
    ? t("SOURCE_NON_STEAM_SHORTCUTS", "non-Steam shortcuts")
    : t("SOURCE_STEAM_GAMES", "Steam games");
  const sourceTitle = source === "nonSteam"
    ? t("SOURCE_NON_STEAM", "Non-Steam")
    : t("SOURCE_STEAM", "Steam");
  const emptyDescription = source === "nonSteam"
    ? t("NO_SHORTCUTS_DESC", "Steam has not reported any eligible non-Steam shortcuts")
    : t("NO_GAMES_DESC", "Steam has not reported any eligible installed games");
  const toItem = (game: GameTarget) => ({
    id: game.appid,
    label: game.name,
    description: targetDescription(game),
    disabled: game.isFlatpakShortcut,
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
        strTitle={t("MODAL_REMOVE_ALL_TITLE", "Remove all {source} profiles?", { source: sourceName })}
        strOKButtonText={t("MODAL_REMOVE_ALL_CONFIRM", "Remove all")}
        strCancelButtonText={t("MODAL_CANCEL", "Cancel")}
        onOK={() => void onResetAll(source)}
        onCancel={() => {}}
      />,
    );
  };

  const confirmEnableAll = () => {
    showModal(
      <ConfirmModal
        strTitle={t("MODAL_ENABLE_ALL_TITLE", "Enable all available {source}?", { source: sourceName })}
        strDescription={t("MODAL_ENABLE_ALL_DESC", "Create individual LSFG-VK profiles for every available {source}. Unknown-source profiles are excluded. Flatpak profiles are managed separately in the Flatpak tab.", { source: sourceName })}
        strOKButtonText={t("MODAL_ENABLE_ALL_CONFIRM", "Enable all")}
        strCancelButtonText={t("MODAL_CANCEL", "Cancel")}
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
          <Field label={t("NO_TARGETS_FOUND", "No {source} found", { source: sourceName })} description={emptyDescription} />
        </PanelSectionRow>
      )}
      <CollapsibleItemGroup
        title={t("SECTION_ENABLED", "Enabled")}
        items={enabledGames.map(toItem)}
        collapsed={enabledCollapsed}
        onToggle={toggleEnabled}
        onSelect={onSelect}
        toggleRef={enabledToggleRef}
      />
      <CollapsibleItemGroup
        title={t("SECTION_AVAILABLE", "Available")}
        items={availableGames.map(toItem)}
        collapsed={availableCollapsed}
        onToggle={toggleAvailable}
        onSelect={onSelect}
      />
      {enableableGames.length > 0 && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={confirmEnableAll} disabled={bulkOperationBusy}>
            {t("BTN_ENABLE_ALL", "Enable all {source}", { source: sourceName })}
          </ButtonItem>
        </PanelSectionRow>
      )}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={confirmResetAll}
          disabled={bulkOperationBusy || removableGames.length === 0}
        >
          {t("BTN_REMOVE_ALL", "Remove all {source} profiles", { source: sourceTitle })}
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
}

