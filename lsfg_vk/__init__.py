"""
lsfg-vk plugin package for Decky Loader.

This package provides services for installing and managing the lsfg-vk 
Vulkan layer for Lossless Scaling frame generation.
"""

# Import will be available once plugin.py exists
try:
    from .plugin import Plugin
    __all__ = ['Plugin']
except ImportError:
    # During development, plugin may not exist yet
    __all__ = []
