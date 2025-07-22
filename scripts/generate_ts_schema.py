#!/usr/bin/env python3
"""
Generate TypeScript schema from Python shared_config.py

This script reads the canonical schema from shared_config.py and generates
the corresponding TypeScript files, ensuring single source of truth.
"""

import sys
from pathlib import Path

# Add project root to path to import shared_config
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from shared_config import CONFIG_SCHEMA_DEF, ConfigFieldType


def generate_typescript_schema():
    """Generate generatedConfigSchema.ts from Python schema"""
    
    # Generate enum
    enum_lines = [
        "// src/config/generatedConfigSchema.ts",
        "// Configuration field type enum - matches Python",
        "export enum ConfigFieldType {",
        "  BOOLEAN = \"boolean\",",
        "  INTEGER = \"integer\",", 
        "  FLOAT = \"float\",",
        "  STRING = \"string\"",
        "}",
        "",
        "// Configuration field definition",
        "export interface ConfigField {",
        "  name: string;",
        "  fieldType: ConfigFieldType;",
        "  default: boolean | number | string;",
        "  description: string;",
        "}",
        "",
        "// Configuration schema - auto-generated from Python",
        "export const CONFIG_SCHEMA: Record<string, ConfigField> = {"
    ]
    
    # Generate schema entries
    schema_entries = []
    interface_fields = []
    defaults_fields = []
    field_types = []
    
    for field_name, field_def in CONFIG_SCHEMA_DEF.items():
        # Schema entry
        default_value = field_def["default"]
        if isinstance(default_value, str):
            default_str = f'"{default_value}"'
        elif isinstance(default_value, bool):
            default_str = "true" if default_value else "false"
        else:
            default_str = str(default_value)
            
        schema_entries.append(f'  {field_name}: {{')
        schema_entries.append(f'    name: "{field_def["name"]}",')
        schema_entries.append(f'    fieldType: ConfigFieldType.{field_def["fieldType"].upper()},')
        schema_entries.append(f'    default: {default_str},')
        schema_entries.append(f'    description: "{field_def["description"]}"')
        schema_entries.append('  },')
        
        # Interface field
        if field_def["fieldType"] == ConfigFieldType.BOOLEAN:
            ts_type = "boolean"
        elif field_def["fieldType"] == ConfigFieldType.INTEGER:
            ts_type = "number"
        elif field_def["fieldType"] == ConfigFieldType.FLOAT:
            ts_type = "number"
        elif field_def["fieldType"] == ConfigFieldType.STRING:
            ts_type = "string"
        else:
            ts_type = "any"
            
        interface_fields.append(f'  {field_name}: {ts_type};')
        defaults_fields.append(f'    {field_name}: {default_str},')
        field_types.append(f'    {field_name}: ConfigFieldType.{field_def["fieldType"].upper()},')
    
    # Complete the file
    all_lines = enum_lines + schema_entries + [
        "};",
        "",
        "// Type-safe configuration data structure", 
        "export interface ConfigurationData {",
    ] + interface_fields + [
        "}",
        "",
        "// Helper functions",
        "export function getFieldNames(): string[] {",
        "  return Object.keys(CONFIG_SCHEMA);",
        "}",
        "",
        "export function getDefaults(): ConfigurationData {",
        "  return {",
    ] + defaults_fields + [
        "  };",
        "}",
        "",
        "export function getFieldTypes(): Record<string, ConfigFieldType> {",
        "  return {",
    ] + field_types + [
        "  };",
        "}",
        "",
        ""
    ]
    
    return "\n".join(all_lines)


def main():
    """Main function to generate TypeScript schema and Python boilerplate"""
    try:
        # Generate the TypeScript content
        ts_content = generate_typescript_schema()
        
        # Write to the target file
        target_file = project_root / "src" / "config" / "generatedConfigSchema.ts"
        target_file.write_text(ts_content)
        
        print(f"✅ Generated {target_file} from shared_config.py")
        print(f"   Fields: {len(CONFIG_SCHEMA_DEF)}")
        
        # Also generate Python boilerplate
        print("\n🔄 Generating Python boilerplate...")
        from pathlib import Path
        import subprocess
        
        boilerplate_script = project_root / "scripts" / "generate_python_boilerplate.py"
        result = subprocess.run([sys.executable, str(boilerplate_script)], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            print(result.stdout)
        else:
            print(f"⚠️  Python boilerplate generation had issues:\n{result.stderr}")
        
    except Exception as e:
        print(f"❌ Error generating schema: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
