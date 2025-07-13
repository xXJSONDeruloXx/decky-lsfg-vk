"""
Tests for the configuration service.
"""

import tempfile
from pathlib import Path
from unittest.mock import Mock

from lsfg_vk.configuration import ConfigurationService


def test_parse_script_content():
    """Test parsing of script content"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_home = Path(temp_dir)
        
        # Create service with mocked home directory
        service = ConfigurationService(logger=mock_logger)
        service.user_home = temp_home
        service.lsfg_script_path = temp_home / "lsfg"
        
        # Test script content
        script_content = """#!/bin/bash

export ENABLE_LSFG=1
export LSFG_MULTIPLIER=3
export LSFG_FLOW_SCALE=1.5
export LSFG_HDR=1
# export LSFG_PERF_MODE=1
export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync

exec "$@"
"""
        
        config = service._parse_script_content(script_content)
        
        assert config["enable_lsfg"] is True
        assert config["multiplier"] == 3
        assert config["flow_scale"] == 1.5
        assert config["hdr"] is True
        assert config["perf_mode"] is False  # commented out
        assert config["immediate_mode"] is True


def test_parse_script_content_all_commented():
    """Test parsing when all optional features are commented out"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_home = Path(temp_dir)
        
        service = ConfigurationService(logger=mock_logger)
        service.user_home = temp_home
        service.lsfg_script_path = temp_home / "lsfg"
        
        script_content = """#!/bin/bash

# export ENABLE_LSFG=1
export LSFG_MULTIPLIER=2
export LSFG_FLOW_SCALE=1.0
# export LSFG_HDR=1
# export LSFG_PERF_MODE=1
# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync

exec "$@"
"""
        
        config = service._parse_script_content(script_content)
        
        assert config["enable_lsfg"] is False
        assert config["multiplier"] == 2
        assert config["flow_scale"] == 1.0
        assert config["hdr"] is False
        assert config["perf_mode"] is False
        assert config["immediate_mode"] is False


def test_generate_script_content():
    """Test script content generation"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_home = Path(temp_dir)
        
        service = ConfigurationService(logger=mock_logger)
        service.user_home = temp_home
        service.lsfg_script_path = temp_home / "lsfg"
        
        content = service._generate_script_content(
            enable_lsfg=True,
            multiplier=4,
            flow_scale=2.0,
            hdr=False,
            perf_mode=True,
            immediate_mode=False
        )
        
        assert "export ENABLE_LSFG=1" in content
        assert "export LSFG_MULTIPLIER=4" in content
        assert "export LSFG_FLOW_SCALE=2.0" in content
        assert "# export LSFG_HDR=1" in content
        assert "export LSFG_PERF_MODE=1" in content
        assert "# export MESA_VK_WSI_PRESENT_MODE=immediate" in content


def test_config_roundtrip():
    """Test that we can write config and read it back correctly"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_home = Path(temp_dir)
        
        service = ConfigurationService(logger=mock_logger)
        service.user_home = temp_home
        service.lsfg_script_path = temp_home / "lsfg"
        
        # Update config
        result = service.update_config(
            enable_lsfg=True,
            multiplier=3,
            flow_scale=1.5,
            hdr=True,
            perf_mode=False,
            immediate_mode=True
        )
        
        assert result["success"] is True
        
        # Read it back
        read_result = service.get_config()
        
        assert read_result["success"] is True
        config = read_result["config"]
        
        assert config["enable_lsfg"] is True
        assert config["multiplier"] == 3
        assert config["flow_scale"] == 1.5
        assert config["hdr"] is True
        assert config["perf_mode"] is False
        assert config["immediate_mode"] is True
