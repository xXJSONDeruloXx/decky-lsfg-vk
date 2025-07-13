"""
Tests for the installation service.
"""

import os
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from pyfakefs.fake_filesystem_unittest import TestCase

from lsfg_vk.installation import InstallationService
from lsfg_vk.constants import LIB_FILENAME, JSON_FILENAME, ZIP_FILENAME


class TestInstallationService(TestCase):
    """Test cases for InstallationService using pyfakefs"""
    
    def setUp(self):
        """Set up fake filesystem"""
        self.setUpPyfakefs()
        self.mock_logger = Mock()
        
        # Create a test home directory
        self.test_home = Path("/home/testuser")
        self.fs.create_dir(self.test_home)
        
        # Patch Path.home() to return our test home
        with patch('lsfg_vk.base_service.Path.home', return_value=self.test_home):
            self.service = InstallationService(logger=self.mock_logger)
    
    def test_check_installation_no_files(self):
        """Test installation check when no files are installed"""
        result = self.service.check_installation()
        
        assert result["installed"] is False
        assert result["lib_exists"] is False
        assert result["json_exists"] is False
        assert result["script_exists"] is False
        assert result["error"] is None
    
    def test_check_installation_all_files_exist(self):
        """Test installation check when all files exist"""
        # Create the files
        self.service.lib_file.parent.mkdir(parents=True, exist_ok=True)
        self.service.lib_file.touch()
        
        self.service.json_file.parent.mkdir(parents=True, exist_ok=True)
        self.service.json_file.touch()
        
        self.service.lsfg_script_path.touch()
        
        result = self.service.check_installation()
        
        assert result["installed"] is True
        assert result["lib_exists"] is True
        assert result["json_exists"] is True
        assert result["script_exists"] is True
        assert result["error"] is None
    
    def test_create_zip_for_testing(self):
        """Helper to create a test zip file"""
        # Create temp directory for zip contents
        zip_content_dir = Path("/tmp/zip_content")
        self.fs.create_dir(zip_content_dir)
        
        # Create test files
        lib_file = zip_content_dir / LIB_FILENAME
        json_file = zip_content_dir / JSON_FILENAME
        
        lib_file.write_text("fake library content")
        json_file.write_text('{"layer": {"name": "VK_LAYER_LS_frame_generation"}}')
        
        # Create zip file
        zip_path = Path("/tmp/test.zip")
        with zipfile.ZipFile(zip_path, 'w') as zip_file:
            zip_file.write(lib_file, LIB_FILENAME)
            zip_file.write(json_file, JSON_FILENAME)
        
        return zip_path
    
    @patch('lsfg_vk.installation.Path.home')
    def test_install_success(self, mock_home):
        """Test successful installation"""
        mock_home.return_value = self.test_home
        
        # Create the plugin directory and zip file
        plugin_dir = Path("/plugin")
        bin_dir = plugin_dir / "bin"
        self.fs.create_dir(bin_dir)
        
        # Create a test zip file
        zip_path = self.test_create_zip_for_testing()
        zip_dest = bin_dir / ZIP_FILENAME
        
        # Copy our test zip to the expected location
        with open(zip_path, 'rb') as src, open(zip_dest, 'wb') as dst:
            dst.write(src.read())
        
        # Mock the plugin directory detection
        with patch('lsfg_vk.installation.Path.__file__', f"{plugin_dir}/lsfg_vk/installation.py"):
            result = self.service.install()
        
        assert result["success"] is True
        assert "successfully" in result["message"]
        assert result["error"] is None
        
        # Check that files were created
        assert self.service.lib_file.exists()
        assert self.service.json_file.exists()
        assert self.service.lsfg_script_path.exists()
    
    def test_uninstall_no_files(self):
        """Test uninstall when no files exist"""
        result = self.service.uninstall()
        
        assert result["success"] is True
        assert "No lsfg-vk files found" in result["message"]
        assert result["removed_files"] is None
    
    def test_uninstall_with_files(self):
        """Test uninstall when files exist"""
        # Create the files
        self.service.lib_file.parent.mkdir(parents=True, exist_ok=True)
        self.service.lib_file.touch()
        
        self.service.json_file.parent.mkdir(parents=True, exist_ok=True)
        self.service.json_file.touch()
        
        self.service.lsfg_script_path.touch()
        
        result = self.service.uninstall()
        
        assert result["success"] is True
        assert "uninstalled successfully" in result["message"]
        assert len(result["removed_files"]) == 3
        
        # Check that files were removed
        assert not self.service.lib_file.exists()
        assert not self.service.json_file.exists()
        assert not self.service.lsfg_script_path.exists()


def test_installation_service_with_mock_logger():
    """Test that InstallationService accepts a mock logger"""
    mock_logger = Mock()
    service = InstallationService(logger=mock_logger)
    assert service.log == mock_logger
