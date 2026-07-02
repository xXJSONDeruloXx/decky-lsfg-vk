from pathlib import Path
import json

from pathlib import Path
import json
import shutil

HOME = Path.home()

LOCAL_LIB = HOME / ".local/lib"
VULKAN_DIR = HOME / ".local/share/vulkan/implicit_layer.d"

class ArmadaRuntime:
    def __init__(self, service):
        self.service = service

    def install_layer(self):
        """
        Verify the ARM64 runtime files are installed.
        """

        lib = LOCAL_LIB / "liblsfg-vk-arm64.so"
        manifest = VULKAN_DIR / "VkLayer_LSFGVK_frame_generation.json"

        if not lib.exists():
            raise RuntimeError(f"Missing {lib}")

        if not manifest.exists():
            raise RuntimeError(f"Missing {manifest}")

        self.service.log.info("ARM64 Vulkan layer installed.")

    def __init__(self, service):
        self.service = service

    def enable_fex_vulkan(self):
        cfg = Path.home() / ".config/fex-emu/Config.json"

        cfg.parent.mkdir(parents=True, exist_ok=True)

        if cfg.exists():
            data = json.loads(cfg.read_text())
        else:
            data = {}

        data.setdefault("ThunksDB", {})
        data["ThunksDB"]["Vulkan"] = 1

        cfg.write_text(json.dumps(data, indent=2))
