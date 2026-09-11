import { ButtonItem, Field, PanelSectionRow } from "@decky/ui";
import { useEffect, useState, type RefObject } from "react";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";

export interface CollapsibleItem {
  id: string;
  label: string;
  description: string;
}

export const collapsibleItemGroupStyles = `
  .LSFG_GameGroupCollapseButton_Container {
    margin-top: -2px;
    margin-bottom: 4px;
  }

  .LSFG_GameGroupCollapseButton_Container > div > div > div > button,
  .LSFG_GameGroupCollapseButton_Container > div > div > div > div > button {
    height: 24px !important;
    min-height: 24px !important;
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  .LSFG_GameGroupCollapseButton_Container svg {
    display: block;
    margin: 0;
  }
`;

export function usePersistentCollapsed(key: string) {
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

interface Props {
  title: string;
  items: CollapsibleItem[];
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  toggleRef?: RefObject<HTMLDivElement>;
}

export function CollapsibleItemGroup({
  title,
  items,
  collapsed,
  onToggle,
  onSelect,
  toggleRef,
}: Props) {
  if (items.length === 0) return null;

  return (
    <>
      <PanelSectionRow>
        <Field label={`${title} (${items.length})`} bottomSeparator="none" />
      </PanelSectionRow>
      <PanelSectionRow>
        <div
          ref={toggleRef}
          className="LSFG_GameGroupCollapseButton_Container"
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
      {!collapsed && items.map((item) => (
        <PanelSectionRow key={item.id}>
          <Field
            label={item.label}
            description={item.description}
            onActivate={() => onSelect(item.id)}
            highlightOnFocus
          />
        </PanelSectionRow>
      ))}
    </>
  );
}
