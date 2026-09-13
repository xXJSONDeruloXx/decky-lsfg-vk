from typing import List, Optional, TypedDict


class InstallationResponse(TypedDict):
    success: bool
    message: str
    error: Optional[str]


class UninstallationResponse(InstallationResponse):
    removed_files: Optional[List[str]]


class InstallationCheckResponse(TypedDict):
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
