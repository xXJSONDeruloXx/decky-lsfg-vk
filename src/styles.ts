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
`;
