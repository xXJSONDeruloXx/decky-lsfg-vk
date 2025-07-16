"""
Configuration service for lsfg script management.
"""

import re
from pathlib import Path
from typing import Dict, Any

from .base_service import BaseService
from .constants import LSFG_SCRIPT_TEMPLATE
from .types import ConfigurationResponse, ConfigurationData


class ConfigurationService(BaseService):
    """Service for managing lsfg script configuration"""
    
    def get_config(self) -> ConfigurationResponse:
        """Read current lsfg script configuration
        
        Returns:
            ConfigurationResponse with current configuration or error
        """
        try:
            if not self.lsfg_script_path.exists():
                return {
                    "success": False,
                    "config": None,
                    "message": None,
                    "error": "lsfg script not found"
                }
            
            content = self.lsfg_script_path.read_text()
            config = self._parse_script_content(content)
            
            self.log.info(f"Parsed lsfg config: {config}")
            
            return {
                "success": True,
                "config": config,
                "message": None,
                "error": None
            }
            
        except (OSError, IOError) as e:
            error_msg = f"Error reading lsfg config: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False,
                "config": None,
                "message": None,
                "error": str(e)
            }
    
    def _parse_script_content(self, content: str) -> ConfigurationData:
        """Parse script content to extract configuration values
        
        Args:
            content: Script file content
            
        Returns:
            ConfigurationData with parsed values
        """
        config: ConfigurationData = {
            "enable_lsfg": False,
            "multiplier": 2,
            "flow_scale": 1.0,
            "hdr": False,
            "perf_mode": False,
            "immediate_mode": False,
            "disable_vkbasalt": False
        }
        
        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            
            # Parse ENABLE_LSFG
            if match := re.match(r'^(#\s*)?export\s+ENABLE_LSFG=(\d+)', line):
                config["enable_lsfg"] = not bool(match.group(1)) and match.group(2) == '1'
            
            # Parse LSFG_MULTIPLIER
            elif match := re.match(r'^export\s+LSFG_MULTIPLIER=(\d+)', line):
                try:
                    config["multiplier"] = int(match.group(1))
                except ValueError:
                    pass
            
            # Parse LSFG_FLOW_SCALE
            elif match := re.match(r'^export\s+LSFG_FLOW_SCALE=([0-9]*\.?[0-9]+)', line):
                try:
                    config["flow_scale"] = float(match.group(1))
                except ValueError:
                    pass
            
            # Parse LSFG_HDR
            elif match := re.match(r'^(#\s*)?export\s+LSFG_HDR=(\d+)', line):
                config["hdr"] = not bool(match.group(1)) and match.group(2) == '1'
            
            # Parse LSFG_PERF_MODE
            elif match := re.match(r'^(#\s*)?export\s+LSFG_PERF_MODE=(\d+)', line):
                config["perf_mode"] = not bool(match.group(1)) and match.group(2) == '1'
            
            # Parse MESA_VK_WSI_PRESENT_MODE
            elif match := re.match(r'^(#\s*)?export\s+MESA_VK_WSI_PRESENT_MODE=([^\s#]+)', line):
                config["immediate_mode"] = not bool(match.group(1)) and match.group(2) == 'immediate'
            
            # Parse DISABLE_VKBASALT
            elif match := re.match(r'^(#\s*)?export\s+DISABLE_VKBASALT=(\d+)', line):
                config["disable_vkbasalt"] = not bool(match.group(1)) and match.group(2) == '1'
        
        return config
    
    def update_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                     hdr: bool, perf_mode: bool, immediate_mode: bool, disable_vkbasalt: bool) -> ConfigurationResponse:
        """Update lsfg script configuration
        
        Args:
            enable_lsfg: Whether to enable LSFG
            multiplier: LSFG multiplier value
            flow_scale: LSFG flow scale value
            hdr: Whether to enable HDR
            perf_mode: Whether to enable performance mode
            immediate_mode: Whether to enable immediate present mode (disable vsync)
            disable_vkbasalt: Whether to disable vkbasalt layer
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
            # Generate script content using template
            script_content = self._generate_script_content(
                enable_lsfg, multiplier, flow_scale, hdr, perf_mode, immediate_mode, disable_vkbasalt
            )
            
            # Write the updated script atomically
            self._atomic_write(self.lsfg_script_path, script_content, 0o755)
            
            self.log.info(f"Updated lsfg script configuration: enable={enable_lsfg}, "
                         f"multiplier={multiplier}, flow_scale={flow_scale}, hdr={hdr}, "
                         f"perf_mode={perf_mode}, immediate_mode={immediate_mode}, "
                         f"disable_vkbasalt={disable_vkbasalt}")
            
            return {
                "success": True,
                "config": None,
                "message": "lsfg configuration updated successfully",
                "error": None
            }
            
        except (OSError, IOError) as e:
            error_msg = f"Error updating lsfg config: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False,
                "config": None,
                "message": None,
                "error": str(e)
            }
    
    def _generate_script_content(self, enable_lsfg: bool, multiplier: int, flow_scale: float,
                               hdr: bool, perf_mode: bool, immediate_mode: bool, disable_vkbasalt: bool) -> str:
        """Generate script content from configuration parameters
        
        Args:
            enable_lsfg: Whether to enable LSFG
            multiplier: LSFG multiplier value
            flow_scale: LSFG flow scale value
            hdr: Whether to enable HDR
            perf_mode: Whether to enable performance mode
            immediate_mode: Whether to enable immediate present mode
            disable_vkbasalt: Whether to disable vkbasalt layer
            
        Returns:
            Generated script content
        """
        return LSFG_SCRIPT_TEMPLATE.format(
            enable_lsfg="export ENABLE_LSFG=1" if enable_lsfg else "# export ENABLE_LSFG=1",
            multiplier=multiplier,
            flow_scale=flow_scale,
            hdr="export LSFG_HDR=1" if hdr else "# export LSFG_HDR=1",
            perf_mode="export LSFG_PERF_MODE=1" if perf_mode else "# export LSFG_PERF_MODE=1",
            immediate_mode="export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync" if immediate_mode else "# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync",
            disable_vkbasalt="export DISABLE_VKBASALT=1" if disable_vkbasalt else "# export DISABLE_VKBASALT=1"
        )
