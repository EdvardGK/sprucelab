"""
BEP (BIM Execution Plan) default templates.

Based on Norwegian standards:
- MMI-veileder 2.0 (Model Maturity Index)
- NS 3451 (Building element table)
- NS 3457-8 (Component codes)

Reference: KNM_BEP.md (Kistefos project BEP)
"""
from typing import Dict, Any, Optional


class BEPDefaults:
    """
    Provides default BEP configurations based on Norwegian BIM standards.

    Usage:
        defaults = BEPDefaults()
        full_config = defaults.get_full_template()

        # Or get individual sections:
        mmi = defaults.get_mmi_scale()
        psets = defaults.get_required_psets()
    """

    # =========================================================================
    # MMI Scale (Norwegian Model Maturity Index)
    # =========================================================================

    @staticmethod
    def get_mmi_scale() -> Dict[str, Any]:
        """
        Norwegian MMI scale from MMI-veileder 2.0.

        Levels:
        - 100: Conceptual (Konsept)
        - 200: Schematic (Skisseprosjekt)
        - 300: Design Development (Forprosjekt)
        - 350: Coordination Ready (Detaljprosjekt start)
        - 400: Detailed Design (Detaljprosjekt)
        - 500: Construction (Arbeidstegninger)
        - 600: As-built (Som bygget)
        """
        return {
            "100": {
                "name": "Konsept",
                "name_en": "Conceptual",
                "description": "Overordnet plassering og volum",
                "required_properties": [
                    "Name", "IfcType"
                ],
                "required_psets": [],
                "validation_rules": ["has_name", "valid_ifc_type"],
                "capabilities": ["visualization"]
            },
            "200": {
                "name": "Skisseprosjekt",
                "name_en": "Schematic Design",
                "description": "Overordnet geometri, plassering i etasje",
                "required_properties": [
                    "Name", "IfcType", "Floor", "Location"
                ],
                "required_psets": [],
                "validation_rules": ["has_name", "valid_ifc_type", "has_floor"],
                "capabilities": ["visualization", "basic_schedules"]
            },
            "300": {
                "name": "Forprosjekt",
                "name_en": "Design Development",
                "description": "Hovedmaterialer, bygningsdelsklassifisering",
                "required_properties": [
                    "Name", "IfcType", "Floor", "NS3451", "Material"
                ],
                "required_psets": ["Pset_*Common"],
                "validation_rules": [
                    "has_name", "valid_ifc_type", "has_floor",
                    "has_ns3451", "has_material"
                ],
                "capabilities": ["visualization", "qto_basic", "classification"]
            },
            "350": {
                "name": "Koordineringsklar",
                "name_en": "Coordination Ready",
                "description": "Klar for tverrfaglig kontroll, alle hovedkomponenter modellert",
                "required_properties": [
                    "Name", "IfcType", "Floor", "NS3451", "Material",
                    "System", "ComponentCode"
                ],
                "required_psets": ["Pset_*Common"],
                "validation_rules": [
                    "has_name", "valid_ifc_type", "has_floor",
                    "has_ns3451", "has_material", "has_system"
                ],
                "capabilities": ["visualization", "qto_basic", "classification", "clash_detection"]
            },
            "400": {
                "name": "Detaljprosjekt",
                "name_en": "Detailed Design",
                "description": "Komplette dimensjoner, materialspesifikasjoner",
                "required_properties": [
                    "Name", "IfcType", "Floor", "NS3451", "NS3457", "Material",
                    "Width", "Height", "Length"
                ],
                "required_psets": ["Pset_*Common", "Project_Common"],
                "validation_rules": [
                    "has_name", "valid_ifc_type", "has_floor",
                    "has_ns3451", "has_ns3457", "has_material",
                    "has_dimensions"
                ],
                "capabilities": [
                    "visualization", "qto_detailed", "classification",
                    "clash_detection", "lca_estimate"
                ]
            },
            "500": {
                "name": "Arbeidstegninger",
                "name_en": "Construction Documents",
                "description": "Produksjonsklare modeller med alle detaljer",
                "required_properties": [
                    "Name", "IfcType", "Floor", "NS3451", "NS3457", "Material",
                    "Width", "Height", "Length", "Area", "Volume",
                    "Manufacturer", "ProductCode"
                ],
                "required_psets": ["Pset_*Common", "Project_Common", "Project_LCA"],
                "validation_rules": [
                    "has_name", "valid_ifc_type", "has_floor",
                    "has_ns3451", "has_ns3457", "has_material",
                    "has_dimensions", "has_quantities", "has_manufacturer"
                ],
                "capabilities": [
                    "visualization", "qto_detailed", "classification",
                    "clash_detection", "lca_full", "reduzer_export"
                ]
            },
            "600": {
                "name": "Som bygget",
                "name_en": "As-Built",
                "description": "Verifisert som-bygget informasjon",
                "required_properties": [
                    "Name", "IfcType", "Floor", "NS3451", "NS3457", "Material",
                    "Width", "Height", "Length", "Area", "Volume",
                    "Manufacturer", "ProductCode", "SerialNumber", "InstallationDate"
                ],
                "required_psets": ["Pset_*Common", "Project_Common", "Project_LCA", "Project_AsBuilt"],
                "validation_rules": [
                    "has_name", "valid_ifc_type", "has_floor",
                    "has_ns3451", "has_ns3457", "has_material",
                    "has_dimensions", "has_quantities", "has_manufacturer",
                    "has_as_built_verification"
                ],
                "capabilities": [
                    "visualization", "qto_detailed", "classification",
                    "clash_detection", "lca_full", "reduzer_export",
                    "oneclicklca_export", "handover"
                ]
            }
        }

    # =========================================================================
    # Required Property Sets
    # =========================================================================

    @staticmethod
    def get_required_psets() -> Dict[str, Any]:
        """
        Required property sets per IFC type.

        Based on buildingSMART standards and Norwegian practice.
        """
        return {
            # Common types
            "IfcWall": ["Pset_WallCommon"],
            "IfcWallStandardCase": ["Pset_WallCommon"],
            "IfcSlab": ["Pset_SlabCommon"],
            "IfcColumn": ["Pset_ColumnCommon"],
            "IfcBeam": ["Pset_BeamCommon"],
            "IfcDoor": ["Pset_DoorCommon"],
            "IfcWindow": ["Pset_WindowCommon"],
            "IfcStair": ["Pset_StairCommon"],
            "IfcRailing": ["Pset_RailingCommon"],
            "IfcRoof": ["Pset_RoofCommon"],
            "IfcCovering": ["Pset_CoveringCommon"],
            "IfcCurtainWall": ["Pset_CurtainWallCommon"],
            "IfcPlate": ["Pset_PlateCommon"],
            "IfcMember": ["Pset_MemberCommon"],
            "IfcFooting": ["Pset_FootingCommon"],
            "IfcPile": ["Pset_PileCommon"],

            # MEP types
            "IfcPipeSegment": ["Pset_PipeSegmentTypeCommon"],
            "IfcPipeFitting": ["Pset_PipeFittingTypeCommon"],
            "IfcDuctSegment": ["Pset_DuctSegmentTypeCommon"],
            "IfcDuctFitting": ["Pset_DuctFittingTypeCommon"],
            "IfcCableSegment": ["Pset_CableSegmentTypeCommon"],
            "IfcCableFitting": ["Pset_CableFittingTypeCommon"],

            # Equipment
            "IfcFlowTerminal": ["Pset_FlowTerminalTypeCommon"],
            "IfcFlowController": ["Pset_FlowControllerTypeCommon"],
            "IfcFlowMovingDevice": ["Pset_FlowMovingDeviceTypeCommon"],

            # Wildcard for project-specific
            "*": ["Project_Common"]
        }

    # =========================================================================
    # Naming Conventions
    # =========================================================================

    @staticmethod
    def get_naming_conventions() -> Dict[str, Any]:
        """
        Naming conventions for files and elements.

        Based on common Norwegian BIM practice.
        """
        return {
            "file_naming": {
                "pattern": "{project}_{discipline}_{phase}_{description}.ifc",
                "examples": [
                    "PRJ_ARK_D_Bygg-A.ifc",
                    "PRJ_RIB_D_Baerekonstruksjon.ifc",
                    "PRJ_RIV_D_Ventilasjon.ifc"
                ],
                "disciplines": {
                    "ARK": "Arkitekt",
                    "RIB": "Rådgivende ingeniør bygg",
                    "RIV": "Rådgivende ingeniør VVS",
                    "RIE": "Rådgivende ingeniør elektro",
                    "RIBr": "Rådgivende ingeniør brann",
                    "RIA": "Rådgivende ingeniør akustikk",
                    "LARK": "Landskapsarkitekt"
                },
                "phases": {
                    "S": "Skisseprosjekt",
                    "F": "Forprosjekt",
                    "D": "Detaljprosjekt",
                    "A": "Arbeidstegninger",
                    "B": "Som bygget"
                }
            },
            "element_naming": {
                "pattern": "{type}_{description}_{variant}",
                "examples": [
                    "Vegg_Betong_200",
                    "Søyle_Stål_HEB200",
                    "Dør_Innerdør_900x2100"
                ]
            },
            "type_naming": {
                "pattern": "{description}_{variant}_{dimension}",
                "examples": [
                    "Betongvegg_Bærende_200mm",
                    "Stålsøyle_HEB200",
                    "Bindingsverk_Yttervegg_198mm"
                ]
            }
        }

    # =========================================================================
    # Validation Rules
    # =========================================================================

    @staticmethod
    def get_validation_rules() -> list:
        """
        Default validation rules.

        Each rule has:
        - id: Unique identifier
        - name: Human-readable name
        - description: What it checks
        - severity: error, warning, info
        - check: Type of check (property, classification, geometry, etc.)
        - params: Check-specific parameters
        """
        return [
            {
                "id": "has_name",
                "name": "Element har navn",
                "description": "Alle elementer må ha et definert navn",
                "severity": "error",
                "check": "property_exists",
                "params": {"property": "Name"}
            },
            {
                "id": "valid_ifc_type",
                "name": "Gyldig IFC-type",
                "description": "Elementer må ha gyldig IFC-type (ikke IfcBuildingElementProxy)",
                "severity": "warning",
                "check": "not_proxy",
                "params": {"excluded_types": ["IfcBuildingElementProxy"]}
            },
            {
                "id": "has_floor",
                "name": "Tilhører etasje",
                "description": "Elementer må være tilordnet en etasje (IfcBuildingStorey)",
                "severity": "error",
                "check": "has_spatial_container",
                "params": {"container_type": "IfcBuildingStorey"}
            },
            {
                "id": "has_ns3451",
                "name": "NS 3451 klassifisering",
                "description": "Elementer må ha NS 3451 bygningsdelsklassifisering",
                "severity": "warning",
                "check": "property_exists",
                "params": {
                    "property": "NS3451",
                    "psets": ["Project_Common", "Pset_Classification"]
                }
            },
            {
                "id": "has_ns3457",
                "name": "NS 3457 komponentkode",
                "description": "Tekniske installasjoner må ha NS 3457 komponentkode",
                "severity": "warning",
                "check": "property_exists",
                "params": {
                    "property": "NS3457",
                    "applies_to": [
                        "IfcPipeSegment", "IfcDuctSegment", "IfcCableSegment",
                        "IfcFlowTerminal", "IfcFlowController"
                    ]
                }
            },
            {
                "id": "has_material",
                "name": "Materialangivelse",
                "description": "Elementer må ha tilordnet materiale",
                "severity": "warning",
                "check": "has_material",
                "params": {}
            },
            {
                "id": "has_dimensions",
                "name": "Dimensjonsangivelse",
                "description": "Elementer må ha definerte dimensjoner",
                "severity": "info",
                "check": "has_dimensions",
                "params": {"min_mmi": 400}
            },
            {
                "id": "unique_guid",
                "name": "Unik GlobalId",
                "description": "Alle elementer må ha unik GlobalId",
                "severity": "error",
                "check": "unique_property",
                "params": {"property": "GlobalId"}
            },
            {
                "id": "valid_coordinates",
                "name": "Gyldige koordinater",
                "description": "Elementer må ha gyldige koordinater (ikke null-koordinater)",
                "severity": "error",
                "check": "valid_coordinates",
                "params": {}
            }
        ]

    # =========================================================================
    # Classification System
    # =========================================================================

    @staticmethod
    def get_classification_system() -> Dict[str, Any]:
        """
        Classification system settings for Norwegian standards.
        """
        return {
            "ns3451": {
                "enabled": True,
                "name": "NS 3451 Bygningsdelstabellen",
                "version": "2022",
                "property_name": "NS3451",
                "psets": ["Project_Common", "Pset_Classification"],
                "format": "^\\d{2,3}$",  # 2-3 digits
                "examples": ["22", "223", "31"],
                "description": "Klassifisering av bygningsdeler"
            },
            "ns3457": {
                "enabled": True,
                "name": "NS 3457 Komponentkode",
                "version": "2022",
                "property_name": "NS3457",
                "psets": ["Project_Common", "Pset_Classification"],
                "format": "^[A-Z]{1,2}\\d{2,3}$",  # Letters + digits
                "examples": ["VT01", "SD120", "EK01"],
                "description": "Komponentkode for tekniske installasjoner"
            },
            "uniclass": {
                "enabled": False,
                "name": "Uniclass 2015",
                "property_name": "Uniclass",
                "description": "UK classification system"
            },
            "omniclass": {
                "enabled": False,
                "name": "OmniClass",
                "property_name": "OmniClass",
                "description": "US classification system"
            }
        }

    # =========================================================================
    # Coordination Cycle
    # =========================================================================

    @staticmethod
    def get_coordination_cycle() -> Dict[str, Any]:
        """
        Coordination cycle and BCF workflow settings.

        Based on KNM_BEP.md coordination workflow.
        """
        return {
            "frequency": "weekly",
            "day": "tuesday",
            "meeting_duration": 60,  # minutes
            "bcf_workflow": {
                "statuses": [
                    {
                        "name": "Activated",
                        "name_no": "Aktivert",
                        "description": "Nytt avvik, krever handling",
                        "color": "#FF6B6B"
                    },
                    {
                        "name": "On hold",
                        "name_no": "På vent",
                        "description": "Avventer avklaring eller annen fag",
                        "color": "#FFB347"
                    },
                    {
                        "name": "Resolved",
                        "name_no": "Løst",
                        "description": "Løst av ansvarlig, krever verifisering",
                        "color": "#77DD77"
                    },
                    {
                        "name": "Closed",
                        "name_no": "Lukket",
                        "description": "Verifisert og avsluttet",
                        "color": "#B0B0B0"
                    }
                ],
                "priorities": ["Critical", "Major", "Normal", "Minor"],
                "labels": [
                    "Kollisjon", "Manglende info", "Feil geometri",
                    "Feil klassifisering", "Spørsmål", "Forslag"
                ]
            },
            "disciplines": {
                "ARK": {
                    "name": "Arkitekt",
                    "responsibility": "Bygningskropp, innredning, fasader",
                    "ns3451_codes": ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]
                },
                "RIB": {
                    "name": "RIB (Konstruksjon)",
                    "responsibility": "Bærende konstruksjoner",
                    "ns3451_codes": ["22", "23", "24", "26"]
                },
                "RIV": {
                    "name": "RIV (VVS)",
                    "responsibility": "Ventilasjon, sanitær, varme",
                    "ns3451_codes": ["31", "32", "33", "36"]
                },
                "RIE": {
                    "name": "RIE (Elektro)",
                    "responsibility": "Elektriske installasjoner",
                    "ns3451_codes": ["40", "41", "42", "43", "44", "45", "46"]
                }
            },
            "deadlines": {
                "issue_response": 48,  # hours
                "model_delivery": "friday_1600",
                "bcf_deadline": "monday_1200"
            }
        }

    # =========================================================================
    # EIR Configuration
    # =========================================================================

    @staticmethod
    def get_eir_template() -> Dict[str, Any]:
        """
        Default EIR (Employer's Information Requirements) template.

        Based on ISO 19650-2 and Norwegian practice.
        """
        return {
            "requirements": [
                {
                    "id": "EIR-01",
                    "name": "Filnavngivning",
                    "description": "Alle filer skal følge prosjektets navnekonvensjon",
                    "category": "Naming",
                    "verification": "automated"
                },
                {
                    "id": "EIR-02",
                    "name": "Koordinatsystem",
                    "description": "Alle modeller skal bruke felles prosjektkoordinater",
                    "category": "Coordination",
                    "verification": "automated"
                },
                {
                    "id": "EIR-03",
                    "name": "IFC-versjon",
                    "description": "Alle IFC-filer skal leveres i IFC4 ADD2 TC1 format",
                    "category": "Technical",
                    "verification": "automated"
                },
                {
                    "id": "EIR-04",
                    "name": "MMI-nivå",
                    "description": "Modeller skal oppfylle definert MMI-nivå per milepæl",
                    "category": "Quality",
                    "verification": "automated"
                },
                {
                    "id": "EIR-05",
                    "name": "Klassifisering",
                    "description": "Alle elementer skal klassifiseres iht. NS 3451",
                    "category": "Classification",
                    "verification": "automated"
                },
                {
                    "id": "EIR-06",
                    "name": "Leveringsformat",
                    "description": "Native og IFC-format ved hver leveranse",
                    "category": "Delivery",
                    "verification": "manual"
                },
                {
                    "id": "EIR-07",
                    "name": "BCF-arbeidsflyt",
                    "description": "BCF skal brukes for all tverrfaglig kommunikasjon",
                    "category": "Coordination",
                    "verification": "manual"
                },
                {
                    "id": "EIR-08",
                    "name": "Koordineringsmøter",
                    "description": "Ukentlige koordineringsmøter med alle fag",
                    "category": "Process",
                    "verification": "manual"
                }
            ],
            "milestones": [
                {
                    "id": "M1",
                    "name": "Forprosjekt",
                    "target_mmi": 300,
                    "deliverables": ["IFC models", "Model status report"]
                },
                {
                    "id": "M2",
                    "name": "Detaljprosjekt start",
                    "target_mmi": 350,
                    "deliverables": ["IFC models", "Clash report", "BCF log"]
                },
                {
                    "id": "M3",
                    "name": "Detaljprosjekt",
                    "target_mmi": 400,
                    "deliverables": ["IFC models", "QTO schedule", "LCA estimate"]
                },
                {
                    "id": "M4",
                    "name": "Arbeidstegninger",
                    "target_mmi": 500,
                    "deliverables": ["IFC models", "Reduzer export", "Final QTO"]
                },
                {
                    "id": "M5",
                    "name": "Overlevering",
                    "target_mmi": 600,
                    "deliverables": ["As-built IFC", "FM handover package"]
                }
            ],
            "acceptance_criteria": {
                "automated_checks": [
                    "File naming compliance",
                    "Coordinate system validation",
                    "MMI level verification",
                    "Classification completeness",
                    "Clash-free model"
                ],
                "manual_checks": [
                    "Visual review of key areas",
                    "Stakeholder approval",
                    "Design review sign-off"
                ]
            }
        }

    # =========================================================================
    # Full Template
    # =========================================================================

    @classmethod
    def get_full_template(cls, project_code: str = "PRJ") -> Dict[str, Any]:
        """
        Get complete ProjectConfig template with all sections.

        Args:
            project_code: Short project code for naming conventions

        Returns:
            Complete config dictionary ready for ProjectConfig.config
        """
        return {
            "project": {
                "code": project_code,
                "version": "1.0",
                "created_from": "BEPDefaults template"
            },
            "eir": cls.get_eir_template(),
            "bep": {
                "mmi_scale": cls.get_mmi_scale(),
                "required_psets": cls.get_required_psets(),
                "naming_conventions": cls.get_naming_conventions(),
                "validation_rules": cls.get_validation_rules(),
                "classification_system": cls.get_classification_system(),
                "coordination_cycle": cls.get_coordination_cycle(),
                "target_mmi": 300  # Default target
            },
            "tfm": {
                "enabled": False,
                "primary_pset": "",
                "property_name": ""
            },
            "auto_excluded": {
                "entities": [
                    "IfcSite", "IfcBuilding", "IfcBuildingStorey",
                    "IfcSpace", "IfcOpeningElement", "IfcVirtualElement"
                ],
                "type_patterns": [
                    "ProvisionForVoid*", "*_Opening_*"
                ]
            },
            "type_scope": {
                "tfm": {"in": [], "out": []},
                "lca": {"in": ["*"], "out": ["ProvisionForVoid*"]},
                "qto": {"in": ["*"], "out": ["IfcSpace", "IfcOpeningElement"]},
                "clash": {"in": ["*"], "out": ["IfcSpace", "IfcOpeningElement"]}
            }
        }


def get_bep_template(project_code: str = "PRJ") -> Dict[str, Any]:
    """
    Convenience function to get full BEP template.

    Usage:
        from apps.projects.services import get_bep_template
        config = get_bep_template("ST28")
    """
    return BEPDefaults.get_full_template(project_code)
