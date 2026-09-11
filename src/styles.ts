export const tabStyles = `
  .lsfg-vk-tabs > div > div:first-child {
    background: #0D141C;
    box-shadow: none;
    backdrop-filter: none;
  }

  .lsfg-vk-tabs [role="tabpanel"] {
    padding-left: 8px !important;
    padding-right: 8px !important;
  }

  .lsfg-vk-tabs .lsfg-vk-tab-content {
    padding-bottom: 96px; // workaround for in-game bottom bar padding behaving differently than in launcher, remove later?
  }

  .lsfg-vk-tabs [role="tablist"] {
    display: flex;
    flex-wrap: nowrap;
    justify-content: center;
  }

  .lsfg-vk-tabs [role="tab"] {
    flex: 0 1 auto;
    min-width: 0;
    box-sizing: border-box;
    padding-left: 6px !important;
    padding-right: 6px !important;
    display: flex !important;
    align-items: center;
    justify-content: center;
  }

  .lsfg-vk-tabs [role="tab"] svg {
    display: block;
    margin: 0;
  }

  .lsfg-vk-tabs--content-focused [role="tablist"][aria-orientation="horizontal"],
  .lsfg-vk-tabs--content-focused [role="tablist"][aria-orientation="horizontal"] > div,
  .lsfg-vk-tabs--content-focused [role="tablist"][aria-orientation="horizontal"] > div > div,
  .lsfg-vk-tabs--content-focused [role="tablist"][aria-orientation="horizontal"] [role="tab"] {
    animation: none !important;
    transition: none !important;
  }

  .lsfg-vk-tabs--content-focused [role="tablist"][aria-orientation="horizontal"] > div > div {
    scroll-behavior: auto !important;
    scroll-snap-type: none !important;
  }
`;
