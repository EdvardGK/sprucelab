"""
Shared discipline registry for the Sprucelab platform.

Two categories:
- MODEL_DISCIPLINES: Roles that deliver IFC models (geometry)
- ADVISORY_ROLES: Roles that participate in responsibility matrix but don't deliver geometry

Parent-child hierarchy: RIV covers RIVv/RIVp/RIVspr/RIkulde/RIvarme.
A model tagged 'RIV' inherits responsibility for all HVAC sub-disciplines.
A model tagged 'RIVp' only covers plumbing (no sibling inheritance).

Based on Norwegian construction industry roles and SAK10 § 13-5 godkjenningsområder.
"""

# (code, label_en, label_no, parent_code)
MODEL_DISCIPLINES = [
    ('ARK',     'Architecture',      'Arkitekt',                        None),
    ('RIB',     'Structural',        'Rådgivende ingeniør bygg',        None),
    ('RIBp',    'Structural Prefab', 'Rådgivende ingeniør prefab',      'RIB'),
    ('RIG',     'Geotechnical',      'Rådgivende ingeniør geoteknikk',  None),
    ('RIV',     'HVAC',              'Rådgivende ingeniør VVS',         None),
    ('RIVv',    'Ventilation',       'Rådgivende ingeniør ventilasjon', 'RIV'),
    ('RIVp',    'Plumbing',          'Rådgivende ingeniør rør',         'RIV'),
    ('RIVspr',  'Sprinkler',         'Rådgivende ingeniør sprinkler',   'RIV'),
    ('RIkulde', 'Cooling',           'Rådgivende ingeniør kulde',       'RIV'),
    ('RIvarme', 'Heating',           'Rådgivende ingeniør varme',       'RIV'),
    ('RIE',     'Electrical',        'Rådgivende ingeniør elektro',     None),
    ('LARK',    'Landscape',         'Landskapsarkitekt',               None),
]

ADVISORY_ROLES = [
    ('RIA',    'Acoustics',        'Rådgivende ingeniør akustikk',       None),
    ('RIBr',   'Fire Safety',      'Rådgivende ingeniør brann',          None),
    ('RIByfy', 'Building Physics', 'Rådgivende ingeniør bygningsfysikk', None),
    ('RIM',    'Environmental',    'Miljørådgiver',                      None),
    ('BIM-K',  'BIM Coordinator',  'BIM-koordinator',                    None),
    ('BIM-M',  'BIM Manager',      'BIM-manager',                        None),
    ('PGL',    'Design Manager',   'Prosjekteringsgruppeleder',          None),
    ('PM',     'Project Manager',  'Prosjektleder',                      None),
    ('BH',     'Owner/Client',     'Byggherre',                          None),
]

# Django model choices
ALL_DISCIPLINE_CHOICES = [(c, en) for c, en, _, _ in MODEL_DISCIPLINES + ADVISORY_ROLES]
MODEL_DISCIPLINE_CHOICES = [(c, en) for c, en, _, _ in MODEL_DISCIPLINES]

OWNERSHIP_LEVEL_CHOICES = [
    ('primary', 'Primary - Must model'),
    ('secondary', 'Secondary - May model'),
    ('reference', 'Reference - Copy from others'),
]

# Parent lookup: child_code -> parent_code
DISCIPLINE_PARENT = {c: p for c, _, _, p in MODEL_DISCIPLINES + ADVISORY_ROLES if p}

# Color mapping for frontend
DISCIPLINE_COLORS = {
    'ARK':     '#3B82F6',  # Blue
    'RIB':     '#EF4444',  # Red
    'RIBp':    '#F87171',  # Light red
    'RIG':     '#A855F7',  # Purple
    'RIV':     '#22C55E',  # Green
    'RIVv':    '#4ADE80',  # Light green
    'RIVp':    '#2DD4BF',  # Teal
    'RIVspr':  '#FB923C',  # Orange
    'RIkulde': '#38BDF8',  # Sky blue
    'RIvarme': '#F97316',  # Deep orange
    'RIE':     '#F59E0B',  # Yellow/Amber
    'LARK':    '#10B981',  # Emerald
    'RIA':     '#8B5CF6',  # Violet
    'RIBr':    '#DC2626',  # Dark red
    'RIByfy':  '#6366F1',  # Indigo
    'RIM':     '#84CC16',  # Lime
    'BIM-K':   '#06B6D4',  # Cyan
    'BIM-M':   '#0891B2',  # Dark cyan
    'PGL':     '#64748B',  # Slate
    'PM':      '#475569',  # Dark slate
    'BH':      '#334155',  # Darker slate
}


def get_discipline_family(code: str) -> list[str]:
    """
    Get a discipline code and all its children.
    'RIV' -> ['RIV', 'RIVv', 'RIVp', 'RIVspr', 'RIkulde', 'RIvarme']
    'RIVp' -> ['RIVp']  (no children)
    """
    family = [code]
    for c, _, _, parent in MODEL_DISCIPLINES + ADVISORY_ROLES:
        if parent == code:
            family.append(c)
    return family


def get_parent_discipline(code: str) -> str | None:
    """Get the parent discipline code, or None if top-level."""
    return DISCIPLINE_PARENT.get(code)


def resolve_discipline_for_lookup(code: str) -> list[str]:
    """
    For ownership matrix lookups: resolve which discipline codes to match.
    - Parent code (e.g. 'RIV'): match RIV + all children
    - Child code (e.g. 'RIVp'): match only RIVp + parent RIV
    - Top-level (e.g. 'ARK'): match only ARK
    """
    parent = DISCIPLINE_PARENT.get(code)
    if parent:
        # Child: match self + parent
        return [code, parent]
    # Parent or standalone: match self + children
    return get_discipline_family(code)
