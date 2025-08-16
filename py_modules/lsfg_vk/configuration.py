"""
Configuration service for TOML-based lsfg configuration management with profile support.
"""

from __future__ import annotations

import re
import tomllib
from typing import Dict, Any, Tuple, List

from .base_service import BaseService
from .config_schema import ConfigurationManager, CONFIG_SCHEMA, SCRIPT_ONLY_FIELDS, COMPLETE_CONFIG_SCHEMA
from .config_schema_generated import ConfigurationData, get_script_generation_logic
from .types import ConfigurationResponse

DEFAULT_PROFILE = "decky-lsfg-vk"

class ConfigurationService(BaseService):
    """Service for managing TOML-based lsfg configuration with profiles"""

    # ------------------------------------------------------------------
    # Helpers for reading/writing full configuration
    # ------------------------------------------------------------------
    def _read_full_config(self) -> Tuple[Dict[str, Any], Dict[str, ConfigurationData]]:
        """Read the entire TOML configuration file.

        Returns:
            Tuple of (global_config, profiles_dict)
        """
        defaults = ConfigurationManager.get_defaults()
        global_config = {
            "dll": defaults["dll"],
            "no_fp16": defaults["no_fp16"],
        }
        profile_defaults = defaults

        profiles: Dict[str, ConfigurationData] = {}

        if self.config_file_path.exists():
            content = self.config_file_path.read_bytes()
            try:
                data = tomllib.loads(content.decode("utf-8"))
                g = data.get("global", {})
                global_config["dll"] = g.get("dll", global_config["dll"])
                global_config["no_fp16"] = g.get("no_fp16", global_config["no_fp16"])
                games = data.get("game", [])
                for game in games:
                    exe = game.get("exe")
                    if not exe:
                        continue
                    cfg = ConfigurationManager.get_defaults()
                    # overlay game values for all known fields
                    for field in COMPLETE_CONFIG_SCHEMA.keys():
                        if field in ("dll", "no_fp16"):
                            continue
                        if field in game:
                            cfg[field] = game[field]
                    # apply globals
                    cfg["dll"] = global_config["dll"]
                    cfg["no_fp16"] = global_config["no_fp16"]
                    profiles[exe] = cfg
            except Exception:
                pass

        if not profiles:
            defaults = ConfigurationManager.get_defaults()
            profiles[DEFAULT_PROFILE] = defaults

        return global_config, profiles

    def _write_full_config(self, global_cfg: Dict[str, Any], profiles: Dict[str, ConfigurationData]) -> None:
        """Write the full configuration (globals + profiles) to TOML file."""
        lines: List[str] = ["version = 1", "", "[global]"]
        lines.append(f'# specify where Lossless.dll is stored')
        lines.append(f'dll = "{global_cfg.get("dll", "")}"')
        lines.append(f"# force-disable fp16 (use on older nvidia cards)")
        lines.append(f"no_fp16 = {str(global_cfg.get('no_fp16', False)).lower()}")
        lines.append("")

        for name, cfg in profiles.items():
            lines.append("[[game]]")
            lines.append(f"exe = \"{name}\"")
            lines.append("")
            for field_name, field_def in CONFIG_SCHEMA.items():
                if field_name in ("dll", "no_fp16"):
                    continue
                value = cfg.get(field_name, field_def.default)
                if isinstance(value, bool):
                    lines.append(f"{field_name} = {str(value).lower()}")
                elif isinstance(value, str):
                    lines.append(f'{field_name} = "{value}"')
                else:
                    lines.append(f"{field_name} = {value}")
                lines.append("")
            for field_name, field_def in SCRIPT_ONLY_FIELDS.items():
                value = cfg.get(field_name, field_def.default)
                if isinstance(value, bool):
                    lines.append(f"{field_name} = {str(value).lower()}")
                elif isinstance(value, str):
                    lines.append(f'{field_name} = "{value}"')
                else:
                    lines.append(f"{field_name} = {value}")
                lines.append("")
        content = "\n".join(lines)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self._write_file(self.config_file_path, content, 0o644)

    def _get_current_profile(self) -> str:
        profile = DEFAULT_PROFILE
        if self.lsfg_script_path.exists():
            try:
                script_content = self.lsfg_script_path.read_text(encoding="utf-8")
                match = re.search(r"export LSFG_PROCESS=(\S+)", script_content)
                if match:
                    profile = match.group(1).strip()
            except Exception:
                pass
        return profile

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------
    def get_config(self) -> ConfigurationResponse:
        try:
            global_cfg, profiles = self._read_full_config()
            current_profile = self._get_current_profile()
            if current_profile not in profiles:
                profiles[current_profile] = ConfigurationManager.get_defaults()

            cfg = profiles[current_profile]

            # overlay script values for current profile
            script_values: Dict[str, Any] = {}
            if self.lsfg_script_path.exists():
                try:
                    script_content = self.lsfg_script_path.read_text(encoding="utf-8")
                    script_values = ConfigurationManager.parse_script_content(script_content)
                    for k, v in script_values.items():
                        cfg[k] = v
                except Exception:
                    pass

            cfg["dll"] = global_cfg.get("dll", cfg.get("dll"))
            cfg["no_fp16"] = global_cfg.get("no_fp16", cfg.get("no_fp16"))

            return self._success_response(
                ConfigurationResponse,
                config=cfg,
                profiles=list(profiles.keys()),
                current_profile=current_profile,
            )
        except Exception as e:
            self.log.error(f"Error reading lsfg config: {e}")
            return self._error_response(ConfigurationResponse, str(e), config=None, profiles=None, current_profile=None)

    def update_config_for_profile(self, profile: str, config: ConfigurationData) -> ConfigurationResponse:
        try:
            global_cfg, profiles = self._read_full_config()
            global_cfg["dll"] = config.get("dll", global_cfg.get("dll"))
            global_cfg["no_fp16"] = config.get("no_fp16", global_cfg.get("no_fp16"))
            profiles[profile] = config
            self._write_full_config(global_cfg, profiles)
            script_result = self.update_lsfg_script(config, profile)
            if not script_result["success"]:
                self.log.warning(f"Failed to update launch script: {script_result['error']}")
            return self._success_response(
                ConfigurationResponse,
                "lsfg configuration updated successfully",
                config=config,
                profiles=list(profiles.keys()),
                current_profile=profile,
            )
        except Exception as e:
            self.log.error(f"Error updating lsfg config: {e}")
            return self._error_response(ConfigurationResponse, str(e), config=None, profiles=None, current_profile=profile)

    def create_profile(self, profile: str) -> ConfigurationResponse:
        try:
            global_cfg, profiles = self._read_full_config()
            if profile in profiles:
                return self._error_response(ConfigurationResponse, f"Profile {profile} already exists", config=None, profiles=list(profiles.keys()), current_profile=self._get_current_profile())
            cfg = ConfigurationManager.get_defaults()
            cfg["dll"] = global_cfg.get("dll", cfg.get("dll"))
            cfg["no_fp16"] = global_cfg.get("no_fp16", cfg.get("no_fp16"))
            profiles[profile] = cfg
            self._write_full_config(global_cfg, profiles)
            self.update_lsfg_script(cfg, profile)
            return self._success_response(ConfigurationResponse, "profile created", config=cfg, profiles=list(profiles.keys()), current_profile=profile)
        except Exception as e:
            self.log.error(f"Error creating profile: {e}")
            return self._error_response(ConfigurationResponse, str(e), config=None, profiles=None, current_profile=None)

    def set_current_profile(self, profile: str) -> ConfigurationResponse:
        try:
            global_cfg, profiles = self._read_full_config()
            if profile not in profiles:
                return self._error_response(ConfigurationResponse, f"Profile {profile} not found", config=None, profiles=list(profiles.keys()), current_profile=None)
            cfg = profiles[profile]
            self.update_lsfg_script(cfg, profile)
            return self._success_response(ConfigurationResponse, config=cfg, profiles=list(profiles.keys()), current_profile=profile)
        except Exception as e:
            self.log.error(f"Error setting profile: {e}")
            return self._error_response(ConfigurationResponse, str(e), config=None, profiles=None, current_profile=None)

    def update_dll_path(self, dll_path: str) -> ConfigurationResponse:
        try:
            global_cfg, profiles = self._read_full_config()
            global_cfg["dll"] = dll_path
            self._write_full_config(global_cfg, profiles)
            current = self._get_current_profile()
            cfg = profiles.get(current, ConfigurationManager.get_defaults())
            cfg["dll"] = dll_path
            self.update_lsfg_script(cfg, current)
            return self._success_response(ConfigurationResponse, f"DLL path updated to: {dll_path}", config=cfg, profiles=list(profiles.keys()), current_profile=current)
        except Exception as e:
            self.log.error(f"Error updating DLL path: {e}")
            return self._error_response(ConfigurationResponse, str(e), config=None, profiles=None, current_profile=None)

    def update_lsfg_script(self, config: ConfigurationData, profile: str) -> ConfigurationResponse:
        try:
            script_content = self._generate_script_content(config, profile)
            self._write_file(self.lsfg_script_path, script_content, 0o755)
            return self._success_response(ConfigurationResponse, "Launch script updated successfully", config=config)
        except Exception as e:
            return self._error_response(ConfigurationResponse, str(e), config=None)

    def _generate_script_content(self, config: ConfigurationData, profile: str) -> str:
        lines = [
            "#!/bin/bash",
            "# lsfg-vk launch script generated by decky-lossless-scaling-vk plugin",
            "# This script sets up the environment for lsfg-vk to work with the plugin configuration",
        ]
        generate_script_lines = get_script_generation_logic()
        lines.extend(generate_script_lines(config))
        lines.extend([
            f"export LSFG_PROCESS={profile}",
            'exec "$@"',
        ])
        return "\n".join(lines) + "\n"
