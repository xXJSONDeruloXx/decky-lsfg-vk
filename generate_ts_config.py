#!/usr/bin/env python3
"""
Generate TypeScript configuration constants from shared Python config.
This script is run during development to sync the schemas.
"""

import sys
from pathlib import Path

# Add the parent directory to Python path to import shared_config
sys.path.insert(0, str(Path(__file__).parent))

from shared_config import CONFIG_SCHEMA_DEF, ConfigFieldType, get_field_names, get_defaults, get_field_types


def generate_typescript_config():
    """Generate TypeScript configuration constants"""
    
    ts_content = '''/**
 * Auto-generated TypeScript configuration schema.
 * DO NOT EDIT MANUALLY - Generated from shared_config.py
 * 
 * To update this file, run: python3 generate_ts_config.py > src/config/generatedConfigSchema.ts
 */

// Configuration field type enum - matches Python
export enum ConfigFieldType {
  BOOLEAN = "boolean",
  INTEGER = "integer",
  FLOAT = "float",
  STRING = "string"
}

// Configuration field definition
export interface ConfigField {
  name: string;
  fieldType: ConfigFieldType;
  default: boolean | number | string;
  description: string;
}

// Configuration schema - auto-generated from Python
export const CONFIG_SCHEMA: Record<string, ConfigField> = {
'''
    
    # Generate each field
    for field_name, field_def in CONFIG_SCHEMA_DEF.items():
        field_type = field_def["fieldType"]
        default_value = field_def["default"]
        
        # Format default value for TypeScript
        if field_type == "string":
            default_str = f'"{default_value}"'
        elif field_type == "boolean":
            default_str = "true" if default_value else "false"
        else:
            default_str = str(default_value)
        
        ts_content += f'''  {field_name}: {{
    name: "{field_def["name"]}",
    fieldType: ConfigFieldType.{field_type.upper()},
    default: {default_str},
    description: "{field_def["description"]}"
  }},
'''
    
    ts_content += '''};

// Type-safe configuration data structure
export interface ConfigurationData {
'''
    
    # Generate interface fields
    for field_name, field_def in CONFIG_SCHEMA_DEF.items():
        field_type = field_def["fieldType"]
        
        # Map Python types to TypeScript types
        ts_type_map = {
            "string": "string",
            "boolean": "boolean", 
            "integer": "number",
            "float": "number"
        }
        
        ts_type = ts_type_map[field_type]
        ts_content += f'  {field_name}: {ts_type};\n'
    
    ts_content += '''}

// Helper functions
export function getFieldNames(): string[] {
  return Object.keys(CONFIG_SCHEMA);
}

export function getDefaults(): ConfigurationData {
  return {
'''
    
    # Generate defaults object
    for field_name, field_def in CONFIG_SCHEMA_DEF.items():
        default_value = field_def["default"]
        field_type = field_def["fieldType"]
        
        if field_type == "string":
            default_str = f'"{default_value}"'
        elif field_type == "boolean":
            default_str = "true" if default_value else "false"
        else:
            default_str = str(default_value)
            
        ts_content += f'    {field_name}: {default_str},\n'
    
    ts_content += '''  };
}

export function getFieldTypes(): Record<string, ConfigFieldType> {
  return {
'''
    
    # Generate field types object
    for field_name, field_def in CONFIG_SCHEMA_DEF.items():
        ts_content += f'    {field_name}: ConfigFieldType.{field_def["fieldType"].upper()},\n'
    
    ts_content += '''  };
}
'''
    
    return ts_content


if __name__ == "__main__":
    print(generate_typescript_config())
