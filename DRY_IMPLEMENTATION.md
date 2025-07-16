# DRY Configuration System Implementation

## Overview
This implementation addresses the "Duplicated Configuration Parameter Handling" opportunity by centralizing all configuration-related logic in a single schema that can be shared between Python backend and TypeScript frontend.

## Key Changes Made

### 1. **Created Centralized Configuration Schema**
- **Python**: `py_modules/lsfg_vk/config_schema.py`
- **TypeScript**: `src/config/configSchema.ts`

Both files define the same configuration structure with:
- Field definitions (name, type, default, description)
- Script generation templates
- Validation logic
- Type-safe interfaces

### 2. **Simplified Backend Configuration**
- **Before**: 8 separate parameters passed to `update_lsfg_config()`
- **After**: Variable arguments `*args` using centralized schema

```python
# Before
async def update_lsfg_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                      hdr: bool, perf_mode: bool, immediate_mode: bool, disable_vkbasalt: bool, frame_cap: int)

# After  
async def update_lsfg_config(self, *args)
```

### 3. **Streamlined Frontend Configuration**
- **Before**: 8 separate handler functions in `Content.tsx`
- **After**: Single generic handler using field names

```tsx
// Before
const handleEnableLsfgChange = async (value: boolean) => {
  setters.setEnableLsfg(value);
  await updateConfig(value, config.multiplier, config.flowScale, ...);
};
// ... 7 more similar handlers

// After
const handleConfigChange = async (fieldName: keyof ConfigurationData, value: boolean | number) => {
  await updateField(fieldName, value);
};
```

### 4. **Updated Configuration Service**
- Removed hardcoded defaults from `constants.py`
- Removed duplicate script template logic
- Uses centralized `ConfigurationManager` for all operations

### 5. **Modernized Hook System**
- **Before**: Separate state variables for each config field
- **After**: Single `ConfigurationData` object with field-based updates

## Benefits Achieved

### 1. **Reduced Code Duplication**
- Configuration parameters defined once in schema
- Script generation logic centralized
- No more repetitive handler functions

### 2. **Easier to Add New Configuration Options**
To add a new configuration option, you now only need to:
1. Add the field definition to both config schemas
2. The rest of the system automatically handles it

### 3. **Type Safety**
- TypeScript and Python types are consistent
- Schema validation ensures data integrity
- Centralized type definitions

### 4. **Maintainability**
- Single source of truth for configuration
- Consistent field naming and types
- Easier to refactor and extend

## Example: Adding a New Configuration Option

To add a new boolean option called "experimental_mode":

1. **Add to Python schema** (`config_schema.py`):
```python
"experimental_mode": ConfigField(
    name="experimental_mode",
    field_type=ConfigFieldType.BOOLEAN,
    default=False,
    description="Enable experimental features",
    script_template="export LSFG_EXPERIMENTAL={value}",
    script_comment="# export LSFG_EXPERIMENTAL=1"
)
```

2. **Add to TypeScript schema** (`configSchema.ts`):
```typescript
experimental_mode: {
  name: "experimental_mode",
  fieldType: ConfigFieldType.BOOLEAN,
  default: false,
  description: "Enable experimental features",
  scriptTemplate: "export LSFG_EXPERIMENTAL={value}",
  scriptComment: "# export LSFG_EXPERIMENTAL=1"
}
```

3. **Update type definitions** in both files:
```python
# Python
class ConfigurationData(TypedDict):
    # ... existing fields ...
    experimental_mode: bool
```

```typescript
// TypeScript
export interface ConfigurationData {
  // ... existing fields ...
  experimental_mode: boolean;
}
```

4. **Add UI component** to `ConfigurationSection.tsx`:
```tsx
<PanelSectionRow>
  <ToggleField
    label="Experimental Mode"
    description="Enable experimental features"
    checked={config.experimental_mode}
    onChange={(value) => onConfigChange('experimental_mode', value)}
  />
</PanelSectionRow>
```

That's it! The rest of the system automatically handles the new field.

## Files Modified

### Python Backend
- `py_modules/lsfg_vk/config_schema.py` (new)
- `py_modules/lsfg_vk/types.py` (updated)
- `py_modules/lsfg_vk/constants.py` (simplified)
- `py_modules/lsfg_vk/configuration.py` (refactored)
- `py_modules/lsfg_vk/installation.py` (updated)
- `py_modules/lsfg_vk/plugin.py` (updated)

### TypeScript Frontend
- `src/config/configSchema.ts` (new)
- `src/api/lsfgApi.ts` (updated)
- `src/hooks/useLsfgHooks.ts` (simplified)
- `src/components/Content.tsx` (simplified)
- `src/components/ConfigurationSection.tsx` (updated)
- `src/components/UsageInstructions.tsx` (updated)

## Testing
The configuration system has been tested and generates correct script content with proper defaults and field ordering.
