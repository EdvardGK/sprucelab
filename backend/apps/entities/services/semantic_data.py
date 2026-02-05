"""
Initial data for Semantic Type Normalization System.

Based on:
- PA0802 TFM Component Codes (two-letter codes)
- NS3451:2022 Norwegian building classification
- IFC 4x3 Add 2 schema

This file defines:
1. INITIAL_SEMANTIC_TYPES - Canonical semantic type definitions
2. IFC_MISUSE_MAPPINGS - Known patterns where IFC classes are commonly misused
"""

# =============================================================================
# INITIAL SEMANTIC TYPES
# Based on PA0802 codes and common BIM element categories
# =============================================================================

INITIAL_SEMANTIC_TYPES = [
    # =========================================================================
    # STRUCTURAL (A) - Load-bearing elements
    # =========================================================================
    {
        'code': 'AB',
        'name_no': 'Bjelke',
        'name_en': 'Beam',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcBeam',
        'alternative_ifc_classes': ['IfcBeamStandardCase'],
        'suggested_ns3451_codes': ['223', '2231', '2232'],
        'name_patterns': ['*beam*', '*bjelke*', '*bjlk*', '*girder*', '*dragere*', '*bæring*'],
        'description': 'Horizontal load-bearing element supporting floor or roof structures',
    },
    {
        'code': 'AS',
        'name_no': 'Soyle',
        'name_en': 'Column',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcColumn',
        'alternative_ifc_classes': ['IfcColumnStandardCase'],
        'suggested_ns3451_codes': ['222', '2221', '2222'],
        'name_patterns': ['*column*', '*soyle*', '*pillar*', '*pilar*', '*stolpe*'],
        'description': 'Vertical load-bearing element transferring loads to foundation',
    },
    {
        'code': 'AD',
        'name_no': 'Dekke',
        'name_en': 'Slab',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcSlab',
        'alternative_ifc_classes': ['IfcSlabStandardCase', 'IfcSlabElementedCase'],
        'suggested_ns3451_codes': ['251', '252', '2511', '2521'],
        'name_patterns': ['*slab*', '*dekke*', '*floor slab*', '*gulvplate*', '*etasjeskille*'],
        'description': 'Horizontal structural element forming floor or roof',
    },
    {
        'code': 'AV',
        'name_no': 'Vegg',
        'name_en': 'Wall',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcWall',
        'alternative_ifc_classes': ['IfcWallStandardCase', 'IfcWallElementedCase'],
        'suggested_ns3451_codes': ['231', '232', '241', '242', '2311', '2321'],
        'name_patterns': ['*wall*', '*vegg*', '*partition*', '*skillevegg*', '*mur*'],
        'description': 'Vertical element providing enclosure or separation',
    },
    {
        'code': 'AP',
        'name_no': 'Plate',
        'name_en': 'Plate',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcPlate',
        'alternative_ifc_classes': ['IfcPlateStandardCase'],
        'suggested_ns3451_codes': ['220'],
        'name_patterns': ['*plate*', '*panel*'],
        'description': 'Planar structural element, typically steel or concrete',
    },
    {
        'code': 'AH',
        'name_no': 'Fundament',
        'name_en': 'Foundation',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcFooting',
        'alternative_ifc_classes': ['IfcPile', 'IfcDeepFoundation'],
        'suggested_ns3451_codes': ['215', '216', '2151', '2161'],
        'name_patterns': ['*foundation*', '*fundament*', '*footing*', '*saale*', '*pel*', '*pile*'],
        'description': 'Element transferring building loads to the ground',
    },
    {
        'code': 'AK',
        'name_no': 'Tak',
        'name_en': 'Roof',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcRoof',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['261', '2611', '2612'],
        'name_patterns': ['*roof*', '*tak*', '*takflate*'],
        'description': 'Upper covering of a building providing weather protection',
    },
    {
        'code': 'AG',
        'name_no': 'Glassfasade',
        'name_en': 'Curtain Wall',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcCurtainWall',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['233', '2331'],
        'name_patterns': ['*curtain wall*', '*glassfasade*', '*glass facade*', '*fasadeglass*'],
        'description': 'Non-load-bearing exterior wall system, typically glass',
    },
    {
        'code': 'AR',
        'name_no': 'Rekkverk',
        'name_en': 'Railing',
        'category': 'A-Structural',
        'canonical_ifc_class': 'IfcRailing',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['287', '2871'],
        'name_patterns': ['*railing*', '*rekkverk*', '*handrail*', '*haandloper*', '*gelender*', '*balustrade*'],
        'description': 'Barrier providing fall protection or guidance',
    },

    # =========================================================================
    # OPENINGS (D) - Doors, Windows
    # =========================================================================
    {
        'code': 'DV',
        'name_no': 'Vindu',
        'name_en': 'Window',
        'category': 'D-Openings',
        'canonical_ifc_class': 'IfcWindow',
        'alternative_ifc_classes': ['IfcWindowStandardCase'],
        'suggested_ns3451_codes': ['2341', '2441', '234', '244'],
        'name_patterns': ['*window*', '*vindu*', '*glazing*', '*glass*rute*'],
        'description': 'Opening element allowing light and/or ventilation',
    },
    {
        'code': 'DI',
        'name_no': 'Dor innvendig',
        'name_en': 'Interior Door',
        'category': 'D-Openings',
        'canonical_ifc_class': 'IfcDoor',
        'alternative_ifc_classes': ['IfcDoorStandardCase'],
        'suggested_ns3451_codes': ['2442', '244'],
        'name_patterns': ['*interior door*', '*innerdor*', '*innvendig dor*', '*internal door*'],
        'description': 'Door within the building interior',
    },
    {
        'code': 'DU',
        'name_no': 'Dor utvendig',
        'name_en': 'Exterior Door',
        'category': 'D-Openings',
        'canonical_ifc_class': 'IfcDoor',
        'alternative_ifc_classes': ['IfcDoorStandardCase'],
        'suggested_ns3451_codes': ['2342', '234'],
        'name_patterns': ['*exterior door*', '*ytterdor*', '*utvendig dor*', '*entrance*', '*main door*'],
        'description': 'Door providing access to/from building exterior',
    },
    {
        'code': 'DO',
        'name_no': 'Dor',
        'name_en': 'Door',
        'category': 'D-Openings',
        'canonical_ifc_class': 'IfcDoor',
        'alternative_ifc_classes': ['IfcDoorStandardCase'],
        'suggested_ns3451_codes': ['234', '244'],
        'name_patterns': ['*door*', '*dor*'],
        'description': 'Generic door (use DI/DU when interior/exterior is known)',
    },

    # =========================================================================
    # CLADDING/COVERING (E) - Surface finishes, coverings
    # =========================================================================
    {
        'code': 'EB',
        'name_no': 'Overflatebekledning',
        'name_en': 'Surface Covering',
        'category': 'E-Cladding',
        'canonical_ifc_class': 'IfcCovering',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['29', '291', '292'],
        'name_patterns': [
            '*covering*', '*bekledning*', '*cladding*', '*finish*',
            '*carpet*', '*tile*', '*flooring*', '*gulvbelegg*', '*flis*', '*teppe*',
            '*parkett*', '*laminat*', '*vinyl*', '*linoleum*'
        ],
        'description': 'Surface finish or covering applied to structural elements',
    },
    {
        'code': 'EH',
        'name_no': 'Himling',
        'name_en': 'Ceiling',
        'category': 'E-Cladding',
        'canonical_ifc_class': 'IfcCovering',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['29', '293'],
        'name_patterns': ['*ceiling*', '*himling*', '*suspended ceiling*', '*nedhengt*', '*takplate*'],
        'description': 'Interior overhead surface, often suspended',
    },
    {
        'code': 'EF',
        'name_no': 'Fasadebekledning',
        'name_en': 'Facade Cladding',
        'category': 'E-Cladding',
        'canonical_ifc_class': 'IfcCovering',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['235', '2351'],
        'name_patterns': ['*facade*', '*fasade*', '*external cladding*', '*utvendig*bekledning*'],
        'description': 'External wall finish or cladding system',
    },

    # =========================================================================
    # COMPLEMENTING (C) - Stairs, Ramps, Balconies
    # =========================================================================
    {
        'code': 'CT',
        'name_no': 'Trapp',
        'name_en': 'Stair',
        'category': 'C-Complementing',
        'canonical_ifc_class': 'IfcStair',
        'alternative_ifc_classes': ['IfcStairFlight'],
        'suggested_ns3451_codes': ['281', '282', '2811', '2821'],
        'name_patterns': ['*stair*', '*trapp*', '*steps*', '*trinn*'],
        'description': 'Vertical circulation element with steps',
    },
    {
        'code': 'CG',
        'name_no': 'Rampe',
        'name_en': 'Ramp',
        'category': 'C-Complementing',
        'canonical_ifc_class': 'IfcRamp',
        'alternative_ifc_classes': ['IfcRampFlight'],
        'suggested_ns3451_codes': ['283', '2831'],
        'name_patterns': ['*ramp*', '*rampe*', '*slope*'],
        'description': 'Inclined surface for level changes',
    },
    {
        'code': 'CB',
        'name_no': 'Balkong',
        'name_en': 'Balcony',
        'category': 'C-Complementing',
        'canonical_ifc_class': 'IfcSlab',  # Usually modeled as slab
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['284', '2841'],
        'name_patterns': ['*balcony*', '*balkong*', '*veranda*', '*terrace*', '*terrasse*'],
        'description': 'Projecting platform with access from interior',
    },

    # =========================================================================
    # MEP ELEMENTS (K) - Ducts, Pipes, Equipment
    # =========================================================================
    {
        'code': 'KK',
        'name_no': 'Kanal',
        'name_en': 'Duct',
        'category': 'K-MEP',
        'canonical_ifc_class': 'IfcDuctSegment',
        'alternative_ifc_classes': ['IfcDuctFitting', 'IfcFlowSegment'],
        'suggested_ns3451_codes': ['362', '3621'],
        'name_patterns': ['*duct*', '*kanal*', '*ventilation*', '*ventilasjon*'],
        'description': 'Conduit for air distribution in HVAC systems',
    },
    {
        'code': 'KR',
        'name_no': 'Ror',
        'name_en': 'Pipe',
        'category': 'K-MEP',
        'canonical_ifc_class': 'IfcPipeSegment',
        'alternative_ifc_classes': ['IfcPipeFitting', 'IfcFlowSegment'],
        'suggested_ns3451_codes': ['312', '322', '3121', '3221'],
        'name_patterns': ['*pipe*', '*ror*', '*piping*', '*ledning*'],
        'description': 'Conduit for fluid or gas transport',
    },
    {
        'code': 'KC',
        'name_no': 'Kabelkanal',
        'name_en': 'Cable Tray',
        'category': 'K-MEP',
        'canonical_ifc_class': 'IfcCableCarrierSegment',
        'alternative_ifc_classes': ['IfcCableTray'],
        'suggested_ns3451_codes': ['451', '4511'],
        'name_patterns': ['*cable tray*', '*kabelkanal*', '*cable rack*', '*kabelstige*'],
        'description': 'Support structure for electrical cables',
    },

    # =========================================================================
    # EQUIPMENT (U) - Furniture, Fixtures, Equipment
    # =========================================================================
    {
        'code': 'UF',
        'name_no': 'Inventar',
        'name_en': 'Furniture',
        'category': 'U-Equipment',
        'canonical_ifc_class': 'IfcFurniture',
        'alternative_ifc_classes': ['IfcFurnishingElement'],
        'suggested_ns3451_codes': ['73', '731'],
        'name_patterns': ['*furniture*', '*inventar*', '*mobler*', '*desk*', '*chair*', '*table*'],
        'description': 'Movable equipment or fixtures',
    },
    {
        'code': 'US',
        'name_no': 'Sanitaerutstyr',
        'name_en': 'Sanitary Fixture',
        'category': 'U-Equipment',
        'canonical_ifc_class': 'IfcSanitaryTerminal',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['314', '3141'],
        'name_patterns': ['*sanitary*', '*sanitaer*', '*toilet*', '*sink*', '*vask*', '*wc*', '*urinal*'],
        'description': 'Plumbing fixtures for water use',
    },

    # =========================================================================
    # GENERIC/PROXY (X) - Catch-all for unclassified elements
    # =========================================================================
    {
        'code': 'XE',
        'name_no': 'Generelt element',
        'name_en': 'Generic Element',
        'category': 'X-Generic',
        'canonical_ifc_class': 'IfcBuildingElementProxy',
        'alternative_ifc_classes': [],
        'suggested_ns3451_codes': ['29'],
        'name_patterns': [],  # No patterns - this is a catch-all
        'description': 'Generic/proxy element requiring manual classification',
    },
    {
        'code': 'XM',
        'name_no': 'Medlem',
        'name_en': 'Member',
        'category': 'X-Generic',
        'canonical_ifc_class': 'IfcMember',
        'alternative_ifc_classes': ['IfcMemberStandardCase'],
        'suggested_ns3451_codes': ['22'],
        'name_patterns': ['*member*', '*element*'],
        'description': 'Generic structural member',
    },
]


# =============================================================================
# IFC MISUSE MAPPINGS
# Known patterns where IFC classes are commonly misused
# =============================================================================

IFC_MISUSE_MAPPINGS = [
    # -------------------------------------------------------------------------
    # IfcSlab misused for non-structural elements
    # -------------------------------------------------------------------------
    {
        'ifc_class': 'IfcSlab',
        'semantic_type': 'EB',  # Surface Covering
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.3,
        'note': 'IfcSlab often misused for floor coverings (carpet, tiles, parquet). Check type name for covering keywords.',
    },
    {
        'ifc_class': 'IfcSlab',
        'semantic_type': 'CB',  # Balcony
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.5,
        'note': 'Balconies often modeled as IfcSlab. Check type name for balcony/terrace keywords.',
    },

    # -------------------------------------------------------------------------
    # IfcBeam/IfcColumn misused for railing components
    # -------------------------------------------------------------------------
    {
        'ifc_class': 'IfcBeam',
        'semantic_type': 'AR',  # Railing
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.4,
        'note': 'IfcBeam sometimes misused for railing rails/handrails. Check type name.',
    },
    {
        'ifc_class': 'IfcColumn',
        'semantic_type': 'AR',  # Railing
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.4,
        'note': 'IfcColumn sometimes misused for railing posts/balusters. Check type name.',
    },

    # -------------------------------------------------------------------------
    # IfcBuildingElementProxy - lazy modeling catch-all
    # -------------------------------------------------------------------------
    {
        'ifc_class': 'IfcBuildingElementProxy',
        'semantic_type': 'XE',  # Generic Element
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': True,
        'confidence_hint': 0.2,
        'note': 'Generic proxy element - needs manual classification based on type name and geometry.',
    },
    {
        'ifc_class': 'IfcBuildingElementProxy',
        'semantic_type': 'AR',  # Railing
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.3,
        'note': 'Railings often exported as IfcBuildingElementProxy from some authoring tools.',
    },

    # -------------------------------------------------------------------------
    # IfcWall misused for coverings
    # -------------------------------------------------------------------------
    {
        'ifc_class': 'IfcWall',
        'semantic_type': 'EB',  # Surface Covering
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.3,
        'note': 'IfcWall sometimes misused for wall finishes/coverings. Check thickness and type name.',
    },

    # -------------------------------------------------------------------------
    # IfcMember - often misclassified
    # -------------------------------------------------------------------------
    {
        'ifc_class': 'IfcMember',
        'semantic_type': 'AB',  # Beam
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.5,
        'note': 'IfcMember often used for beams. Check orientation and connections.',
    },
    {
        'ifc_class': 'IfcMember',
        'semantic_type': 'AR',  # Railing
        'predefined_type': '',
        'is_primary': False,
        'is_common_misuse': True,
        'confidence_hint': 0.4,
        'note': 'IfcMember sometimes used for railing components.',
    },

    # -------------------------------------------------------------------------
    # Primary mappings (expected IFC class → semantic type)
    # -------------------------------------------------------------------------
    {
        'ifc_class': 'IfcBeam',
        'semantic_type': 'AB',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.9,
        'note': 'Standard beam mapping.',
    },
    {
        'ifc_class': 'IfcColumn',
        'semantic_type': 'AS',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.9,
        'note': 'Standard column mapping.',
    },
    {
        'ifc_class': 'IfcSlab',
        'semantic_type': 'AD',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.7,  # Lower due to common misuse
        'note': 'Standard slab mapping. Verify not a covering.',
    },
    {
        'ifc_class': 'IfcWall',
        'semantic_type': 'AV',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.8,
        'note': 'Standard wall mapping. Verify not a covering.',
    },
    {
        'ifc_class': 'IfcWindow',
        'semantic_type': 'DV',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard window mapping.',
    },
    {
        'ifc_class': 'IfcDoor',
        'semantic_type': 'DO',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.9,
        'note': 'Standard door mapping. Check for interior/exterior.',
    },
    {
        'ifc_class': 'IfcRailing',
        'semantic_type': 'AR',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard railing mapping.',
    },
    {
        'ifc_class': 'IfcStair',
        'semantic_type': 'CT',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard stair mapping.',
    },
    {
        'ifc_class': 'IfcRamp',
        'semantic_type': 'CG',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard ramp mapping.',
    },
    {
        'ifc_class': 'IfcRoof',
        'semantic_type': 'AK',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard roof mapping.',
    },
    {
        'ifc_class': 'IfcCurtainWall',
        'semantic_type': 'AG',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard curtain wall mapping.',
    },
    {
        'ifc_class': 'IfcCovering',
        'semantic_type': 'EB',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.9,
        'note': 'Standard covering mapping.',
    },
    {
        'ifc_class': 'IfcFooting',
        'semantic_type': 'AH',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard footing/foundation mapping.',
    },
    {
        'ifc_class': 'IfcPlate',
        'semantic_type': 'AP',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.85,
        'note': 'Standard plate mapping.',
    },
    {
        'ifc_class': 'IfcFurniture',
        'semantic_type': 'UF',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard furniture mapping.',
    },
    {
        'ifc_class': 'IfcSanitaryTerminal',
        'semantic_type': 'US',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard sanitary fixture mapping.',
    },
    {
        'ifc_class': 'IfcDuctSegment',
        'semantic_type': 'KK',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard duct mapping.',
    },
    {
        'ifc_class': 'IfcPipeSegment',
        'semantic_type': 'KR',
        'predefined_type': '',
        'is_primary': True,
        'is_common_misuse': False,
        'confidence_hint': 0.95,
        'note': 'Standard pipe mapping.',
    },
]
