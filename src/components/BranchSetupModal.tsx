import { DialogButton, ModalRoot, showModal } from "@decky/ui";
import branchSetupGif from "../../assets/lsfg-vk-branch-setup.gif";
import t from "../i18n/i18n";

export function showBranchSetupModal() {
  let closeModal = () => {};
  const modal = showModal(
    <ModalRoot
      bAllowFullSize
      closeModal={() => closeModal()}
      onCancel={() => closeModal()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          boxSizing: "border-box",
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
          padding: "8px 16px 16px",
          margin: "0 auto",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>
          {t("BRANCH_MODAL_HEADING", "Switch Lossless Scaling to the lsfg-vk branch")}
        </div>
        <img
          src={branchSetupGif}
          alt={t("BRANCH_IMG_ALT", "Steam steps for selecting the lsfg-vk branch")}
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            height: "auto",
            boxSizing: "border-box",
            borderRadius: "4px",
            background: "#101418",
          }}
        />
        <ol style={{ lineHeight: 1.5, margin: "14px 0 18px", paddingLeft: "24px" }}>
          <li>{t("BRANCH_STEP_1", "Open Lossless Scaling in your Steam library.")}</li>
          <li>{t("BRANCH_STEP_2", "Open Properties, then Game Versions & Betas.")}</li>
          <li>{t("BRANCH_STEP_3", "Select the lsfg-vk branch.")}</li>
          <li>{t("BRANCH_STEP_4", "Wait for Steam to finish the update and reopen Decky LSFG-VK.")}</li>
        </ol>
        <DialogButton
          onClick={() => closeModal()}
          style={{ width: "100%" }}
        >
          {t("BRANCH_CLOSE", "Close")}
        </DialogButton>
      </div>
    </ModalRoot>,
    undefined,
    {
      strTitle: t("BRANCH_MODAL_TITLE", "Finish LSFG-VK setup"),
      bNeverPopOut: true,
      popupWidth: 980,
      popupHeight: 760,
    },
  );
  closeModal = modal.Close;
}

