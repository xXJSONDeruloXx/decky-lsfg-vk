"""
Type definitions for the lsfg-vk plugin responses.
"""

from typing import TypedDict, Optional, List, Dict, Any
from .config_schema import ConfigurationData


class BaseResponse(TypedDict):
    """Base response structure"""
    success: bool


class ErrorResponse(BaseResponse):
    """Response structure for errors"""
    error: str


class MessageResponse(BaseResponse):
    """Response structure with message"""
    message: str


class InstallationResponse(BaseResponse):
    """Response for installation operations"""
    message: str
    error: Optional[str]


class UninstallationResponse(BaseResponse):
    """Response for uninstallation operations"""
    message: str
    removed_files: Optional[List[str]]
    error: Optional[str]


class InstallationCheckResponse(TypedDict):
    """Response for installation check"""
    installed: bool
    lossless_scaling_installed: bool
    lossless_scaling_status: str
    error: Optional[str]


class SteamBranchStatusResponse(TypedDict):
    success: bool
    message: str
    error: Optional[str]
    installed: bool
    manifest_path: Optional[str]
    selected_branch: Optional[str]
    current_branch: Optional[str]
    target_branch: str
    needs_switch: bool
    restart_required: bool

class ConfigurationResponse(BaseResponse):
    """Response for configuration operations"""
    config: Optional[ConfigurationData]
    message: Optional[str]
    error: Optional[str]


class ProfileConfig(TypedDict):
    """Configuration for a single profile"""
    exe: str
    config: ConfigurationData


class ProfilesResponse(BaseResponse):
    """Response for per-game upstream profiles"""
    default: Optional[ConfigurationData]
    games: Optional[List[Dict[str, Any]]]
    message: Optional[str]
    error: Optional[str]


class ProfileResponse(BaseResponse):
    """Response for a per-game upstream profile"""
    appid: Optional[str]
    config: Optional[ConfigurationData]
    message: Optional[str]
    error: Optional[str]
