import os
import decky
from .services import InstallationService


class PluginLifecycleManager:
    """Manages plugin lifecycle events"""
    
    def __init__(self):
        self.installation_service = InstallationService()
    
    async def on_load(self):
        """Called when plugin is loaded"""
        decky.logger.info("Lossless Scaling loaded!")
    
    async def on_unload(self):
        """Called when plugin is unloaded"""
        decky.logger.info("Lossless Scaling unloading")
    
    async def on_uninstall(self):
        """Called when plugin is uninstalled"""
        decky.logger.info("Lossless Scaling uninstalled - starting cleanup")
        
        # Clean up lsfg-vk files when the plugin is uninstalled
        self.installation_service.cleanup_on_uninstall()
        
        decky.logger.info("Lossless Scaling uninstall cleanup completed")
    
    async def on_migration(self):
        """Called during plugin migration"""
        decky.logger.info("Migrating")
        # Here's a migration example for logs:
        # - `~/.config/decky-template/template.log` will be migrated to `decky.decky_LOG_DIR/template.log`
        decky.migrate_logs(os.path.join(decky.DECKY_USER_HOME,
                                               ".config", "decky-template", "template.log"))
        # Here's a migration example for settings:
        # - `~/homebrew/settings/template.json` is migrated to `decky.decky_SETTINGS_DIR/template.json`
        # - `~/.config/decky-template/` all files and directories under this root are migrated to `decky.decky_SETTINGS_DIR/`
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "template.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-template"))
        # Here's a migration example for runtime data:
        # - `~/homebrew/template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        # - `~/.local/share/decky-template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "template"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-template"))
