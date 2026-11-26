#!/usr/bin/env python3
"""Bundle defaults/i18n/*.json into src/i18n/languages.json.

Same result as build_i18n_json.sh, without needing jq. The bundle is committed,
and tests/test_i18n.py fails when it drifts from the files in defaults/i18n.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "defaults" / "i18n"
OUTPUT = ROOT / "src" / "i18n" / "languages.json"


def build() -> dict:
    return {
        path.stem: json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(SOURCE_DIR.glob("*.json"))
    }


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(build(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
