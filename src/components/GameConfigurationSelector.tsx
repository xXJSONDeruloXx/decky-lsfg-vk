import { ButtonItem, Field, PanelSectionRow } from "@decky/ui";
import { GameTarget } from "../hooks/useGameConfiguration";

interface Props {
  targets: GameTarget[];
  runningGame: GameTarget | null;
  onSelect: (appid: string) => void;
  onResetAll: () => Promise<void>;
}

const profileDescription = (target: GameTarget, running: boolean, active: boolean) => [
  running ? "Now playing" : "",
  target.nonSteam ? "Non-Steam" : "Steam",
  target.configured
    ? active ? "Profile active" : "Profile saved · applies next launch"
    : "Not configured · changes apply next launch",
].filter(Boolean).join(" · ");

export function GameConfigurationSelector({ targets, runningGame, onSelect, onResetAll }: Props) {
  const games = [...targets].sort((a, b) => {
    if (a.appid === runningGame?.appid) return -1;
    if (b.appid === runningGame?.appid) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {games.length === 0 && (
        <PanelSectionRow>
          <Field label="No installed games" description="Steam has not reported any eligible games" />
        </PanelSectionRow>
      )}
      {games.map((game) => (
        <PanelSectionRow key={game.appid}>
          <Field
            label={game.name}
            description={profileDescription(
              game,
              game.appid === runningGame?.appid,
              game.appid === runningGame?.appid ? runningGame.configured : game.configured,
            )}
            onActivate={() => onSelect(game.appid)}
            highlightOnFocus
          />
        </PanelSectionRow>
      ))}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={() => void onResetAll()}
          disabled={!targets.some((target) => target.configured)}
        >
          Remove all profiles
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
}
