import { PanelSectionRow, Field } from "@decky/ui";

export function LaunchOptionInfo() {
  return (
    <PanelSectionRow>
      <Field
        bottomSeparator="none"
        label="Setup Instructions"
        description={
          <>
            <div>For each game where you want to use lsfg-vk:</div>
            <div style={{ marginTop: "8px" }}>
              1. Right-click the game in Steam → Properties<br/>
              2. Add this to Launch Options: <code>LSFG_PROCESS=decky-lsfg-vk %command%</code><br/>
              3. Or use the "Copy Launch Option" button above
            </div>
            <div style={{ marginTop: "8px", fontStyle: "italic" }}>
              This temporary solution allows hot-reloading while keeping you on the latest lsfg-vk version.
            </div>
          </>
        }
      />
    </PanelSectionRow>
  );
}
