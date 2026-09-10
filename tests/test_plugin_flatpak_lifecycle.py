import asyncio
import sys
import types
import unittest
from unittest.mock import Mock


sys.modules.setdefault(
    "decky",
    types.SimpleNamespace(
        DECKY_HOME="/decky",
        DECKY_USER_HOME="/home/deck",
        logger=Mock(),
    ),
)
sys.modules.setdefault("tomllib", types.SimpleNamespace(loads=Mock()))
sys.path.insert(0, "py_modules")

from lsfg_vk.plugin import Plugin


class PluginFlatpakLifecycleTests(unittest.TestCase):
    def test_install_and_reload_ensure_global_flatpak_support(self):
        plugin = Plugin.__new__(Plugin)
        plugin.installation_service = Mock()
        plugin.installation_service.install.return_value = {"success": True}
        plugin.installation_service.check_installation.return_value = {"installed": True}
        plugin.flatpak_service = Mock()
        plugin.flatpak_service.ensure_plugin_support.return_value = {"success": True}
        plugin.wrapper_service = Mock()
        plugin.wrapper_service.repair.return_value = {"success": True}

        installed = asyncio.run(plugin.install_lsfg_vk())
        asyncio.run(plugin._main())

        self.assertTrue(installed["success"])
        self.assertEqual(plugin.flatpak_service.ensure_plugin_support.call_count, 2)
        plugin.wrapper_service.repair.assert_called_once_with()

    def test_unload_does_not_remove_persistent_flatpak_setup(self):
        plugin = Plugin.__new__(Plugin)
        plugin.installation_service = Mock()
        plugin.flatpak_service = Mock()

        asyncio.run(plugin._unload())

        plugin.flatpak_service.remove_plugin_owned_extensions.assert_not_called()

    def test_uninstall_is_the_flatpak_cleanup_boundary(self):
        plugin = Plugin.__new__(Plugin)
        plugin.installation_service = Mock()
        plugin.flatpak_service = Mock()
        plugin.flatpak_service.remove_plugin_owned_extensions.return_value = {"success": True}

        asyncio.run(plugin._uninstall())

        plugin.installation_service.cleanup_on_uninstall.assert_called_once_with()
        plugin.flatpak_service.remove_plugin_owned_extensions.assert_called_once_with()

    def test_uninstall_button_also_cleans_flatpak_support(self):
        plugin = Plugin.__new__(Plugin)
        plugin.installation_service = Mock()
        plugin.installation_service.uninstall.return_value = {
            "success": True,
            "message": "lsfg-vk uninstalled successfully",
            "error": None,
            "removed_files": ["/home/deck/.local/lib/liblsfg-vk.so"],
        }
        plugin.flatpak_service = Mock()
        plugin.flatpak_service.remove_plugin_owned_extensions.return_value = {
            "success": True,
            "message": "Plugin-owned Flatpak state removed",
            "error": None,
            "removed_branches": ["23.08", "24.08", "25.08"],
            "preserved_branches": [],
            "removed_filesystem_grants": ["/home/deck/.config/lsfg-vk"],
            "preserved_filesystem_grants": [],
            "ownership_uncertain": False,
        }

        result = asyncio.run(plugin.uninstall_lsfg_vk())

        plugin.installation_service.uninstall.assert_called_once_with()
        plugin.flatpak_service.remove_plugin_owned_extensions.assert_called_once_with()
        self.assertTrue(result["success"])
        self.assertEqual(result["flatpak_cleanup"]["removed_branches"], ["23.08", "24.08", "25.08"])

    def test_uninstall_button_reports_flatpak_cleanup_failure(self):
        plugin = Plugin.__new__(Plugin)
        plugin.installation_service = Mock()
        plugin.installation_service.uninstall.return_value = {
            "success": True,
            "message": "lsfg-vk uninstalled successfully",
            "error": None,
            "removed_files": [],
        }
        plugin.flatpak_service = Mock()
        plugin.flatpak_service.remove_plugin_owned_extensions.return_value = {
            "success": False,
            "message": "",
            "error": "Flatpak ownership metadata was not trusted",
            "ownership_uncertain": True,
        }

        result = asyncio.run(plugin.uninstall_lsfg_vk())

        self.assertFalse(result["success"])
        self.assertIn("Flatpak ownership metadata was not trusted", result["error"])
        self.assertTrue(result["flatpak_cleanup"]["ownership_uncertain"])

    def test_uninstall_button_fails_closed_if_flatpak_cleanup_raises(self):
        plugin = Plugin.__new__(Plugin)
        plugin.installation_service = Mock()
        plugin.installation_service.uninstall.return_value = {
            "success": True,
            "message": "lsfg-vk uninstalled successfully",
            "error": None,
            "removed_files": [],
        }
        plugin.flatpak_service = Mock()
        plugin.flatpak_service.remove_plugin_owned_extensions.side_effect = RuntimeError(
            "ownership could not be established"
        )

        result = asyncio.run(plugin.uninstall_lsfg_vk())

        self.assertFalse(result["success"])
        self.assertIn("ownership could not be established", result["error"])
        self.assertTrue(result["flatpak_cleanup"]["ownership_uncertain"])


if __name__ == "__main__":
    unittest.main()
