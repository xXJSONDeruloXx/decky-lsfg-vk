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
        "enable_wsi": "ENABLE_GAMESCOPE_WSI"
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


def generate_function_signature() -> str:
    """Generate function signature for update_config and create_config_from_args"""
    params = []
    
    for field_name, field_def in CONFIG_SCHEMA_DEF.items():
        python_type = get_python_type(ConfigFieldType(field_def["fieldType"]))
        default = field_def["default"]
        
        # Format default value
        if isinstance(default, str):
            default_str = f'"{default}"'
        elif isinstance(default, bool):
            default_str = str(default)
        else:
            default_str = str(default)
            
        params.append(f"{field_name}: {python_type} = {default_str}")
    
    return ",\n                     ".join(params)


def generate_config_dict_creation() -> str:
    """Generate dictionary creation for create_config_from_args"""
    lines = ["    return cast(ConfigurationData, {"]
    
    for field_name in CONFIG_SCHEMA_DEF.keys():
        lines.append(f'        "{field_name}": kwargs.get("{field_name}"),')
    
    lines.append("    })")
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
                # Special case: ENABLE_GAMESCOPE_WSI=0 means enable_wsi=False
                lines.append(f'                    elif key == "{env_var}":')
                lines.append(f'                        script_values["{field_name}"] = value != "0"')
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
                # Special case: enable_wsi=False should export ENABLE_GAMESCOPE_WSI=0
                lines.append(f'        if not config.get("{field_name}", False):')
                lines.append(f'            lines.append("export {env_var}=0")')
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


def generate_log_statement() -> str:
    """Generate logging statement with all field values"""
    field_parts = []
    
    for field_name in CONFIG_SCHEMA_DEF.keys():
        field_parts.append(f"{field_name}={{{field_name}}}")
    
    log_format = ", ".join(field_parts)
    return f'            self.log.info(f"Updated lsfg TOML configuration: {log_format}")'


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
        'from typing import TypedDict, Dict, Any, Union, cast',
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
        'def get_function_parameters() -> str:',
        '    """Return function signature parameters"""',
        f'    return """{generate_function_signature()}"""',
        '',
        '',
        'def create_config_dict(**kwargs) -> ConfigurationData:',
        '    """Create configuration dictionary from keyword arguments"""',
        f'{generate_config_dict_creation().replace("        return cast(ConfigurationData, {", "    return cast(ConfigurationData, {").replace("        })", "    })")}',
        '',
        '',
        '# Field lists for dynamic operations',
        f'TOML_FIELDS = {[name for name, field in CONFIG_SCHEMA_DEF.items() if field.get("location") == "toml"]}',
        f'SCRIPT_FIELDS = {[name for name, field in CONFIG_SCHEMA_DEF.items() if field.get("location") == "script"]}',
        f'ALL_FIELDS = {list(CONFIG_SCHEMA_DEF.keys())}',
        ''
    ]
    
    return '\n'.join(lines)


def generate_complete_configuration_helpers() -> str:
    """Generate configuration_helpers_generated.py file"""
    
    # Generate the log format string using config parameter
    log_parts = []
    for field_name in CONFIG_SCHEMA_DEF.keys():
        log_parts.append(f"{field_name}={{config['{field_name}']}}")
    log_format = ", ".join(log_parts)
    
    lines = [
        '"""',
        'Auto-generated configuration helper functions from shared_config.py',
        'DO NOT EDIT THIS FILE MANUALLY - it will be overwritten on build',
        '"""',
        '',
        'from typing import Dict, Any',
        'from .config_schema_generated import ConfigurationData, ALL_FIELDS',
        '',
        '',
        'def log_configuration_update(logger, config: ConfigurationData) -> None:',
        '    """Log configuration update with all field values"""',
        f'    logger.info(f"Updated lsfg TOML configuration: {log_format}")',
        '',
        '',
        'def get_config_field_names() -> list[str]:',
        '    """Get all configuration field names"""',
        '    return ALL_FIELDS.copy()',
        '',
        '',
        'def extract_config_values(config: ConfigurationData) -> Dict[str, Any]:',
        '    """Extract configuration values as a dictionary"""',
        '    return {field: config[field] for field in ALL_FIELDS}',
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
        print(f"✅ Generated {schema_file.relative_to(project_root)}")
        
        # Generate configuration helpers
        helpers_content = generate_complete_configuration_helpers()
        helpers_file = target_dir / "configuration_helpers_generated.py"
        helpers_file.write_text(helpers_content)
        print(f"✅ Generated {helpers_file.relative_to(project_root)}")
        
        print(f"\n🎯 Ready-to-use files generated!")
        print("   Import these in your main files:")
        print("   - from .config_schema_generated import ConfigurationData, get_script_parsing_logic, etc.")
        print("   - from .configuration_helpers_generated import log_configuration_update, etc.")
        
    except Exception as e:
        print(f"❌ Error generating Python files: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
