import { Dropdown, DropdownOption, PanelSectionRow, ButtonItem } from "@decky/ui";
import { GameTarget } from "../hooks/useGameConfiguration";

interface Props {
  targets: GameTarget[];
  runningGame: GameTarget | null;
  selectedAppId: string;
  onSelect: (appid: string) => void;
  onReset: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

export function GameConfigurationSelector({ targets, runningGame, selectedAppId, onSelect, onReset, onResetAll }: Props) {
  const options: DropdownOption[] = [
    { data: "", label: runningGame ? `Default (editing template) · ${runningGame.name}` : "Default" },
    ...targets.map((target) => ({ data: target.appid, label: `${target.name} · ${target.appid}` })),
  ];
  return <>
    <PanelSectionRow>
      <Dropdown rgOptions={options} selectedOption={selectedAppId} onChange={(option) => onSelect(String(option.data))} />
    </PanelSectionRow>
    <PanelSectionRow>
      <ButtonItem layout="below" onClick={() => void onReset()} disabled={!selectedAppId}>Reset selected game</ButtonItem>
    </PanelSectionRow>
    <PanelSectionRow>
      <ButtonItem layout="below" onClick={() => void onResetAll()} disabled={!targets.some((target) => target.configured)}>Reset all game profiles</ButtonItem>
    </PanelSectionRow>
  </>;
}
