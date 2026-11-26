import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_i18n_json import build  # noqa: E402

TEMPLATE = json.loads((ROOT / "defaults/i18n/template.json").read_text(encoding="utf-8"))


def _source_text() -> str:
    files = subprocess.run(
        ["git", "ls-files", "src/*.ts", "src/*.tsx"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.split()
    return "\n".join((ROOT / name).read_text(encoding="utf-8") for name in files)


def _used_keys() -> set:
    text = _source_text()
    direct = re.findall(r'\bt\(\s*"([A-Z0-9_]+)"', text)
    indirect = re.findall(r'(?:labelKey|descriptionKey)\s*:\s*"([A-Z0-9_]+)"', text)
    return set(direct) | set(indirect)


class TranslationTests(unittest.TestCase):
    def test_bundle_matches_the_translation_files(self):
        bundled = json.loads((ROOT / "src/i18n/languages.json").read_text(encoding="utf-8"))
        self.assertEqual(
            bundled, build(),
            "src/i18n/languages.json is stale; run scripts/build_i18n_json.py",
        )

    def test_every_key_used_in_the_ui_is_in_the_template(self):
        self.assertEqual(sorted(_used_keys() - set(TEMPLATE)), [])

    def test_template_has_no_unused_keys(self):
        self.assertEqual(sorted(set(TEMPLATE) - _used_keys()), [])

    def test_translations_only_use_template_keys(self):
        for name in ("ja", "ko"):
            keys = json.loads((ROOT / f"defaults/i18n/{name}.json").read_text(encoding="utf-8"))
            self.assertEqual(sorted(set(keys) - set(TEMPLATE)), [], name)


if __name__ == "__main__":
    unittest.main()
