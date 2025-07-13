"""
Test configuration for the lsfg-vk plugin tests.
"""

import pytest
from unittest.mock import Mock


@pytest.fixture
def mock_logger():
    """Provide a mock logger for testing"""
    return Mock()


@pytest.fixture
def mock_decky_logger(monkeypatch):
    """Mock decky.logger for tests that import decky"""
    mock_logger = Mock()
    
    # Create a mock decky module
    mock_decky = Mock()
    mock_decky.logger = mock_logger
    
    # Monkeypatch the import
    monkeypatch.setattr('lsfg_vk.base_service.decky', mock_decky)
    monkeypatch.setattr('lsfg_vk.installation.decky', mock_decky)
    monkeypatch.setattr('lsfg_vk.dll_detection.decky', mock_decky)
    monkeypatch.setattr('lsfg_vk.configuration.decky', mock_decky)
    monkeypatch.setattr('lsfg_vk.plugin.decky', mock_decky)
    
    return mock_logger
