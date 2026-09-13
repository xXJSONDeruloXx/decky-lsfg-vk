import { Field, PanelSection, PanelSectionRow } from "@decky/ui";

interface Props {
  title: string;
  details: string[];
}

export function NowPlayingSummary({ title, details }: Props) {
  return (
    <PanelSection>
      <PanelSectionRow>
        <Field label={title} description={details.filter(Boolean).join(" | ")} />
      </PanelSectionRow>
    </PanelSection>
  );
}
