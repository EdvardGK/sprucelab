"""
Pydantic schemas for IDS (Information Delivery Specification) operations.
"""
from pydantic import BaseModel, Field
from typing import Optional


class IDSValidateRequest(BaseModel):
    """Request to validate an IFC file against IDS specifications."""
    ids_xml: str = Field(..., description="IDS XML content")
    file_path: Optional[str] = Field(None, description="Local path to IFC file")
    file_url: Optional[str] = Field(None, description="URL to download IFC file")


class IDSParseRequest(BaseModel):
    """Request to parse IDS XML into structured specifications."""
    ids_xml: str = Field(..., description="IDS XML content")


class IDSGenerateRequest(BaseModel):
    """Request to generate IDS XML from structured specifications."""
    title: str = Field("Untitled", description="IDS document title")
    author: str = Field("", description="IDS author")
    structured_specs: list = Field(..., description="Array of specification definitions")


class IDSValidateResponse(BaseModel):
    """Response from IDS validation."""
    status: str
    total_specifications: int = 0
    specifications_passed: int = 0
    specifications_failed: int = 0
    total_checks: int = 0
    checks_passed: int = 0
    checks_failed: int = 0
    overall_pass: bool = False
    results: dict = Field(default_factory=dict, description="Full ifctester JSON report")
    error: Optional[str] = None


class IDSParseResponse(BaseModel):
    """Response from IDS parsing."""
    structured_specs: list
    specification_count: int
    info: dict = Field(default_factory=dict)


class IDSGenerateResponse(BaseModel):
    """Response from IDS XML generation."""
    ids_xml: str
    specification_count: int
