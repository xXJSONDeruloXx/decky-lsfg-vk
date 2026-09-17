import { DialogButton, ModalRoot, showModal } from "@decky/ui";
import branchSetupGif from "../../assets/lsfg-vk-branch-setup.gif";

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
          Switch Lossless Scaling to the lsfg-vk branch
        </div>
        <img
          src={branchSetupGif}
          alt="Steam steps for selecting the lsfg-vk branch"
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
          <li>Open Lossless Scaling in your Steam library.</li>
          <li>Open Properties, then Game Versions &amp; Betas.</li>
          <li>Select the <strong>lsfg-vk</strong> branch.</li>
          <li>Wait for Steam to finish the update and reopen Decky LSFG-VK.</li>
        </ol>
        <DialogButton
          onClick={() => closeModal()}
          style={{ width: "100%" }}
        >
          Close
        </DialogButton>
      </div>
    </ModalRoot>,
    undefined,
    {
      strTitle: "Finish LSFG-VK setup",
      bNeverPopOut: true,
      popupWidth: 980,
      popupHeight: 760,
    },
  );
  closeModal = modal.Close;
}
