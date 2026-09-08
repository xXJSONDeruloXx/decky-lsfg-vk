import asyncio
import sys
import types
import unittest
from unittest.mock import Mock


class PluginMigrationTests(unittest.TestCase):
    def test_migration_only_runs_decky_path_migrations(self):
        decky = types.SimpleNamespace(
            DECKY_HOME="/decky",
            DECKY_USER_HOME="/home/deck",
            migrate_logs=Mock(),
            migrate_settings=Mock(),
            migrate_runtime=Mock(),
            logger=Mock(),
        )
        previous_decky = sys.modules.get("decky")
        previous_tomllib = sys.modules.get("tomllib")
        sys.modules["decky"] = decky
        sys.modules["tomllib"] = types.SimpleNamespace(loads=Mock())
        try:
            sys.path.insert(0, "py_modules")
            from lsfg_vk.plugin import Plugin

            plugin = Plugin.__new__(Plugin)
            plugin.installation_service = Mock()
            plugin.flatpak_service = Mock()

            asyncio.run(plugin._migration())

            decky.migrate_logs.assert_called_once()
            decky.migrate_settings.assert_called_once()
            decky.migrate_runtime.assert_called_once()
            plugin.installation_service.install.assert_not_called()
            plugin.flatpak_service.migrate_v2.assert_not_called()
        finally:
            sys.path.remove("py_modules")
            if previous_decky is None:
                sys.modules.pop("decky", None)
            else:
                sys.modules["decky"] = previous_decky
            if previous_tomllib is None:
                sys.modules.pop("tomllib", None)
            else:
                sys.modules["tomllib"] = previous_tomllib


if __name__ == "__main__":
    unittest.main()
