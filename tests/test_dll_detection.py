"""
Tests for the DLL detection service.
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

from lsfg_vk.dll_detection import DllDetectionService
from lsfg_vk.constants import LOSSLESS_DLL_NAME


def test_dll_detection_via_env_variable():
    """Test DLL detection via LSFG_DLL_PATH environment variable"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a fake DLL file
        dll_path = Path(temp_dir) / LOSSLESS_DLL_NAME
        dll_path.write_text("fake dll content")
        
        service = DllDetectionService(logger=mock_logger)
        
        # Test with environment variable set
        with patch.dict(os.environ, {"LSFG_DLL_PATH": str(dll_path)}):
            result = service.check_lossless_scaling_dll()
        
        assert result["detected"] is True
        assert result["path"] == str(dll_path)
        assert "LSFG_DLL_PATH" in result["source"]
        assert result["error"] is None


def test_dll_detection_via_xdg_data_home():
    """Test DLL detection via XDG_DATA_HOME"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create the expected directory structure
        steam_dir = Path(temp_dir) / "Steam" / "steamapps" / "common" / "Lossless Scaling"
        steam_dir.mkdir(parents=True)
        
        dll_path = steam_dir / LOSSLESS_DLL_NAME
        dll_path.write_text("fake dll content")
        
        service = DllDetectionService(logger=mock_logger)
        
        # Test with XDG_DATA_HOME set, no LSFG_DLL_PATH
        with patch.dict(os.environ, {"XDG_DATA_HOME": temp_dir}, clear=True):
            result = service.check_lossless_scaling_dll()
        
        assert result["detected"] is True
        assert result["path"] == str(dll_path)
        assert "XDG_DATA_HOME" in result["source"]
        assert result["error"] is None


def test_dll_detection_via_home_local_share():
    """Test DLL detection via HOME/.local/share"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create the expected directory structure
        steam_dir = Path(temp_dir) / ".local" / "share" / "Steam" / "steamapps" / "common" / "Lossless Scaling"
        steam_dir.mkdir(parents=True)
        
        dll_path = steam_dir / LOSSLESS_DLL_NAME
        dll_path.write_text("fake dll content")
        
        service = DllDetectionService(logger=mock_logger)
        
        # Test with HOME set, no other env vars
        env = {"HOME": temp_dir}
        with patch.dict(os.environ, env, clear=True):
            result = service.check_lossless_scaling_dll()
        
        assert result["detected"] is True
        assert result["path"] == str(dll_path)
        assert "HOME/.local/share" in result["source"]
        assert result["error"] is None


def test_dll_detection_not_found():
    """Test DLL detection when DLL is not found"""
    mock_logger = Mock()
    
    service = DllDetectionService(logger=mock_logger)
    
    # Test with no environment variables set
    with patch.dict(os.environ, {}, clear=True):
        result = service.check_lossless_scaling_dll()
    
    assert result["detected"] is False
    assert result["path"] is None
    assert result["source"] is None
    assert "not found" in result["message"]
    assert result["error"] is None


def test_dll_detection_priority():
    """Test that LSFG_DLL_PATH takes priority over other locations"""
    mock_logger = Mock()
    
    with tempfile.TemporaryDirectory() as temp_dir1, tempfile.TemporaryDirectory() as temp_dir2:
        # Create DLL in both locations
        dll_path1 = Path(temp_dir1) / LOSSLESS_DLL_NAME
        dll_path1.write_text("fake dll content 1")
        
        steam_dir = Path(temp_dir2) / "Steam" / "steamapps" / "common" / "Lossless Scaling"
        steam_dir.mkdir(parents=True)
        dll_path2 = steam_dir / LOSSLESS_DLL_NAME
        dll_path2.write_text("fake dll content 2")
        
        service = DllDetectionService(logger=mock_logger)
        
        # Set both environment variables
        env = {
            "LSFG_DLL_PATH": str(dll_path1),
            "XDG_DATA_HOME": temp_dir2
        }
        
        with patch.dict(os.environ, env, clear=True):
            result = service.check_lossless_scaling_dll()
        
        # Should prefer LSFG_DLL_PATH
        assert result["detected"] is True
        assert result["path"] == str(dll_path1)
        assert "LSFG_DLL_PATH" in result["source"]
