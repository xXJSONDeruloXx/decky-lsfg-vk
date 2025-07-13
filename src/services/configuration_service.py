import os
from typing import Dict, Any
import decky


class ConfigurationService:
    """Service for managing lsfg script configuration"""
    
    def __init__(self):
        self.user_home = os.path.expanduser("~")
        self.lsfg_script_path = os.path.join(self.user_home, "lsfg")
    
    async def get_config(self) -> Dict[str, Any]:
        """Read current lsfg script configuration"""
        try:
            if not os.path.exists(self.lsfg_script_path):
                return {
                    "success": False,
                    "error": "lsfg script not found"
                }
            
            with open(self.lsfg_script_path, 'r') as f:
                content = f.read()
            
            # Parse the script content to extract current values
            config = {
                "enable_lsfg": False,
                "multiplier": 2,
                "flow_scale": 1.0,
                "hdr": False,
                "perf_mode": False,
                "immediate_mode": False
            }
            
            lines = content.split('\n')
            for line in lines:
                line = line.strip()
                
                # Handle ENABLE_LSFG - check if it's commented out or not
                if line.startswith('export ENABLE_LSFG='):
                    try:
                        value = line.split('=')[1].strip()
                        config["enable_lsfg"] = value == '1'
                    except:
                        pass
                elif line.startswith('# export ENABLE_LSFG='):
                    config["enable_lsfg"] = False
                
                # Handle LSFG_MULTIPLIER
                elif line.startswith('export LSFG_MULTIPLIER='):
                    try:
                        value = line.split('=')[1].strip()
                        config["multiplier"] = int(value)
                    except:
                        pass
                
                # Handle LSFG_FLOW_SCALE
                elif line.startswith('export LSFG_FLOW_SCALE='):
                    try:
                        value = line.split('=')[1].strip()
                        config["flow_scale"] = float(value)
                    except:
                        pass
                
                # Handle LSFG_HDR - check if it's commented out or not
                elif line.startswith('export LSFG_HDR='):
                    try:
                        value = line.split('=')[1].strip()
                        config["hdr"] = value == '1'
                    except:
                        pass
                elif line.startswith('# export LSFG_HDR='):
                    config["hdr"] = False
                
                # Handle LSFG_PERF_MODE - check if it's commented out or not
                elif line.startswith('export LSFG_PERF_MODE='):
                    try:
                        value = line.split('=')[1].strip()
                        config["perf_mode"] = value == '1'
                    except:
                        pass
                elif line.startswith('# export LSFG_PERF_MODE='):
                    config["perf_mode"] = False
                
                # Handle MESA_VK_WSI_PRESENT_MODE - check if it's commented out or not
                elif line.startswith('export MESA_VK_WSI_PRESENT_MODE='):
                    try:
                        value = line.split('=')[1].strip()
                        # Remove any comments after the value
                        value = value.split('#')[0].strip()
                        config["immediate_mode"] = value == 'immediate'
                    except:
                        pass
                elif line.startswith('# export MESA_VK_WSI_PRESENT_MODE='):
                    config["immediate_mode"] = False
            
            decky.logger.info(f"Parsed lsfg config: {config}")
            
            return {
                "success": True,
                "config": config
            }
            
        except Exception as e:
            decky.logger.error(f"Error reading lsfg config: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def update_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                          hdr: bool, perf_mode: bool, immediate_mode: bool) -> Dict[str, Any]:
        """Update lsfg script configuration"""
        try:
            # Create script content based on parameters
            script_content = "#!/bin/bash\n\n"
            
            if enable_lsfg:
                script_content += "export ENABLE_LSFG=1\n"
            else:
                script_content += "# export ENABLE_LSFG=1\n"
            
            script_content += f"export LSFG_MULTIPLIER={multiplier}\n"
            script_content += f"export LSFG_FLOW_SCALE={flow_scale}\n"
            
            if hdr:
                script_content += "export LSFG_HDR=1\n"
            else:
                script_content += "# export LSFG_HDR=1\n"
            
            if perf_mode:
                script_content += "export LSFG_PERF_MODE=1\n"
            else:
                script_content += "# export LSFG_PERF_MODE=1\n"
            
            if immediate_mode:
                script_content += "export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync\n"
            else:
                script_content += "# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync\n"
            
            # Add the exec line to allow the script to execute passed commands
            script_content += "\n# Execute the passed command with the environment variables set\n"
            script_content += "exec \"$@\"\n"
            
            # Write the updated script
            with open(self.lsfg_script_path, 'w') as f:
                f.write(script_content)
            
            # Make sure it's executable
            os.chmod(self.lsfg_script_path, 0o755)
            
            decky.logger.info(f"Updated lsfg script configuration: enable={enable_lsfg}, multiplier={multiplier}, flow_scale={flow_scale}, hdr={hdr}, perf_mode={perf_mode}, immediate_mode={immediate_mode}")
            
            return {
                "success": True,
                "message": "lsfg configuration updated successfully"
            }
            
        except Exception as e:
            decky.logger.error(f"Error updating lsfg config: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
