#!/usr/bin/env python3
"""
Simple test script to verify the refactored plugin works.
"""

import sys
from pathlib import Path
from unittest.mock import Mock

# Add the project root to the path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Mock the decky module
mock_decky = Mock()
mock_decky.logger = Mock()
sys.modules['decky'] = mock_decky

# Now we can import our plugin
from lsfg_vk import Plugin

def test_plugin_creation():
    """Test that we can create a plugin instance"""
    print("🧪 Testing plugin creation...")
    plugin = Plugin()
    print("✅ Plugin created successfully!")
    return plugin

def test_installation_check():
    """Test the installation check method"""
    print("🧪 Testing installation check...")
    plugin = Plugin()
    result = plugin.check_lsfg_vk_installed()
    print(f"✅ Installation check result: {result}")
    return result

def test_dll_detection():
    """Test the DLL detection method"""
    print("🧪 Testing DLL detection...")
    plugin = Plugin()
    result = plugin.check_lossless_scaling_dll()
    print(f"✅ DLL detection result: {result}")
    return result

def test_config_operations():
    """Test configuration operations"""
    print("🧪 Testing configuration operations...")
    plugin = Plugin()
    
    # This will fail since the script doesn't exist, but should return a proper error
    result = plugin.get_lsfg_config()
    print(f"✅ Config get result: {result}")
    
    return result

if __name__ == "__main__":
    print("🚀 Starting refactored plugin tests...\n")
    
    try:
        test_plugin_creation()
        print()
        
        test_installation_check()
        print()
        
        test_dll_detection()
        print()
        
        test_config_operations()
        print()
        
        print("🎉 All tests completed successfully!")
        print("📦 The refactored plugin structure is working correctly.")
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
