#!/usr/bin/env python3
"""
Generate Python boilerplate from shared_config.py

This script generates repetitive Python code patterns from the canonical schema,
reducing manual maintenance when adding/removing configuration fields.
"""

import sys
from pathlib import Path

# Add project root to path to import shared_config
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from shared_config import CONFIG_SCHEMA_DEF, ConfigFieldType


def get_python_type(field_type: ConfigFieldType) -> str:
    """Convert ConfigFieldType to Python type annotation"""
    type_map = {
        ConfigFieldType.BOOLEAN: "bool",
        ConfigFieldType.INTEGER: "int", 
        ConfigFieldType.FLOAT: "float",
        ConfigFieldType.STRING: "str"
    }
    return type_map.get(field_type, "Any")


def get_env_var_name(field_name: str) -> str:
    """Convert field name to environment variable name"""
    env_map = {
        "dxvk_frame_rate": "DXVK_FRAME_RATE",
        "enable_wow64": "PROTON_USE_WOW64", 
        "disable_steamdeck_mode": "SteamDeck",
        "mangohud_workaround": "MANGOHUD",
        "disable_vkbasalt": "DISABLE_VKBASALT",
        "force_enable_vkbasalt": "ENABLE_VKBASALT",
        "enable_wsi": "ENABLE_GAMESCOPE_WSI",
        "enable_zink": "ZINK_ENABLE"
    }
    return env_map.get(field_name, field_name.upper())


def generate_typed_dict() -> str:
    """Generate ConfigurationData TypedDict"""
    lines = [
        "class ConfigurationData(TypedDict):",
        "    \"\"\"Type-safe configuration data structure - AUTO-GENERATED\"\"\""
    ]
    
    for field_name, field_def in CONFIG_SCHEMA_DEF.items():
        python_type = get_python_type(ConfigFieldType(field_def["fieldType"]))
        lines.append(f"    {field_name}: {python_type}")
    
    return "\n".join(lines)


def generate_script_parsing() -> str:
    """Generate script content parsing logic"""
    lines = []
    
    script_fields = [
        (field_name, field_def) 
        for field_name, field_def in CONFIG_SCHEMA_DEF.items()
        if field_def.get("location") == "script"
    ]
    
    for field_name, field_def in script_fields:
        env_var = get_env_var_name(field_name)
        field_type = ConfigFieldType(field_def["fieldType"])
        
        if field_type == ConfigFieldType.BOOLEAN:
            if field_name == "disable_steamdeck_mode":
                # Special case: SteamDeck=0 means disable_steamdeck_mode=True
                lines.append(f'                    elif key == "{env_var}":')
                lines.append(f'                        script_values["{field_name}"] = value == "0"')
            elif field_name == "enable_wsi":
                # Special case: ENABLE_GAMESCOPE_WSI=0 or DXVK_HDR=0 means enable_wsi=False
                lines.append(f'                    elif key == "{env_var}":')
                lines.append(f'                        script_values["{field_name}"] = value != "0"')
                lines.append(f'                    elif key == "DXVK_HDR":')
                lines.append(f'                        script_values["{field_name}"] = value != "0"')
            elif field_name == "enable_zink":
                # Special case: Zink uses multiple environment variables
                lines.append(f'                    elif key == "__GLX_VENDOR_LIBRARY_NAME" and value == "mesa":')
                lines.append(f'                        script_values["{field_name}"] = True')
                lines.append(f'                    elif key == "MESA_LOADER_DRIVER_OVERRIDE" and value == "zink":')
                lines.append(f'                        script_values["{field_name}"] = True')
                lines.append(f'                    elif key == "GALLIUM_DRIVER" and value == "zink":')
                lines.append(f'                        script_values["{field_name}"] = True')
            else:
                lines.append(f'                    elif key == "{env_var}":')
                lines.append(f'                        script_values["{field_name}"] = value == "1"')
        elif field_type == ConfigFieldType.INTEGER:
            lines.append(f'                    elif key == "{env_var}":')
            lines.append('                        try:')
            lines.append(f'                            script_values["{field_name}"] = int(value)')
            lines.append('                        except ValueError:')
            lines.append('                            pass')
        elif field_type == ConfigFieldType.FLOAT:
            lines.append(f'                    elif key == "{env_var}":')
            lines.append('                        try:')
            lines.append(f'                            script_values["{field_name}"] = float(value)')
            lines.append('                        except ValueError:')
            lines.append('                            pass')
        elif field_type == ConfigFieldType.STRING:
            lines.append(f'                    elif key == "{env_var}":')
            lines.append(f'                        script_values["{field_name}"] = value')
    
    return "\n".join(lines)


def generate_script_generation() -> str:
    """Generate script content generation logic"""
    lines = []
    
    script_fields = [
        (field_name, field_def)
        for field_name, field_def in CONFIG_SCHEMA_DEF.items() 
        if field_def.get("location") == "script"
    ]
    
    for field_name, field_def in script_fields:
        env_var = get_env_var_name(field_name)
        field_type = ConfigFieldType(field_def["fieldType"])
        
        if field_type == ConfigFieldType.BOOLEAN:
            if field_name == "disable_steamdeck_mode":
                # Special case: disable_steamdeck_mode=True should export SteamDeck=0
                lines.append(f'        if config.get("{field_name}", False):')
                lines.append(f'            lines.append("export {env_var}=0")')
            elif field_name == "enable_wsi":
                # Special case: enable_wsi=False should export ENABLE_GAMESCOPE_WSI=0 and DXVK_HDR=0
                lines.append(f'        if not config.get("{field_name}", False):')
                lines.append(f'            lines.append("export {env_var}=0")')
                lines.append(f'            lines.append("export DXVK_HDR=0")')
            elif field_name == "enable_zink":
                # Special case: enable_zink=True should export multiple Zink environment variables
                lines.append(f'        if config.get("{field_name}", False):')
                lines.append(f'            lines.append("export __GLX_VENDOR_LIBRARY_NAME=mesa")')
                lines.append(f'            lines.append("export MESA_LOADER_DRIVER_OVERRIDE=zink")')
                lines.append(f'            lines.append("export GALLIUM_DRIVER=zink")')
            else:
                lines.append(f'        if config.get("{field_name}", False):')
                lines.append(f'            lines.append("export {env_var}=1")')
        elif field_type in [ConfigFieldType.INTEGER, ConfigFieldType.FLOAT]:
            default = field_def["default"]
            if field_name == "dxvk_frame_rate":
                # Special handling for DXVK_FRAME_RATE (only export if > 0)
                lines.append(f'        {field_name} = config.get("{field_name}", {default})')
                lines.append(f'        if {field_name} > 0:')
                lines.append(f'            lines.append(f"export {env_var}={{{field_name}}}")')
            else:
                lines.append(f'        {field_name} = config.get("{field_name}", {default})')
                lines.append(f'        if {field_name} != {default}:')
                lines.append(f'            lines.append(f"export {env_var}={{{field_name}}}")')
        elif field_type == ConfigFieldType.STRING:
            lines.append(f'        {field_name} = config.get("{field_name}", "")')
            lines.append(f'        if {field_name}:')
            lines.append(f'            lines.append(f"export {env_var}={{{field_name}}}")')
    
    return "\n".join(lines)


def generate_complete_schema_file() -> str:
    """Generate complete config_schema_generated.py file"""
    
    # Generate field name constants
    field_constants = []
    for field_name in CONFIG_SCHEMA_DEF.keys():
        const_name = field_name.upper()
        field_constants.append(f'{const_name} = "{field_name}"')
    
    lines = [
        '"""',
        'Auto-generated configuration schema components from shared_config.py',
        'DO NOT EDIT THIS FILE MANUALLY - it will be overwritten on build',
        '"""',
        '',
        'from typing import TypedDict, Dict, Any, Union',
        'from enum import Enum',
        'import sys',
        'from pathlib import Path',
        '',
        '# Import shared configuration constants',
        'sys.path.insert(0, str(Path(__file__).parent.parent.parent))',
        'from shared_config import CONFIG_SCHEMA_DEF, ConfigFieldType',
        '',
        '# Field name constants for type-safe access',
    ] + field_constants + [
        '',
        '',
        generate_typed_dict(),
        '',
        '',
        'def get_script_parsing_logic():',
        '    """Return the script parsing logic as a callable"""',
        '    def parse_script_values(lines):', 
        '        script_values = {}',
        '        for line in lines:',
        '            line = line.strip()',
        '            if not line or line.startswith("#") or not line.startswith("export "):',
        '                continue',
        '            if "=" in line:',
        '                export_line = line[len("export "):]', 
        '                key, value = export_line.split("=", 1)',
        '                key = key.strip()',
        '                value = value.strip()',
        '',
        '                # Auto-generated parsing logic:',
        f'{generate_script_parsing().replace("                    elif", "                if")}',
        '',
        '        return script_values',
        '    return parse_script_values',
        '',
        '',
        'def get_script_generation_logic():',
        '    """Return the script generation logic as a callable"""',
        '    def generate_script_lines(config):',
        '        lines = []',
        f'{generate_script_generation()}',
        '        return lines',
        '    return generate_script_lines',
        '',
        '',
        f'ALL_FIELDS = {list(CONFIG_SCHEMA_DEF.keys())}',
        ''
    ]
    
    return '\n'.join(lines)


def main():
    """Generate complete Python configuration files"""
    try:
        # Create generated files in py_modules/lsfg_vk/
        target_dir = project_root / "py_modules" / "lsfg_vk"

        # Generate the complete schema file
        schema_content = generate_complete_schema_file()
        schema_file = target_dir / "config_schema_generated.py"
        schema_file.write_text(schema_content)
        print(f"Generated {schema_file.relative_to(project_root)}")
        
    except Exception as e:
        print(f"❌ Error generating Python files: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
