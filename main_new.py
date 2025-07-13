"""
Main entry point for the lsfg-vk Decky Loader plugin.

This file imports and exposes the Plugin class from the lsfg_vk package.
The actual implementation has been refactored into separate service modules
for better maintainability and testability.
"""

# Import the refactored Plugin class
from lsfg_vk import Plugin

# Re-export Plugin at module level for Decky Loader compatibility
__all__ = ['Plugin']
