from pathlib import Path
import json


class ArmadaRuntime:
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
