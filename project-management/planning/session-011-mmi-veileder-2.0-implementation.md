# Session 011 Planning - MMI-veileder 2.0 Full Implementation

**Date**: 2025-10-13
**Status**: Ready for Implementation
**Priority**: CRITICAL - Fixes fundamental architecture flaw

---

## Executive Summary

**Problem**: Current BEP system hardcodes MMI scale to 5 levels (100/300/350/400/500), violating the official Norwegian MMI-veileder 2.0 standard which defines:
- **19 standard levels** from 0 to 600
- **25-point increments** for secondary levels (125, 150, 175, etc.)
- **Flexible scale** - projects can add custom levels up to 2000
- **Official color codes** for each level (RGB + Hex)

**Impact**: System cannot handle real Norwegian projects using the official standard.

**Solution**: Redesign BEP system to be fully flexible, load official MMI-veileder 2.0 templates, update frontend to handle dynamic scales.

---

## Background Research

### Source: MMI-veileder 2.0 (October 2022)

**Published by**:
- Entreprenørforeningen Bygg og Anlegg (EBA)
- Arkitektbedriftene i Norge (AiN)
- Rådgivende Ingeniørers Forening (RIF)
- Maskinentreprenørenes Forbund (MEF)
- Statsbygg
- Bane NOR
- Statens vegvesen
- Nye Veier

**Key Findings**:

1. **Scale Range**: 0 to 900+ (with reserved codes up to 900)
2. **Standard Increments**:
   - Primary levels: 0, 100, 200, 300, 400, 500, 600
   - Secondary levels: +25 increments (125, 150, 175, 225, etc.)
3. **Reserved Codes**: 025, 050, 075, 525, 550, 575, 625-900 (for future rehabilitation, decommissioning)
4. **Flexibility**: Projects can add custom levels outside the standard
5. **Syntax**: 3-digit code (e.g., "100", "250", "475")
6. **Property Name**: "MMI" (without prefix/suffix)
7. **Official Colors**: Each level has defined RGB and Hex color codes

### Official MMI Levels (19 defined)

| Code | Name (Norwegian) | Name (English) | Phase | Color Hex |
|------|------------------|----------------|-------|-----------|
| 000 | Tidligfase | Early phase | Pre-project | #D73296 |
| 100 | Grunnlagsinformasjon | Foundation information | Concept | #BE2823 |
| 125 | Etablert konsept | Established concept | Concept | #D24B46 |
| 150 | Tverrfaglig kontrollert konsept | Cross-disciplinary controlled concept | Concept | #E17873 |
| 175 | Valgt konsept | Selected concept | Concept | #F0AAAA |
| 200 | Ferdig konsept | Finished concept | Principle | #E69637 |
| 225 | Etablert prinsipielle løsninger | Established principle solutions | Principle | #EBAF64 |
| 250 | Tverrfaglig kontrollert prinsipielle løsninger | Cross-disciplinary controlled principle | Principle | #F0C88C |
| 275 | Valgt prinsipielle løsninger | Selected principle solutions | Principle | #F5E6D7 |
| 300 | Underlag for detaljering | Basis for detailing | Detailed | #FAF050 |
| 325 | Etablert detaljerte løsninger | Established detailed solutions | Detailed | #D7CD41 |
| 350 | Tverrfaglig kontrollert detaljerte løsninger | Cross-disciplinary controlled detailed | Detailed | #B9AF3C |
| 375 | Detaljerte løsninger som grunnlag for anbud | Detailed solutions for tender | Detailed | #9B9632 |
| 400 | Arbeidsgrunnlag | Work basis | Construction | #378246 |
| 425 | Etablert / utført | Established / executed | Construction | #4BAA5A |
| 450 | Kontrollert utførelse | Controlled execution | Construction | #64C37D |
| 475 | Godkjent utførelse | Approved execution | Construction | #9BD7A5 |
| 500 | Som bygget | As-built | Handover | #1E46AF |
| 600 | I drift | In operation | Operations | #9B00CD |

### Key Principles from Standard

1. **Primary vs Secondary Levels**:
   - Primary (100, 200, 300, etc.): Major milestones
   - Secondary (+25 increments): Intermediate quality gates
   - Projects choose which to use

2. **Process Orientation**:
   - MMI describes **process maturity**, not just geometry detail
   - "Established → Controlled → Selected → Approved" pattern repeats
   - Cross-disciplinary coordination is explicit (150, 250, 350)

3. **Flexibility Mandate** (Section 2.4):
   > "Bruk av denne veilederen forutsetter at MMI-nivåer som er beskrevet her ligger fast, og det tillates ikke endring av tallkoder, navn, beskrivelser eller fargekoder på definerte nivåer i tabell 1. Ulike prosjektforutsetninger gjør samtidig at ikke alle nivåer er relevante i alle prosjekter. Prosjektene står derfor fritt til å definere hvilke nivåer som skal anvendes, samt legge til ekstra nivåer utenfor MMI-veilederen etter behov."

   Translation: Standard levels cannot be changed, but projects can:
   - Select which standard levels to use
   - Add custom levels beyond the standard

4. **Responsibility** (Section 3.2):
   - MMI 0-400: Ansvarlig prosjekterende (Responsible designer)
   - MMI 401-500: Ansvarlig utførende (Responsible contractor)
   - MMI 501-600: Bestiller (Client)
   - MMI 601+: Forvalter/driftsansvarlig (Facility manager)

---

## Current System Analysis

### ❌ Critical Flaws in Session 010 Implementation

**File**: `backend/apps/bep/models.py` (Lines 12-21)

```python
# WRONG: Hardcoded choices
mmi_level = models.IntegerField(
    choices=[
        (100, 'MMI 100'),
        (300, 'MMI 300'),
        (350, 'MMI 350'),
        (400, 'MMI 400'),
        (500, 'MMI 500'),
    ]
)
```

**Problems**:
1. Only allows 5 levels (missing 14 standard levels)
2. Database constraint prevents custom levels
3. No color information
4. Cannot handle 0, 125, 150, 175, 200, 225, 250, 275, 325, 375, 425, 450, 475, 600

**File**: `backend/apps/bep/management/commands/load_bep_templates.py`

```python
# WRONG: Only defines 5 MMI levels
{
    'mmi_level': 100,
    'name': 'Konseptfase',
    # ...
},
{
    'mmi_level': 300,
    'name': 'Forprosjekt - Koordinert',
    # ...
}
# Missing 14 other standard levels
```

**File**: `frontend/src/components/features/mmi/MMIDashboard.tsx` (Lines 64-72)

```typescript
// WRONG: Hardcoded 1-7 scale
const MMI_COLORS: Record<number, string> = {
  1: 'red',
  2: 'orange',
  3: 'amber',
  4: 'yellow',
  5: 'lime',
  6: 'green',
  7: 'emerald',
};
```

**Problems**:
1. Completely wrong scale (1-7 vs 0-600)
2. No connection to BEP
3. Colors don't match official standard

---

## Solution Architecture

### Phase 1: Database Model Redesign

**Objective**: Remove hardcoded constraints, add color support, allow 0-2000 range

**File**: `backend/apps/bep/models.py`

**Changes**:

1. **Remove `choices` parameter** from `mmi_level`:
```python
mmi_level = models.IntegerField(
    help_text='MMI level (0-2000). Standard uses 0, 100-600 with 25-point increments. Projects can define custom levels.',
    validators=[MinValueValidator(0), MaxValueValidator(2000)]
)
```

2. **Add color fields** (from official standard):
```python
color_hex = models.CharField(
    max_length=7,
    help_text='Hex color code from MMI-veileder (e.g., #BE2823 for MMI 100)',
    blank=True,
    default=''
)

color_rgb = models.CharField(
    max_length=20,
    help_text='RGB color from MMI-veileder (e.g., "190,40,35" for MMI 100)',
    blank=True,
    default=''
)
```

3. **Add English name field**:
```python
name_en = models.CharField(
    max_length=200,
    help_text='English name for MMI level',
    blank=True,
    default=''
)
```

4. **Update unique constraint**:
```python
class Meta:
    db_table = 'mmi_scale_definitions'
    unique_together = [['bep', 'mmi_level']]
    ordering = ['mmi_level']
```

**Migration Required**: Yes

```python
# 0002_mmi_flexible_scale.py
class Migration(migrations.Migration):
    dependencies = [
        ('bep', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='mmiscaledefinition',
            name='color_hex',
            field=models.CharField(blank=True, default='', help_text='Hex color code from MMI-veileder (e.g., #BE2823 for MMI 100)', max_length=7),
        ),
        migrations.AddField(
            model_name='mmiscaledefinition',
            name='color_rgb',
            field=models.CharField(blank=True, default='', help_text='RGB color from MMI-veileder (e.g., "190,40,35" for MMI 100)', max_length=20),
        ),
        migrations.AddField(
            model_name='mmiscaledefinition',
            name='name_en',
            field=models.CharField(blank=True, default='', help_text='English name for MMI level', max_length=200),
        ),
        migrations.AlterField(
            model_name='mmiscaledefinition',
            name='mmi_level',
            field=models.IntegerField(help_text='MMI level (0-2000). Standard uses 0, 100-600 with 25-point increments. Projects can define custom levels.', validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(2000)]),
        ),
    ]
```

---

### Phase 2: Official BEP Templates

**Objective**: Create two templates following MMI-veileder 2.0

**File**: `backend/apps/bep/management/commands/load_bep_templates.py`

**Changes**:

1. **Delete old POFIN template** (wrong scale)
2. **Create Template 1**: MMI-veileder 2.0 Full (19 levels)
3. **Create Template 2**: MMI-veileder 2.0 Simplified (6 levels)

#### Template 1: Full MMI-veileder 2.0 Scale

```python
def create_mmi_veileder_full_template(self, project):
    """
    Create full MMI-veileder 2.0 template with all 19 standard levels.

    Based on: MMI-veileder 2.0 (October 2022)
    Published by: EBA, AiN, RIF, MEF, Statsbygg, Bane NOR, Statens vegvesen, Nye Veier
    Source: Table 1 - Grunnleggende MMI-nivåer (page 5)
    """

    bep = BEPConfiguration.objects.create(
        project=project,
        version=self.get_next_version(project),
        status='draft',
        name='MMI-veileder 2.0 - Full Scale',
        framework='mmi-veileder-2.0',
        description='Full MMI-veileder 2.0 scale with all 19 standard levels (0-600). '
                    'Includes all primary and secondary levels for detailed process control. '
                    'Suitable for large, complex projects requiring granular maturity tracking.',
    )

    # Technical requirements
    TechnicalRequirement.objects.create(
        bep=bep,
        ifc_schema='IFC4',
        model_view_definition='Design Transfer View',
        coordinate_system_name='EPSG:25833',  # EUREF89 UTM33 (Norway)
        coordinate_system_description='EUREF89 UTM Zone 33N - Standard for Norway',
        length_unit='METRE',
        area_unit='SQUARE_METRE',
        volume_unit='CUBIC_METRE',
        angle_unit='DEGREE',
        geometry_tolerance=0.001,
        max_file_size_mb=1000,
    )

    # All 19 standard MMI levels
    mmi_levels = [
        {
            'level': 0,
            'name': 'Tidligfase',
            'name_en': 'Early phase',
            'description': 'Prosesser som går forut for byggeprosjektet, eksempelvis planprosesser, arkitektkonkurranser el. lign.',
            'color_rgb': '215,50,150',
            'color_hex': '#D73296',
            'geometry_requirements': {
                'requires_3d': False,
                'detail_level': 'none',
                'min_vertex_count': 0
            },
            'information_requirements': {
                'min_property_count': 0
            }
        },
        {
            'level': 100,
            'name': 'Grunnlagsinformasjon',
            'name_en': 'Foundation information',
            'description': 'Objekter og informasjon etablert som grunnlag for utvikling av prosjektet',
            'color_rgb': '190,40,35',
            'color_hex': '#BE2823',
            'geometry_requirements': {
                'requires_3d': False,
                'detail_level': 'symbolic',
                'min_vertex_count': 0
            },
            'information_requirements': {
                'min_property_count': 0
            }
        },
        {
            'level': 125,
            'name': 'Etablert konsept',
            'name_en': 'Established concept',
            'description': 'Konsepter er etablert og danner grunnlag for koordinering fram til utført tverrfaglig kontroll',
            'color_rgb': '210,75,70',
            'color_hex': '#D24B46',
            'geometry_requirements': {
                'requires_3d': False,
                'detail_level': 'conceptual',
                'min_vertex_count': 0
            },
            'information_requirements': {
                'requires_name': True,
                'min_property_count': 2
            }
        },
        {
            'level': 150,
            'name': 'Tverrfaglig kontrollert konsept',
            'name_en': 'Cross-disciplinary controlled concept',
            'description': 'Tverrfaglig kontroll er gjennomført og eventuelle avvik er rettet til akseptabelt nivå.',
            'color_rgb': '225,120,115',
            'color_hex': '#E17873',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'conceptual',
                'min_vertex_count': 8
            },
            'information_requirements': {
                'requires_name': True,
                'min_property_count': 3
            }
        },
        {
            'level': 175,
            'name': 'Valgt konsept',
            'name_en': 'Selected concept',
            'description': 'Konseptuelle løsninger valgt og klar for beslutning om videre utvikling',
            'color_rgb': '240,170,170',
            'color_hex': '#F0AAAA',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'conceptual',
                'min_vertex_count': 12
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'min_property_count': 5
            }
        },
        {
            'level': 200,
            'name': 'Ferdig konsept',
            'name_en': 'Finished concept',
            'description': 'Konseptuelle løsninger er besluttet, klargjort for utvikling av prinsipielle løsninger',
            'color_rgb': '230,150,55',
            'color_hex': '#E69637',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'approximate',
                'min_vertex_count': 16
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'min_property_count': 8
            }
        },
        {
            'level': 225,
            'name': 'Etablert prinsipielle løsninger',
            'name_en': 'Established principle solutions',
            'description': 'Prinsipielle løsninger er etablert og danner grunnlag for videre koordinering fram til utført tverrfaglig kontroll.',
            'color_rgb': '235,175,100',
            'color_hex': '#EBAF64',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'approximate',
                'min_vertex_count': 20
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'min_property_count': 10
            }
        },
        {
            'level': 250,
            'name': 'Tverrfaglig kontrollert prinsipielle løsninger',
            'name_en': 'Cross-disciplinary controlled principle solutions',
            'description': 'Tverrfaglig kontroll er gjennomført og avvik er eventuelle rettet til akseptabelt nivå.',
            'color_rgb': '240,200,140',
            'color_hex': '#F0C88C',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'approximate',
                'collision_ready': True,
                'min_vertex_count': 25
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'min_property_count': 12
            }
        },
        {
            'level': 275,
            'name': 'Valgt prinsipielle løsninger',
            'name_en': 'Selected principle solutions',
            'description': 'Prinsipielle løsninger valgt og klargjort for beslutning om videre utvikling',
            'color_rgb': '245,230,215',
            'color_hex': '#F5E6D7',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'approximate',
                'collision_ready': True,
                'min_vertex_count': 30
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'min_property_count': 15
            }
        },
        {
            'level': 300,
            'name': 'Underlag for detaljering',
            'name_en': 'Basis for detailing',
            'description': 'Prinsipielle løsninger er utviklet og besluttet, klargjort som underlag for videre detaljering',
            'color_rgb': '250,240,80',
            'color_hex': '#FAF050',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'approximate',
                'collision_ready': True,
                'min_vertex_count': 35
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'min_property_count': 18
            }
        },
        {
            'level': 325,
            'name': 'Etablert detaljerte løsninger',
            'name_en': 'Established detailed solutions',
            'description': 'Byggbare løsninger er etablert og danner grunnlag for videre koordinering fram til utført tverrfaglig kontroll.',
            'color_rgb': '215,205,65',
            'color_hex': '#D7CD41',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'detailed',
                'collision_ready': True,
                'min_vertex_count': 40
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'min_property_count': 20
            }
        },
        {
            'level': 350,
            'name': 'Tverrfaglig kontrollert detaljerte løsninger',
            'name_en': 'Cross-disciplinary controlled detailed solutions',
            'description': 'Tverrfaglig kontroll er gjennomført og eventuelle avvik er rettet til akseptabelt nivå.',
            'color_rgb': '185,175,60',
            'color_hex': '#B9AF3C',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'detailed',
                'collision_ready': True,
                'min_vertex_count': 45
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 22
            }
        },
        {
            'level': 375,
            'name': 'Detaljerte løsninger som grunnlag for anbud / bestilling / prefabrikasjon',
            'name_en': 'Detailed solutions for tender/order/prefabrication',
            'description': 'Godkjent grunnlag for bestilling, prefabrikasjon, leverandørprosjektering, anbudsgrunnlag (generalentreprise)',
            'color_rgb': '150,150,50',
            'color_hex': '#9B9632',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'detailed',
                'collision_ready': True,
                'min_vertex_count': 50
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 25
            }
        },
        {
            'level': 400,
            'name': 'Arbeidsgrunnlag',
            'name_en': 'Work basis',
            'description': 'Klart for utførelse på byggeplass. Underlaget kan også brukes for bestilling, planlegging, utførelse og dokumentasjon',
            'color_rgb': '55,130,70',
            'color_hex': '#378246',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'production',
                'collision_ready': True,
                'min_vertex_count': 60
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 30
            }
        },
        {
            'level': 425,
            'name': 'Etablert / utført',
            'name_en': 'Established / executed',
            'description': 'Løsninger er utført på byggeplass',
            'color_rgb': '75,170,90',
            'color_hex': '#4BAA5A',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'as-built',
                'collision_ready': True,
                'min_vertex_count': 50
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 30
            }
        },
        {
            'level': 450,
            'name': 'Kontrollert utførelse',
            'name_en': 'Controlled execution',
            'description': 'Utførelse er kontrollert mot prosjektert løsning, og evt. endringer mot faktisk utførelse er innarbeidet i modell',
            'color_rgb': '100,195,125',
            'color_hex': '#64C37D',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'as-built',
                'collision_ready': True,
                'min_vertex_count': 50
            },
            'information_requirements': {
                'requires_name': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 35
            }
        },
        {
            'level': 475,
            'name': 'Godkjent utførelse',
            'name_en': 'Approved execution',
            'description': 'Faktisk utførelse er godkjent og all informasjon levert iht. krav, f.eks. i henhold til systematisk ferdigstillelse.',
            'color_rgb': '155,215,165',
            'color_hex': '#9BD7A5',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'as-built',
                'collision_ready': True,
                'min_vertex_count': 50
            },
            'information_requirements': {
                'requires_name': True,
                'requires_description': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 40
            }
        },
        {
            'level': 500,
            'name': 'Som bygget',
            'name_en': 'As-built',
            'description': 'Leveranse iht. bestilling overdratt fra leverandør til bestiller',
            'color_rgb': '30,70,175',
            'color_hex': '#1E46AF',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'as-built',
                'collision_ready': True,
                'min_vertex_count': 50
            },
            'information_requirements': {
                'requires_name': True,
                'requires_description': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 45
            }
        },
        {
            'level': 600,
            'name': 'I drift',
            'name_en': 'In operation',
            'description': 'Klargjort driftsunderlag overdratt fra bestiller til driftsorganisasjon',
            'color_rgb': '175,50,205',
            'color_hex': '#9B00CD',
            'geometry_requirements': {
                'requires_3d': True,
                'detail_level': 'as-built',
                'collision_ready': True,
                'min_vertex_count': 50
            },
            'information_requirements': {
                'requires_name': True,
                'requires_description': True,
                'requires_classification': True,
                'requires_material': True,
                'requires_system_membership': True,
                'min_property_count': 50
            }
        },
    ]

    # Create MMI scale definitions
    for mmi_data in mmi_levels:
        MMIScaleDefinition.objects.create(
            bep=bep,
            mmi_level=mmi_data['level'],
            name=mmi_data['name'],
            name_en=mmi_data['name_en'],
            description=mmi_data['description'],
            color_rgb=mmi_data['color_rgb'],
            color_hex=mmi_data['color_hex'],
            geometry_requirements=mmi_data['geometry_requirements'],
            information_requirements=mmi_data['information_requirements'],
            display_order=mmi_data['level']
        )

    self.stdout.write(self.style.SUCCESS(f'  Created {len(mmi_levels)} MMI scale definitions'))

    return bep
```

#### Template 2: Simplified (6 Levels)

```python
def create_mmi_veileder_simplified_template(self, project):
    """
    Create simplified MMI-veileder 2.0 template with 6 primary levels.

    Includes only primary milestones: 100, 200, 300, 350, 400, 500
    Suitable for smaller projects or simpler workflows.
    """

    bep = BEPConfiguration.objects.create(
        project=project,
        version=self.get_next_version(project),
        status='draft',
        name='MMI-veileder 2.0 - Simplified',
        framework='mmi-veileder-2.0',
        description='Simplified MMI-veileder 2.0 scale with 6 primary levels. '
                    'Suitable for smaller projects requiring simpler maturity tracking. '
                    'Covers: Foundation (100), Concept (200), Detailing (300), Cross-disciplinary (350), Work basis (400), As-built (500).',
    )

    # Technical requirements (same as full)
    TechnicalRequirement.objects.create(
        bep=bep,
        ifc_schema='IFC4',
        model_view_definition='Design Transfer View',
        coordinate_system_name='EPSG:25833',
        coordinate_system_description='EUREF89 UTM Zone 33N - Standard for Norway',
        length_unit='METRE',
        area_unit='SQUARE_METRE',
        volume_unit='CUBIC_METRE',
        angle_unit='DEGREE',
        geometry_tolerance=0.001,
        max_file_size_mb=500,
    )

    # 6 primary levels
    simplified_levels = [100, 200, 300, 350, 400, 500]

    # Get data from full template
    full_levels = [...] # Same as above, but filter to simplified_levels

    for mmi_data in full_levels:
        if mmi_data['level'] in simplified_levels:
            MMIScaleDefinition.objects.create(
                bep=bep,
                mmi_level=mmi_data['level'],
                name=mmi_data['name'],
                name_en=mmi_data['name_en'],
                description=mmi_data['description'],
                color_rgb=mmi_data['color_rgb'],
                color_hex=mmi_data['color_hex'],
                geometry_requirements=mmi_data['geometry_requirements'],
                information_requirements=mmi_data['information_requirements'],
                display_order=mmi_data['level']
            )

    self.stdout.write(self.style.SUCCESS(f'  Created {len(simplified_levels)} MMI scale definitions (simplified)'))

    return bep
```

---

### Phase 3: Frontend Dynamic Scale Implementation

**Objective**: Make frontend completely dynamic - handle any MMI scale defined by BEP

**File**: `frontend/src/components/features/mmi/MMIDashboard.tsx`

**Key Changes**:

1. **Remove hardcoded MMI_COLORS constant**
2. **Build color map dynamically from BEP data**
3. **Calculate maxMMI from BEP scale**
4. **Display scale reference from BEP**

**Implementation**:

```typescript
// Remove old hardcoded colors (lines 64-72)
// Replace with dynamic color mapping

const colorMap = useMemo(() => {
  const map: Record<number, string> = { 0: 'slate' }; // Default

  if (data?.mmi_scale) {
    data.mmi_scale.forEach(level => {
      map[level.mmi_level] = hexToTremorColor(level.color_hex || '#64748b');
    });
  }

  return map;
}, [data?.mmi_scale]);

// Helper function to convert hex to Tremor color names
function hexToTremorColor(hex: string): string {
  if (!hex || hex === '') return 'slate';

  // Parse RGB values
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);

  // Map to closest Tremor color
  // Red range (190-240 R, 40-120 G, 35-115 B) → red shades
  if (r > 180 && g < 130 && b < 130) {
    if (g < 80) return 'red';
    if (g < 180) return 'rose';
  }

  // Orange range (230-245 R, 150-230 G, 55-215 B) → orange/amber
  if (r > 220 && g > 140) {
    if (b < 100) return 'orange';
    return 'amber';
  }

  // Yellow range (215-250 R, 205-240 G, 65-80 B) → yellow/lime
  if (r > 200 && g > 200 && b < 150) {
    if (b < 90) return 'yellow';
    return 'lime';
  }

  // Green range (55-155 R, 130-215 G, 70-165 B) → green shades
  if (g > r && g > b && g > 120) {
    if (r < 80 && g < 140) return 'green';
    if (r < 110 && g < 200) return 'emerald';
    return 'teal';
  }

  // Blue range (30 R, 70 G, 175 B) → blue
  if (b > r && b > g && b > 150) {
    if (b > 170) return 'blue';
    return 'sky';
  }

  // Purple range (175 R, 50 G, 205 B) → purple/fuchsia
  if (r > 150 && b > 180 && g < 100) {
    return 'fuchsia';
  }

  return 'slate'; // Default fallback
}

// Calculate max MMI dynamically
const maxMMI = useMemo(() => {
  if (!data?.mmi_scale || data.mmi_scale.length === 0) return 500;
  const max = Math.max(...data.mmi_scale.map(s => s.mmi_level));
  // Round up to nearest 100 for nice chart scale
  return Math.ceil(max / 100) * 100;
}, [data?.mmi_scale]);

// Use in all BarChart components
<BarChart
  data={byType.slice(0, 15)}
  index="name"
  categories={["avg_mmi"]}
  colors={["green"]}
  valueFormatter={(value) => `MMI ${value.toFixed(0)}`}
  yAxisWidth={120}
  showLegend={false}
  layout="horizontal"
  minValue={0}
  maxValue={maxMMI}  // Dynamic!
/>

// Dynamic MMI Scale Reference (replace lines 551-588)
<Card>
  <Title>
    MMI Scale Reference ({data.bep_info?.framework?.toUpperCase().replace('-', ' ') || 'NORWEGIAN STANDARD'})
  </Title>

  {data.bep_info && (
    <Text className="mt-2 text-sm text-gray-400">
      Active BEP: {data.bep_info.bep_name} (Version {data.bep_info.bep_version})
    </Text>
  )}

  {data.mmi_scale && data.mmi_scale.length > 0 ? (
    <dl className="mt-4 space-y-2">
      {data.mmi_scale.map((level) => (
        <div
          key={level.mmi_level}
          className="flex items-start justify-between p-3 bg-gray-800/30 rounded hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Badge
              color={colorMap[level.mmi_level] || 'slate'}
              size="lg"
              className="min-w-[80px] justify-center"
            >
              MMI {level.mmi_level}
            </Badge>
            <div>
              <Text className="font-medium text-gray-200">
                {level.name}
              </Text>
              {level.name_en && (
                <Text className="text-xs text-gray-500">
                  {level.name_en}
                </Text>
              )}
              <Text className="text-sm text-gray-400 mt-1">
                {level.description}
              </Text>
            </div>
          </div>
        </div>
      ))}
    </dl>
  ) : (
    <Card className="mt-4">
      <Text className="text-center py-8 text-gray-400">
        No MMI scale defined in active BEP. Please configure BEP or activate a template.
      </Text>
    </Card>
  )}
</Card>
```

---

### Phase 4: MMI Analyzer Verification

**File**: `backend/apps/scripting/builtin/mmi_analyzer.py`

**Objective**: Verify analyzer handles flexible scale correctly

**Check**:
1. ✅ Doesn't assume specific MMI levels exist
2. ✅ Iterates through `mmi_definitions.all().order_by('mmi_level')`
3. ✅ Returns whatever BEP defines
4. ✅ No hardcoded scale logic

**Current Implementation** (Session 010):
```python
# Line 212-224: Get MMI scale from BEP (CORRECT)
mmi_definitions = bep.mmi_scale.all().order_by('mmi_level')

if not mmi_definitions.exists():
    print("❌ ERROR: BEP has no MMI scale definitions")
    result = {
        'error': 'BEP has no MMI scale definitions',
        'message': 'The BEP needs to define MMI levels',
    }

# Line 263-266: Calculate MMI by iterating through definitions (CORRECT)
for entity in entities:
    element_mmi, failures = calculate_element_mmi(entity, mmi_definitions)
```

**Conclusion**: MMI analyzer is already flexible! ✅ No changes needed.

---

## Implementation Steps

### Step 1: Update Database Model
1. Backup current database
2. Modify `models.py`
3. Generate migration: `python manage.py makemigrations bep`
4. Review migration file
5. Run migration: `python manage.py migrate`
6. Verify with `python manage.py shell`

### Step 2: Delete Old Templates
```bash
python manage.py shell
```
```python
from apps.bep.models import BEPConfiguration
# Delete old POFIN templates (wrong scale)
BEPConfiguration.objects.filter(framework='pofin').delete()
print("Old templates deleted")
```

### Step 3: Update Template Loader
1. Modify `load_bep_templates.py`
2. Add `create_mmi_veileder_full_template()` method
3. Add `create_mmi_veileder_simplified_template()` method
4. Update `handle()` method to call new template creators

### Step 4: Load New Templates
```bash
python manage.py load_bep_templates
```

Expected output:
```
Loading BEP templates...
Template: MMI-veileder 2.0 - Full Scale
  Created 19 MMI scale definitions
  Created 3 validation rules
  Created 4 submission milestones
✅ Created BEP: MMI-veileder 2.0 - Full Scale (v1)

Template: MMI-veileder 2.0 - Simplified
  Created 6 MMI scale definitions
  Created 3 validation rules
  Created 4 submission milestones
✅ Created BEP: MMI-veileder 2.0 - Simplified (v2)
```

### Step 5: Activate Template & Test Backend
```bash
python manage.py shell
```
```python
from apps.bep.models import BEPConfiguration
from apps.projects.models import Project

# Get project
project = Project.objects.first()

# Activate full template
bep = BEPConfiguration.objects.filter(name__contains='Full').first()
bep.activate()
print(f"✅ Activated: {bep.name}")

# Verify scale
print(f"\nMMI Scale ({bep.mmi_scale.count()} levels):")
for mmi in bep.mmi_scale.all().order_by('mmi_level'):
    print(f"  MMI {mmi.mmi_level:>3}: {mmi.name:<50} {mmi.color_hex}")
```

Expected output:
```
✅ Activated: MMI-veileder 2.0 - Full Scale

MMI Scale (19 levels):
  MMI   0: Tidligfase                                         #D73296
  MMI 100: Grunnlagsinformasjon                               #BE2823
  MMI 125: Etablert konsept                                   #D24B46
  MMI 150: Tverrfaglig kontrollert konsept                    #E17873
  ...
  MMI 500: Som bygget                                         #1E46AF
  MMI 600: I drift                                            #9B00CD
```

### Step 6: Update Frontend
1. Modify `MMIDashboard.tsx`
2. Remove hardcoded colors
3. Add dynamic color mapping
4. Add dynamic maxMMI calculation
5. Update scale reference section

### Step 7: Test Frontend
```bash
cd frontend
npm run dev
```

**Test Checklist**:
- [ ] Dashboard loads without errors
- [ ] BEP info card shows "MMI-veileder 2.0 - Full Scale v1"
- [ ] Overall MMI displays correctly (e.g., "MMI 300")
- [ ] Charts show 0-600 range
- [ ] Colors match official standard (visually approximate)
- [ ] Scale reference shows all 19 levels
- [ ] Norwegian names displayed
- [ ] English names shown as subtitle
- [ ] No TypeScript errors
- [ ] No console warnings

### Step 8: Reload Scripts
```bash
python manage.py load_builtin_scripts
```

### Step 9: Run Full Test
1. Upload test model (or use existing)
2. Run MMI Analyzer
3. Verify results:
   - MMI distribution shows actual levels (0, 100, 125, 150, etc.)
   - Gap analysis shows specific failures
   - BEP info included in response
   - Colors displayed correctly in frontend

---

## Testing Scenarios

### Scenario 1: Full Scale (19 Levels)
- Activate: "MMI-veileder 2.0 - Full Scale"
- Run analyzer on model
- Expected: Elements distributed across all applicable levels (0-600)
- Charts: Display 0-600 range with all 19 level markers

### Scenario 2: Simplified Scale (6 Levels)
- Activate: "MMI-veileder 2.0 - Simplified"
- Run analyzer on model
- Expected: Elements at levels 100, 200, 300, 350, 400, 500 only
- Charts: Display 0-500 range with 6 level markers

### Scenario 3: Custom Scale (User adds level 285)
- Edit BEP in Django admin
- Add custom level: MMI 285 "Custom milestone"
- Run analyzer
- Expected: System handles custom level correctly
- Frontend: Displays custom level in scale reference

### Scenario 4: Switch Templates
- Start with Full template (19 levels)
- Run analyzer → results cached
- Switch to Simplified (6 levels)
- Run analyzer again
- Expected: New results use 6-level scale, old results archived

---

## Success Criteria

### Database
- [ ] MMI levels 0-2000 accepted
- [ ] Color fields populated for all levels
- [ ] English names stored
- [ ] No database constraint errors
- [ ] Old templates deleted
- [ ] New templates loaded (19 + 6 levels)

### Backend
- [ ] Templates follow official standard exactly
- [ ] Color codes match MMI-veileder 2.0 (RGB + Hex)
- [ ] Requirements align with standard descriptions
- [ ] MMI analyzer processes flexible scale
- [ ] API returns complete BEP info + scale

### Frontend
- [ ] No hardcoded MMI values
- [ ] Colors generated from BEP data
- [ ] Charts scale dynamically (0 to maxMMI)
- [ ] Scale reference shows all BEP levels
- [ ] BEP metadata displayed prominently
- [ ] Handles missing BEP gracefully

### Compliance
- [ ] Standard levels use exact names from Table 1
- [ ] Standard levels use exact colors (RGB/Hex)
- [ ] Standard level descriptions match official text
- [ ] Syntax follows standard (3-digit codes)
- [ ] Flexibility maintained (custom levels allowed)

---

## Risk Assessment

### High Risk
- **Database migration**: Could fail if old data incompatible
  - Mitigation: Backup database first, test on dev environment

### Medium Risk
- **Frontend breaking changes**: Dynamic colors may not match Tremor palette
  - Mitigation: Color mapping function with fallbacks

- **Template data entry errors**: 19 levels = lots of manual data
  - Mitigation: Copy directly from PDF, verify with test

### Low Risk
- **MMI analyzer**: Already flexible, minimal changes needed
- **Color accuracy**: Approximate match to Tremor colors acceptable

---

## Rollback Plan

If implementation fails:

1. **Database**: Run `python manage.py migrate bep 0001` to revert migration
2. **Templates**: Old templates were deleted (backup needed!)
3. **Frontend**: Git revert changes to `MMIDashboard.tsx`
4. **Scripts**: Old analyzer backed up to `versions/`

**Backup Requirements**:
- Database dump before migration
- Git commit before changes
- Copy of old template definitions

---

## Timeline Estimate

### Phase 1: Database (2-3 hours)
- Model changes: 30 min
- Migration: 30 min
- Testing: 1 hour

### Phase 2: Templates (3-4 hours)
- Full template data entry: 2 hours
- Simplified template: 30 min
- Testing/verification: 1 hour

### Phase 3: Frontend (3-4 hours)
- Remove hardcoded values: 30 min
- Dynamic color mapping: 1.5 hours
- Dynamic scale reference: 1 hour
- Testing: 1 hour

### Phase 4: Integration Testing (1-2 hours)
- End-to-end test: 1 hour
- Bug fixes: 1 hour

**Total: 9-13 hours** (1-2 working days)

---

## Dependencies

### Python Packages
- django>=5.0 ✅ (already installed)
- All existing dependencies ✅

### Frontend Packages
- All existing dependencies ✅
- No new packages required ✅

### External Resources
- MMI-veileder 2.0 PDF ✅ (available locally)
- Official color codes ✅ (from PDF Table 1)

---

## Future Enhancements

### Phase 5 (Future Sessions)
1. **BEP Workbench UI**: Visual editor for MMI scale
   - Drag-and-drop level ordering
   - Color picker for custom levels
   - Requirements builder

2. **MMI Timeline Visualization**:
   - Gantt chart showing MMI progression
   - Timeline view of project milestones
   - Historical MMI tracking

3. **Advanced Validation**:
   - Cross-disciplinary coordination checks (150, 250, 350)
   - Process flow validation (can't go from 200 to 400 without 300)
   - Responsibility validation (400+ requires contractor approval)

4. **Export Capabilities**:
   - Export MMI definitions to Excel
   - Generate BEP compliance report PDF
   - MMI color legend for model viewers

---

## Documentation Updates Required

After implementation:

1. **NEXT_STEPS.md**: Update with Session 011 completion status
2. **Session worklog**: Create `session-011.md` with implementation details
3. **Backend README**: Document new MMI scale flexibility
4. **Frontend README**: Document dynamic MMI handling
5. **User Guide**: Create MMI-veileder 2.0 usage guide

---

## References

1. **MMI-veileder 2.0** (October 2022)
   - Location: `/resources/knowledge/MMI-veileder-2.0.pdf`
   - Page 5: Table 1 - Grunnleggende MMI-nivåer

2. **POFIN Templates**
   - Location: `/resources/templates/POFIN_v1.0/`
   - Files: 17 documents (EIR, BEP, checklists, requirements)

3. **ISO 19650**: Information management using BIM
   - Referenced in MMI-veileder as framework standard

4. **buildingSMART Norge**: https://buildingsmart.no/
   - National implementation of international BIM standards

---

**Session 011 Status**: ✅ Planning Complete - Ready for Implementation
**Next**: Begin Phase 1 - Database Model Update

**Last Updated**: 2025-10-13
**Approved By**: User
