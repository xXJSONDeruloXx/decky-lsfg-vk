import { ButtonItem, Field, Focusable, PanelSectionRow } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";

interface ProfileDetailsProps {
  description: string;
}

export function ProfileDetails({ description }: ProfileDetailsProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  return (
    <Focusable ref={detailsRef} noFocusRing>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          bottomSeparator={expanded ? "none" : "standard"}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <RiArrowUpSFill /> : <RiArrowDownSFill />} Game Details
        </ButtonItem>
      </PanelSectionRow>
      {expanded && (
        <PanelSectionRow>
          <Field label="Game Details" description={description} />
        </PanelSectionRow>
        )}
    </Focusable>
  );
}
