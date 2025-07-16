"""
Configuration service for lsfg script management.
"""

import re
from pathlib import Path
from typing import Dict, Any

from .base_service import BaseService
from .config_schema import ConfigurationManager, ConfigurationData, CONFIG_SCHEMA
from .types import ConfigurationResponse


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
        # Start with defaults
        config = ConfigurationManager.get_defaults()
        
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
            
            # Parse DXVK_FRAME_RATE
            elif match := re.match(r'^(#\s*)?export\s+DXVK_FRAME_RATE=(\d+)', line):
                if not bool(match.group(1)):  # Not commented out
                    try:
                        config["frame_cap"] = int(match.group(2))
                    except ValueError:
                        pass
                else:
                    # If it's commented out, frame cap is disabled (0)
                    config["frame_cap"] = 0
        
        return config
    
    def update_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                     hdr: bool, perf_mode: bool, immediate_mode: bool, disable_vkbasalt: bool, frame_cap: int) -> ConfigurationResponse:
        """Update lsfg script configuration
        
        Args:
            enable_lsfg: Whether to enable LSFG
            multiplier: LSFG multiplier value
            flow_scale: LSFG flow scale value
            hdr: Whether to enable HDR
            perf_mode: Whether to enable performance mode
            immediate_mode: Whether to enable immediate present mode (disable vsync)
            disable_vkbasalt: Whether to disable vkbasalt layer
            frame_cap: Frame rate cap value (0-60, 0 = disabled)
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
            # Create configuration from individual arguments
            config = ConfigurationManager.create_config_from_args(
                enable_lsfg, multiplier, flow_scale, hdr, perf_mode, immediate_mode, disable_vkbasalt, frame_cap
            )
            
            # Generate script content using centralized manager
            script_content = ConfigurationManager.generate_script_content(config)
            
            # Write the updated script atomically
            self._atomic_write(self.lsfg_script_path, script_content, 0o755)
            
            self.log.info(f"Updated lsfg script configuration: enable_lsfg={enable_lsfg}, "
                         f"multiplier={multiplier}, flow_scale={flow_scale}, hdr={hdr}, "
                         f"perf_mode={perf_mode}, immediate_mode={immediate_mode}, "
                         f"disable_vkbasalt={disable_vkbasalt}, frame_cap={frame_cap}")
            
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
        except ValueError as e:
            error_msg = f"Invalid configuration arguments: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False,
                "config": None,
                "message": None,
                "error": str(e)
            }
